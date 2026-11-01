import type { Member } from "../../src/types/member";
import type { Membership, MembershipSummary } from "../../src/types/membership";
import type { AttendanceRecord } from "../../src/types/attendance";
import type { BillingInvoiceDetail } from "../../src/types/billing";

export const deskMember: Member = {
  id: "000000000000000000000101", memberId: "WF-DEMO-101", fullName: "Example Nimal Perera", phone: "0000000101",
  gender: null, dateOfBirth: null, address: null, emergencyContact: null,
  joinedAt: "2026-10-01T00:00:00Z", isActive: true, createdBy: "000000000000000000000001",
};
export const otherDeskMember = { ...deskMember, id: "000000000000000000000102", memberId: "WF-DEMO-102", fullName: "Example Kamala Silva", phone: "0000000102" };
export const deskMembership: Membership = {
  id: "000000000000000000000201", memberId: deskMember.id, planId: "000000000000000000000301",
  planSnapshot: { code: "DEMO-MONTH", name: "Example Monthly", durationUnit: "MONTHS", durationCount: 1, priceLkr: 5000 },
  enrollmentType: "INITIAL", startDate: "2026-10-10", lastValidDate: "2026-11-09", endDateExclusive: "2026-11-10",
  status: "ACTIVE", enrolledBy: deskMember.createdBy, createdAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-10T00:00:00Z",
};
export const deskSummary: MembershipSummary = {
  memberId: deskMember.id, memberReference: deskMember.memberId, memberProfileActive: true, status: "ACTIVE", totalPeriods: 1,
  currentMembership: deskMembership, nextMembership: null, latestMembership: deskMembership,
};
export const deskVisit: AttendanceRecord = {
  id: "000000000000000000000401", memberId: deskMember.id, membershipId: deskMembership.id, attendanceDate: "2026-11-01",
  checkedInAt: "2026-10-31T20:00:00Z", checkedInBy: deskMember.createdBy, createdAt: "2026-10-31T20:00:00Z",
};
export const deskInvoice: BillingInvoiceDetail = {
  id: "000000000000000000000501", invoiceNumber: "INV-DEMO-101", memberId: deskMember.id, membershipId: deskMembership.id,
  planCode: "DEMO-MONTH", planName: "Example Monthly", currency: "LKR", totalLkr: 5000, paidLkr: 3000, balanceLkr: 2000,
  paymentStatus: "PARTIAL", isOverdue: true, dueDate: "2026-10-10", createdBy: deskMember.createdBy,
  createdAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-10T00:00:00Z",
};
