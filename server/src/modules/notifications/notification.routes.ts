import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { AppError } from "../../utils/AppError.js";
import { getConsent, getNotificationOverview, saveConsent, simulateDueReminders } from "./notification.service.js";

export const notificationRouter = Router();
notificationRouter.use(requireAuth, requireRole("ADMIN"), requirePermission("settings.manage"));
const id = z.string().regex(/^[a-f\d]{24}$/i).toLowerCase();
const consentInput = z.strictObject({ memberId: id, whatsappOptIn: z.boolean(), confirmedOptIn: z.boolean().optional() })
  .refine(input => !input.whatsappOptIn || input.confirmedOptIn === true, "Explicit opt-in confirmation is required");
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError(400, "Invalid notification request or missing explicit opt-in confirmation");
  return parsed.data;
}
notificationRouter.get("/overview", async (_req, res) => res.json(await getNotificationOverview()));
notificationRouter.get("/consent/:memberId", async (req, res) => res.json(await getConsent(parse(id, req.params.memberId))));
notificationRouter.put("/consent", async (req, res) => {
  const input = parse(consentInput, req.body);
  res.json(await saveConsent(input.memberId, input.whatsappOptIn, req.staff!.id));
});
notificationRouter.post("/simulate-due", async (req, res) => {
  parse(z.strictObject({}), req.body ?? {});
  res.json({ success: true, ...await simulateDueReminders(req.staff!.id) });
});
