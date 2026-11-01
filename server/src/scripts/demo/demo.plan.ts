import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { addDays, calculateEndDateExclusive, todayInColombo } from "../../modules/memberships/membership.dates.js";
import { duePeriod, reminderMessage } from "../../modules/notifications/notification.eligibility.js";
import type { PaymentMethod } from "../../modules/billing/payment.model.js";
import type { DayTotals } from "../../modules/financial/cash-closing.model.js";
import type { ExpenseInput } from "../../modules/financial/financial.validation.js";
import type { RetailActor } from "../../modules/retail/retail.service.js";
import { RECEPTIONIST_PERMISSIONS } from "../../modules/auth/permissions.js";
import { DEMO_NAMESPACE, DemoError } from "./demo.config.js";

export const demoId = (key: string) => createHash("sha256").update(`${DEMO_NAMESPACE}:${key}`).digest("hex").slice(0, 24);
export function demoUuid(key: string) {
  const hex = createHash("sha256").update(`${DEMO_NAMESPACE}:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4"; hex[16] = "8";
  const value = hex.join(""); return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
export type Counts = Record<string, number>;
export type SeedModel = "Staff" | "MembershipPlan" | "Member" | "Attendance" | "AttentionFollowUp" | "NotificationConsent" | "ReminderLog" | "NotificationRun" | "Equipment" | "EquipmentIncident" | "MaintenanceWork" | "EquipmentDowntime" | "EquipmentEvent" | "StaffAudit";
export interface SeedDocument { model: SeedModel; value: Record<string, unknown> & { _id: string } }
export interface Purchase {
  id: string; memberId: string; planId: string; planSnapshot: { code: string; name: string; durationUnit: "DAYS" | "MONTHS"; durationCount: number; priceLkr: number };
  enrollmentType: "INITIAL" | "RENEWAL"; renewalRequestId?: string; startDate: string; endDateExclusive: string; issuedAt: string;
}
export interface DemoProduct { name: string; sku: string; barcode: string; category: "SUPPLEMENTS" | "BEVERAGES" | "SNACKS" | "ACCESSORIES" | "MERCHANDISE" | "OTHER"; sellingPriceLkr: number; initialStock: number; lowStockThreshold: number; supplierName: string; supplierContact: string; isActive: boolean; targetStock: number }
type Payloads = {
  document: SeedDocument;
  purchase: Purchase;
  product: DemoProduct & { recordedAt: string };
  payment: { membershipId: string; requestId: string; amountLkr: number; method: PaymentMethod; receivedAt: string };
  sale: { requestId: string; items: { sku: string; quantity: number; expectedUnitPriceLkr: number }[]; expectedTotalLkr: number; method: PaymentMethod; cashTenderedLkr: number | null; memberId: string | null; cashierId: string; soldAt: string };
  stock: { sku: string; requestId: string; kind: "RESTOCK" | "ADJUSTMENT"; change: number; reason: string; recordedAt: string };
  expense: ExpenseInput;
  expenseLink: { id: string; equipmentId: string; workId: string; expenseRequestId: string; linkedAt: string };
  closing: { requestId: string; date: string; openingCashLkr: number; actualCashLkr: number; explanation: string; expectedTotals: DayTotals };
};
export type DemoOperation = { [K in keyof Payloads]: { kind: K; key: string; effects: Counts; data: Payloads[K] } }[keyof Payloads];
export interface DemoPlan {
  namespace: string; asOf: string; anchoredAt: string; from: string; dates: string[]; operations: DemoOperation[];
  counts: Counts; days: Record<string, DayTotals>; purchases: Purchase[]; products: DemoProduct[]; actors: RetailActor[]; hash: string;
}
const FIRST = ["Kasun", "Nimali", "Tharindu", "Sanduni", "Dinesh", "Ishara", "Nuwan", "Dilini", "Chamath", "Hiruni", "Lahiru", "Sachini", "Roshan", "Pavithra", "Ravindu", "Anushka", "Sahan", "Kavindi", "Dinuka", "Madushi"];
const LAST = ["Perera", "Silva", "Fernando", "Jayasinghe", "Wickramasinghe", "Gunawardena", "Dissanayake", "Bandara", "Senanayake", "Herath", "Samarasinghe", "Wijesinghe", "Amarasinghe", "Ratnayake", "Abeysekera", "Pathirana", "Karunaratne", "Ekanayake", "Gamage", "Liyanage"];
const METHODS: PaymentMethod[] = ["CASH", "CARD", "BANK_TRANSFER"];
const money = () => ({ CASH: 0, CARD: 0, BANK_TRANSFER: 0 });
const dayTotals = (): DayTotals => ({ collections: money(), membershipCollections: money(), retailCollections: money(), expenses: money(), paymentCount: 0, retailSaleCount: 0, expenseCount: 0 });

export function buildDemoPlan(anchor = new Date()): DemoPlan {
  if (!Number.isFinite(anchor.getTime())) throw new DemoError("Invalid demo anchor time.");
  const asOf = todayInColombo(anchor), dates = Array.from({ length: 14 }, (_, index) => addDays(asOf, index - 13));
  if (dates[0] < "2007-01-01") throw new DemoError("Demo dates must be in the modern Colombo calendar era.");
  // Today's fictional events never lie in the future, including before gym
  // opening time. The first run's exact cutoff is persisted for deterministic retries.
  const at = (date: string, hour = 9, minute = 0) => new Date(Math.min(Date.parse(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`), anchor.getTime())).toISOString();
  const adminId = demoId("staff-admin"), recId = demoId("staff-reception"), limitedId = demoId("staff-limited");
  const actors: RetailActor[] = [
    { id: adminId, fullName: "Demo Administrator", role: "ADMIN", permissions: [] },
    { id: recId, fullName: "Demo Receptionist", role: "RECEPTIONIST", permissions: [...RECEPTIONIST_PERMISSIONS] },
    { id: limitedId, fullName: "Demo Check-in Desk", role: "RECEPTIONIST", permissions: ["attendance.read", "attendance.check-in", "members.read", "retail.read", "retail.checkout", "retail.sales.read"] },
  ];
  const operations: DemoOperation[] = [], counts: Counts = {}, days = Object.fromEntries(dates.map(date => [date, dayTotals()]));
  const push = <K extends keyof Payloads>(kind: K, key: string, effects: Counts, data: Payloads[K]) => {
    operations.push({ kind, key, effects, data } as DemoOperation);
    for (const [module, count] of Object.entries(effects)) counts[module] = (counts[module] ?? 0) + count;
  };
  const document = (model: SeedModel, key: string, module: string, fields: Record<string, unknown>) => push("document", key, { [module]: 1 }, { model, value: { _id: demoId(key), ...fields } });
  actors.forEach((actor, index) => document("Staff", `staff-${["admin", "reception", "limited"][index]}`, "staff", { fullName: actor.fullName, email: ["admin", "reception", "desk"][index] + "@warrior-demo.example", role: actor.role, isActive: true, sessionVersion: 0, createdAt: at(addDays(asOf, -65)), updatedAt: at(addDays(asOf, -65)), ...(index === 2 ? { permissions: actor.permissions } : {}) }));
  const registeredAt = at(addDays(asOf, -65));
  actors.slice(1).forEach(actor => document("StaffAudit", `staff-audit-${actor.id}`, "staffAudit", { actor: adminId, actorName: actors[0].fullName, target: actor.id, targetName: actor.fullName, action: "STAFF_CREATED", createdAt: registeredAt }));
  const plans = [
    { code: "WF-DEMO-WEEK", name: "Demo Weekly Access", durationUnit: "DAYS" as const, durationCount: 7, priceLkr: 1500 },
    { code: "WF-DEMO-FORTNIGHT", name: "Demo Fortnight Access", durationUnit: "DAYS" as const, durationCount: 14, priceLkr: 2500 },
    { code: "WF-DEMO-MONTH", name: "Demo 30 Day Access", durationUnit: "DAYS" as const, durationCount: 30, priceLkr: 4500 },
    { code: "WF-DEMO-QUARTER", name: "Demo Quarterly Access", durationUnit: "MONTHS" as const, durationCount: 3, priceLkr: 12000 },
    { code: "WF-DEMO-YEAR", name: "Demo Annual Access", durationUnit: "MONTHS" as const, durationCount: 12, priceLkr: 42000 },
  ];
  plans.forEach((plan, index) => document("MembershipPlan", `plan-${index}`, "plans", { ...plan, description: "Fictional portfolio/demo plan. No real member contract.", isActive: true, createdBy: adminId, createdAt: registeredAt, updatedAt: registeredAt }));
  const members = Array.from({ length: 60 }, (_, index) => ({ index, id: demoId(`member-${index}`), memberId: `WF-DEMO-${String(index + 1).padStart(3, "0")}`, fullName: `${FIRST[index % 20]} ${LAST[(index * 7 + Math.floor(index / 20)) % 20]}`, phone: `000000${String(index + 1).padStart(4, "0")}`, isActive: index < 44 || index >= 50 }));
  members.forEach(member => document("Member", `member-${member.index}`, "members", { memberId: member.memberId, fullName: member.fullName, normalizedFullName: member.fullName.toLowerCase(), phone: member.phone, gender: member.index % 2 ? "FEMALE" : "MALE", address: `Demo Lane ${member.index + 1}, Fictional Colombo address`, joinedAt: registeredAt, isActive: member.isActive, createdBy: adminId, createdAt: registeredAt, updatedAt: registeredAt }));
  const purchases: Purchase[] = [];
  function purchase(member: typeof members[number], planIndex: number, startDate: string, renewal = false, issuedOn = startDate) {
    const index = purchases.length, snapshot = plans[planIndex];
    const item: Purchase = { id: demoId(`purchase-${index}`), memberId: member.id, planId: demoId(`plan-${planIndex}`), planSnapshot: snapshot, enrollmentType: renewal ? "RENEWAL" : "INITIAL", ...(renewal ? { renewalRequestId: demoUuid(`renewal-${member.index}`) } : {}), startDate, endDateExclusive: calculateEndDateExclusive(startDate, snapshot.durationUnit, snapshot.durationCount), issuedAt: at(issuedOn, 6) };
    purchases.push(item); push("purchase", `purchase-${index}`, { memberships: 1, invoices: 1 }, item); return item;
  }
  for (const member of members) {
    const i = member.index;
    if (i < 24) purchase(member, i % 5, addDays(asOf, -(i % 5 === 0 ? 3 : i % 5 === 1 ? 10 : 21)));
    else if (i < 36) purchase(member, 2, addDays(asOf, [0, 1, 2, 3, 5, 7][(i - 24) % 6] + 1 - 30));
    else if (i < 50) purchase(member, 2, addDays(asOf, -31 - (i - 36)));
    else {
      const early = i >= 56, initial = purchase(member, 2, addDays(asOf, early ? -26 + (i % 3) : -48 + (i % 3)));
      purchase(member, 2, initial.endDateExclusive, true, early ? addDays(asOf, -1) : addDays(initial.endDateExclusive, -2));
    }
  }
  // Money/stock events are sorted together before any closing is created.
  const events: { instant: string; op: DemoOperation }[] = [];
  function event<K extends keyof Payloads>(instant: string, kind: K, key: string, effects: Counts, data: Payloads[K]) { events.push({ instant, op: { kind, key, effects, data } as DemoOperation }); }
  purchases.forEach((item, index) => {
    const mode = index % 5;
    if (!mode) return; // deliberately unpaid, including overdue balances
    const paid = mode === 1 ? Math.floor(item.planSnapshot.priceLkr / 2) : item.planSnapshot.priceLkr;
    const date = [dates[index % 14], todayInColombo(new Date(item.issuedAt))].sort().at(-1)!;
    const method = METHODS[index % 3], amountLkr = paid;
    const receivedAt = at(date, 9, index % 50);
    event(receivedAt, "payment", `payment-${index}`, { payments: 1 }, { membershipId: item.id, requestId: demoUuid(`payment-${index}`), amountLkr, method, receivedAt });
    days[date].membershipCollections![method] += amountLkr; days[date].collections[method] += amountLkr; days[date].paymentCount++;
  });
  const catalog: [string, DemoProduct["category"], number][] = [
    ["Whey protein single serving", "SUPPLEMENTS", 950], ["Isotonic sports drink", "BEVERAGES", 450], ["Mineral water 500 ml", "BEVERAGES", 150], ["Chocolate protein bar", "SNACKS", 600], ["Banana oat energy bar", "SNACKS", 350], ["Electrolyte sachet", "SUPPLEMENTS", 300], ["Shaker bottle", "ACCESSORIES", 1800], ["Gym towel", "MERCHANDISE", 1200], ["Resistance loop band", "ACCESSORIES", 1500], ["Lifting straps", "ACCESSORIES", 2400], ["Black gym T-shirt", "MERCHANDISE", 3200], ["Training gloves", "ACCESSORIES", 2800], ["Peanut snack pack", "SNACKS", 250], ["Cold brew coffee", "BEVERAGES", 550], ["Creatine travel pack", "SUPPLEMENTS", 2200], ["Foam roller", "ACCESSORIES", 4500], ["Key tag", "OTHER", 200], ["Reusable water bottle", "MERCHANDISE", 2200], ["Fruit juice carton", "BEVERAGES", 300], ["Skipping rope", "ACCESSORIES", 1800],
  ];
  const products: DemoProduct[] = catalog.map(([name, category, sellingPriceLkr], i) => ({ name: `Demo ${name}`, sku: `WF-DEMO-SKU-${String(i + 1).padStart(3, "0")}`, barcode: `WFDEMO${String(i + 1).padStart(6, "0")}`, category, sellingPriceLkr, initialStock: 0, lowStockThreshold: 5, supplierName: "Fictional Demo Wholesale", supplierContact: "supplier@warrior-demo.example", isActive: true, targetStock: i < 2 ? 0 : i < 6 ? [2, 3, 1, 5][i - 2] : 12 + (i % 5) * 4 }));
  const sold = products.map(() => 0);
  dates.forEach((date, day) => {
    for (let index = 0; index < 3 + [0, 1, 3, 2, 4, 2, 1][day % 7]; index++) {
      const productIndices = [(day * 3 + index) % 20, (day * 3 + index + 7) % 20];
      const items = productIndices.map((i, line) => { const quantity = line ? 1 : 1 + (index % 2); sold[i] += quantity; return { sku: products[i].sku, quantity, expectedUnitPriceLkr: products[i].sellingPriceLkr }; });
      const expectedTotalLkr = items.reduce((sum, item) => sum + item.quantity * item.expectedUnitPriceLkr, 0), method = METHODS[(day + index) % 3], soldAt = at(date, 10 + index, index * 7);
      event(soldAt, "sale", `sale-${date}-${index}`, { retailSales: 1, stockMovements: items.length }, { requestId: demoUuid(`sale-${date}-${index}`), items, expectedTotalLkr, method, cashTenderedLkr: method === "CASH" ? Math.ceil(expectedTotalLkr / 500) * 500 : null, memberId: index % 2 ? null : members[(day + index) % 24].id, cashierId: actors[1 + index % 2].id, soldAt });
      days[date].retailCollections![method] += expectedTotalLkr; days[date].collections[method] += expectedTotalLkr; days[date].retailSaleCount!++;
    }
    const categories: ExpenseInput["category"][] = ["RENT", "ELECTRICITY", "WATER", "SALARIES", "EQUIPMENT", "MAINTENANCE", "SUPPLIES", "OTHER"];
    const category = categories[day % 8], amountLkr = [60000, 4500, 1800, 25000, 6500, 3500, 1500, 800][day % 8];
    const method: PaymentMethod = ["RENT", "SALARIES", "EQUIPMENT"].includes(category) ? "BANK_TRANSFER" : METHODS[day % 3];
    event(at(date, 12), "expense", `expense-${day}`, { expenses: 1 }, { requestId: demoUuid(`expense-${day}`), category, description: `Demo ${category.toLowerCase()} operating expense — fictional`, amountLkr, method, expenseDate: date, reference: `WF-DEMO-EXP-${day + 1}` });
    days[date].expenses[method] += amountLkr; days[date].expenseCount++;
  });
  products.forEach((item, index) => {
    const restock = index >= 6 ? 3 : 0, adjustment = index === 19 ? -1 : 0;
    item.initialStock = sold[index] + item.targetStock - restock - adjustment;
    const { targetStock: _target, ...input } = item;
    push("product", item.sku, { retailProducts: 1, stockMovements: 1 }, { ...input, targetStock: item.targetStock, recordedAt: at(addDays(dates[0], -1), 6) });
    if (restock) event(at(dates[7], 8), "stock", `restock-${index}`, { stockMovements: 1 }, { sku: item.sku, requestId: demoUuid(`restock-${index}`), kind: "RESTOCK", change: restock, reason: "Demo fictional supplier delivery; no automatic Finance expense", recordedAt: at(dates[7], 8) });
    if (adjustment) event(at(dates[11], 18), "stock", `adjust-${index}`, { stockMovements: 1 }, { sku: item.sku, requestId: demoUuid(`adjust-${index}`), kind: "ADJUSTMENT", change: adjustment, reason: "Demo stock count correction for a fictional damaged package", recordedAt: at(dates[11], 18) });
  });
  events.sort((a, b) => a.instant.localeCompare(b.instant) || a.op.key.localeCompare(b.op.key));
  events.forEach(({ op }) => { operations.push(op); for (const [module, count] of Object.entries(op.effects)) counts[module] = (counts[module] ?? 0) + count; });
  dates.forEach((date, day) => members.forEach(member => {
    if (!member.isActive || (member.index >= 16 && member.index <= 19) || (member.index * 7 + day * 3) % 10 >= [5, 6, 4, 7, 6, 5, 3][day % 7]) return;
    const coverage = purchases.find(item => item.memberId === member.id && item.startDate <= date && date < item.endDateExclusive);
    if (coverage) document("Attendance", `attendance-${date}-${member.index}`, "attendance", { member: member.id, membership: coverage.id, attendanceDate: date, checkedInAt: at(date, 7 + member.index % 12, member.index % 55), checkedInBy: recId, createdAt: at(date, 7 + member.index % 12, member.index % 55), updatedAt: at(date, 7 + member.index % 12, member.index % 55) });
  }));
  members.filter(member => member.index >= 24 && member.index < 36 || member.index >= 16 && member.index <= 19 || member.index < 12 && member.index % 5 <= 1).forEach(member => {
    const alertType = member.index >= 24 ? "MEMBERSHIP_EXPIRING" : member.index >= 16 ? "ATTENDANCE_INACTIVE" : "PAYMENT_OUTSTANDING";
    document("AttentionFollowUp", `follow-up-${member.index}`, "followUps", { requestId: demoUuid(`follow-up-${member.index}`), member: member.id, alertType, method: "INTERNAL_REVIEW", outcome: "FOLLOW_UP_REQUIRED", notes: "Demo internal review only; no real member was contacted. Assist with the next visit.", nextFollowUpDate: addDays(asOf, member.index % 3 - 1), handledBy: recId, recordedAt: at(addDays(asOf, -2), 11), createdAt: at(addDays(asOf, -2), 11), updatedAt: at(addDays(asOf, -2), 11) });
  });
  members.forEach(member => document("NotificationConsent", `consent-${member.index}`, "consents", { member: member.id, whatsappOptIn: member.index % 3 !== 1, updatedBy: adminId, createdAt: registeredAt, updatedAt: registeredAt }));
  dates.forEach(date => members.filter(member => member.isActive && member.index % 3 !== 1).forEach(member => {
    const periods = purchases.filter(item => item.memberId === member.id && item.issuedAt <= at(date, 9)).map(item => ({ _id: new Types.ObjectId(item.id), member: new Types.ObjectId(item.memberId), planSnapshot: item.planSnapshot, startDate: item.startDate, endDateExclusive: item.endDateExclusive }));
    const due = duePeriod(periods, date); if (!due) return;
    document("ReminderLog", `reminder-${due.period._id}-${due.reminderType}-${date}`, "simulatedReminders", { member: member.id, membership: String(due.period._id), memberReference: member.memberId, memberName: member.fullName, recipient: member.phone, planName: due.period.planSnapshot.name, lastValidDate: due.lastValidDate, reminderType: due.reminderType, scheduledDate: date, message: reminderMessage(member.fullName, due.period.planSnapshot.name, due.lastValidDate), channel: "WHATSAPP_SIMULATED", status: "SIMULATED", createdBy: adminId, trigger: "MANUAL", createdAt: at(date, 9) });
  }));
  // A recorded synthetic failure makes the failure/status UI explorable without
  // executing a scheduler or attempting delivery. Every record is labelled demo.
  document("NotificationRun", "notification-run-example", "automationRuns", { scheduledDate: addDays(asOf, -1), status: "FAILED", startedAt: at(addDays(asOf, -1), 9), completedAt: at(addDays(asOf, -1), 9, 1), summary: null, failureCode: "SIMULATION_FAILED" });
  const equipmentNames = ["Treadmill A", "Cable crossover", "Rowing machine", "Exercise bike", "Leg press", "Bench press", "Smith machine", "Elliptical", "Adjustable bench", "Lat pulldown", "Battle ropes", "Dumbbell rack"];
  equipmentNames.forEach((name, index) => {
    const id = demoId(`equipment-${index}`), unavailable = index < 2, profile = { assetId: `WF-DEMO-ASSET-${String(index + 1).padStart(3, "0")}`, name: `Demo ${name}`, category: index < 4 || index === 7 ? "CARDIO" : index === 10 ? "FUNCTIONAL" : "STRENGTH", brand: "Demo Training Co", model: "Portfolio series", serialNumber: `DEMO-ONLY-${index + 1}`, location: index < 4 ? "Cardio zone" : "Strength floor", purchaseDate: addDays(asOf, -365), purchasePriceLkr: 85000 + index * 15000, warrantyExpiry: addDays(asOf, 180), status: index === 0 ? "OUT_OF_SERVICE" : index === 1 ? "UNDER_MAINTENANCE" : "OPERATIONAL", intervalDays: 30, nextServiceDate: addDays(asOf, [-3, -1, 4, 20, -2, 0, 2, 4, 7, 10, 15, 25][index]), version: 0, createdBy: adminId, createdAt: registeredAt, updatedAt: registeredAt };
    document("Equipment", `equipment-${index}`, "equipment", profile);
    document("EquipmentEvent", `equipment-event-${index}`, "equipmentHistory", { equipment: id, actor: adminId, actorName: actors[0].fullName, action: "EQUIPMENT_REGISTERED", notes: "Fictional demo equipment/history snapshot", recordedAt: registeredAt });
    if (index >= 4) return;
    const incidentId = demoId(`incident-${index}`), completed = index === 3, reportedAt = at(addDays(asOf, index === 3 ? -8 : -3));
    document("EquipmentIncident", `incident-${index}`, "breakdowns", { equipment: id, requestId: demoUuid(`incident-${index}`), description: ["Demo emergency stop and belt inspection required; keep unavailable", "Demo cable replacement and safety inspection in progress", "Demo display intermittently resets; inspection requested", "Demo noisy crank bearing; repair completed and tested"][index], severity: index === 0 ? "CRITICAL" : index === 2 ? "MEDIUM" : "HIGH", status: completed ? "RESOLVED" : index === 1 ? "ACKNOWLEDGED" : "OPEN", reportedBy: recId, reporterName: actors[1].fullName, reportedAt, reviewedBy: index === 0 || index === 2 ? null : adminId, reviewNotes: completed ? "Demo bearing replaced, inspected and returned to service" : "Demo safety review", closedAt: completed ? at(addDays(asOf, -5), 16) : null });
    if (unavailable || completed) document("EquipmentDowntime", `downtime-${index}`, "downtime", { equipment: id, startedAt: reportedAt, endedAt: completed ? at(addDays(asOf, -5), 16) : null, isOpen: !completed, reason: "Demo inspection/repair; equipment withheld from service", recordedBy: adminId, recordedByName: actors[0].fullName });
    if (index === 2) return;
    document("MaintenanceWork", `work-${index}`, "workOrders", { equipment: id, assetId: profile.assetId, equipmentName: profile.name, incident: incidentId, title: `Demo inspect and service ${name}`, kind: "REPAIR", status: completed ? "COMPLETED" : index === 1 ? "IN_PROGRESS" : "OPEN", plannedDate: addDays(asOf, completed ? -7 : index === 1 ? -2 : 1), technician: "Demo Technician", provider: "Fictional Gym Service", contact: "service@warrior-demo.example", estimatedCostLkr: 5000, notes: "Demo estimate only; actual cost exists solely in the linked Finance expense", repairNotes: completed ? "Demo bearing replaced and safety inspection passed" : "", createdBy: adminId, createdByName: actors[0].fullName, createdAt: reportedAt, startedAt: index === 0 ? null : at(addDays(asOf, completed ? -7 : -2)), completedAt: completed ? at(addDays(asOf, -5), 16) : null, completedBy: completed ? adminId : null, cancellationReason: "" });
  });
  push("expenseLink", "maintenance-expense-reference", { equipmentExpenseLinks: 1 }, { id: demoId("maintenance-expense-reference"), equipmentId: demoId("equipment-3"), workId: demoId("work-3"), expenseRequestId: demoUuid("expense-5"), linkedAt: at(addDays(asOf, -5), 17) });
  let opening = 15000;
  dates.slice(0, -2).forEach((date, index) => {
    const expected = opening + days[date].collections.CASH - days[date].expenses.CASH, actual = expected - (index === 5 ? 100 : 0);
    push("closing", `closing-${date}`, { cashClosings: 1 }, { requestId: demoUuid(`closing-${date}`), date, openingCashLkr: opening, actualCashLkr: actual, explanation: index === 5 ? "Demo counted shortage of LKR 100; fictional reconciliation example" : "Demo cash count reconciled", expectedTotals: days[date] }); opening = actual;
  });
  const base = { namespace: DEMO_NAMESPACE, asOf, anchoredAt: anchor.toISOString(), from: dates[0], dates, operations, counts, days, purchases, products, actors };
  const hash = createHash("sha256").update(JSON.stringify(base)).digest("hex");
  const plan = { ...base, hash }; validateDemoPlan(plan); return plan;
}

export function validateDemoPlan(plan: DemoPlan) {
  const keys = plan.operations.map(item => item.key);
  if (new Set(keys).size !== keys.length) throw new DemoError("Demo operation identifiers are not unique.");
  const purchases = new Map(plan.purchases.map(item => [item.id, item]));
  const docs = plan.operations.filter(item => item.kind === "document");
  const ids = new Map<SeedModel | "Membership", Set<string>>();
  for (const op of docs) { const set = ids.get(op.data.model) ?? new Set<string>(); set.add(op.data.value._id); ids.set(op.data.model, set); }
  ids.set("Membership", new Set(purchases.keys()));
  const references: Record<string, SeedModel | "Membership"> = { member: "Member", membership: "Membership", plan: "MembershipPlan", createdBy: "Staff", enrolledBy: "Staff", checkedInBy: "Staff", handledBy: "Staff", updatedBy: "Staff", reportedBy: "Staff", reviewedBy: "Staff", recordedBy: "Staff", completedBy: "Staff", actor: "Staff", target: "Staff", equipment: "Equipment", incident: "EquipmentIncident", workOrder: "MaintenanceWork" };
  for (const op of docs) for (const [field, model] of Object.entries(references)) {
    const value = op.data.value[field];
    if (value !== undefined && value !== null && !ids.get(model)?.has(String(value))) throw new DemoError("Demo document has an unresolved reference.");
  }
  if (new Set(plan.products.map(item => item.sku)).size !== plan.products.length || new Set(plan.products.map(item => item.barcode)).size !== plan.products.length) throw new DemoError("Demo product codes are not unique.");
  for (const item of plan.purchases) {
    if (calculateEndDateExclusive(item.startDate, item.planSnapshot.durationUnit, item.planSnapshot.durationCount) !== item.endDateExclusive) throw new DemoError("Invalid membership duration.");
    if (plan.purchases.some(other => other.id !== item.id && other.memberId === item.memberId && item.startDate < other.endDateExclusive && other.startDate < item.endDateExclusive)) throw new DemoError("Demo membership periods overlap.");
  }
  for (const op of docs) if (op.data.model === "Attendance") {
    const data = op.data.value, period = purchases.get(String(data.membership));
    if (!period || period.memberId !== data.member || !(period.startDate <= String(data.attendanceDate) && String(data.attendanceDate) < period.endDateExclusive)) throw new DemoError("Attendance must be inside its member's purchased coverage.");
  }
  const amounts = new Map<string, number>(), stock = new Map(plan.products.map(item => [item.sku, item.initialStock]));
  for (const op of plan.operations) {
    if (op.kind === "payment") {
      const period = purchases.get(op.data.membershipId), paid = (amounts.get(op.data.membershipId) ?? 0) + op.data.amountLkr;
      if (!period || paid > period.planSnapshot.priceLkr || op.data.receivedAt < period.issuedAt) throw new DemoError("Demo invoice payment mismatch."); amounts.set(op.data.membershipId, paid);
    } else if (op.kind === "stock") stock.set(op.data.sku, stock.get(op.data.sku)! + op.data.change);
    else if (op.kind === "sale") {
      const sum = op.data.items.reduce((total, item) => { stock.set(item.sku, stock.get(item.sku)! - item.quantity); return total + item.quantity * item.expectedUnitPriceLkr; }, 0);
      if (sum !== op.data.expectedTotalLkr) throw new DemoError("Demo sale total mismatch.");
    }
    if ([...stock.values()].some(value => !Number.isSafeInteger(value) || value < 0)) throw new DemoError("Demo stock cannot be negative.");
  }
  if (plan.products.some(item => stock.get(item.sku) !== item.targetStock)) throw new DemoError("Demo closing stock mismatch.");
  for (const day of Object.values(plan.days)) for (const method of METHODS) if (day.collections[method] !== day.membershipCollections![method] + day.retailCollections![method]) throw new DemoError("Demo collections double-counted.");
  if (plan.operations.some(op => op.kind === "closing" && (op.data.date >= addDays(plan.asOf, -1) || op.data.actualCashLkr < 0))) throw new DemoError("Leave yesterday and today open, with nonnegative historical cash counts.");
}
