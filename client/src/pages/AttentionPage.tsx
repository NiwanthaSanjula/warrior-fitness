
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Link } from "react-router";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BellRing,
  CalendarClock,
  CreditCard,
  RefreshCw,
  Search,
  UserRoundSearch,
  Wallet,
} from "lucide-react";

import { attentionApi } from "../api/attention.api";
import { getApiErrorMessage } from "../api/api";

import type {
  AttentionTab,
  AttendanceInactivityResponse,
  ExpiringMembershipResponse,
  OutstandingPaymentResponse,
} from "../types/attention";

const PAGE_SIZE = 10;

type AlertResult =
  | {
      tab: "expiring";
      response: ExpiringMembershipResponse;
    }
  | {
      tab: "outstanding";
      response: OutstandingPaymentResponse;
    }
  | {
      tab: "inactive";
      response: AttendanceInactivityResponse;
    };

interface OverviewData {
  expiring: ExpiringMembershipResponse;
  outstanding: OutstandingPaymentResponse;
  inactive: AttendanceInactivityResponse;
}

function formatLkr(value: number): string {
  return `LKR ${new Intl.NumberFormat("en-LK").format(value)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function MetricCard({
  label,
  value,
  icon: Icon,
  valueColor = "text-white",
}: {
  label: string;
  value: string;
  icon: typeof BellRing;
  valueColor?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gym-muted">
          {label}
        </p>

        <Icon size={20} className="shrink-0 text-gym-orange" />
      </div>

      <p className={`mt-4 break-words text-2xl font-black ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}

function MemberIdentity({
  id,
  name,
  reference,
  phone,
}: {
  id: string;
  name: string | null;
  reference: string | null;
  phone: string | null;
}) {
  return (
    <div className="min-w-0">
      <Link
        to={`/members/${id}`}
        className="font-bold text-white hover:text-gym-orange"
      >
        {name ?? "Unknown Member"}
      </Link>

      <p className="mt-1 text-xs text-gym-muted">
        {reference ?? "No member reference"}
        {phone ? ` · ${phone}` : ""}
      </p>
    </div>
  );
}

const tabs: {
  id: AttentionTab;
  label: string;
}[] = [
  { id: "expiring", label: "Expiring Memberships" },
  { id: "outstanding", label: "Outstanding Payments" },
  { id: "inactive", label: "Attendance Follow-Ups" },
];

export default function AttentionPage() {
  const [tab, setTab] = useState<AttentionTab>("expiring");
  const [page, setPage] = useState(1);

  const [expiryDays, setExpiryDays] = useState(7);
  const [inactivityDays, setInactivityDays] = useState(14);

  const [paymentStatus, setPaymentStatus] =
    useState<"all" | "overdue">("all");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [refreshVersion, setRefreshVersion] = useState(0);

  const [overviewLoaded, setOverviewLoaded] = useState<{
    version: number;
    data: OverviewData;
  } | null>(null);

  const [overviewFailure, setOverviewFailure] = useState<{
    version: number;
    message: string;
  } | null>(null);

  const [listLoaded, setListLoaded] = useState<{
    key: string;
    data: AlertResult;
  } | null>(null);

  const [listFailure, setListFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const requestKey = JSON.stringify({
    tab,
    page,
    expiryDays,
    inactivityDays,
    paymentStatus,
    search,
    refreshVersion,
  });

  // Load overall alert statistics using consistent
  // default thresholds, independently of list filters.
  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      attentionApi.getExpiring(
        { days: 7, page: 1, limit: 1 },
        controller.signal
      ),

      attentionApi.getOutstanding(
        { status: "all", page: 1, limit: 1 },
        controller.signal
      ),

      attentionApi.getInactiveAttendance(
        { days: 14, page: 1, limit: 1 },
        controller.signal
      ),
    ])
      .then(([expiring, outstanding, inactive]) => {
        if (controller.signal.aborted) return;

        setOverviewLoaded({
          version: refreshVersion,
          data: { expiring, outstanding, inactive },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setOverviewFailure({
          version: refreshVersion,
          message: getApiErrorMessage(error),
        });
      });

    return () => controller.abort();
  }, [refreshVersion]);

  // Load the currently selected category.
  useEffect(() => {
    const controller = new AbortController();

    async function loadList() {
      try {
        let result: AlertResult;

        if (tab === "expiring") {
          const response = await attentionApi.getExpiring(
            {
              days: expiryDays,
              page,
              limit: PAGE_SIZE,
            },
            controller.signal
          );

          result = { tab: "expiring", response };
        } else if (tab === "outstanding") {
          const response =
            await attentionApi.getOutstanding(
              {
                status: paymentStatus,
                search,
                page,
                limit: PAGE_SIZE,
              },
              controller.signal
            );

          result = { tab: "outstanding", response };
        } else {
          const response =
            await attentionApi.getInactiveAttendance(
              {
                days: inactivityDays,
                search,
                page,
                limit: PAGE_SIZE,
              },
              controller.signal
            );

          result = { tab: "inactive", response };
        }

        if (controller.signal.aborted) return;

        setListLoaded({
          key: requestKey,
          data: result,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;

        setListFailure({
          key: requestKey,
          message: getApiErrorMessage(error),
        });
      }
    }

    void loadList();

    return () => controller.abort();
  }, [
    tab,
    page,
    expiryDays,
    inactivityDays,
    paymentStatus,
    search,
    refreshVersion,
    requestKey,
  ]);

  const overview =
    overviewLoaded?.version === refreshVersion
      ? overviewLoaded.data
      : null;

  const overviewError =
    overviewFailure?.version === refreshVersion
      ? overviewFailure.message
      : null;

  const active =
    listLoaded?.key === requestKey
      ? listLoaded.data
      : null;

  const listError =
    listFailure?.key === requestKey
      ? listFailure.message
      : null;

  function changeTab(next: AttentionTab) {
    setTab(next);
    setPage(1);
    setSearch("");
    setSearchInput("");
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function refresh() {
    setRefreshVersion((value) => value + 1);
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
            Member Attention Center
          </h1>

          <p className="mt-3 text-sm text-gym-muted">
            Identify members who need membership,
            payment or attendance follow-ups.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-gym-card px-4 py-3 text-sm font-bold text-white hover:bg-white/5"
          >
            <RefreshCw size={17} />
            Refresh
          </button>

          <Link
            to="/attention/follow-ups/due"
            className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-4 py-3 text-sm font-bold text-white hover:bg-orange-600"
          >
            <BellRing size={17} />
            Due Follow-Ups
          </Link>
        </div>
      </header>

      {/* Overview cards */}
      {overviewError && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400"
        >
          Unable to load overview: {overviewError}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Expiring Next 7 Days"
          value={
            overview
              ? String(overview.expiring.total)
              : "—"
          }
          icon={CalendarClock}
          valueColor="text-orange-400"
        />

        <MetricCard
          label="Members Owing Payments"
          value={
            overview
              ? String(overview.outstanding.total)
              : "—"
          }
          icon={CreditCard}
          valueColor="text-red-400"
        />

        <MetricCard
          label="Total Outstanding"
          value={
            overview
              ? formatLkr(
                  overview.outstanding.summary
                    .totalOutstandingLkr
                )
              : "—"
          }
          icon={Wallet}
        />

        <MetricCard
          label="Inactive Attendance (14 Days)"
          value={
            overview
              ? String(overview.inactive.total)
              : "—"
          }
          icon={UserRoundSearch}
          valueColor="text-amber-400"
        />
      </section>

      {/* Alert directory */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
        <div className="border-b border-white/10 p-5 sm:p-6">
          <h2 className="text-xl font-black text-white">
            Attention Queue
          </h2>

          <p className="mt-2 text-sm text-gym-muted">
            Alerts are calculated from current gym
            records and update when those records change.
          </p>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Attention category"
            className="mt-6 flex flex-wrap gap-2"
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => changeTab(item.id)}
                className={`rounded-xl px-4 py-3 text-sm font-bold transition ${
                  tab === item.id
                    ? "bg-gym-orange text-white"
                    : "border border-white/10 bg-gym-bg text-zinc-300 hover:bg-white/5"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="mt-5 flex flex-wrap gap-3">
            {tab === "expiring" && (
              <label className="flex flex-col gap-2 text-xs text-gym-muted">
                Expiry window
                <select
                  value={expiryDays}
                  onChange={(event) => {
                    setExpiryDays(Number(event.target.value));
                    setPage(1);
                  }}
                  className="rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white"
                >
                  <option value={3}>Next 3 days</option>
                  <option value={7}>Next 7 days</option>
                  <option value={14}>Next 14 days</option>
                  <option value={30}>Next 30 days</option>
                </select>
              </label>
            )}

            {tab === "outstanding" && (
              <label className="flex flex-col gap-2 text-xs text-gym-muted">
                Payment filter
                <select
                  value={paymentStatus}
                  onChange={(event) => {
                    setPaymentStatus(
                      event.target.value as "all" | "overdue"
                    );
                    setPage(1);
                  }}
                  className="rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white"
                >
                  <option value="all">All outstanding</option>
                  <option value="overdue">Overdue only</option>
                </select>
              </label>
            )}

            {tab === "inactive" && (
              <label className="flex flex-col gap-2 text-xs text-gym-muted">
                Inactivity threshold
                <select
                  value={inactivityDays}
                  onChange={(event) => {
                    setInactivityDays(Number(event.target.value));
                    setPage(1);
                  }}
                  className="rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={21}>21 days</option>
                  <option value={30}>30 days</option>
                </select>
              </label>
            )}

            {tab !== "expiring" && (
              <form
                onSubmit={submitSearch}
                className="flex min-w-0 flex-1 items-end gap-2"
              >
                <input
                  type="search"
                  value={searchInput}
                  maxLength={80}
                  onChange={(event) =>
                    setSearchInput(event.target.value)
                  }
                  placeholder="Search member name, ID or phone..."
                  aria-label="Search attention alerts"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none focus:border-gym-orange"
                />

                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-4 py-3 text-sm font-bold text-white"
                >
                  <Search size={16} />
                  Search
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Loading and error states */}
        {listError && (
          <div
            role="alert"
            className="flex items-start gap-3 p-6 text-sm text-red-400"
          >
            <AlertCircle size={19} className="shrink-0" />
            <div>
              <p>{listError}</p>
              <button
                type="button"
                onClick={refresh}
                className="mt-2 font-bold underline"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {!active && !listError && (
          <p
            role="status"
            className="p-10 text-center text-sm text-gym-muted"
          >
            Loading attention alerts...
          </p>
        )}

        {active && (
          <>
            <div className="divide-y divide-white/10">
              {active.response.data.length === 0 && (
                <div className="p-10 text-center">
                  <BellRing
                    size={30}
                    className="mx-auto text-zinc-500"
                  />

                  <p className="mt-4 font-bold text-white">
                    No matching alerts
                  </p>

                  <p className="mt-2 text-sm text-gym-muted">
                    No members currently match these filters.
                  </p>
                </div>
              )}

              {/* Expiring memberships */}
              {active.tab === "expiring" &&
                active.response.data.map((alert) => (
                  <div
                    key={alert.memberId}
                    className="flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6"
                  >
                    <div className="space-y-3">
                      <MemberIdentity
                        id={alert.memberId}
                        name={alert.memberName}
                        reference={alert.memberReference}
                        phone={alert.memberPhone}
                      />

                      <p className="text-sm text-zinc-300">
                        {alert.planName} · Valid through{" "}
                        <span className="font-bold text-white">
                          {formatDate(alert.lastValidDate)}
                        </span>
                      </p>

                      <span className="inline-flex rounded-full bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-400">
                        {alert.daysRemaining === 0
                          ? "Expires today"
                          : `${alert.daysRemaining} days remaining`}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/members/${alert.memberId}/membership`}
                        className="rounded-xl border border-orange-500/30 px-4 py-2.5 text-sm font-bold text-gym-orange hover:bg-orange-500/10"
                      >
                        Manage Membership
                      </Link>

                      <Link
                        to={`/attention/follow-ups/member/${alert.memberId}/MEMBERSHIP_EXPIRING`}
                        className="rounded-xl bg-gym-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
                      >
                        Record Follow-Up
                      </Link>
                    </div>
                  </div>
                ))}

              {/* Outstanding payments */}
              {active.tab === "outstanding" &&
                active.response.data.map((alert) => (
                  <div
                    key={alert.memberId}
                    className="flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6"
                  >
                    <div className="space-y-3">
                      <MemberIdentity
                        id={alert.memberId}
                        name={alert.memberName}
                        reference={alert.memberReference}
                        phone={alert.memberPhone}
                      />

                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                        <p className="text-zinc-300">
                          Outstanding:{" "}
                          <span className="font-bold text-white">
                            {formatLkr(alert.outstandingLkr)}
                          </span>
                        </p>

                        <p className="text-zinc-300">
                          Overdue:{" "}
                          <span className="font-bold text-red-400">
                            {formatLkr(alert.overdueLkr)}
                          </span>
                        </p>

                        <p className="text-gym-muted">
                          {alert.openInvoiceCount} open invoices
                        </p>
                      </div>

                      {alert.hasOverduePayments && (
                        <span className="inline-flex rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400">
                          {alert.overdueInvoiceCount} overdue
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/members/${alert.memberId}`}
                        className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/5"
                      >
                        Member Profile
                      </Link>

                      <Link
                        to="/payments"
                        className="rounded-xl border border-orange-500/30 px-4 py-2.5 text-sm font-bold text-gym-orange hover:bg-orange-500/10"
                      >
                        Billing Dashboard
                      </Link>

                      <Link
                        to={`/attention/follow-ups/member/${alert.memberId}/PAYMENT_OUTSTANDING`}
                        className="rounded-xl bg-gym-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
                      >
                        Record Follow-Up
                      </Link>
                    </div>
                  </div>
                ))}

              {/* Attendance inactivity */}
              {active.tab === "inactive" &&
                active.response.data.map((alert) => (
                  <div
                    key={alert.memberId}
                    className="flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6"
                  >
                    <div className="space-y-3">
                      <MemberIdentity
                        id={alert.memberId}
                        name={alert.memberName}
                        reference={alert.memberReference}
                        phone={alert.memberPhone}
                      />

                      <p className="text-sm text-zinc-300">
                        {alert.reason === "NEVER_ATTENDED"
                          ? "No visits have been recorded"
                          : alert.lastVisitDate
                            ? `Last visit: ${formatDate(alert.lastVisitDate)}`
                            : "Last visit date unavailable"}
                      </p>

                      <span className="inline-flex rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-400">
                        {alert.reason === "NEVER_ATTENDED"
                          ? "Never attended"
                          : `${alert.daysSinceLastVisit} days since visit`}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/members/${alert.memberId}`}
                        className="rounded-xl border border-orange-500/30 px-4 py-2.5 text-sm font-bold text-gym-orange hover:bg-orange-500/10"
                      >
                        Member Profile
                      </Link>

                      <Link
                        to={`/attention/follow-ups/member/${alert.memberId}/ATTENDANCE_INACTIVE`}
                        className="rounded-xl bg-gym-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
                      >
                        Record Follow-Up
                      </Link>
                    </div>
                  </div>
                ))}
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-5">
              <p className="text-xs text-gym-muted">
                {active.response.total} matching members
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() =>
                    setPage((value) => Math.max(1, value - 1))
                  }
                  className="rounded-lg border border-white/10 p-2 text-white disabled:opacity-30"
                >
                  <ArrowLeft size={17} />
                </button>

                <span className="text-sm text-zinc-300">
                  Page {page} of{" "}
                  {Math.max(1, active.response.totalPages)}
                </span>

                <button
                  type="button"
                  aria-label="Next page"
                  disabled={page >= active.response.totalPages}
                  onClick={() => setPage((value) => value + 1)}
                  className="rounded-lg border border-white/10 p-2 text-white disabled:opacity-30"
                >
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <p className="text-xs text-gym-muted">
        Overview cards use the default 7-day expiry
        and 14-day attendance thresholds. Each category's
        filters apply to its list, not the overview cards.
        Outstanding payments do not automatically block
        membership validity or gym check-ins.
      </p>
    </div>
  );
}
