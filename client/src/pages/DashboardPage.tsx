
import {
  CalendarClock,
  ClipboardCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  icon: LucideIcon;
  color: string;
}

function StatCard({
  title,
  icon: Icon,
  color,
}: StatCardProps) {
  return (
    <article
      className="rounded-2xl border border-white/10 border-l-4 bg-gym-card p-5"
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase text-gym-muted">
          {title}
        </p>

        <Icon size={23} style={{ color }} />
      </div>

      <p className="mt-5 text-3xl font-black">
        —
      </p>

      <p className="mt-2 text-xs text-zinc-500">
        Awaiting live data
      </p>
    </article>
  );
}

function DashboardPanel({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section className="min-h-60 rounded-2xl border border-white/10 bg-gym-card p-6">
      <h3 className="border-b border-white/10 pb-4 text-sm font-extrabold uppercase">
        {title}
      </h3>

      <div className="flex min-h-39 flex-col items-center justify-center gap-3">
        <TrendingUp
          size={28}
          className="text-gym-orange"
        />

        <p className="text-center text-sm text-gym-muted">
          {message}
        </p>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const stats = [
    {
      title: "Active Members",
      icon: Users,
      color: "#ff5100",
    },
    {
      title: "Today's Collections",
      icon: Wallet,
      color: "#10b981",
    },
    {
      title: "Expiring This Week",
      icon: CalendarClock,
      color: "#f59e0b",
    },
    {
      title: "Today's Attendance",
      icon: ClipboardCheck,
      color: "#3b82f6",
    },
  ];

  return (
    <div className="space-y-7">

      <section className="rounded-2xl border border-white/10 bg-gym-card p-6">
        <h2 className="text-2xl font-black italic uppercase">
          GYM OPERATIONAL{" "}
          <span className="text-gym-orange">
            PULSE
          </span>
        </h2>

        <p className="mt-2 text-sm text-gym-muted">
          Memberships, daily collections and
          attendance overview
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DashboardPanel
          title="Expiring Members — Next 7 Days"
          message="Membership expiry data will appear here."
        />

        <DashboardPanel
          title="Recent Payments"
          message="Recent payment records will appear here."
        />

        <DashboardPanel
          title="Revenue Trend"
          message="Revenue analytics will appear here."
        />

        <DashboardPanel
          title="Attendance Overview"
          message="Attendance analytics will appear here."
        />
      </section>
    </div>
  );
}
