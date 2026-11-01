import type { ReactNode } from "react";
import { Link } from "react-router";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import type { CommandCenter } from "../../hooks/useCommandCenter";
import type { CommandAlert } from "../../utils/command-center";
import { automationHealth, orderedAlerts } from "../../utils/command-center";
import { formatCount, formatGymDate, formatLkr } from "../../utils/dashboard";
import { formatFinancialTimestamp } from "../../utils/financial";
import { methodLabels } from "../../types/financial";
import { DashboardPanel, EmptyQueue, ResourceContent, WorkflowLink } from "./DashboardWidgets";

export function PriorityAlerts({ alerts, loading, unavailable }: { alerts: CommandAlert[]; loading: boolean; unavailable: boolean }) {
  const sorted = orderedAlerts(alerts);
  const row = (alert: CommandAlert) => <li key={alert.id} className="min-w-0"><Link to={alert.to} className="flex min-h-16 min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-gym-card px-3 py-2.5 hover:border-white/25" aria-label={`${alert.action}: ${alert.title}`} aria-describedby={`alert-detail-${alert.id}`}>
    <span className={`shrink-0 rounded-lg p-2 ${alert.priority < 2 ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300"}`}><AlertTriangle size={16} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1"><h3 className="truncate text-xs font-semibold text-zinc-100 sm:text-sm">{alert.title}</h3><p id={`alert-detail-${alert.id}`} title={alert.detail} className="mt-1 truncate text-xs text-gym-muted">{alert.detail}</p></div><ArrowUpRight size={16} className="shrink-0 text-gym-muted" aria-hidden="true" />
  </Link></li>;
  return <section aria-labelledby="priority-alerts-title" className="space-y-3">
    <div className="flex items-center justify-between gap-3"><h2 id="priority-alerts-title" className="text-sm font-semibold text-zinc-200">Needs attention</h2>{sorted.length > 0 && <span className="text-xs text-gym-muted">{sorted.length} alerts</span>}</div>
    {sorted.length ? <ol aria-label="Prioritized gym alerts" className="grid grid-cols-1 gap-2 lg:grid-cols-2">{sorted.slice(0, 4).map(row)}</ol> : <p className="rounded-xl border border-white/10 px-4 py-3 text-xs text-gym-muted">{loading ? "Checking alerts…" : unavailable ? "Alert sources unavailable. Retry the affected section." : "No priority alerts."}</p>}
    {sorted.length > 4 && <details className="text-xs text-gym-muted"><summary className="w-fit cursor-pointer rounded py-1 text-zinc-300">{sorted.length - 4} more alerts</summary><ol aria-label="Other gym alerts" className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">{sorted.slice(4).map(row)}</ol></details>}
    {sorted.length > 0 && unavailable && <p className="text-xs text-amber-200">Some data unavailable; this list may be incomplete.</p>}
  </section>;
}

function OperationPanel({ title, action, children }: { title: string; action: ReactNode; children: ReactNode }) {
  return <section aria-label={title} className="min-w-0 rounded-2xl border border-white/10 bg-gym-card p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3>{action}</div>{children}</section>;
}

export function CommandCenterPanels({ center, today }: { center: CommandCenter; today: string }) {
  return <section id="dashboard-workflows" aria-label="Connected operations" className="space-y-4">
    <h2 className="text-sm font-semibold text-zinc-200">Operations</h2>
    <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {center.canFinance && <OperationPanel title="Daily cash closing" action={<WorkflowLink to={`/cash-closing?date=${today}`}>Review day</WorkflowLink>}><ResourceContent resource={center.cash} label="Daily cash closing">{data => <>
        <p className={`w-fit rounded-md px-2 py-1 text-xs font-semibold ${data.status === "CLOSED" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>{data.status === "CLOSED" ? "Closed · stored snapshot" : "Open · live ledger"}</p>
        <p className="mt-2 text-xs text-gym-muted">{data.status === "CLOSED" ? formatFinancialTimestamp(data.closedAt!) : "Ready for reconciliation"}</p>
        {data.legacy && <p className="mt-2 text-xs text-gym-muted">Legacy membership-only closing. No POS backfill.</p>}
        <WorkflowLink to="/closing-history">Closing history</WorkflowLink>
      </>}</ResourceContent></OperationPanel>}
      {center.canEquipment && <OperationPanel title="Equipment readiness" action={<WorkflowLink to="/equipment/maintenance">Maintenance</WorkflowLink>}>
        <ResourceContent resource={center.equipment} label="Equipment readiness">{data => <><dl className="flex flex-wrap gap-x-5 gap-y-2">{[["Unavailable", data.statistics.unavailable], ["Overdue", data.statistics.overdue], ["Faults", data.statistics.openIncidents]].map(([label, count]) => <div key={label}><dt className="text-[11px] text-gym-muted">{label}</dt><dd className="mt-1 text-xl font-bold text-white">{formatCount(Number(count))}</dd></div>)}</dl><details className="mt-3 text-xs"><summary className="w-fit cursor-pointer py-1 text-zinc-300">Service queue</summary><ul className="mt-2 space-y-2">{data.queue.filter(item => item.nextServiceDate && item.nextServiceDate <= today).slice(0, 2).map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2"><span className="text-gym-muted">{item.name} · {formatGymDate(item.nextServiceDate!, true)}</span><WorkflowLink to={`/equipment/${item.id}#equipment-actions`}>Plan service</WorkflowLink></li>)}</ul>{!data.queue.some(item => item.nextServiceDate && item.nextServiceDate <= today) && <p className="mt-2 text-gym-muted">No service due or overdue.</p>}</details></>}</ResourceContent>
        <details className="mt-2 text-xs"><summary className="w-fit cursor-pointer py-1 text-zinc-300">Fault details</summary><ResourceContent resource={center.faults} label="Equipment faults">{data => data.data.length ? <ul className="mt-2 space-y-2">{data.data.slice(0, 2).map(item => <li key={item.id}><p className="text-xs text-gym-muted">{item.severity} · {item.equipmentName}</p><WorkflowLink to={`/equipment/${item.equipmentId}#equipment-history`}>Review fault</WorkflowLink></li>)}</ul> : <p className="mt-2 text-xs text-gym-muted">No unresolved equipment faults.</p>}</ResourceContent></details>
      </OperationPanel>}
      {center.canRetail && <OperationPanel title="Retail stock attention" action={<WorkflowLink to="/retail/products">Inventory</WorkflowLink>}><ResourceContent resource={center.retail} label="Retail stock attention">{data => <><dl className="flex gap-6"><div><dt className="text-[11px] text-gym-muted">Out of stock</dt><dd className="mt-1 text-xl font-bold text-amber-300">{formatCount(data.stock.outOfStockCount)}</dd></div><div><dt className="text-[11px] text-gym-muted">Low stock</dt><dd className="mt-1 text-xl font-bold text-white">{formatCount(data.stock.lowStockCount)}</dd></div></dl><ul className="mt-3 divide-y divide-white/5">{[...data.stock.outOfStock, ...data.stock.lowStock].filter((item, index, items) => items.findIndex(other => other.id === item.id) === index).slice(0, 2).map(item => <li key={item.id} className="flex items-center justify-between gap-2 py-1"><span className="truncate text-xs text-gym-muted">{item.name} · {item.stock}</span><WorkflowLink to={`/retail/products?product=${item.id}#retail-restock`}>Restock</WorkflowLink></li>)}</ul>{!data.stock.outOfStockCount && !data.stock.lowStockCount && <p className="mt-3 text-xs text-gym-muted">Stock levels healthy.</p>}</>}</ResourceContent></OperationPanel>}
      {center.canAutomation && <OperationPanel title="Reminder automation" action={<WorkflowLink to="/notifications#automation-status">Open</WorkflowLink>}><ResourceContent resource={center.automation} label="Reminder automation">{({ scheduler }) => {
        const health = automationHealth(scheduler);
        return <><p className={`text-sm font-semibold ${health.tone === "urgent" ? "text-red-300" : health.tone === "warning" ? "text-amber-200" : "text-emerald-300"}`}>{health.label}</p><p className="mt-2 text-xs text-gym-muted">Simulation only · 09:00 Colombo</p><dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs"><div><dt className="sr-only">Automatic scheduling</dt><dd className="text-zinc-300">{scheduler.enabled ? "Enabled" : "Disabled"}</dd></div><div><dt className="sr-only">Last execution</dt><dd className="text-gym-muted">{!scheduler.historyAvailable ? "Unavailable" : scheduler.lastRun ? formatFinancialTimestamp(scheduler.lastRun.startedAt) : "No execution recorded"}</dd></div></dl></>;
      }}</ResourceContent></OperationPanel>}
    </div>
    {center.canRetail && <details className="rounded-xl border border-white/10 bg-gym-card px-5 py-3"><summary className="w-fit cursor-pointer rounded text-sm font-semibold">Recent retail receipts</summary><div className="mt-4"><ResourceContent resource={center.retail} label="Recent retail receipts">{data => <SaleLinks sales={data.recent.slice(0, 3)} />}</ResourceContent></div></details>}
    {center.canOwnSales && <DashboardPanel title="Your retail sales today" resource={center.ownSales} action={<WorkflowLink to="/retail/sales">Your sales history</WorkflowLink>}>{data => <SaleLinks sales={data.data} />}</DashboardPanel>}
  </section>;
}
function SaleLinks({ sales }: { sales: { id: string; saleNumber: string; amountLkr: number; method: keyof typeof methodLabels; soldAt: string }[] }) {
  return sales.length ? <ul className="divide-y divide-white/10">{sales.map(sale => <li key={sale.id} className="flex flex-wrap items-center justify-between gap-3 py-2"><div><p className="text-xs font-semibold">{sale.saleNumber} · {formatLkr(sale.amountLkr)}</p><p className="mt-1 text-xs text-gym-muted">{methodLabels[sale.method]} · {formatFinancialTimestamp(sale.soldAt)}</p></div><WorkflowLink to={`/retail/sales/${sale.id}`}>View receipt</WorkflowLink></li>)}</ul> : <EmptyQueue>No permitted retail sales were returned for today.</EmptyQueue>;
}
