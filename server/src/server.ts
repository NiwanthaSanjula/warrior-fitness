
import { app } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { initializeFinancialModels } from "./modules/financial/financial.service.js";
import { initializeStaffAdministration } from "./modules/staff/staff.service.js";
import { initializeNotificationModels } from "./modules/notifications/notification.model.js";
import { startNotificationScheduler } from "./modules/notifications/notification.scheduler.js";
import { initializeEquipmentModels } from "./modules/equipment/equipment.model.js";
import { initializeRetailModels } from "./modules/retail/retail.model.js";

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    await initializeRetailModels();
    await initializeFinancialModels();
    await initializeStaffAdministration();
    await initializeNotificationModels();
    await initializeEquipmentModels();

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
  } catch {
    console.error("Server startup failed. Verify the database connection and required environment settings.");
    process.exit(1);
  }
}

void startServer();
