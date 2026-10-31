import { useCallback, useEffect, useState } from "react";
import { BellRing, RefreshCw, ShieldCheck } from "lucide-react";
import { getApiErrorMessage } from "../api/api";
import { notificationsApi, type NotificationOverview } from "../api/notifications.api";

export default function NotificationsPage() {
  const [data, setData] = useState<NotificationOverview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [consent, setConsent] = useState<{ memberName: string; whatsappOptIn: boolean } | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await notificationsApi.overview()); }
    catch (e) { setError(getApiErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function simulate() {
    if (!window.confirm("Create simulated reminder log entries? No WhatsApp messages will be sent.")) return;
    setBusy(true); setNotice(""); setError("");
    try {
      const result = await notificationsApi.simulate();
      setNotice(`Simulated ${result.simulated} reminder(s). ${result.duplicates} previously recorded. Real messages sent: 0.`);
      await refresh();
    } catch (e) { setError(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  }
  async function lookup() {
    setBusy(true); setError(""); setConsent(null);
    try { setConsent(await notificationsApi.consent(memberId.trim())); }
    catch (e) { setError(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  }
  async function saveConsent(next: boolean) {
    if (!consent) return;
    setBusy(true); setError("");
    try {
      await notificationsApi.saveConsent(memberId.trim(), next);
      setConsent({ ...consent, whatsappOptIn: next });
      setNotice("Consent preference saved. Confirm member permission before enabling.");
      await refresh();
    } catch (e) { setError(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-widest text-gym-orange">Gym Automation</p>
      <h1 className="mt-2 text-3xl font-black uppercase italic text-white">Notification Center</h1>
      <p className="mt-2 text-sm text-gym-muted">Membership expiry reminders — simulation only. No real WhatsApp messages are sent.</p></div>
      <button onClick={() => void refresh()} disabled={loading || busy} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><RefreshCw size={16} className="mr-2 inline"/>Refresh</button>
    </header>
    <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 p-4 text-sm text-orange-200"><ShieldCheck size={18} className="mr-2 inline"/>Simulation mode: delivery credentials are not configured, messages are never transmitted, and a log entry means simulated—not delivered.</div>
    {error && <p role="alert" className="rounded-xl border border-red-500/30 p-4 text-red-300">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-green-500/30 p-4 text-green-300">{notice}</p>}
    <section className="grid gap-4 sm:grid-cols-3">
      {[["Due today", data?.due.length], ["Simulated today", data?.simulatedToday], ["Recent log entries", data?.recent.length]].map(([label, count]) => <div key={label} className="rounded-2xl border border-white/10 bg-gym-card p-5"><p className="text-sm text-gym-muted">{label}</p><p className="mt-2 text-3xl font-black">{loading ? "..." : count ?? "—"}</p></div>)}
    </section>
    <section className="rounded-2xl border border-white/10 bg-gym-card p-5">
      <h2 className="text-xl font-bold">Member WhatsApp Consent</h2>
      <p className="mt-2 text-sm text-gym-muted">Use the internal member record ID. Only enable after the member explicitly opts in to WhatsApp reminders.</p>
      <div className="mt-4 flex flex-wrap gap-2"><input aria-label="Member record ID" value={memberId} onChange={e => { setMemberId(e.target.value); setConsent(null); }} placeholder="24-character member record ID" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-gym-bg p-3 text-white"/><button onClick={() => void lookup()} disabled={busy || !/^[a-f\d]{24}$/i.test(memberId.trim())} className="rounded-xl bg-gym-orange px-5 py-3 font-bold disabled:opacity-40">Load consent</button></div>
      {consent && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4"><span>{consent.memberName} — {consent.whatsappOptIn ? "Opted in" : "Not opted in"}</span><button disabled={busy} onClick={() => void saveConsent(!consent.whatsappOptIn)} className="rounded-xl border border-white/20 px-4 py-2 font-semibold disabled:opacity-40">{consent.whatsappOptIn ? "Revoke consent" : "Record confirmed opt-in"}</button></div>}
    </section>
    <section className="rounded-2xl border border-white/10 bg-gym-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Due membership reminders</h2><p className="mt-2 text-sm text-gym-muted">7 days, 3 days and final valid day. Only active members with recorded consent.</p></div><button disabled={busy || loading || !data?.due.length} onClick={() => void simulate()} className="rounded-xl bg-gym-orange px-5 py-3 text-sm font-bold disabled:opacity-40"><BellRing size={17} className="mr-2 inline"/>Simulate due reminders</button></div>
      <div className="mt-4 space-y-3">{data?.due.map(item => <article key={item.membershipId + item.reminderType} className="rounded-xl border border-white/10 p-4"><p className="font-bold">{item.memberName} · {item.memberReference}</p><p className="mt-1 text-sm text-gym-muted">{item.planName} · Valid through {item.lastValidDate} · {item.reminderType.replaceAll("_", " ")}</p><p className="mt-2 text-sm text-zinc-300">{item.message}</p></article>)}{!loading && data?.due.length === 0 && <p className="py-6 text-center text-gym-muted">No opted-in memberships are at a reminder milestone today.</p>}</div>
    </section>
    <section className="rounded-2xl border border-white/10 bg-gym-card p-5"><h2 className="text-xl font-bold">Simulation history</h2><div className="mt-4 space-y-2">{data?.recent.map(item => <div key={item._id} className="flex flex-wrap justify-between gap-2 border-b border-white/10 py-3 text-sm"><span>{item.memberName} — {item.reminderType.replaceAll("_", " ")}</span><span className="text-gym-muted">{item.scheduledDate} · SIMULATED</span></div>)}{!loading && data?.recent.length === 0 && <p className="py-6 text-center text-gym-muted">No simulated notifications yet.</p>}</div></section>
  </div>;
}
