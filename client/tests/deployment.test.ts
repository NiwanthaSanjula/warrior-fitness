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
  async function configuration(origin = "https://warrior-api.example.test") {
    vi.stubEnv("BACKEND_ORIGIN", origin);
    vi.resetModules();
    return (await import("../vercel")).config;
  }

  it("proxies /api before the SPA fallback, preserving the existing backend prefix", async () => {
    const config = await configuration();
    expect(config.rewrites).toEqual([
      { source: "/api/:path*", destination: "https://warrior-api.example.test/api/:path*" },
      { source: "/(.*)", destination: "/index.html" },
    ]);
    expect(config.framework).toBe("vite");
    expect(config.outputDirectory).toBe("dist");
  });

  it.each(["/dashboard", "/front-desk", "/members/fictional-id", "/retail/checkout", "/login"])("keeps SPA reload fallback available for %s", async path => {
    const config = await configuration();
    const fallback = config.rewrites.at(-1)!;
    expect(new RegExp(`^${fallback.source}$`).test(path)).toBe(true);
    expect(fallback.destination).toBe("/index.html");
  });

  it("normalizes the configured origin and prevents API response caching", async () => {
    const config = await configuration("https://warrior-api.example.test/");
    expect(config.rewrites[0]!.destination).toBe("https://warrior-api.example.test/api/:path*");
    expect(config.headers).toEqual([{ source: "/api/:path*", headers: [
      { key: "Cache-Control", value: "no-store" },
      { key: "CDN-Cache-Control", value: "no-store" },
      { key: "x-vercel-enable-rewrite-caching", value: "0" },
    ] }]);
  });

  it.each(["", "http://localhost:5000", "https://example.test/api", "https://fictional:private@example.test", "https://example.test?secret=x", "https://example.test#fragment"])("fails safely instead of routing to an invalid backend origin (%s)", async value => {
    await expect(configuration(value)).rejects.toThrow(/Set BACKEND_ORIGIN/);
  });
});
