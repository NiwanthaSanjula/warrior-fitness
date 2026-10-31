import { useCallback, useState } from "react";
import { Link } from "react-router";
import { financialApi } from "../api/financial.api";
import { useAuth } from "../auth/auth-context";
import { hasPermissions } from "../auth/permissions";
import { useDashboardResource } from "../hooks/useDashboardResource";
import { DashboardPanel, EmptyQueue } from "../components/dashboard/DashboardWidgets";
import { FinancialFrame, FinancialNotice, FinancialPagination } from "../components/financial/FinancialWidgets";
import { addCalendarDays, formatGymDate, formatLkr, todayInColombo } from "../utils/dashboard";
import { formatFinancialTimestamp } from "../utils/financial";

const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-gym-bg px-3 py-2.5 text-sm text-white";
export default function ClosingHistoryPage() {
  const { staff } = useAuth();
  const allowed = staff?.role === "ADMIN" && hasPermissions(staff, "cash-closings.manage");
  const today = todayInColombo();
  const [draft, setDraft] = useState({ from: addCalendarDays(today, -29), to: today });
  const [period, setPeriod] = useState(draft);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const load = useCallback((signal: AbortSignal) => financialApi.getClosings({ ...period, page, limit: 20 }, signal), [period, page]);
  const history = useDashboardResource(allowed, `${staff?.id}:${JSON.stringify(period)}:${page}:${version}`, load);
  if (!allowed) return <FinancialNotice error message="Admin access is required for Closing History." />;
  return <FinancialFrame title="Closing History" subtitle="Completed financial snapshots retain their original amounts, responsible Admin and closing timestamp." tools={<button className="rounded-lg border border-white/15 px-4 py-3 text-sm font-bold" onClick={() => setVersion((value) => value + 1)}>Refresh history</button>}>
    <form aria-label="Closing history filters" className="flex flex-wrap items-end gap-4 rounded-2xl border border-white/10 bg-gym-card p-5" onSubmit={(event) => { event.preventDefault(); setPeriod(draft); setPage(1); setVersion((value) => value + 1); }}>
      <label className="text-sm">From<input type="date" required min="2007-01-01" max={today} className={inputClass} value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label><label className="text-sm">To<input type="date" required min="2007-01-01" max={today} className={inputClass} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label><button className="rounded-lg bg-gym-orange px-5 py-3 text-sm font-bold">Apply period</button>
    </form>
    <DashboardPanel title="Completed closings" description="Only finalized closings appear here. Open gym dates are not shown as zero-value closings." resource={history}>{(result) => <>
      {result.data.length === 0 ? <EmptyQueue>No completed closings in this period.</EmptyQueue> : <div className="overflow-x-auto"><table aria-label="Closing history records" className="w-full min-w-200 text-left text-sm"><thead className="text-xs uppercase text-gym-muted"><tr>{["Gym date", "Expected cash", "Actual cash", "Difference", "Closed by / time", "Snapshot"].map((title) => <th key={title} className="p-3">{title}</th>)}</tr></thead><tbody>{result.data.map((row) => <tr key={row.id} className="border-t border-white/10 align-top"><td className="whitespace-nowrap p-3">{formatGymDate(row.date)}</td><td className="whitespace-nowrap p-3">{formatLkr(row.expectedCashLkr)}</td><td className="whitespace-nowrap p-3">{formatLkr(row.actualCashLkr)}</td><td className={`whitespace-nowrap p-3 font-bold ${row.varianceLkr === 0 ? "text-emerald-300" : "text-amber-300"}`}>{row.varianceLkr < 0 ? "Shortage" : row.varianceLkr > 0 ? "Overage" : "Balanced"} · {formatLkr(Math.abs(row.varianceLkr))}</td><td className="p-3"><p>{row.closedByName}</p><p className="mt-1 text-xs text-gym-muted">{formatFinancialTimestamp(row.closedAt)} · Colombo</p></td><td className="p-3"><Link className="font-bold text-orange-400 hover:underline" to={`/cash-closing?date=${encodeURIComponent(row.date)}`}>View closing</Link></td></tr>)}</tbody></table></div>}
      <FinancialPagination pagination={result.pagination} change={setPage} />
    </>}</DashboardPanel>
  </FinancialFrame>;
}
