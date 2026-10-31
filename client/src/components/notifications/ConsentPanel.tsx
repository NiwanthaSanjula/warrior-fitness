import { useCallback, useRef, useState } from "react";
import { Link } from "react-router";
import { membersApi } from "../../api/members.api";
import { notificationsApi } from "../../api/notifications.api";
import type { MemberNotificationConsent } from "../../api/notifications.api";
import { getApiErrorMessage } from "../../api/api";
import { useDashboardResource } from "../../hooks/useDashboardResource";
import { DashboardPanel, EmptyQueue } from "../dashboard/DashboardWidgets";
import { formatFinancialTimestamp } from "../../utils/financial";

function Preference({ consent, busy, save }: { consent: MemberNotificationConsent; busy: boolean; save: (next: boolean, confirmed: boolean) => void }) {
  const [confirmed, setConfirmed] = useState(false);
  return <div className="space-y-4">
    <p className="break-words font-bold">{consent.memberName} · {consent.whatsappOptIn ? "Opted in" : "Not opted in"}</p>
    {consent.updatedAt && <p className="text-xs text-gym-muted">Last recorded {formatFinancialTimestamp(consent.updatedAt)} · Colombo</p>}
    {!consent.whatsappOptIn && <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 accent-orange-500" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />The member explicitly agreed to WhatsApp membership reminders.</label>}
    <div className="flex flex-wrap items-center gap-4"><button type="button" disabled={busy || (!consent.whatsappOptIn && !confirmed)} onClick={() => save(!consent.whatsappOptIn, confirmed)} className="rounded-xl border border-white/20 px-4 py-3 text-sm font-bold disabled:opacity-40">{busy ? "Saving preference…" : consent.whatsappOptIn ? "Revoke consent" : "Record confirmed opt-in"}</button><Link to={`/members/${consent.memberId}`} className="text-sm font-bold text-orange-400">Member profile</Link></div>
  </div>;
}

export default function ConsentPanel({ disabled, changed }: { disabled: boolean; changed: () => void }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const loadMembers = useCallback((signal: AbortSignal) => membersApi.getMembers({ q: search ?? "", page: 1, limit: 10, status: "all" }, signal), [search]);
  const loadConsent = useCallback((signal: AbortSignal) => notificationsApi.consent(selectedId ?? "", signal), [selectedId]);
  const members = useDashboardResource(search !== null, `members:${search}`, loadMembers);
  const consent = useDashboardResource(selectedId !== null, `consent:${selectedId}`, loadConsent);
  const locked = disabled || busy;
  async function save(next: boolean, confirmed: boolean) {
    if (inFlight.current || locked || consent.state.status !== "success") return;
    // Bind the write to the loaded response, never a mutable search input.
    const memberId = consent.state.data.memberId;
    if (memberId !== selectedId || (next && !confirmed)) return;
    if (!next && !window.confirm("Revoke this member's WhatsApp reminder consent?")) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await notificationsApi.saveConsent(memberId, next, confirmed);
      setNotice(next ? "Explicit opt-in recorded." : "Consent revoked. This member is excluded from future simulations.");
      consent.retry(); changed();
    } catch (failure) { setError(`${getApiErrorMessage(failure)} Reload consent before repeating an uncertain request.`); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section aria-label="Member WhatsApp consent" className="space-y-4 rounded-2xl border border-white/10 bg-gym-card p-5 sm:p-6">
    <h2 className="text-xl font-bold">Member WhatsApp consent</h2><p className="text-sm leading-6 text-gym-muted">Search by name, phone or member number, or enter a member record ID. Consent defaults to off; record explicit permission before opting in.</p>
    <form aria-label="Find member consent" className="flex flex-wrap gap-3" onSubmit={event => {
      event.preventDefault(); if (locked || !input.trim()) return;
      setError(""); setNotice(""); setSelectedId(null);
      if (/^[a-f\d]{24}$/i.test(input.trim())) { setSearch(null); setSelectedId(input.trim().toLowerCase()); }
      else setSearch(input.trim());
    }}><label className="min-w-0 flex-1 text-sm">Member search<input value={input} disabled={locked} maxLength={100} onChange={event => { setInput(event.target.value); setSelectedId(null); setSearch(null); setNotice(""); setError(""); }} placeholder="Name, phone, member number or record ID" className="mt-1 w-full min-w-0 rounded-xl border border-white/15 bg-gym-bg p-3 text-white" /></label><button disabled={locked || !input.trim()} className="self-end rounded-xl bg-gym-orange px-5 py-3 text-sm font-bold disabled:opacity-40">Find member</button></form>
    {error && <p role="alert" className="rounded-xl bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
    {search !== null && <DashboardPanel title="Matching members" description="First 10 matches. Refine your search if needed." resource={members}>{result => result.data.length ? <ul className="space-y-3">{result.data.map(member => <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3"><div className="min-w-0"><p className="break-words font-bold">{member.fullName}</p><p className="text-xs text-gym-muted">{member.memberId} · {member.isActive ? "Active" : "Inactive"}</p></div><button aria-label={`Manage consent for ${member.fullName}`} disabled={locked} type="button" className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-orange-300 disabled:opacity-40" onClick={() => { setSelectedId(member.id); setNotice(""); }}>Manage consent</button></li>)}</ul> : <EmptyQueue>No members match this search.</EmptyQueue>}</DashboardPanel>}
    {selectedId && <DashboardPanel title="Selected member preference" description="Opting in records consent only. It never sends a message." resource={consent}>{data => <Preference key={`${data.memberId}:${data.whatsappOptIn}:${data.updatedAt}`} consent={data} busy={locked} save={(next, confirmed) => void save(next, confirmed)} />}</DashboardPanel>}
  </section>;
}
