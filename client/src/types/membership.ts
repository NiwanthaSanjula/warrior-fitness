
import type {
  PlanDurationUnit,
} from "./plan";

export type MembershipStatus =
  | "UPCOMING"
  | "ACTIVE"
  | "EXPIRED";

export type OverallMembershipStatus =
  | MembershipStatus
  | "NOT_ENROLLED";

export interface PurchasedPlanSnapshot {
  code: string;
  name: string;
  durationUnit: PlanDurationUnit;
  durationCount: number;
  priceLkr: number;
}

export interface Membership {
  id: string;
  memberId: string;
  planId: string;

  planSnapshot: PurchasedPlanSnapshot;

  enrollmentType: "INITIAL" | "RENEWAL";

  startDate: string;
  lastValidDate: string;
  endDateExclusive: string;

  status: MembershipStatus;
  enrolledBy: string;

  createdAt: string;
  updatedAt: string;
}

export interface MembershipSummary {
  memberId: string;
  memberReference: string;
  memberProfileActive: boolean;

  status: OverallMembershipStatus;
  totalPeriods: number;

  currentMembership: Membership | null;
  nextMembership: Membership | null;
  latestMembership: Membership | null;
}

export interface MembershipResponse {
  success: boolean;
  message: string;
  replayed?: boolean;
  data: Membership;
}

export interface MembershipSummaryResponse {
  success: boolean;
  data: MembershipSummary;
}

export interface MembershipHistoryResponse {
  success: boolean;
  data: Membership[];
  total: number;
}

export interface InitialEnrollmentPayload {
  memberId: string;
  planId: string;
  startDate?: string;
}

export interface RenewalPayload {
  memberId: string;
  planId: string;
  requestId: string;
}
