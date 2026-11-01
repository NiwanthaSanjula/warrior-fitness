import { useState } from "react";
import { Link } from "react-router";
import type { AuthStaff } from "../../auth/auth-context";
import { hasPermissions } from "../../auth/permissions";
import type { DashboardResource } from "../../hooks/useDashboardResource";
import type { ExpiringMembershipResponse, OutstandingPaymentResponse, DueFollowUpsResponse } from "../../types/attention";
import { formatCount, formatGymDate, formatLkr } from "../../utils/dashboard";
import { EmptyQueue, ResourceContent, WorkflowLink } from "./DashboardWidgets";

export default function DashboardWorkQueue({ staff, expiring, outstanding, due }: {
  staff: AuthStaff | null; expiring: DashboardResource<ExpiringMembershipResponse>; outstanding: DashboardResource<OutstandingPaymentResponse>; due: DashboardResource<DueFollowUpsResponse>;
}) {
  const [choice, setChoice] = useState("expiring");
  const tabs = [
    { id: "expiring", label: "Expiring", allowed: hasPermissions(staff, "attention.read"), count: expiring.state.status === "success" ? expiring.state.data.total : null },
    { id: "overdue", label: "Overdue", allowed: hasPermissions(staff, "attention.read"), count: outstanding.state.status === "success" ? outstanding.state.data.summary.overdueInvoiceCount : null },
    { id: "follow-ups", label: "Follow-ups", allowed: hasPermissions(staff, "follow-ups.read"), count: due.state.status === "success" ? due.state.data.total : null },
  ].filter(tab => tab.allowed);
  if (!tabs.length) return null;
  const active = tabs.find(tab => tab.id === choice)?.id ?? tabs[0].id;
  const canMember = hasPermissions(staff, "members.read");
  const canRenew = hasPermissions(staff, "members.read", "memberships.read", "plans.read", "memberships.renew");
  const identity = (name: string | null, reference: string | null) => <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{name ?? "Member unavailable"}</p>{reference && <p className="mt-1 text-xs text-gym-muted">{reference}</p>}</div>;
  const followPath = (memberId: string, type: string) => `/attention/follow-ups/member/${encodeURIComponent(memberId)}/${type}`;
  const rowClass = "flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0";
  return <section aria-labelledby="work-queue-heading" className="min-w-0 rounded-2xl border border-white/10 bg-gym-card p-5 sm:p-6">
    <div className="mb-4 flex items-center justify-between gap-3"><h3 id="work-queue-heading" className="font-bold">Action required</h3><span className="text-xs text-gym-muted">Next up</span></div>
    <div role="tablist" aria-label="Member work queues" className="mb-4 flex gap-1 border-b border-white/10" onKeyDown={event => {
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]')];
      const index = buttons.indexOf(event.target as HTMLButtonElement);
      const next = event.key === "ArrowRight" ? (index + 1) % buttons.length : event.key === "ArrowLeft" ? (index - 1 + buttons.length) % buttons.length : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); setChoice(tabs[next].id); buttons[next].focus(); }
    }}>{tabs.map(tab => <button key={tab.id} type="button" role="tab" id={`queue-tab-${tab.id}`} aria-selected={active === tab.id} aria-controls={`queue-panel-${tab.id}`} tabIndex={active === tab.id ? 0 : -1} onClick={() => setChoice(tab.id)} className={`flex min-h-11 min-w-0 items-center gap-2 border-b-2 px-2 text-xs font-semibold sm:px-3 sm:text-sm ${active === tab.id ? "border-gym-orange text-white" : "border-transparent text-gym-muted hover:text-white"}`}>{tab.label}{tab.count !== null && <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-300">{formatCount(tab.count)}</span>}</button>)}</div>
    <div role="tabpanel" id={`queue-panel-${active}`} aria-labelledby={`queue-tab-${active}`}>
      {active === "expiring" && <ResourceContent resource={expiring} label="Expiring memberships">{data => <>{data.data.length ? <ul className="divide-y divide-white/10">{data.data.slice(0, 3).map(item => <li key={item.membershipId} className={rowClass}><div className="min-w-0 flex-1">{identity(item.memberName, item.memberReference)}<p className="mt-1 text-xs text-gym-muted">{item.planName} · {formatGymDate(item.lastValidDate, true)}</p></div><span className="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300">{item.daysRemaining === 0 ? "Today" : `${item.daysRemaining}d`}</span>{canRenew ? <WorkflowLink to={`/members/${encodeURIComponent(item.memberId)}/membership`}>Renew</WorkflowLink> : canMember ? <WorkflowLink to={`/front-desk?member=${encodeURIComponent(item.memberId)}`}>Open member</WorkflowLink> : null}</li>)}</ul> : <EmptyQueue>No memberships expiring in the next 7 days.</EmptyQueue>}<WorkflowLink to="/attention">View all expiring</WorkflowLink></>}</ResourceContent>}
      {active === "overdue" && <ResourceContent resource={outstanding} label="Overdue payments">{data => <>{data.data.some(item => item.hasOverduePayments) ? <ul className="divide-y divide-white/10">{data.data.filter(item => item.hasOverduePayments).slice(0, 3).map(item => <li key={item.memberId} className={rowClass}><div className="min-w-0 flex-1">{identity(item.memberName, item.memberReference)}<p className="mt-1 text-xs text-gym-muted">Due {formatGymDate(item.oldestDueDate, true)}</p></div><span className="text-sm font-bold text-amber-300">{formatLkr(item.overdueLkr)}</span>{canMember && hasPermissions(staff, "invoices.read") ? <WorkflowLink to={`/front-desk?member=${encodeURIComponent(item.memberId)}`}>Review balance</WorkflowLink> : hasPermissions(staff, "follow-ups.read") ? <WorkflowLink to={followPath(item.memberId, item.type)}>Follow up</WorkflowLink> : null}</li>)}</ul> : <EmptyQueue>No overdue payments.</EmptyQueue>}<WorkflowLink to={hasPermissions(staff, "invoices.read") ? "/payments" : "/attention"}>View overdue payments</WorkflowLink></>}</ResourceContent>}
      {active === "follow-ups" && <ResourceContent resource={due} label="Follow-ups due">{data => <>{data.data.length ? <ul className="divide-y divide-white/10">{data.data.slice(0, 3).map(item => <li key={item.followUpId} className={rowClass}><div className="min-w-0 flex-1">{identity(item.memberName, item.memberReference)}<p className="mt-1 text-xs text-gym-muted">Due {formatGymDate(item.nextFollowUpDate, true)}</p></div><WorkflowLink to={followPath(item.memberId, item.alertType)}>Follow up</WorkflowLink></li>)}</ul> : <EmptyQueue>No scheduled follow-ups due.</EmptyQueue>}<Link to="/attention/follow-ups/due" className="inline-flex min-h-10 items-center text-xs font-bold text-orange-300">View all follow-ups</Link></>}</ResourceContent>}
    </div>
  </section>;
}
