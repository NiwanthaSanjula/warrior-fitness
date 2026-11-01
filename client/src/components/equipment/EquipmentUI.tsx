import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ZodError } from "zod";
import { useAuth } from "../../auth/auth-context";
import { canMutate } from "../../auth/permissions";
import { getApiErrorMessage } from "../../api/api";
import { equipmentStatuses, type EquipmentPagination, type EquipmentStatus } from "../../types/equipment";
export const equipmentInput = "mt-1 w-full min-w-0 rounded-lg border border-white/15 bg-gym-bg px-3 py-3 text-sm text-white focus:border-gym-orange focus:outline-none";
export const equipmentButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gym-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40";
export const equipmentSecondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-bold hover:bg-white/5 disabled:opacity-40";
export function EquipmentBadge({ status }: { status: EquipmentStatus }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${status === "OPERATIONAL" ? "bg-emerald-500/10 text-emerald-300" : status === "UNDER_MAINTENANCE" ? "bg-orange-500/10 text-orange-300" : status === "OUT_OF_SERVICE" ? "bg-red-500/10 text-red-300" : "bg-white/5 text-zinc-400"}`}>{equipmentStatuses[status]}</span>;
}
export function EquipmentPages({ data, label, change }: { data: EquipmentPagination; label: string; change: (page: number) => void }) {
  return <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-gym-muted"><p>{data.total} records · Page {data.page} of {Math.max(1, data.totalPages)}</p><div className="flex gap-2"><button className={equipmentSecondary} disabled={data.page <= 1} onClick={() => change(data.page - 1)} aria-label={`Previous ${label} page`}>Previous</button><button className={equipmentSecondary} disabled={data.page >= data.totalPages} onClick={() => change(data.page + 1)} aria-label={`Next ${label} page`}>Next</button></div></div>;
}
export function EquipmentOperation({ name, children, submit, done, confirmation }: { name: string; children: (busy: boolean) => ReactNode; submit: (form: FormData) => Promise<unknown>; done?: () => void; confirmation?: string }) {
  const { staff } = useAuth();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  async function act(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current || !canMutate(staff)) return;
    if (confirmation && !window.confirm(confirmation)) return;
    const data = new FormData(event.currentTarget); pending.current = true; setBusy(true); setError("");
    try { await submit(data); done?.(); }
    catch (failure) { setError(failure instanceof ZodError ? failure.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join(". ") : `${getApiErrorMessage(failure)} Refresh before retrying an uncertain result.`); }
    finally { pending.current = false; setBusy(false); }
  }
  return <form aria-label={name} onSubmit={act} className="space-y-4"><fieldset disabled={busy || !canMutate(staff)} className="space-y-4">{children(busy)}</fieldset>{error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}</form>;
}
export function EquipmentField({ label, name, value = "", type = "text", required = false, min, max, maxLength = 160 }: { label: string; name: string; value?: string | number | null; type?: string; required?: boolean; min?: number | string; max?: number | string; maxLength?: number }) {
  return <label className="block min-w-0 text-sm">{label}<input name={name} type={type} defaultValue={value ?? ""} required={required} min={min} max={max} step={type === "number" ? "1" : undefined} maxLength={maxLength} className={equipmentInput} /></label>;
}
export function EquipmentNotes({ label, name, minLength = 5, maxLength = 1500, required = true, value = "" }: { label: string; name: string; minLength?: number; maxLength?: number; required?: boolean; value?: string }) {
  return <label className="block text-sm">{label}<textarea name={name} required={required} minLength={minLength} maxLength={maxLength} defaultValue={value} rows={3} className={equipmentInput} /></label>;
}
