// Vercel evaluates this configuration at build time. No VITE_ variable or
// browser-visible backend URL is needed; requests stay on the frontend origin.
const value = process.env.BACKEND_ORIGIN?.trim();
let backendOrigin: string;
try {
  if (!value) throw new Error();
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
  backendOrigin = url.origin;
} catch {
  throw new Error("Set BACKEND_ORIGIN to the deployed backend HTTPS origin, without /api, credentials, a query or fragment.");
}

export const config = {
  framework: "vite",
  installCommand: "npm ci --include=dev",
  buildCommand: "npm run build",
  outputDirectory: "dist",
  rewrites: [
    { source: "/api/:path*", destination: `${backendOrigin}/api/:path*` },
    { source: "/(.*)", destination: "/index.html" },
  ],
  headers: [{
    source: "/api/:path*",
    headers: [
      { key: "Cache-Control", value: "no-store" },
      { key: "CDN-Cache-Control", value: "no-store" },
      { key: "x-vercel-enable-rewrite-caching", value: "0" },
    ],
  }],
};
