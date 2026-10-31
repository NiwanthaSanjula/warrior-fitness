import express from "express";
import cookieParser from "cookie-parser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Staff } from "../src/modules/auth/staff.model.js";
import { expenseRouter, cashClosingRouter } from "../src/modules/financial/financial.routes.js";
import * as service from "../src/modules/financial/financial.service.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { testClient } from "./helpers/http.js";
import { sessionCookie, staffFixture } from "./helpers/staff.js";

vi.mock("../src/modules/financial/financial.service.js", () => ({ createExpense: vi.fn(), closeDay: vi.fn(), previewDay: vi.fn(), listExpenses: vi.fn(), listClosings: vi.fn() }));
function client() {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/expenses", expenseRouter); app.use("/api/cash-closings", cashClosingRouter);
  app.use(errorHandler);
  return testClient(app);
}
const expense = { requestId: "a93fa840-22d1-4e6f-86bc-c397822e8b8b", category: "RENT", description: "Fictional rent", amountLkr: 2000, method: "CASH", expenseDate: "2026-01-15" };
const closing = { requestId: "b93fa840-22d1-4e6f-86bc-c397822e8b8b", date: "2026-01-15", openingCashLkr: 0, actualCashLkr: 0, expectedRevision: 0 };
beforeEach(() => {
  vi.mocked(service.createExpense).mockResolvedValue({ replayed: false, data: {} } as never);
  vi.mocked(service.closeDay).mockResolvedValue({ replayed: false, data: {} } as never);
  vi.mocked(service.previewDay).mockResolvedValue({ status: "OPEN" } as never);
  vi.mocked(service.listExpenses).mockResolvedValue({ data: [] } as never);
  vi.mocked(service.listClosings).mockResolvedValue({ data: [] } as never);
});

describe.each([
  ["get", "/api/expenses", {}], ["post", "/api/expenses", expense],
  ["get", "/api/cash-closings", {}], ["get", "/api/cash-closings/day/2026-01-15", {}],
  ["post", "/api/cash-closings", closing],
] as const)("Admin-only financial route %s %s", (method, path, body) => {
  it("rejects unauthenticated access", async () => {
    expect((await client()[method](path).send(body)).status).toBe(401);
    Object.values(service).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
  it("rejects Receptionists even with forged Admin-only permissions", async () => {
    const staff = staffFixture("RECEPTIONIST", { permissions: ["expenses.manage", "cash-closings.manage"] });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    expect((await client()[method](path).set("Cookie", sessionCookie(staff.id)).send(body)).status).toBe(403);
    Object.values(service).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
  it("permits Admin through the real role and permission middleware", async () => {
    const staff = staffFixture("ADMIN", { permissions: [] });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const response = await client()[method](path).set("Cookie", sessionCookie(staff.id)).send(body);
    expect(response.status).toBe(method === "post" ? 201 : 200);
  });
});

describe("financial input and protected history endpoints", () => {
  beforeEach(() => vi.spyOn(Staff, "findById").mockResolvedValue(staffFixture("ADMIN")));
  it.each([
    ["/api/expenses", { ...expense, amountLkr: 1.5 }],
    ["/api/expenses", { ...expense, responsibleStaff: "spoof" }],
    ["/api/expenses", { ...expense, expenseDate: "2026-01-16" }],
    ["/api/cash-closings", { ...closing, expectedCashLkr: 0 }],
    ["/api/cash-closings", { ...closing, actualCashLkr: -1 }],
  ])("rejects invalid or tampered bodies before executing %s", async (path, body) => {
    expect((await client().post(path).set("Cookie", sessionCookie(staffFixture().id)).send(body)).status).toBe(400);
    expect(service.createExpense).not.toHaveBeenCalled(); expect(service.closeDay).not.toHaveBeenCalled();
  });
  it.each(["/api/expenses?limit=101", "/api/expenses?method=CHEQUE", "/api/cash-closings/day/2026-02-30", "/api/cash-closings?from=not-a-date"])("rejects malformed read filters %s", async (path) => {
    expect((await client().get(path).set("Cookie", sessionCookie(staffFixture().id))).status).toBe(400);
  });
  it.each(["patch", "put", "delete"] as const)("does not expose %s operations for expenses or closings", async (method) => {
    for (const path of ["/api/expenses/record", "/api/cash-closings/record"]) {
      expect((await client()[method](path).set("Cookie", sessionCookie(staffFixture().id)).send({ amountLkr: 1 })).status).toBe(405);
    }
    expect(service.createExpense).not.toHaveBeenCalled(); expect(service.closeDay).not.toHaveBeenCalled();
  });
  it("returns 200 on an idempotent expense replay and uses the authenticated actor", async () => {
    vi.mocked(service.createExpense).mockResolvedValue({ replayed: true, data: {} } as never);
    expect((await client().post("/api/expenses").set("Cookie", sessionCookie(staffFixture().id)).send(expense)).status).toBe(200);
    expect(service.createExpense).toHaveBeenCalledWith(expect.objectContaining({ reference: "" }), expect.objectContaining({ id: staffFixture().id, fullName: staffFixture().fullName }));
  });
});
