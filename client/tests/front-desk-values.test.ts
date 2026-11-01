import { describe, expect, it } from "vitest";
import { memberBalance, memberSearchTerms, uniqueSearchMatch } from "../src/utils/front-desk";
import { deskInvoice, deskMember, otherDeskMember } from "./fixtures/front-desk";

describe("front desk search selection and display-only balance", () => {
  it("normalizes local/international phone input without interpreting names or references as phone numbers", () => {
    expect(memberSearchTerms(" +94 (70) 000-0101 ")).toEqual(["+94700000101", "0700000101"]);
    expect(memberSearchTerms("070 000 0101")).toEqual(["0700000101", "+94700000101"]);
    expect(memberSearchTerms("WF-DEMO-101")).toEqual(["WF-DEMO-101"]);
    expect(memberSearchTerms("Nimal Perera")).toEqual(["Nimal Perera"]);
  });
  it("prefers a unique exact reference and does not silently choose among fuzzy matches", () => {
    expect(uniqueSearchMatch([deskMember, otherDeskMember], deskMember.memberId.toLowerCase())).toEqual(deskMember);
    expect(uniqueSearchMatch([deskMember, otherDeskMember], "Example")).toBeNull();
    expect(uniqueSearchMatch([deskMember, { ...otherDeskMember, fullName: deskMember.fullName }], deskMember.fullName)).toBeNull();
    expect(uniqueSearchMatch([], "Missing")).toBeNull();
  });
  it("adds complete server balance fields and prioritizes overdue invoices for collection", () => {
    const future = { ...deskInvoice, id: "future", dueDate: "2026-12-01", balanceLkr: 1000, isOverdue: false };
    const oldest = { ...deskInvoice, id: "oldest", dueDate: "2026-09-01", balanceLkr: 500 };
    const paid = { ...deskInvoice, id: "paid", balanceLkr: 0 };
    const result = memberBalance({ success: true, data: [future, deskInvoice, oldest, paid], total: 4 }, deskMember.id);
    expect(result.outstandingLkr).toBe(3500); expect(result.open.map(invoice => invoice.id)).toEqual(["oldest", deskInvoice.id, "future"]);
  });
  it("distinguishes a verified empty ledger from unavailable data", () => {
    expect(memberBalance({ success: true, data: [], total: 0 }, deskMember.id)).toEqual({ outstandingLkr: 0, open: [], reviewInvoice: null });
  });
  it.each([-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe balance %s", balanceLkr => {
    expect(() => memberBalance({ success: true, data: [{ ...deskInvoice, balanceLkr }], total: 1 }, deskMember.id)).toThrow();
  });
  it("does not present partial pagination, another member's invoices or an overflowing sum as a balance", () => {
    expect(() => memberBalance({ success: true, data: [deskInvoice], total: 10 }, deskMember.id)).toThrow();
    expect(() => memberBalance({ success: true, data: [deskInvoice], total: 1 }, otherDeskMember.id)).toThrow();
    expect(() => memberBalance({ success: true, data: [{ ...deskInvoice, balanceLkr: Number.MAX_SAFE_INTEGER }, deskInvoice], total: 2 }, deskMember.id)).toThrow();
  });
});
