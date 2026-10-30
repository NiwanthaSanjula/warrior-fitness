
import { api } from "./api";

import type {
  InvoiceListParams,
  InvoiceListResponse,
  BillingOverviewResponse,
} from "../types/billing";

export const billingApi = {
  // GET /api/invoices
  async getInvoices(
    params: InvoiceListParams = {},
    signal?: AbortSignal
  ): Promise<InvoiceListResponse> {
    const response = await api.get<InvoiceListResponse>(
      "/invoices",
      {
        params,
        signal,
      }
    );

    return response.data;
  },

  // GET /api/invoices/overview
  async getOverview(
    signal?: AbortSignal
  ): Promise<BillingOverviewResponse> {
    const response =
      await api.get<BillingOverviewResponse>(
        "/invoices/overview",
        { signal }
      );

    return response.data;
  },
};
