
import { useEffect, useState } from "react";
import type { SubmitHandler } from "react-hook-form";

import {
  Link,
  useNavigate,
  useParams,
} from "react-router";

import {
  useForm,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  Save,
  ShieldCheck,
} from "lucide-react";

import { plansApi } from "../api/plans.api";
import { getApiErrorMessage } from "../api/api";

import {
  planFormSchema,
  type PlanFormValues,
} from "../validations/plan.schema";

import type {
  MembershipPlan,
  UpdatePlanPayload,
} from "../types/plan";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-gym-orange";

const labelClass =
  "mb-2 block text-sm font-semibold text-zinc-300";

const defaultFormValues: PlanFormValues = {
  code: "",
  name: "",
  description: "",
  durationUnit: "MONTHS",
  durationCount: 1,
  priceLkr: 0,
};

function FieldError({
  message,
}: {
  message?: string;
}) {
  if (!message) return null;

  return (
    <p role="alert" className="mt-2 text-xs text-red-400">
      {message}
    </p>
  );
}

function toFormValues(
  plan: MembershipPlan
): PlanFormValues {
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description,
    durationUnit: plan.durationUnit,
    durationCount: plan.durationCount,
    priceLkr: plan.priceLkr,
  };
}

export default function PlanFormPage() {
  const { id } = useParams<{ id: string }>();

  const isEditMode = Boolean(id);
  const navigate = useNavigate();

  const [loaded, setLoaded] = useState<{
    key: string;
    plan: MembershipPlan;
  } | null>(null);

  const [loadFailure, setLoadFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const [reloadCount, setReloadCount] = useState(0);
  const [saveError, setSaveError] = useState("");

 const {
    register,
    handleSubmit,
    reset,
    control,
    formState: {
      errors,
      isSubmitting,
      isDirty,
    },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    mode: "onBlur",
    defaultValues: defaultFormValues,
  });

  const durationUnit = useWatch({
    control,
    name: "durationUnit",
  });

  const loadKey = `${id ?? "new"}:${reloadCount}`;

  // Load the existing plan in edit mode.
  useEffect(() => {
    if (!id) return;

    const controller = new AbortController();

    void plansApi
      .getPlanById(id, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;

        setLoaded({
          key: loadKey,
          plan: response.data,
        });

        reset(toFormValues(response.data));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setLoadFailure({
          key: loadKey,
          message: getApiErrorMessage(error),
        });
      });

    return () => controller.abort();
  }, [id, loadKey, reset]);

  const loadError =
    loadFailure?.key === loadKey
      ? loadFailure.message
      : null;

  const loading =
    isEditMode &&
    loaded?.key !== loadKey &&
    loadError === null;

  const onSubmit: SubmitHandler<PlanFormValues> =
    async (values: PlanFormValues) => {
      setSaveError("");

      const editableValues: UpdatePlanPayload = {
        name: values.name,
        description: values.description,
        durationUnit: values.durationUnit,
        durationCount: values.durationCount,
        priceLkr: values.priceLkr,
      };

      try {
        if (id) {
          await plansApi.updatePlan(
            id,
            editableValues
          );
        } else {
          await plansApi.createPlan({
            code: values.code,
            ...editableValues,
          });
        }

        navigate("/plans", {
          replace: true,
          state: {
            notice: id
              ? "Membership plan updated successfully."
              : "Membership plan created successfully.",
          },
        });
      } catch (error) {
        setSaveError(getApiErrorMessage(error));
      }
    };

  // Initial loading state.
  if (loading) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-white/10 bg-gym-card p-12 text-center text-gym-muted"
      >
        Loading membership plan...
      </div>
    );
  }

  // API or invalid ID error.
  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-gym-card p-10 text-center">
        <h2 className="text-xl font-bold text-white">
          Unable to load membership plan
        </h2>

        <p role="alert" className="mt-3 text-sm text-red-400">
          {loadError}
        </p>

        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() =>
              setReloadCount((count) => count + 1)
            }
            className="rounded-xl bg-gym-orange px-5 py-3 text-sm font-bold"
          >
            Try Again
          </button>

          <Link
            to="/plans"
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-zinc-300"
          >
            Back to Plans
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      {/* Breadcrumb */}
      <Link
        to="/plans"
        className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-gym-orange"
      >
        <ArrowLeft size={17} />
        Back to Membership Plans
      </Link>

      {/* Heading */}
      <section className="flex items-center gap-4">
        <div className="rounded-xl bg-orange-500/10 p-4">
          <CreditCard
            size={29}
            className="text-gym-orange"
          />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gym-orange">
            Plan Administration
          </p>

          <h1 className="mt-1 text-2xl font-black uppercase italic text-white sm:text-3xl">
            {isEditMode
              ? "Edit Membership Plan"
              : "Create Membership Plan"}
          </h1>

          <p className="mt-2 text-sm text-gym-muted">
            {isEditMode
              ? "Update plan details and pricing."
              : "Configure a new package for gym members."}
          </p>
        </div>
      </section>

      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6"
      >
        {/* Basic information */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
          <div className="border-b border-white/10 px-6 py-5">
            <h2 className="text-lg font-extrabold text-white">
              Plan Information
            </h2>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-2">
            <div>
              <label
                htmlFor="plan-code"
                className={labelClass}
              >
                Plan Code *
              </label>

              <input
                id="plan-code"
                type="text"
                placeholder="MONTHLY-01"
                readOnly={isEditMode}
                aria-invalid={!!errors.code}
                className={`${inputClass} font-mono uppercase ${
                  isEditMode
                    ? "cursor-not-allowed opacity-60"
                    : ""
                }`}
                {...register("code")}
              />

              <FieldError
                message={errors.code?.message}
              />

              <p className="mt-2 text-xs text-gym-muted">
                {isEditMode
                  ? "Plan codes cannot be changed after creation."
                  : "A unique reference such as MONTHLY-01."}
              </p>
            </div>

            <div>
              <label
                htmlFor="plan-name"
                className={labelClass}
              >
                Plan Name *
              </label>

              <input
                id="plan-name"
                type="text"
                placeholder="Monthly Membership"
                aria-invalid={!!errors.name}
                className={inputClass}
                {...register("name")}
              />

              <FieldError
                message={errors.name?.message}
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="plan-description"
                className={labelClass}
              >
                Description
              </label>

              <textarea
                id="plan-description"
                rows={4}
                placeholder="Describe what this plan includes..."
                aria-invalid={!!errors.description}
                className={`${inputClass} resize-y`}
                {...register("description")}
              />

              <FieldError
                message={errors.description?.message}
              />
            </div>
          </div>
        </section>

        {/* Duration and pricing */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
          <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
            <CalendarDays
              size={21}
              className="text-gym-orange"
            />

            <h2 className="text-lg font-extrabold text-white">
              Duration & Pricing
            </h2>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-2">
            <div>
              <label
                htmlFor="duration-unit"
                className={labelClass}
              >
                Duration Type *
              </label>

              <select
                id="duration-unit"
                aria-invalid={!!errors.durationUnit}
                className={inputClass}
                {...register("durationUnit")}
              >
                <option value="MONTHS">
                  Calendar Months
                </option>

                <option value="DAYS">
                  Fixed Days
                </option>
              </select>

              <FieldError
                message={errors.durationUnit?.message}
              />
            </div>

            <div>
              <label
                htmlFor="duration-count"
                className={labelClass}
              >
                Duration Count *
              </label>

              <input
                id="duration-count"
                type="number"
                min={1}
                max={
                  durationUnit === "MONTHS"
                    ? 36
                    : 365
                }
                step={1}
                aria-invalid={!!errors.durationCount}
                className={inputClass}
                {...register("durationCount", {
                  valueAsNumber: true,
                })}
              />

              <FieldError
                message={errors.durationCount?.message}
              />

              <p className="mt-2 text-xs text-gym-muted">
                {durationUnit === "MONTHS"
                  ? "Maximum 36 calendar months."
                  : "Maximum 365 fixed days."}
              </p>
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="plan-price"
                className={labelClass}
              >
                Membership Price (LKR) *
              </label>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gym-orange">
                  Rs.
                </span>

                <input
                  id="plan-price"
                  type="number"
                  min={1}
                  max={10000000}
                  step={1}
                  placeholder="5000"
                  aria-invalid={!!errors.priceLkr}
                  className={`${inputClass} pl-14`}
                  {...register("priceLkr", {
                    valueAsNumber: true,
                  })}
                />
              </div>

              <FieldError
                message={errors.priceLkr?.message}
              />
            </div>
          </div>
        </section>

        {/* Business rule note */}
        <div className="flex items-start gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 p-5">
          <ShieldCheck
            size={21}
            className="shrink-0 text-gym-orange"
          />

          <div>
            <p className="text-sm font-bold text-orange-200">
              Membership Pricing Policy
            </p>

            <p className="mt-2 text-xs leading-6 text-zinc-400">
              Changes to the plan catalogue will
              apply to future purchases. During
              Membership Enrollment, we will store
              the agreed price and duration on
              each purchased membership so historical
              transactions remain unchanged.
            </p>
          </div>
        </div>

        {/* API error */}
        {saveError && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-400"
          >
            {saveError}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap justify-end gap-3">
          {isEditMode && (
            <button
              type="button"
              onClick={() => reset()}
              disabled={isSubmitting || !isDirty}
              className="rounded-xl border border-white/10 px-6 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5 disabled:opacity-40"
            >
              Reset Changes
            </button>
          )}

          <Link
            to="/plans"
            className="rounded-xl border border-white/10 px-6 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={
              isSubmitting ||
              (isEditMode && !isDirty)
            }
            className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-7 py-3 text-sm font-extrabold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={18} />

            {isSubmitting
              ? "Saving..."
              : isEditMode
                ? "Save Changes"
                : "Create Plan"}
          </button>
        </div>
      </form>
    </div>
  );
}
