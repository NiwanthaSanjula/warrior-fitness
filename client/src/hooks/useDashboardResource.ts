import { useEffect, useState } from "react";
import { getApiErrorMessage } from "../api/api";

export type DashboardState<T> =
  | { status: "disabled" | "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: T };

export interface DashboardResource<T> {
  state: DashboardState<T>;
  retry: () => void;
}

// Each API settles separately. Request keys hide stale data during refresh or
// permission changes; cancellation also protects against late responses.
export function useDashboardResource<T>(enabled: boolean, key: string, load: (signal: AbortSignal) => Promise<T>): DashboardResource<T> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; state: DashboardState<T> } | null>(null);
  const requestKey = `${key}:${attempt}`;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    async function run() {
      try {
        const data = await load(controller.signal);
        if (!controller.signal.aborted) setResult({ key: requestKey, state: { status: "success", data } });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key: requestKey, state: { status: "error", message: getApiErrorMessage(error) } });
      }
    }
    void run();
    return () => controller.abort();
  }, [enabled, requestKey, load]);

  return {
    state: !enabled ? { status: "disabled" }
      : result?.key === requestKey ? result.state : { status: "loading" },
    retry: () => setAttempt((value) => value + 1),
  };
}
