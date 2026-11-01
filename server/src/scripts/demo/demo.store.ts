import { randomUUID } from "node:crypto";
import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import { Staff } from "../../modules/auth/staff.model.js";
import { StaffAudit } from "../../modules/staff/staff-audit.model.js";
import { MembershipPlan } from "../../modules/membership-plans/plan.model.js";
import { Member } from "../../modules/members/member.model.js";
import { Membership } from "../../modules/memberships/membership.model.js";
import { Invoice } from "../../modules/billing/invoice.model.js";
import { Payment } from "../../modules/billing/payment.model.js";
import { createInvoiceForMembership } from "../../modules/billing/invoice.service.js";
import { recordPaymentLedger } from "../../modules/billing/payment.controller.js";
import { recordPaymentSchema } from "../../modules/billing/payment.validation.js";
import { Attendance } from "../../modules/attendance/attendance.model.js";
import { FollowUp } from "../../modules/attention/follow-up.model.js";
import { NotificationConsent, ReminderLog } from "../../modules/notifications/notification.model.js";
import { NotificationRun } from "../../modules/notifications/notification-run.model.js";
import { Equipment, EquipmentIncident, EquipmentDowntime, EquipmentEvent, EquipmentExpenseLink, MaintenanceWork } from "../../modules/equipment/equipment.model.js";
import { RetailProduct, RetailSale, StockMovement } from "../../modules/retail/retail.model.js";
import { createProduct, changeStock, checkout } from "../../modules/retail/retail.service.js";
import { createProductInput, stockInput, checkoutInput } from "../../modules/retail/retail.validation.js";
import { createExpense, closeDay, previewDay, ledgerTotals, reconcileCash } from "../../modules/financial/financial.service.js";
import { financialTransaction } from "../../modules/financial/financial-day.service.js";
import { FinancialDay } from "../../modules/financial/financial-day.model.js";
import { Expense } from "../../modules/financial/expense.model.js";
import { CashClosing, type DayTotals } from "../../modules/financial/cash-closing.model.js";
import { expenseInputSchema, closingInputSchema } from "../../modules/financial/financial.validation.js";
import { DEMO_NAMESPACE, DemoError } from "./demo.config.js";
import { demoDatabase, storedDemoState } from "./demo.connection.js";
import type { DemoStore } from "./demo.runner.js";
import { demoId, type DemoOperation, type DemoPlan, type SeedDocument } from "./demo.plan.js";

// The only raw-document path is this explicit NON-FINANCIAL allowlist. Financial
// ledgers must go through their existing services/transaction boundaries below.
export const demoDocumentModels = { Staff, MembershipPlan, Member, Attendance, AttentionFollowUp: FollowUp, NotificationConsent, ReminderLog, NotificationRun, Equipment, EquipmentIncident, MaintenanceWork, EquipmentDowntime, EquipmentEvent, StaffAudit };
interface Manifest { _id: string; anchoredAt: string; planHash: string; complete: boolean; leaseToken: string | null; leaseUntil: Date }
const manifestSchema = new Schema<Manifest>({ _id: String, anchoredAt: { type: String, required: true }, planHash: { type: String, required: true }, complete: { type: Boolean, default: false }, leaseToken: { type: String, default: null }, leaseUntil: { type: Date, required: true } }, { collection: "demo_seed_state", strict: "throw", versionKey: false });
const DemoManifest = mongoose.model<Manifest>("DemoSeedState", manifestSchema);
const allModels = [...Object.values(demoDocumentModels), EquipmentExpenseLink, Membership, Invoice, Payment, RetailProduct, RetailSale, StockMovement, Expense, CashClosing, FinancialDay, DemoManifest];
const identity = () => { demoDatabase(); };
const until = () => new Date(Date.now() + 5 * 60_000);
export function sameDayTotals(a: DayTotals, b: DayTotals) {
  return a.paymentCount === b.paymentCount && a.expenseCount === b.expenseCount && a.retailSaleCount === b.retailSaleCount && ["CASH", "CARD", "BANK_TRANSFER"].every(method => {
    const key = method as keyof DayTotals["collections"];
    return a.collections[key] === b.collections[key] && a.expenses[key] === b.expenses[key] && a.membershipCollections?.[key] === b.membershipCollections?.[key] && a.retailCollections?.[key] === b.retailCollections?.[key];
  });
}
export async function initializeDemoModels() {
  for (const model of allModels) { identity(); await model.createCollection(); await model.createIndexes(); }
}
export class MongoDemoStore implements DemoStore {
  private readonly token = randomUUID();
  private readonly admin = { id: demoId("staff-admin"), fullName: "Demo Administrator", role: "ADMIN" as const, permissions: [] };
  constructor(private readonly password: string) {}
  async readState() { const state = await storedDemoState(); return state ? { anchoredAt: state.anchoredAt, planHash: state.planHash, complete: state.complete } : null; }
  async acquire(plan: DemoPlan) {
    identity();
    // Explicit createIndexes adds required uniqueness; syncIndexes/dropIndexes
    // are deliberately forbidden. This runs only after connection/preflight.
    await initializeDemoModels();
    const state = await DemoManifest.findOneAndUpdate({ _id: DEMO_NAMESPACE, planHash: plan.hash, $or: [{ leaseToken: null }, { leaseUntil: { $lte: new Date() } }] }, { $setOnInsert: { anchoredAt: plan.anchoredAt, planHash: plan.hash, complete: false }, $set: { leaseToken: this.token, leaseUntil: until() } }, { upsert: true, new: true });
    if (!state || state.planHash !== plan.hash) throw new DemoError("Another demo seeder owns this dataset or its anchor changed. No application records were written.");
  }
  async heartbeat() {
    identity();
    const result = await DemoManifest.updateOne({ _id: DEMO_NAMESPACE, leaseToken: this.token }, { $set: { leaseUntil: until() } });
    if (result.matchedCount !== 1) throw new DemoError("Demo seeding lease was lost; stopped before the next write.");
  }
  async complete(plan: DemoPlan) {
    identity();
    const result = await DemoManifest.updateOne({ _id: DEMO_NAMESPACE, leaseToken: this.token, planHash: plan.hash }, { $set: { complete: true } });
    if (result.matchedCount !== 1) throw new DemoError("Demo completion could not be recorded safely.");
  }
  async release() { identity(); await DemoManifest.updateOne({ _id: DEMO_NAMESPACE, leaseToken: this.token }, { $set: { leaseToken: null, leaseUntil: new Date() } }); }
  private async document(input: SeedDocument) {
    const model = demoDocumentModels[input.model] as unknown as mongoose.Model<Record<string, unknown>>;
    const previous = await model.findById(input.value._id).lean();
    if (previous) {
      if (input.model === "Staff" && (previous.email !== input.value.email || previous.role !== input.value.role || previous.isActive !== true)) throw new DemoError("An existing demo staff account was changed. Its password/role/status will not be reset.");
      return false;
    }
    const value = { ...input.value };
    if (input.model === "Staff") {
      if (await Staff.exists({ email: String(value.email) })) throw new DemoError("Demo staff email collision; existing account preserved.");
      value.passwordHash = await bcrypt.hash(this.password, 12);
    }
    await new model(value).save({ timestamps: false }); return true;
  }
  private async product(sku: string) {
    const item = await RetailProduct.findOne({ sku });
    if (!item || String(item.createdBy) !== this.admin.id || !sku.startsWith("WF-DEMO-")) throw new DemoError("Expected demo-owned retail product was not found.");
    return item;
  }
  async apply(operation: DemoOperation): Promise<boolean> {
    identity();
    // Verify current lease ownership immediately before every operation. No
    // standalone adapter call can bypass the runner's lease/safety boundary.
    if (!(await DemoManifest.exists({ _id: DEMO_NAMESPACE, leaseToken: this.token, leaseUntil: { $gt: new Date() } }))) throw new DemoError("Demo operation requires the current seeding lease.");
    switch (operation.kind) {
      case "document": return this.document(operation.data);
      case "purchase": {
        const item = operation.data;
        return financialTransaction(async session => {
          const previous = await Membership.findById(item.id).session(session);
          if (previous) {
            if (String(previous.member) !== item.memberId || previous.startDate !== item.startDate || previous.endDateExclusive !== item.endDateExclusive || !(await Invoice.exists({ membership: item.id }).session(session))) throw new DemoError("Demo purchase/invoice conflict; existing financial history preserved.");
            return false;
          }
          if (!(await Member.exists({ _id: item.memberId, createdBy: this.admin.id }).session(session)) || !(await MembershipPlan.exists({ _id: item.planId, createdBy: this.admin.id }).session(session))) throw new DemoError("Demo purchase requires its owned member and plan.");
          if (await Membership.exists({ member: item.memberId, startDate: { $lt: item.endDateExclusive }, endDateExclusive: { $gt: item.startDate } }).session(session)) throw new DemoError("Overlapping membership purchase refused.");
          const { id: _id, memberId: member, planId: plan, issuedAt, ...fields } = item;
          const membership = new Membership({ _id, member, plan, ...fields, enrolledBy: this.admin.id, createdAt: new Date(issuedAt) });
          await membership.save({ session });
          await createInvoiceForMembership(membership, this.admin.id, session, new Date(issuedAt)); return true;
        });
      }
      case "product": {
        const { targetStock: _target, recordedAt, ...input } = operation.data;
        const previous = await RetailProduct.findOne({ sku: input.sku });
        if (previous) { await this.product(input.sku); return false; }
        await createProduct(this.admin, createProductInput.parse(input), new Date(recordedAt)); return true;
      }
      case "payment": {
        const item = operation.data, invoice = await Invoice.findOne({ membership: item.membershipId });
        if (!invoice) throw new DemoError("Payment needs its purchased membership invoice.");
        const input = recordPaymentSchema.parse({ invoiceId: String(invoice._id), amountLkr: item.amountLkr, method: item.method, requestId: item.requestId, reference: `WF-DEMO-${item.requestId.slice(0, 8)}`, notes: "Fictional demo membership collection" });
        return !(await recordPaymentLedger(input, this.admin, new Date(item.receivedAt))).replayed;
      }
      case "sale": {
        const { cashierId, soldAt, items: source, ...input } = operation.data;
        const items = [];
        for (const item of source) { const product = await this.product(item.sku); items.push({ productId: String(product._id), quantity: item.quantity, expectedUnitPriceLkr: item.expectedUnitPriceLkr }); }
        const actor = { id: cashierId, fullName: cashierId === demoId("staff-reception") ? "Demo Receptionist" : "Demo Check-in Desk", role: "RECEPTIONIST" as const, permissions: ["retail.read", "retail.checkout", "retail.sales.read", "members.read"] as const };
        return !(await checkout({ ...actor, permissions: [...actor.permissions] }, checkoutInput.parse({ ...input, items, reference: "WF-DEMO-RETAIL" }), new Date(soldAt))).replayed;
      }
      case "stock": {
        const { sku, recordedAt, ...input } = operation.data, item = await this.product(sku);
        return !(await changeStock(this.admin, String(item._id), stockInput.parse({ ...input, version: item.version }), new Date(recordedAt))).replayed;
      }
      case "expense": return !(await createExpense(expenseInputSchema.parse(operation.data), this.admin)).replayed;
      case "expenseLink": {
        const item = operation.data;
        return financialTransaction(async session => {
          if (await EquipmentExpenseLink.exists({ _id: item.id }).session(session)) return false;
          const expense = await Expense.findOne({ requestId: item.expenseRequestId, category: { $in: ["EQUIPMENT", "MAINTENANCE"] }, responsibleStaff: this.admin.id }).session(session);
          if (!expense || !(await MaintenanceWork.exists({ _id: item.workId, equipment: item.equipmentId, status: "COMPLETED" }).session(session)) || await EquipmentExpenseLink.exists({ expense: expense._id }).session(session)) throw new DemoError("Maintenance requires a verified unlinked existing expense and completed work order.");
          // The Finance expense was imported now. Append its reference now too,
          // rather than claiming it was linked before the expense record existed.
          await new EquipmentExpenseLink({ _id: item.id, equipment: item.equipmentId, workOrder: item.workId, expense: expense._id, linkedBy: this.admin.id, linkedAt: new Date() }).save({ session }); return true;
        });
      }
      case "closing": {
        const { expectedTotals, ...input } = operation.data, previous = await CashClosing.findOne({ date: input.date });
        if (previous) {
          if (previous.requestId !== input.requestId || !sameDayTotals(previous.totals, expectedTotals)) throw new DemoError("Existing closing differs from the seed snapshot. No historical values were changed.");
          return false;
        }
        const preview = await previewDay(input.date);
        if (preview.status !== "OPEN" || !sameDayTotals(preview.totals, expectedTotals)) throw new DemoError("Actual ledger differs from the reviewed demo closing. Closing refused.");
        return !(await closeDay(closingInputSchema.parse({ ...input, expectedRevision: preview.revision }), this.admin)).replayed;
      }
    }
  }
  async verify(plan: DemoPlan) {
    identity();
    const memberIds = [...new Set(plan.purchases.map(item => item.memberId))], invoices = await Invoice.find({ member: { $in: memberIds } }).lean();
    if (invoices.length !== plan.purchases.length) throw new DemoError("Persisted invoice count does not match purchased memberships.");
    const payments = await Payment.find({ invoice: { $in: invoices.map(item => item._id) } }).lean();
    for (const invoice of invoices) {
      const purchased = plan.purchases.find(item => item.id === String(invoice.membership));
      const paid = payments.filter(item => String(item.invoice) === String(invoice._id)).reduce((sum, item) => sum + item.amountLkr, 0);
      const plannedPaid = plan.operations.reduce((sum, op) => sum + (op.kind === "payment" && op.data.membershipId === String(invoice.membership) ? op.data.amountLkr : 0), 0);
      if (!purchased || invoice.totalLkr !== purchased.planSnapshot.priceLkr || invoice.paidLkr !== paid || paid !== plannedPaid || paid > invoice.totalLkr) throw new DemoError("Persisted membership/invoice/payment totals do not reconcile.");
    }
    for (const planned of plan.products) {
      const product = await this.product(planned.sku), movements = await StockMovement.find({ product: product._id }).sort({ recordedAt: 1, _id: 1 }).lean();
      let quantity = 0;
      for (const item of movements) {
        if (item.before !== quantity || item.after !== item.before + item.change || item.after < 0) throw new DemoError("Persisted stock movement chain does not reconcile.");
        quantity = item.after;
      }
      if (quantity !== product.stock || quantity !== planned.targetStock) throw new DemoError("Persisted stock does not match the planned demo shelf.");
    }
    const sales = await RetailSale.find({ requestId: { $in: plan.operations.filter(op => op.kind === "sale").map(op => op.data.requestId) } }).lean();
    if (sales.length !== plan.counts.retailSales || sales.some(sale => sale.amountLkr !== sale.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceLkr, 0) || sale.lines.some(line => line.lineTotalLkr !== line.quantity * line.unitPriceLkr))) throw new DemoError("Persisted retail receipt totals do not reconcile.");
    for (const date of plan.dates) {
      const totals = await financialTransaction(session => ledgerTotals(date, session));
      if (!sameDayTotals(totals, plan.days[date])) throw new DemoError("Persisted ledger sources do not reconcile to the demo plan.");
      const preview = await previewDay(date);
      if (preview.status === "CLOSED") {
        const closing = plan.operations.find(op => op.kind === "closing" && op.data.date === date);
        const reconciled = reconcileCash(preview.closing.openingCashLkr, preview.closing.actualCashLkr, totals);
        if (!closing || closing.kind !== "closing" || !sameDayTotals(preview.closing.totals, totals) || preview.closing.openingCashLkr !== closing.data.openingCashLkr || preview.closing.actualCashLkr !== closing.data.actualCashLkr || reconciled.expectedCashLkr !== preview.closing.expectedCashLkr || reconciled.varianceLkr !== preview.closing.varianceLkr) throw new DemoError("Persisted closing reconciliation failed.");
      } else if (date < plan.dates[12]) throw new DemoError("Expected historical closing is missing.");
    }
  }
}
