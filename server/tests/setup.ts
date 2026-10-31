import net from "node:net";
import mongoose from "mongoose";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { closeTestServers, isTestServerPort } from "./helpers/http.js";

// env.ts must validate only the config's synthetic variables, never a .env file.
vi.mock("dotenv/config", () => ({}));
vi.mock("../src/server.js", () => {
  throw new Error("The production server entrypoint must never run in unit tests");
});
vi.mock("../src/config/db.js", () => ({
  connectDatabase: () => {
    throw new Error("Database startup is forbidden in unit tests");
  },
}));

const blockedAttempts: string[] = [];
const realSocketConnect = net.Socket.prototype.connect;

function forbidden(operation: string): never {
  blockedAttempts.push(operation);
  throw new Error(`Unexpected ${operation}: use an explicit test mock`);
}

function installIsolationGuards() {
  vi.spyOn(mongoose, "connect").mockImplementation(() => forbidden("MongoDB connection"));
  vi.spyOn(mongoose, "createConnection").mockImplementation(() => forbidden("MongoDB connection"));
  vi.spyOn(mongoose.Connection.prototype, "openUri").mockImplementation(() => forbidden("MongoDB connection"));
  vi.spyOn(mongoose.Query.prototype, "exec").mockImplementation(() => forbidden("MongoDB query"));
  vi.spyOn(mongoose.Aggregate.prototype, "exec").mockImplementation(() => forbidden("MongoDB aggregation"));
  vi.spyOn(mongoose.Model.prototype, "save").mockImplementation(() => forbidden("MongoDB write"));
  vi.stubGlobal("fetch", vi.fn(() => forbidden("HTTP fetch")));
  vi.spyOn(net.Socket.prototype, "connect").mockImplementation(function (this: net.Socket, ...args: unknown[]) {
    const normalized = Array.isArray(args[0]) ? args[0] : args;
    const first = normalized[0] as { host?: string; port?: number | string } | number | string;
    const host = typeof first === "object" ? first.host : normalized[1];
    const port = Number(typeof first === "object" ? first.port : first);
    const loopback = host === undefined || host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (!loopback || !isTestServerPort(port)) forbidden("network connection");
    return Reflect.apply(realSocketConnect, this, args);
  });
}

// Protect module initialization as well as each individual test.
installIsolationGuards();

beforeEach(() => {
  blockedAttempts.length = 0;
  installIsolationGuards();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-15T06:00:00.000Z"));
});

afterEach(async () => {
  await closeTestServers();
  vi.useRealTimers();
  expect(blockedAttempts, "Tests must not attempt database or external network access").toEqual([]);
});
