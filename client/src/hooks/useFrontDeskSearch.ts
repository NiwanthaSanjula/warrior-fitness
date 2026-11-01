import { useCallback, useEffect, useRef, useState } from "react";
import { membersApi } from "../api/members.api";
import { attendanceApi } from "../api/attendance.api";
import { getApiErrorMessage } from "../api/api";
import { memberSearchTerms, uniqueSearchMatch, type DeskMember } from "../utils/front-desk";

type SearchState = { status: "idle" | "loading" } | { status: "error"; message: string } | { status: "success"; members: DeskMember[]; total: number };
export function useFrontDeskSearch(select: (member: DeskMember) => void, attendanceLookup = false) {
  const [query, setQuery] = useState("");
  const [request, setRequest] = useState({ term: "", version: 0, immediate: false, openUnique: false });
  const [result, setResult] = useState<{ key: string; state: SearchState } | null>(null);
  const [highlight, setHighlight] = useState(-1);
  const onSelect = useRef(select);
  useEffect(() => { onSelect.current = select; }, [select]);
  const term = query.trim(), valid = term.length >= 2 && term.length <= 100;
  const key = `${request.term}:${request.version}`;
  const state: SearchState = !valid ? { status: "idle" } : request.term !== term || result?.key !== key ? { status: "loading" } : result.state;

  useEffect(() => {
    if (request.term.length < 2 || request.term.length > 100) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          let response: { data: DeskMember[]; pagination: { total: number } } | undefined;
          for (const q of memberSearchTerms(request.term)) {
            if (attendanceLookup) {
              const result = await attendanceApi.searchMembers(q, controller.signal);
              response = { data: result.data.slice(0, 8), pagination: { total: result.data.length } };
            } else response = await membersApi.getMembers({ q, page: 1, limit: 8, status: "all" }, controller.signal);
            if (controller.signal.aborted) return;
            if (response.data.length) break;
          }
          if (controller.signal.aborted || !response) return;
          setResult({ key, state: { status: "success", members: response.data, total: response.pagination.total } });
          if (request.openUnique) {
            const match = uniqueSearchMatch(response.data, request.term);
            if (match && response.pagination.total === response.data.length) onSelect.current(match);
          }
        } catch (error) {
          if (!controller.signal.aborted) setResult({ key, state: { status: "error", message: getApiErrorMessage(error) } });
        }
      })();
    }, request.immediate ? 0 : 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [request, key, attendanceLookup]);

  const change = useCallback((value: string) => {
    setQuery(value); setHighlight(-1);
    setRequest(current => ({ term: value.trim(), version: current.version + 1, immediate: false, openUnique: false }));
  }, []);
  function submit() {
    if (!valid) return;
    if (state.status === "success") {
      const member = highlight >= 0 ? state.members[highlight] : state.total === state.members.length ? uniqueSearchMatch(state.members, term) : null;
      if (member) { select(member); return; }
      if (state.members.length) { setHighlight(0); return; }
    }
    setRequest(current => ({ term, version: current.version + 1, immediate: true, openUnique: true }));
  }
  return { query, term, state, highlight, change, submit, setHighlight,
    retry: () => setRequest(current => ({ term, version: current.version + 1, immediate: true, openUnique: false })),
    move: (direction: number) => { if (state.status === "success" && state.members.length) setHighlight(current => current < 0 ? (direction > 0 ? 0 : state.members.length - 1) : (current + direction + state.members.length) % state.members.length); },
  };
}
