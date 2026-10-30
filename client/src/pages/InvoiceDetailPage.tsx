
import { useEffect, useState } from "react";

import { isAxiosError } from "axios";
import { Link, useParams } from "react-router";
import {
  useForm,
  useWatch,
  type SubmitHandler,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FileText,
  RefreshCw,
  Save,
  Wallet,
} from "lucide-react";

import { billingApi } from "../api/billing.api";
import { getApiErrorMessage } from "../api/api";

import {
  paymentFormSchema,
  type PaymentFormValues,
} from "../validations/payment.schema";

import type {
  BillingInvoiceDetail,
  BillingPayment,
  RecordPaymentPayload,
} from "../types/billing";

interface PageData {
  invoice: BillingInvoiceDetail;
  payments: BillingPayment[];
}

function formatLkr(value: number): string {
  return `LKR ${new Intl.NumberFormat("en-LK").format(value)}`;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  }).format(new Date(date));
}

function PaymentStatus({
  status,
  overdue,
}: {
  status: BillingInvoiceDetail["paymentStatus"];
  overdue: boolean;
}) {
  const style =
    status === "PAID"
      ? "bg-emerald-500/10 text-emerald-400"
      : status === "PARTIAL"
        ? "bg-orange-500/10 text-orange-400"
        : "bg-zinc-500/10 text-zinc-300";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`rounded-full px-3 py-1.5 text-xs font-bold ${style}`}
      >
        {status}
      </span>

      {overdue && (
        <span className="rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400">
          OVERDUE
        </span>
      )}
    </div>
  );
}

function AmountCard({
  title,
  amount,
  amountClass = "text-white",
}: {
  title: string;
  amount: number;
  amountClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-gym-muted">
        {title}
      </p>

      <p
        className={`mt-4 break-words text-xl font-black ${amountClass}`}
      >
        {formatLkr(amount)}
      </p>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [refreshVersion, setRefreshVersion] =
    useState(0);

  const [loaded, setLoaded] = useState<{
    key: string;
    data: PageData;
  } | null>(null);

  const [loadFailure, setLoadFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  // Retain the original payment payload if the
  // server's response could not be confirmed.
  const [pendingPayment, setPendingPayment] =
    useState<RecordPaymentPayload | null>(null);

  const [uncertainPayment, setUncertainPayment] =
    useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amountLkr: undefined,
      method: "CASH",
      reference: "",
      notes: "",
    },
  });

  const selectedMethod = useWatch({
    control,
    name: "method",
  });

  const requestKey = `${id ?? "missing"}:${refreshVersion}`;

  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    void Promise.all([
      billingApi.getInvoiceById(
        id,
        controller.signal
      ),
      billingApi.getInvoicePayments(
        id,
        controller.signal
      ),
    ])
      .then(([invoiceResponse, paymentsResponse]) => {
        if (controller.signal.aborted) return;

        setLoaded({
          key: requestKey,
          data: {
            invoice: invoiceResponse.data,
            payments: paymentsResponse.data,
          },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setLoadFailure({
          key: requestKey,
          message: getApiErrorMessage(error),
        });
      });

    return () => controller.abort();
  }, [id, requestKey]);

  const data =
    loaded?.key === requestKey
      ? loaded.data
      : null;

  const loadError =
    loadFailure?.key === requestKey
      ? loadFailure.message
      : null;

  function refreshPage() {
    setRefreshVersion((version) => version + 1);
  }

  const onSubmit: SubmitHandler<PaymentFormValues> =
    async (values) => {
      if (!id || !data) return;

      const invoice = data.invoice;

      if (
        !uncertainPayment &&
        values.amountLkr > invoice.balanceLkr
      ) {
        setActionError(
          `Payment cannot exceed the outstanding balance of ${formatLkr(invoice.balanceLkr)}.`
        );
        return;
      }

      // Retrying an uncertain payment must reuse
      // exactly the same request ID and payload.
      const payload: RecordPaymentPayload =
        uncertainPayment && pendingPayment
          ? pendingPayment
          : {
              invoiceId: id,
              amountLkr: values.amountLkr,
              method: values.method,
              requestId: crypto.randomUUID(),
              reference: values.reference.trim(),
              notes: values.notes.trim(),
            };

      setPendingPayment(payload);
      setActionError("");
      setNotice("");

      try {
        const result =
          await billingApi.recordPayment(payload);

        setPendingPayment(null);
        setUncertainPayment(false);

        setNotice(
          result.replayed
            ? `Payment ${result.data.payment.paymentNumber} was already recorded. No duplicate was created.`
            : `Payment ${result.data.payment.paymentNumber} recorded successfully.`
        );

        reset({
          amountLkr: undefined,
          method: "CASH",
          reference: "",
          notes: "",
        });

        // Reload both the updated invoice
        // and its payment history.
        refreshPage();
      } catch (error: unknown) {
        // An HTTP 5xx, timeout or network failure
        // may occur after the database commits.
        // Keep the same request ID for a safe retry.
        const outcomeUncertain =
          !isAxiosError(error) ||
          !error.response ||
          error.response.status >= 500 ||
          error.response.status === 408;

        if (outcomeUncertain) {
          setUncertainPayment(true);
          setActionError(
            "Payment result could not be confirmed. Do not create another payment. You can retry this same request using the button below."
          );
        } else {
          setPendingPayment(null);
          setUncertainPayment(false);
          setActionError(getApiErrorMessage(error));
        }
      }
    };

  if (!id) {
    return (
      <p role="alert" className="text-red-400">
        Missing invoice ID.
      </p>
    );
  }

  const loading = !data && !loadError;

  if (loading) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-white/10 bg-gym-card p-12 text-center text-gym-muted"
      >
        Loading invoice and payment history...
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gym-card p-8">
        <p role="alert" className="text-red-400">
          {loadError || "Invoice unavailable"}
        </p>

        <button
          type="button"
          onClick={refreshPage}
          className="mt-5 rounded-xl bg-gym-orange px-5 py-3 font-bold text-white"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { invoice, payments } = data;

  const fullyPaid = invoice.balanceLkr <= 0;

  return (
    <div className="space-y-7">
      {/* Navigation */}
      <div>
        <Link
          to="/payments"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-gym-orange"
        >
          <ArrowLeft size={17} />
          Back to Billing
        </Link>
      </div>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gym-orange">
            Financial Operations
          </p>

          <h1 className="mt-2 text-3xl font-black uppercase italic text-white">
            Invoice Details
          </h1>

          <p className="mt-3 break-all font-mono text-sm text-zinc-400">
            {invoice.invoiceNumber}
          </p>

          <div className="mt-4">
            <PaymentStatus
              status={invoice.paymentStatus}
              overdue={invoice.isOverdue}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={refreshPage}
          disabled={isSubmitting || uncertainPayment}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-gym-card px-4 py-3 text-sm font-bold text-zinc-200 hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </header>

      {/* Summary cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <AmountCard
          title="Invoice Total"
          amount={invoice.totalLkr}
        />

        <AmountCard
          title="Amount Paid"
          amount={invoice.paidLkr}
          amountClass="text-emerald-400"
        />

        <AmountCard
          title="Outstanding Balance"
          amount={invoice.balanceLkr}
          amountClass={
            fullyPaid
              ? "text-emerald-400"
              : "text-orange-400"
          }
        />
      </section>

      {/* Invoice information */}
      <section className="rounded-2xl border border-white/10 bg-gym-card p-6">
        <div className="flex items-center gap-3">
          <FileText
            size={23}
            className="text-gym-orange"
          />
          <h2 className="text-xl font-black text-white">
            Invoice Information
          </h2>
        </div>

        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gym-muted">
              Member
            </dt>

            <dd className="mt-2">
              <Link
                to={`/members/${invoice.memberId}`}
                className="font-semibold text-gym-orange hover:text-orange-300"
              >
                View Member Profile
              </Link>
            </dd>
          </div>

          <div>
            <dt className="text-xs text-gym-muted">
              Purchased Membership Plan
            </dt>

            <dd className="mt-2 font-semibold text-white">
              {invoice.planName}
            </dd>

            <p className="mt-1 font-mono text-xs text-zinc-500">
              {invoice.planCode}
            </p>
          </div>

          <div>
            <dt className="text-xs text-gym-muted">
              Due Date
            </dt>

            <dd className="mt-2 font-semibold text-white">
              {formatDate(invoice.dueDate)}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-gym-muted">
              Invoice Created
            </dt>

            <dd className="mt-2 font-semibold text-white">
              {formatDateTime(invoice.createdAt)}
            </dd>
          </div>
        </dl>
      </section>

      {/* Success message */}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5"
        >
          <CheckCircle2
            size={22}
            className="shrink-0 text-emerald-400"
          />

          <p className="text-sm font-semibold text-emerald-300">
            {notice}
          </p>
        </div>
      )}

      {/* Record payment */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
        <div className="flex items-center gap-3 border-b border-white/10 p-6">
          <Wallet
            size={23}
            className="text-gym-orange"
          />

          <div>
            <h2 className="text-xl font-black text-white">
              Record Payment
            </h2>

            <p className="mt-1 text-xs text-gym-muted">
              Record a payment already received
              and verified by gym staff.
            </p>
          </div>
        </div>

        {fullyPaid ? (
          <div className="flex items-center gap-3 p-6">
            <CheckCircle2
              size={25}
              className="text-emerald-400"
            />

            <div>
              <p className="font-bold text-emerald-400">
                Invoice Fully Paid
              </p>

              <p className="mt-1 text-sm text-zinc-400">
                No outstanding balance remains.
              </p>
            </div>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-6 p-6"
          >
            <div className="grid gap-5 md:grid-cols-2">
              {/* Amount */}
              <div>
                <label
                  htmlFor="payment-amount"
                  className="mb-2 block text-sm font-bold text-zinc-300"
                >
                  Amount (LKR) *
                </label>

                <input
                  id="payment-amount"
                  type="number"
                  min={1}
                  max={Math.min(
                    invoice.balanceLkr,
                    10000000
                  )}
                  step={1}
                  placeholder="Enter amount"
                  disabled={isSubmitting}
                  readOnly={uncertainPayment}
                  className="w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none focus:border-gym-orange disabled:opacity-50"
                  {...register("amountLkr", {
                    valueAsNumber: true,
                  })}
                />

                {errors.amountLkr && (
                  <p
                    role="alert"
                    className="mt-2 text-xs text-red-400"
                  >
                    {errors.amountLkr.message}
                  </p>
                )}

                <button
                  type="button"
                  disabled={
                    isSubmitting || uncertainPayment
                  }
                  onClick={() =>
                    setValue(
                      "amountLkr",
                      invoice.balanceLkr,
                      { shouldValidate: true }
                    )
                  }
                  className="mt-2 text-xs font-bold text-gym-orange hover:text-orange-300 disabled:opacity-50"
                >
                  Use Full Outstanding Amount
                </button>
              </div>

              {/* Method */}
              <div>
                <label
                  htmlFor="payment-method"
                  className="mb-2 block text-sm font-bold text-zinc-300"
                >
                  Payment Method *
                </label>

                <select
                  id="payment-method"
                  disabled={isSubmitting}
                  aria-disabled={uncertainPayment}
                  tabIndex={uncertainPayment ? -1 : 0}
                  className={`w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none focus:border-gym-orange disabled:opacity-50 ${
                    uncertainPayment ? "pointer-events-none" : ""
                  }`}
                  {...register("method")}
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">
                    Bank Transfer
                  </option>
                  <option value="CARD">
                    Card — Already Processed
                  </option>
                </select>

                {errors.method && (
                  <p className="mt-2 text-xs text-red-400">
                    {errors.method.message}
                  </p>
                )}
              </div>
            </div>

            {/* Transaction reference */}
            <div>
              <label
                htmlFor="payment-reference"
                className="mb-2 block text-sm font-bold text-zinc-300"
              >
                Transaction Reference
                {selectedMethod !== "CASH" && " *"}
              </label>

              <input
                id="payment-reference"
                type="text"
                maxLength={80}
                disabled={isSubmitting}
                readOnly={uncertainPayment}
                placeholder={
                  selectedMethod === "CASH"
                    ? "Optional for cash"
                    : "Enter verified transaction reference"
                }
                className="w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none focus:border-gym-orange disabled:opacity-50"
                {...register("reference")}
              />

              {errors.reference && (
                <p
                  role="alert"
                  className="mt-2 text-xs text-red-400"
                >
                  {errors.reference.message}
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label
                htmlFor="payment-notes"
                className="mb-2 block text-sm font-bold text-zinc-300"
              >
                Notes
              </label>

              <textarea
                id="payment-notes"
                rows={3}
                maxLength={300}
                disabled={isSubmitting}
                readOnly={uncertainPayment}
                placeholder="Optional payment notes"
                className="w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none focus:border-gym-orange disabled:opacity-50"
                {...register("notes")}
              />

              {errors.notes && (
                <p className="mt-2 text-xs text-red-400">
                  {errors.notes.message}
                </p>
              )}
            </div>

            {/* Error feedback */}
            {actionError && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle
                    size={18}
                    className="shrink-0"
                  />
                  <p>{actionError}</p>
                </div>
              </div>
            )}

            {uncertainPayment && (
              <p className="text-xs text-orange-300">
                This retry will reuse the original
                payment request ID. Do not reload or
                leave this page until the result has
                been checked.
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-6 py-3.5 text-sm font-extrabold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uncertainPayment ? (
                <RefreshCw size={18} />
              ) : (
                <Save size={18} />
              )}

              {isSubmitting
                ? "Processing Payment..."
                : uncertainPayment
                  ? "Retry Same Payment"
                  : "Confirm Payment"}
            </button>
          </form>
        )}
      </section>

      {/* Payment history */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
        <div className="flex items-center gap-3 border-b border-white/10 p-6">
          <CreditCard
            size={23}
            className="text-gym-orange"
          />

          <div>
            <h2 className="text-xl font-black text-white">
              Payment History
            </h2>

            <p className="mt-1 text-xs text-gym-muted">
              {payments.length} recorded{" "}
              {payments.length === 1
                ? "transaction"
                : "transactions"}
            </p>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="p-10 text-center">
            <FileText
              size={30}
              className="mx-auto text-zinc-500"
            />

            <p className="mt-4 text-sm text-zinc-400">
              No payments have been recorded
              for this invoice.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="border-b border-white/10 bg-gym-bg text-xs uppercase text-gym-muted">
                <tr>
                  <th className="px-5 py-4">
                    Payment Reference
                  </th>

                  <th className="px-5 py-4">
                    Date
                  </th>

                  <th className="px-5 py-4">
                    Method
                  </th>

                  <th className="px-5 py-4">
                    Transaction Reference
                  </th>

                  <th className="px-5 py-4">
                    Amount
                  </th>

                  <th className="px-5 py-4">
                    Receipt
                  </th>
                </tr>
              </thead>

              <tbody>
                {payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b border-white/5 text-sm"
                  >
                    <td className="px-5 py-4">
                      <p className="font-mono text-xs text-gym-orange">
                        {payment.paymentNumber}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-zinc-300">
                      {formatDateTime(payment.receivedAt)}
                    </td>

                    <td className="px-5 py-4 font-medium text-white">
                      {payment.method.replaceAll(
                        "_",
                        " "
                      )}
                    </td>

                    <td className="px-5 py-4 text-zinc-400">
                      {payment.reference || "—"}
                    </td>

                    <td className="px-5 py-4 font-bold text-emerald-400">
                      {formatLkr(payment.amountLkr)}
                    </td>
       
                    <td className="px-5 py-4">
                      <Link
                        to={`/payments/invoices/${invoice.id}/receipts/${payment.id}`}
                        className="inline-flex items-center gap-2 text-sm font-bold text-gym-orange hover:text-orange-300 hover:underline"
                      >
                        <FileText size={16} />
                        View Receipt
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gym-muted">
        Card and bank-transfer entries record
        already-confirmed payments. This screen
        does not process transactions through a
        payment gateway.
      </p>
    </div>
  );
}
