import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { isAxiosError } from "axios";
import { Barcode, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { retailApi } from "../api/retail.api";
import { getApiErrorMessage } from "../api/api";
import { useAuth } from "../auth/auth-context";
import type { AuthStaff } from "../auth/auth-context";
import { hasPermissions } from "../auth/permissions";
import { useDashboardResource } from "../hooks/useDashboardResource";
import { DashboardPanel, EmptyQueue } from "../components/dashboard/DashboardWidgets";
import { RetailFrame, RetailNotice, RetailPages } from "../components/retail/RetailUI";
import RetailMemberPicker from "../components/retail/RetailMemberPicker";
import RetailReceipt from "../components/retail/RetailReceipt";
import { retailCategories, type CartLine, type CheckoutInput, type RetailProduct, type RetailSale } from "../types/retail";
import { methodLabels, type FinancialMethod } from "../types/financial";
import type { Member } from "../types/member";
import { cartTotal, pendingCheckoutKey, readPendingCheckout, retailInput, retailPrimary, retailSecondary, retailText } from "../utils/retail";
import { checkoutPayloadSchema } from "../validations/retail.schema";
import { definiteFinancialRejection } from "../utils/financial";
import { formatLkr } from "../utils/dashboard";

function CheckoutWorkspace({ staff }: { staff: AuthStaff }) {
  const [recovery] = useState(() => { try { return { pending: readPendingCheckout(staff.id), error: "" }; } catch (failure) { return { pending: null, error: failure instanceof Error ? failure.message : "Checkout recovery is unavailable" }; } });
  const [pending, setPending] = useState<CheckoutInput | null>(recovery.pending), [busy, setBusy] = useState(false), [error, setError] = useState(recovery.error), [notice, setNotice] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]), [method, setMethod] = useState<FinancialMethod>("CASH"), [cash, setCash] = useState(""), [reference, setReference] = useState(""), [member, setMember] = useState<Pick<Member, "id" | "fullName" | "memberId"> | null>(null), [completed, setCompleted] = useState<RetailSale | null>(null);
  const [filters, setFilters] = useState({ q: "", category: "" }), [page, setPage] = useState(1), [revision, setRevision] = useState(0), [scanning, setScanning] = useState(false), [refreshing, setRefreshing] = useState(false);
  const scanInput = useRef<HTMLInputElement>(null), inFlight = useRef(false), scanAbort = useRef<AbortController | null>(null), cartSection = useRef<HTMLElement>(null);
  const locked = pending !== null || busy || !!recovery.error, total = cartTotal(cart);
  const load = useCallback((signal: AbortSignal) => retailApi.products({ q: filters.q, category: filters.category as RetailProduct["category"] || undefined, status: "active", page, limit: 8 }, signal), [filters, page]);
  const catalog = useDashboardResource(true, `${staff.id}:${JSON.stringify(filters)}:${page}:${revision}`, load);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if (event.altKey && event.code === "KeyB") { event.preventDefault(); scanInput.current?.focus(); } };
    window.addEventListener("keydown", shortcut);
    return () => { window.removeEventListener("keydown", shortcut); scanAbort.current?.abort(); };
  }, []);
  function add(product: RetailProduct) {
    if (locked || refreshing) return;
    setError(""); setNotice("");
    const previous = cart.find(line => line.product.id === product.id), quantity = (previous?.quantity ?? 0) + 1;
    if (!product.isActive || quantity > product.stock || quantity > 1000 || !previous && cart.length >= 50) { setError("This quantity is not available. Review stock or remove a cart line."); return; }
    setCart(current => {
      const previous = current.find(line => line.product.id === product.id), quantity = (previous?.quantity ?? 0) + 1;
      if (!product.isActive || quantity > product.stock || quantity > 1000 || !previous && current.length >= 50) return current;
      return previous ? current.map(line => line.product.id === product.id ? { product, quantity } : line) : [...current, { product, quantity }];
    });
  }
  async function scan(value: string) {
    if (locked || scanning || refreshing) return;
    const code = value.trim().toUpperCase(); if (!code) return;
    setScanning(true); setError(""); const controller = new AbortController(); scanAbort.current = controller;
    try {
      const result = await retailApi.products({ barcode: code, status: "active", page: 1, limit: 2 }, controller.signal);
      let product = result.data[0];
      if (!product) { const matches = await retailApi.products({ sku: code, status: "active", page: 1, limit: 2 }, controller.signal); product = matches.data.find(item => item.sku === code)!; }
      if (controller.signal.aborted) return;
      if (!product) setError("No active product matches this barcode or SKU."); else add(product);
      if (scanInput.current) scanInput.current.value = "";
    } catch (failure) { if (!controller.signal.aborted) setError(getApiErrorMessage(failure)); }
    finally { setScanning(false); scanInput.current?.focus(); }
  }
  async function refreshCart() {
    if (locked || scanning || !cart.length) return;
    setRefreshing(true); setError("");
    try { const results = await Promise.all(cart.map(line => retailApi.product(line.product.id))); setCart(current => current.map(line => ({ ...line, product: results.find(result => result.product.id === line.product.id)!.product }))); setNotice("Cart prices and stock refreshed. Review quantities and total before completing the sale."); setRevision(value => value + 1); }
    catch (failure) { setError(getApiErrorMessage(failure)); }
    finally { setRefreshing(false); }
  }
  async function send(input: CheckoutInput) {
    if (inFlight.current) return;
    // Persist the exact idempotent payload before issuing a money write. No
    // credentials or customer names are stored; recovery is scoped to staff ID.
    try { sessionStorage.setItem(pendingCheckoutKey(staff.id), JSON.stringify(input)); }
    catch { setError("Cannot save checkout recovery in this browser. No sale was submitted."); return; }
    inFlight.current = true; setBusy(true); setPending(input); setError(""); setNotice("");
    try {
      const result = await retailApi.checkout(input);
      setCompleted(result.sale); setCart([]); setCash(""); setMember(null); setReference(""); setNotice(result.replayed ? "Existing sale recovered. Stock and collections were not recorded again." : "Sale completed. Receipt and inventory are ready.");
      try { sessionStorage.removeItem(pendingCheckoutKey(staff.id)); setPending(null); } catch { setError("Sale completed, but browser recovery could not be cleared. Retrying this request will return the same receipt."); }
      setRevision(value => value + 1);
    } catch (failure) {
      setError(getApiErrorMessage(failure));
      if (definiteFinancialRejection(failure) && !(isAxiosError(failure) && [401, 403].includes(failure.response?.status ?? 0))) {
        try { sessionStorage.removeItem(pendingCheckoutKey(staff.id)); setPending(null); } catch { setError("Checkout rejected, but browser recovery could not be cleared. Review sales history before retrying."); }
      }
    } finally { inFlight.current = false; setBusy(false); }
  }
  function complete() {
    if (locked || refreshing || scanning || !cart.length) return;
    const parsed = checkoutPayloadSchema.safeParse({ requestId: crypto.randomUUID(), items: cart.map(line => ({ productId: line.product.id, quantity: line.quantity, expectedUnitPriceLkr: line.product.sellingPriceLkr })), expectedTotalLkr: total, method, cashTenderedLkr: method === "CASH" && cash !== "" ? Number(cash) : null, memberId: member?.id ?? null, reference });
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join(". ")); return; }
    void send(parsed.data);
  }
  const cashValid = method !== "CASH" || cash.trim() !== "" && Number.isSafeInteger(Number(cash)) && Number(cash) >= total && Number(cash) <= 1_000_000_000;
  return <RetailFrame title="Point of Sale" description="Scan. Add. Checkout. One payment, one receipt — for gym members and walk-in customers." tools={<div className="flex flex-wrap gap-3"><button className={retailSecondary} disabled={locked} onClick={() => setRevision(value => value + 1)}>Refresh catalog</button>{hasPermissions(staff, "retail.sales.read") && <Link className={retailSecondary} to="/retail/sales">Sales history</Link>}</div>}>
    <RetailNotice message={notice} /><RetailNotice message={error} error />
    {pending && <section className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5"><h2 className="font-bold text-amber-200">{busy ? "Completing checkout…" : "Checkout outcome unconfirmed"}</h2><p className="text-sm leading-6 text-gym-muted">{formatLkr(pending.expectedTotalLkr)} · {pending.items.length} product lines · {methodLabels[pending.method]}. Retry this exact request to recover the receipt safely. Do not begin a second purchase for the same payment.</p><button className={retailPrimary} disabled={busy} onClick={() => void send(pending)}>{busy ? "Please wait…" : "Retry same checkout"}</button></section>}
    {completed && <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]"><RetailReceipt sale={completed} /><div className="rounded-2xl border border-white/10 bg-gym-card p-5"><h2 className="text-xl font-bold">Ready for the next customer</h2><p className="mt-3 text-sm leading-6 text-gym-muted">The receipt preserves the products, prices, cashier and payment details for this completed sale.</p><button className={`${retailPrimary} mt-5`} disabled={locked} onClick={() => { setCompleted(null); setNotice(""); scanInput.current?.focus(); }}>Start next sale</button></div></div>}
    {!completed && <><form aria-label="Barcode checkout input" className="flex flex-wrap items-end gap-3 rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4 sm:p-5" onSubmit={event => { event.preventDefault(); void scan(retailText(new FormData(event.currentTarget), "scan")); }}><label className="w-full min-w-0 text-sm font-bold sm:w-auto sm:flex-1"><span className="flex items-center gap-2"><Barcode size={17} />Scan barcode or SKU</span><input ref={scanInput} name="scan" maxLength={80} autoComplete="off" disabled={locked || scanning || refreshing} placeholder="Scan with USB reader, then Enter · Alt+B" className={retailInput} /></label><button className={retailPrimary} disabled={locked || scanning || refreshing}>{scanning ? "Looking up…" : "Add scanned item"}</button><button type="button" className={`${retailSecondary} lg:hidden`} onClick={() => cartSection.current?.scrollIntoView({ behavior: "smooth", block: "start" })}><ShoppingCart size={16} />Cart · {cart.reduce((sum, line) => sum + line.quantity, 0)}</button></form>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]"><div className="space-y-4"><form aria-label="Checkout product filters" className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); setFilters({ q: retailText(data, "q"), category: retailText(data, "category") }); setPage(1); }}><label className="min-w-0 flex-1 text-sm">Search shelf<input name="q" maxLength={100} placeholder="Product name, SKU or barcode" className={retailInput} disabled={locked} /></label><label className="text-sm">Shelf category<select name="category" className={retailInput} disabled={locked}><option value="">All categories</option>{Object.entries(retailCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className={retailSecondary} disabled={locked}>Find products</button></form>
      <DashboardPanel title="Available products" description="Add a product or scan a barcode. Current stock and server prices are checked again at checkout." resource={catalog}>{result => <>{result.data.length ? <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">{result.data.map(product => <li key={product.id}><button className="flex h-full w-full flex-col rounded-2xl border border-white/10 bg-white/2 p-4 text-left transition hover:border-orange-500/60 hover:bg-orange-500/5 disabled:cursor-not-allowed disabled:opacity-45" disabled={locked || refreshing || !product.isActive || product.stock === 0} aria-label={`Add ${product.name}`} onClick={() => add(product)}><span className="mb-3 rounded-lg bg-orange-500/10 px-2 py-1 text-[10px] font-bold uppercase text-orange-300">{retailCategories[product.category]}</span><span className="break-words font-bold">{product.name}</span><span className="mt-1 break-all text-[11px] text-gym-muted">{product.sku}</span><span className="mt-4 text-xl font-black text-orange-300">{formatLkr(product.sellingPriceLkr)}</span><span className={`mt-2 text-xs ${product.stock ? "text-emerald-300" : "text-red-300"}`}>{product.stock ? `${product.stock} in stock` : "Out of stock"}</span></button></li>)}</ul> : <EmptyQueue>No active products match this search.</EmptyQueue>}<RetailPages pagination={result.pagination} label="checkout catalog" change={setPage} /></>}</DashboardPanel>
    </div><section ref={cartSection} aria-label="Current sale" className="min-w-0 space-y-5 rounded-2xl border border-white/10 bg-gym-card p-5 xl:sticky xl:top-5"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-xl font-black"><ShoppingCart className="text-orange-400" size={20} />Current sale</h2><span className="text-xs text-gym-muted">{cart.length} lines</span></div>{cart.length ? <ul className="divide-y divide-white/10">{cart.map(line => <li key={line.product.id} className="space-y-3 py-4"><div className="flex justify-between gap-3"><p className="min-w-0 break-words text-sm font-bold">{line.product.name}</p><button className="p-1 text-gym-muted hover:text-red-300" aria-label={`Remove ${line.product.name}`} disabled={locked || refreshing} onClick={() => setCart(current => current.filter(item => item.product.id !== line.product.id))}><Trash2 size={17} /></button></div><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><button className={retailSecondary} disabled={locked || refreshing || line.quantity <= 1} aria-label={`Decrease ${line.product.name}`} onClick={() => setCart(current => current.map(item => item.product.id === line.product.id ? { ...item, quantity: item.quantity - 1 } : item))}><Minus size={13} /></button><input aria-label={`Quantity for ${line.product.name}`} type="number" min={1} max={1000} value={line.quantity} disabled={locked || refreshing} className="w-16 rounded-lg border border-white/15 bg-gym-bg px-2 py-2 text-center text-sm" onChange={event => setCart(current => current.map(item => item.product.id === line.product.id ? { ...item, quantity: Math.min(1000, Math.max(1, Math.trunc(Number(event.target.value) || 1))) } : item))} /><button className={retailSecondary} disabled={locked || refreshing || line.quantity >= Math.min(1000, line.product.stock)} aria-label={`Increase ${line.product.name}`} onClick={() => add(line.product)}><Plus size={13} /></button></div><p className="text-sm font-bold">{formatLkr(line.quantity * line.product.sellingPriceLkr)}</p></div><p className="text-xs text-gym-muted">{formatLkr(line.product.sellingPriceLkr)} each · {line.product.stock} available</p>{line.quantity > line.product.stock && <p className="text-xs text-red-300">Insufficient stock. Reduce this quantity.</p>}</li>)}</ul> : <EmptyQueue>Your cart is empty. Scan or choose a product.</EmptyQueue>}
      {cart.length > 0 && <button className={`${retailSecondary} w-full text-xs`} disabled={locked || refreshing || scanning} onClick={() => void refreshCart()}>{refreshing ? "Refreshing cart…" : "Refresh cart prices & stock"}</button>}
<fieldset disabled={locked} className="space-y-4"><div className="border-y border-white/10 py-4"><p className="flex justify-between text-sm text-gym-muted"><span>Subtotal</span><span>{formatLkr(total)}</span></p><p className="mt-2 flex justify-between gap-3 text-2xl font-black"><span>Total</span><span>{formatLkr(total)}</span></p></div><label className="block text-sm">Payment method<select className={retailInput} value={method} onChange={event => setMethod(event.target.value as FinancialMethod)}>{Object.entries(methodLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{method === "CASH" && <><label className="block text-sm">Cash received (LKR)<input type="number" min={0} max={1_000_000_000} step={1} value={cash} onChange={event => setCash(event.target.value)} className={retailInput} /></label><p className={`flex justify-between text-sm font-bold ${cash !== "" && Number(cash) < total ? "text-red-300" : "text-emerald-300"}`}><span>{cash !== "" && Number(cash) < total ? "Cash short by" : "Change"}</span><span>{cash === "" ? "Enter cash received" : formatLkr(Math.abs(Number(cash) - total))}</span></p></>}<label className="block text-sm">Payment reference (optional)<input value={reference} maxLength={80} onChange={event => setReference(event.target.value)} className={retailInput} /></label>{hasPermissions(staff, "members.read") && <RetailMemberPicker selected={member} change={setMember} disabled={locked} />}<button className={`${retailPrimary} w-full text-base`} disabled={locked || refreshing || scanning || !cart.length || !cashValid || total > 1_000_000_000 || cart.some(line => line.quantity > line.product.stock || !line.product.isActive)} onClick={complete}>{busy ? "Completing…" : "Complete sale"}</button><p className="text-center text-[11px] leading-5 text-gym-muted">Single payment per sale. Card and bank transfer must be collected using your existing payment process.</p></fieldset>
    </section></div></>}
  </RetailFrame>;
}
export default function RetailCheckoutPage() {
  const { staff } = useAuth();
  return staff && hasPermissions(staff, "retail.read", "retail.checkout") ? <CheckoutWorkspace key={staff.id} staff={staff} /> : <RetailNotice error message="Retail product and checkout permissions are required." />;
}
