import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env, envSchema } from "../src/config/env.js";
import { NotificationRun } from "../src/modules/notifications/notification-run.model.js";
import { colomboNine, createDailySchedule, nextColomboNine, type DailyScheduleDependencies } from "../src/modules/notifications/notification.schedule.js";
import { runScheduledSimulation, startNotificationScheduler } from "../src/modules/notifications/notification.scheduler.js";
import { automaticSchedulingEnabled, getAutomaticScheduleStatus } from "../src/modules/notifications/notification.scheduler-status.js";
import { simulateDueReminders } from "../src/modules/notifications/notification.service.js";

vi.mock("../src/modules/notifications/notification.service.js", () => ({ simulateDueReminders: vi.fn() }));
const enabledBefore = env.NOTIFICATION_SCHEDULER_ENABLED, nodeEnvBefore = env.NODE_ENV;
afterEach(() => { env.NOTIFICATION_SCHEDULER_ENABLED = enabledBefore; env.NODE_ENV = nodeEnvBefore; });
beforeEach(() => {
  vi.mocked(simulateDueReminders).mockReset().mockResolvedValue({ due: 3, simulated: 2, duplicates: 1, skipped: 0, realMessagesSent: 0, deliveryMode: "SIMULATION_ONLY" });
});

describe("validated opt-in and test-runner isolation", () => {
  it.each([[undefined, false], ["false", false], ["true", true]])("parses scheduler flag %s without truthy-string coercion", (input, expected) => {
    expect(envSchema.shape.NOTIFICATION_SCHEDULER_ENABLED.parse(input)).toBe(expected);
  });
  it.each(["", "yes", "TRUE", "True", "1", true, false, 1, null])("rejects ambiguous scheduler flag %s", input => {
    expect(envSchema.shape.NOTIFICATION_SCHEDULER_ENABLED.safeParse(input).success).toBe(false);
  });
  it("never arms a runtime scheduler in NODE_ENV=test even when explicitly enabled", () => {
    env.NOTIFICATION_SCHEDULER_ENABLED = true;
    const timer = vi.spyOn(globalThis, "setTimeout");
    expect(automaticSchedulingEnabled()).toBe(false);
    expect(startNotificationScheduler()).toBeNull(); expect(timer).not.toHaveBeenCalled();
    expect(simulateDueReminders).not.toHaveBeenCalled();
  });
  it("also blocks a test runner with a production-like environment", () => {
    env.NOTIFICATION_SCHEDULER_ENABLED = true; env.NODE_ENV = "production";
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VITEST", "true");
    const timer = vi.spyOn(globalThis, "setTimeout");
    expect(startNotificationScheduler()).toBeNull(); expect(timer).not.toHaveBeenCalled();
  });
  it("disabled configuration never schedules or reads a database", () => {
    env.NOTIFICATION_SCHEDULER_ENABLED = false;
    expect(startNotificationScheduler()).toBeNull(); expect(simulateDueReminders).not.toHaveBeenCalled();
  });
});

describe("9 AM Asia/Colombo calendar boundaries", () => {
  it.each([
    ["2026-01-15T03:29:59Z", "2026-01-15T03:30:00.000Z"],
    ["2026-01-15T03:30:00Z", "2026-01-16T03:30:00.000Z"],
    ["2026-01-15T18:30:00Z", "2026-01-16T03:30:00.000Z"],
    ["2026-01-31T23:59:59Z", "2026-02-01T03:30:00.000Z"],
    ["2028-02-28T20:00:00Z", "2028-02-29T03:30:00.000Z"],
    ["2026-12-31T20:00:00Z", "2027-01-01T03:30:00.000Z"],
  ])("chooses the correct next slot from %s", (now, expected) => {
    expect(nextColomboNine(new Date(now)).toISOString()).toBe(expected);
  });
  it("resolves 9 AM using Colombo rather than host local time", () => {
    expect(colomboNine("2026-07-01").toISOString()).toBe("2026-07-01T03:30:00.000Z");
  });
});

function virtualClock(iso = "2026-01-15T03:29:00Z") {
  let instant = new Date(iso);
  const timers: { callback: () => void; delay: number }[] = [];
  const deps: DailyScheduleDependencies = {
    now: () => instant, setTimer: vi.fn((callback, delay) => { timers.push({ callback, delay }); return timers.length; }),
    clearTimer: vi.fn(), run: vi.fn().mockResolvedValue(undefined), onError: vi.fn(),
  };
  return { deps, timers, set(iso: string) { instant = new Date(iso); }, async fire() { timers.shift()!.callback(); for (let i = 0; i < 12; i++) await Promise.resolve(); } };
}
describe("daily scheduler core with injected virtual timers only", () => {
  it("waits until 9 AM, uses the Colombo date, then arms the next day", async () => {
    const clock = virtualClock(); const job = createDailySchedule(clock.deps);
    expect(clock.timers[0].delay).toBe(60000); expect(clock.deps.run).not.toHaveBeenCalled();
    clock.set("2026-01-15T03:30:00Z"); await clock.fire();
    expect(clock.deps.run).toHaveBeenCalledWith("2026-01-15"); expect(clock.timers[0].delay).toBe(86400000);
    clock.set("2026-01-16T03:30:00Z"); await clock.fire(); expect(clock.deps.run).toHaveBeenLastCalledWith("2026-01-16"); job.stop();
  });
  it("catches up today's slot after a restart past 9 AM", async () => {
    const clock = virtualClock("2026-01-15T04:00:00Z"); createDailySchedule(clock.deps);
    expect(clock.timers[0].delay).toBe(0); await clock.fire(); expect(clock.deps.run).toHaveBeenCalledExactlyOnceWith("2026-01-15");
    expect(clock.timers[0].delay).toBe(84600000);
  });
  it("does not backfill yesterday when a delayed callback reaches the next Colombo day before 9 AM", async () => {
    const clock = virtualClock(); createDailySchedule(clock.deps);
    clock.set("2026-01-15T20:00:00Z"); await clock.fire();
    expect(clock.deps.run).not.toHaveBeenCalled(); expect(clock.timers[0].delay).toBe(27000000);
  });
  it("contains failures and rearms tomorrow without a same-day retry loop", async () => {
    const clock = virtualClock("2026-01-15T03:30:00Z");
    vi.mocked(clock.deps.run).mockRejectedValue(new Error("Fictional failure")); createDailySchedule(clock.deps);
    await clock.fire(); expect(clock.deps.onError).toHaveBeenCalledOnce(); expect(clock.timers[0].delay).toBe(86400000);
  });
  it("contains even a failing logger and still schedules tomorrow", async () => {
    const clock = virtualClock("2026-01-15T03:30:00Z");
    vi.mocked(clock.deps.run).mockRejectedValue(new Error("Fictional failure"));
    vi.mocked(clock.deps.onError).mockImplementation(() => { throw new Error("Fictional logger failure"); });
    createDailySchedule(clock.deps); await clock.fire(); expect(clock.timers).toHaveLength(1);
  });
  it("never overlaps local jobs and stops cleanly during an in-flight run", async () => {
    let finish!: () => void;
    const clock = virtualClock("2026-01-15T03:30:00Z"); vi.mocked(clock.deps.run).mockImplementationOnce(() => new Promise<void>(done => { finish = done; }));
    const job = createDailySchedule(clock.deps); await clock.fire(); expect(clock.timers).toHaveLength(0);
    job.stop(); finish(); for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(clock.timers).toHaveLength(0); expect(clock.deps.clearTimer).toHaveBeenCalledOnce();
  });
  it("ignores an already queued callback after stop", async () => {
    const clock = virtualClock("2026-01-15T03:30:00Z"); const job = createDailySchedule(clock.deps); job.stop(); await clock.fire();
    expect(clock.deps.run).not.toHaveBeenCalled(); expect(clock.timers).toHaveLength(0);
  });
});

describe("durable daily claim with explicitly mocked persistence", () => {
  beforeEach(() => {
    vi.spyOn(NotificationRun.prototype, "save").mockResolvedValue(undefined as never);
    vi.spyOn(NotificationRun, "updateOne").mockResolvedValue({ acknowledged: true } as never);
    vi.spyOn(NotificationRun, "exists").mockResolvedValue(null);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  it("calls the existing engine as the scheduler without impersonating a staff account", async () => {
    expect(await runScheduledSimulation("2026-01-15")).toMatchObject({ claimed: true, status: "SUCCEEDED" });
    expect(simulateDueReminders).toHaveBeenCalledExactlyOnceWith(null, "2026-01-15");
    expect(NotificationRun.updateOne).toHaveBeenCalledWith(expect.objectContaining({ status: "RUNNING" }), { $set: { status: "SUCCEEDED", completedAt: new Date(), summary: { due: 3, simulated: 2, duplicates: 1, skipped: 0 } } }, { runValidators: true });
  });
  it("skips an already claimed day after restart", async () => {
    vi.mocked(NotificationRun.prototype.save).mockRejectedValueOnce({ code: 11000 });
    vi.mocked(NotificationRun.exists).mockResolvedValueOnce({ _id: new NotificationRun()._id });
    expect(await runScheduledSimulation("2026-01-15")).toEqual({ claimed: false });
    expect(simulateDueReminders).not.toHaveBeenCalled(); expect(NotificationRun.updateOne).not.toHaveBeenCalled();
  });
  it("coordinates two competing callers through a simulated unique-index conflict", async () => {
    let claimed = false;
    vi.mocked(NotificationRun.prototype.save).mockImplementation(async () => { if (claimed) throw { code: 11000 }; claimed = true; return undefined as never; });
    vi.mocked(NotificationRun.exists).mockResolvedValue({ _id: new NotificationRun()._id });
    const results = await Promise.all([runScheduledSimulation("2026-01-15"), runScheduledSimulation("2026-01-15")]);
    expect(results.filter(result => result.claimed)).toHaveLength(1); expect(simulateDueReminders).toHaveBeenCalledOnce();
    // Models are mocked: this is conflict handling, not real database concurrency.
  });
  it("records sanitized failure without throwing or storing error bodies", async () => {
    vi.mocked(simulateDueReminders).mockRejectedValueOnce(new Error("Fictional private member details must never be persisted"));
    expect(await runScheduledSimulation("2026-01-15")).toMatchObject({ status: "FAILED" });
    expect(NotificationRun.updateOne).toHaveBeenCalledWith(expect.anything(), { $set: { status: "FAILED", completedAt: new Date(), failureCode: "SIMULATION_FAILED" } }, { runValidators: true });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private member");
  });
  it("contains failure of the failure-status write", async () => {
    vi.mocked(simulateDueReminders).mockRejectedValueOnce(new Error("Fictional failure"));
    vi.mocked(NotificationRun.updateOne).mockRejectedValueOnce(new Error("Fictional unavailable database"));
    expect(await runScheduledSimulation("2026-01-15")).toMatchObject({ status: "FAILED" });
  });
  it.each([{ code: 11000 }, new Error("Fictional claim failure")])("propagates an unconfirmed claim failure to the scheduler boundary", async error => {
    vi.mocked(NotificationRun.prototype.save).mockRejectedValueOnce(error);
    await expect(runScheduledSimulation("2026-01-15")).rejects.toBe(error); expect(simulateDueReminders).not.toHaveBeenCalled();
  });
  it("has one unique daily claim independent of reminder uniqueness", () => {
    expect(NotificationRun.schema.indexes()).toContainEqual([{ scheduledDate: 1 }, { unique: true }]);
  });
});

describe("truthful automatic execution status", () => {
  it.each(["SUCCEEDED", "FAILED", "RUNNING"] as const)("returns the last recorded %s state with ISO times and bounded fields", async status => {
    const record = { scheduledDate: "2026-01-15", status, startedAt: new Date(), completedAt: status === "RUNNING" ? null : new Date(), summary: null, failureCode: status === "FAILED" ? "SIMULATION_FAILED" : null };
    vi.spyOn(NotificationRun, "findOne").mockReturnValue({ sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(record) } as never);
    expect(await getAutomaticScheduleStatus()).toMatchObject({ enabled: false, nextRunAt: null, historyAvailable: true, lastRun: { status, startedAt: new Date().toISOString(), completedAt: record.completedAt?.toISOString() ?? null } });
  });
  it("distinguishes no prior execution from unavailable storage", async () => {
    const lean = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("Fictional status read failure"));
    vi.spyOn(NotificationRun, "findOne").mockReturnValue({ sort: vi.fn().mockReturnThis(), lean } as never);
    expect(await getAutomaticScheduleStatus()).toMatchObject({ historyAvailable: true, lastRun: null });
    expect(await getAutomaticScheduleStatus()).toMatchObject({ historyAvailable: false, lastRun: null });
  });
});
