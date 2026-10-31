import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { describe, expect, it, vi } from "vitest";
import { Staff } from "../src/modules/auth/staff.model.js";
import { reportsRouter } from "../src/modules/reports/reports.routes.js";
import { getRevenueCollections } from "../src/modules/reports/reports.controller.js";
import { getInvoiceIssuanceReport, getReceivablesReport } from "../src/modules/reports/reports.invoice.controller.js";
import { getMembershipActivity, getActiveMembershipSnapshot } from "../src/modules/reports/reports.membership.controller.js";
import { getAttendanceTrends } from "../src/modules/reports/reports.attendance.controller.js";
import { testClient } from "./helpers/http.js";
import { sessionCookie, staffFixture } from "./helpers/staff.js";

// Only leaf calculations are replaced; router, token verification, and guards remain real.
vi.mock("../src/modules/reports/reports.controller.js", () => ({
  getRevenueCollections: vi.fn((_req: Request, res: Response) => res.json({ authorizationPassed: true })),
}));
vi.mock("../src/modules/reports/reports.invoice.controller.js", () => ({
  getInvoiceIssuanceReport: vi.fn((_req: Request, res: Response) => res.json({ authorizationPassed: true })),
  getReceivablesReport: vi.fn((_req: Request, res: Response) => res.json({ authorizationPassed: true })),
}));
vi.mock("../src/modules/reports/reports.membership.controller.js", () => ({
  getMembershipActivity: vi.fn((_req: Request, res: Response) => res.json({ authorizationPassed: true })),
  getActiveMembershipSnapshot: vi.fn((_req: Request, res: Response) => res.json({ authorizationPassed: true })),
}));
vi.mock("../src/modules/reports/reports.attendance.controller.js", () => ({
  getAttendanceTrends: vi.fn((_req: Request, res: Response) => res.json({ authorizationPassed: true })),
}));

const endpoints = [
  ["/api/reports/revenue/collections", getRevenueCollections],
  ["/api/reports/revenue/invoices", getInvoiceIssuanceReport],
  ["/api/reports/revenue/receivables", getReceivablesReport],
  ["/api/reports/memberships/activity", getMembershipActivity],
  ["/api/reports/memberships/active", getActiveMembershipSnapshot],
  ["/api/reports/attendance/trends", getAttendanceTrends],
] as const;

function reportsClient() {
  const app = express();
  app.use(cookieParser());
  app.use("/api/reports", reportsRouter);
  return testClient(app);
}

describe.each(endpoints)("actual Reports authorization: %s", (path, controller) => {
  it("rejects unauthenticated requests before reaching a controller", async () => {
    const lookup = vi.spyOn(Staff, "findById");
    const response = await reportsClient().get(path);
    expect(response.status).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
    for (const [, handler] of endpoints) expect(handler).not.toHaveBeenCalled();
  });

  it("rejects Receptionist requests before reaching a controller", async () => {
    const staff = staffFixture("RECEPTIONIST");
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const response = await reportsClient().get(path).set("Cookie", sessionCookie(staff.id));
    expect(response.status).toBe(403);
    for (const [, handler] of endpoints) expect(handler).not.toHaveBeenCalled();
  });

  it("allows Admin through the real guards to the intended controller", async () => {
    const staff = staffFixture();
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const response = await reportsClient().get(path).set("Cookie", sessionCookie(staff.id));
    expect(response.status).toBe(200);
    expect(response.body.authorizationPassed).toBe(true);
    expect(controller).toHaveBeenCalledTimes(1);
    for (const [, handler] of endpoints) {
      if (handler !== controller) expect(handler).not.toHaveBeenCalled();
    }
  });

  it("keeps financial reports Admin-only despite an injected report permission", async () => {
    const staff = staffFixture("RECEPTIONIST", { permissions: ["reports.read"] });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const response = await reportsClient().get(path).set("Cookie", sessionCookie(staff.id));
    expect(response.status).toBe(403);
    for (const [, handler] of endpoints) expect(handler).not.toHaveBeenCalled();
  });
});
