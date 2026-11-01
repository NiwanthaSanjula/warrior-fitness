import type { Types } from "mongoose";
import { addDays } from "../memberships/membership.dates.js";

const REMINDERS = [
  { days: 7, type: "SEVEN_DAYS" }, { days: 3, type: "THREE_DAYS" }, { days: 0, type: "LAST_VALID_DAY" },
] as const;
export interface ReminderPeriod {
  _id: Types.ObjectId; member: Types.ObjectId; planSnapshot: { name: string };
  startDate: string; endDateExclusive: string;
}
export function reminderMessage(name: string, plan: string, date: string): string {
  return `Hi ${name}! Your Warrior Fitness ${plan} membership is valid through ${date}. Please contact our reception to renew. Thank you for training with us!`;
}

// Match Attention Center: valid coverage today and the final purchased period,
// including future renewals, rather than an older expiry.
export function duePeriod(periods: readonly ReminderPeriod[], today: string) {
  if (!periods.some(period => period.startDate <= today && today < period.endDateExclusive)) return null;
  const latest = [...periods].sort((a, b) => b.endDateExclusive.localeCompare(a.endDateExclusive) || b.startDate.localeCompare(a.startDate) || String(b._id).localeCompare(String(a._id)))[0];
  const lastValidDate = addDays(latest.endDateExclusive, -1);
  const reminder = REMINDERS.find(item => addDays(today, item.days) === lastValidDate);
  return reminder ? { period: latest, lastValidDate, reminderType: reminder.type } : null;
}
