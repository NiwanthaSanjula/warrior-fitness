import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowRight, Check, LogIn, RefreshCw, Search, UserRound } from "lucide-react";
import { useAuth, type AuthStaff } from "../auth/auth-context";
import { canUseFrontDesk, hasPermissions } from "../auth/permissions";
import { attendanceApi } from "../api/attendance.api";
import { getApiErrorMessage } from "../api/api";
import { useFrontDeskSearch } from "../hooks/useFrontDeskSearch";
import { useFrontDeskMember } from "../hooks/useFrontDeskMember";
import type { DashboardResource } from "../hooks/useDashboardResource";
import type { AttendanceRecord } from "../types/attendance";
import type { DeskMember } from "../utils/front-desk";
import { formatGymDate, formatLkr, todayInColombo } from "../utils/dashboard";
import { formatFinancialTimestamp } from "../utils/financial";

const actionClass = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white transition hover:border-gym-orange hover:bg-gym-orange/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gym-orange";

function ResourceError<T>({ resource, label }: { resource: DashboardResource<T>; label: string }) {
  if (resource.state.status !== "error") return null;
  return <div className="text-sm text-red-300" role="alert">{label} unavailable. {resource.state.message} <button type="button" onClick={resource.retry} className="ml-1 rounded font-bold underline focus-visible:outline-2" aria-label={`Retry ${label.toLowerCase()}`}>Retry</button></div>;
}

export default function FrontDeskPage() {
  const { staff } = useAuth();
  if (!staff || !canUseFrontDesk(staff)) return <p role="alert">Front Desk access is not permitted.</p>;
  // Discard private results and pending callbacks immediately on account/grant changes.
  return <FrontDeskWorkspace key={`${staff.id}:${staff.role}:${staff.permissions.join(",")}`} staff={staff} />;
}

function FrontDeskWorkspace({ staff }: { staff: AuthStaff }) {
  const [params, setParams] = useSearchParams();
  const rawId = params.get("member") ?? "";
  const [hint, setHint] = useState<DeskMember | null>(null);
  const canReadProfile = hasPermissions(staff, "members.read");
  const memberId = canReadProfile ? (/^[a-f\d]{24}$/i.test(rawId) ? rawId : "") : hint?.id ?? "";
  const [revision, setRevision] = useState(0);
  const [checkIn, setCheckIn] = useState<{ memberId: string; pending: boolean; message?: string; error?: boolean; record?: AttendanceRecord } | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const interaction = useRef(0);
  const focusAction = useRef(false);
  const actions = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const details = useFrontDeskMember(memberId, staff, revision);
  const { profile, membership, history, balance } = details;
  const search = useFrontDeskSearch(selectMember, !canReadProfile);
  const today = todayInColombo();
  const member = profile.state.status === "success" ? profile.state.data : hint?.id === memberId ? hint : null;
  const summary = membership.state.status === "success" ? membership.state.data : null;
  const currentCheckIn = checkIn?.memberId === memberId ? checkIn : null;
  const recorded = currentCheckIn?.record;
  const historicalVisit = history.state.status === "success" ? history.state.data : null;
  const lastVisit = recorded && (!historicalVisit || recorded.checkedInAt >= historicalVisit.checkedInAt) ? recorded : historicalVisit;
  const checkedInToday = lastVisit?.attendanceDate === today;
  const current = summary?.currentMembership;
  const validCoverage = summary?.status === "ACTIVE" && !!current && current.startDate <= today && today < current.endDateExclusive && summary.memberProfileActive;
  const membershipReady = membership.state.status === "disabled" || membership.state.status === "success";
  const profileReady = profile.state.status === "success" || (profile.state.status === "disabled" && !!hint);
  const canCheckIn = hasPermissions(staff, "attendance.check-in");
  const canRenew = !!summary && hasPermissions(staff, "members.read", "memberships.read", "plans.read", summary.totalPeriods ? "memberships.renew" : "memberships.enroll");
  const disabled = checkIn?.pending || !!search.term || !profileReady || !member?.isActive || !membershipReady || (!!summary && !validCoverage) || checkedInToday;

  function selectMember(value: DeskMember) {
    interaction.current++;
    focusAction.current = true;
    setHint(value);
    setRevision(current => current + 1);
    search.change("");
    if (canReadProfile) setParams({ member: value.id }, { replace: true });
  }
  function newSearch() {
    interaction.current++;
    focusAction.current = false;
    search.change("");
    searchInput.current?.focus();
  }
  function changeQuery(value: string) {
    interaction.current++;
    focusAction.current = false;
    search.change(value);
  }
  useEffect(() => {
    mounted.current = true;
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("focus", refresh);
    return () => { mounted.current = false; window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => {
    if (!focusAction.current || !profileReady || !membershipReady || checkIn?.pending) return;
    const first = actions.current?.querySelector<HTMLElement>("button:not(:disabled), a");
    if (first) { first.focus(); focusAction.current = false; }
  }, [profileReady, membershipReady, checkIn?.pending, memberId]);
  useEffect(() => {
    if (search.state.status !== "success" || search.highlight < 0) return;
    const result = search.state.members[search.highlight];
    if (result) document.getElementById(`desk-result-${result.id}`)?.scrollIntoView?.({ block: "nearest" });
  }, [search.state, search.highlight]);

  async function submitCheckIn() {
    if (disabled || busy.current || !member) return;
    busy.current = true;
    const selected = memberId, atInteraction = interaction.current;
    focusAction.current = false;
    setCheckIn({ memberId: selected, pending: true });
    try {
      const response = await attendanceApi.checkIn(selected);
      if (!mounted.current) return;
      setCheckIn({ memberId: selected, pending: false, message: response.alreadyCheckedIn ? "Already checked in today." : "Check-in recorded.", record: response.data });
      if (interaction.current === atInteraction) searchInput.current?.focus();
    } catch (error) {
      if (mounted.current) setCheckIn({ memberId: selected, pending: false, error: true, message: getApiErrorMessage(error) });
    } finally { busy.current = false; }
  }

  return <div className="mx-auto max-w-6xl space-y-6" onKeyDown={event => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "m") { event.preventDefault(); newSearch(); }
  }}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Front Desk</h1>
      <span className="text-sm text-gym-muted">{formatGymDate(today)} · Colombo</span>
    </header>

    <section aria-label="Member search" className="rounded-2xl border border-white/10 bg-gym-card p-4 sm:p-5">
      <form onSubmit={event => { event.preventDefault(); search.submit(); }}>
        <label htmlFor="front-desk-search" className="mb-2 block text-sm font-bold text-white">Find a member</label>
        <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-gym-bg px-3 focus-within:border-gym-orange focus-within:ring-1 focus-within:ring-gym-orange">
          <Search size={22} className="shrink-0 text-gym-orange" aria-hidden="true" />
          <input id="front-desk-search" ref={searchInput} autoFocus autoComplete="off" maxLength={canReadProfile ? 100 : 80}
            role="combobox" aria-autocomplete="list" aria-controls="front-desk-results" aria-expanded={!!search.term && search.state.status === "success" && search.state.members.length > 0}
            aria-activedescendant={search.highlight >= 0 && search.state.status === "success" && search.state.members[search.highlight] ? `desk-result-${search.state.members[search.highlight].id}` : undefined}
            aria-describedby="front-desk-search-help" placeholder="Name, phone or member reference" value={search.query}
            onChange={event => changeQuery(event.target.value)} onKeyDown={event => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); search.move(event.key === "ArrowDown" ? 1 : -1); }
              if (event.key === "Escape") { event.preventDefault(); newSearch(); }
              if (event.key === "Enter" && event.repeat) event.preventDefault();
            }} style={{ outline: "none" }} className="min-w-0 flex-1 bg-transparent py-4 text-base text-white placeholder:text-gym-muted" />
          <button type="submit" aria-label="Search members" className="rounded-lg bg-gym-orange p-2.5 text-white transition hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><ArrowRight size={20} aria-hidden="true" /></button>
        </div>
        <p id="front-desk-search-help" className="sr-only">Type 2 or more characters. Up and down arrows choose a result; Enter opens it. Alt+M starts a new search.</p>
      </form>
    </section>

    <div className={`grid items-start gap-5 ${search.term ? "lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.6fr)]" : ""}`}>
      {search.term && <section aria-label="Search results" className="min-w-0 rounded-2xl border border-white/10 bg-gym-card p-4">
        {search.state.status === "idle" && <p className="text-sm text-gym-muted">Enter at least 2 characters.</p>}
        {search.state.status === "loading" && <p role="status" className="animate-pulse text-sm text-gym-muted">Searching members…</p>}
        {search.state.status === "error" && <div role="alert" className="text-sm text-red-300">{search.state.message} <button type="button" onClick={search.retry} className="font-bold underline">Retry search</button></div>}
        {search.state.status === "success" && <>
          <p role="status" className="mb-3 text-xs text-gym-muted">{search.state.total === 0 ? "No members found." : `${search.state.total} matching member${search.state.total === 1 ? "" : "s"}${search.state.total > 8 ? " · Showing 8, narrow your search" : ""}`}</p>
          <ul id="front-desk-results" role="listbox" aria-label="Matching members" className="max-h-96 space-y-2 overflow-y-auto">
            {search.state.members.map((result, index) => <li key={result.id} role="presentation">
              <button type="button" role="option" aria-selected={index === search.highlight} id={`desk-result-${result.id}`} tabIndex={-1}
                onMouseDown={event => event.preventDefault()} onClick={() => selectMember(result)} onMouseEnter={() => search.setHighlight(index)}
                className={`w-full rounded-xl border p-3 text-left ${index === search.highlight ? "border-gym-orange bg-gym-orange/10" : "border-white/10 hover:border-white/30"}`}>
                <span className="block font-bold text-white">{result.fullName}</span><span className="mt-1 block text-xs text-gym-muted">{result.memberId} · {result.phone}</span>
                {!result.isActive && <span className="mt-1 block text-xs text-red-300">Inactive profile</span>}
              </button>
            </li>)}
          </ul>
        </>}
      </section>}

      <section aria-label="Selected member" aria-busy={!!memberId && profile.state.status === "loading"} className="min-w-0 rounded-2xl border border-white/10 bg-gym-card p-5 sm:p-6">
        {!memberId ? <div className="py-12 text-center"><UserRound size={36} className="mx-auto text-gym-orange" aria-hidden="true" /><h3 className="mt-4 text-lg font-bold text-white">Ready for the next member</h3><p className="mt-2 text-sm text-gym-muted">Search above to check in or open their account.</p>{rawId && <p role="alert" className="mt-3 text-sm text-red-300">Invalid member reference in this link.</p>}</div> : <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>{member ? <><p className="text-sm font-semibold text-gym-orange">{member.memberId}</p><h3 className="mt-1 break-words text-2xl font-black text-white">{member.fullName}</h3><p className="mt-2 text-sm text-gym-muted">{member.isActive ? "Active profile" : "Inactive profile"}</p></> : <p role="status" className="text-gym-muted">{profile.state.status === "loading" ? "Loading member…" : "Member unavailable"}</p>}</div>
            <div className="flex gap-2"><button type="button" onClick={() => setRevision(value => value + 1)} disabled={!!checkIn?.pending} aria-label="Refresh member" className="rounded-lg border border-white/15 p-2.5 text-gym-muted hover:text-white disabled:opacity-40"><RefreshCw size={18} /></button><button type="button" onClick={newSearch} className="rounded-lg border border-white/15 px-3 text-sm font-semibold text-white hover:border-gym-orange">New search</button></div>
          </div>
          <div className="mt-4"><ResourceError resource={profile} label="Profile" /></div>
          <dl className="mt-5 grid grid-cols-1 gap-5 border-y border-white/10 py-5 sm:grid-cols-2">
            {membership.state.status !== "disabled" && <div><dt className="text-xs font-semibold uppercase tracking-wide text-gym-muted">Membership</dt><dd className="mt-1 text-sm text-white">
              {summary ? <><strong className={validCoverage ? "text-emerald-400" : "text-amber-300"}>{summary.status === "NOT_ENROLLED" ? "Not enrolled" : summary.status === "ACTIVE" ? "Active membership" : summary.status === "EXPIRED" ? "Expired membership" : "Upcoming membership"}</strong><span className="mt-1 block text-gym-muted">{(summary.currentMembership ?? summary.latestMembership)?.planSnapshot.name}</span></> : membership.state.status === "loading" ? "Loading membership…" : null}
              <ResourceError resource={membership} label="Membership" />
            </dd></div>}
            {membership.state.status !== "disabled" && <div><dt className="text-xs font-semibold uppercase tracking-wide text-gym-muted">Membership expiry</dt><dd className="mt-1 text-sm text-white">{summary ? summary.latestMembership ? <><span>{formatGymDate(summary.latestMembership.lastValidDate)}</span><span className="mt-1 block text-xs text-gym-muted">Last valid day{summary.nextMembership ? ` · Renewal starts ${formatGymDate(summary.nextMembership.startDate)}` : ""}</span></> : "No membership recorded" : membership.state.status === "loading" ? "Loading…" : "Unavailable"}</dd></div>}
            {history.state.status !== "disabled" && <div><dt className="text-xs font-semibold uppercase tracking-wide text-gym-muted">Last check-in</dt><dd className="mt-1 text-sm text-white">{lastVisit ? <>{formatFinancialTimestamp(lastVisit.checkedInAt)}{checkedInToday && <span className="mt-1 block text-xs text-emerald-400">Checked in today</span>}</> : history.state.status === "loading" ? "Loading attendance…" : history.state.status === "success" ? "No previous check-ins" : null}<ResourceError resource={history} label="Attendance" /></dd></div>}
            {balance.state.status !== "disabled" && <div><dt className="text-xs font-semibold uppercase tracking-wide text-gym-muted">Outstanding balance</dt><dd className="mt-1 text-lg font-bold text-white">{balance.state.status === "success" ? formatLkr(balance.state.data.outstandingLkr) : balance.state.status === "loading" ? <span className="text-sm font-normal">Loading balance…</span> : null}<ResourceError resource={balance} label="Balance" /></dd></div>}
          </dl>

          {currentCheckIn?.message && <p role={currentCheckIn.error ? "alert" : "status"} className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${currentCheckIn.error ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>{currentCheckIn.message}</p>}
          {member && !member.isActive && <p className="mt-4 text-sm text-amber-300">Activate this member’s profile before check-in.</p>}
          {member?.isActive && summary && !validCoverage && <p className="mt-4 text-sm text-amber-300">{summary.status === "UPCOMING" ? "Membership has not started yet." : "A valid membership is required for check-in."}</p>}
          <div ref={actions} aria-label="Member actions" className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {canCheckIn && <button type="button" onClick={() => void submitCheckIn()} disabled={!!disabled} title="The server checks membership eligibility. Outstanding balances do not automatically block entry." className={`${actionClass} border-gym-orange bg-gym-orange hover:bg-orange-600 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-gym-muted`}><LogIn size={18} aria-hidden="true" />{currentCheckIn?.pending ? "Checking in…" : checkedInToday ? <><Check size={18} aria-hidden="true" />Checked in today</> : "Check In"}</button>}
            {canRenew && member?.isActive && <Link className={actionClass} to={`/members/${memberId}/membership`}>{summary!.totalPeriods ? "Renew Membership" : "Enroll Membership"}</Link>}
            {balance.state.status === "success" && balance.state.data.reviewInvoice && <Link className={actionClass} to={`/payments/invoices/${balance.state.data.reviewInvoice.id}`}>{balance.state.data.open.length > 0 && hasPermissions(staff, "payments.record") ? "Collect Payment" : "Review Payment"}</Link>}
            {canReadProfile && <Link className={actionClass} to={`/members/${memberId}`}>View Member Profile</Link>}
          </div>
          {balance.state.status === "success" && balance.state.data.open.length > 1 && <details className="mt-4 border-t border-white/10 pt-4"><summary className="w-fit cursor-pointer rounded text-xs text-gym-muted">{balance.state.data.open.length} open invoices · oldest overdue first</summary><div className="mt-2 space-y-2">{balance.state.data.open.slice(0, 3).map(invoice => <Link key={invoice.id} to={`/payments/invoices/${invoice.id}`} className="flex flex-wrap justify-between gap-2 rounded-lg px-2 py-1 text-sm text-gym-muted hover:bg-white/5 hover:text-white"><span>{invoice.invoiceNumber} · {invoice.isOverdue ? "Overdue" : "Due"} {formatGymDate(invoice.dueDate)}</span><span className="font-semibold text-white">{formatLkr(invoice.balanceLkr)}</span></Link>)}</div></details>}
        </>}
      </section>
    </div>
  </div>;
}
