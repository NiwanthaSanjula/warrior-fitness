
import mongoose from "mongoose";
import { env } from "./env.js";

let connectionPromise: Promise<void> | undefined;

export function connectDatabase(): Promise<void> {
  // Concurrent cold-start requests share one connection attempt. Keep the pool
  // open for warm invocations, but allow a later request to retry a failed one.
  if (connectionPromise) return connectionPromise;
  if (mongoose.connection.readyState === 1) return Promise.resolve();

  connectionPromise = mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
  }).then(() => {
    console.log(`MongoDB connected: ${mongoose.connection.db?.databaseName ?? "unverified"}`);
  }).finally(() => {
    connectionPromise = undefined;
  });
  return connectionPromise;
}

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB connection lost");
});

mongoose.connection.on("error", () => {
  console.error("MongoDB connection failed. Verify database access and environment configuration.");
});
