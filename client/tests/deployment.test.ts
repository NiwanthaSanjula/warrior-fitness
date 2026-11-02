import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveApiBaseUrl } from "../src/api/api-url";

afterEach(() => vi.unstubAllEnvs());
describe("deployment API base URL", () => {
  it("keeps the existing local Vite proxy when no public URL is configured", () => {
    expect(resolveApiBaseUrl(undefined)).toBe("/api");
    expect(resolveApiBaseUrl("")).toBe("/api");
  });
  it("supports same-origin /api explicitly in a production build", () => {
    expect(resolveApiBaseUrl(" /api ", true)).toBe("/api");
    expect(resolveApiBaseUrl(undefined, true)).toBe("/api");
  });
  it("uses an explicitly configured HTTPS API path without duplicate slashes", () => {
    expect(resolveApiBaseUrl(" https://warrior-api.example.test/api/ ", true)).toBe("https://warrior-api.example.test/api");
  });
  it("permits local HTTP development but enforces production HTTPS", () => {
    expect(resolveApiBaseUrl("http://localhost:5000/api")).toBe("http://localhost:5000/api");
    expect(() => resolveApiBaseUrl("http://localhost:5000/api", true)).toThrow(/HTTPS/);
  });
  it.each(["invalid", "https://example.test", "https://example.test/api?key=example", "https://example.test/api#fragment", "https://fictional:example@example.test/api", "ftp://example.test/api", "//example.test/api"])("rejects invalid or credential-bearing input %s without echoing it", value => {
    try { resolveApiBaseUrl(value, true); throw new Error("Expected rejection"); }
    catch (error) { expect((error as Error).message).toMatch(/VITE_API_BASE_URL/); expect((error as Error).message.includes(value)).toBe(false); }
  });
  it("configures the real Axios client with the public API URL and credentialed requests", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://warrior-api.example.test/api");
    vi.resetModules();
    const { api } = await import("../src/api/api");
    expect(api.defaults.baseURL).toBe("https://warrior-api.example.test/api");
    expect(api.defaults.withCredentials).toBe(true);
  });
  it("keeps the production Axios cookie flow on the frontend origin", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "/api");
    vi.stubEnv("PROD", true);
    vi.resetModules();
    const { api } = await import("../src/api/api");
    expect(api.defaults.baseURL).toBe("/api");
    expect(api.defaults.withCredentials).toBe(true);
  });
});

describe("Vercel frontend routing configuration", () => {
  const config = JSON.parse(readFileSync(`${process.cwd()}/vercel.json`, "utf8")) as {
    framework: string;
    outputDirectory: string;
    rewrites: Array<{ source: string; destination: string }>;
  };

  it("defines a destination for every rewrite and proxies /api before the SPA fallback", () => {
    for (const rule of config.rewrites) expect(rule.destination).toEqual(expect.any(String));
    expect(config.rewrites).toEqual([
      { source: "/api/:path*", destination: "https://warrior-fitness-nine.vercel.app/api/:path*" },
      { source: "/(.*)", destination: "/index.html" },
    ]);
    expect(config.framework).toBe("vite");
    expect(config.outputDirectory).toBe("dist");
  });

  it.each(["/dashboard", "/front-desk", "/members/fictional-id", "/retail/checkout", "/login"])("keeps SPA reload fallback available for %s", path => {
    const fallback = config.rewrites.at(-1)!;
    expect(new RegExp(`^${fallback.source}$`).test(path)).toBe(true);
    expect(fallback.destination).toBe("/index.html");
  });

  it("uses a single static JSON configuration without a dynamic routing file", () => {
    expect(existsSync(`${process.cwd()}/vercel.ts`)).toBe(false);
  });
});
