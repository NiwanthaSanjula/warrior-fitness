
import { useState } from "react";

import {
  NavLink,
  Outlet,
  useNavigate,
} from "react-router";

import {
  BarChart3,
  CalendarDays,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  Wallet,
  X,
  BellRing
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

import { useAuth } from "../auth/auth-context";
import { hasPermissions, type Permission } from "../auth/permissions";

interface MenuItem {
  label: string;
  path: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  permissions?: Permission[];
}

const menuItems: MenuItem[] = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Manage Members",
    permissions: ["members.read"],
    path: "/members",
    icon: Users,
  },
  {
    label: "Membership Plans",
    permissions: ["plans.read"],
    path: "/plans",
    icon: CreditCard,
  },
  {
    label: "Payments",
    permissions: ["invoices.read"],
    path: "/payments",
    icon: Wallet,
  },
  {
    label: "Attendance",
    permissions: ["attendance.read"],
    path: "/attendance",
    icon: CalendarDays,
  },
  {
  label: "Attention Center",
    permissions: ["attention.read"],
    path: "/attention",
    icon: BellRing,
  },
  {
    label: "Reports",
    permissions: ["reports.read"],
    path: "/reports",
    icon: BarChart3,
    adminOnly: true,
  },
  {
    label: "Settings",
    permissions: ["settings.manage"],
    path: "/settings",
    icon: Settings,
    adminOnly: true,
  },
];

export default function AppLayout() {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    setSigningOut(true);
    setLogoutError("");

    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      setLogoutError(
        "Unable to sign out. Please try again."
      );
    } finally {
      setSigningOut(false);
    }
  }

  const visibleMenu = menuItems.filter(
    (item) =>
      (!item.adminOnly || staff?.role === "ADMIN") &&
      hasPermissions(staff, ...(item.permissions ?? []))
  );

  return (
    <div className="min-h-screen bg-gym-bg text-white lg:flex">

      {/* Mobile background overlay */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/10 bg-gym-sidebar transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          menuOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-7">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gym-orange p-3">
              <Dumbbell size={26} />
            </div>

            <div className="leading-tight">
              <h1 className="text-xl font-black italic text-red-500">
                WARRIOR
              </h1>

              <h2 className="text-xl font-black italic">
                FITNESS
              </h2>
            </div>
          </div>

          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="text-zinc-400 lg:hidden"
          >
            <X size={22} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          <p className="px-4 py-3 text-xs font-bold tracking-widest text-gym-muted">
            GYM OPERATIONS
          </p>

          {visibleMenu.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-semibold transition ${
                    isActive
                      ? "bg-gym-orange text-white shadow-lg shadow-orange-600/10"
                      : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon size={19} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-white/10 p-5">
          <p className="text-xs font-medium text-zinc-400">
            WARRIOR FITNESS
          </p>

          <p className="mt-1 text-xs text-zinc-600">
            Management System · MVP
          </p>
        </div>
      </aside>

      {/* Application content */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Header */}
        <header className="sticky top-0 z-30 flex min-h-22 items-center justify-between gap-4 border-b border-white/10 bg-[#141416] px-5 py-4 lg:px-9">

          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
              className="rounded-lg p-2 text-white hover:bg-white/10 lg:hidden"
            >
              <Menu size={24} />
            </button>

            <div>
              <h2 className="text-sm font-black uppercase sm:text-lg">
                WELCOME BACK,{" "}
                <span className="text-gym-orange">
                  {staff?.fullName}
                </span>
              </h2>

              <p className="mt-1 text-xs text-gym-muted">
                {staff?.role === "ADMIN"
                  ? "Administrator"
                  : "Receptionist"}{" "}
                Portal
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-50 sm:px-4"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">
              {signingOut
                ? "Signing Out..."
                : "Sign Out"}
            </span>
          </button>
        </header>

        {logoutError && (
          <div
            role="alert"
            className="mx-5 mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 lg:mx-9"
          >
            {logoutError}
          </div>
        )}

        {/* Route content */}
        <main className="flex-1 p-5 lg:p-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
