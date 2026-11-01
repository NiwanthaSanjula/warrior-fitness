import { useWorkflowAnchor } from "../hooks/useWorkflowAnchor";
import { useCallback, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { equipmentApi } from "../api/equipment.api";
import { useAuth } from "../auth/auth-context";
import { canMutate, hasPermissions } from "../auth/permissions";
import { useDashboardResource } from "../hooks/useDashboardResource";
import { DashboardPanel, EmptyQueue } from "../components/dashboard/DashboardWidgets";
import { AvailabilityForm, EquipmentForm, FaultForm, WorkOrderForm } from "../components/equipment/EquipmentForms";
import { IncidentCard, WorkCard } from "../components/equipment/MaintenanceCards";
import EquipmentQr from "../components/equipment/EquipmentQr";
import { EquipmentBadge, EquipmentPages, equipmentSecondary } from "../components/equipment/EquipmentUI";
import { equipmentCategories, type EquipmentDowntime, type EquipmentEvent, type EquipmentHistory, type EquipmentIncident, type EquipmentWork } from "../types/equipment";
import { formatGymDate, formatLkr } from "../utils/dashboard";
import { formatFinancialTimestamp } from "../utils/financial";

export default function EquipmentDetailPage() {
  const { id = "" } = useParams(), { staff } = useAuth();
  const allowed = hasPermissions(staff, "equipment.read"), validId = /^[a-f\d]{24}$/i.test(id);
  const manage = staff?.role === "ADMIN" && hasPermissions(staff, "equipment.manage"), report = hasPermissions(staff, "equipment.read", "equipment.report");
  const [revision, setRevision] = useState(0), [page, setPage] = useState(1), [kind, setKind] = useState<keyof EquipmentHistory>("incidents");
  const [action, setAction] = useState<"report" | "edit" | "status" | "work" | null>(null), [incidentId, setIncidentId] = useState<string | null>(null), [notice, setNotice] = useState("");
  const load = useCallback((signal: AbortSignal) => equipmentApi.get(id, signal), [id]);
  const loadHistory = useCallback((signal: AbortSignal) => equipmentApi.history(id, kind, page, signal), [id, kind, page]);
  const detail = useDashboardResource(allowed && validId, `${staff?.id}:${id}:${revision}`, load);
  const history = useDashboardResource(allowed && validId && (manage || kind !== "events"), `${staff?.id}:${id}:${kind}:${page}:${revision}`, loadHistory);
  useWorkflowAnchor(detail.state.status === "success", ["equipment-actions", "equipment-history"]);
  function done() { setAction(null); setNotice("Equipment operation recorded. History and availability have been refreshed."); setRevision(value => value + 1); }
  if (!allowed || !validId) return <p role="alert">{!allowed ? "Equipment viewing permission is required." : "Invalid equipment link."}</p>;
  const item = detail.state.status === "success" ? detail.state.data.equipment : null;
  const tabs = { incidents: "Breakdown history", "work-orders": "Maintenance history", downtime: "Downtime history", ...(manage ? { events: "Activity history" } : {}) };
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link className="inline-flex items-center gap-2 text-sm font-bold text-orange-400" to="/equipment"><ArrowLeft size={16} />Equipment inventory</Link><button className={equipmentSecondary} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} />Refresh asset</button></div>
    {notice && <p role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</p>}
    <DashboardPanel title="Equipment profile" description="Operational details are shared with permitted staff. Financial values and maintenance administration remain Admin-only." resource={detail}>{result => <><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold tracking-widest text-orange-400">{result.equipment.assetId}</p><h1 className="mt-2 break-words text-3xl font-black">{result.equipment.name}</h1><p className="mt-3 text-sm text-gym-muted">{result.equipment.location} · {equipmentCategories[result.equipment.category]}</p></div><EquipmentBadge status={result.equipment.status} /></div>
      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">{[["Brand / model", `${result.equipment.brand || "Not recorded"} / ${result.equipment.model || "Not recorded"}`], ["Serial number", result.equipment.serialNumber || "Not recorded"], ["Purchased", result.equipment.purchaseDate ? formatGymDate(result.equipment.purchaseDate) : "Not recorded"], ["Warranty expiry", result.equipment.warrantyExpiry ? formatGymDate(result.equipment.warrantyExpiry) : "Not recorded"], ["Next service", result.equipment.nextServiceDate ? formatGymDate(result.equipment.nextServiceDate) : "Not scheduled"], ["Preventive interval", result.equipment.intervalDays ? `Every ${result.equipment.intervalDays} days` : "Not recurring"]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 p-4"><dt className="text-xs text-gym-muted">{label}</dt><dd className="mt-2 break-words font-bold">{value}</dd></div>)}{manage && <div className="rounded-xl border border-white/10 p-4"><dt className="text-xs text-gym-muted">Purchase price · inventory metadata</dt><dd className="mt-2 font-bold">{result.equipment.purchasePriceLkr == null ? "Not recorded" : formatLkr(result.equipment.purchasePriceLkr)}</dd></div>}</dl>
      <div id="equipment-actions" tabIndex={-1} className="mt-6 flex scroll-mt-28 flex-wrap gap-3">{report && result.equipment.status !== "RETIRED" && <button className={equipmentSecondary} onClick={() => { setAction(action === "report" ? null : "report"); setNotice(""); }}>Report a fault</button>}{manage && canMutate(staff) && <><button className={equipmentSecondary} onClick={() => { setAction(action === "edit" ? null : "edit"); setNotice(""); }}>Edit inventory</button>{result.equipment.status !== "RETIRED" && <><button className={equipmentSecondary} onClick={() => { setAction(action === "status" ? null : "status"); setNotice(""); }}>Change availability</button><button className={equipmentSecondary} onClick={() => { setAction(action === "work" ? null : "work"); setIncidentId(null); setNotice(""); }}>Create maintenance work</button></>}</>}</div>
    </>}</DashboardPanel>
    {item && <div className={`grid items-start gap-5 ${manage ? "xl:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}><div className="space-y-5">
      {canMutate(staff) && action && <section className="rounded-2xl border border-orange-500/25 bg-gym-card p-5 sm:p-6"><h2 className="mb-5 text-xl font-bold">{action === "report" ? "Report equipment problem" : action === "edit" ? "Edit inventory & service schedule" : action === "status" ? "Review equipment availability" : "Plan maintenance work"}</h2>{action === "report" && report && <FaultForm item={item} done={done} />}{action === "edit" && manage && <EquipmentForm item={item} saved={done} />}{action === "status" && manage && <AvailabilityForm item={item} done={done} />}{action === "work" && manage && <WorkOrderForm item={item} incidentId={incidentId} done={done} />}</section>}
      <div id="equipment-history" tabIndex={-1} className="flex scroll-mt-28 flex-wrap gap-2" aria-label="Equipment history sections">{Object.entries(tabs).map(([key, label]) => <button key={key} aria-pressed={kind === key} className={`${equipmentSecondary} ${kind === key ? "border-orange-500/60 text-orange-300" : ""}`} onClick={() => { setKind(key as keyof EquipmentHistory); setPage(1); }}>{label}</button>)}</div>
      <DashboardPanel title={tabs[kind] ?? "Equipment history"} description="All records are preserved and available through pagination." resource={history}>{result => <div className="space-y-4">
        {result.data.length === 0 && <EmptyQueue>No records in this history yet.</EmptyQueue>}
        {kind === "incidents" && (result.data as EquipmentIncident[]).map(incident => <IncidentCard key={incident.id} incident={incident} item={item} manage={manage && canMutate(staff)} done={done} createWork={id => { setIncidentId(id); setAction("work"); }} />)}
        {kind === "work-orders" && (result.data as EquipmentWork[]).map(work => <WorkCard key={work.id} work={work} item={item} manage={manage && canMutate(staff)} done={done} />)}
        {kind === "downtime" && (result.data as EquipmentDowntime[]).map(record => <article key={record.id} className="space-y-2 rounded-xl border border-white/10 p-4 text-sm"><p className="font-bold">{record.isOpen ? "Ongoing downtime" : "Completed downtime period"} · {record.durationMinutes.toLocaleString()} minutes</p><p className="text-xs text-gym-muted">{formatFinancialTimestamp(record.startedAt)} → {record.endedAt ? formatFinancialTimestamp(record.endedAt) : "Still unavailable"} · Colombo</p><p className="break-words">{record.reason}</p><p className="text-xs text-gym-muted">Recorded by {record.recordedByName}</p></article>)}
        {kind === "events" && manage && (result.data as EquipmentEvent[]).map(record => <article key={record.id} className="space-y-2 rounded-xl border border-white/10 p-4 text-sm"><p className="font-bold">{record.action.replaceAll("_", " ")}</p><p className="break-words text-gym-muted">{record.notes}</p><p className="text-xs text-gym-muted">{record.actorName} · {formatFinancialTimestamp(record.recordedAt)} · Colombo</p></article>)}
        <EquipmentPages data={result.pagination} label="history" change={setPage} />
      </div>}</DashboardPanel>
    </div>{manage && <EquipmentQr item={item} />}</div>}
  </div>;
}
