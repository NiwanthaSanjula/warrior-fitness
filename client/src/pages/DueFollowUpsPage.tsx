
import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
} from "lucide-react";

import { attentionApi } from "../api/attention.api";
import { getApiErrorMessage } from "../api/api";

import type {
  DueFollowUpsResponse,
  FollowUpType,
} from "../types/attention";

const PAGE_SIZE = 10;

const labels: Record<FollowUpType, string> = {
  MEMBERSHIP_EXPIRING: "Membership Expiring",
  PAYMENT_OUTSTANDING: "Outstanding Payment",
  ATTENDANCE_INACTIVE: "Attendance Inactivity",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    timeZone: "Asia/Colombo",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function DueFollowUpsPage() {
  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] =
    useState(0);

  const [loaded, setLoaded] = useState<{
    key: string;
    response: DueFollowUpsResponse;
  } | null>(null);

  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const requestKey = `${page}:${refreshVersion}`;

  useEffect(() => {
    const controller = new AbortController();

    void attentionApi.getDueFollowUps(
      { page, limit: PAGE_SIZE },
      controller.signal
    )
      .then((response) => {
        if (controller.signal.aborted) return;

        setLoaded({
          key: requestKey,
          response,
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
  }, [page, requestKey]);

  const data =
    loaded?.key === requestKey
      ? loaded.response
      : null;

  const error =
    failure?.key === requestKey
      ? failure.message
      : null;

  function refresh() {
    setRefreshVersion((value) => value + 1);
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/attention"
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-gym-orange"
          >
            <ArrowLeft size={17} />
            Attention Center
          </Link>

          <p className="mt-5 text-xs font-bold uppercase tracking-widest text-gym-orange">
            Scheduled Member Actions
          </p>

          <h1 className="mt-2 text-3xl font-black uppercase italic text-white">
            Due Follow-Ups
          </h1>

          <p className="mt-3 text-sm text-gym-muted">
            Staff actions scheduled for today or earlier.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-gym-card px-4 py-3 text-sm font-bold text-white hover:bg-white/5"
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-400"
        >
          <AlertCircle size={19} />
          <div>
            <p>{error}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-3 font-bold underline"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {!data && !error && (
        <p
          role="status"
          className="rounded-2xl bg-gym-card p-10 text-center text-gym-muted"
        >
          Loading scheduled follow-ups...
        </p>
      )}

      {data && (
        <>
          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-gym-card p-5">
            <Clock3
              size={25}
              className="text-gym-orange"
            />

            <div>
              <p className="text-xs font-bold uppercase text-gym-muted">
                Actions Requiring Follow-Up
              </p>

              <p className="mt-1 text-2xl font-black text-white">
                {data.total}
              </p>
            </div>

            <p className="ml-auto text-sm text-gym-muted">
              As of {formatDate(data.asOfDate)}
            </p>
          </section>

          <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
            {data.data.length === 0 ? (
              <div className="p-12 text-center">
                <Clock3
                  size={32}
                  className="mx-auto text-emerald-400"
                />

                <h2 className="mt-4 font-bold text-white">
                  No scheduled follow-ups due
                </h2>

                <p className="mt-2 text-sm text-gym-muted">
                  There are no outstanding staff
                  follow-up schedules for this page.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {data.data.map((item) => (
                  <article
                    key={item.followUpId}
                    className="space-y-4 p-5 sm:p-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link
                          to={`/members/${item.memberId}`}
                          className="text-lg font-black text-white hover:text-gym-orange"
                        >
                          {item.memberName ?? "Unknown Member"}
                        </Link>

                        <p className="mt-1 text-xs text-gym-muted">
                          {item.memberReference ?? "—"}
                          {item.memberPhone
                            ? ` · ${item.memberPhone}`
                            : ""}
                        </p>
                      </div>

                      <span className="rounded-full bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-400">
                        Due {formatDate(item.nextFollowUpDate)}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-zinc-300">
                      {labels[item.alertType]}
                    </p>

                    <p className="whitespace-pre-wrap break-words text-sm text-zinc-400">
                      {item.lastNotes}
                    </p>

                    <p className="text-xs text-gym-muted">
                      Previous action:{" "}
                      {item.lastMethod.replaceAll("_", " ")}
                      {" · "}
                      {item.lastOutcome.replaceAll("_", " ")}
                      {" · "}
                      {formatTime(item.lastRecordedAt)}
                    </p>

                    <Link
                      to={`/attention/follow-ups/member/${item.memberId}/${item.alertType}`}
                      className="inline-flex rounded-xl bg-gym-orange px-5 py-3 text-sm font-bold text-white hover:bg-orange-600"
                    >
                      Record Next Action
                    </Link>
                  </article>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-white/10 p-5">
              <p className="text-xs text-gym-muted">
                {data.total} scheduled follow-ups due
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Previous due page"
                  disabled={page <= 1}
                  onClick={() =>
                    setPage((value) => Math.max(1, value - 1))
                  }
                  className="rounded-lg border border-white/10 p-2 text-white disabled:opacity-30"
                >
                  <ChevronLeft size={17} />
                </button>

                <span className="text-sm text-zinc-300">
                  {page} / {Math.max(1, data.totalPages)}
                </span>

                <button
                  type="button"
                  aria-label="Next due page"
                  disabled={page >= data.totalPages}
                  onClick={() =>
                    setPage((value) => value + 1)
                  }
                  className="rounded-lg border border-white/10 p-2 text-white disabled:opacity-30"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      <p className="text-xs text-gym-muted">
        Due follow-ups reflect staff-entered schedules.
        Before contacting a member, check whether their
        membership, payment or attendance situation has changed.
      </p>
    </div>
  );
}
