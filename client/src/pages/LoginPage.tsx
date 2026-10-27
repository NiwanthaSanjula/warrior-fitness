
import { useState } from "react";
import type { FormEvent } from "react";

import { useNavigate } from "react-router";

import {
  ArrowRight,
  Dumbbell,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "../auth/auth-context";
import { getApiErrorMessage } from "../api/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] = useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSubmitting(true);

    try {
      await login(email.trim(), password);

      navigate("/dashboard", {
        replace: true,
      });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-gym-bg lg:grid-cols-2">

      {/* Branding section */}
      <section className="relative hidden overflow-hidden border-r border-white/10 bg-[#151517] p-12 lg:flex lg:flex-col lg:justify-between">

        <div className="pointer-events-none absolute -left-48 bottom-0 h-125 w-125 rounded-full bg-gym-orange/15 blur-[120px]" />

        <div className="relative z-10 flex items-center gap-4">
          <div className="rounded-2xl bg-gym-orange p-4 shadow-lg shadow-orange-600/20">
            <Dumbbell size={34} className="text-white" />
          </div>

          <div className="leading-none">
            <h1 className="text-3xl font-black italic text-red-500">
              WARRIOR
            </h1>

            <h2 className="text-3xl font-black italic text-white">
              FITNESS
            </h2>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <span className="mb-6 inline-block rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-xs font-bold tracking-widest text-orange-400">
            GYM MANAGEMENT PLATFORM
          </span>

          <h2 className="text-5xl font-black leading-[1.12] italic uppercase text-white xl:text-6xl">
            Stronger
            <br />
            Operations.
            <br />
            <span className="text-gym-orange">
              Stronger Gym.
            </span>
          </h2>

          <p className="mt-7 max-w-md text-base leading-7 text-zinc-400">
            Manage members, memberships, payments
            and daily gym operations from one
            central platform.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3 text-sm text-zinc-500">
          <ShieldCheck
            size={19}
            className="text-gym-orange"
          />
          Authorized staff access only
        </div>
      </section>

      {/* Login section */}
      <main className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">

        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="mb-12 flex items-center gap-3 lg:hidden">
            <Dumbbell
              size={34}
              className="text-gym-orange"
            />

            <h1 className="text-2xl font-black italic">
              WARRIOR FITNESS
            </h1>
          </div>

          <div className="mb-9">
            <div className="mb-5 flex h-13 w-13 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10">
              <LockKeyhole
                size={23}
                className="text-gym-orange"
              />
            </div>

            <h2 className="text-4xl font-black tracking-tight text-white">
              WELCOME BACK
            </h2>

            <p className="mt-3 text-sm text-zinc-400">
              Sign in with your staff account to
              access the management dashboard.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold text-zinc-300"
              >
                Email Address
              </label>

              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                placeholder="admin@warriorfitness.lk"
                className="w-full rounded-xl border border-white/10 bg-gym-card px-4 py-3.5 text-white outline-none transition placeholder:text-zinc-600 focus:border-gym-orange"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-semibold text-zinc-300"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-white/10 bg-gym-card px-4 py-3.5 pr-12 text-white outline-none transition placeholder:text-zinc-600 focus:border-gym-orange"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-gym-orange px-5 py-4 font-extrabold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? "SIGNING IN..."
                : "SIGN IN"}

              {!submitting && (
                <ArrowRight size={20} />
              )}
            </button>
          </form>

          <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-zinc-500">
            Warrior Fitness Management System
            <br />
            Secure Staff Portal
          </div>
        </div>
      </main>
    </div>
  );
}
