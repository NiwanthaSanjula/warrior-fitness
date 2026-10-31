
import { api } from "./api";

import type {
  ActiveMembersReport,
  AttendanceTrendsReport,
  CollectionsReport,
  InvoiceReport,
  MembershipActivityReport,
  ReceivablesReport,
} from "../types/reports";

export interface ReportDateRange {
  from: string;
  to: string;
}

export const reportsApi = {
  async getCollections(
    params: ReportDateRange,
    signal?: AbortSignal
  ): Promise<CollectionsReport> {
    const response = await api.get<CollectionsReport>(
      "/reports/revenue/collections",
      { params, signal }
    );

    return response.data;
  },

  async getInvoices(
    params: ReportDateRange,
    signal?: AbortSignal
  ): Promise<InvoiceReport> {
    const response = await api.get<InvoiceReport>(
      "/reports/revenue/invoices",
      { params, signal }
    );

    return response.data;
  },

  async getReceivables(
    signal?: AbortSignal
  ): Promise<ReceivablesReport> {
    const response = await api.get<ReceivablesReport>(
      "/reports/revenue/receivables",
      { signal }
    );

    return response.data;
  },

  async getMembershipActivity(
    params: ReportDateRange,
    signal?: AbortSignal
  ): Promise<MembershipActivityReport> {
    const response =
      await api.get<MembershipActivityReport>(
        "/reports/memberships/activity",
        { params, signal }
      );

    return response.data;
  },

  async getActiveMembers(
    signal?: AbortSignal
  ): Promise<ActiveMembersReport> {
    const response =
      await api.get<ActiveMembersReport>(
        "/reports/memberships/active",
        { signal }
      );

    return response.data;
  },

  async getAttendanceTrends(
    params: ReportDateRange,
    signal?: AbortSignal
  ): Promise<AttendanceTrendsReport> {
    const response =
      await api.get<AttendanceTrendsReport>(
        "/reports/attendance/trends",
        { params, signal }
      );

    return response.data;
  },
};
