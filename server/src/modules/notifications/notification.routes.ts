import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { Member } from "../members/member.model.js";
import { todayInColombo } from "../memberships/membership.dates.js";
import { NotificationConsent, ReminderLog } from "./notification.model.js";
import { findDueReminders, simulateDueReminders } from "./notification.service.js";

export const notificationRouter = Router();
notificationRouter.use(requireAuth, requireRole("ADMIN"), requirePermission("settings.manage"));

const id = z.string().regex(/^[a-f\d]{24}$/i);
const consentInput = z.strictObject({ memberId: id, whatsappOptIn: z.boolean() });
notificationRouter.get("/overview", async (_req, res) => {
  const [due, recent, simulatedToday] = await Promise.all([
    findDueReminders(),
    ReminderLog.find().sort({ createdAt: -1 }).limit(50).lean(),
    ReminderLog.countDocuments({ scheduledDate: todayInColombo() }),
  ]);
  res.json({ success: true, asOfDate: todayInColombo(), due, simulatedToday, recent, deliveryMode: "SIMULATION_ONLY" });
});
notificationRouter.get("/consent/:memberId", async (req, res) => {
  const parsed = id.safeParse(req.params.memberId);
  if (!parsed.success) { res.status(400).json({ success: false, message: "Invalid member ID" }); return; }
  const member = await Member.findById(parsed.data);
  if (!member) { res.status(404).json({ success: false, message: "Member not found" }); return; }
  const consent = await NotificationConsent.findOne({ member: parsed.data });
  res.json({ success: true, memberId: parsed.data, memberName: member.fullName, whatsappOptIn: consent?.whatsappOptIn ?? false });
});
notificationRouter.put("/consent", async (req, res) => {
  const parsed = consentInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, message: "Invalid consent details" }); return; }
  if (!(await Member.exists({ _id: parsed.data.memberId }))) { res.status(404).json({ success: false, message: "Member not found" }); return; }
  await NotificationConsent.updateOne(
    { member: parsed.data.memberId },
    { $set: { whatsappOptIn: parsed.data.whatsappOptIn, updatedBy: req.staff!.id } },
    { upsert: true },
  );
  res.json({ success: true, memberId: parsed.data.memberId, whatsappOptIn: parsed.data.whatsappOptIn });
});
notificationRouter.post("/simulate-due", async (req, res) => {
  const result = await simulateDueReminders(req.staff!.id);
  res.json({ success: true, ...result, deliveryMode: "SIMULATION_ONLY" });
});
