import { useRef, useState } from "react";
import { Link } from "react-router";
import { BellRing, RefreshCw, ShieldCheck } from "lucide-react";
import { getApiErrorMessage } from "../api/api";
import { notificationsApi } from "../api/notifications.api";
import { useAuth } from "../auth/auth-context";
import { hasPermissions } from "../auth/permissions";
import { useDashboardResource } from "../hooks/useDashboardResource";
import { DashboardPanel, EmptyQueue } from "../components/dashboard/DashboardWidgets";
import ConsentPanel from "../components/notifications/ConsentPanel";
import AutomaticSimulation from "../components/notifications/AutomaticSimulation";
import { formatGymDate } from "../utils/dashboard";
import { formatFinancialTimestamp } from "../utils/financial";

const loadOverview = (signal: AbortSignal) => notificationsApi.overview(signal);
const labels = { SEVEN_DAYS: "7 days remaining", THREE_DAYS: "3 days remaining", LAST_VALID_DAY: "Final valid day" };
export default function NotificationsPage() {
  const { staff } = useAuth();
  const allowed = staff?.role === "ADMIN" && hasPermissions(staff, "settings.manage");
  const overview = useDashboardResource(allowed, `${staff?.id}:notifications`, loadOverview);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function simulate() {
    if (inFlight.current || !allowed || overview.state.status !== "success" || !overview.state.data.due.length) return;
    if (!window.confirm("Create simulated reminder log entries? No WhatsApp messages will be sent.")) return;
    inFlight.current = true; setBusy(true); setNotice(""); setError("");
    try {
      const result = await notificationsApi.simulate();
      setNotice(`Simulated ${result.simulated} reminder(s). ${result.duplicates} already recorded; ${result.skipped} no longer eligible. No real messages sent.`);
      overview.retry();
    } catch (failure) { setError(`${getApiErrorMessage(failure)} Some entries may already be recorded. Refresh history; retrying does not duplicate the same reminder.`); overview.retry(); }
    finally { setBusy(false); inFlight.current = false; }
  }
  if (!allowed) return <p role="alert" className="rounded-xl bg-gym-card p-6 text-red-200">Admin access is required for Notification Center.</p>;
  const data = overview.state.status === "success" ? overview.state.data : null;
  const loading = overview.state.status === "loading";
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-gym-card p-5 sm:p-7"><div><p className="text-xs font-bold uppercase tracking-widest text-gym-orange">Gym Automation</p><h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">Notification Center</h1><p className="mt-2 text-sm text-gym-muted">Membership reminders for opted-in members, based on Asia/Colombo calendar dates.</p></div><button onClick={overview.retry} disabled={loading || busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold disabled:opacity-40"><RefreshCw size={16} aria-hidden="true" />Refresh notifications</button></header>
    <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 p-4 text-sm leading-6 text-orange-200"><ShieldCheck size={18} aria-hidden="true" className="mr-2 inline" />Simulation only. No WhatsApp messages are transmitted. A SIMULATED entry is a preview record, never proof of delivery. Manual and enabled automatic runs share the same duplicate protection.</div>
    {error && <p role="alert" className="rounded-xl border border-red-500/30 p-4 text-sm text-red-300">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-500/30 p-4 text-sm text-emerald-300">{notice}</p>}
    <section aria-label="Notification totals" className="grid gap-4 sm:grid-cols-3">{[
      ["Eligible today", data?.due.length], ["Simulated today", data?.simulatedToday], ["Latest history entries", data?.recent.length],
    ].map(([label, count]) => <article key={label} className="rounded-2xl border border-white/10 bg-gym-card p-5"><h2 className="text-sm text-gym-muted">{label}</h2><p className="mt-2 text-3xl font-black">{loading ? "Loading…" : count ?? "Unavailable"}</p></article>)}</section>
    <AutomaticSimulation status={data?.scheduler} loading={loading} />
    <ConsentPanel disabled={busy} changed={overview.retry} />
    <DashboardPanel title="Membership reminders" description={data ? `As of ${formatGymDate(data.asOfDate)} · Colombo. Eligibility includes reminders already simulated today; repeats are deduplicated.` : "Opted-in active members at their final purchased coverage milestone."} resource={overview} action={<button disabled={busy || !data?.due.length} onClick={() => void simulate()} className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-5 py-3 text-sm font-bold disabled:opacity-40"><BellRing size={17} aria-hidden="true" />{busy ? "Simulating…" : "Simulate due reminders"}</button>}>{result => <div className="space-y-3">{result.due.length ? result.due.map(item => <article key={item.membershipId + item.reminderType} className="rounded-xl border border-white/10 p-4"><Link to={`/members/${item.memberId}`} className="break-words font-bold text-orange-300">{item.memberName} · {item.memberReference}</Link><p className="mt-2 text-sm text-gym-muted">{item.planName} · Valid through {formatGymDate(item.lastValidDate)} · {labels[item.reminderType]}</p><p className="mt-2 break-words text-sm leading-6 text-zinc-300">{item.message}</p></article>) : <EmptyQueue>No opted-in memberships are at a reminder milestone today.</EmptyQueue>}</div>}</DashboardPanel>
    <DashboardPanel title="Simulation history" description="Latest 50 recorded simulations. Records show simulated activity only; no WhatsApp delivery occurs." resource={overview}>{result => result.recent.length ? <ol className="divide-y divide-white/10">{result.recent.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-3 py-4"><div className="min-w-0"><Link to={`/members/${item.memberId}`} className="break-words font-bold text-orange-300">{item.memberName}</Link><p className="mt-1 text-sm text-gym-muted">{labels[item.reminderType]} · Valid through {formatGymDate(item.lastValidDate)}</p><p className="mt-2 text-xs font-bold text-orange-400">SIMULATED</p><p className="mt-1 text-xs text-gym-muted">{item.trigger === "SCHEDULED" ? "Automatic simulation" : "Manual simulation"}</p></div><p className="text-xs text-gym-muted">{formatFinancialTimestamp(item.createdAt)} · Colombo</p></li>)}</ol> : <EmptyQueue>No simulated notifications yet.</EmptyQueue>}</DashboardPanel>
  </div>;
}
