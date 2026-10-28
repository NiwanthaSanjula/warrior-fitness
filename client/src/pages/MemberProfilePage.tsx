
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import {
  ArrowLeft,
  CalendarDays,
  ContactRound,
  Pencil,
  Phone,
  RefreshCw,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import { membersApi } from "../api/members.api";
import { getApiErrorMessage } from "../api/api";
import { useAuth } from "../auth/auth-context";

import type { Member } from "../types/member";

function formatDate(
  value: string | null,
  dateOnly = false
): string {
  if (!value) return "Not provided";

  const date = new Date(
    dateOnly ? `${value}T00:00:00.000Z` : value
  );

  return new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : "Asia/Colombo",
  }).format(date);
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-gym-muted">
        {label}
      </p>

      <p className="break-words text-sm font-semibold text-white">
        {value || "Not provided"}
      </p>
    </div>
  );
}

function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
      <h2 className="border-b border-white/10 px-6 py-5 text-lg font-extrabold text-white">
        {title}
      </h2>

      <div className="grid gap-7 p-6 sm:grid-cols-2">
        {children}
      </div>
    </section>
  );
}

export default function MemberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { staff } = useAuth();

  const [member, setMember] = useState<Member | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [changingStatus, setChangingStatus] =
    useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    if (!id) {
      return () => controller.abort();
    }

    async function loadMember(memberId: string) {
      setLoading(true);
      setError("");
      setMember(null);

      try {
        const response = await membersApi.getMemberById(
          memberId,
          controller.signal
        );

        if (!controller.signal.aborted) {
          setMember(response.data);
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

    void loadMember(id);

    return () => controller.abort();
  }, [id, refreshKey]);

  async function handleStatusChange() {
    if (
      !member ||
      staff?.role !== "ADMIN" ||
      changingStatus
    ) {
      return;
    }

    const nextStatus = !member.isActive;

    const confirmed = window.confirm(
      nextStatus
        ? `Reactivate ${member.fullName}'s profile?`
        : `Deactivate ${member.fullName}'s profile? This will not delete their records.`
    );

    if (!confirmed) return;

    setChangingStatus(true);
    setStatusError("");

    try {
      const response =
        await membersApi.updateMemberStatus(
          member.id,
          nextStatus
        );

      setMember(response.data);
    } catch (err) {
      setStatusError(getApiErrorMessage(err));
    } finally {
      setChangingStatus(false);
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-white/10 bg-gym-card p-10 text-center text-gym-muted"
      >
        Loading member profile...
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gym-card p-10 text-center">
        <ShieldAlert
          size={36}
          className="mx-auto text-red-400"
        />

        <h2 className="mt-4 text-xl font-bold">
          Unable to load member
        </h2>

        <p role="alert" className="mt-2 text-zinc-400">
          {error || "Member not found"}
        </p>

        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() =>
              setRefreshKey((value) => value + 1)
            }
            className="rounded-xl bg-gym-orange px-5 py-3 text-sm font-bold"
          >
            Try Again
          </button>

          <Link
            to="/members"
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-bold"
          >
            Back
          </Link>
        </div>
      </div>
    );
  }

  const genderLabels: Record<string, string> = {
    MALE: "Male",
    FEMALE: "Female",
    OTHER: "Other",
    PREFER_NOT_TO_SAY: "Prefer not to say",
  };

  return (
    <div className="space-y-6">
      <Link
        to="/members"
        className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-gym-orange"
      >
        <ArrowLeft size={17} />
        Back to Members
      </Link>

      {/* Profile heading */}
      <section className="rounded-2xl border border-white/10 bg-gym-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-orange-500/10 p-5">
              <UserRound
                size={33}
                className="text-gym-orange"
              />
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gym-orange">
                Member Profile
              </p>

              <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                {member.fullName}
              </h1>

              <p className="mt-2 font-mono text-sm text-zinc-400">
                {member.memberId}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to={`/members/${member.id}/edit`}
              className="inline-flex items-center gap-2 rounded-xl bg-gym-orange px-5 py-3 text-sm font-bold text-white hover:bg-orange-600"
            >
              <Pencil size={17} />
              Edit Member
            </Link>

            <button
              type="button"
              onClick={() =>
                setRefreshKey((value) => value + 1)
              }
              aria-label="Refresh member profile"
              className="rounded-xl border border-white/10 px-4 py-3 text-zinc-300 hover:bg-white/5"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-white/10 pt-5">
          <span
            className={`rounded-full px-4 py-2 text-xs font-bold ${
              member.isActive
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-zinc-500/10 text-zinc-400"
            }`}
          >
            {member.isActive
              ? "Active Profile"
              : "Inactive Profile"}
          </span>

          {staff?.role === "ADMIN" && (
            <button
              type="button"
              disabled={changingStatus}
              onClick={handleStatusChange}
              className={`rounded-xl border px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${
                member.isActive
                  ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                  : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              }`}
            >
              {changingStatus
                ? "Updating..."
                : member.isActive
                  ? "Deactivate Profile"
                  : "Reactivate Profile"}
            </button>
          )}
        </div>

        {statusError && (
          <p
            role="alert"
            className="mt-4 text-sm text-red-400"
          >
            {statusError}
          </p>
        )}

        <p className="mt-4 text-xs text-gym-muted">
          Profile status is separate from paid
          membership validity.
        </p>
      </section>

      {/* Personal information */}
      <ProfileSection title="Personal Information">
        <DetailItem
          label="Full Name"
          value={member.fullName}
        />

        <DetailItem
          label="Phone Number"
          value={member.phone}
        />

        <DetailItem
          label="Gender"
          value={
            member.gender
              ? genderLabels[member.gender]
              : null
          }
        />

        <DetailItem
          label="Date of Birth"
          value={formatDate(
            member.dateOfBirth,
            true
          )}
        />

        <div className="sm:col-span-2">
          <DetailItem
            label="Address"
            value={member.address}
          />
        </div>
      </ProfileSection>

      {/* Emergency information */}
      <ProfileSection title="Emergency Contact">
        <DetailItem
          label="Contact Name"
          value={member.emergencyContact?.name}
        />

        <div className="flex items-start gap-2">
          <Phone
            size={17}
            className="mt-1 text-gym-orange"
          />

          <DetailItem
            label="Contact Phone"
            value={member.emergencyContact?.phone}
          />
        </div>
      </ProfileSection>

      {/* Registration details */}
      <ProfileSection title="Registration Details">
        <div className="flex items-start gap-2">
          <CalendarDays
            size={18}
            className="mt-1 text-gym-orange"
          />

          <DetailItem
            label="Joined Date"
            value={formatDate(member.joinedAt)}
          />
        </div>

        <div className="flex items-start gap-2">
          <ContactRound
            size={18}
            className="mt-1 text-gym-orange"
          />

          <DetailItem
            label="Member Reference"
            value={member.memberId}
          />
        </div>
      </ProfileSection>

      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5 text-sm text-orange-200">
        Membership plans, renewal history, payments
        and attendance will appear here after their
        respective modules are implemented.
      </div>
    </div>
  );
}
