import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { staffApi } from "../../api/staff.api";
import { getApiErrorMessage } from "../../api/api";
import { useAuth } from "../../auth/auth-context";
import type { Permission } from "../../auth/permissions";
import type { DashboardResource } from "../../hooks/useDashboardResource";
import { DashboardPanel } from "../dashboard/DashboardWidgets";
import type { ManagedStaff, StaffAction, StaffCatalogue } from "../../types/staff";
import { createStaffFormSchema, staffProfileSchema } from "../../validations/staff.schema";
import StaffConfirmDialog from "./StaffConfirmDialog";

const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-gym-bg px-3 py-3 text-sm text-white focus:border-gym-orange focus:outline-none";
const primaryClass = "rounded-lg bg-gym-orange px-4 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40";

export function CreateStaffForm({ created, cancel }: { created: (staff: ManagedStaff) => void; cancel: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const parsed = createStaffFormSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(". ")); return; }
    inFlight.current = true; setBusy(true); setError("");
    try {
      const { fullName, email, password } = parsed.data;
      const response = await staffApi.createStaff({ fullName, email, password });
      form.reset(); created(response.staff);
    } catch (failure) { setError(`${getApiErrorMessage(failure)} Check the directory before repeating an unconfirmed request.`); }
    finally {
      for (const input of form.querySelectorAll<HTMLInputElement>("input[type='password']")) input.value = "";
      inFlight.current = false; setBusy(false);
    }
  }
  return <section aria-label="Create Receptionist" className="rounded-2xl border border-orange-500/25 bg-gym-card p-5 sm:p-6">
    <h2 className="text-xl font-black">Create Receptionist</h2><p className="mt-2 text-sm leading-6 text-gym-muted">New accounts are active Receptionists with the standard operational permissions. Customize access after creation.</p>
    <form aria-label="Create staff account" onSubmit={submit} className="mt-5 space-y-4"><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">Full name<input className={inputClass} name="fullName" minLength={2} maxLength={100} required autoComplete="off" /></label>
      <label className="text-sm">Email address<input className={inputClass} name="email" type="email" maxLength={254} required autoComplete="off" /></label>
      <label className="text-sm">Initial password<input className={inputClass} name="password" type="password" autoComplete="new-password" required /></label>
      <label className="text-sm">Confirm initial password<input className={inputClass} name="confirmPassword" type="password" autoComplete="new-password" required /></label>
      <p className="text-xs text-gym-muted sm:col-span-2">Use at least 12 characters and no more than 72 UTF-8 bytes. Passwords are never shown in the directory or audit history.</p>
      <div className="flex gap-3 sm:col-span-2"><button type="submit" className={primaryClass}>{busy ? "Creating…" : "Create Receptionist"}</button><button type="button" onClick={cancel} className="rounded-lg border border-white/15 px-4 py-3 text-sm">Cancel creation</button></div>
    </fieldset>{error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}</form>
  </section>;
}

function PermissionEditor({ target, catalogue, confirm }: { target: ManagedStaff; catalogue: StaffCatalogue; confirm: (action: StaffAction) => void }) {
  const [selected, setSelected] = useState<Permission[]>([...target.permissions]);
  return <div className="space-y-4">
    <p className="text-sm text-gym-muted">{selected.length} operations selected. An empty selection denies all business operations. Membership workflows also need member, membership and plan viewing; receipts need invoice, payment and member viewing.</p>
    <div className="flex flex-wrap gap-3 text-xs"><button type="button" className="rounded-lg border border-white/15 px-3 py-2 font-bold" onClick={() => setSelected([...catalogue.defaultPermissions])}>Select all operational permissions</button><button type="button" className="rounded-lg border border-white/15 px-3 py-2 font-bold" onClick={() => setSelected([])}>Clear selection</button></div>
    <div className="grid gap-3 sm:grid-cols-2">{catalogue.groups.map((group) => <fieldset key={group.module} className="rounded-xl border border-white/10 p-4"><legend className="px-1 text-sm font-bold text-orange-300">{group.label}</legend>{group.permissions.map((permission) => <label key={permission.key} className="flex min-h-10 items-start gap-3 py-2 text-sm"><input className="mt-1 shrink-0 accent-orange-500" type="checkbox" checked={selected.includes(permission.key)} onChange={(event) => setSelected(event.target.checked ? [...selected, permission.key] : selected.filter((key) => key !== permission.key))} />{permission.label}</label>)}</fieldset>)}</div>
    <div className="flex flex-wrap gap-3"><button type="button" className={primaryClass} onClick={() => confirm({ kind: "permissions", permissions: catalogue.defaultPermissions.filter((key) => selected.includes(key)) })}>Save permission choices</button><button type="button" className="rounded-lg border border-white/15 px-4 py-3 text-sm font-bold" onClick={() => confirm({ kind: "permissions", permissions: null })}>Restore default permissions</button></div>
  </div>;
}

export function StaffEditor({ target, catalogue, changed }: { target: ManagedStaff; catalogue: DashboardResource<StaffCatalogue>; changed: (message: string) => void }) {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(target.fullName);
  const [email, setEmail] = useState(target.email);
  const [error, setError] = useState("");
  const [action, setAction] = useState<StaffAction | null>(null);
  const self = staff?.id === target.id;
  async function apply(password?: string) {
    if (!action) return;
    const expectedVersion = target.version;
    const response = action.kind === "profile" ? await staffApi.updateProfile(target.id, { fullName: action.fullName, email: action.email, expectedVersion })
      : action.kind === "permissions" ? await staffApi.updatePermissions(target.id, { permissions: action.permissions, expectedVersion })
      : action.kind === "status" ? await staffApi.updateStatus(target.id, { isActive: action.isActive, expectedVersion })
      : await staffApi.resetPassword(target.id, { password: password!, expectedVersion });
    setAction(null);
    if (self && response.changed) {
      try {
        await logout();
        navigate("/login", { replace: true });
      } catch {
        // The mutation already revoked this session. A full navigation clears
        // stale auth state even when the cookie-clearing request is unavailable.
        window.location.replace("/login");
      }
      return;
    }
    changed(response.changed === false ? "No changes were needed; no audit event was added." : "Staff account updated. Existing sessions were revoked and the change was recorded in audit history.");
  }
  function profile(event: FormEvent) {
    event.preventDefault();
    const parsed = staffProfileSchema.safeParse({ fullName, email });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(". ")); return; }
    setError(""); setAction({ kind: "profile", ...parsed.data });
  }
  return <div className="space-y-5">
    <section aria-label="Staff profile editor" className="rounded-2xl border border-white/10 bg-gym-card p-5 sm:p-6">
      <p className="text-xs font-bold uppercase text-orange-400">{target.role === "ADMIN" ? "Administrator · Protected role" : "Receptionist"}{self ? " · Your account" : ""}</p>
      <h2 className="mt-2 break-words text-xl font-black">{target.fullName}</h2><p className="mt-2 text-xs text-gym-muted">{target.isActive ? "Active" : "Inactive"} · {target.permissionMode === "DEFAULT" ? "Default access" : "Custom access"}. Profile changes also sign out existing sessions.</p>
      <form aria-label="Edit staff profile" onSubmit={profile} className="mt-5 space-y-4"><label className="block text-sm">Full name<input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={2} maxLength={100} /></label><label className="block text-sm">Email address<input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} /></label><button type="submit" className={primaryClass}>Save staff profile</button>{error && <p role="alert" className="text-sm text-red-200">{error}</p>}</form>
    </section>
    {target.role === "RECEPTIONIST" && <DashboardPanel title="Receptionist permissions" description="Only operational permissions are assignable. Admin-only actions remain protected." resource={catalogue}>{(data) => <PermissionEditor target={target} catalogue={data} confirm={setAction} />}</DashboardPanel>}
    <section aria-label="Staff account security" className="space-y-4 rounded-2xl border border-white/10 bg-gym-card p-5 sm:p-6"><h3 className="font-bold">Account security</h3><p className="text-sm leading-6 text-gym-muted">Password resets and access changes revoke all existing sessions. Reactivating an account does not restore its old sessions.</p>{target.role === "ADMIN" && <p className="text-sm text-amber-200">Admin role, activation and full-access permissions are protected. This workflow cannot deactivate or demote any Admin, including the last active Admin.</p>}<div className="flex flex-wrap gap-3"><button type="button" className="rounded-lg border border-white/15 px-4 py-3 text-sm font-bold" onClick={() => setAction({ kind: "password" })}>Reset password</button>{target.role === "RECEPTIONIST" && !self && <button type="button" className={`rounded-lg border px-4 py-3 text-sm font-bold ${target.isActive ? "border-red-500/30 text-red-300" : "border-emerald-500/30 text-emerald-300"}`} onClick={() => setAction({ kind: "status", isActive: !target.isActive })}>{target.isActive ? "Deactivate account" : "Activate account"}</button>}</div></section>
    {action && <StaffConfirmDialog target={target} action={action} self={self} cancel={() => setAction(null)} confirm={apply} />}
  </div>;
}
