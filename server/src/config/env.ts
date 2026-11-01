
import "dotenv/config";
import { z } from "zod";

function isWebOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(5000),

  CLIENT_URL: z
    .string()
    .url()
    .refine(isWebOrigin, "CLIENT_URL must be an HTTP(S) origin without credentials, a path, query or fragment")
    .default("http://localhost:5173")
    .transform(value => new URL(value).origin),

  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required"),

  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters long"),

  NOTIFICATION_SCHEDULER_ENABLED: z.enum(["true", "false"])
    .default("false").transform(value => value === "true"),
  DEMO_PUBLIC_LOGIN_ENABLED: z.enum(["true", "false"])
    .default("false").transform(value => value === "true"),
}).superRefine((values, context) => {
  if (values.NODE_ENV === "production" && !values.CLIENT_URL.startsWith("https://")) {
    context.addIssue({ code: "custom", path: ["CLIENT_URL"], message: "Production CLIENT_URL must use HTTPS" });
  }
});

export const env = envSchema.parse(process.env);
