import { useCallback, useState } from "react";
import { Link } from "react-router";
import { Activity, ArrowUpRight, BellRing, CalendarClock, ClipboardCheck, CreditCard, RefreshCw, UserPlus, Users, Wallet } from "lucide-react";
import { reportsApi } from "../api/reports.api";
import { attentionApi } from "../api/attention.api";
import { attendanceApi } from "../api/attendance.api";
import { useAuth } from "../auth/auth-context";
import { hasPermissions } from "../auth/permissions";
import { useDashboardResource } from "../hooks/useDashboardResource";
import { DashboardPanel, EmptyQueue, MetricCard, MetricValue, TrendChart, WorkflowLink } from "../components/dashboard/DashboardWidgets";
import { addCalendarDays, formatCount, formatGymDate, formatLkr, todayInColombo } from "../utils/dashboard";

const loadActive = (signal: AbortSignal) => reportsApi.getActiveMembers(signal);
const loadReceivables = (signal: AbortSignal) => reportsApi.getReceivables(signal);
const loadExpiring = (signal: AbortSignal) => attentionApi.getExpiring({ days: 7, page: 1, limit: 5 }, signal);
// The existing API sorts by overdue balance descending. Its unfiltered summary
// covers all outstanding debt; only overdue records enter the action queue.
const loadOutstanding = (signal: AbortSignal) => attentionApi.getOutstanding({ status: "all", page: 1, limit: 5 }, signal);
const loadDue = (signal: AbortSignal) => attentionApi.getDueFollowUps({ page: 1, limit: 5 }, signal);

export default function DashboardPage() {
  const { staff } = useAuth();
  const [refresh, setRefresh] = useState(() => ({ date: todayInColombo(), version: 0 }));
  const { date: today } = refresh;
  const from = addCalendarDays(today, -6);
  const canReport = staff?.role === "ADMIN" && hasPermissions(staff, "reports.read");
  const canAttend = hasPermissions(staff, "attendance.read");
  const canAttention = hasPermissions(staff, "attention.read");
  const canFollowUp = hasPermissions(staff, "follow-ups.read");
  const canViewMember = hasPermissions(staff, "members.read");
  const canMembership = hasPermissions(staff, "members.read", "memberships.read");
  const canBill = hasPermissions(staff, "invoices.read");
  const key = `${staff?.id}:${staff?.role}:${staff?.permissions.join(",")}:${today}:${refresh.version}`;
  const loadCollections = useCallback((signal: AbortSignal) => reportsApi.getCollections({ from, to: today }, signal), [from, today]);
  const loadAttendance = useCallback((signal: AbortSignal) => attendanceApi.getSummary(today, signal), [today]);

  const active = useDashboardResource(canReport, key, loadActive);
  const collections = useDashboardResource(canReport, key, loadCollections);
  const receivables = useDashboardResource(canReport, key, loadReceivables);
  const attendance = useDashboardResource(canAttend, key, loadAttendance);
  const expiring = useDashboardResource(canAttention, key, loadExpiring);
  const outstanding = useDashboardResource(canAttention, key, loadOutstanding);
  const due = useDashboardResource(canFollowUp, key, loadDue);
  const refreshing = [active, collections, receivables, attendance, expiring, outstanding, due].some((resource) => resource.state.status === "loading");
  const hasDataAccess = canReport || canAttend || canAttention || canFollowUp;
  const quickActions = [
    { label: "Register member", to: "/members/new", icon: UserPlus, allowed: hasPermissions(staff, "members.create") },
    { label: "Attendance", to: "/attendance", icon: ClipboardCheck, allowed: canAttend },
    { label: "Payments & invoices", to: "/payments", icon: CreditCard, allowed: canBill },
    { label: "Due follow-ups", to: "/attention/follow-ups/due", icon: BellRing, allowed: canFollowUp },
  ].filter((action) => action.allowed);

  function memberName(id: string, name: string | null, reference: string | null) {
    return <div className="min-w-0"><p className="break-words font-semibold text-white">{canViewMember ? <Link className="hover:text-orange-400" to={`/members/${encodeURIComponent(id)}`}>{name ?? "Member unavailable"}</Link> : name ?? "Member unavailable"}</p>{reference && <p className="mt-1 text-xs text-gym-muted">{reference}</p>}</div>;
  }
  const followUpPath = (memberId: string, type: string) => `/attention/follow-ups/member/${encodeURIComponent(memberId)}/${type}`;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-white/10 border-t-gym-orange/60 bg-gym-card p-5 sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-gym-orange/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-orange-400"><Activity size={15} /> Daily operations</p>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Your gym. <span className="text-gym-orange">At a glance.</span></h1>
            <p className="mt-2 text-sm text-gym-muted">{formatGymDate(today)} · Asia/Colombo{staff?.role === "ADMIN" ? " · Admin overview" : " · Front desk overview"}</p>
          </div>
          <button onClick={() => setRefresh((current) => ({ date: todayInColombo(), version: current.version + 1 }))} disabled={refreshing || !hasDataAccess} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-bold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-gym-orange disabled:cursor-default disabled:opacity-50">
            <RefreshCw aria-hidden="true" size={16} className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} />{refreshing ? "Refreshing…" : "Refresh dashboard"}
          </button>
        </div>
      </section>

      {quickActions.length > 0 && <nav aria-label="Quick actions" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quickActions.map(({ label, to, icon: Icon }) => <Link key={to} to={to} className="group flex min-h-16 items-center gap-3 rounded-xl border border-white/10 bg-gym-card px-4 py-3 text-sm font-semibold text-white transition-colors hover:border-gym-orange/50 hover:bg-gym-orange/5 focus-visible:outline-2 focus-visible:outline-gym-orange"><span className="rounded-lg bg-gym-orange/10 p-2 text-orange-400"><Icon size={18} /></span>{label}<ArrowUpRight aria-hidden="true" size={16} className="ml-auto text-gym-muted group-hover:text-orange-400" /></Link>)}
      </nav>}

      {!hasDataAccess && <EmptyQueue>No operational dashboard data is enabled for your account. Contact an administrator to review your permissions.</EmptyQueue>}

      {hasDataAccess && <section aria-label="Operational overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canReport && <MetricCard title="Active memberships" icon={Users} resource={active}>{(data) => <MetricValue value={formatCount(data.summary.totalActiveMembers)} detail={`Active members with valid coverage · ${formatGymDate(data.asOfDate)}`} />}</MetricCard>}
        {canReport && <MetricCard title="Today's collections" icon={Wallet} resource={collections}>{(data) => {
          const day = data.byDay.find((item) => item.date === today);
          return day ? <MetricValue value={formatLkr(day.totalCollectedLkr)} detail={`${formatCount(day.paymentCount)} payments received today`} /> : <p className="mt-4 text-sm text-amber-300">Today's collection total was not returned.</p>;
        }}</MetricCard>}
        {canAttend && <MetricCard title="Today's attendance" icon={ClipboardCheck} resource={attendance}>{({ data }) => <MetricValue value={formatCount(data.totalCheckIns)} detail={`Check-ins · ${formatGymDate(data.date)}`} />}</MetricCard>}
        {canReport ? <>
          <MetricCard title="Outstanding balance" icon={CreditCard} resource={receivables}>{(data) => <MetricValue value={formatLkr(data.summary.totalOutstandingLkr)} detail={`${formatCount(data.summary.openInvoiceCount)} open invoices · ${formatGymDate(data.asOfDate)}`} />}</MetricCard>
          <MetricCard title="Overdue balance" icon={CalendarClock} resource={receivables}>{(data) => <MetricValue value={formatLkr(data.summary.overdueLkr)} detail={`${formatCount(data.summary.overdueInvoiceCount)} overdue invoices · included in outstanding`} />}</MetricCard>
        </> : canAttention && <>
          <MetricCard title="Outstanding balance" icon={CreditCard} resource={outstanding}>{(data) => <MetricValue value={formatLkr(data.summary.totalOutstandingLkr)} detail={`${formatCount(data.summary.openInvoiceCount)} open invoices · ${formatGymDate(data.asOfDate)}`} />}</MetricCard>
          <MetricCard title="Overdue balance" icon={CalendarClock} resource={outstanding}>{(data) => <MetricValue value={formatLkr(data.summary.totalOverdueLkr)} detail={`${formatCount(data.summary.overdueInvoiceCount)} overdue invoices · included in outstanding`} />}</MetricCard>
        </>}
        {canAttention && <MetricCard title="Expiring in 7 days" icon={CalendarClock} resource={expiring}>{(data) => <MetricValue value={formatCount(data.total)} detail={`Members with coverage ending soon · as of ${formatGymDate(data.asOfDate)}`} />}</MetricCard>}
        {canFollowUp && <MetricCard title="Scheduled follow-ups due" icon={BellRing} resource={due}>{(data) => <MetricValue value={formatCount(data.total)} detail={`Due on or before ${formatGymDate(data.asOfDate)}`} />}</MetricCard>}
      </section>}

      {(canReport || canAttend) && <div className="grid gap-4 xl:grid-cols-2">
        {canReport && <DashboardPanel title="7-day collections" description="Payments received, including today. Not profit or invoice issuance." resource={collections} action={<WorkflowLink to="/reports">Reports</WorkflowLink>}>{(data) => <><p className="mb-5 text-2xl font-black text-white">{formatLkr(data.summary.totalCollectedLkr)} <span className="text-xs font-normal text-gym-muted">collected over 7 days</span></p><TrendChart label="7-day collections trend" money data={data.byDay.map((day) => ({ date: day.date, value: day.totalCollectedLkr }))} /></>}</DashboardPanel>}
        {canAttend && <DashboardPanel title="7-day attendance" description="Daily check-ins across the last seven gym calendar dates." resource={attendance} action={<WorkflowLink to="/attendance">Attendance</WorkflowLink>}>{({ data }) => <TrendChart label="7-day attendance trend" data={data.last7Days.map((day) => ({ date: day.date, value: day.checkIns }))} />}</DashboardPanel>}
      </div>}

      {(canAttention || canFollowUp) && <section aria-labelledby="action-required-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 id="action-required-title" className="text-xl font-black text-white">Action required</h2><p className="mt-1 text-sm text-gym-muted">A focused queue for the front desk. Each list shows up to five records.</p></div>{canAttention && <WorkflowLink to="/attention">Open Attention Center</WorkflowLink>}</div>
        <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {canAttention && <DashboardPanel title="Expiring memberships" description="Last valid membership dates in the next 7 days, including today." resource={expiring}>{(data) => data.data.length === 0 ? <EmptyQueue>No memberships expiring in the next 7 days.</EmptyQueue> : <><ul className="divide-y divide-white/10">{data.data.map((item) => <li key={item.membershipId} className="py-4 first:pt-0 last:pb-0">
            {memberName(item.memberId, item.memberName, item.memberReference)}
            <p className="mt-2 text-xs text-gym-muted">{item.planName} · Last valid {formatGymDate(item.lastValidDate)}</p>
            <p className="mt-1 text-xs font-semibold text-amber-300">{item.daysRemaining === 0 ? "Last valid day is today" : `${item.daysRemaining} days remaining`}</p>
            <div className="flex flex-wrap gap-x-4">{canMembership && <WorkflowLink to={`/members/${encodeURIComponent(item.memberId)}/membership`}>Manage membership</WorkflowLink>}{canFollowUp && <WorkflowLink to={followUpPath(item.memberId, item.type)}>Follow-up history</WorkflowLink>}</div>
          </li>)}</ul><p className="mt-4 text-xs text-gym-muted">Showing {data.data.length} of {formatCount(data.total)} expiring members.</p></>}</DashboardPanel>}
          {canAttention && <DashboardPanel title="Overdue payments" description="Members with the highest overdue balances first. Includes inactive profiles." resource={outstanding}>{(data) => {
            const records = data.data.filter((item) => item.hasOverduePayments);
            return records.length === 0 ? <EmptyQueue>No overdue payments.</EmptyQueue> : <><ul className="divide-y divide-white/10">{records.map((item) => <li key={item.memberId} className="py-4 first:pt-0 last:pb-0">
              {memberName(item.memberId, item.memberName, item.memberReference)}
              <p className="mt-2 font-bold text-red-300">{formatLkr(item.overdueLkr)} overdue</p>
              <p className="mt-1 text-xs text-gym-muted">Total outstanding {formatLkr(item.outstandingLkr)} · Oldest due {formatGymDate(item.oldestDueDate)}</p>
              <div className="flex flex-wrap gap-x-4">{canBill && <WorkflowLink to="/payments">Review invoices</WorkflowLink>}{canFollowUp && <WorkflowLink to={followUpPath(item.memberId, item.type)}>Follow-up history</WorkflowLink>}</div>
            </li>)}</ul><p className="mt-4 text-xs text-gym-muted">{formatCount(data.summary.overdueInvoiceCount)} overdue invoices across all members.</p></>;
          }}</DashboardPanel>}
          {canFollowUp && <DashboardPanel title="Follow-ups due" description="Latest scheduled follow-ups due today or earlier; underlying alerts may have changed." resource={due} action={<WorkflowLink to="/attention/follow-ups/due">View all</WorkflowLink>}>{(data) => data.data.length === 0 ? <EmptyQueue>No scheduled follow-ups due.</EmptyQueue> : <><ul className="divide-y divide-white/10">{data.data.map((item) => <li key={item.followUpId} className="py-4 first:pt-0 last:pb-0">
            {memberName(item.memberId, item.memberName, item.memberReference)}
            <p className="mt-2 text-xs font-semibold text-amber-300">Due {formatGymDate(item.nextFollowUpDate)}</p>
            <p className="mt-1 text-xs text-gym-muted">{{ MEMBERSHIP_EXPIRING: "Membership expiry", PAYMENT_OUTSTANDING: "Outstanding payment", ATTENDANCE_INACTIVE: "Attendance inactivity" }[item.alertType]}</p>
            <WorkflowLink to={followUpPath(item.memberId, item.alertType)}>Review follow-up</WorkflowLink>
          </li>)}</ul><p className="mt-4 text-xs text-gym-muted">Showing {data.data.length} of {formatCount(data.total)} scheduled follow-ups.</p></>}</DashboardPanel>}
        </div>
      </section>}
      {hasDataAccess && <p className="text-xs leading-5 text-gym-muted">Live API snapshots · Refresh to load current data. Outstanding balances include overdue amounts; attention queues may contain the same member.</p>}
    </div>
  );
}
