
import { useEffect, useState } from "react";

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router";

import { membersApi } from "../api/members.api";
import { getApiErrorMessage } from "../api/api";

import MembersTable from "../components/members/MembersTable";


import type {
  MemberListResponse,
  MemberStatusFilter,
} from "../types/member";

const PAGE_SIZE = 10;

// Display loading placeholders.
function MembersTableSkeleton() {
  return (
    <div
      className="space-y-3 p-6"
      role="status"
      aria-label="Loading members"
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="flex animate-pulse items-center gap-4"
        >
          <div className="h-11 w-11 shrink-0 rounded-xl bg-white/10" />

          <div className="h-4 w-1/3 rounded-lg bg-white/10" />

          <div className="ml-auto h-4 w-1/5 rounded-lg bg-white/10" />
        </div>
      ))}
    </div>
  );
}

export default function MembersPage() {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  const [status, setStatus] =
    useState<MemberStatusFilter>("all");

  const [page, setPage] = useState(1);

  const [result, setResult] =
    useState<MemberListResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(
    null
  );

  const [refreshKey, setRefreshKey] = useState(0);

  // Debounce search to avoid an API call
  // for every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Load members whenever the active filters change.
  useEffect(() => {
    const controller = new AbortController();

    async function loadMembers() {
      setLoading(true);
      setError(null);

      try {
        const response = await membersApi.getMembers(
          {
            page,
            limit: PAGE_SIZE,
            q: query,
            status,
          },
          controller.signal
        );

        if (!controller.signal.aborted) {
          setResult(response);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(getApiErrorMessage(err));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadMembers();

    return () => controller.abort();
  }, [page, query, status, refreshKey]);

  function handleStatusChange(
    nextStatus: MemberStatusFilter
  ) {
    setStatus(nextStatus);
    setPage(1);
  }

  function handleRefresh() {
    setRefreshKey((previous) => previous + 1);
  }

  const members = result?.data ?? [];

  const pagination = result?.pagination;

  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 0;

  const firstItem =
    total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;

  const lastItem = Math.min(
    page * PAGE_SIZE,
    total
  );

  return (
    <div className="space-y-7">

      {/* Page heading */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-gym-orange">
            Member Operations
          </p>

          <h1 className="text-3xl font-black uppercase italic tracking-tight text-white sm:text-4xl">
            Manage{" "}
            <span className="text-gym-orange">
              Members
            </span>
          </h1>

          <p className="mt-3 text-sm text-gym-muted">
            Browse registered members, search records
            and monitor profile status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/members/new"
            className="inline-flex items-center
             gap-2 rounded-xl bg-gym-orange px-5 py-3 text-sm font-extrabold text-white transition hover:bg-orange-600"
          >
            <Plus size={18} />
            Add New Member
          </Link>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-gym-card px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:border-orange-500/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={17}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>
      </section>

      {/* Directory summary */}
      <section className="rounded-2xl border border-white/10 bg-gym-card p-5">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-orange-500/10 p-3">
            <UsersRound
              size={25}
              className="text-gym-orange"
            />
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gym-muted">
              Matching Member Profiles
            </p>

            <p
              className="mt-1 text-3xl font-black text-white"
              aria-live="polite"
            >
              {loading || error
                ? "—"
                : total.toLocaleString("en-LK")}
            </p>
          </div>
        </div>
      </section>

      {/* Main directory card */}
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">

        {/* Filters */}
        <div className="border-b border-white/10 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

            <div>
              <h2 className="text-lg font-extrabold text-white">
                Member Directory
              </h2>

              <p className="mt-1 text-xs text-gym-muted">
                Search using a name, phone number
                or member ID.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">

              {/* Search field */}
              <div className="relative sm:w-72">
                <label
                  htmlFor="member-search"
                  className="sr-only"
                >
                  Search members
                </label>

                <Search
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
                />

                <input
                  id="member-search"
                  type="search"
                  value={searchInput}
                  onChange={(event) =>
                    setSearchInput(event.target.value)
                  }
                  placeholder="Search members..."
                  className="w-full rounded-xl border border-white/10 bg-gym-bg py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-gym-orange"
                />
              </div>

              {/* Status filter */}
              <div>
                <label
                  htmlFor="member-status"
                  className="sr-only"
                >
                  Filter by profile status
                </label>

                <select
                  id="member-status"
                  value={status}
                  onChange={(event) =>
                    handleStatusChange(
                      event.target.value as MemberStatusFilter
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-zinc-300 outline-none focus:border-gym-orange sm:w-44"
                >
                  <option value="all">
                    All Profiles
                  </option>

                  <option value="active">
                    Active Profiles
                  </option>

                  <option value="inactive">
                    Inactive Profiles
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <MembersTableSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <AlertCircle
              size={36}
              className="text-red-400"
            />

            <div>
              <h3 className="font-bold text-white">
                Unable to load members
              </h3>

              <p className="mt-2 text-sm text-zinc-400">
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-lg bg-gym-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
            >
              Try Again
            </button>
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <div className="rounded-2xl bg-white/5 p-5">
              <SearchX
                size={34}
                className="text-zinc-500"
              />
            </div>

            <div>
              <h3 className="font-bold text-white">
                No members found
              </h3>

              <p className="mt-2 max-w-sm text-sm text-zinc-400">
                {query || status !== "all"
                  ? "No profiles match the selected search or filters."
                  : "No gym members have been registered yet."}
              </p>
            </div>

            {(searchInput || status !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  handleStatusChange("all");
                }}
                className="text-sm font-semibold text-gym-orange hover:text-orange-300"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <MembersTable members={members} />
        )}

        {/* Pagination */}
        {!loading && !error && (
          <div className="flex flex-col gap-4 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">

            <p className="text-xs text-gym-muted">
              Showing{" "}
              <span className="font-bold text-white">
                {firstItem}–{lastItem}
              </span>{" "}
              of{" "}
              <span className="font-bold text-white">
                {total}
              </span>{" "}
              matching members
            </p>

            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400">
                Page {page} of {Math.max(1, totalPages)}
              </span>

              <button
                type="button"
                aria-label="Previous page"
                onClick={() =>
                  setPage((current) =>
                    Math.max(1, current - 1)
                  )
                }
                disabled={page <= 1}
                className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:border-gym-orange hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>

              <button
                type="button"
                aria-label="Next page"
                onClick={() =>
                  setPage((current) => current + 1)
                }
                disabled={
                  totalPages === 0 ||
                  page >= totalPages
                }
                className="rounded-lg border border-white/10 p-2 text-zinc-300 transition hover:border-gym-orange hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
