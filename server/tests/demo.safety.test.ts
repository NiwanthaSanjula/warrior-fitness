import mongoose from "mongoose";
import type { Db } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoMode, parseDemoConfig, verifyDemoUri, verifyConnectedDatabase, safeDemoFailure, DemoError } from "../src/scripts/demo/demo.config.js";
import { connectDemo, preflightDemoWrites } from "../src/scripts/demo/demo.connection.js";
import { MongoDemoStore, demoDocumentModels } from "../src/scripts/demo/demo.store.js";
import { buildDemoPlan } from "../src/scripts/demo/demo.plan.js";
const originalDb = Object.getOwnPropertyDescriptor(mongoose.connection, "db");
function restoreDb() { if (originalDb) Object.defineProperty(mongoose.connection, "db", originalDb); else Reflect.deleteProperty(mongoose.connection, "db"); }
const synthetic = { DEMO_MONGODB_URI: "mongodb://localhost/warrior_fitness_demo", DEMO_STAFF_PASSWORD: "fictional-local-password", JWT_SECRET: "fictional-test-secret-at-least-32-characters" };
function database(options: { name?: string; topology?: boolean; existing?: boolean; owned?: boolean } = {}) {
  const findOne = vi.fn(async () => options.existing ? { _id: "unrelated-existing-record" } : null);
  const fake = {
    databaseName: options.name ?? "warrior_fitness_demo",
    command: vi.fn().mockResolvedValue(options.topology === false ? {} : { setName: "fictional-test-rs" }),
    collection: vi.fn((name: string) => ({ findOne: name === "demo_seed_state" ? vi.fn().mockResolvedValue(options.owned ? { _id: "warrior-fitness-demo-v1", complete: true } : null) : findOne })),
    listCollections: vi.fn(async function* () { yield { name: "members" }; }),
  };
  Object.defineProperty(mongoose.connection, "db", { value: fake as unknown as Db, configurable: true }); return { ...fake, findOne };
}
beforeEach(restoreDb);
afterEach(() => { restoreDb(); vi.unstubAllEnvs(); });
describe("strict demo database safety", () => {
  it("defaults to an offline dry-run and requires an explicit unambiguous write flag", () => {
    expect(demoMode([])).toBe("dry-run"); expect(demoMode(["--dry-run"])).toBe("dry-run"); expect(demoMode(["--apply"])).toBe("apply"); expect(demoMode(["--check"])).toBe("check");
    expect(() => demoMode(["--apply", "--dry-run"])).toThrow(); expect(() => demoMode(["--force"])).toThrow();
  });
  it.each(["mongodb://localhost/warrior_fitness_demo", "mongodb+srv://fictional.example/warrior_fitness_demo?retryWrites=true", "mongodb://fictional.example:27017,second.example:27017/warrior_fitness_demo?replicaSet=demo&authSource=admin"])("accepts an explicitly named dedicated URI (%s)", uri => expect(() => verifyDemoUri(uri)).not.toThrow());
  it.each(["mongodb://localhost/warrior_fitness_db", "mongodb://localhost/", "mongodb://localhost", "mongodb://localhost/warrior_fitness_demo_extra", "mongodb://localhost/%77arrior_fitness_demo", "https://localhost/warrior_fitness_demo", "mongodb://localhost/warrior_fitness_demo#other"])("rejects ambiguous or unrelated targets (%s)", uri => expect(() => verifyDemoUri(uri)).toThrow());
  it("never falls back to the normal MONGODB_URI", () => {
    expect(() => parseDemoConfig({ MONGODB_URI: synthetic.DEMO_MONGODB_URI }, false)).toThrow(/DEMO_MONGODB_URI is missing/);
    expect(() => parseDemoConfig({ ...synthetic, DEMO_MONGODB_URI: "mongodb://localhost/warrior_fitness_db" }, true)).toThrow();
  });
  it("requires local credentials for apply without printing them and refuses production", () => {
    expect(() => parseDemoConfig({ ...synthetic, DEMO_STAFF_PASSWORD: "short" }, true)).toThrow(/12–128/);
    expect(() => parseDemoConfig({ ...synthetic, JWT_SECRET: "short" }, true)).toThrow(/32/);
    expect(() => parseDemoConfig({ ...synthetic, NODE_ENV: "production" }, false)).toThrow(/production/);
    vi.stubEnv("NODE_ENV", "production"); expect(() => parseDemoConfig(synthetic, true)).toThrow(/production/);
  });
  it("checks the actual connected identity instead of trusting only the URI", async () => {
    database({ name: "warrior_fitness_db" }); vi.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
    await expect(connectDemo(parseDemoConfig(synthetic, true))).rejects.toThrow(/identity/);
    expect(() => verifyConnectedDatabase(undefined)).toThrow();
  });
  it("rejects a wrong target before even attempting to connect", async () => {
    const connect = vi.spyOn(mongoose, "connect").mockResolvedValue(mongoose);
    await expect(connectDemo({ ...parseDemoConfig(synthetic, true), uri: "mongodb://localhost/unrelated" })).rejects.toThrow(); expect(connect).not.toHaveBeenCalled();
  });
  it("refuses a first-use database containing unowned records without creating indexes", async () => {
    const db = database({ existing: true });
    const createCollection = vi.spyOn(mongoose.Model, "createCollection");
    await expect(preflightDemoWrites()).rejects.toThrow(/ownership manifest/);
    expect(db.findOne).toHaveBeenCalledOnce(); expect(createCollection).not.toHaveBeenCalled();
  });
  it("accepts an empty replica-set database using reads only", async () => {
    const db = database(); await preflightDemoWrites(); expect(db.command).toHaveBeenCalledWith({ hello: 1 }); expect(db.findOne).toHaveBeenCalledOnce();
  });
  it("refuses standalone MongoDB before any data operation", async () => {
    const db = database({ topology: false }); await expect(preflightDemoWrites()).rejects.toThrow(/replica set/); expect(db.listCollections).not.toHaveBeenCalled();
  });
  it("guards direct adapter calls by identity and a live lease before any model write", async () => {
    const operation = buildDemoPlan(new Date()).operations[0], store = new MongoDemoStore("fictional-local-password");
    database({ name: "unrelated" }); await expect(store.apply(operation)).rejects.toThrow(/identity/);
    database(); vi.spyOn(mongoose.models.DemoSeedState, "exists").mockResolvedValue(null);
    await expect(store.apply(operation)).rejects.toThrow(/lease/);
    expect(mongoose.Model.prototype.save).not.toHaveBeenCalled();
  });
  it("excludes financial ledgers from the generic document writer", () => {
    for (const name of ["Invoice", "Payment", "RetailSale", "StockMovement", "Expense", "CashClosing", "FinancialDay", "EquipmentExpenseLink"]) expect(demoDocumentModels).not.toHaveProperty(name);
  });
  it("sanitizes raw driver failures without returning their text or stack", () => {
    const error = new Error("mongodb://fictionalUser:fictionalSecret@fictional.example/private"); error.name = "MongoServerSelectionError";
    expect(safeDemoFailure(error)).toMatch(/Database\/network/); expect(safeDemoFailure(error)).not.toContain("fictionalSecret");
    expect(safeDemoFailure(new Error("private connection string"))).not.toContain("private connection string");
    expect(safeDemoFailure(new DemoError("Safe validation error"))).toBe("Safe validation error");
  });
});
