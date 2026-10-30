
import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
  AlertCircle,
  CalendarCheck,
  CalendarDays,
  Clock3,
  History,
  RefreshCw,
  Users,
} from "lucide-react";

import { attendanceApi } from "../../api/attendance.api";
import { getApiErrorMessage } from "../../api/api";

import type {
  AttendanceRecord,
} from "../../types/attendance";

interface AttendanceOverviewProps {
  memberId: string;
  refreshVersion?: number;
}

interface AttendanceOverviewData {
  totalVisits: number;
  last7DaysVisits: number;
  recentVisits: AttendanceRecord[];
}

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

function addDays(
  dateString: string,
  count: number
): string {
  const date = new Date(
    `${dateString}T00:00:00.000Z`
  );

  date.setUTCDate(date.getUTCDate() + count);

  return date.toISOString().slice(0, 10);
}

function daysBetween(
  from: string,
  to: string
): number {
  const fromMs = Date.parse(
    `${from}T00:00:00.000Z`
  );

  const toMs = Date.parse(
    `${to}T00:00:00.000Z`
  );

  return Math.max(
    0,
    Math.round((toMs - fromMs) / 86400000)
  );
}

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(
    new Date(`${dateString}T00:00:00.000Z`)
  );
}

function formatTime(dateString: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Colombo",
  }).format(new Date(dateString));
}

export default function AttendanceOverview({
  memberId,
  refreshVersion = 0,
}: AttendanceOverviewProps) {
  const [retryVersion, setRetryVersion] =
    useState(0);

  const [loaded, setLoaded] = useState<{
    key: string;
    data: AttendanceOverviewData;
  } | null>(null);

  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const today = todayInColombo();
  const sevenDayStart = addDays(today, -6);

  const requestKey =
    `${memberId}:${today}:${refreshVersion}:${retryVersion}`;

  useEffect(() => {
    const controller = new AbortController();

    // First request: complete visit count
    // plus the five most recent records.
    //
    // Second request: visit count from the
    // last seven calendar days, including today.
    void Promise.all([
      attendanceApi.getMemberHistory(
        memberId,
        {
          page: 1,
          limit: 5,
        },
        controller.signal
      ),

      attendanceApi.getMemberHistory(
        memberId,
        {
          from: sevenDayStart,
          to: today,
          page: 1,
          limit: 1,
        },
        controller.signal
      ),
    ])
      .then(([history, lastSevenDays]) => {
        if (controller.signal.aborted) return;

        setLoaded({
          key: requestKey,
          data: {
            totalVisits: history.total,
            last7DaysVisits: lastSevenDays.total,
            recentVisits: history.data,
          },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setFailure({
          key: requestKey,
          message: getApiErrorMessage(error),
        });
      });

    return () => controller.abort();
  }, [
    memberId,
    today,
    sevenDayStart,
    requestKey,
  ]);

  const data =
    loaded?.key === requestKey
      ? loaded.data
      : null;

  const error =
    failure?.key === requestKey
      ? failure.message
      : null;

  if (!data && !error) {
    return (
      <section
        role="status"
        className="animate-pulse rounded-2xl border border-white/10 bg-gym-card p-6"
      >
        <div className="h-6 w-52 rounded bg-white/10" />

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-24 rounded-xl bg-white/5"
            />
          ))}
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-2xl border border-red-500/20 bg-gym-card p-6">
        <div className="flex items-center gap-3">
          <AlertCircle
            size={22}
            className="text-red-400"
          />

          <h2 className="font-bold text-white">
            Unable to load attendance overview
          </h2>
        </div>

        <p
          role="alert"
          className="mt-3 text-sm text-red-400"
        >
          {error || "Attendance information unavailable"}
        </p>

        <button
          type="button"
          onClick={() =>
            setRetryVersion((value) => value + 1)
          }
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gym-orange px-4 py-2.5 text-sm font-bold text-white"
        >
          <RefreshCw size={16} />
          Try Again
        </button>
      </section>
    );
  }

  const lastVisit = data.recentVisits[0] ?? null;

  const daysSinceLastVisit = lastVisit
    ? daysBetween(
        lastVisit.attendanceDate,
        today
      )
    : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 p-6">
        <div className="flex items-center gap-3">
          <CalendarCheck
            size={23}
            className="text-gym-orange"
          />

          <div>
            <h2 className="text-xl font-black text-white">
              Attendance Overview
            </h2>

            <p className="mt-1 text-xs text-gym-muted">
              Member visit history and activity
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Refresh attendance overview"
            onClick={() =>
              setRetryVersion((value) => value + 1)
            }
            className="rounded-lg border border-white/10 p-2.5 text-zinc-300 hover:bg-white/5"
          >
            <RefreshCw size={18} />
          </button>

          <Link
            to="/attendance"
            className="rounded-xl bg-gym-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
          >
            Attendance Dashboard
          </Link>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {/* Statistics */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-gym-bg p-5">
            <Users
              size={20}
              className="text-gym-orange"
            />

            <p className="mt-4 text-xs font-bold uppercase text-gym-muted">
              Total Visits
            </p>

            <p className="mt-2 text-3xl font-black text-white">
              {data.totalVisits}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-gym-bg p-5">
            <CalendarDays
              size={20}
              className="text-gym-orange"
            />

            <p className="mt-4 text-xs font-bold uppercase text-gym-muted">
              Last 7 Days
            </p>

            <p className="mt-2 text-3xl font-black text-white">
              {data.last7DaysVisits}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-gym-bg p-5">
            <Clock3
              size={20}
              className="text-gym-orange"
            />

            <p className="mt-4 text-xs font-bold uppercase text-gym-muted">
              Last Visit
            </p>

            <p className="mt-2 text-lg font-black text-white">
              {lastVisit
                ? formatDate(lastVisit.attendanceDate)
                : "No visits"}
            </p>

            {daysSinceLastVisit !== null && (
              <p className="mt-1 text-xs text-gym-muted">
                {daysSinceLastVisit === 0
                  ? "Visited today"
                  : daysSinceLastVisit === 1
                    ? "1 day ago"
                    : `${daysSinceLastVisit} days ago`}
              </p>
            )}
          </div>
        </div>

        {/* No attendance history */}
        {data.totalVisits === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
            <History
              size={32}
              className="mx-auto text-zinc-500"
            />

            <h3 className="mt-4 font-bold text-white">
              No attendance recorded yet
            </h3>

            <p className="mt-2 text-sm text-gym-muted">
              This member's gym visits will appear
              here after their first check-in.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="border-b border-white/10 bg-gym-bg px-5 py-4">
              <h3 className="text-base font-black text-white">
                Recent Visits
              </h3>

              <p className="mt-1 text-xs text-gym-muted">
                Showing up to five most recent visits
              </p>
            </div>

            <div className="divide-y divide-white/10">
              {data.recentVisits.map((visit) => (
                <div
                  key={visit.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-emerald-500/10 p-2.5">
                      <CheckCircleIcon />
                    </div>

                    <div>
                      <p className="font-semibold text-white">
                        {formatDate(visit.attendanceDate)}
                      </p>

                      <p className="mt-1 text-xs text-gym-muted">
                        Recorded gym visit
                      </p>
                    </div>
                  </div>

                  <p className="text-sm font-bold text-gym-orange">
                    {formatTime(visit.checkedInAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-gym-muted">
          Attendance counts are based on recorded
          check-ins. The MVP allows one check-in
          per member per calendar day.
          These records do not measure time spent
          inside the gym.
        </p>
      </div>
    </section>
  );
}

function CheckCircleIcon() {
  return (
    <CalendarCheck
      size={18}
      className="text-emerald-400"
    />
  );
}
