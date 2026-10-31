import type { DueReminder, MemberNotificationConsent, NotificationOverview } from "../../src/api/notifications.api";
import type { MemberListResponse } from "../../src/types/member";
export const notificationMemberId = "000000000000000000000010";
export const reminder: DueReminder = {
  memberId: notificationMemberId, membershipId: "000000000000000000000020", memberReference: "WF-EXAMPLE-001", memberName: "Example Member",
  recipient: "+94770000000", planName: "Monthly example plan", lastValidDate: "2026-01-22", scheduledDate: "2026-01-15", reminderType: "SEVEN_DAYS",
  message: "Hi Example Member! Your Warrior Fitness Monthly example plan membership is valid through 2026-01-22. Please contact our reception to renew. Thank you for training with us!",
};
export const notificationOverview: NotificationOverview = {
  success: true, asOfDate: "2026-01-15", due: [reminder], simulatedToday: 1, deliveryMode: "SIMULATION_ONLY",
  scheduler: { enabled: false, timeZone: "Asia/Colombo", dailyTime: "09:00", nextRunAt: null, deliveryMode: "SIMULATION_ONLY", historyAvailable: true, lastRun: null },
  recent: [{ ...reminder, id: "000000000000000000000030", status: "SIMULATED", trigger: "MANUAL", channel: "WHATSAPP_SIMULATED", createdBy: "000000000000000000000001", createdAt: "2026-01-15T06:00:00Z" }],
};
export const memberConsent: MemberNotificationConsent = { success: true, memberId: notificationMemberId, memberName: "Example Member", whatsappOptIn: false, updatedAt: null };
export const notificationMembers: MemberListResponse = {
  success: true, data: [{ id: notificationMemberId, memberId: reminder.memberReference, fullName: reminder.memberName, phone: reminder.recipient,
    isActive: true, gender: null, dateOfBirth: null, address: null, emergencyContact: null, joinedAt: "2025-12-01T00:00:00Z", createdBy: "000000000000000000000001" }],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};
