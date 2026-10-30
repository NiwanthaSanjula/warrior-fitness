
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Link } from "react-router";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Clock3,
  FileText,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";

import { billingApi } from "../api/billing.api";
import { getApiErrorMessage } from "../api/api";

import type {
  BillingOverview,
  InvoiceListResponse,
  InvoiceStatusFilter,
} from "../types/billing";

const PAGE_SIZE = 10;

const statusOptions: {
  value: InvoiceStatusFilter;
  label: string;
}[] = [
  { value: "all", label: "All Invoices" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];

interface PageData {
  invoices: InvoiceListResponse;
  overview: BillingOverview;
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

function PaymentStatus({
  status,
  overdue,
}: {
  status: "PAID" | "PARTIAL" | "UNPAID";
  overdue: boolean;
}) {
  const label = overdue
    ? "OVERDUE"
    : status === "PARTIAL"
      ? "PARTIALLY PAID"
      : status;

  const styles = overdue
    ? "bg-red-500/10 text-red-400"
    : status === "PAID"
      ? "bg-emerald-500/10 text-emerald-400"
      : status === "PARTIAL"
        ? "bg-orange-500/10 text-orange-400"
        : "bg-zinc-500/10 text-zinc-300";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${styles}`}
    >
      {label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gym-muted">
          {label}
        </p>

        <Icon
          size={20}
          className="shrink-0 text-gym-orange"
        />
      </div>

      <p
        className={`mt-4 break-words text-xl font-black sm:text-2xl ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function BillingPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [status, setStatus] =
    useState<InvoiceStatusFilter>("all");

  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] =
    useState(0);

  const [loaded, setLoaded] = useState<{
    key: string;
    data: PageData;
  } | null>(null);

  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const requestKey =
    `${status}:${search}:${page}:${refreshVersion}`;

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      billingApi.getInvoices(
        {
          status,
          search,
          page,
          limit: PAGE_SIZE,
        },
        controller.signal
      ),

      billingApi.getOverview(controller.signal),
    ])
      .then(([invoices, overview]) => {
        if (controller.signal.aborted) return;

        setLoaded({
          key: requestKey,
          data: {
            invoices,
            overview: overview.data,
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
  }, [requestKey, status, search, page]);

  const data =
    loaded?.key === requestKey
      ? loaded.data
      : null;

  const error =
    failure?.key === requestKey
      ? failure.message
      : null;

  const loading = !data && !error;

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPage(1);
    setSearch(searchInput.trim());
  }

  function changeStatus(
    nextStatus: InvoiceStatusFilter
  ) {
    setStatus(nextStatus);
    setPage(1);
  }

  function refresh() {
    setRefreshVersion((current) => current + 1);
  }

  const invoices = data?.invoices.data ?? [];
  const totalPages = data?.invoices.totalPages ?? 0;

  return (
    <div className="space-y-7">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gym-orange">
            Financial Operations
          </p>

          <h1 className="mt-2 text-3xl font-black uppercase italic text-white">
            Payments & Billing
          </h1>

          <p className="mt-3 text-sm text-gym-muted">
            Monitor membership invoices, collections
            and outstanding balances.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-gym-card px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-white/5"
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </header>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-400"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={19} />
            {error}
          </div>

          <button
            type="button"
            onClick={refresh}
            className="mt-3 font-bold underline"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Summary */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total Invoiced"
          value={
            data
              ? formatLkr(data.overview.billedLkr)
              : "—"
          }
          icon={FileText}
        />

        <SummaryCard
          label="Payments Collected"
          value={
            data
              ? formatLkr(data.overview.collectedLkr)
              : "—"
          }
          icon={Wallet}
          valueClass="text-emerald-400"
        />

        <SummaryCard
          label="Outstanding Balance"
          value={
            data
              ? formatLkr(data.overview.outstandingLkr)
              : "—"
          }
          icon={Clock3}
          valueClass="text-orange-400"
        />

        <SummaryCard
          label="Overdue Invoices"
          value={
            data
              ? String(data.overview.overdueCount)
              : "—"
          }
          icon={AlertCircle}
          valueClass="text-red-400"
        />
      </section>

      {/* Directory */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
        <div className="space-y-4 border-b border-white/10 p-6">
          <div>
            <h2 className="text-xl font-black text-white">
              Invoice Directory
            </h2>

            <p className="mt-1 text-xs text-gym-muted">
              Search by invoice number, member name,
              member reference or phone.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row">
            <form
              onSubmit={handleSearch}
              className="flex min-w-0 flex-1 gap-2"
            >
              <input
                type="search"
                aria-label="Search invoices"
                value={searchInput}
                maxLength={80}
                placeholder="Search invoices or members..."
                onChange={(event) =>
                  setSearchInput(event.target.value)
                }
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none focus:border-gym-orange"
              />

              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-4 py-3 text-sm font-bold text-white hover:bg-orange-600"
              >
                <Search size={17} />
                Search
              </button>
            </form>

            <select
              aria-label="Filter invoices by status"
              value={status}
              onChange={(event) =>
                changeStatus(
                  event.target.value as InvoiceStatusFilter
                )
              }
              className="rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none focus:border-gym-orange"
            >
              {statusOptions.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div
            role="status"
            className="p-12 text-center text-sm text-gym-muted"
          >
            Loading invoices...
          </div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-zinc-400">
            Unable to display invoices.
          </div>
        ) : invoices.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <FileText
              size={32}
              className="mx-auto text-zinc-500"
            />

            <h3 className="mt-4 font-bold text-white">
              No invoices found
            </h3>

            <p className="mt-2 text-sm text-gym-muted">
              Try another search or status filter.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left">
                <thead className="border-b border-white/10 bg-gym-bg text-xs uppercase text-gym-muted">
                  <tr>
                    <th className="px-5 py-4">Invoice</th>
                    <th className="px-5 py-4">Member</th>
                    <th className="px-5 py-4">Plan</th>
                    <th className="px-5 py-4">Total</th>
                    <th className="px-5 py-4">Paid</th>
                    <th className="px-5 py-4">Outstanding</th>
                    <th className="px-5 py-4">Due Date</th>
                    <th className="px-5 py-4">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="border-b border-white/5 text-sm transition hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-4"> 
                        <Link
                          to={`/payments/invoices/${invoice.id}`}
                          className="font-mono text-xs font-bold text-gym-orange hover:text-orange-300 hover:underline"
                        >
                          {invoice.invoiceNumber}
                        </Link>
                      </td>

                      <td className="px-5 py-4">
                        <Link
                          to={`/members/${invoice.memberId}`}
                          className="font-semibold text-white hover:text-gym-orange"
                        >
                          {invoice.memberName ??
                            "Unknown Member"}
                        </Link>

                        <p className="mt-1 text-xs text-gym-muted">
                          {invoice.memberReference ?? "—"}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-zinc-300">
                        {invoice.planName}
                      </td>

                      <td className="px-5 py-4 font-semibold text-white">
                        {formatLkr(invoice.totalLkr)}
                      </td>

                      <td className="px-5 py-4 text-emerald-400">
                        {formatLkr(invoice.paidLkr)}
                      </td>

                      <td className="px-5 py-4 font-semibold text-white">
                        {formatLkr(invoice.balanceLkr)}
                      </td>

                      <td className="px-5 py-4 text-zinc-300">
                        {formatDate(invoice.dueDate)}
                      </td>

                      <td className="px-5 py-4">
                        <PaymentStatus
                          status={invoice.paymentStatus}
                          overdue={invoice.isOverdue}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 px-6 py-5">
              <p className="text-xs text-gym-muted">
                Showing {invoices.length} of{" "}
                {data?.invoices.total ?? 0} matching invoices
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() =>
                    setPage((value) => Math.max(1, value - 1))
                  }
                  className="rounded-lg border border-white/10 p-2 text-white disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ArrowLeft size={17} />
                </button>

                <span className="text-sm text-zinc-300">
                  Page {page} of {Math.max(1, totalPages)}
                </span>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((value) => value + 1)
                  }
                  className="rounded-lg border border-white/10 p-2 text-white disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <p className="text-xs text-gym-muted">
        Dashboard totals represent invoices recorded in
        the system. They exclude membership purchases
        not yet reconciled with billing records.
      </p>
    </div>
  );
}
