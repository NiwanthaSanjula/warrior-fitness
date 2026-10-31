import { useCallback, useRef, useState } from "react";
import type { FormEvent } from "react";
import { financialApi } from "../api/financial.api";
import { getApiErrorMessage } from "../api/api";
import { useAuth } from "../auth/auth-context";
import { hasPermissions } from "../auth/permissions";
import { useDashboardResource } from "../hooks/useDashboardResource";
import { DashboardPanel, EmptyQueue } from "../components/dashboard/DashboardWidgets";
import { AmountTile, FinancialFrame, FinancialNotice, FinancialPagination } from "../components/financial/FinancialWidgets";
import { categoryLabels, methodLabels } from "../types/financial";
import type { ExpenseCategory, ExpenseFilters, ExpenseInput, FinancialMethod } from "../types/financial";
import { expenseFormSchema } from "../validations/financial.schema";
import { addCalendarDays, formatGymDate, formatLkr, todayInColombo } from "../utils/dashboard";
import { definiteFinancialRejection } from "../utils/financial";

const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-gym-bg px-3 py-2.5 text-sm text-white focus:border-gym-orange focus:outline-none";
const buttonClass = "rounded-lg bg-gym-orange px-5 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50";
const categories = Object.keys(categoryLabels) as ExpenseCategory[];
const methods = Object.keys(methodLabels) as FinancialMethod[];

export default function ExpenseManagementPage() {
  const { staff } = useAuth();
  const allowed = staff?.role === "ADMIN" && hasPermissions(staff, "expenses.manage");
  const today = todayInColombo();
  const [draft, setDraft] = useState({ from: addCalendarDays(today, -29), to: today, search: "", category: "", method: "" });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState<ExpenseInput | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback((signal: AbortSignal) => {
    const params: ExpenseFilters = { from: filters.from, to: filters.to, search: filters.search, category: filters.category ? filters.category as ExpenseCategory : undefined, method: filters.method ? filters.method as FinancialMethod : undefined, page, limit: 20 };
    return financialApi.getExpenses(params, signal);
  }, [filters, page]);
  const expenses = useDashboardResource(allowed, `${staff?.id}:${JSON.stringify(filters)}:${page}:${version}`, load);
  const locked = busy || pending !== null;

  async function send(payload: ExpenseInput) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(payload); setBusy(true); setError(""); setNotice("");
    try {
      const result = await financialApi.createExpense(payload);
      setPending(null); form.current?.reset(); setPage(1); setVersion((value) => value + 1);
      setNotice(result.replayed ? "Expense already recorded. No duplicate was created." : "Expense recorded successfully. If it is outside the selected filters, adjust the period to view it.");
    } catch (failure) {
      const definite = definiteFinancialRejection(failure);
      if (definite) setPending(null);
      setError(`${getApiErrorMessage(failure)}${definite ? "" : " Outcome unconfirmed. Retry the same submission before entering another expense."}`);
    } finally { setBusy(false); inFlight.current = false; }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    const parsed = expenseFormSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(". ")); return; }
    void send({ ...parsed.data, requestId: crypto.randomUUID() });
  }
  if (!allowed) return <FinancialNotice error message="Admin access is required for Expense Management." />;

  return <FinancialFrame title="Expense Management" subtitle="Record gym operating costs in whole-number LKR. Recorded financial history cannot be edited or deleted." tools={<button className={buttonClass} disabled={locked} onClick={() => setVersion((value) => value + 1)}>Refresh expenses</button>}>
    <FinancialNotice message={notice} /><FinancialNotice message={error} error />
    <section className="rounded-2xl border border-white/10 bg-gym-card p-5 sm:p-6">
      <h2 className="text-lg font-bold">Record an expense</h2><p className="mt-1 text-xs text-gym-muted">Responsible staff: {staff.fullName}. Closed gym dates reject all new entries.</p>
      <form aria-label="Record expense" ref={form} onSubmit={submit} className="mt-5">
        <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 disabled:opacity-60">
          <label className="text-sm">Category<select name="category" className={inputClass} defaultValue="RENT">{categories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></label>
          <label className="text-sm">Amount (LKR)<input className={inputClass} name="amountLkr" type="number" min="1" max="10000000" step="1" required /></label>
          <label className="text-sm">Payment method<select className={inputClass} name="method" defaultValue="CASH">{methods.map((method) => <option key={method} value={method}>{methodLabels[method]}</option>)}</select></label>
          <label className="text-sm">Expense date<input className={inputClass} name="expenseDate" type="date" min="2007-01-01" max={today} defaultValue={today} required /></label>
          <label className="text-sm">Reference (optional)<input className={inputClass} name="reference" maxLength={80} defaultValue="" /></label>
          <label className="text-sm sm:col-span-2 xl:col-span-3">Description<textarea className={inputClass} name="description" minLength={3} maxLength={300} rows={2} required /></label>
          <div><button className={buttonClass} type="submit">{busy ? "Saving…" : "Record expense"}</button></div>
        </fieldset>
      </form>
      {pending && !busy && <button className={`${buttonClass} mt-4`} onClick={() => void send(pending)}>Retry same expense</button>}
    </section>

    <form aria-label="Expense filters" onSubmit={(event) => { event.preventDefault(); setFilters(draft); setPage(1); setVersion((value) => value + 1); }} className="grid gap-3 rounded-2xl border border-white/10 bg-gym-card p-5 sm:grid-cols-2 xl:grid-cols-3">
      <label className="text-sm">From<input type="date" min="2007-01-01" max={today} required className={inputClass} value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
      <label className="text-sm">To<input type="date" min="2007-01-01" max={today} required className={inputClass} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
      <label className="text-sm">Search expenses<input type="search" maxLength={100} className={inputClass} value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} placeholder="Description, reference or staff" /></label>
      <label className="text-sm">Filter category<select className={inputClass} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></label>
      <label className="text-sm">Filter method<select className={inputClass} value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })}><option value="">All methods</option>{methods.map((method) => <option key={method} value={method}>{methodLabels[method]}</option>)}</select></label>
      <div className="self-end"><button className={buttonClass} disabled={locked}>Apply filters</button></div>
    </form>

    <DashboardPanel title="Expense ledger" description="Summaries include every matching record in the selected period, beyond the current page." resource={expenses}>{(result) => <>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><AmountTile label="Filtered expense total" amount={result.summary.amountLkr} />{result.byMethod.map((row) => <AmountTile key={row.method} label={`${methodLabels[row.method]} expenses`} amount={row.amountLkr} />)}</div>
      <details className="mb-5 rounded-xl border border-white/10 p-4" open><summary className="cursor-pointer text-sm font-bold">Expenses by category</summary><dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{result.byCategory.map((row) => <div key={row.category} className="rounded-lg bg-white/5 p-3"><dt className="text-xs text-gym-muted">{categoryLabels[row.category]}</dt><dd className="mt-1 text-sm font-bold">{formatLkr(row.amountLkr)}</dd></div>)}</dl></details>
      <p className="mb-4 text-xs text-gym-muted">{formatGymDate(result.period.from)} – {formatGymDate(result.period.to)} · Asia/Colombo</p>
      {result.data.length === 0 ? <EmptyQueue>No expenses match these filters.</EmptyQueue> : <div className="overflow-x-auto"><table aria-label="Expense records" className="w-full min-w-180 text-left text-sm"><thead className="text-xs uppercase text-gym-muted"><tr>{["Date", "Category / description", "Amount", "Method", "Responsible staff"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{result.data.map((row) => <tr key={row.id} className="border-t border-white/10 align-top"><td className="whitespace-nowrap p-3">{formatGymDate(row.expenseDate)}</td><td className="max-w-80 break-words p-3"><p className="font-bold">{categoryLabels[row.category]}</p><p className="mt-1 text-zinc-300">{row.description}</p>{row.reference && <p className="mt-1 text-xs text-gym-muted">Ref: {row.reference}</p>}</td><td className="whitespace-nowrap p-3 font-bold text-orange-300">{formatLkr(row.amountLkr)}</td><td className="p-3">{methodLabels[row.method]}</td><td className="p-3">{row.responsibleStaffName}</td></tr>)}</tbody></table></div>}
      <FinancialPagination pagination={result.pagination} change={setPage} />
    </>}</DashboardPanel>
  </FinancialFrame>;
}
