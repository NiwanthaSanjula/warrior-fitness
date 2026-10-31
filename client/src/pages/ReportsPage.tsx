
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";

import {
  Activity,
  AlertCircle,
  CalendarDays,
  ChartNoAxesCombined,
  CreditCard,
  Download,
  FileText,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";

import { reportsApi } from "../api/reports.api";
import { getApiErrorMessage } from "../api/api";

import { downloadCsv } from "../utils/reports.csv";

import type {
  ReportsDashboardData,
} from "../types/reports";

// --------------------
// Date utilities
// --------------------

function todayInColombo(): string {
  const parts = new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(
  date: string,
  amount: number
): string {
  const result = new Date(
    `${date}T00:00:00.000Z`
  );

  result.setUTCDate(
    result.getUTCDate() + amount
  );

  return result.toISOString().slice(0, 10);
}

function daysInclusive(
  from: string,
  to: string
): number {
  const first = Date.parse(
    `${from}T00:00:00.000Z`
  );

  const last = Date.parse(
    `${to}T00:00:00.000Z`
  );

  return Math.round(
    (last - first) / 86_400_000
  ) + 1;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat(
    "en-LK",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }
  ).format(
    new Date(`${date}T00:00:00.000Z`)
  );
}

function formatLkr(value: number): string {
  return `LKR ${new Intl.NumberFormat(
    "en-LK",
    {
      maximumFractionDigits: 2,
    }
  ).format(value)}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-LK", {
    maximumFractionDigits: 2,
  }).format(value);
}

// --------------------
// Reusable UI elements
// --------------------

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gym-muted">
          {label}
        </p>

        <Icon
          size={21}
          className="shrink-0 text-gym-orange"
        />
      </div>

      <p className="mt-4 break-words text-2xl font-black text-white">
        {value}
      </p>

      <p className="mt-2 text-xs text-gym-muted">
        {detail}
      </p>
    </div>
  );
}

interface ChartPoint {
  date: string;
  value: number;
}

function TrendChart({
  title,
  points,
  formatValue,
}: {
  title: string;
  points: ChartPoint[];
  formatValue: (value: number) => string;
}) {
  // Show a readable preview, not hundreds
  // of tiny bars for a long date range.
  const visible = points.slice(-14);

  const maxValue = Math.max(
    1,
    ...visible.map((point) => point.value)
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
      <h3 className="text-lg font-black text-white">
        {title}
      </h3>

      <p className="mt-1 text-xs text-gym-muted">
        Last {visible.length} calendar days of
        the selected period
      </p>

      <div
        role="img"
        aria-label={`${title}: ${visible.map(
          (point) =>
            `${point.date}: ${formatValue(point.value)}`
        ).join("; ")}`}
        className="mt-7 flex h-40 items-end gap-1.5"
      >
        {visible.map((point) => {
          const height =
            point.value > 0
              ? (point.value / maxValue) * 100
              : 0;

          return (
            <div
              key={point.date}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
              title={`${formatDate(point.date)}: ${formatValue(point.value)}`}
            >
              <div className="flex h-28 w-full items-end rounded-t-md bg-white/5">
                <div
                  className="w-full rounded-t-md bg-gym-orange transition-all"
                  style={{
                    height: `${height}%`,
                  }}
                />
              </div>

              <span className="w-full truncate text-center text-[10px] text-zinc-400">
                {point.date.slice(5)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-gym-muted">
        Hover over a bar for its value.
        CSV downloads include the full period.
      </p>
    </div>
  );
}

function ExportButton({
  children,
  onClick,
}: {
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-orange-500/30 px-4 py-3 text-sm font-bold text-gym-orange hover:bg-orange-500/10"
    >
      <Download size={16} />
      {children}
    </button>
  );
}

// --------------------
// Main page
// --------------------

export default function ReportsPage() {
  const [from, setFrom] = useState(
    () => addDays(todayInColombo(), -29)
  );

  const [to, setTo] = useState(
    () => todayInColombo()
  );

  const [refreshVersion, setRefreshVersion] =
    useState(0);

  const [loaded, setLoaded] = useState<{
    key: string;
    data: ReportsDashboardData;
  } | null>(null);

  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const today = todayInColombo();
  const selectedDays = daysInclusive(from, to);

  const validRange =
    Boolean(from && to) &&
    Number.isFinite(selectedDays) &&
    from <= to &&
    to <= today &&
    selectedDays >= 1 &&
    selectedDays <= 366;

  const requestKey =
    `${from}:${to}:${refreshVersion}`;

  // Load the complete report for the selected
  // period plus two current snapshots.
  useEffect(() => {
    if (!validRange) return;

    const controller = new AbortController();
    const range = { from, to };

    void Promise.all([
      reportsApi.getCollections(
        range,
        controller.signal
      ),

      reportsApi.getInvoices(
        range,
        controller.signal
      ),

      reportsApi.getReceivables(
        controller.signal
      ),

      reportsApi.getMembershipActivity(
        range,
        controller.signal
      ),

      reportsApi.getActiveMembers(
        controller.signal
      ),

      reportsApi.getAttendanceTrends(
        range,
        controller.signal
      ),
    ])
      .then(([
        collections,
        invoices,
        receivables,
        membershipActivity,
        activeMembers,
        attendance,
      ]) => {
        if (controller.signal.aborted) return;

        setLoaded({
          key: requestKey,
          data: {
            collections,
            invoices,
            receivables,
            membershipActivity,
            activeMembers,
            attendance,
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
    from,
    to,
    refreshVersion,
    requestKey,
    validRange,
  ]);

  // Keep old request results hidden while
  // a new filter selection is loading.
  const data =
    loaded?.key === requestKey
      ? loaded.data
      : null;

  const error =
    failure?.key === requestKey
      ? failure.message
      : null;

  function refresh() {
    setRefreshVersion((value) => value + 1);
  }

  function selectLastDays(days: number) {
    const end = todayInColombo();

    setTo(end);
    setFrom(addDays(end, -(days - 1)));
  }

  // --------------------
  // CSV export handlers
  // --------------------

  function exportFinancialDaily() {
    if (!data) return;

    const invoiceMap = new Map(
      data.invoices.byDay.map((day) => [
        day.date,
        day,
      ])
    );

    downloadCsv(
      `warrior-financial-daily-${from}-to-${to}.csv`,
      [
        "Date",
        "Collected LKR",
        "Payment Count",
        "Invoiced LKR",
        "Invoice Count",
      ],
      data.collections.byDay.map((day) => {
        const invoice = invoiceMap.get(day.date);

        return [
          day.date,
          day.totalCollectedLkr,
          day.paymentCount,
          invoice?.totalInvoicedLkr ?? 0,
          invoice?.invoiceCount ?? 0,
        ];
      })
    );
  }

  function exportPaymentMethods() {
    if (!data) return;

    downloadCsv(
      `warrior-payment-methods-${from}-to-${to}.csv`,
      [
        "Payment Method",
        "Collected LKR",
        "Payment Count",
      ],
      data.collections.byMethod.map((method) => [
        method.method,
        method.totalCollectedLkr,
        method.paymentCount,
      ])
    );
  }

  function exportOperationsDaily() {
    if (!data) return;

    const attendanceMap = new Map(
      data.attendance.byDay.map((day) => [
        day.date,
        day.visits,
      ])
    );

    downloadCsv(
      `warrior-operations-daily-${from}-to-${to}.csv`,
      [
        "Date",
        "Membership Purchases",
        "Attendance Visits",
      ],
      data.membershipActivity.byDay.map(
        (day) => [
          day.date,
          day.purchases,
          attendanceMap.get(day.date) ?? 0,
        ]
      )
    );
  }

  function exportPlanPopularity() {
    if (!data) return;

    downloadCsv(
      `warrior-plan-popularity-${from}-to-${to}.csv`,
      ["Plan Snapshot Name", "Purchases"],
      data.membershipActivity.byPlan.map(
        (plan) => [
          plan.planName,
          plan.purchases,
        ]
      )
    );
  }

  function exportCurrentSnapshot() {
    if (!data) return;

    downloadCsv(
      `warrior-current-snapshot-${todayInColombo()}.csv`,
      ["As Of Date", "Metric", "Value"],
      [
        [
          data.receivables.asOfDate,
          "Total Outstanding LKR",
          data.receivables.summary
            .totalOutstandingLkr,
        ],
        [
          data.receivables.asOfDate,
          "Overdue LKR",
          data.receivables.summary.overdueLkr,
        ],
        [
          data.receivables.asOfDate,
          "Not Yet Overdue LKR",
          data.receivables.summary
            .notYetOverdueLkr,
        ],
        [
          data.receivables.asOfDate,
          "Open Invoices",
          data.receivables.summary
            .openInvoiceCount,
        ],
        [
          data.activeMembers.asOfDate,
          "Active Members",
          data.activeMembers.summary
            .totalActiveMembers,
        ],
      ]
    );
  }

  return (
    <div className="space-y-7">
      {/* Page header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gym-orange">
            Business Intelligence
          </p>

          <h1 className="mt-2 text-3xl font-black uppercase italic text-white">
            Reports & Analytics
          </h1>

          <p className="mt-2 text-sm text-gym-muted">
            Financial, membership and attendance performance.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-gym-card px-4 py-3 text-sm font-bold text-white hover:bg-white/5"
        >
          <RefreshCw size={17} />
          Refresh Reports
        </button>
      </header>

      {/* Date-range filters */}
      <section className="rounded-2xl border border-white/10 bg-gym-card p-5">
        <div className="flex items-center gap-2">
          <CalendarDays
            size={20}
            className="text-gym-orange"
          />

          <h2 className="font-black text-white">
            Reporting Period
          </h2>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-2 text-xs text-gym-muted">
            From
            <input
              type="date"
              value={from}
              max={today}
              onChange={(event) =>
                setFrom(event.target.value)
              }
              className="rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white"
            />
          </label>

          <label className="flex flex-col gap-2 text-xs text-gym-muted">
            To
            <input
              type="date"
              value={to}
              max={today}
              onChange={(event) =>
                setTo(event.target.value)
              }
              className="rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white"
            />
          </label>

          <button
            type="button"
            onClick={() => selectLastDays(7)}
            className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-300"
          >
            Last 7 Days
          </button>

          <button
            type="button"
            onClick={() => selectLastDays(30)}
            className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-300"
          >
            Last 30 Days
          </button>
        </div>

        {!validRange && (
          <p
            role="alert"
            className="mt-4 text-sm text-red-400"
          >
            Select a valid date range ending no later
            than today, with a maximum of 366 days.
          </p>
        )}

        <p className="mt-4 text-xs text-gym-muted">
          Date filters apply to collections,
          invoices issued, membership purchases and
          attendance. Current snapshots are not
          historical reports.
        </p>
      </section>

      {/* Loading and errors */}
      {validRange && error && (
        <section
          role="alert"
          className="flex flex-wrap items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-5"
        >
          <AlertCircle
            size={21}
            className="text-red-400"
          />

          <div>
            <p className="font-bold text-white">
              Unable to load reports
            </p>

            <p className="mt-1 text-sm text-red-400">
              {error}
            </p>

            <button
              type="button"
              onClick={refresh}
              className="mt-3 text-sm font-bold text-gym-orange underline"
            >
              Try Again
            </button>
          </div>
        </section>
      )}

      {validRange && !data && !error && (
        <p
          role="status"
          className="rounded-xl border border-white/10 bg-gym-card p-8 text-center text-sm text-gym-muted"
        >
          Loading financial and operational reports...
        </p>
      )}

      {data && (
        <>
          {/* Financial performance */}
          <section className="space-y-4">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-white">
                <Wallet
                  size={22}
                  className="text-gym-orange"
                />
                Financial Performance
              </h2>

              <p className="mt-1 text-sm text-gym-muted">
                Selected period: {formatDate(from)} –
                {" "}{formatDate(to)}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Collected"
                value={formatLkr(
                  data.collections.summary
                    .totalCollectedLkr
                )}
                detail="Payments received during period"
                icon={CreditCard}
              />

              <MetricCard
                label="Invoiced"
                value={formatLkr(
                  data.invoices.summary
                    .totalInvoicedLkr
                )}
                detail="Invoices issued during period"
                icon={FileText}
              />

              <MetricCard
                label="Outstanding"
                value={formatLkr(
                  data.receivables.summary
                    .totalOutstandingLkr
                )}
                detail={`Current as of ${formatDate(data.receivables.asOfDate)}`}
                icon={Wallet}
              />

              <MetricCard
                label="Overdue"
                value={formatLkr(
                  data.receivables.summary.overdueLkr
                )}
                detail="Current unpaid balances past due"
                icon={AlertCircle}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <TrendChart
                title="Daily Collections"
                points={data.collections.byDay.map(
                  (day) => ({
                    date: day.date,
                    value: day.totalCollectedLkr,
                  })
                )}
                formatValue={formatLkr}
              />

              <TrendChart
                title="Daily Invoices Issued"
                points={data.invoices.byDay.map(
                  (day) => ({
                    date: day.date,
                    value: day.totalInvoicedLkr,
                  })
                )}
                formatValue={formatLkr}
              />
            </div>

            {/* Payment breakdown */}
            <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
              <h3 className="text-lg font-black text-white">
                Collections by Payment Method
              </h3>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="border-b border-white/10 text-xs uppercase text-gym-muted">
                    <tr>
                      <th className="py-3 pr-4">
                        Method
                      </th>
                      <th className="py-3 pr-4 text-right">
                        Payments
                      </th>
                      <th className="py-3 text-right">
                        Collected
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.collections.byMethod.map(
                      (item) => (
                        <tr
                          key={item.method}
                          className="border-b border-white/5"
                        >
                          <td className="py-4 pr-4 font-bold text-white">
                            {item.method.replaceAll("_", " ")}
                          </td>

                          <td className="py-4 pr-4 text-right text-zinc-300">
                            {item.paymentCount}
                          </td>

                          <td className="py-4 text-right font-bold text-gym-orange">
                            {formatLkr(item.totalCollectedLkr)}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Membership analytics */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-black text-white">
              <Users
                size={22}
                className="text-gym-orange"
              />
              Membership Analytics
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Membership Purchases"
                value={formatNumber(
                  data.membershipActivity.summary
                    .totalPurchases
                )}
                detail="New enrollments and renewals during period"
                icon={FileText}
              />

              <MetricCard
                label="Purchasing Members"
                value={formatNumber(
                  data.membershipActivity.summary
                    .uniquePurchasingMembers
                )}
                detail="Distinct members who purchased during period"
                icon={Users}
              />

              <MetricCard
                label="Active Members"
                value={formatNumber(
                  data.activeMembers.summary
                    .totalActiveMembers
                )}
                detail={`Current as of ${formatDate(data.activeMembers.asOfDate)}`}
                icon={Users}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
                <h3 className="text-lg font-black text-white">
                  Enrollment Types
                </h3>

                {data.membershipActivity.byType.length === 0 ? (
                  <p className="mt-4 text-sm text-gym-muted">
                    No membership purchases for this period.
                  </p>
                ) : (
                  <div className="mt-5 space-y-3">
                    {data.membershipActivity.byType.map(
                      (item) => (
                        <div
                          key={item.enrollmentType}
                          className="flex items-center justify-between gap-3 rounded-xl bg-gym-bg p-4"
                        >
                          <span className="text-sm text-zinc-300">
                            {item.enrollmentType.replaceAll(
                              "_",
                              " "
                            )}
                          </span>

                          <span className="font-black text-white">
                            {item.purchases}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
                <h3 className="text-lg font-black text-white">
                  Popular Membership Plans
                </h3>

                {data.membershipActivity.byPlan.length === 0 ? (
                  <p className="mt-4 text-sm text-gym-muted">
                    No plan purchases for this period.
                  </p>
                ) : (
                  <div className="mt-5 space-y-3">
                    {data.membershipActivity.byPlan
                      .slice(0, 10)
                      .map((plan) => (
                        <div
                          key={plan.planName}
                          className="flex items-center justify-between gap-3 rounded-xl bg-gym-bg p-4"
                        >
                          <span className="min-w-0 break-words text-sm text-zinc-300">
                            {plan.planName}
                          </span>

                          <span className="font-black text-gym-orange">
                            {plan.purchases}
                          </span>
                        </div>
                      ))}
                  </div>
                )}

                <p className="mt-4 text-xs text-gym-muted">
                  Historical plan snapshot names.
                  CSV includes every plan.
                </p>
              </div>
            </div>
          </section>

          {/* Attendance analytics */}
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xl font-black text-white">
              <Activity
                size={22}
                className="text-gym-orange"
              />
              Attendance Analytics
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Recorded Visits"
                value={formatNumber(
                  data.attendance.summary.totalVisits
                )}
                detail="Check-ins during selected period"
                icon={Activity}
              />

              <MetricCard
                label="Unique Visitors"
                value={formatNumber(
                  data.attendance.summary.uniqueVisitors
                )}
                detail="Distinct members with at least one visit"
                icon={Users}
              />

              <MetricCard
                label="Average Daily Visits"
                value={formatNumber(
                  data.attendance.summary.averageVisitsPerDay
                )}
                detail="Calendar-day average, including zero-visit days"
                icon={ChartNoAxesCombined}
              />

              <MetricCard
                label="Busiest Day"
                value={
                  data.attendance.summary.busiestDay
                    ? formatDate(
                        data.attendance.summary
                          .busiestDay.date
                      )
                    : "No visits"
                }
                detail={
                  data.attendance.summary.busiestDay
                    ? `${data.attendance.summary.busiestDay.visits} check-ins`
                    : "No attendance recorded"
                }
                icon={CalendarDays}
              />
            </div>

            <TrendChart
              title="Daily Gym Visits"
              points={data.attendance.byDay.map(
                (day) => ({
                  date: day.date,
                  value: day.visits,
                })
              )}
              formatValue={formatNumber}
            />
          </section>

          {/* CSV export section */}
          <section className="space-y-4 rounded-2xl border border-white/10 bg-gym-card p-6">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-white">
                <Download
                  size={22}
                  className="text-gym-orange"
                />
                Export Reports
              </h2>

              <p className="mt-2 text-sm text-gym-muted">
                Download CSV files for Excel or
                Google Sheets.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <ExportButton onClick={exportFinancialDaily}>
                Financial Daily
              </ExportButton>

              <ExportButton onClick={exportPaymentMethods}>
                Payment Methods
              </ExportButton>

              <ExportButton onClick={exportOperationsDaily}>
                Operations Daily
              </ExportButton>

              <ExportButton onClick={exportPlanPopularity}>
                Plan Popularity
              </ExportButton>

              <ExportButton onClick={exportCurrentSnapshot}>
                Current Snapshot
              </ExportButton>
            </div>

            <p className="text-xs text-gym-muted">
              Financial and operational daily exports
              use the selected period. The current
              snapshot export uses the latest
              receivables and active-member counts.
            </p>
          </section>

          <p className="text-xs text-gym-muted">
            Reports reflect records stored in Warrior
            Fitness. Collections are recorded payments,
            not net profit or audited bank settlements.
            Active members and receivables are current
            snapshots, not historical balances.
          </p>
        </>
      )}
    </div>
  );
}
