export const EXPENSE_CATEGORIES = [
  "RENT", "ELECTRICITY", "WATER", "SALARIES", "EQUIPMENT", "MAINTENANCE", "SUPPLIES", "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
