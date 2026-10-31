import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { describe, expect, it, vi } from "vitest";
import { Staff } from "../src/modules/auth/staff.model.js";
import { requirePermission } from "../src/middlewares/permission.middleware.js";
import type { Permission } from "../src/modules/auth/permissions.js";
import { memberRouter } from "../src/modules/members/member.routes.js";
import { membershipRouter } from "../src/modules/memberships/membership.routes.js";
import { invoiceRouter } from "../src/modules/billing/invoice.routes.js";
import { paymentRouter } from "../src/modules/billing/payment.routes.js";
import { attendanceRouter } from "../src/modules/attendance/attendance.routes.js";
import { attentionRouter } from "../src/modules/attention/attention.routes.js";
import { planRouter } from "../src/modules/membership-plans/plan.routes.js";
import { testClient } from "./helpers/http.js";
import { sessionCookie, staffFixture } from "./helpers/staff.js";

const probe = vi.hoisted(() => (_req: Request, res: Response) => res.json({ authorizationPassed: true }));
vi.mock("../src/modules/members/member.controller.js", () => ({ createMember: probe }));
vi.mock("../src/modules/members/member.management.controller.js", () => ({ getMembers: probe, getMemberById: probe, updateMember: probe, updateMemberStatus: probe }));
vi.mock("../src/modules/membership-plans/plan.controller.js", () => ({ createPlan: probe, getPlans: probe }));
vi.mock("../src/modules/membership-plans/plan.management.controller.js", () => ({ getPlanById: probe, updatePlan: probe, updatePlanStatus: probe }));
vi.mock("../src/modules/memberships/membership.controller.js", () => ({ createEnrollment: probe, getMemberMemberships: probe }));
vi.mock("../src/modules/memberships/membership.renewal.controller.js", () => ({ renewMembership: probe, getMembershipSummary: probe }));
vi.mock("../src/modules/billing/invoice.controller.js", () => ({ createInvoice: probe, getInvoiceById: probe, getMemberInvoices: probe }));
vi.mock("../src/modules/billing/invoice.list.controller.js", () => ({ getAllInvoices: probe, getBillingOverview: probe }));
vi.mock("../src/modules/billing/payment.controller.js", () => ({ recordPayment: probe, getInvoicePayments: probe }));
vi.mock("../src/modules/attendance/attendance.controller.js", () => ({ checkInMember: probe }));
vi.mock("../src/modules/attendance/attendance.reporting.controller.js", () => ({ getDailyAttendance: probe, getAttendanceSummary: probe, getMemberAttendance: probe }));
vi.mock("../src/modules/attendance/attendance.search.controller.js", () => ({ searchAttendanceMembers: probe }));
vi.mock("../src/modules/attention/attention.controller.js", () => ({ getExpiringMemberships: probe }));
vi.mock("../src/modules/attention/attention.billing.controller.js", () => ({ getOutstandingPayments: probe }));
vi.mock("../src/modules/attention/attention.inactivity.controller.js", () => ({ getAttendanceInactivityAlerts: probe }));
vi.mock("../src/modules/attention/follow-up.controller.js", () => ({ createFollowUp: probe, getMemberFollowUps: probe, getDueFollowUps: probe }));

type Method = "get" | "post" | "patch";
const operations: ReadonlyArray<readonly [Method, string, Permission]> = [
  ["get", "/api/members", "members.read"], ["get", "/api/members/member", "members.read"],
  ["post", "/api/members", "members.create"], ["patch", "/api/members/member", "members.update"],
  ["get", "/api/plans", "plans.read"], ["get", "/api/plans/plan", "plans.read"],
  ["get", "/api/memberships/member/member/summary", "memberships.read"],
  ["get", "/api/memberships/member/member", "memberships.read"],
  ["post", "/api/memberships", "memberships.enroll"], ["post", "/api/memberships/renew", "memberships.renew"],
  ["get", "/api/invoices", "invoices.read"], ["get", "/api/invoices/overview", "invoices.read"],
  ["get", "/api/invoices/member/member", "invoices.read"], ["get", "/api/invoices/invoice", "invoices.read"],
  ["post", "/api/invoices", "invoices.create"],
  ["get", "/api/payments/invoice/invoice", "payments.read"], ["post", "/api/payments", "payments.record"],
  ["get", "/api/attendance", "attendance.read"], ["get", "/api/attendance/summary", "attendance.read"],
  ["get", "/api/attendance/member/member", "attendance.read"], ["get", "/api/attendance/member-search", "attendance.read"],
  ["post", "/api/attendance/check-in", "attendance.check-in"],
  ["get", "/api/attention/expiring", "attention.read"], ["get", "/api/attention/outstanding", "attention.read"],
  ["get", "/api/attention/inactive-attendance", "attention.read"],
  ["get", "/api/attention/follow-ups/due", "follow-ups.read"], ["get", "/api/attention/follow-ups/member/member", "follow-ups.read"],
  ["post", "/api/attention/follow-ups", "follow-ups.create"],
];

function client() {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/members", memberRouter);
  app.use("/api/plans", planRouter);
  app.use("/api/memberships", membershipRouter);
  app.use("/api/invoices", invoiceRouter);
  app.use("/api/payments", paymentRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/attention", attentionRouter);
  return testClient(app);
}

describe.each(operations)("business permission: %s %s (%s)", (method, path, permission) => {
  it("denies an explicit empty grant before business logic executes", async () => {
    const staff = staffFixture("RECEPTIONIST", { permissions: [] });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const response = await client()[method](path).set("Cookie", sessionCookie(staff.id)).send({});
    expect(response.status).toBe(403);
    expect(response.body.authorizationPassed).toBeUndefined();
  });

  it("accepts exactly the required custom permission through the real route guards", async () => {
    const staff = staffFixture("RECEPTIONIST", { permissions: [permission] });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const response = await client()[method](path).set("Cookie", sessionCookie(staff.id)).send({});
    expect(response.status).toBe(200);
    expect(response.body.authorizationPassed).toBe(true);
  });
});

describe("permission middleware and retained Admin-only boundaries", () => {
  it("preserves legacy Receptionist access to every existing business route", async () => {
    const staff = staffFixture("RECEPTIONIST");
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    for (const [method, path] of operations) {
      expect((await client()[method](path).set("Cookie", sessionCookie(staff.id)).send({})).status).toBe(200);
    }
  });

  it("returns 401 when invoked without authentication", async () => {
    const app = express();
    app.get("/", requirePermission("members.read"), probe);
    expect((await testClient(app).get("/")).status).toBe(401);
  });

  it("does not let one business permission authorize a different operation", async () => {
    const staff = staffFixture("RECEPTIONIST", { permissions: ["members.read"] });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    expect((await client().post("/api/members").set("Cookie", sessionCookie(staff.id))).status).toBe(403);
  });

  it.each([
    ["patch", "/api/members/member/status", "members.status"],
    ["post", "/api/plans", "plans.manage"],
    ["patch", "/api/plans/plan", "plans.manage"],
    ["patch", "/api/plans/plan/status", "plans.manage"],
  ] as const)("keeps %s %s Admin-only despite a forged privileged assignment", async (method, path, permission) => {
    const staff = staffFixture("RECEPTIONIST", { permissions: [permission] });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    expect((await client()[method](path).set("Cookie", sessionCookie(staff.id))).status).toBe(403);
  });

  it("Admin keeps full business access even with an empty stored list", async () => {
    const staff = staffFixture("ADMIN", { permissions: [] });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    expect((await client().post("/api/payments").set("Cookie", sessionCookie(staff.id))).status).toBe(200);
  });
});
