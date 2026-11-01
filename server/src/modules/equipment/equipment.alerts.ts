import type { Types } from "mongoose";
import { Equipment, EquipmentIncident } from "./equipment.model.js";
import { equipmentAccess, type EquipmentActor } from "./equipment.service.js";

// Read-only, bounded priority queue. Reuses the existing incident ledger without
// changing statuses, maintenance calculations or any financial records.
export async function getEquipmentAlerts(actor: EquipmentActor) {
  equipmentAccess(actor, ["equipment.manage"], true);
  type Alert = { _id: Types.ObjectId; equipment: Types.ObjectId; description: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; status: "OPEN" | "ACKNOWLEDGED"; reportedAt: Date; asset?: { name: string; assetId: string } };
  const records = await EquipmentIncident.aggregate<Alert>([
    { $match: { status: { $in: ["OPEN", "ACKNOWLEDGED"] } } },
    { $addFields: { priority: { $switch: { branches: [
      { case: { $eq: ["$severity", "CRITICAL"] }, then: 0 },
      { case: { $eq: ["$severity", "HIGH"] }, then: 1 },
      { case: { $eq: ["$severity", "MEDIUM"] }, then: 2 },
    ], default: 3 } } } },
    { $sort: { priority: 1, reportedAt: 1, _id: 1 } }, { $limit: 5 },
    { $lookup: { from: Equipment.collection.name, localField: "equipment", foreignField: "_id", as: "asset", pipeline: [{ $project: { name: 1, assetId: 1 } }] } },
    { $unwind: { path: "$asset", preserveNullAndEmptyArrays: true } },
    { $project: { equipment: 1, description: 1, severity: 1, status: 1, reportedAt: 1, asset: 1 } },
  ]);
  return { data: records.map(item => ({ id: String(item._id), equipmentId: String(item.equipment), equipmentName: item.asset?.name ?? "Equipment unavailable", assetId: item.asset?.assetId ?? null, description: item.description, severity: item.severity, status: item.status, reportedAt: item.reportedAt.toISOString() })) };
}
