
import mongoose, {
  Schema,
  type HydratedDocument,
  type Types,
} from "mongoose";

export const PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "CARD",
] as const;

export type PaymentMethod =
  (typeof PAYMENT_METHODS)[number];

export interface IPayment {
  paymentNumber: string;
  requestId: string;

  invoice: Types.ObjectId;
  member: Types.ObjectId;

  amountLkr: number;
  method: PaymentMethod;

  reference: string;
  notes: string;

  receivedBy: Types.ObjectId;
  receivedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    paymentNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },

    requestId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },

    invoice: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      immutable: true,
    },

    member: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      immutable: true,
    },

    amountLkr: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isInteger,
      immutable: true,
    },

    method: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
      immutable: true,
    },

    reference: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
      immutable: true,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
      immutable: true,
    },

    receivedBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      immutable: true,
    },

    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: true,
  }
);

// Bound daily reconciliation scans by the existing received timestamp.
paymentSchema.index({ receivedAt: 1, method: 1 });

// Quick access to payments for an invoice.
paymentSchema.index({
  invoice: 1,
  createdAt: -1,
});

// Useful for member financial history.
paymentSchema.index({
  member: 1,
  createdAt: -1,
});

export const Payment = mongoose.model<IPayment>(
  "Payment",
  paymentSchema
);

export function toPublicPayment(
  payment: HydratedDocument<IPayment>
) {
  return {
    id: payment.id,
    paymentNumber: payment.paymentNumber,
    requestId: payment.requestId,

    invoiceId: payment.invoice.toString(),
    memberId: payment.member.toString(),

    currency: "LKR" as const,
    amountLkr: payment.amountLkr,

    method: payment.method,
    reference: payment.reference,
    notes: payment.notes,

    receivedBy: payment.receivedBy.toString(),
    receivedAt: payment.receivedAt.toISOString(),
    createdAt: payment.createdAt.toISOString(),
  };
}
