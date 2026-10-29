
export type PlanDurationUnit = "DAYS" | "MONTHS";

export type PlanStatusFilter =
  | "all"
  | "active"
  | "inactive";

export interface MembershipPlan {
  id: string;
  code: string;
  name: string;
  description: string;

  durationUnit: PlanDurationUnit;
  durationCount: number;

  priceLkr: number;
  currency: "LKR";

  isActive: boolean;
  createdBy: string;

  createdAt: string;
  updatedAt: string;
}

export interface PlansListResponse {
  success: boolean;
  data: MembershipPlan[];
  total: number;
}
export interface CreatePlanPayload {
  code: string;
  name: string;
  description: string;
  durationUnit: PlanDurationUnit;
  durationCount: number;
  priceLkr: number;
}

export type UpdatePlanPayload =
  Omit<CreatePlanPayload, "code">;

export interface PlanResponse {
  success: boolean;
  message?: string;
  data: MembershipPlan;
}
