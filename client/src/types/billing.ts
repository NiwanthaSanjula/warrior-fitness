
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


export type PaymentMethod =
  | "CASH"
  | "BANK_TRANSFER"
  | "CARD";

export type BillingInvoiceDetail = Omit<
  BillingInvoice,
  "memberName" | "memberReference"
>;

export interface InvoiceDetailResponse {
  success: boolean;
  data: BillingInvoiceDetail;
}

export interface BillingPayment {
  id: string;
  paymentNumber: string;
  requestId: string;

  invoiceId: string;
  memberId: string;

  currency: "LKR";
  amountLkr: number;
  method: PaymentMethod;

  reference: string;
  notes: string;

  receivedBy: string;
  receivedAt: string;
  createdAt: string;
}

export interface InvoicePaymentsResponse {
  success: boolean;
  invoice: BillingInvoiceDetail;
  data: BillingPayment[];
  total: number;
}
export interface RecordPaymentPayload {
  invoiceId: string;
  amountLkr: number;
  method: PaymentMethod;
  requestId: string;
  reference?: string;
  notes?: string;
}

export interface RecordPaymentResponse {
  success: boolean;
  message: string;
  replayed: boolean;
  data: {
    payment: BillingPayment;
    invoice: BillingInvoiceDetail;
  };
}

