import { useRef } from "react";
import { equipmentApi } from "../../api/equipment.api";
import type { EquipmentItem, EquipmentResponse } from "../../types/equipment";
import { equipmentCategories, equipmentStatuses } from "../../types/equipment";
import { assetIdSchema, equipmentProfileSchema, faultSchema, workSchema } from "../../validations/equipment.schema";
import { todayInColombo } from "../../utils/dashboard";
import { EquipmentField, EquipmentNotes, EquipmentOperation, equipmentButton, equipmentInput } from "./EquipmentUI";
import { formNumber, formText } from "../../utils/equipment";

export function EquipmentForm({ item, saved }: { item?: EquipmentItem; saved: (response: EquipmentResponse) => void }) {
  return <EquipmentOperation name={item ? "Edit equipment" : "Register equipment"} confirmation={item ? "Save these inventory and service schedule changes?" : undefined} submit={async data => {
    const fields = equipmentProfileSchema.parse({ name: formText(data, "name"), category: formText(data, "category"), brand: formText(data, "brand"), model: formText(data, "model"), serialNumber: formText(data, "serialNumber"), location: formText(data, "location"), purchaseDate: formText(data, "purchaseDate") || null, purchasePriceLkr: formNumber(data, "purchasePriceLkr"), warrantyExpiry: formText(data, "warrantyExpiry") || null, intervalDays: formNumber(data, "intervalDays"), nextServiceDate: formText(data, "nextServiceDate") || null });
    saved(item ? await equipmentApi.update(item, fields) : await equipmentApi.create({ ...fields, assetId: assetIdSchema.parse(formText(data, "assetId")) }));
  }}>{busy => <><div className="grid gap-4 sm:grid-cols-2">
    {!item && <EquipmentField label="Asset ID" name="assetId" required maxLength={40} />}<EquipmentField label="Equipment name" name="name" value={item?.name} required maxLength={120} />
    <label className="text-sm">Category<select name="category" defaultValue={item?.category ?? "CARDIO"} className={equipmentInput}>{Object.entries(equipmentCategories).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
    <EquipmentField label="Location / section" name="location" value={item?.location} required maxLength={100} />
    <EquipmentField label="Brand" name="brand" value={item?.brand} maxLength={100} /><EquipmentField label="Model" name="model" value={item?.model} maxLength={100} /><EquipmentField label="Serial number" name="serialNumber" value={item?.serialNumber} maxLength={120} />
    <EquipmentField label="Purchase date" name="purchaseDate" type="date" value={item?.purchaseDate} max={todayInColombo()} /><EquipmentField label="Purchase price (LKR)" name="purchasePriceLkr" type="number" min={0} max={1000000000} value={item?.purchasePriceLkr} />
    <EquipmentField label="Warranty expiry" name="warrantyExpiry" type="date" value={item?.warrantyExpiry} />
    <EquipmentField label="Preventive interval (days)" name="intervalDays" type="number" min={1} max={3650} value={item?.intervalDays} /><EquipmentField label="Next service date" name="nextServiceDate" type="date" value={item?.nextServiceDate} />
  </div><p className="text-xs leading-6 text-gym-muted">Asset IDs are unique and permanent. Purchase price is inventory metadata; registering equipment does not create a Finance expense. A recurring interval needs an initial next service date.</p><button className={equipmentButton}>{busy ? "Saving…" : item ? "Save equipment" : "Register equipment"}</button></>}</EquipmentOperation>;
}
export function FaultForm({ item, done }: { item: EquipmentItem; done: () => void }) {
  const key = useRef(crypto.randomUUID());
  return <EquipmentOperation name="Report equipment fault" done={done} submit={async data => {
    const fields = faultSchema.parse({ description: formText(data, "description"), severity: formText(data, "severity") });
    await equipmentApi.report(item, { ...fields, requestId: key.current });
  }}>{busy => <><EquipmentNotes label="Problem description" name="description" minLength={10} /><label className="block text-sm">Severity<select name="severity" className={equipmentInput}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(value => <option key={value}>{value}</option>)}</select></label><p className="text-xs leading-6 text-gym-muted">The report preserves the reporter and time. An Admin reviews availability and maintenance assignment.</p><button className={equipmentButton}>{busy ? "Reporting…" : "Submit fault report"}</button></>}</EquipmentOperation>;
}
export function AvailabilityForm({ item, done }: { item: EquipmentItem; done: () => void }) {
  return <EquipmentOperation name="Change equipment availability" done={done} confirmation="Apply this equipment status change? Retirement is permanent. History will be preserved." submit={async data => {
    const status = formText(data, "status") as EquipmentItem["status"], reason = formText(data, "reason");
    if (reason.length < 5) throw new Error("Supply an availability reason");
    return equipmentApi.status(item, status, reason);
  }}>{busy => <><label className="block text-sm">New status<select name="status" className={equipmentInput}>{Object.entries(equipmentStatuses).filter(([key]) => key !== item.status).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><EquipmentNotes label="Reason for status change" name="reason" /><p className="text-xs leading-6 text-gym-muted">Active work and unresolved critical faults block return to service. Complete or cancel work before retirement. Unavailable periods are recorded automatically.</p><button className={equipmentButton}>{busy ? "Applying…" : "Apply status change"}</button></>}</EquipmentOperation>;
}
export function WorkOrderForm({ item, incidentId = null, done }: { item: EquipmentItem; incidentId?: string | null; done: () => void }) {
  return <EquipmentOperation name="Create maintenance work order" done={done} submit={async data => {
    return equipmentApi.createWork(item, workSchema.parse({ title: formText(data, "title"), kind: formText(data, "kind"), plannedDate: formText(data, "plannedDate"), incidentId,
      technician: formText(data, "technician"), provider: formText(data, "provider"), contact: formText(data, "contact"), estimatedCostLkr: formNumber(data, "estimatedCostLkr"), notes: formText(data, "notes") }));
  }}>{busy => <><EquipmentField label="Work order title" name="title" required />
    <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Maintenance type<select name="kind" className={equipmentInput} defaultValue={incidentId ? "REPAIR" : "PREVENTIVE"}><option value="PREVENTIVE">Preventive</option><option value="REPAIR">Repair</option></select></label><EquipmentField label="Planned service date" name="plannedDate" type="date" value={todayInColombo()} required /><EquipmentField label="Technician" name="technician" /><EquipmentField label="Service provider" name="provider" /><EquipmentField label="Provider contact" name="contact" /><EquipmentField label="Estimated repair cost (LKR)" name="estimatedCostLkr" type="number" min={0} max={100000000} /></div>
    <EquipmentNotes label="Work instructions" name="notes" required={false} minLength={0} maxLength={2000} />{incidentId && <p className="text-xs text-orange-300">Linked to the selected breakdown report.</p>}
    <p className="text-xs leading-6 text-gym-muted">Estimates are planning values, not recorded expenses. Assign a technician or provider before starting. Starting work records downtime and marks the equipment under maintenance.</p><button className={equipmentButton}>{busy ? "Creating…" : "Create work order"}</button></>}</EquipmentOperation>;
}
