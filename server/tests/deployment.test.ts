import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { envSchema } from "../src/config/env.js";
import { Staff } from "../src/modules/auth/staff.model.js";
import { getAuthCookieMaxAge } from "../src/modules/auth/token.js";
import { testClient } from "./helpers/http.js";
import { mockLoginLookup, staffFixture } from "./helpers/staff.js";

vi.mock("../src/config/env.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/config/env.js")>();
  return { ...actual, env: { ...actual.env, NODE_ENV: "production", CLIENT_URL: "https://warrior-ui.example.test" } };
});
const origin = "https://warrior-ui.example.test";
const validEnv = { NODE_ENV: "production", CLIENT_URL: origin, MONGODB_URI: "mongodb://127.0.0.1:1/warrior_fitness_unit_tests", JWT_SECRET: "fictional-deployment-test-signing-secret-only" };

describe("production hosting configuration and actual application middleware", () => {
  it("accepts one exact HTTPS frontend origin and normalizes its trailing slash", () => {
    expect(envSchema.parse({ ...validEnv, CLIENT_URL: `${origin}/` }).CLIENT_URL).toBe(origin);
  });
  it.each(["http://warrior-ui.example.test", "https://example.test/path", "https://example.test?query=x", "https://example.test#fragment", "https://fictional:example@example.test", "*"])("rejects unsafe production CLIENT_URL %s", CLIENT_URL => {
    expect(envSchema.safeParse({ ...validEnv, CLIENT_URL }).success).toBe(false);
  });
  it("allows the existing local development origin without weakening production HTTPS", () => {
    expect(envSchema.safeParse({ ...validEnv, NODE_ENV: "development", CLIENT_URL: "http://localhost:5173" }).success).toBe(true);
    expect(envSchema.safeParse({ ...validEnv, CLIENT_URL: "http://localhost:5173" }).success).toBe(false);
  });
  it("uses one trusted reverse-proxy hop", () => {
    expect(app.get("trust proxy")).toBe(1);
  });
  it("allows credentialed preflight from the configured frontend", async () => {
    const response = await testClient(app).options("/api/auth/login").set("Origin", origin).set("Access-Control-Request-Method", "POST").set("Access-Control-Request-Headers", "content-type");
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });
  it("does not grant CORS access to an untrusted origin or reflect its hostname", async () => {
    const response = await testClient(app).options("/api/auth/login").set("Origin", "https://untrusted.example.test").set("Access-Control-Request-Method", "POST");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });
  it.each(["post", "put", "patch", "delete"] as const)("rejects cross-site %s before any account lookup or business logic", async method => {
    const lookup = vi.spyOn(Staff, "findOne");
    const response = await testClient(app)[method]("/api/auth/login").set("Origin", "https://untrusted.example.test").type("form").send({ email: "example@example.test", password: "fictional-only" });
    expect(response.status).toBe(403); expect(lookup).not.toHaveBeenCalled();
  });
  it.each([undefined, "null", `${origin}.untrusted.test`])("rejects an absent, null or lookalike mutation origin (%s)", async value => {
    const request = testClient(app).post("/api/auth/login");
    if (value !== undefined) request.set("Origin", value);
    expect((await request.send({})).status).toBe(403);
  });
  it("passes approved browser requests to the existing input validation", async () => {
    expect((await testClient(app).post("/api/auth/login").set("Origin", origin).send({})).status).toBe(400);
  });
  it("sets a secure HttpOnly cross-site session cookie with the original eight-hour duration", async () => {
    mockLoginLookup(staffFixture("ADMIN"));
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);
    const response = await testClient(app).post("/api/auth/login").set("Origin", origin).send({ email: "admin@example.test", password: "fictional-test-password" });
    expect(response.status).toBe(200);
    const cookie = (response.headers["set-cookie"] as unknown as string[])[0]!;
    for (const attribute of ["HttpOnly", "Secure", "SameSite=None", "Path=/api", "Max-Age=28800"]) expect(cookie.includes(attribute)).toBe(true);
    expect(getAuthCookieMaxAge()).toBe(8 * 60 * 60 * 1000);
    expect(response.body).not.toHaveProperty("token"); expect(response.body.staff).not.toHaveProperty("passwordHash");
  });
  it("clears the production cookie with matching security attributes", async () => {
    const response = await testClient(app).post("/api/auth/logout").set("Origin", origin);
    expect(response.status).toBe(200);
    const cookie = (response.headers["set-cookie"] as unknown as string[])[0]!;
    for (const attribute of ["HttpOnly", "Secure", "SameSite=None", "Path=/api", "Expires=Thu, 01 Jan 1970"]) expect(cookie.includes(attribute)).toBe(true);
  });
});
