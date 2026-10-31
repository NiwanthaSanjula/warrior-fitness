
import { useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { hasPermissions } from "../auth/permissions";
import PermissionGate from "../components/PermissionGate";
import type { FormEvent } from "react";
import { Link } from "react-router";

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  UserRoundCheck,
  Users,
} from "lucide-react";

import { attendanceApi } from "../api/attendance.api";
import { membershipsApi } from "../api/memberships.api";
import { getApiErrorMessage } from "../api/api";

import type {
  AttendanceMember,
  AttendanceSummary,
  DailyAttendanceResponse,
  CheckInResponse,
} from "../types/attendance";

import type {
  MembershipSummary,
} from "../types/membership";

const PAGE_SIZE = 10;

function todayInColombo(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Colombo",
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "ACTIVE"
      ? "bg-emerald-500/10 text-emerald-400"
      : status === "EXPIRED"
        ? "bg-red-500/10 text-red-400"
        : "bg-orange-500/10 text-orange-400";

  return (
    <span
      className={`rounded-full px-3 py-1.5 text-xs font-bold ${style}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export default function AttendancePage() {
  const { staff } = useAuth();
  const canCheckIn = hasPermissions(staff, "attendance.check-in", "memberships.read");
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

  // Member search
  const [memberQuery, setMemberQuery] = useState("");
  const [memberTerm, setMemberTerm] = useState("");
  const [searchVersion, setSearchVersion] = useState(0);
  const [searchInputError, setSearchInputError] =
    useState("");

  const [searchLoaded, setSearchLoaded] = useState<{
    key: string;
    members: AttendanceMember[];
  } | null>(null);

  const [searchFailure, setSearchFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  // Selected member
  const [selectedMember, setSelectedMember] =
    useState<AttendanceMember | null>(null);

  const [eligibilityLoaded, setEligibilityLoaded] =
    useState<{
      memberId: string;
      summary: MembershipSummary;
    } | null>(null);

  const [eligibilityFailure, setEligibilityFailure] =
    useState<{
      memberId: string;
      message: string;
    } | null>(null);

  // Check-in action
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInError, setCheckInError] = useState("");
  const [checkInResult, setCheckInResult] = useState<{
    memberId: string;
    result: CheckInResponse;
  } | null>(null);

  const reportKey =
    `${date}:${dailySearch}:${page}:${refreshVersion}`;

  const searchKey = `${memberTerm}:${searchVersion}`;

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

  // Search registered members on form submission.
  useEffect(() => {
    if (!memberTerm) return;

    const controller = new AbortController();

    void attendanceApi
      .searchMembers(memberTerm, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;

        setSearchLoaded({
          key: searchKey,
          members: response.data,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setSearchFailure({
          key: searchKey,
          message: getApiErrorMessage(error),
        });
      });

    return () => controller.abort();
  }, [memberTerm, searchKey]);

  // Check the selected member's membership coverage.
  useEffect(() => {
    if (!selectedMember || !canCheckIn) return;

    const memberId = selectedMember.id;
    const controller = new AbortController();

    void membershipsApi
      .getSummary(memberId, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;

        setEligibilityLoaded({
          memberId,
          summary: response.data,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setEligibilityFailure({
          memberId,
          message: getApiErrorMessage(error),
        });
      });

    return () => controller.abort();
  }, [selectedMember, canCheckIn]);

  const report =
    reportLoaded?.key === reportKey
      ? reportLoaded
      : null;

  const reportError =
    reportFailure?.key === reportKey
      ? reportFailure.message
      : null;

  const matches =
    searchLoaded?.key === searchKey
      ? searchLoaded.members
      : null;

  const searchError =
    searchFailure?.key === searchKey
      ? searchFailure.message
      : null;

  const eligibility =
    selectedMember &&
    eligibilityLoaded?.memberId === selectedMember.id
      ? eligibilityLoaded.summary
      : null;

  const eligibilityError =
    selectedMember &&
    eligibilityFailure?.memberId === selectedMember.id
      ? eligibilityFailure.message
      : null;

  const eligible =
    Boolean(selectedMember?.isActive) &&
    eligibility?.status === "ACTIVE";

  const alreadyCheckedIn =
    checkInResult?.memberId === selectedMember?.id;

  const maxCheckIns = Math.max(
    1,
    ...(report?.summary.last7Days.map(
      (day) => day.checkIns
    ) ?? [])
  );

  function submitMemberSearch(event: FormEvent) {
    event.preventDefault();

    const term = memberQuery.trim();

    if (term.length < 2) {
      setSearchInputError(
        "Enter at least 2 characters to search."
      );
      return;
    }

    setSearchInputError("");
    setMemberTerm(term);
    setSearchVersion((value) => value + 1);
  }

  function selectMember(member: AttendanceMember) {
    setSelectedMember(member);
    setCheckInError("");
    setCheckInResult(null);
  }

  function submitDailySearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setDailySearch(dailySearchInput.trim());
  }

  function refreshReport() {
    setRefreshVersion((value) => value + 1);
  }

  async function handleCheckIn() {
    if (
      !canCheckIn ||
      !selectedMember ||
      !eligible ||
      checkingIn ||
      alreadyCheckedIn
    ) {
      return;
    }

    const memberId = selectedMember.id;

    setCheckingIn(true);
    setCheckInError("");

    try {
      const response =
        await attendanceApi.checkIn(memberId);

      setCheckInResult({
        memberId,
        result: response,
      });

      // Show the new check-in in today's list.
      setDate(todayInColombo());
      setDailySearch("");
      setDailySearchInput("");
      setPage(1);
      refreshReport();
    } catch (error: unknown) {
      setCheckInError(getApiErrorMessage(error));
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <div className="space-y-7">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gym-orange">
            Member Operations
          </p>

          <h1 className="mt-2 text-3xl font-black uppercase italic text-white">
            Attendance Management
          </h1>

          <p className="mt-2 text-sm text-gym-muted">
            Check members in and monitor gym visits.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshReport}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-gym-card px-4 py-3 text-sm font-bold text-zinc-200 hover:bg-white/5"
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </header>

      {/* Quick check-in */}
      <PermissionGate permissions={["attendance.check-in", "memberships.read"]}>
      <section className="rounded-2xl border border-white/10 bg-gym-card p-6">
        <div className="flex items-center gap-3">
          <UserRoundCheck
            size={23}
            className="text-gym-orange"
          />

          <div>
            <h2 className="text-xl font-black text-white">
              Quick Member Check-In
            </h2>

            <p className="mt-1 text-xs text-gym-muted">
              Search registered members by name,
              member reference or phone.
            </p>
          </div>
        </div>

        <form
          onSubmit={submitMemberSearch}
          className="mt-6 flex flex-wrap gap-2"
        >
          <input
            type="search"
            value={memberQuery}
            maxLength={80}
            disabled={checkingIn}
            onChange={(event) =>
              setMemberQuery(event.target.value)
            }
            placeholder="Search member..."
            aria-label="Find a member for check-in"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none focus:border-gym-orange"
          />

          <button
            type="submit"
            disabled={checkingIn}
            className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            <Search size={17} />
            Search
          </button>
        </form>

        {searchInputError && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {searchInputError}
          </p>
        )}

        {searchError && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {searchError}
          </p>
        )}

        {memberTerm && !matches && !searchError && (
          <p role="status" className="mt-4 text-sm text-gym-muted">
            Searching members...
          </p>
        )}

        {matches && (
          <div className="mt-4 space-y-2">
            {matches.length === 0 ? (
              <p className="rounded-xl border border-white/10 p-4 text-sm text-gym-muted">
                No matching members found.
              </p>
            ) : (
              matches.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  disabled={checkingIn}
                  onClick={() => selectMember(member)}
                  className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-left transition disabled:opacity-50 ${
                    selectedMember?.id === member.id
                      ? "border-orange-500/50 bg-orange-500/10"
                      : "border-white/10 bg-gym-bg hover:border-orange-500/30"
                  }`}
                >
                  <div>
                    <p className="font-bold text-white">
                      {member.fullName}
                    </p>

                    <p className="mt-1 text-xs text-gym-muted">
                      {member.memberId} · {member.phone}
                    </p>
                  </div>

                  <span
                    className={
                      member.isActive
                        ? "text-xs font-bold text-emerald-400"
                        : "text-xs font-bold text-red-400"
                    }
                  >
                    {member.isActive
                      ? "ACTIVE PROFILE"
                      : "INACTIVE PROFILE"}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Selected member and eligibility */}
        {selectedMember && (
          <div className="mt-6 rounded-xl border border-white/10 bg-gym-bg p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-white">
                  {selectedMember.fullName}
                </h3>

                <p className="mt-1 text-xs text-gym-muted">
                  {selectedMember.memberId}
                </p>
              </div>

              {eligibility && (
                <StatusBadge status={eligibility.status} />
              )}
            </div>

            {eligibilityError && (
              <p role="alert" className="mt-4 text-sm text-red-400">
                {eligibilityError}
              </p>
            )}

            {!eligibility && !eligibilityError && (
              <p role="status" className="mt-4 text-sm text-gym-muted">
                Checking membership eligibility...
              </p>
            )}

            {eligibility && (
              <div className="mt-5 space-y-2 text-sm">
                <p className="text-zinc-300">
                  Current plan:{" "}
                  <span className="font-bold text-white">
                    {eligibility.currentMembership
                      ?.planSnapshot.name ?? "None"}
                  </span>
                </p>

                <p className="text-zinc-300">
                  Membership valid through:{" "}
                  <span className="font-bold text-white">
                    {eligibility.currentMembership
                      ? formatDate(
                          eligibility.currentMembership.lastValidDate
                        )
                      : "—"}
                  </span>
                </p>

                {!eligible && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                    <AlertCircle
                      size={18}
                      className="shrink-0"
                    />

                    <p>
                      {selectedMember.isActive
                        ? "This member has no valid membership today. Check-in is blocked."
                        : "This member profile is inactive. Check-in is blocked."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {checkInResult?.memberId ===
              selectedMember.id && (
              <div
                role="status"
                className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300"
              >
                <CheckCircle2
                  size={19}
                  className="shrink-0"
                />
                {checkInResult.result.message}{" "}
                ({formatTime(
                  checkInResult.result.data.checkedInAt
                )})
              </div>
            )}

            {checkInError && (
              <div
                role="alert"
                className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400"
              >
                {checkInError}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleCheckIn()}
                disabled={
                  !eligible ||
                  checkingIn ||
                  alreadyCheckedIn
                }
                className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-6 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 size={18} />
                {checkingIn
                  ? "Checking In..."
                  : alreadyCheckedIn
                    ? "Check-In Recorded"
                    : "Check In Member"}
              </button>

              <Link
                to={`/members/${selectedMember.id}`}
                className="text-sm font-bold text-gym-orange hover:underline"
              >
                View Member Profile
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Reporting */}
      </PermissionGate>
      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white">
              Attendance Overview
            </h2>

            <p className="mt-1 text-sm text-gym-muted">
              Reports for the selected calendar date.
            </p>
          </div>

          <div>
            <label
              htmlFor="attendance-date"
              className="mb-2 block text-xs text-gym-muted"
            >
              Report Date
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
                  label: "Selected Day Check-Ins",
                  value: report.summary.totalCheckIns,
                },
                {
                  label: "Previous Day",
                  value: report.summary.previousDayCheckIns,
                },
                {
                  label: "Change From Previous Day",
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

            {/* Seven-day chart */}
            <div className="rounded-2xl border border-white/10 bg-gym-card p-6">
              <h3 className="text-lg font-black text-white">
                Last 7 Days
              </h3>

              <div className="mt-7 flex h-44 items-end gap-3">
                {report.summary.last7Days.map(
                  (day) => (
                    <div
                      key={day.date}
                      className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                      title={`${formatDate(day.date)}: ${day.checkIns} check-ins`}
                    >
                      <span className="text-xs text-zinc-400">
                        {day.checkIns}
                      </span>

                      <div className="flex h-28 w-full items-end justify-center rounded-t-md bg-white/5">
                        <div
                          className="w-full max-w-12 rounded-t-md bg-gym-orange"
                          style={{
                            height: `${
                              (day.checkIns / maxCheckIns) * 100
                            }%`,
                          }}
                        />
                      </div>

                      <span className="text-[10px] text-zinc-400 sm:text-xs">
                        {new Intl.DateTimeFormat(
                          "en-GB",
                          {
                            weekday: "short",
                            timeZone: "UTC",
                          }
                        ).format(
                          new Date(
                            `${day.date}T00:00:00.000Z`
                          )
                        )}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Daily attendance list */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
              <div className="space-y-4 border-b border-white/10 p-6">
                <div>
                  <h3 className="text-lg font-black text-white">
                    Daily Check-Ins
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
                    placeholder="Search today's visitors..."
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
                              <Link
                                to={`/members/${record.memberId}`}
                                className="font-bold text-white hover:text-gym-orange"
                              >
                                {record.memberName ??
                                  "Unknown Member"}
                              </Link>
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

      <p className="flex items-start gap-2 text-xs text-gym-muted">
        <Users size={16} className="shrink-0" />
        Attendance eligibility is checked again by the
        backend when staff submit a check-in. Payment
        balances do not automatically block entry.
      </p>
    </div>
  );
}
