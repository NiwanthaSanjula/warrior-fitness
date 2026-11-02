import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Override only the startup-module mock; the global socket/query/write guards
// stay enabled. Every driver call and model initializer below is explicit.
vi.unmock("../src/config/db.js");
const models = vi.hoisted(() => ({
  retail: vi.fn(), finance: vi.fn(), staff: vi.fn(), notifications: vi.fn(), equipment: vi.fn(),
}));
vi.mock("../src/modules/retail/retail.model.js", () => ({ initializeRetailModels: models.retail }));
vi.mock("../src/modules/financial/financial.service.js", () => ({ initializeFinancialModels: models.finance }));
vi.mock("../src/modules/staff/staff.service.js", () => ({ initializeStaffAdministration: models.staff }));
vi.mock("../src/modules/notifications/notification.model.js", () => ({ initializeNotificationModels: models.notifications }));
vi.mock("../src/modules/equipment/equipment.model.js", () => ({ initializeEquipmentModels: models.equipment }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0);
  vi.spyOn(console, "log").mockImplementation(() => {});
  for (const model of Object.values(models)) model.mockReset().mockResolvedValue(undefined);
});

describe("serverless database connection reuse", () => {
  it("does not open a database connection when the module is imported", async () => {
    const connect = vi.spyOn(mongoose, "connect");
    await import("../src/config/db.js");
    expect(connect).not.toHaveBeenCalled();
  });

  it("shares one pending connection across concurrent cold-start requests", async () => {
    const gate = deferred();
    const connect = vi.spyOn(mongoose, "connect").mockImplementation(async () => { await gate.promise; return mongoose; });
    const { connectDatabase } = await import("../src/config/db.js");
    const first = connectDatabase();
    const second = connectDatabase();
    expect(second).toBe(first);
    expect(connect).toHaveBeenCalledTimes(1);
    gate.resolve();
    await Promise.all([first, second]);
  });

  it("reuses an already connected pool without disconnecting after requests", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
    const connect = vi.spyOn(mongoose, "connect");
    const disconnect = vi.spyOn(mongoose, "disconnect");
    const { connectDatabase } = await import("../src/config/db.js");
    await connectDatabase(); await connectDatabase();
    expect(connect).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("clears a failed attempt so a later request can retry", async () => {
    const connect = vi.spyOn(mongoose, "connect").mockRejectedValueOnce(new Error("fictional connection failure")).mockResolvedValueOnce(mongoose);
    const { connectDatabase } = await import("../src/config/db.js");
    await expect(connectDatabase()).rejects.toThrow("fictional connection failure");
    await expect(connectDatabase()).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("reconnects after a previously successful connection is lost", async () => {
    const connect = vi.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
    const { connectDatabase } = await import("../src/config/db.js");
    await connectDatabase();
    // The connection remains explicitly mocked as disconnected.
    await connectDatabase();
    expect(connect).toHaveBeenCalledTimes(2);
  });
});

describe("shared application readiness", () => {
  it("waits for the database before initializing business indexes", async () => {
    const gate = deferred();
    vi.spyOn(mongoose, "connect").mockImplementation(async () => { await gate.promise; return mongoose; });
    const { initializeApplication } = await import("../src/config/initialize.js");
    const request = initializeApplication();
    expect(models.retail).not.toHaveBeenCalled();
    gate.resolve(); await request;
    for (const model of Object.values(models)) expect(model).toHaveBeenCalledTimes(1);
  });

  it("shares index initialization and does not serve requests before it completes", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
    const gate = deferred();
    models.finance.mockReturnValue(gate.promise);
    const { initializeApplication } = await import("../src/config/initialize.js");
    let completed = false;
    const requests = Promise.all([initializeApplication(), initializeApplication()]).then(() => { completed = true; });
    await vi.waitFor(() => expect(models.finance).toHaveBeenCalledTimes(1));
    expect(completed).toBe(false);
    expect(models.staff).not.toHaveBeenCalled();
    gate.resolve(); await requests;
    await initializeApplication();
    for (const model of Object.values(models)) expect(model).toHaveBeenCalledTimes(1);
  });

  it("retries failed index initialization instead of accepting unsafe writes", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
    models.finance.mockRejectedValueOnce(new Error("fictional index failure"));
    const { initializeApplication } = await import("../src/config/initialize.js");
    await expect(initializeApplication()).rejects.toThrow("fictional index failure");
    expect(models.staff).not.toHaveBeenCalled();
    await expect(initializeApplication()).resolves.toBeUndefined();
    expect(models.finance).toHaveBeenCalledTimes(2);
    expect(models.staff).toHaveBeenCalledTimes(1);
  });
});
