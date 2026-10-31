import { NotificationRun } from "./notification-run.model.js";
import { simulateDueReminders } from "./notification.service.js";
import { createDailySchedule } from "./notification.schedule.js";
import { automaticSchedulingEnabled } from "./notification.scheduler-status.js";

const warn = () => console.warn("Automatic reminder simulation failed. Review Notification Center history; no real messages were sent.");
export async function runScheduledSimulation(scheduledDate: string) {
  const run = new NotificationRun({ scheduledDate, status: "RUNNING", startedAt: new Date() });
  try { await run.save(); }
  catch (error) {
    // Unique date claim persists across restarts and coordinates API instances.
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000 && await NotificationRun.exists({ scheduledDate })) return { claimed: false };
    throw error;
  }
  const identity = { _id: run._id, status: "RUNNING" as const };
  try {
    const result = await simulateDueReminders(null, scheduledDate);
    const { due, simulated, duplicates, skipped } = result;
    await NotificationRun.updateOne(identity, { $set: { status: "SUCCEEDED", completedAt: new Date(), summary: { due, simulated, duplicates, skipped } } }, { runValidators: true });
    return { claimed: true, status: "SUCCEEDED" as const };
  } catch {
    // A partial batch remains safe to retry manually through per-reminder keys.
    try { await NotificationRun.updateOne(identity, { $set: { status: "FAILED", completedAt: new Date(), failureCode: "SIMULATION_FAILED" } }, { runValidators: true }); }
    catch { /* Completion remains unconfirmed if status storage is also down. */ }
    warn();
    return { claimed: true, status: "FAILED" as const };
  }
}
export function startNotificationScheduler() {
  if (!automaticSchedulingEnabled()) return null;
  return createDailySchedule({ now: () => new Date(), run: runScheduledSimulation, onError: warn,
    setTimer(callback, delay) { const timer = setTimeout(callback, delay); timer.unref(); return timer; },
    clearTimer(timer) { clearTimeout(timer as ReturnType<typeof setTimeout>); },
  });
}
