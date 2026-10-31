import { env } from "../../config/env.js";
import { NotificationRun } from "./notification-run.model.js";
import { nextColomboNine } from "./notification.schedule.js";

export function automaticSchedulingEnabled(): boolean {
  return env.NOTIFICATION_SCHEDULER_ENABLED && env.NODE_ENV !== "test" && process.env.NODE_ENV !== "test" && !process.env.VITEST;
}
export async function getAutomaticScheduleStatus() {
  const enabled = automaticSchedulingEnabled();
  const base = { enabled, timeZone: "Asia/Colombo" as const, dailyTime: "09:00" as const,
    nextRunAt: enabled ? nextColomboNine(new Date()).toISOString() : null, deliveryMode: "SIMULATION_ONLY" as const };
  try {
    const last = await NotificationRun.findOne().sort({ startedAt: -1, _id: -1 }).lean();
    return { ...base, historyAvailable: true, lastRun: last ? {
      scheduledDate: last.scheduledDate, status: last.status, startedAt: last.startedAt.toISOString(),
      completedAt: last.completedAt?.toISOString() ?? null, summary: last.summary ? {
        due: last.summary.due, simulated: last.summary.simulated, duplicates: last.summary.duplicates, skipped: last.summary.skipped,
      } : null, failureCode: last.failureCode ?? null,
    } : null };
  } catch {
    // Status storage may be unavailable without breaking consent or reminders.
    return { ...base, historyAvailable: false, lastRun: null };
  }
}
