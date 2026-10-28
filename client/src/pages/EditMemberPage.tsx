
import { useEffect, useState } from "react";
import type { SubmitHandler } from "react-hook-form";

import {
  Link,
  useNavigate,
  useParams,
} from "react-router";

import {
  ArrowLeft,
  Pencil,
  Save,
  ShieldCheck,
} from "lucide-react";

import {
  useForm,
} from "react-hook-form";

import {
  zodResolver,
} from "@hookform/resolvers/zod";

import { membersApi } from "../api/members.api";
import { getApiErrorMessage } from "../api/api";

import {
  memberRegistrationSchema,
  type MemberRegistrationForm,
} from "../validations/member.schema";

import type {
  Member,
  UpdateMemberPayload,
} from "../types/member";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-gym-bg px-4 py-3 text-sm text-white outline-none focus:border-gym-orange";

function ErrorText({
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

export default function EditMemberPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [member, setMember] = useState<Member | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: {
      errors,
      isSubmitting,
      isDirty,
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

  // Load existing member information.
  useEffect(() => {
    const controller = new AbortController();

    if (!id) {
      return () => controller.abort();
    }

    async function loadMember(memberId: string) {
      setLoading(true);
      setLoadError("");
      setMember(null);

      try {
        const response = await membersApi.getMemberById(
          memberId,
          controller.signal
        );

        if (controller.signal.aborted) return;

        const data = response.data;

        setMember(data);

        // Populate the form using API data.
        reset({
          fullName: data.fullName,
          phone: data.phone,
          gender: data.gender ?? "",
          dateOfBirth: data.dateOfBirth ?? "",
          address: data.address ?? "",
          emergencyContactName:
            data.emergencyContact?.name ?? "",
          emergencyContactPhone:
            data.emergencyContact?.phone ?? "",
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(getApiErrorMessage(error));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadMember(id);

    return () => controller.abort();
  }, [id, reset]);

  const onSubmit: SubmitHandler<
    MemberRegistrationForm
  > = async (values: MemberRegistrationForm) => {
    if (!member) return;

    setSaveError("");

    const payload: UpdateMemberPayload = {
      fullName: values.fullName.replace(/\s+/g, " "),
      phone: values.phone,

      gender: values.gender || null,

      dateOfBirth: values.dateOfBirth || null,

      address: values.address.trim() || null,

      emergencyContact:
        values.emergencyContactName &&
        values.emergencyContactPhone
          ? {
              name: values.emergencyContactName,
              phone: values.emergencyContactPhone,
            }
          : null,
    };

    try {
      const response = await membersApi.updateMember(
        member.id,
        payload
      );

      navigate(
        `/members/${response.data.id}`,
        { replace: true }
      );
    } catch (error) {
      setSaveError(getApiErrorMessage(error));
    }
  };

  if (loading) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-white/10 bg-gym-card p-10 text-center text-gym-muted"
      >
        Loading member information...
      </div>
    );
  }

  if (loadError || !member) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gym-card p-10 text-center">
        <h2 className="text-xl font-bold">
          Unable to edit member
        </h2>

        <p role="alert" className="mt-3 text-red-400">
          {loadError || "Member not found"}
        </p>

        <Link
          to="/members"
          className="mt-6 inline-block rounded-xl bg-gym-orange px-5 py-3 font-bold"
        >
          Back to Members
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <Link
        to={`/members/${member.id}`}
        className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-gym-orange"
      >
        <ArrowLeft size={17} />
        Back to Profile
      </Link>

      <div className="flex items-center gap-4">
        <div className="rounded-xl bg-orange-500/10 p-4">
          <Pencil
            size={26}
            className="text-gym-orange"
          />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gym-orange">
            Member Management
          </p>

          <h1 className="mt-1 text-2xl font-black uppercase italic sm:text-3xl">
            Edit Member
          </h1>

          <p className="mt-2 font-mono text-xs text-gym-muted">
            {member.memberId}
          </p>
        </div>
      </div>

      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6"
      >
        {/* Personal information */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-gym-card">
          <h2 className="border-b border-white/10 px-6 py-5 text-lg font-extrabold">
            Personal Information
          </h2>

          <div className="grid gap-6 p-6 md:grid-cols-2">
            <div>
              <label
                htmlFor="edit-fullName"
                className="mb-2 block text-sm font-semibold"
              >
                Full Name *
              </label>

              <input
                id="edit-fullName"
                className={inputClass}
                aria-invalid={!!errors.fullName}
                {...register("fullName")}
              />

              <ErrorText
                message={errors.fullName?.message}
              />
            </div>

            <div>
              <label
                htmlFor="edit-phone"
                className="mb-2 block text-sm font-semibold"
              >
                Phone Number *
              </label>

              <input
                id="edit-phone"
                type="tel"
                className={inputClass}
                aria-invalid={!!errors.phone}
                {...register("phone")}
              />

              <ErrorText
                message={errors.phone?.message}
              />
            </div>

            <div>
              <label
                htmlFor="edit-gender"
                className="mb-2 block text-sm font-semibold"
              >
                Gender
              </label>

              <select
                id="edit-gender"
                className={inputClass}
                {...register("gender")}
              >
                <option value="">Not specified</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
                <option value="PREFER_NOT_TO_SAY">
                  Prefer not to say
                </option>
              </select>

              <ErrorText
                message={errors.gender?.message}
              />
            </div>

            <div>
              <label
                htmlFor="edit-dateOfBirth"
                className="mb-2 block text-sm font-semibold"
              >
                Date of Birth
              </label>

              <input
                id="edit-dateOfBirth"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                className={inputClass}
                aria-invalid={!!errors.dateOfBirth}
                {...register("dateOfBirth")}
              />

              <ErrorText
                message={errors.dateOfBirth?.message}
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="edit-address"
                className="mb-2 block text-sm font-semibold"
              >
                Address
              </label>

              <textarea
                id="edit-address"
                rows={3}
                className={`${inputClass} resize-y`}
                aria-invalid={!!errors.address}
                {...register("address")}
              />

              <ErrorText
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

            <h2 className="text-lg font-extrabold">
              Emergency Contact
            </h2>
          </div>

          <div className="grid gap-6 p-6 md:grid-cols-2">
            <div>
              <label
                htmlFor="edit-emergency-name"
                className="mb-2 block text-sm font-semibold"
              >
                Contact Name
              </label>

              <input
                id="edit-emergency-name"
                className={inputClass}
                aria-invalid={
                  !!errors.emergencyContactName
                }
                {...register("emergencyContactName")}
              />

              <ErrorText
                message={
                  errors.emergencyContactName?.message
                }
              />
            </div>

            <div>
              <label
                htmlFor="edit-emergency-phone"
                className="mb-2 block text-sm font-semibold"
              >
                Contact Phone
              </label>

              <input
                id="edit-emergency-phone"
                type="tel"
                className={inputClass}
                aria-invalid={
                  !!errors.emergencyContactPhone
                }
                {...register("emergencyContactPhone")}
              />

              <ErrorText
                message={
                  errors.emergencyContactPhone?.message
                }
              />
            </div>
          </div>
        </section>

        {/* API errors */}
        {saveError && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
          >
            {saveError}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => reset()}
            disabled={isSubmitting || !isDirty}
            className="rounded-xl border border-white/10 px-6 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5 disabled:opacity-40"
          >
            Reset Changes
          </button>

          <Link
            to={`/members/${member.id}`}
            className="rounded-xl border border-white/10 px-6 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="flex items-center gap-2 rounded-xl bg-gym-orange px-6 py-3 text-sm font-extrabold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={18} />

            {isSubmitting
              ? "Saving..."
              : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
