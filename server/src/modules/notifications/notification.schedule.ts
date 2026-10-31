import { addDays, todayInColombo } from "../memberships/membership.dates.js";

// Resolve 09:00 through IANA timezone data, independent of the host timezone.
export function colomboNine(date: string): Date {
  const utcNine = Date.parse(`${date}T09:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcNine));
  const part = (type: string) => Number(parts.find(value => value.type === type)!.value);
  const localAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return new Date(utcNine - (localAsUtc - utcNine));
}
export function nextColomboNine(now: Date): Date {
  const today = todayInColombo(now), slot = colomboNine(today);
  return slot.getTime() > now.getTime() ? slot : colomboNine(addDays(today, 1));
}
export interface DailyScheduleDependencies {
  now: () => Date;
  setTimer: (callback: () => void, delay: number) => unknown;
  clearTimer: (timer: unknown) => void;
  run: (date: string) => Promise<unknown>;
  onError: () => void;
}
// No timer or database access occurs on import. Tests exercise this core only
// with an injected virtual clock; the runtime entrypoint rejects test execution.
export function createDailySchedule(deps: DailyScheduleDependencies) {
  let stopped = false, timer: unknown;
  async function tick() {
    if (stopped) return;
    const now = deps.now(), date = todayInColombo(now);
    try { if (now >= colomboNine(date)) await deps.run(date); }
    catch { try { deps.onError(); } catch { /* A logger must not crash the API. */ } }
    finally { if (!stopped) arm(false); }
  }
  function arm(initial: boolean) {
    const now = deps.now();
    const catchUp = initial && now >= colomboNine(todayInColombo(now));
    timer = deps.setTimer(() => { void tick(); }, catchUp ? 0 : nextColomboNine(now).getTime() - now.getTime());
  }
  arm(true);
  return { stop() { stopped = true; deps.clearTimer(timer); } };
}
