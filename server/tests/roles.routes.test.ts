import express from "express";
import cookieParser from "cookie-parser";
import { describe, expect, it, vi } from "vitest";
import { requireRole } from "../src/middlewares/auth.middleware.js";
import { Staff } from "../src/modules/auth/staff.model.js";
import { staffRouter } from "../src/modules/staff/staff.routes.js";
import { planRouter } from "../src/modules/membership-plans/plan.routes.js";
import { MembershipPlan } from "../src/modules/membership-plans/plan.model.js";
import { testClient } from "./helpers/http.js";
import { sessionCookie, staffFixture } from "./helpers/staff.js";

function rolesClient() {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/staff", staffRouter);
  app.use("/api/plans", planRouter);
  app.get("/role-without-auth", requireRole("ADMIN"), (_req, res) => res.json({ authorized: true }));
  return testClient(app);
}

describe("existing role authorization through actual staff/plan routes", () => {
  it("allows an Admin to list staff without exposing password hashes", async () => {
    const staff = staffFixture();
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const directoryQuery = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([staff]) };
    vi.spyOn(Staff, "find").mockReturnValue(directoryQuery as unknown as ReturnType<typeof Staff.find>);
    vi.spyOn(Staff, "countDocuments").mockResolvedValue(1);
    const response = await rolesClient().get("/api/staff").set("Cookie", sessionCookie(staff.id));
    expect(response.status).toBe(200);
    expect(response.body.data[0].role).toBe("ADMIN");
    expect(response.body.data[0]).not.toHaveProperty("passwordHash");
  });

  it("rejects a Receptionist from the Admin-only staff router before listing staff", async () => {
    const staff = staffFixture("RECEPTIONIST");
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const list = vi.spyOn(Staff, "find");
    const response = await rolesClient().get("/api/staff").set("Cookie", sessionCookie(staff.id));
    expect(response.status).toBe(403);
    expect(list).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated access to the actual staff router", async () => {
    const response = await rolesClient().get("/api/staff");
    expect(response.status).toBe(401);
  });

  it("keeps staff administration Admin-only despite an injected staff permission", async () => {
    const staff = staffFixture("RECEPTIONIST", { permissions: ["staff.manage"] });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const list = vi.spyOn(Staff, "find");
    expect((await rolesClient().get("/api/staff").set("Cookie", sessionCookie(staff.id))).status).toBe(403);
    expect(list).not.toHaveBeenCalled();
  });

  it("requireRole itself returns 401 when no authenticated staff was attached", async () => {
    const response = await rolesClient().get("/role-without-auth");
    expect(response.status).toBe(401);
  });

  it.each(["ADMIN", "RECEPTIONIST"] as const)("preserves %s access to the existing active-plan operation", async (role) => {
    const staff = staffFixture(role);
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const plans = vi.spyOn(MembershipPlan, "find").mockReturnValue({ sort: vi.fn().mockResolvedValue([]) } as unknown as ReturnType<typeof MembershipPlan.find>);
    const response = await rolesClient().get("/api/plans").set("Cookie", sessionCookie(staff.id));
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(plans).toHaveBeenCalledWith({ isActive: true });
  });
});
