
import { app } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { initializeFinancialModels } from "./modules/financial/financial.service.js";
import { initializeStaffAdministration } from "./modules/staff/staff.service.js";
import { initializeNotificationModels } from "./modules/notifications/notification.model.js";
import { startNotificationScheduler } from "./modules/notifications/notification.scheduler.js";

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    await initializeFinancialModels();
    await initializeStaffAdministration();
    await initializeNotificationModels();

    const server = app.listen(env.PORT, "127.0.0.1", () => {
      const scheduler = startNotificationScheduler();
      server.once("close", () => scheduler?.stop());
      console.log(
        `API running at http://localhost:${env.PORT}✅`
      );

      console.log(
        `Environment: ${env.NODE_ENV}`
      );
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

void startServer();
