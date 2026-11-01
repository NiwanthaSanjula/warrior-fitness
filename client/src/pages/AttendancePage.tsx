import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, RefreshCw, UserRoundCheck } from "lucide-react";
import { useAuth } from "../auth/auth-context";
import { canUseFrontDesk, hasPermissions } from "../auth/permissions";
import { attendanceApi } from "../api/attendance.api";
import { getApiErrorMessage } from "../api/api";
import { DashboardChart } from "../components/dashboard/DashboardCharts";
import { todayInColombo, formatGymDate as formatDate } from "../utils/dashboard";
import type { AttendanceSummary, DailyAttendanceResponse } from "../types/attendance";

const PAGE_SIZE = 10;
function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-LK", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Colombo" }).format(new Date(value));
}
export default function AttendancePage() {
  const { staff } = useAuth();
  const today = todayInColombo();
  // Reporting
  const [date, setDate] = useState(today);
  const [dailySearchInput, setDailySearchInput] =
    useState("");
  const [dailySearch, setDailySearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] =
    useState(0);

  const [reportLoaded, setReportLoaded] = useState<{
    key: string;
    daily: DailyAttendanceResponse;
    summary: AttendanceSummary;
  } | null>(null);

  const [reportFailure, setReportFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const reportKey = `${date}:${dailySearch}:${page}:${refreshVersion}`;
  // Load daily attendance and statistics.
  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      attendanceApi.getDaily(
        {
          date,
          search: dailySearch,
          page,
          limit: PAGE_SIZE,
        },
        controller.signal
      ),
      attendanceApi.getSummary(
        date,
        controller.signal
      ),
    ])
      .then(([daily, summary]) => {
        if (controller.signal.aborted) return;

        setReportLoaded({
          key: reportKey,
          daily,
          summary: summary.data,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setReportFailure({
          key: reportKey,
          message: getApiErrorMessage(error),
        });
      });

    return () => controller.abort();
  }, [date, dailySearch, page, reportKey]);

  const report =
    reportLoaded?.key === reportKey
      ? reportLoaded
      : null;

  const reportError =
    reportFailure?.key === reportKey
      ? reportFailure.message
      : null;

  function submitDailySearch(event: FormEvent) { event.preventDefault(); setPage(1); setDailySearch(dailySearchInput.trim()); }
  function refreshReport() { setRefreshVersion(value => value + 1); }
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Attendance</h1><div className="flex gap-2">{canUseFrontDesk(staff) && <Link to="/front-desk" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gym-orange px-4 text-sm font-semibold text-white"><UserRoundCheck size={17} />Front Desk</Link>}<button type="button" onClick={refreshReport} aria-label="Refresh attendance" className="rounded-xl border border-white/15 p-3 text-zinc-300"><RefreshCw size={16} /></button></div></header>
      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white">
              Visit history
            </h2>
          </div>

          <div>
            <label
              htmlFor="attendance-date"
              className="mb-2 block text-xs text-gym-muted"
            >
              Date
            </label>

            <input
              id="attendance-date"
              type="date"
              value={date}
              max={today}
              onChange={(event) => {
                setDate(event.target.value || today);
                setPage(1);
              }}
              className="rounded-xl border border-white/10 bg-gym-card px-4 py-3 text-sm text-white"
            />
          </div>
        </div>

        {reportError && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400"
          >
            {reportError}
          </div>
        )}

        {!report && !reportError && (
          <p role="status" className="text-sm text-gym-muted">
            Loading attendance reports...
          </p>
        )}

        {report && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  label: "Visits",
                  value: report.summary.totalCheckIns,
                },
                {
                  label: "Previous Day",
                  value: report.summary.previousDayCheckIns,
                },
                {
                  label: "Change",
                  value: report.summary.changeFromPreviousDay,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/10 bg-gym-card p-5"
                >
                  <p className="text-xs font-bold uppercase text-gym-muted">
                    {item.label}
                  </p>

                  <p className="mt-4 text-3xl font-black text-white">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-gym-card p-5"><h3 className="mb-4 text-sm font-semibold">Last 7 days</h3><DashboardChart label="Attendance history trend" kind="bar" series={[{ label: "Check-ins", color: "#60a5fa", data: report.summary.last7Days.map(day => ({ date: day.date, value: day.checkIns })) }]} /></div>
            {/* Daily attendance list */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
              <div className="space-y-4 border-b border-white/10 p-6">
                <div>
                  <h3 className="text-lg font-black text-white">
                    Visits
                  </h3>

                  <p className="mt-1 text-xs text-gym-muted">
                    {formatDate(date)} ·{" "}
                    {report.daily.total} matching visits
                  </p>
                </div>

                <form
                  onSubmit={submitDailySearch}
                  className="flex flex-wrap gap-2"
                >
                  <input
                    type="search"
                    value={dailySearchInput}
                    maxLength={80}
                    onChange={(event) =>
                      setDailySearchInput(event.target.value)
                    }
                    placeholder="Search visits..."
                    aria-label="Search daily check-ins"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white"
                  />

                  <button
                    type="submit"
                    className="rounded-xl border border-orange-500/30 px-5 py-3 text-sm font-bold text-gym-orange"
                  >
                    Search
                  </button>
                </form>
              </div>

              {report.daily.data.length === 0 ? (
                <p className="p-8 text-center text-sm text-gym-muted">
                  No matching check-ins for this date.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead className="border-b border-white/10 bg-gym-bg text-xs uppercase text-gym-muted">
                      <tr>
                        <th className="px-5 py-4">Member</th>
                        <th className="px-5 py-4">Member ID</th>
                        <th className="px-5 py-4">Phone</th>
                        <th className="px-5 py-4">Check-In Time</th>
                      </tr>
                    </thead>

                    <tbody>
                      {report.daily.data.map(
                        (record) => (
                          <tr
                            key={record.id}
                            className="border-b border-white/5"
                          >
                            <td className="px-5 py-4">
                              {hasPermissions(staff, "members.read") ? <Link to={`/members/${record.memberId}`} className="font-semibold text-white hover:text-gym-orange">{record.memberName ?? "Unknown Member"}</Link> : <span className="font-semibold text-white">{record.memberName ?? "Unknown Member"}</span>}
                            </td>

                            <td className="px-5 py-4 text-zinc-300">
                              {record.memberReference ?? "—"}
                            </td>

                            <td className="px-5 py-4 text-zinc-300">
                              {record.memberPhone ?? "—"}
                            </td>

                            <td className="px-5 py-4 font-semibold text-gym-orange">
                              {formatTime(record.checkedInAt)}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-white/10 p-5">
                <span className="text-xs text-gym-muted">
                  Page {page} of{" "}
                  {Math.max(1, report.daily.totalPages)}
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label="Previous attendance page"
                    disabled={page <= 1}
                    onClick={() =>
                      setPage((value) =>
                        Math.max(1, value - 1)
                      )
                    }
                    className="rounded-lg border border-white/10 p-2 text-white disabled:opacity-30"
                  >
                    <ChevronLeft size={17} />
                  </button>

                  <button
                    type="button"
                    aria-label="Next attendance page"
                    disabled={
                      page >= report.daily.totalPages
                    }
                    onClick={() =>
                      setPage((value) => value + 1)
                    }
                    className="rounded-lg border border-white/10 p-2 text-white disabled:opacity-30"
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
  </div>;
}
