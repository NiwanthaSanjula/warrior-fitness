import type { ReactNode } from "react";
import { NavLink } from "react-router";
import type { ClosingRecord, DayTotals, Pagination } from "../../types/financial";
import { methodLabels } from "../../types/financial";
import { formatGymDate, formatLkr } from "../../utils/dashboard";
import { formatFinancialTimestamp } from "../../utils/financial";

export function FinancialFrame({ title, subtitle, children, tools }: { title: string; subtitle: string; children: ReactNode; tools?: ReactNode }) {
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-gym-card p-6">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-orange-400">Financial operations · Admin</p><h1 className="text-2xl font-black text-white">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gym-muted">{subtitle}</p></div>{tools}
    </header>
    <nav aria-label="Financial operations" className="flex flex-wrap gap-2">
      {[["/expenses", "Expense Management"], ["/cash-closing", "Daily Cash Closing"], ["/closing-history", "Closing History"]].map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => `rounded-xl border px-4 py-3 text-sm font-bold ${isActive ? "border-gym-orange/50 bg-gym-orange/10 text-orange-400" : "border-white/10 bg-gym-card text-zinc-300 hover:bg-white/5"}`}>{label}</NavLink>)}
    </nav>
    {children}
  </div>;
}
export function FinancialNotice({ message, error = false }: { message: string; error?: boolean }) {
  return message ? <p role={error ? "alert" : "status"} className={`rounded-xl border p-4 text-sm ${error ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>{message}</p> : null;
}
export function AmountTile({ label, amount }: { label: string; amount: number | null }) {
  return <div className="min-w-0 rounded-xl border border-white/10 bg-gym-card p-5"><p className="text-xs font-bold uppercase text-gym-muted">{label}</p><p className="mt-3 break-words text-xl font-black text-white">{amount === null ? "Enter amounts" : formatLkr(amount)}</p></div>;
}
export function MethodTotals({ totals }: { totals: DayTotals }) {
  return <div className="overflow-x-auto"><table aria-label="Collections and expenses by method" className="w-full text-left text-sm">
    <thead className="text-xs uppercase text-gym-muted"><tr><th className="p-3">Method</th><th className="p-3">Collections</th><th className="p-3">Expenses</th></tr></thead>
    <tbody>{(Object.keys(methodLabels) as (keyof typeof methodLabels)[]).map((method) => <tr key={method} className="border-t border-white/10"><th className="p-3 font-semibold">{methodLabels[method]}</th><td className="whitespace-nowrap p-3">{formatLkr(totals.collections[method])}</td><td className="whitespace-nowrap p-3">{formatLkr(totals.expenses[method])}</td></tr>)}</tbody>
  </table><p className="mt-3 text-xs text-gym-muted">{totals.paymentCount} payments · {totals.expenseCount} expenses. Bank Transfer and Card are shown separately and do not enter physical cash reconciliation.</p></div>;
}
export function ClosingSnapshot({ closing }: { closing: ClosingRecord }) {
  return <section aria-label="Completed closing" className="space-y-5 rounded-2xl border border-emerald-500/25 bg-gym-card p-5 sm:p-6">
    <div><p className="text-xs font-bold uppercase text-emerald-400">Completed · Read-only</p><h2 className="mt-2 text-xl font-black">{formatGymDate(closing.date)}</h2><p className="mt-2 text-sm text-gym-muted">Closed by {closing.closedByName} · {formatFinancialTimestamp(closing.closedAt)} · Asia/Colombo</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><AmountTile label="Opening cash" amount={closing.openingCashLkr} /><AmountTile label="Expected cash" amount={closing.expectedCashLkr} /><AmountTile label="Actual closing cash" amount={closing.actualCashLkr} /><AmountTile label={closing.varianceLkr < 0 ? "Shortage" : closing.varianceLkr > 0 ? "Overage" : "Balanced"} amount={Math.abs(closing.varianceLkr)} /></div>
    {closing.explanation && <p className="whitespace-pre-wrap break-words rounded-xl bg-white/5 p-4 text-sm">Explanation: {closing.explanation}</p>}
    <MethodTotals totals={closing.totals} /><p className="text-xs leading-5 text-gym-muted">This stored snapshot cannot be edited or reopened. New payments and expenses for this gym date are blocked.</p>
  </section>;
}
export function FinancialPagination({ pagination, change }: { pagination: Pagination; change: (page: number) => void }) {
  return <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-gym-muted">{pagination.total} records · Page {pagination.page} of {Math.max(1, pagination.totalPages)}</p><div className="flex gap-2"><button className="rounded-lg border border-white/15 px-4 py-2 disabled:opacity-40" disabled={pagination.page <= 1} onClick={() => change(pagination.page - 1)}>Previous</button><button className="rounded-lg border border-white/15 px-4 py-2 disabled:opacity-40" disabled={pagination.page >= pagination.totalPages} onClick={() => change(pagination.page + 1)}>Next</button></div></div>;
}
