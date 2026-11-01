import { DashboardChart, MembershipDonut } from "../components/dashboard/DashboardCharts";
import CollectionsPanel from "../components/dashboard/CollectionsPanel";
import DashboardWorkQueue from "../components/dashboard/DashboardWorkQueue";
import { completeSeries, membershipMix } from "../utils/dashboard-charts";
import { useCallback, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, BellRing, CalendarClock, ClipboardCheck, CreditCard, RefreshCw, ShoppingCart, UserRoundCheck, UserPlus, Users, Wallet } from "lucide-react";
import { reportsApi } from "../api/reports.api";
import { attentionApi } from "../api/attention.api";
import { attendanceApi } from "../api/attendance.api";
import { useAuth } from "../auth/auth-context";
import { canUseFrontDesk, hasPermissions } from "../auth/permissions";
import { useDashboardResource } from "../hooks/useDashboardResource";
import { DashboardPanel, EmptyQueue, MetricCard, MetricValue, WorkflowLink } from "../components/dashboard/DashboardWidgets";
import { addCalendarDays, formatCount, formatGymDate, formatLkr, todayInColombo } from "../utils/dashboard";
import { useCommandCenter } from "../hooks/useCommandCenter";
import { CommandCenterPanels, PriorityAlerts } from "../components/dashboard/CommandCenterPanels";
import { automationHealth, type CommandAlert } from "../utils/command-center";

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

  const canBill = hasPermissions(staff, "invoices.read");
  const key = `${staff?.id}:${staff?.role}:${staff?.permissions.join(",")}:${today}:${refresh.version}`;
  const loadCollections = useCallback((signal: AbortSignal) => reportsApi.getCollections({ from, to: today }, signal), [from, today]);
  const loadAttendance = useCallback(async (signal: AbortSignal) => {
    const result = await attendanceApi.getSummary(today, signal);
    completeSeries(result.data.last7Days.map(day => ({ date: day.date, value: day.checkIns })), from, today);
    return result;
  }, [from, today]);
  const loadPurchases = useCallback(async (signal: AbortSignal) => {
    const result = await reportsApi.getMembershipActivity({ from, to: today }, signal);
    return { ...result, mix: membershipMix(result) };
  }, [from, today]);

  const active = useDashboardResource(canReport, key, loadActive);
  const collections = useDashboardResource(canReport, key, loadCollections);
  const receivables = useDashboardResource(canReport, key, loadReceivables);
  const attendance = useDashboardResource(canAttend, key, loadAttendance);
  const expiring = useDashboardResource(canAttention, key, loadExpiring);
  const outstanding = useDashboardResource(canAttention, key, loadOutstanding);
  const due = useDashboardResource(canFollowUp, key, loadDue);
  const center = useCommandCenter(staff, key, today);
  const purchases = useDashboardResource(canReport, key, loadPurchases);
  const resources = [active, collections, purchases, receivables, attendance, expiring, outstanding, due, center.cash, center.equipment, center.faults, center.retail, center.automation, center.ownSales];
  const refreshing = resources.some(resource => resource.state.status === "loading");
  const unavailable = resources.some(resource => resource.state.status === "error");
  const connected = center.canFinance || center.canEquipment || center.canRetail || center.canAutomation || center.canOwnSales;
  const hasDataAccess = canReport || canAttend || canAttention || canFollowUp || connected;
  const quickActions = [
    { label: "Register member", to: "/members/new", icon: UserPlus, allowed: hasPermissions(staff, "members.create") },
    { label: "Front Desk", to: "/front-desk", icon: UserRoundCheck, allowed: canUseFrontDesk(staff) },
    { label: "Payments & invoices", to: "/payments", icon: CreditCard, allowed: canBill },
    { label: "Due follow-ups", to: "/attention/follow-ups/due", icon: BellRing, allowed: canFollowUp },
    { label: "POS checkout", to: "/retail/checkout", icon: ShoppingCart, allowed: hasPermissions(staff, "retail.read", "retail.checkout") },
  ].filter((action) => action.allowed);

  const alerts: CommandAlert[] = [];
  if (center.faults.state.status === "success" && center.faults.state.data.data.length) {
    const fault = center.faults.state.data.data[0];
    alerts.push({ id: "equipment-fault", priority: { CRITICAL: 0, HIGH: 4, MEDIUM: 8, LOW: 12 }[fault.severity], title: `${fault.severity} equipment fault`, detail: `${fault.equipmentName} · ${fault.description}`, to: `/equipment/${fault.equipmentId}#equipment-history`, action: "Review equipment" });
  }
  if (center.automation.state.status === "success") {
    const health = automationHealth(center.automation.state.data.scheduler);
    if (health.tone !== "quiet") alerts.push({ id: "automation", priority: health.tone === "urgent" ? 1 : 5, title: health.label, detail: health.detail, to: "/notifications#automation-status", action: "Review automation" });
  }
  if (center.equipment.state.status === "success" && center.equipment.state.data.statistics.overdue > 0) alerts.push({ id: "overdue-service", priority: 2, title: `${formatCount(center.equipment.state.data.statistics.overdue)} overdue equipment services`, detail: "Plan or complete preventive work and review equipment availability.", to: "/equipment/maintenance", action: "Open maintenance" });
  if (expiring.state.status === "success") {
    const lastDay = expiring.state.data.data.find(item => item.daysRemaining === 0);
    if (lastDay) alerts.push({ id: "final-membership-day", priority: 3, title: "Membership on its final valid day", detail: `${lastDay.memberName ?? "A member"} · ${lastDay.planName}`, to: canViewMember ? `/members/${encodeURIComponent(lastDay.memberId)}` : "/attention", action: canViewMember ? "Assist member" : "Review expiry queue" });
  }
  if (outstanding.state.status === "success" && outstanding.state.data.summary.totalOverdueLkr > 0) alerts.push({ id: "overdue-payments", priority: 4, title: `${formatLkr(outstanding.state.data.summary.totalOverdueLkr)} overdue`, detail: "Review outstanding membership invoices and member follow-ups.", to: canBill ? "/payments" : "/attention", action: "Review balances" });
  if (center.retail.state.status === "success") {
    const stock = center.retail.state.data.stock;
    if (stock.outOfStockCount > 0) alerts.push({ id: "retail-out", priority: 5, title: `${formatCount(stock.outOfStockCount)} products out of stock`, detail: "Restock active retail products before the next sale.", to: "/retail/products?stock=out", action: "Open stock queue" });
    if (stock.lowStockCount > 0) alerts.push({ id: "retail-low", priority: 7, title: `${formatCount(stock.lowStockCount)} low-stock products`, detail: "Review current shelf quantities and prepare restocking.", to: "/retail/products?stock=low", action: "Review low stock" });
  }
  if (due.state.status === "success" && due.state.data.total > 0) alerts.push({ id: "follow-ups", priority: 6, title: `${formatCount(due.state.data.total)} scheduled follow-ups due`, detail: "Open the latest scheduled follow-ups and record the next action.", to: "/attention/follow-ups/due", action: "Open due follow-ups" });

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{staff?.role === "ADMIN" ? "Overview" : "Your workspace"}</h1><p className="mt-1 text-xs text-gym-muted">{formatGymDate(today)} · Asia/Colombo</p></div>
        <button aria-label="Refresh dashboard" onClick={() => setRefresh(current => ({ date: todayInColombo(), version: current.version + 1 }))} disabled={refreshing || !hasDataAccess} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-gym-card px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-50"><RefreshCw size={15} aria-hidden="true" className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} />{refreshing ? "Refreshing" : "Refresh"}</button>
      </header>
      {quickActions.length > 0 && <nav aria-label="Quick actions" className="flex flex-wrap gap-2">{quickActions.map(({ label, to, icon: Icon }) => <Link key={to} to={to} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors ${to === "/front-desk" ? "border-gym-orange bg-gym-orange text-white hover:bg-orange-600" : "border-white/10 bg-gym-card text-zinc-300 hover:border-white/25 hover:text-white"}`}><Icon size={15} aria-hidden="true" />{label}<ArrowUpRight size={13} aria-hidden="true" /></Link>)}</nav>}
      {!hasDataAccess && <EmptyQueue>No dashboard data is enabled. {quickActions.length ? "Use your permitted actions above." : "Contact an administrator to review your permissions."}</EmptyQueue>}
      {hasDataAccess && <section id="dashboard-overview" aria-label="Operational overview" className="grid scroll-mt-24 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {canReport && <MetricCard title="Active memberships" icon={Users} resource={active} tone="emerald">{data => <MetricValue value={formatCount(data.summary.totalActiveMembers)} />}</MetricCard>}
        {center.canFinance && <MetricCard title="Today's collections" icon={Wallet} resource={center.cash} tone="orange">{data => <><MetricValue value={formatLkr(data.combinedLkr)} detail={data.status === "CLOSED" ? "Combined · closed snapshot" : undefined} /><dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] leading-4"><div className="min-w-0"><dt className="inline text-gym-muted">Membership collections </dt><dd className="inline break-words text-zinc-200">{formatLkr(data.membershipLkr)}</dd></div><div className="min-w-0"><dt className="inline text-gym-muted">POS collections </dt><dd className="inline break-words text-zinc-200">{formatLkr(data.retailLkr)}</dd></div></dl></>}</MetricCard>}
        {canAttend && <MetricCard title="Today's attendance" icon={ClipboardCheck} resource={attendance} tone="blue">{({ data }) => <MetricValue value={formatCount(data.totalCheckIns)} />}</MetricCard>}
        {canReport ? <MetricCard title="Outstanding balance" icon={CreditCard} resource={receivables} tone="amber">{data => <MetricValue value={formatLkr(data.summary.totalOutstandingLkr)} detail={`${formatLkr(data.summary.overdueLkr)} overdue included`} />}</MetricCard> : canAttention && <MetricCard title="Outstanding balance" icon={CreditCard} resource={outstanding} tone="amber">{data => <MetricValue value={formatLkr(data.summary.totalOutstandingLkr)} detail={`${formatLkr(data.summary.totalOverdueLkr)} overdue included`} />}</MetricCard>}
        {canAttention && <MetricCard title="Expiring in 7 days" icon={CalendarClock} resource={expiring} tone="purple">{data => <MetricValue value={formatCount(data.total)} />}</MetricCard>}
        {canFollowUp && <MetricCard title="Scheduled follow-ups due" icon={BellRing} resource={due} tone="cyan">{data => <MetricValue value={formatCount(data.total)} />}</MetricCard>}
      </section>}
      {hasDataAccess && <PriorityAlerts alerts={alerts} loading={refreshing} unavailable={unavailable} />}
      {(canReport || canAttend) && <div className={`grid gap-4 ${canReport && canAttend ? "xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" : ""}`}>
        {canReport && <CollectionsPanel membership={collections} retail={center.retail} from={from} to={today} />}
        {canAttend && <DashboardPanel title="7-day attendance" resource={attendance} action={<WorkflowLink to="/attendance">History</WorkflowLink>}>{({ data }) => <><p className="mb-3 text-xs text-gym-muted">Daily check-ins</p><DashboardChart label="7-day attendance trend" kind="bar" series={[{ label: "Check-ins", color: "#60a5fa", data: data.last7Days.map(day => ({ date: day.date, value: day.checkIns })) }]} /></>}</DashboardPanel>}
      </div>}
      {(canAttention || canFollowUp || canReport) && <div className={`grid items-start gap-4 ${canReport && (canAttention || canFollowUp) ? "xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" : ""}`}>
        <DashboardWorkQueue staff={staff} expiring={expiring} outstanding={outstanding} due={due} />
        {canReport && <DashboardPanel title="Membership purchases" description="Last 7 days" resource={purchases} action={<WorkflowLink to="/reports">Reports</WorkflowLink>}>{data => <MembershipDonut mix={data.mix} plans={data.byPlan} />}</DashboardPanel>}
      </div>}
      {connected && <CommandCenterPanels center={center} today={today} />}
    </div>
  );
}
