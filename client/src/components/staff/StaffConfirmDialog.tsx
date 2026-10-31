import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/api";
import { staffPasswordSchema } from "../../validations/staff.schema";
import type { ManagedStaff, StaffAction } from "../../types/staff";

export default function StaffConfirmDialog({ target, action, self, cancel, confirm }: {
  target: ManagedStaff; action: StaffAction; self: boolean; cancel: () => void;
  confirm: (password?: string) => Promise<void>;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const title = action.kind === "password" ? "Reset staff password" : action.kind === "profile" ? "Confirm profile changes" : action.kind === "permissions" ? (action.permissions === null ? "Restore default permissions" : "Confirm permission changes") : action.isActive ? "Activate staff account" : "Deactivate staff account";
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    container.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (action.kind === "password") {
      const parsed = staffPasswordSchema.safeParse({ password, confirmPassword });
      if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(". ")); return; }
    }
    inFlight.current = true; setBusy(true); setError("");
    try { await confirm(action.kind === "password" ? password : undefined); }
    catch (failure) { setError(`${getApiErrorMessage(failure)} Refresh staff and review history if the result is uncertain.`); }
    finally { setPassword(""); setConfirmPassword(""); setBusy(false); inFlight.current = false; }
  }
  const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-gym-bg px-3 py-3 text-white";
  return <div className="fixed inset-0 z-70 flex items-center justify-center overflow-y-auto bg-black/80 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) cancel(); }}>
    <div ref={container} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} className="my-auto w-full max-w-lg rounded-2xl border border-white/15 bg-gym-card p-6 shadow-2xl" onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); if (!busy) cancel(); }
      if (event.key === "Tab") {
        const controls = [...(container.current?.querySelectorAll<HTMLElement>("button, input, [tabindex='0']") ?? [])].filter((control) => !control.matches(":disabled"));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <h2 id={`${id}-title`} className="text-xl font-black text-white">{title}</h2>
      <p id={`${id}-description`} className="mt-3 text-sm leading-6 text-gym-muted">Account: <strong className="text-white">{target.fullName}</strong>. Applying changes signs out this account on all devices. {self ? "This is your account. You will need to sign in again." : "The staff member must sign in again to use the updated settings."}</p>
      {action.kind === "status" && !action.isActive && <p className="mt-3 text-sm text-amber-300">This staff member will be unable to sign in. Historical records remain available.</p>}
      <form onSubmit={submit} className="mt-5 space-y-4">
        {action.kind === "password" && <fieldset disabled={busy} className="space-y-4"><label className="block text-sm">New password<input className={inputClass} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label className="block text-sm">Confirm new password<input className={inputClass} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label><p className="text-xs text-gym-muted">At least 12 characters; at most 72 UTF-8 bytes. Share it securely with the staff member.</p></fieldset>}
        {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3"><button data-initial-focus type="button" onClick={cancel} disabled={busy} className="rounded-lg border border-white/15 px-4 py-3 text-sm font-bold disabled:opacity-40">Cancel</button><button type="submit" disabled={busy} className="rounded-lg bg-gym-orange px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{busy ? "Applying…" : "Confirm changes"}</button></div>
      </form>
    </div>
  </div>;
}
