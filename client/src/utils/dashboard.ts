// Calendar dates stay date-only; browser timezone must not shift gym dates.
export function todayInColombo(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function formatGymDate(date: string, short = false): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "short", ...(!short && { year: "numeric" }),
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function formatLkr(value: number): string {
  return `LKR ${new Intl.NumberFormat("en-LK", { maximumFractionDigits: 0 }).format(value)}`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-LK", { maximumFractionDigits: 0 }).format(value);
}
