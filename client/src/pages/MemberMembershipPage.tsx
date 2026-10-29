
import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { Link, useParams } from "react-router";
import {
  type SubmitHandler,
  useForm,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  Save,
} from "lucide-react";

import { membersApi } from "../api/members.api";
import { plansApi } from "../api/plans.api";
import { membershipsApi } from "../api/memberships.api";
import { getApiErrorMessage } from "../api/api";

import {
  membershipFormSchema,
  type MembershipFormValues,
} from "../validations/membership.schema";

import type { Member } from "../types/member";
import type { MembershipPlan } from "../types/plan";
import type {
  Membership,
  MembershipSummary,
} from "../types/membership";

interface PageData {
  member: Member;
  plans: MembershipPlan[];
  summary: MembershipSummary;
  history: Membership[];
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

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
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

function formatPrice(amount: number): string {
  return `LKR ${new Intl.NumberFormat("en-LK").format(amount)}`;
}

function formatDuration(plan: {
  durationCount: number;
  durationUnit: "DAYS" | "MONTHS";
}): string {
  const unit =
    plan.durationUnit === "MONTHS"
      ? "calendar month"
      : "day";

  return `${plan.durationCount} ${unit}${
    plan.durationCount === 1 ? "" : "s"
  }`;
}

function StatusLabel({ status }: { status: string }) {
  const color =
    status === "ACTIVE"
      ? "text-emerald-400 bg-emerald-500/10"
      : status === "EXPIRED"
        ? "text-red-400 bg-red-500/10"
        : "text-orange-400 bg-orange-500/10";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${color}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export default function MemberMembershipPage() {
  const { id } = useParams<{ id: string }>();

  const [refreshVersion, setRefreshVersion] = useState(0);

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
  const [created, setCreated] =
    useState<Membership | null>(null);

  const [uncertainRenewal, setUncertainRenewal] =
    useState(false);

  // Keep the same renewal request ID when retrying
  // after an uncertain network response.
  const [pendingRenewal, setPendingRenewal] = useState<{
    key: string;
    requestId: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MembershipFormValues>({
    resolver: zodResolver(membershipFormSchema),
    defaultValues: {
      planId: "",
      startDate: "",
    },
  });

  const selectedPlanId = useWatch({
    control,
    name: "planId",
  });

  const requestKey = `${id ?? "missing"}:${refreshVersion}`;

  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    void Promise.all([
      membersApi.getMemberById(id, controller.signal),
      plansApi.getPlans("active", controller.signal),
      membershipsApi.getSummary(id, controller.signal),
      membershipsApi.getHistory(id, controller.signal),
    ])
      .then(([member, plans, summary, history]) => {
        if (controller.signal.aborted) return;

        setLoaded({
          key: requestKey,
          data: {
            member: member.data,
            plans: plans.data,
            summary: summary.data,
            history: history.data,
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

  const error =
    loadFailure?.key === requestKey
      ? loadFailure.message
      : null;

  const loading = !data && !error && Boolean(id);

  const isRenewal =
    (data?.summary.totalPeriods ?? 0) > 0;

  const selectedPlan = data?.plans.find(
    (plan) => plan.id === selectedPlanId
  );

  const today = todayInColombo();
  const maxStartDate = addDays(today, 30);

  function refreshPage() {
    setRefreshVersion((version) => version + 1);
  }

  const onSubmit: SubmitHandler<
    MembershipFormValues
  > = async (values) => {
    if (!id || !data || !data.member.isActive) return;

    const plan = data.plans.find(
      (item) => item.id === values.planId
    );

    if (!plan) {
      setActionError("Select an available membership plan.");
      return;
    }

    setActionError("");
    setNotice("");
    setCreated(null);

    try {
      let response;

      
    if (isRenewal) {
      const key = `${id}:${values.planId}`;

      // Reuse the ID when retrying the same renewal.
      // Generate a new ID for a new renewal.
      const requestId =
        pendingRenewal?.key === key
          ? pendingRenewal.requestId
          : crypto.randomUUID();

      // Keep the ID available if the request
      // fails without a confirmed response.
      setPendingRenewal({
        key,
        requestId,
      });

      response = await membershipsApi.renew({
        memberId: id,
        planId: values.planId,
        requestId,
      });
    } else {
        // Initial enrollment can start today or
        // on a selected future date.
        response = await membershipsApi.enroll({
          memberId: id,
          planId: values.planId,
          ...(values.startDate && {
            startDate: values.startDate,
          }),
        });
      }

      setPendingRenewal(null);
      setUncertainRenewal(false);
      
      setCreated(response.data);
      setNotice(
        response.replayed
          ? "This renewal was already processed. No duplicate was created."
          : response.message
      );

      reset({
        planId: "",
        startDate: "",
      });

      refreshPage();
    } catch (error: unknown) {
      // The backend may have completed a renewal
      // even when the network response was lost.
      if (
        isRenewal &&
        (!isAxiosError(error) || !error.response)
      ) {
        setUncertainRenewal(true);
        setActionError(
          "The renewal result could not be confirmed. Retry this same renewal without changing the selected plan or leaving the page."
        );
      } else {
        setPendingRenewal(null);
        setUncertainRenewal(false);
        setActionError(getApiErrorMessage(error));
      }
    }
  };

  if (!id) {
    return (
      <p role="alert" className="text-red-400">
        Missing member ID.
      </p>
    );
  }

  if (loading) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-white/10 bg-gym-card p-10 text-center text-gym-muted"
      >
        Loading membership information...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gym-card p-10 text-center">
        <p role="alert" className="text-red-400">
          {error || "Membership information unavailable"}
        </p>

        <button
          type="button"
          onClick={refreshPage}
          className="mt-5 rounded-xl bg-gym-orange px-5 py-3 text-sm font-bold"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { member, summary, history, plans } = data;

  return (
    <div className="space-y-7">
      {/* Header */}
      <div>
        <Link
          to={`/members/${member.id}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-gym-orange"
        >
          <ArrowLeft size={17} />
          Back to Member Profile
        </Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gym-orange">
              Member Operations
            </p>

            <h1 className="mt-2 text-3xl font-black uppercase italic text-white">
              Membership Management
            </h1>

            <p className="mt-3 text-lg font-semibold text-zinc-200">
              {member.fullName}
            </p>

            <p className="mt-1 font-mono text-sm text-gym-muted">
              {member.memberId}
            </p>
          </div>

          <button
            type="button"
            onClick={refreshPage}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-gym-card px-4 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>
      </div>

      {/* Membership summary */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gym-muted">
            Membership Status
          </p>

          <div className="mt-4">
            <StatusLabel status={summary.status} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gym-muted">
            Last Purchased Valid Day
          </p>

          <p className="mt-4 text-xl font-black text-white">
            {formatDate(
              summary.latestMembership?.lastValidDate
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gym-muted">
            Purchased Periods
          </p>

          <p className="mt-4 text-3xl font-black text-white">
            {summary.totalPeriods}
          </p>
        </div>
      </section>

      {/* Current and upcoming */}
      {summary.currentMembership && (
        <section className="rounded-2xl border border-emerald-500/20 bg-gym-card p-5">
          <p className="text-xs font-bold uppercase text-emerald-400">
            Current Membership
          </p>

          <h2 className="mt-3 text-lg font-bold">
            {summary.currentMembership.planSnapshot.name}
          </h2>

          <p className="mt-2 text-sm text-zinc-400">
            {formatDate(
              summary.currentMembership.startDate
            )}{" "}
            –{" "}
            {formatDate(
              summary.currentMembership.lastValidDate
            )}
          </p>
        </section>
      )}

      {summary.nextMembership && (
        <section className="rounded-2xl border border-orange-500/20 bg-gym-card p-5">
          <p className="text-xs font-bold uppercase text-gym-orange">
            Upcoming Membership
          </p>

          <h2 className="mt-3 text-lg font-bold">
            {summary.nextMembership.planSnapshot.name}
          </h2>

          <p className="mt-2 text-sm text-zinc-400">
            Starts{" "}
            {formatDate(
              summary.nextMembership.startDate
            )}
          </p>
        </section>
      )}

      {/* Enrollment / renewal form */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
        <div className="flex items-center gap-3 border-b border-white/10 p-6">
          <CalendarCheck
            size={24}
            className="text-gym-orange"
          />

          <div>
            <h2 className="text-xl font-black text-white">
              {isRenewal
                ? "Renew Membership"
                : "Initial Enrollment"}
            </h2>

            <p className="mt-1 text-xs text-gym-muted">
              {isRenewal
                ? "Purchase the next membership period."
                : "Assign this member their first plan."}
            </p>
          </div>
        </div>

        {!member.isActive ? (
          <div className="p-6 text-sm text-red-400">
            This member profile is inactive. An admin must
            reactivate the profile before enrollment or
            renewal.
          </div>
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-6 p-6"
          >
            {/* Plan selection */}
            <div>
              <label
                htmlFor="membership-plan"
                className="mb-2 block text-sm font-bold text-zinc-300"
              >
                Membership Plan *
              </label>

              <select
                id="membership-plan"
                disabled={isSubmitting || uncertainRenewal}
                className="w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none focus:border-gym-orange disabled:opacity-50"
                {...register("planId")}
              >
                <option value="">
                  Select an active plan
                </option>

                {plans.map((plan) => (
                  <option
                    key={plan.id}
                    value={plan.id}
                  >
                    {plan.name} — {formatPrice(plan.priceLkr)}
                  </option>
                ))}
              </select>

              {errors.planId && (
                <p role="alert" className="mt-2 text-xs text-red-400">
                  {errors.planId.message}
                </p>
              )}

              {plans.length === 0 && (
                <p className="mt-2 text-sm text-orange-400">
                  No active plans are available.
                  Ask an administrator to create or
                  activate a plan.
                </p>
              )}
            </div>

            {/* Plan price preview */}
            {selectedPlan && (
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5">
                <div className="flex items-center gap-3">
                  <CreditCard
                    size={22}
                    className="text-gym-orange"
                  />

                  <div>
                    <p className="text-xs text-gym-muted">
                      Selected Plan
                    </p>

                    <p className="text-lg font-bold text-white">
                      {selectedPlan.name}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-zinc-400">
                      Duration
                    </p>

                    <p className="mt-1 font-semibold text-white">
                      {formatDuration(selectedPlan)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-zinc-400">
                      Agreed Plan Price
                    </p>

                    <p className="mt-1 text-2xl font-black text-gym-orange">
                      {formatPrice(selectedPlan.priceLkr)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Date selection for initial enrollment */}
            {!isRenewal && (
              <div>
                <label
                  htmlFor="membership-start"
                  className="mb-2 block text-sm font-bold text-zinc-300"
                >
                  Start Date
                </label>

                <input
                  id="membership-start"
                  type="date"
                  min={today}
                  max={maxStartDate}
                  className="w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none focus:border-gym-orange sm:max-w-sm"
                  {...register("startDate")}
                />

                {errors.startDate && (
                  <p role="alert" className="mt-2 text-xs text-red-400">
                    {errors.startDate.message}
                  </p>
                )}

                <p className="mt-2 text-xs text-gym-muted">
                  Leave blank to start today. You can
                  schedule the first membership up to
                  30 days ahead.
                </p>
              </div>
            )}

            {isRenewal && (
              <div className="rounded-xl border border-white/10 bg-gym-bg p-4 text-sm text-zinc-400">
                The new membership starts after the
                last purchased period. If the previous
                membership has expired, it starts today.
                The backend calculates the dates
                automatically.
              </div>
            )}

            {/* Action feedback */}
            {actionError && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
              >
                {actionError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || plans.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gym-orange px-7 py-3.5 text-sm font-extrabold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={18} />

              {isSubmitting
                ? "Processing..."
                : uncertainRenewal
                  ? "Retry Same Renewal"
                  : isRenewal
                    ? "Confirm Renewal"
                    : "Enroll Member"}
            </button>
          </form>
        )}
      </section>

      {/* Success feedback */}
      {notice && created && (
        <section
          role="status"
          className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6"
        >
          <div className="flex items-center gap-3 text-emerald-400">
            <CheckCircle2 size={24} />

            <h2 className="text-lg font-bold">
              {notice}
            </h2>
          </div>

          <p className="mt-4 text-sm text-zinc-300">
            {created.planSnapshot.name}
          </p>

          <p className="mt-2 text-sm text-zinc-400">
            Valid from {formatDate(created.startDate)}{" "}
            through {formatDate(created.lastValidDate)}.
          </p>
        </section>
      )}

      {/* Membership history */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
        <div className="border-b border-white/10 p-6">
          <h2 className="text-xl font-black text-white">
            Membership History
          </h2>

          <p className="mt-1 text-xs text-gym-muted">
            Original purchased terms are retained.
          </p>
        </div>

        {history.length === 0 ? (
          <p className="p-6 text-sm text-zinc-400">
            This member has no membership history yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left">
              <thead className="border-b border-white/10 bg-gym-bg text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Plan</th>
                  <th className="px-5 py-4">Period</th>
                  <th className="px-5 py-4">Price</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>

              <tbody>
                {history.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-white/5 text-sm"
                  >
                    <td className="px-5 py-4 font-bold text-zinc-200">
                      {item.enrollmentType}
                    </td>

                    <td className="px-5 py-4 text-white">
                      {item.planSnapshot.name}
                    </td>

                    <td className="px-5 py-4 text-zinc-400">
                      {formatDate(item.startDate)}
                      {" – "}
                      {formatDate(item.lastValidDate)}
                    </td>

                    <td className="px-5 py-4 font-semibold text-white">
                      {formatPrice(
                        item.planSnapshot.priceLkr
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <StatusLabel status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 text-sm text-orange-200">
        Enrollment and renewal create membership
        periods, not payment receipts. Actual payment
        collection and outstanding balances will be
        managed in our Payments & Billing module.
      </div>
    </div>
  );
}
