import { z } from "zod";
import { todayInColombo } from "../utils/dashboard";

const date = z.iso.date().refine((value) => value >= "2007-01-01" && value <= todayInColombo(), "Choose a date up to today in Asia/Colombo");
const amount = (min: number, max: number) => z.preprocess(
  (value) => value === "" ? NaN : Number(value),
  z.number({ error: "Enter a whole-number LKR amount" }).int("Use whole-number LKR").min(min).max(max),
);
export const expenseFormSchema = z.object({
  category: z.enum(["RENT", "ELECTRICITY", "WATER", "SALARIES", "EQUIPMENT", "MAINTENANCE", "SUPPLIES", "OTHER"]),
  description: z.string().trim().min(3, "Description needs at least 3 characters").max(300),
  amountLkr: amount(1, 10_000_000), method: z.enum(["CASH", "BANK_TRANSFER", "CARD"]),
  expenseDate: date, reference: z.string().trim().max(80),
});
export const closingFormSchema = z.object({
  openingCashLkr: amount(0, 1_000_000_000), actualCashLkr: amount(0, 1_000_000_000),
  explanation: z.string().trim().max(500), confirmed: z.literal(true, { error: "Confirm all entries are recorded before closing" }),
});
