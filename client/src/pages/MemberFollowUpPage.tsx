
import { useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { hasPermissions } from "../auth/permissions";
import PermissionGate from "../components/PermissionGate";
import { Link, useParams } from "react-router";
import { isAxiosError } from "axios";

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
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  RefreshCw,
  Save,
} from "lucide-react";

import { attentionApi } from "../api/attention.api";
import { getApiErrorMessage } from "../api/api";

import {
  followUpFormSchema,
  type FollowUpFormValues,
} from "../validations/follow-up.schema";

import type {
  CreateFollowUpPayload,
  FollowUpType,
  MemberFollowUpsResponse,
} from "../types/attention";

const PAGE_SIZE = 10;

const alertLabels: Record<FollowUpType, string> = {
  MEMBERSHIP_EXPIRING: "Membership Expiring",
  PAYMENT_OUTSTANDING: "Outstanding Payment",
  ATTENDANCE_INACTIVE: "Attendance Inactivity",
};

function isFollowUpType(
  value: string | undefined
): value is FollowUpType {
  return (
    value === "MEMBERSHIP_EXPIRING" ||
    value === "PAYMENT_OUTSTANDING" ||
    value === "ATTENDANCE_INACTIVE"
  );
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

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  }).format(new Date(value));
}

function readable(value: string): string {
  return value.replaceAll("_", " ");
}

export default function MemberFollowUpPage() {
  const { staff } = useAuth();
  const { memberId, alertType } = useParams<{
    memberId: string;
    alertType: string;
  }>();

  const selectedType = isFollowUpType(alertType)
    ? alertType
    : null;

  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] =
    useState(0);

  const [loaded, setLoaded] = useState<{
    key: string;
    response: MemberFollowUpsResponse;
  } | null>(null);

  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [sending, setSending] = useState(false);

  // Keep the ORIGINAL payload for a retry.
  const [pending, setPending] =
    useState<CreateFollowUpPayload | null>(null);

  const [uncertain, setUncertain] =
    useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<FollowUpFormValues>({
    resolver: zodResolver(followUpFormSchema),
    defaultValues: {
      method: "PHONE_CALL",
      outcome: "CONTACTED",
      notes: "",
      nextFollowUpDate: "",
    },
  });

  const outcome = useWatch({
    control,
    name: "outcome",
  });

  const requiresDate =
    outcome === "FOLLOW_UP_REQUIRED" ||
    outcome === "PROMISED_ACTION";

  const outcomeField = register("outcome");

  const requestKey =
    `${memberId ?? "missing"}:${selectedType ?? "invalid"}:${page}:${refreshVersion}`;

  // Load the existing history for this member
  // and the selected attention category.
  useEffect(() => {
    if (!memberId || !selectedType) return;

    const controller = new AbortController();

    void attentionApi.getMemberFollowUps(
      memberId,
      {
        alertType: selectedType,
        page,
        limit: PAGE_SIZE,
      },
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
  }, [memberId, selectedType, page, requestKey]);

  const history =
    loaded?.key === requestKey
      ? loaded.response
      : null;

  const loadError =
    failure?.key === requestKey
      ? failure.message
      : null;

  function refreshHistory() {
    setRefreshVersion((value) => value + 1);
  }

  // Shared by a NEW submission and a RETRY.
  async function saveFollowUp(
    payload: CreateFollowUpPayload
  ) {
    if (sending || !hasPermissions(staff, "follow-ups.create")) return;

    setSending(true);
    setActionError("");
    setNotice("");

    try {
      const response =
        await attentionApi.createFollowUp(payload);

      setPending(null);
      setUncertain(false);

      setNotice(
        response.replayed
          ? "This follow-up was already recorded. No duplicate was created."
          : "Follow-up recorded successfully."
      );

      reset({
        method: "PHONE_CALL",
        outcome: "CONTACTED",
        notes: "",
        nextFollowUpDate: "",
      });

      setPage(1);
      refreshHistory();
    } catch (error: unknown) {
      // A timeout, network error or server failure
      // might occur AFTER the database saved.
      const outcomeUncertain =
        !isAxiosError(error) ||
        !error.response ||
        error.response.status >= 500 ||
        error.response.status === 408;

      if (outcomeUncertain) {
        setUncertain(true);
        setActionError(
          "The save result could not be confirmed. Do not create a new follow-up. Retry the original request or review the member's history."
        );
      } else {
        setPending(null);
        setUncertain(false);
        setActionError(getApiErrorMessage(error));
      }
    } finally {
      setSending(false);
    }
  }

  const onSubmit: SubmitHandler<FollowUpFormValues> =
    async (values) => {
      if (
        !memberId ||
        !selectedType ||
        sending ||
        uncertain
      ) {
        return;
      }

      const nextDate = values.nextFollowUpDate || null;

      if (
        nextDate &&
        nextDate < todayInColombo()
      ) {
        setActionError(
          "The next follow-up date cannot be in the past."
        );
        return;
      }

      const payload: CreateFollowUpPayload = {
        requestId: crypto.randomUUID(),

        memberId,
        alertType: selectedType,

        method: values.method,
        outcome: values.outcome,
        notes: values.notes.trim(),

        nextFollowUpDate: nextDate,
      };

      setPending(payload);
      await saveFollowUp(payload);
    };

  if (!memberId || !selectedType) {
    return (
      <div role="alert" className="text-red-400">
        Invalid member follow-up link.
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/attention"
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-gym-orange"
          >
            <ArrowLeft size={17} />
            Back to Attention Center
          </Link>

          <p className="mt-5 text-xs font-bold uppercase tracking-widest text-gym-orange">
            Staff Follow-Up Tracking
          </p>

          <h1 className="mt-2 text-3xl font-black uppercase italic text-white">
            Member Follow-Up
          </h1>

          <p className="mt-2 text-sm text-gym-muted">
            {alertLabels[selectedType]}
          </p>
        </div>

        <PermissionGate permissions={["members.read"]}><Link
          to={`/members/${memberId}`}
          className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/5"
        >
          View Member Profile
        </Link></PermissionGate>
      </header>

      {/* Member identity */}
      <section className="rounded-2xl border border-white/10 bg-gym-card p-5">
        {history ? (
          <>
            <h2 className="text-xl font-black text-white">
              {history.member.fullName}
            </h2>

            <p className="mt-2 text-sm text-gym-muted">
              {history.member.memberReference}
            </p>
          </>
        ) : (
          <p className="text-sm text-gym-muted">
            {loadError
              ? "Member details unavailable."
              : "Loading member details..."}
          </p>
        )}
      </section>

      {/* Feedback */}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300"
        >
          <CheckCircle2 size={19} />
          {notice}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400"
        >
          <AlertCircle size={19} className="shrink-0" />
          <p>{actionError}</p>
        </div>
      )}

      {/* New follow-up */}
      <PermissionGate permissions={["follow-ups.create"]}>
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
        <div className="flex items-center gap-3 border-b border-white/10 p-6">
          <ClipboardCheck
            size={23}
            className="text-gym-orange"
          />

          <div>
            <h2 className="text-xl font-black text-white">
              Record New Follow-Up
            </h2>

            <p className="mt-1 text-xs text-gym-muted">
              Record an action already performed by staff.
            </p>
          </div>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5 p-6"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label
                htmlFor="follow-up-method"
                className="mb-2 block text-sm font-bold text-zinc-300"
              >
                Contact Method *
              </label>

              <select
                id="follow-up-method"
                disabled={sending || uncertain}
                {...register("method")}
                className="w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white disabled:opacity-50"
              >
                <option value="PHONE_CALL">Phone Call</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="SMS">SMS</option>
                <option value="EMAIL">Email</option>
                <option value="IN_PERSON">In Person</option>
                <option value="INTERNAL_REVIEW">
                  Internal Review
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="follow-up-outcome"
                className="mb-2 block text-sm font-bold text-zinc-300"
              >
                Outcome *
              </label>

              <select
                id="follow-up-outcome"
                {...outcomeField}
                onChange={(event) => {
                  void outcomeField.onChange(event);

                  if (
                    event.target.value === "RESOLVED"
                  ) {
                    setValue(
                      "nextFollowUpDate",
                      "",
                      { shouldValidate: true }
                    );
                  }
                }}
                disabled={sending || uncertain}
                className="w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white disabled:opacity-50"
              >
                <option value="CONTACTED">Contacted</option>
                <option value="NO_ANSWER">No Answer</option>
                <option value="PROMISED_ACTION">
                  Promised Action
                </option>
                <option value="FOLLOW_UP_REQUIRED">
                  Follow-Up Required
                </option>
                <option value="DECLINED">Declined</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="follow-up-notes"
              className="mb-2 block text-sm font-bold text-zinc-300"
            >
              Follow-Up Notes *
            </label>

            <textarea
              id="follow-up-notes"
              rows={4}
              maxLength={500}
              disabled={sending || uncertain}
              placeholder="Describe the action taken and member's response..."
              {...register("notes")}
              className="w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none focus:border-gym-orange disabled:opacity-50"
            />

            {errors.notes && (
              <p role="alert" className="mt-2 text-xs text-red-400">
                {errors.notes.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="follow-up-date"
              className="mb-2 block text-sm font-bold text-zinc-300"
            >
              Next Follow-Up Date
              {requiresDate ? " *" : " (Optional)"}
            </label>

            <input
              id="follow-up-date"
              type="date"
              min={todayInColombo()}
              disabled={sending || uncertain}
              readOnly={outcome === "RESOLVED"}
              {...register("nextFollowUpDate")}
              className="w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white disabled:opacity-50"
            />

            {errors.nextFollowUpDate && (
              <p role="alert" className="mt-2 text-xs text-red-400">
                {errors.nextFollowUpDate.message}
              </p>
            )}

            {requiresDate && (
              <p className="mt-2 text-xs text-gym-muted">
                This outcome requires a scheduled next action.
              </p>
            )}
          </div>

          {uncertain && pending ? (
            <div className="space-y-3 rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <p className="text-sm text-orange-300">
                The original submission may have succeeded.
                Retrying uses exactly the same request ID and details.
              </p>

              <button
                type="button"
                disabled={sending}
                onClick={() =>
                  void saveFollowUp(pending)
                }
                className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                <RefreshCw size={17} />
                {sending
                  ? "Checking original request..."
                  : "Retry Same Follow-Up"}
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={sending || Boolean(loadError)}
              className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-6 py-3 text-sm font-extrabold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              <Save size={18} />
              {sending
                ? "Saving Follow-Up..."
                : "Save Follow-Up"}
            </button>
          )}
        </form>
      </section>

      {/* History */}
      </PermissionGate>
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-6">
          <div>
            <h2 className="text-xl font-black text-white">
              Follow-Up History
            </h2>

            <p className="mt-1 text-xs text-gym-muted">
              {alertLabels[selectedType]}
            </p>
          </div>

          <button
            type="button"
            onClick={refreshHistory}
            className="rounded-xl border border-white/10 p-3 text-zinc-300 hover:bg-white/5"
            aria-label="Refresh follow-up history"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {loadError && (
          <div role="alert" className="p-6 text-sm text-red-400">
            {loadError}
          </div>
        )}

        {!history && !loadError && (
          <p role="status" className="p-8 text-center text-gym-muted">
            Loading follow-up history...
          </p>
        )}

        {history && history.data.length === 0 && (
          <p className="p-8 text-center text-sm text-gym-muted">
            No follow-ups recorded for this category yet.
          </p>
        )}

        {history && history.data.length > 0 && (
          <>
            <div className="divide-y divide-white/10">
              {history.data.map((item) => (
                <article
                  key={item.id}
                  className="space-y-3 p-5 sm:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-400">
                        {readable(item.method)}
                      </span>

                      <span className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-300">
                        {readable(item.outcome)}
                      </span>
                    </div>

                    <span className="text-xs text-gym-muted">
                      {formatDateTime(item.recordedAt)}
                    </span>
                  </div>

                  <p className="whitespace-pre-wrap break-words text-sm text-zinc-200">
                    {item.notes}
                  </p>

                  {item.nextFollowUpDate && (
                    <p className="text-sm font-bold text-orange-400">
                      Next Follow-Up:{" "}
                      {formatDate(item.nextFollowUpDate)}
                    </p>
                  )}

                  <p className="text-xs text-gym-muted">
                    Recorded by staff ID: {item.handledBy}
                  </p>
                </article>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/10 p-5">
              <p className="text-xs text-gym-muted">
                {history.total} recorded actions
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Previous history page"
                  disabled={page <= 1}
                  onClick={() =>
                    setPage((value) => Math.max(1, value - 1))
                  }
                  className="rounded-lg border border-white/10 p-2 text-white disabled:opacity-30"
                >
                  <ChevronLeft size={17} />
                </button>

                <span className="text-sm text-zinc-300">
                  {page} / {Math.max(1, history.totalPages)}
                </span>

                <button
                  type="button"
                  aria-label="Next history page"
                  disabled={page >= history.totalPages}
                  onClick={() =>
                    setPage((value) => value + 1)
                  }
                  className="rounded-lg border border-white/10 p-2 text-white disabled:opacity-30"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <p className="text-xs text-gym-muted">
        Follow-up records document staff actions.
        They do not automatically send communications,
        renew memberships, settle invoices or change attendance.
      </p>
    </div>
  );
}
