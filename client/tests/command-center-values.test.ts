import { describe, expect, it } from "vitest";
import { automationHealth, collectionSnapshot, orderedAlerts, type CommandAlert } from "../src/utils/command-center";
import { commandDay, commandScheduler } from "./fixtures/command-center";
import { closingFixture } from "./fixtures/financial";
import { gymDate } from "./fixtures/dashboard";

describe("single-ledger collection presentation", () => {
  it("includes membership and POS once, across all three payment methods", () => {
    expect(collectionSnapshot(commandDay, gymDate)).toMatchObject({ status: "OPEN", membershipLkr: 12500, retailLkr: 2500, combinedLkr: 15000, legacy: false, closedAt: null });
  });
  it("uses an immutable closed snapshot without changing its values", () => {
    const closing = { ...closingFixture, date: gymDate, totals: structuredClone(commandDay.totals) };
    const original = structuredClone(closing);
    expect(collectionSnapshot({ success: true, status: "CLOSED", closing }, gymDate)).toMatchObject({ status: "CLOSED", combinedLkr: 15000, closedAt: closing.closedAt });
    expect(closing).toEqual(original);
  });
  it("preserves a legacy membership-only closing without backfilling retail", () => {
    const result = collectionSnapshot({ success: true, status: "CLOSED", closing: { ...closingFixture, date: gymDate } }, gymDate);
    expect(result).toMatchObject({ membershipLkr: 85000, retailLkr: 0, combinedLkr: 85000, legacy: true });
  });
  it("rejects another calendar day's data rather than relabelling it as today", () => {
    expect(() => collectionSnapshot(commandDay, "2026-11-02")).toThrow(/different gym date/);
  });
  it("does not infer zero retail collections from a missing current source breakdown", () => {
    expect(() => collectionSnapshot({ ...commandDay, totals: { ...commandDay.totals, retailCollections: undefined } }, gymDate)).toThrow(/breakdown is unavailable/);
  });
  it("does not treat a partial closed breakdown as a legacy snapshot", () => {
    const closing = { ...closingFixture, date: gymDate, totals: { ...commandDay.totals, membershipCollections: undefined } };
    expect(() => collectionSnapshot({ success: true, status: "CLOSED", closing }, gymDate)).toThrow(/breakdown is unavailable/);
  });
  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects invalid whole LKR values (%s)", value => {
    const totals = structuredClone(commandDay.totals); totals.collections.CASH = value;
    expect(() => collectionSnapshot({ ...commandDay, totals }, gymDate)).toThrow(/inconsistent/);
  });
  it("rejects mismatched source totals instead of showing a misleading combined number", () => {
    const totals = structuredClone(commandDay.totals); totals.collections.CARD++;
    expect(() => collectionSnapshot({ ...commandDay, totals }, gymDate)).toThrow(/inconsistent/);
  });
  it("rejects an unsafe display sum even when individual methods remain safe", () => {
    const methods = { CASH: Number.MAX_SAFE_INTEGER, CARD: 1, BANK_TRANSFER: 0 };
    expect(() => collectionSnapshot({ ...commandDay, totals: { ...commandDay.totals, collections: methods, membershipCollections: methods, retailCollections: { CASH: 0, CARD: 0, BANK_TRANSFER: 0 } } }, gymDate)).toThrow(/safe whole-LKR/);
  });
});
describe("operational alerts and reliable automation health", () => {
  it.each([
    [{ historyAvailable: false }, "Automation history unavailable", "warning"],
    [{ enabled: false, lastRun: null }, "Automatic simulation disabled", "quiet"],
    [{ enabled: true, lastRun: null }, "Automatic simulation enabled", "quiet"],
    [{}, "Reminder simulation failed", "urgent"],
    [{ lastRun: { ...commandScheduler.lastRun!, status: "RUNNING" as const } }, "Reminder completion unconfirmed", "warning"],
    [{ lastRun: { ...commandScheduler.lastRun!, status: "SUCCEEDED" as const } }, "Reminder simulation completed", "quiet"],
  ])("presents known state without claiming real delivery (%j)", (overrides, label, tone) => {
    expect(automationHealth({ ...commandScheduler, ...overrides })).toMatchObject({ label, tone });
  });
  it("orders safety and failures before routine work without mutating the source", () => {
    const alert = (id: string, priority: number): CommandAlert => ({ id, priority, title: id, detail: "Fictional", to: "/equipment", action: "Open" });
    const items = [alert("stock", 7), alert("service", 2), alert("safety", 0), alert("failure", 1)];
    expect(orderedAlerts(items).map(item => item.id)).toEqual(["safety", "failure", "service", "stock"]);
    expect(items[0].id).toBe("stock");
  });
});
