
import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
  AlertCircle,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  RefreshCw,
} from "lucide-react";

import { membershipsApi } from "../../api/memberships.api";
import { getApiErrorMessage } from "../../api/api";

import type {
  Membership,
  MembershipSummary,
  OverallMembershipStatus,
} from "../../types/membership";

interface MembershipOverviewProps {
  memberId: string;
  refreshVersion?: number;
}

interface LoadedSummary {
  key: string;
  data: MembershipSummary;
}

interface SummaryError {
  key: string;
  message: string;
}

function todayInColombo(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return [
    getPart("year"),
    getPart("month"),
    getPart("day"),
  ].join("-");
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatPrice(price: number): string {
  return `LKR ${new Intl.NumberFormat("en-LK").format(price)}`;
}

function getRemainingDays(
  endDateExclusive: string,
  today: string
): number {
  const end = Date.parse(
    `${endDateExclusive}T00:00:00.000Z`
  );

  const now = Date.parse(
    `${today}T00:00:00.000Z`
  );

  return Math.max(
    0,
    Math.round((end - now) / 86400000)
  );
}

function StatusBadge({
  status,
}: {
  status: OverallMembershipStatus;
}) {
  const styles: Record<
    OverallMembershipStatus,
    string
  > = {
    ACTIVE:
      "bg-emerald-500/10 text-emerald-400",
    UPCOMING:
      "bg-orange-500/10 text-orange-400",
    EXPIRED:
      "bg-red-500/10 text-red-400",
    NOT_ENROLLED:
      "bg-zinc-500/10 text-zinc-400",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${styles[status]}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function PeriodInfo({
  title,
  membership,
  upcoming = false,
}: {
  title: string;
  membership: Membership;
  upcoming?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-gym-bg p-5">
      <div className="flex items-center gap-2">
        {upcoming ? (
          <CalendarClock
            size={19}
            className="text-gym-orange"
          />
        ) : (
          <CalendarCheck
            size={19}
            className="text-emerald-400"
          />
        )}

        <h3 className="text-sm font-extrabold text-zinc-200">
          {title}
        </h3>
      </div>

      <h4 className="mt-4 text-lg font-black text-white">
        {membership.planSnapshot.name}
      </h4>

      <p className="mt-1 font-mono text-xs text-gym-orange">
        {membership.planSnapshot.code}
      </p>

      <div className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-gym-muted">
            Starts
          </span>

          <span className="font-semibold text-white">
            {formatDate(membership.startDate)}
          </span>
        </div>

        <div className="flex justify-between gap-3">
          <span className="text-gym-muted">
            Last valid day
          </span>

          <span className="font-semibold text-white">
            {formatDate(membership.lastValidDate)}
          </span>
        </div>

        <div className="flex justify-between gap-3">
          <span className="text-gym-muted">
            Agreed plan price
          </span>

          <span className="font-semibold text-white">
            {formatPrice(
              membership.planSnapshot.priceLkr
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function MembershipOverview({
  memberId,
  refreshVersion = 0,
}: MembershipOverviewProps) {
  const [retryVersion, setRetryVersion] = useState(0);

  const [loaded, setLoaded] =
    useState<LoadedSummary | null>(null);

  const [failure, setFailure] =
    useState<SummaryError | null>(null);

  const requestKey =
    `${memberId}:${refreshVersion}:${retryVersion}`;

  useEffect(() => {
    const controller = new AbortController();

    void membershipsApi
      .getSummary(memberId, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;

        setLoaded({
          key: requestKey,
          data: response.data,
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
  }, [memberId, requestKey]);

  const summary =
    loaded?.key === requestKey
      ? loaded.data
      : null;

  const error =
    failure?.key === requestKey
      ? failure.message
      : null;

  const loading = !summary && !error;

  if (loading) {
    return (
      <section
        role="status"
        className="animate-pulse rounded-2xl border border-white/10 bg-gym-card p-8"
      >
        <div className="h-6 w-56 rounded bg-white/10" />

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map(
            (_, index) => (
              <div
                key={index}
                className="h-28 rounded-xl bg-white/5"
              />
            )
          )}
        </div>
      </section>
    );
  }

  if (error || !summary) {
    return (
      <section className="rounded-2xl border border-red-500/20 bg-gym-card p-6">
        <div className="flex items-center gap-3">
          <AlertCircle
            size={22}
            className="text-red-400"
          />

          <h2 className="font-bold text-white">
            Unable to load membership overview
          </h2>
        </div>

        <p
          role="alert"
          className="mt-3 text-sm text-red-400"
        >
          {error || "Membership information unavailable"}
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

  const today = todayInColombo();

  const current = summary.currentMembership;
  const upcoming = summary.nextMembership;
  const latest = summary.latestMembership;

  const remainingDays =
    summary.status === "ACTIVE" && latest
      ? getRemainingDays(
          latest.endDateExclusive,
          today
        )
      : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
      {/* Heading */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
        <div className="flex items-center gap-3">
          <CalendarCheck
            size={23}
            className="text-gym-orange"
          />

          <h2 className="text-lg font-black text-white">
            Membership Overview
          </h2>
        </div>

        <Link
          to={`/members/${memberId}/membership`}
          className="rounded-xl bg-gym-orange px-4 py-2.5 text-xs font-bold text-white transition hover:bg-orange-600"
        >
          Manage Membership
        </Link>
      </div>

      <div className="space-y-6 p-6">
        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-gym-bg p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-gym-muted">
              Membership Status
            </p>

            <div className="mt-4">
              <StatusBadge
                status={summary.status}
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-gym-bg p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-gym-muted">
              Coverage Through
            </p>

            <p className="mt-4 text-lg font-black text-white">
              {formatDate(latest?.lastValidDate)}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-gym-bg p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-gym-muted">
              Coverage Remaining
            </p>

            <p className="mt-3 text-2xl font-black text-white">
              {remainingDays === null
                ? "—"
                : remainingDays}
            </p>

            <p className="mt-1 text-xs text-gym-muted">
              {remainingDays === null
                ? summary.status === "UPCOMING"
                  ? "Starts in the future"
                  : "No active coverage"
                : remainingDays === 1
                  ? "calendar day"
                  : "calendar days"}
            </p>
          </div>
        </div>

        {/* Profile access warning */}
        {!summary.memberProfileActive && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
            This member profile is inactive.
            Membership history remains available,
            but new enrollment and renewal are blocked.
          </div>
        )}

        {/* No membership yet */}
        {summary.status === "NOT_ENROLLED" && (
          <div className="rounded-xl border border-dashed border-white/10 p-7 text-center">
            <Clock3
              size={31}
              className="mx-auto text-zinc-500"
            />

            <h3 className="mt-4 font-bold text-white">
              No membership enrolled yet
            </h3>

            <p className="mt-2 text-sm text-zinc-400">
              Select Manage Membership to assign
              this member their first plan.
            </p>
          </div>
        )}

        {/* Current period */}
        {current && (
          <PeriodInfo
            title="Current Membership"
            membership={current}
          />
        )}

        {/* Next scheduled period */}
        {upcoming && (
          <PeriodInfo
            title="Upcoming Membership"
            membership={upcoming}
            upcoming
          />
        )}

        {/* Expired membership */}
        {summary.status === "EXPIRED" && latest && (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
              This member's purchased membership
              period has expired. A renewal is
              required for new coverage.
            </div>

            <PeriodInfo
              title="Most Recent Membership"
              membership={latest}
            />
          </div>
        )}

        {/* Additional information */}
        {summary.totalPeriods > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <CheckCircle2
                size={17}
                className="text-gym-orange"
              />

              {summary.totalPeriods} purchased{" "}
              {summary.totalPeriods === 1
                ? "period"
                : "periods"}{" "}
              recorded
            </div>

            <Link
              to={`/members/${memberId}/membership`}
              className="text-sm font-bold text-gym-orange hover:text-orange-300"
            >
              View Full Membership History
            </Link>
          </div>
        )}

        <p className="text-xs text-gym-muted">
          Membership coverage does not confirm
          payment collection. Payment tracking
          will be handled separately.
        </p>
      </div>
    </section>
  );
}
