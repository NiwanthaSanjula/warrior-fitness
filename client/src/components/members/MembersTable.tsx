
import { UserRound } from "lucide-react";

import type { Member } from "../../types/member";
import { Link } from "react-router";

interface MembersTableProps {
  members: Member[];
}

const dateFormatter = new Intl.DateTimeFormat("en-LK", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export default function MembersTable({
  members,
}: MembersTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            <th
              scope="col"
              className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400"
            >
              Member
            </th>

            <th
              scope="col"
              className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400"
            >
              Member ID
            </th>

            <th
              scope="col"
              className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400"
            >
              Phone
            </th>

            <th
              scope="col"
              className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400"
            >
              Joined
            </th>

            <th
              scope="col"
              className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400"
            >
              Profile Status
            </th>

            <th
              scope="col"
              className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-zinc-400"
            >
              Actions
            </th>

          </tr>
        </thead>

        <tbody className="divide-y divide-white/[0.06]">
          {members.map((member) => (
            <tr
              key={member.id}
              className="transition-colors hover:bg-white/[0.04]"
            >
              {/* Member identity */}
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 font-black text-gym-orange">
                    {member.fullName ? (
                      getInitials(member.fullName)
                    ) : (
                      <UserRound size={19} />
                    )}
                  </div>

                  <div>
                    <p className="font-semibold text-white">
                      {member.fullName}
                    </p>

                    <p className="mt-1 text-xs text-zinc-500">
                      Gym Member
                    </p>
                  </div>
                </div>
              </td>

              {/* Member reference */}
              <td className="px-6 py-4">
                <span className="font-mono text-xs font-semibold text-orange-400">
                  {member.memberId}
                </span>
              </td>

              {/* Phone */}
              <td className="px-6 py-4 text-sm text-zinc-300">
                {member.phone}
              </td>

              {/* Joined */}
              <td className="px-6 py-4 text-sm text-zinc-400">
                {dateFormatter.format(
                  new Date(member.joinedAt)
                )}
              </td>

              {/* Profile status */}
              <td className="px-6 py-4">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
                    member.isActive
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : "border-zinc-600/30 bg-zinc-500/10 text-zinc-400"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      member.isActive
                        ? "bg-emerald-400"
                        : "bg-zinc-500"
                    }`}
                  />

                  {member.isActive
                    ? "Active"
                    : "Inactive"}
                </span>
              </td>
              
              <td className="px-6 py-4">
                <Link
                  to={`/members/${member.id}`}
                  className="inline-flex items-center rounded-lg border border-orange-500/30 px-4 py-2 text-xs font-bold text-gym-orange transition hover:bg-orange-500/10"
                >
                  View Profile
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
