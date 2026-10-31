import { useCallback, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";
import { financialApi } from "../api/financial.api";
import { getApiErrorMessage } from "../api/api";
import { useAuth } from "../auth/auth-context";
import { hasPermissions } from "../auth/permissions";
import { useDashboardResource } from "../hooks/useDashboardResource";
import { DashboardPanel } from "../components/dashboard/DashboardWidgets";
import { AmountTile, ClosingSnapshot, FinancialFrame, FinancialNotice, MethodTotals } from "../components/financial/FinancialWidgets";
import type { ClosingInput, ClosingRecord, DayPreview } from "../types/financial";
import { closingFormSchema } from "../validations/financial.schema";
import { cashPreview, definiteFinancialRejection } from "../utils/financial";
import { todayInColombo } from "../utils/dashboard";

const inputClass = "mt-1 w-full rounded-lg border border-white/15 bg-gym-bg px-3 py-2.5 text-sm text-white focus:border-gym-orange focus:outline-none";
const buttonClass = "rounded-lg bg-gym-orange px-5 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50";

function ClosingForm({ preview, locked, submit }: {
  preview: Extract<DayPreview, { status: "OPEN" }>; locked: boolean;
  submit: (input: Omit<ClosingInput, "requestId">) => void;
}) {
  const [opening, setOpening] = useState("");
  const [actual, setActual] = useState("");
  const [explanation, setExplanation] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const { expected, variance } = cashPreview(opening, actual, preview.totals);
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    const parsed = closingFormSchema.safeParse({ openingCashLkr: opening, actualCashLkr: actual, explanation, confirmed });
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(". ")); return; }
    if (variance !== 0 && parsed.data.explanation.length < 5) { setError("Explain the cash shortage or overage in at least 5 characters"); return; }
    setError("");
    submit({ date: preview.date, expectedRevision: preview.revision, openingCashLkr: parsed.data.openingCashLkr, actualCashLkr: parsed.data.actualCashLkr, explanation: parsed.data.explanation });
  }
  return <div className="space-y-5">
    <MethodTotals totals={preview.totals} />
    <p className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-4 text-sm leading-6 text-orange-200">Expected cash = Opening cash + Cash collections − Cash expenses. Record all entries first: finalizing blocks new payments and expenses for this gym date and cannot be undone.</p>
    <FinancialNotice message={error} error />
    <form aria-label="Finalize daily closing" onSubmit={handleSubmit}>
      <fieldset disabled={locked} className="space-y-5 disabled:opacity-60">
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Opening cash (LKR)<input className={inputClass} type="number" min="0" max="1000000000" step="1" required value={opening} onChange={(event) => setOpening(event.target.value)} /></label><label className="text-sm">Actual physical closing cash (LKR)<input className={inputClass} type="number" min="0" max="1000000000" step="1" required value={actual} onChange={(event) => setActual(event.target.value)} /></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><AmountTile label="Expected closing cash" amount={expected} /><AmountTile label={variance === null ? "Cash difference" : variance < 0 ? "Shortage" : variance > 0 ? "Overage" : "Balanced"} amount={variance === null ? null : Math.abs(variance)} /></div>
        <label className="block text-sm">Discrepancy explanation{variance !== null && variance !== 0 ? " (required)" : " (optional)"}<textarea className={inputClass} rows={3} maxLength={500} value={explanation} onChange={(event) => setExplanation(event.target.value)} /></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 accent-orange-500" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />All entries for this day are recorded; finalize this closing permanently.</label>
        <button className={buttonClass} type="submit">Finalize closing</button>
      </fieldset>
    </form>
  </div>;
}

export default function DailyCashClosingPage() {
  const { staff } = useAuth();
  const allowed = staff?.role === "ADMIN" && hasPermissions(staff, "cash-closings.manage");
  const [params, setParams] = useSearchParams();
  const date = params.get("date") || todayInColombo();
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState<ClosingInput | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [completed, setCompleted] = useState<ClosingRecord | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback((signal: AbortSignal) => financialApi.getDay(date, signal), [date]);
  const day = useDashboardResource(allowed, `${staff?.id}:${date}:${version}`, load);
  const locked = busy || pending !== null;
  async function send(payload: ClosingInput) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(payload); setBusy(true); setError(""); setNotice("");
    try {
      const result = await financialApi.closeDay(payload);
      setCompleted(result.data); setPending(null);
      setNotice(result.replayed ? "Closing already saved. No duplicate was created." : "Daily closing saved. The gym date is now locked.");
    } catch (failure) {
      const definite = definiteFinancialRejection(failure);
      if (definite) setPending(null);
      setError(`${getApiErrorMessage(failure)}${definite ? "" : " Outcome unconfirmed. Retry the same closing to confirm the saved result."}`);
    } finally { setBusy(false); inFlight.current = false; }
  }
  if (!allowed) return <FinancialNotice error message="Admin access is required for Daily Cash Closing." />;
  return <FinancialFrame title="Daily Cash Closing" subtitle="One gym-wide closing per Colombo calendar day. Review the live ledger, count physical cash, and preserve a final snapshot." tools={<button className={buttonClass} disabled={locked} onClick={() => { setCompleted(null); setVersion((value) => value + 1); }}>Refresh day</button>}>
    <label className="block max-w-xs text-sm">Gym date<input className={inputClass} type="date" min="2007-01-01" max={todayInColombo()} value={date} disabled={locked} onChange={(event) => { if (event.target.value) { setParams({ date: event.target.value }); setError(""); setNotice(""); } }} /></label>
    <FinancialNotice message={notice} /><FinancialNotice message={error} error />
    {busy && <p role="status" className="text-sm text-gym-muted">Saving closing…</p>}
    {pending && !busy && <button className={buttonClass} onClick={() => void send(pending)}>Retry same closing</button>}
    {completed?.date === date ? <ClosingSnapshot closing={completed} /> : <DashboardPanel title="Day reconciliation" description="Cash counts use payment received timestamps and expense dates in Asia/Colombo. Refresh before finalizing if the ledger changes." resource={day}>{(preview) => preview.status === "CLOSED" ? <ClosingSnapshot closing={preview.closing} /> : <ClosingForm key={`${date}:${preview.revision}`} preview={preview} locked={locked} submit={(input) => void send({ ...input, requestId: crypto.randomUUID() })} />}</DashboardPanel>}
  </FinancialFrame>;
}
