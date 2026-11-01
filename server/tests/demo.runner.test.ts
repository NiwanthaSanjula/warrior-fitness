import { describe, expect, it, vi } from "vitest";
import { buildDemoPlan, type DemoOperation, type DemoPlan } from "../src/scripts/demo/demo.plan.js";
import { runDemoSeed, type DemoStore, type SeedState, type SeedReport } from "../src/scripts/demo/demo.runner.js";
import { DemoError } from "../src/scripts/demo/demo.config.js";

const anchor = new Date("2026-01-15T06:00:00Z");
class MemoryStore implements DemoStore {
  state: SeedState | null = null;
  records = new Set<string>();
  writes = 0; leases = 0; releases = 0; verifies = 0;
  failAt: string | null = null; loseLease = false;
  async readState() { return this.state; }
  async acquire(plan: DemoPlan) { this.leases++; this.state = { anchoredAt: plan.anchoredAt, planHash: plan.hash, complete: false }; }
  async heartbeat() { if (this.loseLease) throw new DemoError("Lease lost"); }
  async apply(operation: DemoOperation) {
    const exists = this.records.has(operation.key);
    if (!exists) { this.records.add(operation.key); this.writes++; }
    // Simulate an unknown response after a committed operation. The actual
    // Mongo adapter uses deterministic IDs and existing service request UUIDs.
    if (this.failAt === operation.key) { this.failAt = null; throw new Error("Fictional driver message with a private URI"); }
    return !exists;
  }
  async verify() { this.verifies++; }
  async complete() { this.state!.complete = true; }
  async release() { this.releases++; }
}
describe("demo runner repeatability with an isolated in-memory store", () => {
  it("creates once and repeats without any application writes, resets or verification mutations", async () => {
    const store = new MemoryStore(), first = await runDemoSeed(store, anchor), writes = store.writes;
    expect(first.created).toEqual(first.plan.counts); expect(first.verified).toBe(true);
    const second = await runDemoSeed(store, anchor);
    expect(second.created).toEqual({}); expect(second.skipped).toEqual(first.plan.counts);
    expect(store.writes).toBe(writes); expect(store.leases).toBe(1); expect(store.verifies).toBe(1); expect(store.releases).toBe(1);
  });
  it("resumes an interrupted run without duplicating its committed operation", async () => {
    const store = new MemoryStore(), plan = buildDemoPlan(anchor);
    const failedOperation = plan.operations.find(op => op.kind === "sale")!;
    store.failAt = failedOperation.key;
    let last!: SeedReport;
    await expect(runDemoSeed(store, anchor, report => { last = report; })).rejects.toThrow(`sale (${failedOperation.key})`);
    expect(last.failed).toMatchObject({ retailSales: 1 }); expect(store.state!.complete).toBe(false); expect(store.releases).toBe(1);
    const result = await runDemoSeed(store, new Date("2026-01-16T06:00:00Z"));
    expect(result.plan.anchoredAt).toBe(anchor.toISOString()); expect(result.verified).toBe(true);
    expect(store.records.size).toBe(plan.operations.length); expect(store.writes).toBe(plan.operations.length);
    for (const [module, count] of Object.entries(plan.counts)) expect((result.created[module] ?? 0) + (result.skipped[module] ?? 0)).toBe(count);
  });
  it("pins the first snapshot on later dates instead of shifting financial history", async () => {
    const store = new MemoryStore(), first = await runDemoSeed(store, anchor);
    const nextWeek = await runDemoSeed(store, new Date("2026-01-22T06:00:00Z"));
    expect(nextWeek.plan.asOf).toBe(first.plan.asOf); expect(nextWeek.plan.hash).toBe(first.plan.hash);
    expect(nextWeek.created).toEqual({});
  });
  it("refuses a changed generator snapshot before acquiring a lease or writing", async () => {
    const store = new MemoryStore(); store.state = { anchoredAt: anchor.toISOString(), planHash: "different", complete: false };
    await expect(runDemoSeed(store, anchor)).rejects.toThrow(/snapshot differs/);
    expect(store.leases).toBe(0); expect(store.writes).toBe(0);
  });
  it("stops before writing when lease ownership is lost and releases its own lease", async () => {
    const store = new MemoryStore(); store.loseLease = true;
    await expect(runDemoSeed(store, anchor)).rejects.toThrow(/Seeding stopped/);
    expect(store.writes).toBe(0); expect(store.releases).toBe(1); expect(store.state!.complete).toBe(false);
  });
  it("does not mark a seed complete when persisted verification fails", async () => {
    const store = new MemoryStore(); vi.spyOn(store, "verify").mockRejectedValue(new DemoError("Persisted ledger mismatch"));
    const progress = vi.fn();
    await expect(runDemoSeed(store, anchor, progress)).rejects.toThrow(/Persisted ledger mismatch/);
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ failed: { verification: 1 }, verified: false }));
    expect(store.state!.complete).toBe(false); expect(store.releases).toBe(1);
  });
});
