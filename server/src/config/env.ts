
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
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
});

export const env = envSchema.parse(process.env);
