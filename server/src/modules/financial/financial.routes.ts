import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { AppError } from "../../utils/AppError.js";
import { expenseInputSchema, closingInputSchema, expenseQuerySchema, closingQuerySchema, financialDate } from "./financial.validation.js";
import { createExpense, closeDay, previewDay, listExpenses, listClosings } from "./financial.service.js";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AppError(400, `${issue.path.join(".") || "Input"}: ${issue.message}`);
  }
  return parsed.data;
}
export const expenseRouter = Router();
expenseRouter.use(requireAuth, requireRole("ADMIN"), requirePermission("expenses.manage"));
expenseRouter.get("/", async (req, res) => {
  res.json({ success: true, ...await listExpenses(parse(expenseQuerySchema, req.query)) });
});
expenseRouter.post("/", async (req, res) => {
  const result = await createExpense(parse(expenseInputSchema, req.body), req.staff!);
  res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
});
expenseRouter.all("/{*path}", (_req, res) => {
  res.status(405).json({ success: false, message: "Expense history is read-only; update and delete operations are unavailable" });
});

export const cashClosingRouter = Router();
cashClosingRouter.use(requireAuth, requireRole("ADMIN"), requirePermission("cash-closings.manage"));
cashClosingRouter.get("/", async (req, res) => {
  res.json({ success: true, ...await listClosings(parse(closingQuerySchema, req.query)) });
});
cashClosingRouter.get("/day/:date", async (req, res) => {
  res.json({ success: true, ...await previewDay(parse(financialDate, req.params.date)) });
});
cashClosingRouter.post("/", async (req, res) => {
  const result = await closeDay(parse(closingInputSchema, req.body), req.staff!);
  res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
});
cashClosingRouter.all("/{*path}", (_req, res) => {
  res.status(405).json({ success: false, message: "Completed closings cannot be edited, deleted or reopened" });
});
