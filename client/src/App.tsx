
import { useEffect, useState } from "react";

import {
  NavLink,
  Navigate,
  Route,
  Routes,
} from "react-router";

import {
  Activity,
  BarChart3,
  CalendarClock,
  ClipboardCheck,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  Settings,
  Users,
  Wallet,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

// Navigation
const menuItems = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Manage Members", path: "/members", icon: Users },
  { label: "Membership Plans", path: "/plans", icon: CreditCard },
  { label: "Payments", path: "/payments", icon: Wallet },
  { label: "Attendance", path: "/attendance", icon: ClipboardCheck },
  { label: "Reports", path: "/reports", icon: BarChart3 },
  { label: "Settings", path: "/settings", icon: Settings },
];

// Sidebar
function Sidebar() {
  return (
    <aside className="w-full shrink-0 border-r border-white/10 bg-gym-sidebar lg:sticky lg:top-0 lg:h-screen lg:w-72">

      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-7">
        <div className="rounded-xl bg-gym-orange p-3">
          <Dumbbell size={28} className="text-white" />
        </div>

        <div className="leading-tight">
          <h1 className="text-xl font-black italic text-red-500">
            WARRIOR
          </h1>
          <h2 className="text-xl font-black italic text-white">
            FITNESS
          </h2>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 p-4 lg:flex-col">
        <p className="hidden px-4 pb-2 pt-3 text-xs font-bold tracking-widest text-gym-muted lg:block">
          OPERATIONS
        </p>

        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-gym-orange text-white shadow-lg shadow-orange-600/10"
                    : "text-zinc-300 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="px-8 py-4 text-xs text-gym-muted">
        WARRIOR FITNESS · MVP
      </div>
    </aside>
  );
}

// Dashboard metric card
function StatCard({
  title,
  icon: Icon,
  color,
}: {
  title: string;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-gym-card p-5"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-gym-muted">
          {title}
        </p>

        <Icon size={23} style={{ color }} />
      </div>

      <p className="mt-5 text-3xl font-black text-white">
        —
      </p>

      <p className="mt-2 text-xs text-gym-muted">
        Live data coming soon
      </p>
    </div>
  );
}

// Reusable dashboard panel
function DashboardPanel({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="min-h-56 rounded-2xl border border-white/10 bg-gym-card p-6">
      <h3 className="border-b border-white/10 pb-4 text-sm font-extrabold uppercase text-white">
        {title}
      </h3>

      <div className="flex min-h-36 flex-col items-center justify-center gap-3 text-center">
        <Activity size={28} className="text-emerald-500" />

        <p className="text-sm text-gym-muted">
          {message}
        </p>
      </div>
    </div>
  );
}

// Dashboard
function Dashboard() {
  const [apiStatus, setApiStatus] = useState<
    "checking" | "online" | "offline"
  >("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function checkAPI() {
      try {
        const response = await fetch("/api/health", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("API is unavailable");
        }

        const data: { status?: string } =
          await response.json();

        setApiStatus(
          data.status === "ok" ? "online" : "offline"
        );
      } catch {
        if (!controller.signal.aborted) {
          setApiStatus("offline");
        }
      }
    }

    checkAPI();

    return () => controller.abort();
  }, []);

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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black italic text-white">
              GYM OPERATIONAL{" "}
              <span className="text-gym-orange">
                PULSE
              </span>
            </h2>

            <p className="mt-2 text-sm text-gym-muted">
              Memberships, attendance and daily collections
            </p>
          </div>

          <div className="rounded-xl border border-white/10 px-4 py-3 text-sm">
            <span
              className={
                apiStatus === "online"
                  ? "text-emerald-400"
                  : apiStatus === "offline"
                    ? "text-red-400"
                    : "text-yellow-400"
              }
            >
              ● API {apiStatus}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DashboardPanel
          title="Expiring Members — Next 7 Days"
          message="Membership expiry information will appear here."
        />

        <DashboardPanel
          title="Recent Payments"
          message="Recent gym transactions will appear here."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
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

// Temporary page used for future modules
function ModulePlaceholder({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gym-card p-8">
      <h2 className="text-2xl font-black text-white">
        {title}
      </h2>

      <p className="mt-3 text-gym-muted">
        This module will be implemented in an upcoming step.
      </p>
    </div>
  );
}

// Main application
export default function App() {
  return (
    <div className="min-h-screen bg-gym-bg text-white lg:flex">
      <Sidebar />

      <main className="min-w-0 flex-1">
        <header className="border-b border-white/10 bg-[#141416] px-6 py-6 lg:px-9">
          <h2 className="text-xl font-black text-white">
            WELCOME TO{" "}
            <span className="text-gym-orange">
              WARRIOR FITNESS
            </span>
          </h2>

          <p className="mt-1 text-sm text-gym-muted">
            Admin dashboard preview · Authentication coming next
          </p>
        </header>

        <div className="p-5 lg:p-9">
          <Routes>
            <Route
              path="/"
              element={<Navigate to="/dashboard" replace />}
            />

            <Route
              path="/dashboard"
              element={<Dashboard />}
            />

            {menuItems
              .filter((item) => item.path !== "/dashboard")
              .map((item) => (
                <Route
                  key={item.path}
                  path={item.path}
                  element={
                    <ModulePlaceholder title={item.label} />
                  }
                />
              ))}

            <Route
              path="*"
              element={<Navigate to="/dashboard" replace />}
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}
