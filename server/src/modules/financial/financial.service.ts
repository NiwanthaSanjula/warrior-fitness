import { createHash } from "node:crypto";
import type { ClientSession, PipelineStage, Types } from "mongoose";
import type { z } from "zod";
import { AppError } from "../../utils/AppError.js";
import { Payment, PAYMENT_METHODS, type PaymentMethod } from "../billing/payment.model.js";
import { resolveReportPeriod } from "../reports/reports.period.js";
import { Expense, publicExpense, type IExpense } from "./expense.model.js";
import { CashClosing, publicClosing, type DayTotals, type ICashClosing } from "./cash-closing.model.js";
import { FinancialDay } from "./financial-day.model.js";
import { financialTransaction, lockOpenFinancialDay } from "./financial-day.service.js";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./financial.constants.js";
import type { ExpenseInput, ClosingInput, expenseQuerySchema, closingQuerySchema } from "./financial.validation.js";

type Actor = { id: string; fullName: string };
type MethodGroup = { _id: PaymentMethod; amountLkr: number; count: number };
const fingerprint = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

export function reconcileCash(opening: number, actual: number, totals: DayTotals) {
  const expectedCashLkr = opening + totals.collections.CASH - totals.expenses.CASH;
  const varianceLkr = actual - expectedCashLkr;
  if (![opening, actual, expectedCashLkr, varianceLkr, ...Object.values(totals.collections), ...Object.values(totals.expenses)].every(Number.isSafeInteger)) {
    throw new AppError(400, "Financial amounts exceed safe whole-number LKR limits");
  }
  return { expectedCashLkr, varianceLkr };
}

export async function createExpense(input: ExpenseInput, actor: Actor) {
  const hash = fingerprint([actor.id, input.category, input.description, input.amountLkr, input.method, input.expenseDate, input.reference]);
  return financialTransaction(async (session) => {
    const previous = await Expense.findOne({ requestId: input.requestId }).session(session);
    if (previous) {
      if (previous.fingerprint !== hash) throw new AppError(409, "This request ID belongs to a different expense");
      return { data: publicExpense(previous), replayed: true };
    }
    await lockOpenFinancialDay(input.expenseDate, session);
    const expense = new Expense({ ...input, fingerprint: hash, responsibleStaff: actor.id, responsibleStaffName: actor.fullName });
    await expense.save({ session });
    return { data: publicExpense(expense), replayed: false };
  });
}

function periodFor(from?: string, to?: string) {
  const result = resolveReportPeriod({ from, to });
  if (!result.success) throw new AppError(400, result.message);
  return result.period;
}

export async function ledgerTotals(date: string, session: ClientSession): Promise<DayTotals> {
  const period = periodFor(date, date);
  const group = { $group: { _id: "$method", amountLkr: { $sum: "$amountLkr" }, count: { $sum: 1 } } };
  // Sequential operations: parallel queries on a single transaction session are unsupported.
  const payments = await Payment.aggregate<MethodGroup>([
    { $match: { receivedAt: { $gte: period.startUtc, $lt: period.endUtcExclusive } } }, group,
  ]).session(session);
  const expenses = await Expense.aggregate<MethodGroup>([
    { $match: { expenseDate: date } }, group,
  ]).session(session);
  const totals: DayTotals = {
    collections: { CASH: 0, BANK_TRANSFER: 0, CARD: 0 },
    expenses: { CASH: 0, BANK_TRANSFER: 0, CARD: 0 }, paymentCount: 0, expenseCount: 0,
  };
  for (const row of payments) { totals.collections[row._id] = row.amountLkr; totals.paymentCount += row.count; }
  for (const row of expenses) { totals.expenses[row._id] = row.amountLkr; totals.expenseCount += row.count; }
  reconcileCash(0, 0, totals);
  return totals;
}

export async function previewDay(date: string) {
  return financialTransaction(async (session) => {
    const closing = await CashClosing.findOne({ date }).session(session);
    if (closing) return { status: "CLOSED" as const, closing: publicClosing(closing) };
    const day = await FinancialDay.findById(date).session(session);
    if (day?.closed) throw new AppError(409, "Closed-day snapshot unavailable. Contact an administrator.");
    return {
      status: "OPEN" as const, date, currency: "LKR" as const, timezone: "Asia/Colombo" as const,
      revision: day?.revision ?? 0, totals: await ledgerTotals(date, session),
    };
  });
}

export async function closeDay(input: ClosingInput, actor: Actor) {
  const hash = fingerprint([actor.id, input.date, input.openingCashLkr, input.actualCashLkr, input.explanation, input.expectedRevision]);
  return financialTransaction(async (session) => {
    const previous = await CashClosing.findOne({ requestId: input.requestId }).session(session);
    if (previous) {
      if (previous.fingerprint !== hash) throw new AppError(409, "This request ID belongs to a different closing");
      return { data: publicClosing(previous), replayed: true };
    }
    if (await CashClosing.findOne({ date: input.date }).session(session)) {
      throw new AppError(409, "This gym day already has a completed closing");
    }
    const day = await lockOpenFinancialDay(input.date, session);
    if (day.revision - 1 !== input.expectedRevision) {
      throw new AppError(409, "The ledger changed. Refresh the day and review the totals before closing.");
    }
    const totals = await ledgerTotals(input.date, session);
    const reconciliation = reconcileCash(input.openingCashLkr, input.actualCashLkr, totals);
    if (reconciliation.varianceLkr !== 0 && input.explanation.length < 5) {
      throw new AppError(400, "Explain the cash shortage or overage in at least 5 characters");
    }
    const closing = new CashClosing({
      ...input, fingerprint: hash, ...reconciliation, totals, closedBy: actor.id, closedByName: actor.fullName,
    });
    await closing.save({ session });
    const marked = await FinancialDay.updateOne(
      { _id: input.date, closed: false, revision: day.revision },
      { $set: { closed: true } }, { session },
    );
    if (marked.modifiedCount !== 1) throw new AppError(409, "Day state changed. Refresh before retrying.");
    return { data: publicClosing(closing), replayed: false };
  });
}

export async function listExpenses(query: z.infer<typeof expenseQuerySchema>) {
  const period = periodFor(query.from, query.to);
  const match: Record<string, unknown> = { expenseDate: { $gte: period.from, $lte: period.to } };
  if (query.category) match.category = query.category;
  if (query.method) match.method = query.method;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    match.$or = ["description", "reference", "responsibleStaffName"].map((key) => ({ [key]: { $regex: escaped, $options: "i" } }));
  }
  type Result = {
    records: (IExpense & { _id: Types.ObjectId })[];
    overall: { amountLkr: number; count: number }[];
    byCategory: { _id: ExpenseCategory; amountLkr: number; count: number }[];
    byMethod: MethodGroup[];
  };
  const sum = (field: string | null) => ({ $group: { _id: field, amountLkr: { $sum: "$amountLkr" }, count: { $sum: 1 } } });
  const pipeline: PipelineStage[] = [
    { $match: match },
    { $facet: {
      records: [{ $sort: { expenseDate: -1, _id: -1 } }, { $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
      overall: [sum(null)], byCategory: [sum("$category")], byMethod: [sum("$method")],
    } },
  ];
  const [result] = await Expense.aggregate<Result>(pipeline);
  const summary = result?.overall[0] ?? { amountLkr: 0, count: 0 };
  const amounts = [summary.amountLkr, ...(result?.byCategory ?? []).map((row) => row.amountLkr), ...(result?.byMethod ?? []).map((row) => row.amountLkr)];
  if (!amounts.every(Number.isSafeInteger)) throw new AppError(400, "Expense totals exceed safe whole-number LKR limits");
  return {
    data: (result?.records ?? []).map(publicExpense),
    period: { from: period.from, to: period.to }, currency: "LKR", timezone: "Asia/Colombo",
    summary,
    byCategory: EXPENSE_CATEGORIES.map((category) => ({ category, amountLkr: result?.byCategory.find((row) => row._id === category)?.amountLkr ?? 0 })),
    byMethod: PAYMENT_METHODS.map((method) => ({ method, amountLkr: result?.byMethod.find((row) => row._id === method)?.amountLkr ?? 0 })),
    pagination: { page: query.page, limit: query.limit, total: summary.count, totalPages: Math.ceil(summary.count / query.limit) },
  };
}

export async function listClosings(query: z.infer<typeof closingQuerySchema>) {
  const period = periodFor(query.from, query.to);
  const [result] = await CashClosing.aggregate<{
    records: (ICashClosing & { _id: Types.ObjectId })[]; metadata: { count: number }[];
  }>([
    { $match: { date: { $gte: period.from, $lte: period.to } } },
    { $facet: {
      records: [{ $sort: { date: -1 } }, { $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
      metadata: [{ $count: "count" }],
    } },
  ]);
  const total = result?.metadata[0]?.count ?? 0;
  return {
    data: (result?.records ?? []).map(publicClosing), period: { from: period.from, to: period.to },
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
}

// Startup waits for collections and unique indexes before accepting money writes.
// This is not invoked by isolated tests or by this implementation task.
export async function initializeFinancialModels(): Promise<void> {
  await Promise.all([FinancialDay.init(), Expense.init(), CashClosing.init(), Payment.init()]);
}
