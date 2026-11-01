import { useCallback, useState } from "react";
import { membersApi } from "../../api/members.api";
import type { Member } from "../../types/member";
import { useDashboardResource } from "../../hooks/useDashboardResource";
import { DashboardPanel, EmptyQueue } from "../dashboard/DashboardWidgets";
import { retailInput, retailSecondary, retailText } from "../../utils/retail";
export default function RetailMemberPicker({ selected, change, disabled }: { selected: Pick<Member, "id" | "fullName" | "memberId"> | null; change: (member: Member | null) => void; disabled: boolean }) {
  const [query, setQuery] = useState<string | null>(null);
  const load = useCallback((signal: AbortSignal) => membersApi.getMembers({ q: query!, status: "active", page: 1, limit: 5 }, signal), [query]);
  const results = useDashboardResource(query !== null, query ?? "", load);
  return <section className="space-y-3"><h3 className="text-sm font-bold">Customer · optional</h3>{selected ? <div className="space-y-2 rounded-xl border border-orange-500/30 p-3"><p className="text-sm font-bold">{selected.fullName}</p><p className="text-xs text-gym-muted">{selected.memberId}</p><button className={retailSecondary} disabled={disabled} onClick={() => change(null)}>Use walk-in customer</button></div> : <><p className="text-xs text-gym-muted">Walk-in customer. A gym membership is not required.</p><form aria-label="Find retail customer" className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); setQuery(retailText(new FormData(event.currentTarget), "memberSearch")); }}><label className="min-w-0 flex-1 text-xs">Find member<input name="memberSearch" maxLength={100} required className={retailInput} disabled={disabled} /></label><button className={retailSecondary} disabled={disabled}>Find</button></form>{query !== null && <DashboardPanel title="Matching members" description="Choose an active member or keep this a walk-in sale." resource={results}>{result => result.data.length ? <ul className="space-y-2">{result.data.filter(member => member.isActive).map(member => <li key={member.id}><button className={`${retailSecondary} w-full justify-start text-left`} disabled={disabled} onClick={() => { change(member); setQuery(null); }}>{member.fullName} · {member.memberId}</button></li>)}</ul> : <EmptyQueue>No active members match.</EmptyQueue>}</DashboardPanel>}</>}</section>;
}
