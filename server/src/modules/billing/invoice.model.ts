
import mongoose, {
  Schema,
  type HydratedDocument,
  type Types,
} from "mongoose";

import {
  todayInColombo,
} from "../memberships/membership.dates.js";

export type InvoicePaymentStatus =
  | "UNPAID"
  | "PARTIAL"
  | "PAID";

export interface IInvoice {
  invoiceNumber: string;

  member: Types.ObjectId;
  membership: Types.ObjectId;

  planCode: string;
  planName: string;

  totalLkr: number;
  paidLkr: number;

  dueDate: string;
  createdBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const invoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },

    member: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      immutable: true,
      index: true,
    },

    membership: {
      type: Schema.Types.ObjectId,
      ref: "Membership",
      required: true,
      immutable: true,
    },

    planCode: {
      type: String,
      required: true,
      immutable: true,
    },

    planName: {
      type: String,
      required: true,
      immutable: true,
    },

    totalLkr: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: Number.isInteger,
    },

    paidLkr: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger,
    },

    dueDate: {
      type: String,
      required: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      immutable: true,
    },
  },
  {
    timestamps: true,
  }
);

// A membership purchase may have only one invoice.
invoiceSchema.index(
  { membership: 1 },
  {
    unique: true,
    name: "unique_invoice_per_membership",
  }
);

// Useful for member billing history.
invoiceSchema.index({
  member: 1,
  createdAt: -1,
});

// Useful for future overdue-payment reminders.
invoiceSchema.index({
  dueDate: 1,
});

export const Invoice = mongoose.model<IInvoice>(
  "Invoice",
  invoiceSchema
);

export function toPublicInvoice(
  invoice: HydratedDocument<IInvoice>,
  today: string = todayInColombo()
) {
  const balanceLkr =
    invoice.totalLkr - invoice.paidLkr;

  const paymentStatus: InvoicePaymentStatus =
    balanceLkr <= 0
      ? "PAID"
      : invoice.paidLkr > 0
        ? "PARTIAL"
        : "UNPAID";

  const isOverdue =
    balanceLkr > 0 && invoice.dueDate < today;

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,

    memberId: invoice.member.toString(),
    membershipId: invoice.membership.toString(),

    planCode: invoice.planCode,
    planName: invoice.planName,

    currency: "LKR" as const,

    totalLkr: invoice.totalLkr,
    paidLkr: invoice.paidLkr,
    balanceLkr,

    paymentStatus,
    isOverdue,

    dueDate: invoice.dueDate,
    createdBy: invoice.createdBy.toString(),

    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}
