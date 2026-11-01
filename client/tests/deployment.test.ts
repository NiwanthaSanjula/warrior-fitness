import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveApiBaseUrl } from "../src/api/api-url";

afterEach(() => vi.unstubAllEnvs());
describe("deployment API base URL", () => {
  it("keeps the existing local Vite proxy when no public URL is configured", () => {
    expect(resolveApiBaseUrl(undefined)).toBe("/api");
    expect(resolveApiBaseUrl("")).toBe("/api");
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
});
