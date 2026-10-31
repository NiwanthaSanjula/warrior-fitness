import type { ActiveMembersReport, CollectionsReport, ReceivablesReport } from "../../src/types/reports";
import type { AttendanceSummaryResponse } from "../../src/types/attendance";
import type { DueFollowUpsResponse, ExpiringMembershipResponse, OutstandingPaymentResponse } from "../../src/types/attention";

// Fictional API-boundary responses only. Never used by the application.
export const gymDate = "2026-11-01";
const dates = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", gymDate];
const generatedAt = "2026-10-31T20:00:00.000Z";

export const activeFixture: ActiveMembersReport = {
  success: true, reportType: "ACTIVE_MEMBERS_SNAPSHOT", timezone: "Asia/Colombo", asOfDate: gymDate, generatedAt,
  summary: { totalActiveMembers: 142 },
};

export const collectionsFixture: CollectionsReport = {
  success: true, reportType: "PAYMENT_COLLECTIONS", currency: "LKR", timezone: "Asia/Colombo",
  period: { from: dates[0], to: gymDate, days: 7 },
  summary: { totalCollectedLkr: 20000, paymentCount: 8, averagePaymentLkr: 2500 },
  byMethod: [{ method: "CASH", totalCollectedLkr: 20000, paymentCount: 8 }],
  byDay: dates.map((date, index) => ({ date, totalCollectedLkr: [0, 1200, 800, 0, 1500, 4000, 12500][index], paymentCount: [0, 1, 1, 0, 1, 2, 3][index] })),
};

export const receivablesFixture: ReceivablesReport = {
  success: true, reportType: "CURRENT_RECEIVABLES", currency: "LKR", timezone: "Asia/Colombo", asOfDate: gymDate, generatedAt,
  summary: { totalOutstandingLkr: 48000, overdueLkr: 18000, notYetOverdueLkr: 30000, undatedOutstandingLkr: 0, openInvoiceCount: 12, overdueInvoiceCount: 4, partiallyPaidInvoiceCount: 2, membersWithOutstanding: 8 },
};

export const attendanceFixture: AttendanceSummaryResponse = {
  success: true,
  data: { date: gymDate, totalCheckIns: 31, previousDayCheckIns: 20, changeFromPreviousDay: 11,
    last7Days: dates.map((date, index) => ({ date, checkIns: [12, 18, 0, 24, 16, 20, 31][index] })),
  },
};

export const expiringFixture: ExpiringMembershipResponse = {
  success: true, asOfDate: gymDate, windowDays: 7, total: 9, page: 1, limit: 5, totalPages: 2,
  data: [{ type: "MEMBERSHIP_EXPIRING", memberId: "member-expiry", membershipId: "membership-example", memberName: "Example Expiring Member", memberReference: "WF-EXAMPLE-1", memberPhone: null, planName: "Monthly example", lastValidDate: gymDate, daysRemaining: 0 }],
};

export const outstandingFixture: OutstandingPaymentResponse = {
  success: true, asOfDate: gymDate, currency: "LKR", status: "all", search: "", total: 8, page: 1, limit: 5, totalPages: 2,
  summary: { totalOutstandingLkr: 48000, totalOverdueLkr: 18000, membersWithOutstanding: 8, openInvoiceCount: 12, overdueInvoiceCount: 4 },
  data: [{ type: "PAYMENT_OUTSTANDING", memberId: "member-overdue", memberName: "Example Overdue Member", memberReference: "WF-EXAMPLE-2", memberPhone: null, memberProfileActive: false, outstandingLkr: 15000, overdueLkr: 10000, openInvoiceCount: 2, overdueInvoiceCount: 1, oldestDueDate: "2026-10-29", hasOverduePayments: true },
    { type: "PAYMENT_OUTSTANDING", memberId: "member-not-overdue", memberName: "Example Future Payment Member", memberReference: "WF-EXAMPLE-4", memberPhone: null, memberProfileActive: true, outstandingLkr: 30000, overdueLkr: 0, openInvoiceCount: 1, overdueInvoiceCount: 0, oldestDueDate: "2026-11-15", hasOverduePayments: false }],
};

export const dueFixture: DueFollowUpsResponse = {
  success: true, asOfDate: gymDate, total: 6, page: 1, limit: 5, totalPages: 2,
  data: [{ followUpId: "follow-up-example", memberId: "member-follow-up", memberName: "Example Follow-up Member", memberReference: "WF-EXAMPLE-3", memberPhone: null, alertType: "PAYMENT_OUTSTANDING", lastMethod: "PHONE_CALL", lastOutcome: "FOLLOW_UP_REQUIRED", lastNotes: "Fictional fixture", nextFollowUpDate: "2026-10-31", lastRecordedAt: "2026-10-30T06:00:00.000Z", handledBy: "staff-example" }],
};
