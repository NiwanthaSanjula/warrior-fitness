
import "dotenv/config";
import { z } from "zod";

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
    .default("http://localhost:5173"),

  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required"),

  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters long"),

  NOTIFICATION_SCHEDULER_ENABLED: z.enum(["true", "false"])
    .default("false").transform(value => value === "true"),
});

export const env = envSchema.parse(process.env);
