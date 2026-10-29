
import { Link } from "react-router";

import {
  CalendarDays,
  Clock3,
  Dumbbell,
  Pencil,
  Power,
} from "lucide-react";

import type {
  MembershipPlan,
} from "../../types/plan";

interface PlanCardProps {
  plan: MembershipPlan;
  isAdmin?: boolean;
  isUpdating?: boolean;
  actionsDisabled?: boolean;
  onToggleStatus?: (plan: MembershipPlan) => void;
}

const priceFormatter = new Intl.NumberFormat(
  "en-LK",
  {
    maximumFractionDigits: 0,
  }
);

function formatDuration(
  count: number,
  unit: "DAYS" | "MONTHS"
): string {
  if (unit === "MONTHS") {
    return `${count} calendar ${
      count === 1 ? "month" : "months"
    }`;
  }

  return `${count} ${
    count === 1 ? "day" : "days"
  }`;
}

export default function PlanCard({
  plan,
  isAdmin = false,
  isUpdating = false,
  actionsDisabled = false,
  onToggleStatus,
}: PlanCardProps) {
  return (
    <article
      className={`flex h-full flex-col overflow-hidden rounded-2xl border bg-gym-card transition-colors ${
        plan.isActive
          ? "border-white/10 hover:border-orange-500/40"
          : "border-white/5 opacity-80"
      }`}
    >
      <div
        className={`h-1 w-full ${
          plan.isActive
            ? "bg-gym-orange"
            : "bg-zinc-600"
        }`}
      />

      <div className="flex flex-1 flex-col p-6">
        {/* Plan status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10">
            <Dumbbell
              size={23}
              className="text-gym-orange"
            />
          </div>

          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              plan.isActive
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border-zinc-600/30 bg-zinc-500/10 text-zinc-400"
            }`}
          >
            {plan.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        {/* Plan details */}
        <h3 className="mt-5 text-xl font-black text-white">
          {plan.name}
        </h3>

        <p className="mt-2 font-mono text-xs font-semibold text-gym-orange">
          {plan.code}
        </p>

        <div className="mt-7">
          <p className="text-xs font-bold uppercase tracking-wider text-gym-muted">
            Plan Price
          </p>

          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-bold text-orange-400">
              LKR
            </span>

            <span className="text-4xl font-black tracking-tight text-white">
              {priceFormatter.format(plan.priceLkr)}
            </span>
          </div>
        </div>

        {/* Duration */}
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-white/5 bg-gym-bg p-4">
          {plan.durationUnit === "MONTHS" ? (
            <CalendarDays
              size={21}
              className="text-gym-orange"
            />
          ) : (
            <Clock3
              size={21}
              className="text-gym-orange"
            />
          )}

          <div>
            <p className="text-xs text-gym-muted">
              Membership Duration
            </p>

            <p className="mt-1 text-sm font-bold text-white">
              {formatDuration(
                plan.durationCount,
                plan.durationUnit
              )}
            </p>
          </div>
        </div>

        <p className="mt-5 flex-1 whitespace-pre-line text-sm leading-6 text-zinc-400">
          {plan.description ||
            "No description added to this plan."}
        </p>

        {/* Availability */}
        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="text-xs text-gym-muted">
            {plan.isActive
              ? "Available for new enrollments"
              : "Unavailable for new enrollments"}
          </p>
        </div>

        {/* Admin-only actions */}
        {isAdmin && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Link
              to={`/plans/${plan.id}/edit`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-200 transition hover:border-gym-orange hover:text-white"
            >
              <Pencil size={16} />
              Edit Plan
            </Link>

            <button
              type="button"
              onClick={() => onToggleStatus?.(plan)}
              disabled={actionsDisabled}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                plan.isActive
                  ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                  : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              }`}
            >
              <Power size={16} />

              {isUpdating
                ? "Updating..."
                : plan.isActive
                  ? "Deactivate"
                  : "Activate"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
