import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import { Store } from "lucide-react";
import type { Pagination } from "../../types/financial";
import { getApiErrorMessage } from "../../api/api";
import { retailInput, retailSecondary } from "../../utils/retail";
export function RetailFrame({ title, description, tools, children }: { title: string; description: string; tools?: ReactNode; children: ReactNode }) {
  return <div className="space-y-6"><header className="flex flex-wrap items-start justify-between gap-5 rounded-2xl border border-white/10 bg-gym-card p-5 sm:p-7"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-orange-400"><Store size={17} /> POS & Retail</p><h1 className="mt-3 text-3xl font-black">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gym-muted">{description}</p></div>{tools}</header>{children}</div>;
}
export function RetailNotice({ message, error = false }: { message: string; error?: boolean }) { return message ? <p role={error ? "alert" : "status"} className={`rounded-xl border p-4 text-sm ${error ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"}`}>{message}</p> : null; }
export function RetailPages({ pagination, label, change }: { pagination: Pagination; label: string; change: (page: number) => void }) { return <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-gym-muted"><p>{pagination.total} records · Page {pagination.page} of {Math.max(1, pagination.totalPages)}</p><div className="flex gap-2"><button className={retailSecondary} disabled={pagination.page <= 1} aria-label={`Previous ${label} page`} onClick={() => change(pagination.page - 1)}>Previous</button><button className={retailSecondary} disabled={pagination.page >= pagination.totalPages} aria-label={`Next ${label} page`} onClick={() => change(pagination.page + 1)}>Next</button></div></div>; }
export function RetailField({ label, name, value, type = "text", required, min, max, maxLength = 160 }: { label: string; name: string; value?: string | number | null; type?: string; required?: boolean; min?: number | string; max?: number | string; maxLength?: number }) { return <label className="block min-w-0 text-sm">{label}<input name={name} defaultValue={value ?? ""} type={type} required={required} min={min} max={max} maxLength={maxLength} step={type === "number" ? 1 : undefined} className={retailInput} /></label>; }
export function RetailAction({ name, children, submit, done, confirmation }: { name: string; children: (busy: boolean) => ReactNode; submit: (data: FormData) => Promise<unknown>; done: () => void; confirmation?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""); const pending = useRef(false);
  async function act(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current || confirmation && !window.confirm(confirmation)) return;
    const data = new FormData(event.currentTarget); pending.current = true; setBusy(true); setError("");
    try { await submit(data); done(); } catch (failure) { setError(failure instanceof z.ZodError ? failure.issues.map(issue => issue.message).join(". ") : getApiErrorMessage(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <form aria-label={name} onSubmit={act} className="space-y-4"><fieldset disabled={busy} className="space-y-4">{children(busy)}</fieldset><RetailNotice message={error} error /></form>;
}
