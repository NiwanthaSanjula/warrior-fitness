
import { app } from "./app.js";
import mongoose from "mongoose";
import { initializeApplication } from "./config/initialize.js";
import { env } from "./config/env.js";
import { startNotificationScheduler } from "./modules/notifications/notification.scheduler.js";

async function startServer(): Promise<void> {
  try {
    await initializeApplication();

    const host = env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
    const server = app.listen(env.PORT, host, () => {
      const scheduler = startNotificationScheduler();
      server.once("close", () => scheduler?.stop());
      console.log(
        `API listening on ${host}:${env.PORT}`
      );

      console.log(
        `Environment: ${env.NODE_ENV}`
      );
    });
    server.once("error", async (error: NodeJS.ErrnoException) => {
      console.error(error.code === "EADDRINUSE"
        ? `Port ${env.PORT} is already in use. Stop the existing Warrior Fitness backend before restarting.`
        : "API could not start. Check the configured port and local server access.");
      await mongoose.disconnect();
      process.exitCode = 1;
    });
  } catch {
    console.error("Server startup failed. Verify the database connection and required environment settings.");
    process.exit(1);
  }
}

void startServer();
