
import {
  addDays,
  todayInColombo,
} from "../memberships/membership.dates.js";

import {
  collectionsQuerySchema,
} from "./reports.validation.js";

const ONE_DAY_MS = 86_400_000;
const COLOMBO_OFFSET_MS = 330 * 60 * 1000;

export interface ReportPeriod {
  from: string;
  to: string;
  days: number;
  startUtc: Date;
  endUtcExclusive: Date;
}

type PeriodResult =
  | {
      success: true;
      period: ReportPeriod;
    }
  | {
      success: false;
      message: string;
    };

function colomboDayStartUtc(date: string): Date {
  const midnightUtc = Date.parse(
    `${date}T00:00:00.000Z`
  );

  // Modern Sri Lankan reporting dates use
  // the UTC+05:30 local time offset.
  return new Date(
    midnightUtc - COLOMBO_OFFSET_MS
  );
}

function daysInclusive(
  from: string,
  to: string
): number {
  const fromMs = Date.parse(
    `${from}T00:00:00.000Z`
  );

  const toMs = Date.parse(
    `${to}T00:00:00.000Z`
  );

  return Math.round(
    (toMs - fromMs) / ONE_DAY_MS
  ) + 1;
}

export function resolveReportPeriod(
  query: unknown
): PeriodResult {
  const parsed = collectionsQuerySchema.safeParse(
    query
  );

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid report date parameters",
    };
  }

  const today = todayInColombo();

  const to = parsed.data.to ?? today;
  const from =
    parsed.data.from ?? addDays(to, -29);

  if (from > to) {
    return {
      success: false,
      message:
        "Start date must be on or before end date",
    };
  }

  if (to > today) {
    return {
      success: false,
      message:
        "Report end date cannot be in the future",
    };
  }

  const days = daysInclusive(from, to);

  if (days > 366) {
    return {
      success: false,
      message:
        "Report period cannot exceed 366 days",
    };
  }

  return {
    success: true,

    period: {
      from,
      to,
      days,

      startUtc: colomboDayStartUtc(from),

      endUtcExclusive: colomboDayStartUtc(
        addDays(to, 1)
      ),
    },
  };
}
