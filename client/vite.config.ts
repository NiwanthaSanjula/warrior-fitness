
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolveApiBaseUrl } from "./src/api/api-url.ts";

export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, process.cwd(), "VITE_");
  const baseUrl = resolveApiBaseUrl(values.VITE_API_BASE_URL, mode === "production");
  if (process.env.VERCEL === "1" && mode === "production" && baseUrl === "/api") {
    throw new Error("Set VITE_API_BASE_URL to the deployed HTTPS backend URL ending in /api before deploying to Vercel.");
  }
  return {
  plugins: [react(), tailwindcss()],

  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  };
});
