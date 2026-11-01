import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

// Only allow known workflow targets. Wait for asynchronous content, then move
// keyboard focus once per navigation without opening forms or changing data.
export function useWorkflowAnchor(ready: boolean, targets: readonly string[]) {
  const location = useLocation();
  const handled = useRef<string | null>(null);
  const target = location.hash.slice(1);
  const allowed = targets.includes(target);
  useEffect(() => {
    if (!ready || !allowed || handled.current === location.key) return;
    const element = document.getElementById(target);
    if (!element) return;
    element.scrollIntoView?.({ block: "start", behavior: "instant" });
    element.focus({ preventScroll: true });
    handled.current = location.key;
  }, [ready, allowed, target, location.key]);
}
