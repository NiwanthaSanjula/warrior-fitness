import type { DashboardResource } from "../../hooks/useDashboardResource";
import type { CollectionsReport } from "../../types/reports";
import type { RetailDashboard } from "../../types/retail";
import { completeSeries } from "../../utils/dashboard-charts";
import { formatLkr } from "../../utils/dashboard";
import { DashboardChart, type ChartSeries } from "./DashboardCharts";
import { ResourceContent, WorkflowLink } from "./DashboardWidgets";

export default function CollectionsPanel({ membership, retail, from, to }: {
  membership: DashboardResource<CollectionsReport>; retail: DashboardResource<RetailDashboard>; from: string; to: string;
}) {
  const series: ChartSeries[] = [];
  const sources = [
    { label: "Membership", color: "#fb923c", resource: membership, total: membership.state.status === "success" ? membership.state.data.summary.totalCollectedLkr : null, period: membership.state.status === "success" ? membership.state.data.period : null, rows: membership.state.status === "success" ? membership.state.data.byDay.map(day => ({ date: day.date, value: day.totalCollectedLkr })) : [] },
    { label: "POS", color: "#a78bfa", resource: retail, total: retail.state.status === "success" ? retail.state.data.summary.amountLkr : null, period: retail.state.status === "success" ? retail.state.data.period : null, rows: retail.state.status === "success" ? retail.state.data.trend : [] },
  ].map(source => {
    let validationError: string | null = null;
    if (source.resource.state.status === "success") {
      try {
        if (source.period?.from !== from || source.period?.to !== to) throw new Error("Chart period does not match the selected dates.");
        const data = completeSeries(source.rows, from, to);
        if (!Number.isSafeInteger(source.total) || data.reduce((sum, day) => sum + day.value, 0) !== source.total) throw new Error("Daily collections do not match the period total.");
        series.push({ label: source.label, color: source.color, data });
      } catch (error) { validationError = error instanceof Error ? error.message : "Chart data unavailable."; }
    }
    return { ...source, validationError };
  });
  return <section aria-labelledby="collections-chart-heading" className="min-w-0 rounded-2xl border border-white/10 bg-gym-card p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><div><h3 id="collections-chart-heading" className="font-bold">7-day collections</h3><p className="mt-1 text-xs text-gym-muted">Membership & POS · all payment methods</p></div><WorkflowLink to="/reports">Reports</WorkflowLink></div>
    <div className="my-4 grid grid-cols-2 gap-4">{sources.map(source => <div key={source.label}><p className="text-xs text-gym-muted">{source.label}</p>{source.resource.state.status === "success" && !source.validationError ? <p className="mt-1 break-words text-xl font-bold" style={{ color: source.color }}>{formatLkr(source.total!)}</p> : source.validationError ? <div role="alert" className="mt-2 text-xs text-amber-200">{source.label} unavailable. {source.validationError} <button type="button" onClick={source.resource.retry} className="underline" aria-label={`Retry ${source.label} chart`}>Retry</button></div> : <ResourceContent<CollectionsReport | RetailDashboard> resource={source.resource} label={`${source.label} chart`}>{() => null}</ResourceContent>}</div>)}</div>
    {series.length ? <DashboardChart label="7-day collections trend" series={series} money /> : <div className="flex h-48 items-center justify-center rounded-xl bg-white/[0.02] text-sm text-gym-muted">{sources.some(source => source.resource.state.status === "loading") ? "Loading collections…" : "Collections unavailable"}</div>}
    {series.length === 1 && <p className="mt-2 text-xs text-amber-200">Showing {series[0].label.toLowerCase()} only. The other source is unavailable or loading.</p>}
  </section>;
}
