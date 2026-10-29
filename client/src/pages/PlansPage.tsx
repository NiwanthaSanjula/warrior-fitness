
import { useEffect, useState } from "react";

import {
  Link,
  useLocation,
} from "react-router";

import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  ShieldCheck,
} from "lucide-react";

import { plansApi } from "../api/plans.api";
import { getApiErrorMessage } from "../api/api";

import { useAuth } from "../auth/auth-context";
import PlanCard from "../components/plans/PlanCard";

import type {
  MembershipPlan,
  PlanStatusFilter,
} from "../types/plan";

interface LoadedPlans {
  key: string;
  plans: MembershipPlan[];
}

interface LoadError {
  key: string;
  message: string;
}

function PlansSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading plans"
      className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-85 animate-pulse rounded-2xl border border-white/10 bg-gym-card p-6"
        >
          <div className="h-12 w-12 rounded-xl bg-white/10" />
          <div className="mt-8 h-6 w-2/3 rounded bg-white/10" />
          <div className="mt-6 h-10 w-1/2 rounded bg-white/10" />
          <div className="mt-8 h-16 rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

export default function PlansPage() {
  const { staff } = useAuth();
  const location = useLocation();

  const isAdmin = staff?.role === "ADMIN";

  const [search, setSearch] = useState("");

  const [status, setStatus] =
    useState<PlanStatusFilter>("all");

  const [refreshVersion, setRefreshVersion] =
    useState(0);

  const [loaded, setLoaded] =
    useState<LoadedPlans | null>(null);

  const [loadError, setLoadError] =
    useState<LoadError | null>(null);

  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  const [busyPlanId, setBusyPlanId] =
    useState<string | null>(null);

  // Form page sends a success message using
  // React Router navigation state.
  const navigationNotice = (
    location.state as { notice?: string } | null
  )?.notice;

  const apiStatus = isAdmin ? "all" : "active";

  const requestKey =
    `${apiStatus}:${refreshVersion}`;

  // Load plans from the backend.
  useEffect(() => {
    const controller = new AbortController();

    void plansApi
      .getPlans(apiStatus, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;

        setLoaded({
          key: requestKey,
          plans: response.data,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;

        setLoadError({
          key: requestKey,
          message: getApiErrorMessage(error),
        });
      });

    return () => controller.abort();
  }, [apiStatus, requestKey]);

  const plans =
    loaded?.key === requestKey
      ? loaded.plans
      : null;

  const error =
    loadError?.key === requestKey
      ? loadError.message
      : null;

  const loading = plans === null && error === null;

  const normalizedSearch = search.trim().toLowerCase();

  const visiblePlans = (plans ?? []).filter((plan) => {
    const matchesSearch =
      plan.name.toLowerCase().includes(normalizedSearch) ||
      plan.code.toLowerCase().includes(normalizedSearch) ||
      plan.description
        .toLowerCase()
        .includes(normalizedSearch);

    const matchesStatus =
      !isAdmin ||
      status === "all" ||
      (status === "active" && plan.isActive) ||
      (status === "inactive" && !plan.isActive);

    return matchesSearch && matchesStatus;
  });

  const activeCount =
    plans?.filter((plan) => plan.isActive).length ?? 0;

  function refreshPlans() {
    setRefreshVersion((current) => current + 1);
  }

  function clearFilters() {
    setSearch("");
    setStatus("all");
  }

  // Admin activates or deactivates a plan.
  async function handleToggleStatus(
    plan: MembershipPlan
  ) {
    if (!isAdmin || busyPlanId !== null) return;

    const nextStatus = !plan.isActive;

    const confirmed = window.confirm(
      nextStatus
        ? `Activate "${plan.name}"? It will be available for new enrollments.`
        : `Deactivate "${plan.name}"? It will no longer be available for new enrollments.`
    );

    if (!confirmed) return;

    setBusyPlanId(plan.id);
    setActionError("");
    setActionNotice("");

    try {
      const response =
        await plansApi.updatePlanStatus(
          plan.id,
          nextStatus
        );

      setActionNotice(
        response.message ||
          "Membership plan status updated successfully."
      );

      refreshPlans();
    } catch (error) {
      setActionError(getApiErrorMessage(error));
    } finally {
      setBusyPlanId(null);
    }
  }

  return (
    <div className="space-y-7">
      {/* Heading */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-gym-orange">
            Gym Operations
          </p>

          <h1 className="text-3xl font-black uppercase italic text-white sm:text-4xl">
            Membership{" "}
            <span className="text-gym-orange">
              Plans
            </span>
          </h1>

          <p className="mt-3 text-sm text-gym-muted">
            Manage membership packages, duration,
            pricing and availability.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {isAdmin && (
            <Link
              to="/plans/new"
              className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
            >
              <Plus size={18} />
              Create Plan
            </Link>
          )}

          <button
            type="button"
            onClick={refreshPlans}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-gym-card px-5 py-3 text-sm font-bold text-zinc-300 transition hover:border-orange-500/30 hover:text-white disabled:opacity-50"
          >
            <RefreshCw
              size={18}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>
      </section>

      {/* Success messages */}
      {(navigationNotice || actionNotice) && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-400"
        >
          <CheckCircle2 size={19} />

          {actionNotice || navigationNotice}
        </div>
      )}

      {/* Status update error */}
      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
        >
          {actionError}
        </div>
      )}

      {/* Summary */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-orange-500/10 p-3">
              <CreditCard
                size={25}
                className="text-gym-orange"
              />
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gym-muted">
                Plans in Catalogue
              </p>

              <p className="mt-1 text-3xl font-black text-white">
                {loading || error
                  ? "—"
                  : plans?.length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gym-card p-5">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-emerald-500/10 p-3">
              <ShieldCheck
                size={25}
                className="text-emerald-400"
              />
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gym-muted">
                Active Plans
              </p>

              <p className="mt-1 text-3xl font-black text-white">
                {loading || error
                  ? "—"
                  : activeCount}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Search and filtering */}
      <section className="rounded-2xl border border-white/10 bg-gym-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-white">
              Plan Catalogue
            </h2>

            <p className="mt-1 text-xs text-gym-muted">
              Search by plan name, code or description.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative sm:w-72">
              <label
                htmlFor="plan-search"
                className="sr-only"
              >
                Search membership plans
              </label>

              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
              />

              <input
                id="plan-search"
                type="search"
                placeholder="Search plans..."
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                className="w-full rounded-xl border border-white/10 bg-gym-bg py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-gym-orange"
              />
            </div>

            {isAdmin && (
              <div>
                <label
                  htmlFor="plan-status"
                  className="sr-only"
                >
                  Filter plans by status
                </label>

                <select
                  id="plan-status"
                  value={status}
                  onChange={(event) =>
                    setStatus(
                      event.target.value as PlanStatusFilter
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-zinc-300 outline-none focus:border-gym-orange sm:w-44"
                >
                  <option value="all">All Plans</option>
                  <option value="active">Active Plans</option>
                  <option value="inactive">Inactive Plans</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {!loading && !error && (
          <p className="mt-5 text-xs text-gym-muted">
            Showing {visiblePlans.length} of{" "}
            {plans?.length ?? 0} plans
          </p>
        )}
      </section>

      {/* Plan results */}
      {loading ? (
        <PlansSkeleton />
      ) : error ? (
        <section className="rounded-2xl border border-red-500/20 bg-gym-card px-6 py-16 text-center">
          <AlertCircle
            size={38}
            className="mx-auto text-red-400"
          />

          <h2 className="mt-5 text-lg font-bold">
            Unable to load membership plans
          </h2>

          <p role="alert" className="mt-3 text-sm text-zinc-400">
            {error}
          </p>

          <button
            type="button"
            onClick={refreshPlans}
            className="mt-6 rounded-xl bg-gym-orange px-6 py-3 text-sm font-bold"
          >
            Try Again
          </button>
        </section>
      ) : visiblePlans.length === 0 ? (
        <section className="rounded-2xl border border-white/10 bg-gym-card px-6 py-16 text-center">
          <SearchX
            size={40}
            className="mx-auto text-zinc-500"
          />

          <h2 className="mt-5 text-lg font-bold">
            No membership plans found
          </h2>

          <p className="mt-2 text-sm text-zinc-400">
            {search || status !== "all"
              ? "No plans match the selected filters."
              : "No membership plans are available yet."}
          </p>

          {(search || status !== "all") && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-5 text-sm font-bold text-gym-orange"
            >
              Clear Filters
            </button>
          )}
        </section>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visiblePlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isAdmin={isAdmin}
              isUpdating={busyPlanId === plan.id}
              actionsDisabled={busyPlanId !== null}
              onToggleStatus={handleToggleStatus}
            />
          ))}
        </section>
      )}

      {/* Footer */}
      {!loading && !error && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5 text-sm text-orange-200">
          {isAdmin
            ? "Plan changes affect the catalogue for future enrollments. Historical membership purchases will retain their agreed terms once enrollment is implemented."
            : "Only active membership plans are displayed. An administrator manages plan pricing and availability."}
        </div>
      )}
    </div>
  );
}
