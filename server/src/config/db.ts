
import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log("MongoDB connected successfully");
}

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB connection lost");
});

mongoose.connection.on("error", (error) => {
  console.error("MongoDB connection error:", error.message);
});
