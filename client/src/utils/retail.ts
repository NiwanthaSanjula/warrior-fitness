import type { CartLine, CheckoutInput } from "../types/retail";
import { checkoutPayloadSchema } from "../validations/retail.schema";
export const retailInput = "mt-1 w-full min-w-0 rounded-xl border border-white/15 bg-gym-bg px-3 py-3 text-sm text-white outline-none focus:border-gym-orange";
export const retailPrimary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gym-orange px-4 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40";
export const retailSecondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/5 disabled:opacity-40";
export const retailText = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
export const cartTotal = (cart: CartLine[]) => cart.reduce((sum, line) => sum + line.quantity * line.product.sellingPriceLkr, 0);
export const pendingCheckoutKey = (staffId: string) => `warrior-retail-pending:${staffId}`;
export function readPendingCheckout(staffId: string): CheckoutInput | null {
  const value = sessionStorage.getItem(pendingCheckoutKey(staffId));
  if (!value) return null;
  try { const result = checkoutPayloadSchema.safeParse(JSON.parse(value)); if (!result.success) throw new Error("Invalid pending purchase"); return result.data; }
  catch { throw new Error("Pending checkout recovery data is invalid. Review your sales history before clearing this browser's pending checkout record."); }
}
