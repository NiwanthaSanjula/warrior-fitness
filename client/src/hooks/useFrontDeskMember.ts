import { useCallback } from "react";
import { membersApi } from "../api/members.api";
import { membershipsApi } from "../api/memberships.api";
import { attendanceApi } from "../api/attendance.api";
import { billingApi } from "../api/billing.api";
import { hasPermissions } from "../auth/permissions";
import type { AuthStaff } from "../auth/auth-context";
import { memberBalance } from "../utils/front-desk";
import { useDashboardResource } from "./useDashboardResource";

export function useFrontDeskMember(memberId: string, staff: AuthStaff, revision: number) {
  const key = `${memberId}:${revision}`;
  const profile = useDashboardResource(!!memberId && hasPermissions(staff, "members.read"), key, useCallback(async (signal: AbortSignal) =>
    (await membersApi.getMemberById(memberId, signal)).data, [memberId]));
  const membership = useDashboardResource(!!memberId && hasPermissions(staff, "memberships.read"), key, useCallback(async (signal: AbortSignal) =>
    (await membershipsApi.getSummary(memberId, signal)).data, [memberId]));
  const history = useDashboardResource(!!memberId && hasPermissions(staff, "attendance.read"), key, useCallback(async (signal: AbortSignal) =>
    (await attendanceApi.getMemberHistory(memberId, { page: 1, limit: 1 }, signal)).data[0] ?? null, [memberId]));
  const balance = useDashboardResource(!!memberId && hasPermissions(staff, "invoices.read"), key, useCallback(async (signal: AbortSignal) =>
    memberBalance(await billingApi.getMemberInvoices(memberId, signal), memberId), [memberId]));
  return { profile, membership, history, balance };
}
