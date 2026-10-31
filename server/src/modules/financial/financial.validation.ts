import { z } from "zod";
import { PAYMENT_METHODS } from "../billing/payment.model.js";
import { todayInColombo } from "../memberships/membership.dates.js";
import { EXPENSE_CATEGORIES } from "./financial.constants.js";

// Match the existing reporting boundary helpers' modern Colombo UTC+05:30 era.
export const financialDate = z.iso.date().refine(
  (date) => date >= "2007-01-01" && date <= todayInColombo(),
  "Date must be between 2007-01-01 and today in Asia/Colombo",
);
const money = z.number().int().min(0).max(1_000_000_000);
export const expenseInputSchema = z.strictObject({
  requestId: z.uuid(),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(3).max(300),
  amountLkr: z.number().int().min(1).max(10_000_000),
  method: z.enum(PAYMENT_METHODS),
  expenseDate: financialDate,
  reference: z.string().trim().max(80).default(""),
});
export const closingInputSchema = z.strictObject({
  requestId: z.uuid(), date: financialDate,
  openingCashLkr: money, actualCashLkr: money,
  explanation: z.string().trim().max(500).default(""),
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
const pagination = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
const period = { from: financialDate.optional(), to: financialDate.optional() };
export const expenseQuerySchema = z.strictObject({
  ...period, ...pagination,
  search: z.string().trim().max(100).default(""),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
});
export const closingQuerySchema = z.strictObject({ ...period, ...pagination });
export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type ClosingInput = z.infer<typeof closingInputSchema>;
