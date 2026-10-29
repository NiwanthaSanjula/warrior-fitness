
import type { DurationUnit } from
  "../membership-plans/plan.model.js";

export type MembershipDateStatus =
  | "UPCOMING"
  | "ACTIVE"
  | "EXPIRED";

// Today's date according to the gym's local timezone.
export function todayInColombo(
  now: Date = new Date()
): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return [
    getPart("year"),
    getPart("month"),
    getPart("day"),
  ].join("-");
}

// Add calendar days using UTC to avoid timezone shifts.
export function addDays(
  dateString: string,
  count: number
): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);

  date.setUTCDate(date.getUTCDate() + count);

  return date.toISOString().slice(0, 10);
}

// The first date on which the membership
// is no longer valid.
export function calculateEndDateExclusive(
  startDate: string,
  durationUnit: DurationUnit,
  durationCount: number
): string {
  if (durationUnit === "DAYS") {
    return addDays(startDate, durationCount);
  }

  const [year, month, day] =
    startDate.split("-").map(Number);

  const targetMonth = new Date(
    Date.UTC(year, month - 1 + durationCount, 1)
  );

  const targetYear = targetMonth.getUTCFullYear();
  const targetMonthIndex = targetMonth.getUTCMonth();

  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonthIndex + 1, 0)
  ).getUTCDate();

  // If the original day does not exist in the
  // destination month, remain valid through
  // the last day of that shorter month.
  if (day > lastDayOfTargetMonth) {
    return new Date(
      Date.UTC(targetYear, targetMonthIndex + 1, 1)
    ).toISOString().slice(0, 10);
  }

  return new Date(
    Date.UTC(targetYear, targetMonthIndex, day)
  ).toISOString().slice(0, 10);
}

export function getMembershipDateStatus(
  startDate: string,
  endDateExclusive: string,
  today: string = todayInColombo()
): MembershipDateStatus {
  if (today < startDate) {
    return "UPCOMING";
  }

  if (today >= endDateExclusive) {
    return "EXPIRED";
  }

  return "ACTIVE";
}
