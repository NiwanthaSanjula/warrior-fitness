
export interface ReportPeriod {
  from: string;
  to: string;
  days: number;
}

export interface CollectionsReport {
  success: boolean;
  reportType: "PAYMENT_COLLECTIONS";
  currency: "LKR";
  timezone: string;
  period: ReportPeriod;

  summary: {
    totalCollectedLkr: number;
    paymentCount: number;
    averagePaymentLkr: number;
  };

  byMethod: {
    method: string;
    totalCollectedLkr: number;
    paymentCount: number;
  }[];

  byDay: {
    date: string;
    totalCollectedLkr: number;
    paymentCount: number;
  }[];
}

export interface InvoiceReport {
  success: boolean;
  reportType: "INVOICE_ISSUANCE";
  currency: "LKR";
  timezone: string;
  period: ReportPeriod;

  summary: {
    totalInvoicedLkr: number;
    invoiceCount: number;
    averageInvoiceLkr: number;
  };

  byDay: {
    date: string;
    totalInvoicedLkr: number;
    invoiceCount: number;
  }[];
}

export interface ReceivablesReport {
  success: boolean;
  reportType: "CURRENT_RECEIVABLES";
  currency: "LKR";
  timezone: string;
  asOfDate: string;
  generatedAt: string;

  summary: {
    totalOutstandingLkr: number;
    overdueLkr: number;
    notYetOverdueLkr: number;
    undatedOutstandingLkr: number;
    openInvoiceCount: number;
    overdueInvoiceCount: number;
    partiallyPaidInvoiceCount: number;
    membersWithOutstanding: number;
  };
}

export interface MembershipActivityReport {
  success: boolean;
  reportType: "MEMBERSHIP_ACTIVITY";
  timezone: string;
  period: ReportPeriod;

  summary: {
    totalPurchases: number;
    uniquePurchasingMembers: number;
  };

  byType: {
    enrollmentType: string;
    purchases: number;
  }[];

  byPlan: {
    planName: string;
    purchases: number;
  }[];

  byDay: {
    date: string;
    purchases: number;
  }[];
}

export interface ActiveMembersReport {
  success: boolean;
  reportType: "ACTIVE_MEMBERS_SNAPSHOT";
  timezone: string;
  asOfDate: string;
  generatedAt: string;

  summary: {
    totalActiveMembers: number;
  };
}

export interface AttendanceTrendsReport {
  success: boolean;
  reportType: "ATTENDANCE_TRENDS";
  timezone: string;
  period: ReportPeriod;

  summary: {
    totalVisits: number;
    uniqueVisitors: number;
    averageVisitsPerDay: number;
    busiestDay: {
      date: string;
      visits: number;
    } | null;
  };

  byDay: {
    date: string;
    visits: number;
  }[];
}

export interface ReportsDashboardData {
  collections: CollectionsReport;
  invoices: InvoiceReport;
  receivables: ReceivablesReport;
  membershipActivity: MembershipActivityReport;
  activeMembers: ActiveMembersReport;
  attendance: AttendanceTrendsReport;
}
