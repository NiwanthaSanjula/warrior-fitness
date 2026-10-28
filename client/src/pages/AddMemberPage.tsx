
import { useState } from "react";
import { Link } from "react-router";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  ArrowLeft,
  CheckCircle2,
  ContactRound,
  Save,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";

import { membersApi } from "../api/members.api";
import { getApiErrorMessage } from "../api/api";

import {
  memberRegistrationSchema,
  type MemberRegistrationForm,
} from "../validations/member.schema";

import type {
  CreateMemberPayload,
  Member,
} from "../types/member";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-gym-orange";

const labelClass =
  "mb-2 block text-sm font-semibold text-zinc-300";

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

export default function AddMemberPage() {
  const [apiError, setApiError] = useState("");
  const [createdMember, setCreatedMember] =
    useState<Member | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: {
      errors,
      isSubmitting,
    },
  } = useForm<MemberRegistrationForm>({
    resolver: zodResolver(memberRegistrationSchema),
    mode: "onBlur",
    defaultValues: {
      fullName: "",
      phone: "",
      gender: "",
      dateOfBirth: "",
      address: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
    },
  });

  const onSubmit: SubmitHandler<
    MemberRegistrationForm
  > = async (values: MemberRegistrationForm) => {
    setApiError("");

    const payload: CreateMemberPayload = {
      fullName: values.fullName.replace(/\s+/g, " "),
      phone: values.phone,

      ...(values.gender && {
        gender: values.gender,
      }),

      ...(values.dateOfBirth && {
        dateOfBirth: values.dateOfBirth,
      }),

      ...(values.address && {
        address: values.address,
      }),

      ...(values.emergencyContactName &&
        values.emergencyContactPhone && {
          emergencyContact: {
            name: values.emergencyContactName,
            phone: values.emergencyContactPhone,
          },
        }),
    };

    try {
      const response = await membersApi.createMember(
        payload
      );

      setCreatedMember(response.data);
    } catch (error) {
      setApiError(getApiErrorMessage(error));
    }
  };

  function registerAnother() {
    reset();
    setApiError("");
    setCreatedMember(null);
  }

  // Success confirmation after registration.
  if (createdMember) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border border-emerald-500/20 bg-gym-card p-8 text-center sm:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2
              size={44}
              className="text-emerald-400"
            />
          </div>

          <h1 className="mt-6 text-2xl font-black uppercase text-white sm:text-3xl">
            Registration Successful
          </h1>

          <p className="mt-3 text-sm text-zinc-400">
            The member profile has been created.
          </p>

          <div className="mt-8 rounded-xl border border-white/10 bg-gym-bg p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-gym-muted">
              Generated Member ID
            </p>

            <p className="mt-3 break-all font-mono text-2xl font-black text-gym-orange">
              {createdMember.memberId}
            </p>

            <div className="mt-5 space-y-2 text-sm text-zinc-300">
              <p>{createdMember.fullName}</p>
              <p>{createdMember.phone}</p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 text-left text-sm text-orange-200">
            Member profile created. A paid gym membership
            has not been assigned yet.
          </div>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={registerAnother}
              className="rounded-xl bg-gym-orange px-6 py-3 font-bold text-white hover:bg-orange-600"
            >
              Register Another
            </button>

            <Link
              to={`/members/${createdMember.id}`}
              className="rounded-xl border border-orange-500/30 px-6 py-3 font-bold text-gym-orange hover:bg-orange-500/10"
            >
              View Member Profile
            </Link>

            <Link
              to="/members"
              className="rounded-xl border border-white/10 px-6 py-3 font-bold text-zinc-300 hover:bg-white/5"
            >
              Member Directory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      {/* Page heading */}
      <section>
        <Link
          to="/members"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-gym-orange"
        >
          <ArrowLeft size={17} />
          Back to Members
        </Link>

        <div className="mt-6 flex items-center gap-4">
          <div className="rounded-xl bg-orange-500/10 p-4">
            <UserRoundPlus
              size={27}
              className="text-gym-orange"
            />
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gym-orange">
              Member Operations
            </p>

            <h1 className="mt-1 text-2xl font-black uppercase italic text-white sm:text-3xl">
              Register New Member
            </h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-gym-muted">
          Enter the member's details to create a gym
          profile. Fields marked * are required.
        </p>
      </section>

      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6"
      >
        {/* Personal information */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
          <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
            <ContactRound
              size={21}
              className="text-gym-orange"
            />

            <h2 className="text-lg font-extrabold text-white">
              Personal Information
            </h2>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-2">
            <div>
              <label
                htmlFor="fullName"
                className={labelClass}
              >
                Full Name *
              </label>

              <input
                id="fullName"
                type="text"
                placeholder="Enter full name"
                autoComplete="name"
                aria-invalid={!!errors.fullName}
                className={inputClass}
                {...register("fullName")}
              />

              <FieldError
                message={errors.fullName?.message}
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className={labelClass}
              >
                Phone Number *
              </label>

              <input
                id="phone"
                type="tel"
                placeholder="0771234567"
                autoComplete="tel"
                aria-invalid={!!errors.phone}
                className={inputClass}
                {...register("phone")}
              />

              <FieldError
                message={errors.phone?.message}
              />
            </div>

            <div>
              <label
                htmlFor="gender"
                className={labelClass}
              >
                Gender
              </label>

              <select
                id="gender"
                className={inputClass}
                {...register("gender")}
              >
                <option value="">
                  Select gender (optional)
                </option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
                <option value="PREFER_NOT_TO_SAY">
                  Prefer not to say
                </option>
              </select>

              <FieldError
                message={errors.gender?.message}
              />
            </div>

            <div>
              <label
                htmlFor="dateOfBirth"
                className={labelClass}
              >
                Date of Birth
              </label>

              <input
                id="dateOfBirth"
                type="date"
                max={new Date()
                  .toISOString()
                  .slice(0, 10)}
                aria-invalid={!!errors.dateOfBirth}
                className={inputClass}
                {...register("dateOfBirth")}
              />

              <FieldError
                message={errors.dateOfBirth?.message}
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="address"
                className={labelClass}
              >
                Address
              </label>

              <textarea
                id="address"
                rows={3}
                placeholder="Enter residential address (optional)"
                aria-invalid={!!errors.address}
                className={`${inputClass} resize-y`}
                {...register("address")}
              />

              <FieldError
                message={errors.address?.message}
              />
            </div>
          </div>
        </section>

        {/* Emergency contact */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
          <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
            <ShieldCheck
              size={21}
              className="text-gym-orange"
            />

            <div>
              <h2 className="text-lg font-extrabold text-white">
                Emergency Contact
              </h2>

              <p className="mt-1 text-xs text-gym-muted">
                Optional — provide both name and phone
                if adding a contact.
              </p>
            </div>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-2">
            <div>
              <label
                htmlFor="emergencyContactName"
                className={labelClass}
              >
                Contact Name
              </label>

              <input
                id="emergencyContactName"
                type="text"
                placeholder="Emergency contact name"
                aria-invalid={
                  !!errors.emergencyContactName
                }
                className={inputClass}
                {...register("emergencyContactName")}
              />

              <FieldError
                message={
                  errors.emergencyContactName?.message
                }
              />
            </div>

            <div>
              <label
                htmlFor="emergencyContactPhone"
                className={labelClass}
              >
                Contact Phone
              </label>

              <input
                id="emergencyContactPhone"
                type="tel"
                placeholder="0712345678"
                aria-invalid={
                  !!errors.emergencyContactPhone
                }
                className={inputClass}
                {...register("emergencyContactPhone")}
              />

              <FieldError
                message={
                  errors.emergencyContactPhone?.message
                }
              />
            </div>
          </div>
        </section>

        {/* API error */}
        {apiError && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-400"
          >
            {apiError}
          </div>
        )}

        {/* Form actions */}
        <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
          <Link
            to="/members"
            className="rounded-xl border border-white/10 px-7 py-3.5 text-center text-sm font-bold text-zinc-300 transition hover:bg-white/5"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center justify-center gap-2 rounded-xl bg-gym-orange px-7 py-3.5 text-sm font-extrabold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={19} />

            {isSubmitting
              ? "Registering Member..."
              : "Register Member"}
          </button>
        </div>
      </form>
    </div>
  );
}
