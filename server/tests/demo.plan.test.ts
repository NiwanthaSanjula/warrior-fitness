import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { buildDemoPlan, demoId, demoUuid, validateDemoPlan } from "../src/scripts/demo/demo.plan.js";
import { demoDocumentModels } from "../src/scripts/demo/demo.store.js";
import { addDays, todayInColombo } from "../src/modules/memberships/membership.dates.js";
import { duePeriod } from "../src/modules/notifications/notification.eligibility.js";
import { reconcileCash } from "../src/modules/financial/financial.service.js";
import { expenseInputSchema, closingInputSchema } from "../src/modules/financial/financial.validation.js";
import { createProductInput } from "../src/modules/retail/retail.validation.js";

const anchor = new Date("2026-10-31T20:00:00.000Z"), plan = buildDemoPlan(anchor);
beforeEach(() => vi.setSystemTime(anchor));
const documents = (model: string) => plan.operations.flatMap(op => op.kind === "document" && op.data.model === model ? [op.data.value] : []);

describe("deterministic fictional demo plan", () => {
  it("creates the complete requested inventory and coherent recent activity", () => {
    expect(plan.counts).toMatchObject({ members: 60, plans: 5, memberships: 70, invoices: 70, retailProducts: 20, retailSales: 68, payments: 56, expenses: 14, cashClosings: 12, equipment: 12, breakdowns: 4, workOrders: 3, consents: 60 });
    expect(plan.counts.attendance).toBeGreaterThan(250);
    expect(plan.dates).toHaveLength(14); expect(plan.dates[13]).toBe("2026-11-01");
    expect(plan.hash).toBe(buildDemoPlan(anchor).hash);
    expect(buildDemoPlan(anchor)).toEqual(plan);
    expect(new Set(plan.operations.map(op => op.key)).size).toBe(plan.operations.length);
    expect(new Set(documents("Member").map(member => member.phone)).size).toBe(60);
    expect(documents("Member").every(member => /^000000\d{4}$/.test(String(member.phone)) && String(member.memberId).startsWith("WF-DEMO-"))).toBe(true);
    expect(demoUuid("payment-1")).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-8[a-f\d]{3}-[a-f\d]{12}$/);
    expect(demoId("member-1")).not.toBe(demoId("member-2"));
  });
  it.each([
    ["2026-10-31T18:29:59Z", "2026-10-31"], ["2026-10-31T18:30:00Z", "2026-11-01"],
    ["2028-02-29T18:30:00Z", "2028-03-01"], ["2026-12-31T18:30:00Z", "2027-01-01"],
  ])("uses Colombo dates and consecutive coverage at %s", (instant, expected) => {
    const generated = buildDemoPlan(new Date(instant));
    expect(generated.asOf).toBe(expected);
    expect(generated.dates[0]).toBe(addDays(expected, -13));
    expect(generated.dates.every((date, index) => date === addDays(expected, index - 13))).toBe(true);
  });
  it("provides attendance, payments, POS and expenses on every one of the last seven dates", () => {
    for (const date of plan.dates.slice(-7)) {
      expect(documents("Attendance").filter(item => item.attendanceDate === date).length).toBeGreaterThan(0);
      expect(plan.days[date].paymentCount).toBeGreaterThan(0);
      expect(plan.days[date].retailSaleCount).toBeGreaterThan(0);
      expect(plan.days[date].expenseCount).toBeGreaterThan(0);
    }
    expect(new Set(plan.dates.map(date => documents("Attendance").filter(item => item.attendanceDate === date).length)).size).toBeGreaterThan(5);
  });
  it("never assigns future event timestamps even at the very start of a Colombo day", () => {
    const cutoff = new Date("2026-10-31T18:30:01Z"), generated = buildDemoPlan(cutoff);
    for (const operation of generated.operations) {
      const values = Object.values(operation.data);
      if (operation.kind === "document") values.push(...Object.values(operation.data.value));
      for (const value of values) if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) expect(Date.parse(value)).toBeLessThanOrEqual(cutoff.getTime());
    }
  });
  it("creates schema-valid nonfinancial documents and uses only supported financial inputs", async () => {
    for (const op of plan.operations) {
      if (op.kind === "document") {
        const Model = demoDocumentModels[op.data.model];
        const item = new Model({ ...op.data.value, ...(op.data.model === "Staff" ? { passwordHash: "fictional-test-hash-never-for-login" } : {}) });
        await item.validate();
      } else if (op.kind === "expense") expect(expenseInputSchema.safeParse(op.data).success).toBe(true);
      else if (op.kind === "product") {
        const { recordedAt: _at, targetStock: _target, ...input } = op.data;
        expect(createProductInput.safeParse(input).success).toBe(true);
      } else if (op.kind === "closing") {
        const { expectedTotals: _totals, ...input } = op.data;
        expect(closingInputSchema.safeParse({ ...input, expectedRevision: 0 }).success).toBe(true);
      }
    }
  });
});

describe("demo referential and accounting consistency", () => {
  it("links memberships to real generated members/plans and preserves purchased snapshots", () => {
    const members = new Set(documents("Member").map(item => item._id)), plans = new Map(documents("MembershipPlan").map(item => [item._id, item]));
    for (const period of plan.purchases) {
      expect(members.has(period.memberId)).toBe(true);
      expect(plans.get(period.planId)).toMatchObject(period.planSnapshot);
      const sameMember = plan.purchases.filter(other => other.memberId === period.memberId);
      expect(sameMember.filter(item => item.enrollmentType === "INITIAL")).toHaveLength(1);
      if (period.enrollmentType === "RENEWAL") expect(sameMember.some(item => item.endDateExclusive === period.startDate)).toBe(true);
    }
    expect(plan.purchases.some(item => item.endDateExclusive <= plan.asOf)).toBe(true);
    expect(plan.purchases.some(item => item.startDate > plan.asOf)).toBe(true);
    expect(documents("Member").filter(item => !item.isActive)).toHaveLength(6);
  });
  it("checks in active profiles only during inclusive-start/exclusive-end coverage", () => {
    const members = new Map(documents("Member").map(item => [item._id, item])), unique = new Set<string>();
    for (const attendance of documents("Attendance")) {
      const period = plan.purchases.find(item => item.id === attendance.membership)!;
      expect(period.memberId).toBe(attendance.member); expect(members.get(String(attendance.member))?.isActive).toBe(true);
      expect(period.startDate <= String(attendance.attendanceDate) && String(attendance.attendanceDate) < period.endDateExclusive).toBe(true);
      expect(todayInColombo(new Date(String(attendance.checkedInAt)))).toBe(attendance.attendanceDate);
      const key = `${attendance.member}:${attendance.attendanceDate}`; expect(unique.has(key)).toBe(false); unique.add(key);
    }
    expect(documents("Attendance").some(item => item.member === demoId("member-16"))).toBe(false);
  });
  it("balances all invoices with paid, partial and unpaid examples, including overdue balances", () => {
    const states = { paid: 0, partial: 0, unpaid: 0 }, payments = plan.operations.filter(op => op.kind === "payment");
    for (const period of plan.purchases) {
      const received = payments.filter(op => op.data.membershipId === period.id), paid = received.reduce((sum, op) => sum + op.data.amountLkr, 0);
      expect(paid).toBeLessThanOrEqual(period.planSnapshot.priceLkr);
      states[paid === 0 ? "unpaid" : paid === period.planSnapshot.priceLkr ? "paid" : "partial"]++;
      received.forEach(op => expect(op.data.receivedAt >= period.issuedAt).toBe(true));
    }
    expect(states).toEqual({ paid: 42, partial: 14, unpaid: 14 });
    expect(new Set(payments.map(op => op.data.method)).size).toBe(3);
    expect(plan.purchases.some(item => todayInColombo(new Date(item.issuedAt)) < plan.asOf && !payments.some(op => op.data.membershipId === item.id))).toBe(true);
  });
  it("independently reconciles each day's method/source totals and carried cash closings", () => {
    let carry = 15000;
    for (const date of plan.dates) {
      const totals = plan.days[date];
      for (const method of ["CASH", "CARD", "BANK_TRANSFER"] as const) {
        const membership = plan.operations.filter(op => op.kind === "payment" && todayInColombo(new Date(op.data.receivedAt)) === date && op.data.method === method).reduce((sum, op) => sum + (op.kind === "payment" ? op.data.amountLkr : 0), 0);
        const retail = plan.operations.filter(op => op.kind === "sale" && todayInColombo(new Date(op.data.soldAt)) === date && op.data.method === method).reduce((sum, op) => sum + (op.kind === "sale" ? op.data.expectedTotalLkr : 0), 0);
        const expenses = plan.operations.filter(op => op.kind === "expense" && op.data.expenseDate === date && op.data.method === method).reduce((sum, op) => sum + (op.kind === "expense" ? op.data.amountLkr : 0), 0);
        expect(totals.collections[method]).toBe(membership + retail); expect(totals.expenses[method]).toBe(expenses);
      }
      const closing = plan.operations.find(op => op.kind === "closing" && op.data.date === date);
      if (closing?.kind === "closing") {
        expect(closing.data.openingCashLkr).toBe(carry);
        const cash = reconcileCash(carry, closing.data.actualCashLkr, totals);
        expect(cash.varianceLkr).toBe(date === plan.dates[5] ? -100 : 0);
        if (cash.varianceLkr) expect(closing.data.explanation.length).toBeGreaterThan(5);
        carry = closing.data.actualCashLkr;
      }
    }
    const firstClosing = plan.operations.findIndex(op => op.kind === "closing");
    expect(plan.operations.slice(firstClosing).every(op => op.kind === "closing")).toBe(true);
    expect(plan.operations.some(op => op.kind === "closing" && op.data.date >= plan.dates[12])).toBe(false);
  });
  it("deducts each retail line once, traces restocks/adjustments, and ends with deliberate stock alerts", () => {
    const stock = new Map(plan.products.map(item => [item.sku, item.initialStock]));
    for (const op of plan.operations) {
      if (op.kind === "stock") { expect(op.data.reason.length).toBeGreaterThan(5); stock.set(op.data.sku, stock.get(op.data.sku)! + op.data.change); }
      if (op.kind === "sale") {
        expect(op.data.expectedTotalLkr).toBe(op.data.items.reduce((total, line) => total + line.quantity * line.expectedUnitPriceLkr, 0));
        op.data.items.forEach(line => stock.set(line.sku, stock.get(line.sku)! - line.quantity));
        if (op.data.memberId) expect(documents("Member").some(member => member._id === op.data.memberId && member.isActive)).toBe(true);
      }
      expect([...stock.values()].every(quantity => quantity >= 0)).toBe(true);
    }
    expect(plan.products.filter(item => item.targetStock === 0)).toHaveLength(2);
    expect(plan.products.filter(item => item.targetStock > 0 && item.targetStock <= item.lowStockThreshold)).toHaveLength(4);
    plan.products.forEach(item => expect(stock.get(item.sku)).toBe(item.targetStock));
    expect(new Set(plan.products.map(item => item.barcode)).size).toBe(20);
  });
  it("records only consented simulated reminder milestones using historical purchased coverage", () => {
    const members = new Map(documents("Member").map(item => [item._id, item])), optIn = new Set(documents("NotificationConsent").filter(item => item.whatsappOptIn).map(item => item.member));
    const reminders = documents("ReminderLog"); expect(reminders.length).toBeGreaterThan(20);
    const unique = new Set<string>();
    for (const log of reminders) {
      const periods = plan.purchases.filter(item => item.memberId === log.member && item.issuedAt <= String(log.createdAt)).map(item => ({ _id: new Types.ObjectId(item.id), member: new Types.ObjectId(item.memberId), ...item }));
      const due = duePeriod(periods, String(log.scheduledDate));
      expect(due?.reminderType).toBe(log.reminderType); expect(String(due?.period._id)).toBe(log.membership);
      expect(members.get(String(log.member))?.isActive).toBe(true); expect(optIn.has(log.member)).toBe(true);
      expect(log).toMatchObject({ channel: "WHATSAPP_SIMULATED", status: "SIMULATED", trigger: "MANUAL" });
      const key = `${log.membership}:${log.reminderType}:${log.scheduledDate}`; expect(unique.has(key)).toBe(false); unique.add(key);
    }
  });
  it("rejects a malformed blueprint instead of applying impossible attendance or cash", () => {
    const changed = structuredClone(plan), attendance = changed.operations.find(op => op.kind === "document" && op.data.model === "Attendance")!;
    if (attendance.kind === "document") attendance.data.value.attendanceDate = "2000-01-01";
    expect(() => validateDemoPlan(changed)).toThrow(/Attendance/);
  });
});
