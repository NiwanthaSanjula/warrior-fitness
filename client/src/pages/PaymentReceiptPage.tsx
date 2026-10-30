
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router";

import {
  ArrowLeft,
  CheckCircle2,
  Printer,
  RefreshCw,
} from "lucide-react";

import { billingApi } from "../api/billing.api";
import { membersApi } from "../api/members.api";
import { getApiErrorMessage } from "../api/api";

import type {
  BillingInvoiceDetail,
  BillingPayment,
} from "../types/billing";

import "../styles/receipt-print.css";

interface ReceiptData {
  invoice: BillingInvoiceDetail;
  payment: BillingPayment;
  memberName: string;
  memberReference: string;
}

function formatLkr(amount: number): string {
  return `LKR ${new Intl.NumberFormat("en-LK").format(amount)}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    timeZone: "Asia/Colombo",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function formatMethod(method: string): string {
  return method.replaceAll("_", " ");
}

function ReceiptSheet({ data }: { data: ReceiptData }) {
  const {
    invoice,
    payment,
    memberName,
    memberReference,
  } = data;

  return (
    <article className="wf-receipt-sheet mx-auto w-full max-w-[760px] rounded-2xl border border-zinc-200 bg-white p-7 text-zinc-900 shadow-lg sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-zinc-200 pb-7">
        <div>
          <p className="text-2xl font-black uppercase tracking-wide text-orange-600">
            WARRIOR FITNESS
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            Payment Receipt
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">
          <CheckCircle2 size={18} />
          PAYMENT RECORDED
        </div>
      </header>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Receipt Number
          </p>

          <p className="mt-2 break-all font-mono text-sm font-bold text-zinc-900">
            {payment.paymentNumber}
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Payment Date & Time
          </p>

          <p className="mt-2 text-sm font-semibold">
            {formatDateTime(payment.receivedAt)}
          </p>

          <p className="mt-1 text-xs text-zinc-500">
            Sri Lanka Time
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Received From
          </p>

          <p className="mt-2 font-bold">
            {memberName}
          </p>

          <p className="mt-1 text-sm text-zinc-600">
            {memberReference}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Invoice Reference
          </p>

          <p className="mt-2 break-all font-mono text-xs font-bold">
            {invoice.invoiceNumber}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-zinc-200">
        <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wide">
            Payment Details
          </h2>
        </div>

        <dl className="space-y-4 px-5 py-5 text-sm">
          <div className="flex flex-wrap justify-between gap-3">
            <dt className="text-zinc-500">
              Membership Plan
            </dt>
            <dd className="font-semibold">
              {invoice.planName}
            </dd>
          </div>

          <div className="flex flex-wrap justify-between gap-3">
            <dt className="text-zinc-500">
              Invoice Total
            </dt>
            <dd className="font-semibold">
              {formatLkr(invoice.totalLkr)}
            </dd>
          </div>

          <div className="flex flex-wrap justify-between gap-3">
            <dt className="text-zinc-500">
              Payment Method
            </dt>
            <dd className="font-semibold">
              {formatMethod(payment.method)}
            </dd>
          </div>

          {payment.reference && (
            <div className="flex flex-wrap justify-between gap-3">
              <dt className="text-zinc-500">
                Transaction Reference
              </dt>
              <dd className="break-all font-semibold">
                {payment.reference}
              </dd>
            </div>
          )}

          {payment.notes && (
            <div className="border-t border-zinc-100 pt-4">
              <dt className="text-zinc-500">
                Notes
              </dt>
              <dd className="mt-2 whitespace-pre-wrap break-words">
                {payment.notes}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="mt-8 rounded-xl bg-zinc-900 px-6 py-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-300">
          Amount Received
        </p>

        <p className="mt-3 text-3xl font-black">
          {formatLkr(payment.amountLkr)}
        </p>
      </div>

      <footer className="mt-10 border-t border-zinc-200 pt-5 text-center text-xs leading-6 text-zinc-500">
        <p className="font-bold text-zinc-800">
          Thank you for choosing Warrior Fitness.
        </p>

        <p>
          This receipt confirms the individual payment
          recorded above, not necessarily full settlement
          of the invoice.
        </p>

        <p>
          Generated from the Warrior Fitness
          Gym Management System.
        </p>
      </footer>
    </article>
  );
}

export default function PaymentReceiptPage() {
  const { invoiceId, paymentId } = useParams<{
    invoiceId: string;
    paymentId: string;
  }>();

  const [refreshVersion, setRefreshVersion] = useState(0);

  const [loaded, setLoaded] = useState<{
    key: string;
    data: ReceiptData;
  } | null>(null);

  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const requestKey =
    `${invoiceId ?? "missing"}:${paymentId ?? "missing"}:${refreshVersion}`;

  useEffect(() => {
    if (!invoiceId || !paymentId) return;

    const controller = new AbortController();

    async function loadReceipt() {
      if (!invoiceId || !paymentId) return;

      try {
        const [invoiceResponse, historyResponse] =
          await Promise.all([
            billingApi.getInvoiceById(
              invoiceId,
              controller.signal
            ),
            billingApi.getInvoicePayments(
              invoiceId,
              controller.signal
            ),
          ]);

        if (controller.signal.aborted) return;

        const payment = historyResponse.data.find(
          (item) =>
            item.id === paymentId &&
            item.invoiceId === invoiceId
        );

        if (!payment) {
          setFailure({
            key: requestKey,
            message:
              "This payment was not found on the selected invoice.",
          });
          return;
        }

        const memberResponse =
          await membersApi.getMemberById(
            invoiceResponse.data.memberId,
            controller.signal
          );

        if (controller.signal.aborted) return;

        setLoaded({
          key: requestKey,
          data: {
            invoice: invoiceResponse.data,
            payment,
            memberName: memberResponse.data.fullName,
            memberReference: memberResponse.data.memberId,
          },
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;

        setFailure({
          key: requestKey,
          message: getApiErrorMessage(error),
        });
      }
    }

    void loadReceipt();

    return () => controller.abort();
  }, [invoiceId, paymentId, requestKey]);

  const data =
    loaded?.key === requestKey
      ? loaded.data
      : null;

  const error =
    failure?.key === requestKey
      ? failure.message
      : null;

  if (!invoiceId || !paymentId) {
    return (
      <p role="alert" className="text-red-400">
        Invalid receipt link.
      </p>
    );
  }

  if (!data && !error) {
    return (
      <div
        role="status"
        className="rounded-2xl bg-gym-card p-10 text-center text-gym-muted"
      >
        Loading payment receipt...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gym-card p-8">
        <p role="alert" className="text-red-400">
          {error ?? "Receipt unavailable"}
        </p>

        <button
          type="button"
          onClick={() =>
            setRefreshVersion((value) => value + 1)
          }
          className="mt-5 flex items-center gap-2 rounded-xl bg-gym-orange px-5 py-3 font-bold text-white"
        >
          <RefreshCw size={17} />
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            to={`/payments/invoices/${invoiceId}`}
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-gym-orange"
          >
            <ArrowLeft size={17} />
            Back to Invoice
          </Link>

          <h1 className="mt-5 text-3xl font-black uppercase italic text-white">
            Payment Receipt
          </h1>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-5 py-3 font-bold text-white hover:bg-orange-600"
        >
          <Printer size={18} />
          Print / Save as PDF
        </button>
      </div>

      <ReceiptSheet data={data} />

      {createPortal(
        <div id="wf-payment-print-root">
          <ReceiptSheet data={data} />
        </div>,
        document.body
      )}
    </div>
  );
}
