import { useEffect, useId, useRef, useState } from "react";
import { formatCount, formatGymDate, formatLkr } from "../../utils/dashboard";
import type { ChartDay } from "../../utils/dashboard-charts";

export interface ChartSeries { label: string; color: string; data: ChartDay[] }
const compact = (value: number) => new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);

// Small native SVG charts keep the existing lazy-loaded dashboard dependency-free.
// Exact figures remain available through keyboard point selection and a data table.
export function DashboardChart({ label, series, kind = "area", money = false }: {
  label: string; series: ChartSeries[]; kind?: "area" | "bar"; money?: boolean;
}) {
  const id = useId().replaceAll(":", "");
  const [selected, setSelected] = useState<number | null>(null);
  const [showData, setShowData] = useState(false);
  const dates = series[0]?.data.map(day => day.date) ?? [];
  const container = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(700);
  const hasDates = dates.length > 0;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => { const next = element.getBoundingClientRect().width; if (next > 0) setWidth(Math.max(200, Math.round(next))); };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasDates]);
  if (!dates.length) return <p className="py-12 text-center text-sm text-gym-muted">No daily data.</p>;
  const format = money ? formatLkr : formatCount;
  const max = Math.max(1, ...series.flatMap(item => item.data.map(day => day.value)));
  const top = max <= 5 ? 5 : Math.ceil(max / 4 / 10 ** Math.floor(Math.log10(max / 4))) * 4 * 10 ** Math.floor(Math.log10(max / 4));
  const height = 244, left = 50, right = 18, baseline = 210, plotHeight = 182;
  const barWidth = Math.min(42, (width - left - right) / dates.length * 0.6);
  const x = (index: number) => left + (index + 0.5) * (width - left - right) / dates.length;
  const y = (value: number) => baseline - value / top * plotHeight;
  const active = selected !== null && selected < dates.length ? selected : dates.length - 1;
  return <figure ref={container} aria-label={label} className="min-w-0">
    {series.every(item => item.data.every(day => day.value === 0)) && <p className="mb-2 text-xs text-gym-muted">{money ? series.length === 1 ? `No ${series[0].label.toLowerCase()} collections recorded in this period.` : "No collections recorded in this period." : "No check-ins recorded in this period."}</p>}
    <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">{series.map(item => <span key={item.label} className="inline-flex items-center gap-2 text-zinc-300"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />{item.label}</span>)}</div>
    <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gym-muted" aria-live="polite" aria-atomic="true"><span>{formatGymDate(dates[active], true)}</span>{series.map(item => <span key={item.label}>{item.label} <strong className="ml-1 font-semibold text-zinc-100">{format(item.data[active].value)}</strong></span>)}</div>
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="img" aria-label={`${label}. ${money ? "LKR collected" : "Daily check-ins"}; use the date controls or data table for exact values.`}>
      <defs>{series.map((item, index) => <linearGradient key={item.label} id={`${id}-${index}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={item.color} stopOpacity="0.2" /><stop offset="100%" stopColor={item.color} stopOpacity="0.01" /></linearGradient>)}</defs>
      {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(top * tick / 4)} y2={y(top * tick / 4)} stroke="#ffffff" strokeOpacity="0.08" strokeDasharray="3 5" /><text x={left - 10} y={y(top * tick / 4) + 4} textAnchor="end" fill="#a1a1aa" fontSize="12">{compact(top * tick / 4)}</text></g>)}
      <line x1={x(active)} x2={x(active)} y1={22} y2={baseline} stroke="#ffffff" strokeOpacity="0.16" strokeDasharray="3 4" />
      {series.map((item, seriesIndex) => {
        const points = item.data.map((day, index) => `${x(index)},${y(day.value)}`);
        return <g key={item.label}>
          {kind === "area" ? <><path d={`M${x(0)},${baseline} L${points.join(" L")} L${x(dates.length - 1)},${baseline} Z`} fill={`url(#${id}-${seriesIndex})`} /><path d={`M${points.join(" L")}`} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{item.data.map((day, index) => <circle key={day.date} cx={x(index)} cy={y(day.value)} r={index === active ? 5 : 3} fill="#171719" stroke={item.color} strokeWidth="2" />)}</> : item.data.map((day, index) => <rect key={day.date} x={x(index) - barWidth / 2} y={y(day.value)} width={barWidth} height={Math.max(0, baseline - y(day.value))} rx="5" fill={item.color} opacity={index === active ? 1 : 0.65} />)}
        </g>;
      })}
    </svg>
    <div className="-mt-3 flex" style={{ paddingLeft: `${left / width * 100}%`, paddingRight: `${right / width * 100}%` }} role="group" aria-label={`${label} dates`}>
      {dates.map((date, index) => <button key={date} type="button" onFocus={() => setSelected(index)} onMouseEnter={() => setSelected(index)} onClick={() => setSelected(index)} aria-pressed={index === active} aria-label={`${formatGymDate(date)}: ${series.map(item => `${item.label} ${format(item.data[index].value)}`).join(", ")}`} className={`min-h-9 min-w-0 flex-1 rounded text-[10px] sm:text-xs ${active === index ? "text-white" : "text-gym-muted hover:text-white"}`}>{new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(new Date(`${date}T00:00:00Z`))}<span className="ml-1 hidden sm:inline">{date.slice(-2)}</span></button>)}
    </div>
    <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-gym-muted"><span>{formatGymDate(dates[0], true)} – {formatGymDate(dates[dates.length - 1], true)}{money ? " · LKR" : ""}</span><button type="button" aria-label={`${showData ? "Hide" : "View"} data for ${label}`} aria-expanded={showData} aria-controls={`${id}-data`} onClick={() => setShowData(value => !value)} className="rounded px-2 py-1 font-semibold text-zinc-300 hover:bg-white/5">{showData ? "Hide data" : "View data"}<span className="sr-only"> for {label}</span></button></div>
    <div id={`${id}-data`} className={showData ? "mt-3 overflow-x-auto" : "sr-only"}><table className="w-full text-left text-xs"><caption className="sr-only">{label} daily values</caption><thead><tr><th className="py-2" scope="col">Date</th>{series.map(item => <th key={item.label} scope="col" className="py-2 text-right">{item.label}{money ? " (LKR)" : ""}</th>)}</tr></thead><tbody>{dates.map((date, index) => <tr key={date} className="border-t border-white/5"><th scope="row" className="py-2 font-normal text-gym-muted">{formatGymDate(date)}</th>{series.map(item => <td key={item.label} className="py-2 text-right text-zinc-200">{format(item.data[index].value)}</td>)}</tr>)}</tbody></table></div>
  </figure>;
}

export function MembershipDonut({ mix, plans }: { mix: { label: string; value: number }[]; plans: { planName: string; purchases: number }[] }) {
  const total = mix.reduce((sum, item) => sum + item.value, 0), colors = ["#a78bfa", "#34d399", "#60a5fa"];
  const segments = mix.map((item, index) => ({ ...item, offset: total ? mix.slice(0, index).reduce((sum, previous) => sum + previous.value, 0) / total * 100 : 0, color: colors[index % colors.length], size: total ? item.value / total * 100 : 0 }));
  return <div>
    <div className="flex flex-wrap items-center justify-center gap-6 py-3">
      <div className="relative h-40 w-40 shrink-0"><svg viewBox="0 0 120 120" role="img" aria-label={`${formatCount(total)} membership purchases: ${mix.map(item => `${item.label} ${formatCount(item.value)}`).join(", ") || "none"}`} className="h-full w-full -rotate-90"><circle cx="60" cy="60" r="49" fill="none" stroke="#ffffff0d" strokeWidth="12" />{segments.map(item => <circle key={item.label} cx="60" cy="60" r="49" fill="none" stroke={item.color} strokeWidth="12" pathLength="100" strokeDasharray={`${item.size} ${100 - item.size}`} strokeDashoffset={-item.offset} />)}</svg><div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-bold text-white">{formatCount(total)}</span><span className="mt-1 text-xs text-gym-muted">purchases</span></div></div>
      <dl className="space-y-3 text-sm">{segments.map(item => <div key={item.label} className="flex items-center gap-3"><dt className="inline-flex items-center gap-2 text-gym-muted"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</dt><dd className="ml-auto font-bold text-white">{formatCount(item.value)}</dd></div>)}</dl>
    </div>
    {!total && <p className="py-2 text-center text-sm text-gym-muted">No membership purchases in this period.</p>}
    <ul className="mt-3 space-y-3">{plans.slice().sort((a, b) => b.purchases - a.purchases).slice(0, 3).map(plan => <li key={plan.planName}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="truncate text-zinc-300">{plan.planName}</span><span className="text-gym-muted">{formatCount(plan.purchases)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-violet-400/75" style={{ width: `${total ? Math.min(100, plan.purchases / total * 100) : 0}%` }} /></div></li>)}</ul>
  </div>;
}
