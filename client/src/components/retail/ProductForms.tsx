import { useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { retailApi } from "../../api/retail.api";
import { getApiErrorMessage } from "../../api/api";
import type { RetailProduct, StockInput } from "../../types/retail";
import { retailCategories } from "../../types/retail";
import { definiteFinancialRejection } from "../../utils/financial";
import { productProfileSchema, stockChangeSchema } from "../../validations/retail.schema";
import { retailInput, retailPrimary, retailText } from "../../utils/retail";
import { RetailAction, RetailField, RetailNotice } from "./RetailUI";
export function ProductForm({ item, saved }: { item?: RetailProduct; saved: (product: RetailProduct) => void }) {
  return <RetailAction name={item ? "Edit retail product" : "Create retail product"} done={() => {}} confirmation={item ? "Save this product's details and selling price? Existing receipts remain unchanged." : undefined} submit={async data => {
    const profile = productProfileSchema.parse({ name: retailText(data, "name"), sku: retailText(data, "sku"), barcode: retailText(data, "barcode") || null, category: retailText(data, "category"), sellingPriceLkr: Number(retailText(data, "sellingPriceLkr")), lowStockThreshold: Number(retailText(data, "lowStockThreshold")), supplierName: retailText(data, "supplierName"), supplierContact: retailText(data, "supplierContact"), isActive: data.get("isActive") === "on" });
    const result = item ? await retailApi.updateProduct(item, profile) : await retailApi.createProduct({ ...profile, initialStock: z.number().int().min(0).max(1_000_000).parse(Number(retailText(data, "initialStock"))) });
    saved(result.product);
  }}>{busy => <><div className="grid gap-4 sm:grid-cols-2"><RetailField label="Product name" name="name" value={item?.name} required maxLength={120} /><RetailField label="SKU" name="sku" value={item?.sku} required maxLength={80} /><RetailField label="Barcode (optional)" name="barcode" value={item?.barcode} maxLength={80} /><label className="text-sm">Retail category<select name="category" defaultValue={item?.category ?? "SUPPLEMENTS"} className={retailInput}>{Object.entries(retailCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><RetailField label="Selling price (LKR)" name="sellingPriceLkr" type="number" min={1} max={10_000_000} value={item?.sellingPriceLkr} required /><RetailField label="Low-stock threshold" name="lowStockThreshold" type="number" min={0} max={1_000_000} value={item?.lowStockThreshold ?? 5} required />{!item && <RetailField label="Initial stock quantity" name="initialStock" type="number" min={0} max={1_000_000} value={0} required />}<RetailField label="Supplier name" name="supplierName" value={item?.supplierName} /><RetailField label="Supplier contact" name="supplierContact" value={item?.supplierContact} /></div><label className="flex items-center gap-3 text-sm"><input type="checkbox" name="isActive" defaultChecked={item?.isActive ?? true} className="accent-orange-500" />Active and available for sale</label><p className="text-xs leading-6 text-gym-muted">SKU and barcode must be unique. Editing details preserves historical sale and stock records. Supplier costs are recorded separately in Finance.</p><button className={retailPrimary}>{busy ? "Saving…" : item ? "Save product" : "Create product"}</button></>}</RetailAction>;
}
export function StockForm({ item, done }: { item: RetailProduct; done: () => void }) {
  const [pending, setPending] = useState<StockInput | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""); const inFlight = useRef(false);
  async function send(input: StockInput) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(""); setPending(input);
    try { await retailApi.stock(item.id, input); done(); }
    catch (failure) { setError(getApiErrorMessage(failure)); if (definiteFinancialRejection(failure)) setPending(null); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || busy) return;
    const data = new FormData(event.currentTarget), parsed = stockChangeSchema.safeParse({ kind: retailText(data, "kind"), change: Number(retailText(data, "change")), reason: retailText(data, "reason") });
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join(". ")); return; }
    if (window.confirm("Record this stock movement with its reason? This entry will remain in inventory history.")) void send({ ...parsed.data, requestId: crypto.randomUUID(), version: item.version });
  }
  return <div className="space-y-4"><RetailNotice message={error} error /><form aria-label="Record stock movement" onSubmit={submit}><fieldset disabled={busy || pending !== null} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Stock operation<select name="kind" className={retailInput}><option value="RESTOCK">Restock / delivery</option><option value="ADJUSTMENT">Stock adjustment</option></select></label><RetailField label="Quantity change" name="change" type="number" min={-1_000_000} max={1_000_000} required /></div><label className="block text-sm">Stock movement reason<textarea name="reason" required minLength={5} maxLength={500} className={retailInput} rows={3} /></label><p className="text-xs leading-6 text-gym-muted">Current stock: {item.stock}. Restocking adds units; adjustments may add or subtract units and cannot make stock negative. This does not record a Finance expense.</p><button className={retailPrimary}>{busy ? "Recording…" : "Record stock change"}</button></fieldset></form>{pending && !busy && <div className="space-y-3"><p className="text-sm text-amber-200">The outcome is unconfirmed. Keep this page open and retry the same stock request.</p><button className={retailPrimary} onClick={() => void send(pending)}>Retry same stock request</button></div>}</div>;
}
