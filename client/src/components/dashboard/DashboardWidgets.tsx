import { useId } from "react";
import type { ReactNode } from "react";
import { AlertCircle, ArrowUpRight, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import type { DashboardResource } from "../../hooks/useDashboardResource";
import { formatCount, formatGymDate, formatLkr } from "../../utils/dashboard";

export function ResourceContent<T>({ resource, label, children }: {
  resource: DashboardResource<T>; label: string; children: (data: T) => ReactNode;
}) {
  const { state, retry } = resource;
  if (state.status === "disabled") return null;
  if (state.status === "loading") return (
    <div role="status" aria-label={`Loading ${label}`} className="space-y-3 py-5">
      <div aria-hidden="true" className="h-8 w-2/3 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
      <p className="text-xs text-gym-muted">Loading…</p>
    </div>
  );
  if (state.status === "error") return (
    <div role="alert" className="py-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-amber-300"><AlertCircle size={16} /> Unable to load {label.toLowerCase()}.</p>
      <p className="mt-2 text-gym-muted">{state.message}</p>
      <button onClick={retry} aria-label={`Retry ${label}`} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-bold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-gym-orange"><RefreshCw size={14} /> Retry</button>
    </div>
  );
  if (state.status === "success") return <>{children(state.data)}</>;
  return null;
}

const metricTones = {
  orange: "border-orange-400/45 bg-orange-500/15 shadow-orange-500/10 [&_.metric-icon]:bg-orange-400/25 [&_.metric-icon]:text-orange-200 [&_.metric-icon]:ring-orange-300/30",
  emerald: "border-emerald-400/45 bg-emerald-500/15 shadow-emerald-500/10 [&_.metric-icon]:bg-emerald-400/25 [&_.metric-icon]:text-emerald-200 [&_.metric-icon]:ring-emerald-300/30",
  blue: "border-blue-400/45 bg-blue-500/15 shadow-blue-500/10 [&_.metric-icon]:bg-blue-400/25 [&_.metric-icon]:text-blue-200 [&_.metric-icon]:ring-blue-300/30",
  purple: "border-violet-400/45 bg-violet-500/15 shadow-violet-500/10 [&_.metric-icon]:bg-violet-400/25 [&_.metric-icon]:text-violet-200 [&_.metric-icon]:ring-violet-300/30",
  amber: "border-amber-400/45 bg-amber-500/15 shadow-amber-500/10 [&_.metric-icon]:bg-amber-400/25 [&_.metric-icon]:text-amber-200 [&_.metric-icon]:ring-amber-300/30",
  cyan: "border-cyan-400/45 bg-cyan-500/15 shadow-cyan-500/10 [&_.metric-icon]:bg-cyan-400/25 [&_.metric-icon]:text-cyan-200 [&_.metric-icon]:ring-cyan-300/30",
};
export function MetricCard<T>({ title, icon: Icon, resource, children, tone = "orange" }: {
  title: string; icon: LucideIcon; resource: DashboardResource<T>; children: (data: T) => ReactNode; tone?: keyof typeof metricTones;
}) {
  return <article aria-label={title} className={`min-h-[88px] min-w-0 rounded-xl border px-3 py-2.5 shadow-lg [&_[role=status]]:space-y-1 [&_[role=status]]:py-1 [&_[role=status]>div]:h-6 ${metricTones[tone]}`}>
    <div className="flex items-start justify-between gap-2"><h3 className="text-xs font-semibold leading-4 text-zinc-200">{title}</h3><span className="metric-icon shrink-0 rounded-md p-1 ring-1"><Icon aria-hidden="true" size={22} /></span></div>
    <ResourceContent resource={resource} label={title}>{children}</ResourceContent>
  </article>;
}

export function MetricValue({ value, detail }: { value: string; detail?: string }) {
  return <><p className="mt-0.5 break-words text-[clamp(1.75rem,2.2vw,2rem)] leading-8 font-bold tracking-tight text-white">{value}</p>{detail && <p className="mt-0.5 text-xs leading-4 text-zinc-300">{detail}</p>}</>;
}

export function DashboardPanel<T>({ title, description, resource, action, children }: {
  title: string; description?: string; resource: DashboardResource<T>;
  action?: ReactNode; children: (data: T) => ReactNode;
}) {
  const id = useId();
  return <section aria-labelledby={id} className="min-w-0 rounded-2xl border border-white/10 bg-gym-card p-5 sm:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 id={id} className="font-bold text-white">{title}</h3>{description && <p className="mt-1 text-xs leading-5 text-gym-muted">{description}</p>}</div>{action}</div>
    <ResourceContent resource={resource} label={title}>{children}</ResourceContent>
  </section>;
}

export function WorkflowLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="inline-flex min-h-10 items-center gap-1 rounded-md text-xs font-bold text-orange-400 hover:text-orange-300 focus-visible:outline-2 focus-visible:outline-gym-orange">{children}<ArrowUpRight aria-hidden="true" size={14} /></Link>;
}

export function EmptyQueue({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-gym-muted">{children}</p>;
}

export function TrendChart({ label, data, money = false }: { label: string; data: { date: string; value: number }[]; money?: boolean }) {
  if (!data.length) return <EmptyQueue>No daily data was returned.</EmptyQueue>;
  const peak = Math.max(...data.map((day) => day.value));
  const format = money ? formatLkr : formatCount;
  return <figure aria-label={label}>
    {peak === 0 && <p className="mb-4 text-sm text-gym-muted">{money ? "No collections recorded in this period." : "No check-ins recorded in this period."}</p>}
    <div aria-hidden="true" className="flex h-48 items-end gap-2 border-b border-white/10 sm:gap-4">
      {data.map((day) => <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center" title={`${formatGymDate(day.date)}: ${format(day.value)}`}>
        <span className="mb-2 truncate text-[10px] text-zinc-300 sm:text-xs">{money ? new Intl.NumberFormat("en-LK", { notation: "compact" }).format(day.value) : format(day.value)}</span>
        <div className={`mx-auto w-full max-w-14 rounded-t-md ${money ? "bg-gym-orange" : "bg-emerald-400/80"}`} style={{ height: `${peak > 0 ? day.value / peak * 72 : 0}%` }} />
        <span className="mt-2 whitespace-nowrap pb-2 text-[10px] text-gym-muted sm:text-xs">{formatGymDate(day.date, true)}</span>
      </div>)}
    </div>
    <table className="sr-only"><caption>{label} daily values</caption><thead><tr><th scope="col">Date</th><th scope="col">{money ? "Collections (LKR)" : "Check-ins"}</th></tr></thead><tbody>{data.map((day) => <tr key={day.date}><th scope="row">{formatGymDate(day.date)}</th><td>{format(day.value)}</td></tr>)}</tbody></table>
    <figcaption className="mt-4 flex justify-between gap-3 text-xs text-gym-muted"><span>{formatGymDate(data[0].date)} – {formatGymDate(data[data.length - 1].date)}</span><span>{money ? "LKR collected" : "Daily check-ins"}</span></figcaption>
  </figure>;
}
