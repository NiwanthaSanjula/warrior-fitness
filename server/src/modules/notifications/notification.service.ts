import { Member } from "../members/member.model.js";
import { Membership } from "../memberships/membership.model.js";
import { addDays, todayInColombo } from "../memberships/membership.dates.js";
import { NotificationConsent, ReminderLog } from "./notification.model.js";

const REMINDERS = [
  { days: 7, type: "SEVEN_DAYS" },
  { days: 3, type: "THREE_DAYS" },
  { days: 0, type: "LAST_VALID_DAY" },
] as const;

export function reminderMessage(name: string, plan: string, date: string): string {
  return `Hi ${name}! Your Warrior Fitness ${plan} membership is valid through ${date}. Please contact our reception to renew. Thank you for training with us!`;
}

export async function findDueReminders(today = todayInColombo()) {
  const lastDate = addDays(today, 7);
  // Latest purchased period per member avoids notifying someone already renewed.
  const records = await Membership.aggregate<{
    _id: unknown;
    member: unknown;
    planSnapshot: { name: string };
    endDateExclusive: string;
    startDate: string;
  }>([
    { $sort: { endDateExclusive: -1, startDate: -1, _id: -1 } },
    { $group: { _id: "$member", latest: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$latest" } },
    { $match: { startDate: { $lte: today }, endDateExclusive: { $gt: today, $lte: addDays(lastDate, 1) } } },
  ]);
  if (!records.length) return [];
  const memberIds = records.map((r) => r.member);
  const [members, consents] = await Promise.all([
    Member.find({ _id: { $in: memberIds }, isActive: true }).lean(),
    NotificationConsent.find({ member: { $in: memberIds }, whatsappOptIn: true }).lean(),
  ]);
  const memberMap = new Map(members.map((m) => [String(m._id), m]));
  const consentSet = new Set(consents.map((c) => String(c.member)));
  return records.flatMap((record) => {
    const id = String(record.member);
    const member = memberMap.get(id);
    const lastValidDate = addDays(record.endDateExclusive, -1);
    const reminder = REMINDERS.find((r) => addDays(today, r.days) === lastValidDate);
    if (!member || !consentSet.has(id) || !reminder || !member.phone.trim()) return [];
    return [{
      memberId: id, membershipId: String(record._id),
      memberReference: member.memberId, memberName: member.fullName,
      recipient: member.phone, planName: record.planSnapshot.name,
      lastValidDate, scheduledDate: today,
      reminderType: reminder.type,
      message: reminderMessage(member.fullName, record.planSnapshot.name, lastValidDate),
    }];
  });
}

export async function simulateDueReminders(actorId: string) {
  const due = await findDueReminders();
  let created = 0;
  let duplicates = 0;
  for (const item of due) {
    // Unique index ensures repeat/concurrent requests never duplicate an event.
    const result = await ReminderLog.updateOne(
      { membership: item.membershipId, reminderType: item.reminderType, scheduledDate: item.scheduledDate },
      { $setOnInsert: {
        member: item.memberId, membership: item.membershipId,
        memberReference: item.memberReference, memberName: item.memberName,
        recipient: item.recipient, planName: item.planName,
        lastValidDate: item.lastValidDate, reminderType: item.reminderType,
        scheduledDate: item.scheduledDate, message: item.message,
        channel: "WHATSAPP_SIMULATED", status: "SIMULATED", createdBy: actorId,
      } },
      { upsert: true },
    );
    if (result.upsertedCount) created += 1;
    else duplicates += 1;
  }
  return { due: due.length, simulated: created, duplicates, realMessagesSent: 0 };
}
