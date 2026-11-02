// Vite replaces this public URL at build time. No credentials belong in it.
export function resolveApiBaseUrl(value: string | undefined, production = false): string {
  if (!value?.trim() || value.trim() === "/api") return "/api";
  try {
    const url = new URL(value.trim());
    const pathname = url.pathname.replace(/\/+$/, "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || pathname !== "/api" || (production && url.protocol !== "https:")) throw new Error();
    return `${url.origin}${pathname}`;
  } catch {
    // Never include the supplied value or a URL parser error in logs.
    throw new Error("VITE_API_BASE_URL must be an HTTPS API URL ending in /api. HTTP is supported only for local development.");
  }
}
