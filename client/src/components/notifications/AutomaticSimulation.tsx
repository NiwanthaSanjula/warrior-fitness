import type { AutomaticSimulationStatus } from "../../api/notifications.api";
import { formatFinancialTimestamp } from "../../utils/financial";
import { formatGymDate } from "../../utils/dashboard";

export default function AutomaticSimulation({ status, loading }: { status?: AutomaticSimulationStatus; loading: boolean }) {
  const last = status?.lastRun;
  return <section aria-label="Automatic simulation" className="space-y-4 rounded-2xl border border-white/10 bg-gym-card p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Automatic simulation</h2><p className={`rounded-full px-3 py-1 text-xs font-bold ${status?.enabled ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-gym-muted"}`}>{loading ? "Loading schedule…" : status ? status.enabled ? "Enabled" : "Disabled" : "Status unavailable"}</p></div>
    <p className="text-sm leading-6 text-gym-muted">Daily at 9:00 AM Asia/Colombo when enabled. The backend process must be running. This records SIMULATED reminders and never sends WhatsApp messages.</p>
    {status?.nextRunAt && <p className="text-sm">Next daily slot: {formatFinancialTimestamp(status.nextRunAt)} · Colombo</p>}
    {!loading && status && <div className="rounded-xl border border-white/10 p-4 text-sm leading-6">
      {!status.historyAvailable ? <p className="text-amber-200">Execution history unavailable. Scheduling configuration is shown above; no execution result can be confirmed.</p>
        : !last ? <p className="text-gym-muted">No automatic execution recorded yet.</p>
        : <><p className="font-bold">Last automatic run: {last.status === "SUCCEEDED" ? "Simulation completed" : last.status === "FAILED" ? "Failed — review history and retry manually" : "Started — completion unconfirmed"}</p><p className="mt-2 text-gym-muted">Scheduled date: {formatGymDate(last.scheduledDate)} · Started {formatFinancialTimestamp(last.startedAt)} · Colombo</p>
          {last.completedAt && <p className="text-gym-muted">Finished {formatFinancialTimestamp(last.completedAt)} · Colombo</p>}
          {last.status === "SUCCEEDED" && last.summary && <p className="mt-2 text-emerald-300">{last.summary.simulated} simulated · {last.summary.duplicates} already recorded · {last.summary.skipped} skipped. No real messages sent.</p>}
          {last.status === "RUNNING" && <p className="mt-2 text-amber-200">This run may still be active or may have been interrupted. Completion has not been recorded.</p>}
        </>}
    </div>}
  </section>;
}
