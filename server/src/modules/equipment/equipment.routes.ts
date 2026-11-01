import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { AppError } from "../../utils/AppError.js";
import { equipmentHistory, getEquipment, listEquipment, listIncidents, listWorkOrders, maintenanceDashboard } from "./equipment.service.js";
import { assignWork, createEquipment, createWork, linkExpense, reportIncident, reviewIncident, setEquipmentStatus, transitionWork, updateEquipment } from "./equipment.mutations.js";
import { assignInput, createEquipmentSchema, equipmentId, expenseLinkInput, historyQuery, incidentInput, incidentQuery, inventoryQuery, maintenanceQuery, reviewInput, statusInput, updateEquipmentSchema, workActionInput, workInput, workQuery } from "./equipment.validation.js";
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) { const issue = result.error.issues[0]; throw new AppError(400, `${issue.path.join(".") || "Input"}: ${issue.message}`); }
  return result.data;
}
export const equipmentRouter = Router(); equipmentRouter.use(requireAuth);
const read = requirePermission("equipment.read"), manage = [requireRole("ADMIN"), requirePermission("equipment.manage")];
equipmentRouter.get("/", read, async (req, res) => res.json({ success: true, ...await listEquipment(req.staff!, parse(inventoryQuery, req.query)) }));
equipmentRouter.get("/maintenance", ...manage, async (req, res) => res.json({ success: true, ...await maintenanceDashboard(req.staff!, parse(maintenanceQuery, req.query)) }));
equipmentRouter.get("/work-orders", ...manage, async (req, res) => res.json({ success: true, ...await listWorkOrders(req.staff!, parse(workQuery, req.query)) }));
equipmentRouter.get("/incidents", ...manage, async (req, res) => res.json({ success: true, ...await listIncidents(req.staff!, parse(incidentQuery, req.query)) }));
equipmentRouter.get("/:id", read, async (req, res) => res.json({ success: true, equipment: await getEquipment(req.staff!, parse(equipmentId, req.params.id)) }));
equipmentRouter.get("/:id/history", read, async (req, res) => res.json({ success: true, ...await equipmentHistory(req.staff!, parse(equipmentId, req.params.id), parse(historyQuery, req.query)) }));
equipmentRouter.post("/", ...manage, async (req, res) => res.status(201).json({ success: true, equipment: await createEquipment(req.staff!, parse(createEquipmentSchema, req.body)) }));
equipmentRouter.put("/:id", ...manage, async (req, res) => res.json({ success: true, ...await updateEquipment(req.staff!, parse(equipmentId, req.params.id), parse(updateEquipmentSchema, req.body)) }));
equipmentRouter.patch("/:id/status", ...manage, async (req, res) => res.json({ success: true, ...await setEquipmentStatus(req.staff!, parse(equipmentId, req.params.id), parse(statusInput, req.body)) }));
equipmentRouter.post("/:id/incidents", read, requirePermission("equipment.report"), async (req, res) => res.status(201).json({ success: true, ...await reportIncident(req.staff!, parse(equipmentId, req.params.id), parse(incidentInput, req.body)) }));
equipmentRouter.patch("/:id/incidents/:incidentId", ...manage, async (req, res) => res.json({ success: true, ...await reviewIncident(req.staff!, parse(equipmentId, req.params.id), parse(equipmentId, req.params.incidentId), parse(reviewInput, req.body)) }));
equipmentRouter.post("/:id/work-orders", ...manage, async (req, res) => res.status(201).json({ success: true, ...await createWork(req.staff!, parse(equipmentId, req.params.id), parse(workInput, req.body)) }));
equipmentRouter.patch("/:id/work-orders/:workId/assignment", ...manage, async (req, res) => res.json({ success: true, ...await assignWork(req.staff!, parse(equipmentId, req.params.id), parse(equipmentId, req.params.workId), parse(assignInput, req.body)) }));
equipmentRouter.post("/:id/work-orders/:workId/transition", ...manage, async (req, res) => res.json({ success: true, ...await transitionWork(req.staff!, parse(equipmentId, req.params.id), parse(equipmentId, req.params.workId), parse(workActionInput, req.body)) }));
equipmentRouter.post("/:id/work-orders/:workId/expenses", ...manage, requirePermission("expenses.manage"), async (req, res) => {
  const input = parse(expenseLinkInput, req.body);
  res.json({ success: true, ...await linkExpense(req.staff!, parse(equipmentId, req.params.id), parse(equipmentId, req.params.workId), input.expenseId, input.version) });
});
