
export type InvoicePaymentStatus =
  | "UNPAID"
  | "PARTIAL"
  | "PAID";

export type InvoiceStatusFilter =
  | "all"
  | "unpaid"
  | "partial"
  | "paid"
  | "overdue";

export interface BillingInvoice {
  id: string;
  invoiceNumber: string;

  memberId: string;
  membershipId: string;

  memberName: string | null;
  memberReference: string | null;

  planCode: string;
  planName: string;

  currency: "LKR";

  totalLkr: number;
  paidLkr: number;
  balanceLkr: number;

  paymentStatus: InvoicePaymentStatus;
  isOverdue: boolean;

  dueDate: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceListResponse {
  success: boolean;
  data: BillingInvoice[];

  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BillingOverview {
  invoiceCount: number;
  billedLkr: number;
  collectedLkr: number;
  outstandingLkr: number;
  overdueCount: number;
  currency: "LKR";
}

export interface BillingOverviewResponse {
  success: boolean;
  data: BillingOverview;
}

export interface InvoiceListParams {
  status?: InvoiceStatusFilter;
  search?: string;
  page?: number;
  limit?: number;
}
