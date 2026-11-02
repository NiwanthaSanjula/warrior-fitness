import { connectDatabase } from "./db.js";
import { initializeRetailModels } from "../modules/retail/retail.model.js";
import { initializeFinancialModels } from "../modules/financial/financial.service.js";
import { initializeStaffAdministration } from "../modules/staff/staff.service.js";
import { initializeNotificationModels } from "../modules/notifications/notification.model.js";
import { initializeEquipmentModels } from "../modules/equipment/equipment.model.js";

let initialization: Promise<void> | undefined;

export async function initializeApplication(): Promise<void> {
  await connectDatabase();
  // Existing unique indexes and financial safeguards must be ready before any
  // handler runs. Initialize once per worker; a failed attempt remains retryable.
  initialization ??= (async () => {
    await initializeRetailModels();
    await initializeFinancialModels();
    await initializeStaffAdministration();
    await initializeNotificationModels();
    await initializeEquipmentModels();
  })().catch(error => {
    initialization = undefined;
    throw error;
  });
  await initialization;
}
