import express from "express";
import mongoose, { type ClientSession, type HydratedDocument } from "mongoose";
import cookieParser from "cookie-parser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { paymentRouter } from "../src/modules/billing/payment.routes.js";
import { Payment, type IPayment } from "../src/modules/billing/payment.model.js";
import { Invoice } from "../src/modules/billing/invoice.model.js";
import { FinancialDay } from "../src/modules/financial/financial-day.model.js";
import { Staff } from "../src/modules/auth/staff.model.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { testClient } from "./helpers/http.js";
import { sessionCookie, staffFixture } from "./helpers/staff.js";

const session = {} as ClientSession;
const input = { invoiceId: "000000000000000000000010", requestId: "a93fa840-22d1-4e6f-86bc-c397822e8b8b", amountLkr: 500, method: "CASH" };
const sessionResult = (value: unknown) => ({ session: vi.fn().mockResolvedValue(value) }) as never;
const saved: HydratedDocument<IPayment>[] = [];
function client() {
  const app = express(); app.use(express.json(), cookieParser());
  app.use("/api/payments", paymentRouter); app.use(errorHandler); return testClient(app);
}
beforeEach(() => {
  saved.length = 0;
  vi.spyOn(Staff, "findById").mockResolvedValue(staffFixture("RECEPTIONIST"));
  vi.spyOn(mongoose.connection, "transaction").mockImplementation(async (work) => work(session));
  vi.spyOn(Payment, "findOne").mockReturnValue(sessionResult(null));
  vi.spyOn(FinancialDay, "findOneAndUpdate").mockResolvedValue(new FinancialDay({ _id: "2026-01-15", closed: false, revision: 1 }));
  const invoice = Invoice.hydrate({ _id: input.invoiceId, invoiceNumber: "WF-EXAMPLE", member: "000000000000000000000011", membership: "000000000000000000000012", planCode: "EXAMPLE", planName: "Example plan", totalLkr: 1000, paidLkr: 0, dueDate: "2026-01-15", createdBy: staffFixture()._id, createdAt: new Date(), updatedAt: new Date() });
  vi.spyOn(Invoice, "findById").mockReturnValue(sessionResult(invoice));
  vi.spyOn(Invoice, "findOneAndUpdate").mockResolvedValue(Invoice.hydrate({ ...invoice.toObject(), paidLkr: 500 }));
  vi.spyOn(Payment.prototype, "save").mockImplementation(async function (this: HydratedDocument<IPayment>) { this.createdAt = new Date(); saved.push(this); return this; });
});

describe("existing payment transaction participates in financial-day protection", () => {
  it("locks the timestamp's Colombo day and preserves conditional invoice increment plus payment save", async () => {
    vi.setSystemTime(new Date("2026-01-15T20:00:00.000Z"));
    const response = await client().post("/api/payments").set("Cookie", sessionCookie(staffFixture("RECEPTIONIST").id)).send(input);
    expect(response.status).toBe(201);
    expect(FinancialDay.findOneAndUpdate).toHaveBeenCalledWith({ _id: "2026-01-16" }, expect.any(Object), expect.objectContaining({ session }));
    expect(Invoice.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ paidLkr: { $lte: 500 } }), { $inc: { paidLkr: 500 } }, { new: true, session });
    expect(Payment.prototype.save).toHaveBeenCalledWith({ session });
    expect(saved[0].receivedAt.toISOString()).toBe("2026-01-15T20:00:00.000Z");
  });
  it("blocks new receipts on a closed day before changing the invoice or payment ledger", async () => {
    vi.mocked(FinancialDay.findOneAndUpdate).mockResolvedValue(new FinancialDay({ _id: "2026-01-15", closed: true, revision: 5 }));
    expect((await client().post("/api/payments").set("Cookie", sessionCookie(staffFixture("RECEPTIONIST").id)).send(input)).status).toBe(409);
    expect(Invoice.findOneAndUpdate).not.toHaveBeenCalled(); expect(Payment.prototype.save).not.toHaveBeenCalled();
  });
  it("replays an old payment after closing without a new day write or invoice increment", async () => {
    expect((await client().post("/api/payments").set("Cookie", sessionCookie(staffFixture("RECEPTIONIST").id)).send(input)).status).toBe(201);
    vi.mocked(Payment.findOne).mockReturnValue(sessionResult(saved[0]));
    const response = await client().post("/api/payments").set("Cookie", sessionCookie(staffFixture("RECEPTIONIST").id)).send(input);
    expect(response.status).toBe(200); expect(response.body.replayed).toBe(true);
    expect(FinancialDay.findOneAndUpdate).toHaveBeenCalledOnce(); expect(Invoice.findOneAndUpdate).toHaveBeenCalledOnce();
  });
  it("retains overpayment protection and rejects client timestamp injection", async () => {
    expect((await client().post("/api/payments").set("Cookie", sessionCookie(staffFixture("RECEPTIONIST").id)).send({ ...input, amountLkr: 1001 })).status).toBe(409);
    expect((await client().post("/api/payments").set("Cookie", sessionCookie(staffFixture("RECEPTIONIST").id)).send({ ...input, receivedAt: "2026-01-14T01:00:00Z" })).status).toBe(400);
    expect(Invoice.findOneAndUpdate).not.toHaveBeenCalled(); expect(Payment.prototype.save).not.toHaveBeenCalled();
  });
});
