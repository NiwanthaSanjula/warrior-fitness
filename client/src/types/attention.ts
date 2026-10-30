
export interface ExpiringMembershipAlert {
  type: "MEMBERSHIP_EXPIRING";

  memberId: string;
  membershipId: string;

  memberName: string;
  memberReference: string;
  memberPhone: string | null;

  planName: string;
  lastValidDate: string;
  daysRemaining: number;
}

export interface ExpiringMembershipResponse {
  success: boolean;
  asOfDate: string;
  windowDays: number;

  data: ExpiringMembershipAlert[];

  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface OutstandingPaymentAlert {
  type: "PAYMENT_OUTSTANDING";

  memberId: string;
  memberName: string | null;
  memberReference: string | null;
  memberPhone: string | null;
  memberProfileActive: boolean | null;

  outstandingLkr: number;
  overdueLkr: number;

  openInvoiceCount: number;
  overdueInvoiceCount: number;

  oldestDueDate: string;
  hasOverduePayments: boolean;
}

export interface OutstandingPaymentResponse {
  success: boolean;
  asOfDate: string;
  currency: "LKR";

  status: "all" | "overdue";
  search: string;

  summary: {
    membersWithOutstanding: number;
    totalOutstandingLkr: number;
    totalOverdueLkr: number;
    openInvoiceCount: number;
    overdueInvoiceCount: number;
  };

  data: OutstandingPaymentAlert[];

  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AttendanceInactivityAlert {
  type: "ATTENDANCE_INACTIVE";

  memberId: string;
  memberName: string;
  memberReference: string;
  memberPhone: string | null;
  memberProfileActive: boolean;

  reason: "NEVER_ATTENDED" | "NO_RECENT_VISIT";

  lastVisitDate: string | null;
  lastCheckedInAt: string | null;
  daysSinceLastVisit: number | null;

  inactivityThresholdDays: number;
}

export interface AttendanceInactivityResponse {
  success: boolean;
  asOfDate: string;
  inactivityDays: number;
  search: string;

  summary: {
    membersNeedingFollowUp: number;
    neverAttendedCount: number;
  };

  data: AttendanceInactivityAlert[];

  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type AttentionTab =
  | "expiring"
  | "outstanding"
  | "inactive";
