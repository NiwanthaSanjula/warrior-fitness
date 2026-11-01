import { buildDemoPlan, type Counts, type DemoOperation, type DemoPlan } from "./demo.plan.js";
import { DemoError } from "./demo.config.js";

export interface SeedState { anchoredAt: string; planHash: string; complete: boolean }
export interface DemoStore {
  readState(): Promise<SeedState | null>;
  acquire(plan: DemoPlan): Promise<void>;
  heartbeat(): Promise<void>;
  apply(operation: DemoOperation): Promise<boolean>; // true = newly created
  verify(plan: DemoPlan): Promise<void>;
  complete(plan: DemoPlan): Promise<void>;
  release(): Promise<void>;
}
export interface SeedReport { plan: DemoPlan; created: Counts; skipped: Counts; failed: Counts; verified: boolean }
export function emptyReport(plan: DemoPlan): SeedReport { return { plan, created: {}, skipped: {}, failed: {}, verified: false }; }
function count(target: Counts, effects: Counts) { for (const [key, value] of Object.entries(effects)) target[key] = (target[key] ?? 0) + value; }
export async function runDemoSeed(store: DemoStore, now: Date, progress: (report: SeedReport) => void = () => {}) {
  const state = await store.readState();
  const plan = buildDemoPlan(state ? new Date(state.anchoredAt) : now), report = emptyReport(plan);
  if (state && state.planHash !== plan.hash) throw new DemoError("The stored demo snapshot differs from this generator version. No data was rewritten. Review the dataset/version before proceeding.");
  if (state?.complete) {
    // Do not replay a completed fixture into a database the user may since have
    // explored/edited through legitimate workflows. Never reset its passwords/stock.
    report.skipped = { ...plan.counts }; progress(report); return report;
  }
  await store.acquire(plan);
  try {
    let processed = 0;
    for (const operation of plan.operations) {
      try {
        await store.heartbeat();
        count(await store.apply(operation) ? report.created : report.skipped, operation.effects);
      } catch {
        // Report only the operation identifier, never payloads/driver messages.
        count(report.failed, operation.effects); progress(report);
        throw new DemoError(`Seeding stopped at ${operation.kind} (${operation.key}). Completed records were preserved. Rerun --apply to resume; no raw database error was printed.`);
      }
      if (++processed % 50 === 0) progress(report);
    }
    try { await store.verify(plan); }
    catch (error) { report.failed.verification = 1; progress(report); throw error; }
    report.verified = true;
    await store.complete(plan); progress(report); return report;
  } finally { await store.release(); }
}
export function reportRows(report: SeedReport) {
  return Object.fromEntries(Object.entries(report.plan.counts).map(([module, planned]) => [module, { planned, created: report.created[module] ?? 0, skipped: report.skipped[module] ?? 0, failed: report.failed[module] ?? 0 }]));
}
