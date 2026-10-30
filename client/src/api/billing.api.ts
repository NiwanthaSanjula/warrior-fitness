
import { api } from "./api";

import type {
  InvoiceListParams,
  InvoiceListResponse,
  BillingOverviewResponse,
  InvoiceDetailResponse,
  InvoicePaymentsResponse,
  RecordPaymentPayload,
  RecordPaymentResponse,
} from "../types/billing";

export const billingApi = {
  // Billing dashboard
  async getInvoices(
    params: InvoiceListParams = {},
    signal?: AbortSignal
  ): Promise<InvoiceListResponse> {
    const response = await api.get<InvoiceListResponse>(
      "/invoices",
      { params, signal }
    );

    return response.data;
  },

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

  // Individual invoice details
  async getInvoiceById(
    invoiceId: string,
    signal?: AbortSignal
  ): Promise<InvoiceDetailResponse> {
    const response = await api.get<InvoiceDetailResponse>(
      `/invoices/${encodeURIComponent(invoiceId)}`,
      { signal }
    );

    return response.data;
  },

  // Payment history for an invoice
  async getInvoicePayments(
    invoiceId: string,
    signal?: AbortSignal
  ): Promise<InvoicePaymentsResponse> {
    const response =
      await api.get<InvoicePaymentsResponse>(
        `/payments/invoice/${encodeURIComponent(invoiceId)}`,
        { signal }
      );

    return response.data;
  },

  // Record a new payment
  async recordPayment(
    payload: RecordPaymentPayload
  ): Promise<RecordPaymentResponse> {
    const response = await api.post<RecordPaymentResponse>(
      "/payments",
      payload
    );

    return response.data;
  },
};
