import type { MemberInvoicesResponse } from "../types/billing";
import type { Member } from "../types/member";

export type DeskMember = Pick<Member, "id" | "memberId" | "fullName" | "phone" | "isActive">;

export function memberSearchTerms(value: string): string[] {
  const term = value.trim();
  if (!/^[+\d\s()-]+$/.test(term)) return [term];
  const compact = term.replace(/[\s()-]/g, "");
  const alternate = compact.startsWith("+94") ? `0${compact.slice(3)}` : compact.startsWith("0") ? `+94${compact.slice(1)}` : null;
  return [...new Set([compact, ...(alternate ? [alternate] : [])])];
}
const phoneKey = (value: string) => value.replace(/[\s()+-]/g, "").replace(/^94/, "0");
export function uniqueSearchMatch(members: DeskMember[], query: string): DeskMember | null {
  const term = query.trim().toLocaleLowerCase();
  const exact = members.filter(member => member.memberId.toLowerCase() === term || member.fullName.toLocaleLowerCase() === term || (/^[+\d\s()-]+$/.test(term) && phoneKey(member.phone) === phoneKey(term)));
  return exact.length === 1 ? exact[0] : members.length === 1 ? members[0] : null;
}

// Presentation of the existing complete member invoice response: add only the
// server's balanceLkr fields. Never reconstruct prices, payments or transaction rules.
export function memberBalance(response: MemberInvoicesResponse, memberId: string) {
  if (response.total !== response.data.length || response.data.some(invoice => invoice.memberId !== memberId || !Number.isSafeInteger(invoice.balanceLkr) || invoice.balanceLkr < 0)) throw new Error("Member invoice totals could not be confirmed.");
  const outstandingLkr = response.data.reduce((sum, invoice) => sum + invoice.balanceLkr, 0);
  if (!Number.isSafeInteger(outstandingLkr)) throw new Error("Member balance exceeds safe whole-LKR display limits.");
  const open = response.data.filter(invoice => invoice.balanceLkr > 0).sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue) || a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  return { outstandingLkr, open, reviewInvoice: open[0] ?? response.data[0] ?? null };
}
