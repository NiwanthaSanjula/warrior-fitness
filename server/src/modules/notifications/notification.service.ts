import type { Types } from "mongoose";
import { AppError } from "../../utils/AppError.js";
import { Member } from "../members/member.model.js";
import { Membership } from "../memberships/membership.model.js";
import { addDays, todayInColombo } from "../memberships/membership.dates.js";
import { NotificationConsent, ReminderLog, type IReminder } from "./notification.model.js";
import { getAutomaticScheduleStatus } from "./notification.scheduler-status.js";

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

export async function findDueReminders(today = todayInColombo()) {
  // Select only notification fields from non-expired purchased periods.
  const periods = await Membership.find({ endDateExclusive: { $gt: today } }).select("member planSnapshot.name startDate endDateExclusive").lean<ReminderPeriod[]>();
  const grouped = new Map<string, ReminderPeriod[]>();
  for (const period of periods) {
    const key = String(period.member), items = grouped.get(key) ?? [];
    items.push(period); grouped.set(key, items);
  }
  const candidates = [...grouped.values()].flatMap(items => {
    const due = duePeriod(items, today); return due ? [due] : [];
  });
  if (!candidates.length) return [];
  const memberIds = candidates.map(item => item.period.member);
  const [members, consents] = await Promise.all([
    Member.find({ _id: { $in: memberIds }, isActive: true }).select("memberId fullName phone isActive").lean(),
    NotificationConsent.find({ member: { $in: memberIds }, whatsappOptIn: true }).select("member").lean(),
  ]);
  const memberMap = new Map(members.filter(member => member.isActive).map(member => [String(member._id), member]));
  const consentSet = new Set(consents.map(consent => String(consent.member)));
  return candidates.flatMap(({ period, lastValidDate, reminderType }) => {
    const memberId = String(period.member), member = memberMap.get(memberId);
    if (!member || !consentSet.has(memberId) || !member.phone?.trim()) return [];
    return [{ memberId, membershipId: String(period._id), memberReference: member.memberId, memberName: member.fullName,
      recipient: member.phone, planName: period.planSnapshot.name, lastValidDate, scheduledDate: today, reminderType,
      message: reminderMessage(member.fullName, period.planSnapshot.name, lastValidDate) }];
  }).sort((a, b) => a.lastValidDate.localeCompare(b.lastValidDate) || a.memberReference.localeCompare(b.memberReference));
}

export async function getConsent(memberId: string) {
  const member = await Member.findById(memberId).select("fullName");
  if (!member) throw new AppError(404, "Member not found");
  const consent = await NotificationConsent.findOne({ member: memberId });
  return { success: true, memberId, memberName: member.fullName, whatsappOptIn: consent?.whatsappOptIn ?? false, updatedAt: consent?.updatedAt?.toISOString() ?? null };
}
export async function saveConsent(memberId: string, whatsappOptIn: boolean, actorId: string) {
  if (!(await Member.exists({ _id: memberId }))) throw new AppError(404, "Member not found");
  await NotificationConsent.updateOne({ member: memberId }, { $set: { whatsappOptIn, updatedBy: actorId } }, { upsert: true, runValidators: true });
  return getConsent(memberId);
}
export function publicReminder(log: IReminder & { _id: Types.ObjectId }) {
  return { id: String(log._id), memberId: String(log.member), membershipId: String(log.membership), memberReference: log.memberReference,
    memberName: log.memberName, recipient: log.recipient, planName: log.planName, lastValidDate: log.lastValidDate,
    reminderType: log.reminderType, scheduledDate: log.scheduledDate, message: log.message,
    channel: log.channel, status: log.status, trigger: log.trigger ?? "MANUAL", createdBy: log.createdBy ? String(log.createdBy) : null, createdAt: log.createdAt.toISOString() };
}
export async function getNotificationOverview() {
  const today = todayInColombo(); // One date for all parts, even across midnight.
  const [due, recent, simulatedToday, scheduler] = await Promise.all([
    findDueReminders(today), ReminderLog.find().sort({ createdAt: -1, _id: -1 }).limit(50).lean(),
    ReminderLog.countDocuments({ scheduledDate: today, status: "SIMULATED", channel: "WHATSAPP_SIMULATED" }),
    getAutomaticScheduleStatus(),
  ]);
  return { success: true, asOfDate: today, due, simulatedToday, recent: recent.map(publicReminder), scheduler, deliveryMode: "SIMULATION_ONLY" as const };
}
export async function simulateDueReminders(actorId: string | null, scheduledDate?: string) {
  // Recompute at execution time; a browser preview is never a delivery command.
  const due = await findDueReminders(scheduledDate);
  let simulated = 0, duplicates = 0, skipped = 0;
  for (const item of due) {
    // Recheck consent/status. This is not an atomic delivery-consent lock;
    // real delivery requires separately approved governance and integration.
    const [consent, activeMember] = await Promise.all([
      NotificationConsent.exists({ member: item.memberId, whatsappOptIn: true }), Member.exists({ _id: item.memberId, isActive: true }),
    ]);
    if (!consent || !activeMember) { skipped++; continue; }
    const key = { membership: item.membershipId, reminderType: item.reminderType, scheduledDate: item.scheduledDate };
    try {
      // No provider, network client, credentials, or real-delivery switch.
      const result = await ReminderLog.updateOne(key, { $setOnInsert: {
        member: item.memberId, ...key, memberReference: item.memberReference, memberName: item.memberName,
        recipient: item.recipient, planName: item.planName, lastValidDate: item.lastValidDate, message: item.message,
        channel: "WHATSAPP_SIMULATED", status: "SIMULATED", createdBy: actorId, trigger: actorId === null ? "SCHEDULED" : "MANUAL",
      } }, { upsert: true, runValidators: true });
      if (result.upsertedCount) simulated++; else duplicates++;
    } catch (error) {
      // Count a racing unique-key conflict only if the exact event now exists.
      if (typeof error === "object" && error !== null && "code" in error && error.code === 11000 && await ReminderLog.exists(key)) duplicates++;
      else throw error;
    }
  }
  return { due: due.length, simulated, duplicates, skipped, realMessagesSent: 0 as const, deliveryMode: "SIMULATION_ONLY" as const };
}
