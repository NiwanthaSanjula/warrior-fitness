import { useCallback, useState } from "react";
import { RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { staffApi } from "../api/staff.api";
import { useAuth } from "../auth/auth-context";
import { hasPermissions } from "../auth/permissions";
import { useDashboardResource } from "../hooks/useDashboardResource";
import { DashboardPanel, EmptyQueue } from "../components/dashboard/DashboardWidgets";
import { CreateStaffForm, StaffEditor } from "../components/staff/StaffForms";
import { staffAuditLabels } from "../types/staff";
import type { StaffFilters, StaffPagination } from "../types/staff";
import { formatFinancialTimestamp } from "../utils/financial";

const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-gym-bg px-3 py-2.5 text-sm text-white focus:border-gym-orange focus:outline-none";
const loadCatalogue = (signal: AbortSignal) => staffApi.getCatalogue(signal);
function Pages({ data, scope, change }: { data: StaffPagination; scope: string; change: (page: number) => void }) {
  return <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-gym-muted"><p>{data.total} records · Page {data.page} of {Math.max(1, data.totalPages)}</p><div className="flex gap-2"><button type="button" aria-label={`Previous ${scope} page`} className="rounded-lg border border-white/15 px-3 py-2 text-white disabled:opacity-40" disabled={data.page <= 1} onClick={() => change(data.page - 1)}>Previous</button><button type="button" aria-label={`Next ${scope} page`} className="rounded-lg border border-white/15 px-3 py-2 text-white disabled:opacity-40" disabled={data.page >= data.totalPages} onClick={() => change(data.page + 1)}>Next</button></div></div>;
}
export default function StaffManagementPage() {
  const { staff } = useAuth();
  const allowed = staff?.role === "ADMIN" && hasPermissions(staff, "staff.manage");
  const [draft, setDraft] = useState({ search: "", role: "", status: "" });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const loadDirectory = useCallback((signal: AbortSignal) => {
    const params: StaffFilters = { search: filters.search, role: filters.role ? filters.role as StaffFilters["role"] : undefined, status: filters.status ? filters.status as StaffFilters["status"] : undefined, page, limit: 10 };
    return staffApi.getStaff(params, signal);
  }, [filters, page]);
  const loadDetail = useCallback((signal: AbortSignal) => staffApi.getById(selectedId ?? "", signal), [selectedId]);
  const loadAudit = useCallback((signal: AbortSignal) => staffApi.getAudit({ targetId: selectedId ?? undefined, page: auditPage, limit: 10 }, signal), [selectedId, auditPage]);
  const directory = useDashboardResource(allowed, `${staff?.id}:${JSON.stringify(filters)}:${page}:${version}`, loadDirectory);
  const catalogue = useDashboardResource(allowed, `${staff?.id}:catalogue`, loadCatalogue);
  const detail = useDashboardResource(allowed && selectedId !== null && !creating, `${staff?.id}:${selectedId}:${version}`, loadDetail);
  const audit = useDashboardResource(allowed, `${staff?.id}:${selectedId}:${auditPage}:${version}`, loadAudit);
  function changed(message: string) { setNotice(message); setAuditPage(1); setVersion((value) => value + 1); }
  if (!allowed) return <p role="alert" className="rounded-xl border border-red-500/20 bg-gym-card p-6 text-red-200">Admin access is required for Staff Management.</p>;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-5 rounded-2xl border border-white/10 border-t-orange-500/50 bg-gym-card p-5 sm:p-7">
      <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-orange-400"><ShieldCheck aria-hidden="true" size={16} /> People & access</p><h1 className="mt-3 text-2xl font-black text-white sm:text-3xl">Staff Management</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gym-muted">Manage staff accounts, front-desk permissions and session security. Every applied change is recorded in staff audit history.</p></div>
      <div className="flex flex-wrap gap-3"><button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-bold" onClick={() => setVersion((value) => value + 1)}><RefreshCw aria-hidden="true" size={16} />Refresh staff</button><button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gym-orange px-4 text-sm font-bold text-white hover:bg-orange-600" onClick={() => { setCreating(true); setSelectedId(null); setAuditPage(1); setNotice(""); }}><UserPlus aria-hidden="true" size={17} />Create Receptionist</button></div>
    </header>
    {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <form aria-label="Staff directory filters" onSubmit={(event) => { event.preventDefault(); setFilters(draft); setPage(1); setVersion((value) => value + 1); }} className="grid gap-3 rounded-2xl border border-white/10 bg-gym-card p-5 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Search staff<input type="search" className={inputClass} maxLength={100} placeholder="Search name or email" value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} /></label>
          <label className="text-sm">Role<select className={inputClass} value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })}><option value="">All roles</option><option value="ADMIN">Admin</option><option value="RECEPTIONIST">Receptionist</option></select></label>
          <label className="text-sm">Account status<select className={inputClass} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">All accounts</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <div><button className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-bold hover:bg-white/5">Apply staff filters</button></div>
        </form>
        <DashboardPanel title="Staff directory" description="Admins retain full access. Receptionist access can be customized individually." resource={directory}>{(result) => <>
          {result.data.length === 0 ? <EmptyQueue>No staff match these filters.</EmptyQueue> : <ul className="space-y-3">{result.data.map((person) => <li key={person.id} className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 ${selectedId === person.id ? "border-orange-500/50 bg-gym-orange/5" : "border-white/10 bg-white/2"}`}>
            <div className="min-w-0 flex-1"><p className="break-words font-bold text-white">{person.fullName}{person.id === staff?.id && <span className="ml-2 text-xs text-orange-400">You</span>}</p><p className="mt-1 break-all text-xs text-gym-muted">{person.email}</p><div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold"><span className="rounded-full bg-white/5 px-2 py-1 text-zinc-300">{person.role === "ADMIN" ? "Admin" : "Receptionist"}</span><span className={`rounded-full px-2 py-1 ${person.isActive ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{person.isActive ? "Active" : "Inactive"}</span>{person.role === "RECEPTIONIST" && <span className="rounded-full bg-white/5 px-2 py-1 text-zinc-400">{person.permissionMode === "DEFAULT" ? "Default permissions" : "Custom permissions"}</span>}</div></div>
            <button aria-label={`Manage ${person.fullName}`} aria-pressed={selectedId === person.id} className="rounded-lg border border-white/15 px-3 py-2.5 text-xs font-bold text-orange-300 hover:border-orange-500/50" onClick={() => { setSelectedId(person.id); setCreating(false); setAuditPage(1); setNotice(""); }}>Manage</button>
          </li>)}</ul>}
          <Pages data={result.pagination} scope="staff" change={setPage} />
        </>}</DashboardPanel>
      </div>
      <div className="space-y-5">
        {creating ? <CreateStaffForm cancel={() => setCreating(false)} created={(person) => { setCreating(false); setSelectedId(person.id); changed("Receptionist created with default permissions. Share the initial password securely."); }} /> : selectedId ? <DashboardPanel title="Selected staff account" description="Changes require confirmation and use the latest account version." resource={detail}>{(result) => <StaffEditor key={`${result.staff.id}:${result.staff.version}`} target={result.staff} catalogue={catalogue} changed={changed} />}</DashboardPanel> : <section className="rounded-2xl border border-dashed border-white/15 bg-gym-card p-8 text-center"><ShieldCheck aria-hidden="true" className="mx-auto text-gym-orange" size={32} /><h2 className="mt-4 text-lg font-bold">Choose a staff account</h2><p className="mt-2 text-sm leading-6 text-gym-muted">Select Manage to edit a profile, review permissions or reset a password. Admin roles and activation are protected.</p></section>}
      </div>
    </div>
    <DashboardPanel title={selectedId ? "Selected staff audit history" : "Recent staff activity"} description="Successful committed changes only. Passwords, hashes, credentials and request bodies are never recorded." resource={audit} action={selectedId ? <button className="text-xs font-bold text-orange-400" onClick={() => { setSelectedId(null); setAuditPage(1); }}>Show all staff activity</button> : undefined}>{(result) => <>
      {result.data.length === 0 ? <EmptyQueue>No staff activity has been recorded{selectedId ? " for this account" : ""}.</EmptyQueue> : <ol className="divide-y divide-white/10">{result.data.map((record) => <li key={record.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0"><div className="min-w-0"><p className="font-bold text-white">{staffAuditLabels[record.action]}</p><p className="mt-1 break-words text-sm text-gym-muted">{record.actorName} · Account: {record.targetName}</p></div><time dateTime={record.recordedAt} className="text-xs text-gym-muted">{formatFinancialTimestamp(record.recordedAt)} · Colombo</time></li>)}</ol>}
      <Pages data={result.pagination} scope="audit" change={setAuditPage} />
    </>}</DashboardPanel>
  </div>;
}
