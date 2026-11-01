import { createHash } from "node:crypto";
import mongoose, { type ClientSession, type Types } from "mongoose";
import type { z } from "zod";
import type { Permission } from "../auth/permissions.js";
import { AppError } from "../../utils/AppError.js";
import { Member, type IMember } from "../members/member.model.js";
import { financialTransaction, lockOpenFinancialDay } from "../financial/financial-day.service.js";
import { todayInColombo } from "../memberships/membership.dates.js";
import { MAX_SALE_LKR, MAX_STOCK } from "./retail.constants.js";
import { RetailProduct, RetailSale, StockMovement, type IRetailProduct, type IRetailSale, type IStockMovement, type RetailSaleLine } from "./retail.model.js";
import type { CheckoutInput, createProductInput, stockInput, updateProductInput } from "./retail.validation.js";

export type RetailActor = { id: string; fullName: string; role: "ADMIN" | "RECEPTIONIST"; permissions: Permission[] };
type Identified<T> = T & { _id: Types.ObjectId };
export function retailAccess(actor: RetailActor, permissions: Permission[], admin = false) {
  if (actor.role === "ADMIN") return;
  if (admin || !permissions.every(key => actor.permissions.includes(key))) throw new AppError(403, "You do not have permission for this retail operation");
}
export function publicProduct(item: Identified<IRetailProduct>, actor: RetailActor) {
  return { id: String(item._id), name: item.name, sku: item.sku, barcode: item.barcode, category: item.category, sellingPriceLkr: item.sellingPriceLkr,
    stock: item.stock, isActive: item.isActive, version: item.version,
    ...(actor.role === "ADMIN" ? { lowStockThreshold: item.lowStockThreshold, supplierName: item.supplierName, supplierContact: item.supplierContact } : {}) };
}
export function publicSale(item: Identified<IRetailSale>) {
  return { id: String(item._id), saleNumber: item.saleNumber, currency: "LKR" as const, date: item.date, soldAt: item.soldAt.toISOString(),
    lines: item.lines.map(line => ({ productId: String(line.product), name: line.name, sku: line.sku, barcode: line.barcode, quantity: line.quantity, unitPriceLkr: line.unitPriceLkr, lineTotalLkr: line.lineTotalLkr })),
    amountLkr: item.amountLkr, method: item.method, cashTenderedLkr: item.cashTenderedLkr, changeLkr: item.changeLkr, reference: item.reference,
    memberId: item.member ? String(item.member) : null, memberName: item.memberName, memberReference: item.memberReference, cashierId: String(item.cashier), cashierName: item.cashierName };
}
export function publicMovement(item: Identified<IStockMovement>) {
  return { id: String(item._id), productId: String(item.product), productName: item.productName, sku: item.sku, kind: item.kind, change: item.change, before: item.before, after: item.after,
    reason: item.reason, actorName: item.actorName, saleId: item.sale ? String(item.sale) : null, recordedAt: item.recordedAt.toISOString() };
}
const fingerprint = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
async function movement(item: Identified<IRetailProduct>, actor: RetailActor, before: number, kind: IStockMovement["kind"], reason: string, requestKey: string, hash: string, session: ClientSession, sale: Types.ObjectId | null = null, recordedAt = new Date()) {
  const record = new StockMovement({ product: item._id, productName: item.name, sku: item.sku, kind, before, after: item.stock, change: item.stock - before, reason, actor: actor.id, actorName: actor.fullName, sale, requestKey, fingerprint: hash, recordedAt });
  await record.save({ session }); return record;
}
export async function createProduct(actor: RetailActor, input: z.infer<typeof createProductInput>, recordedAt = new Date()) {
  retailAccess(actor, ["retail.manage"], true);
  return financialTransaction(async session => {
    if (await RetailProduct.exists({ $or: [{ sku: input.sku }, ...(input.barcode ? [{ barcode: input.barcode }] : [])] }).session(session)) throw new AppError(409, "SKU or barcode is already registered");
    const { initialStock, ...fields } = input;
    const item = new RetailProduct({ ...fields, stock: initialStock, createdBy: actor.id });
    await item.save({ session });
    await movement(item, actor, 0, "OPENING", "Initial stock at product registration", `opening:${item._id}`, "opening", session, null, recordedAt);
    return { product: publicProduct(item, actor) };
  });
}
export async function updateProduct(actor: RetailActor, id: string, input: z.infer<typeof updateProductInput>) {
  retailAccess(actor, ["retail.manage"], true);
  const { version, ...fields } = input;
  const item = await RetailProduct.findOneAndUpdate({ _id: id, version }, { $set: fields, $inc: { version: 1 } }, { new: true, runValidators: true });
  if (!item) throw new AppError(409, "Product changed or is unavailable. Refresh before editing.");
  return { product: publicProduct(item, actor) };
}
export async function changeStock(actor: RetailActor, id: string, input: z.infer<typeof stockInput>, recordedAt = new Date()) {
  retailAccess(actor, ["retail.manage"], true);
  const hash = fingerprint([actor.id, id, input.kind, input.change, input.reason]);
  return financialTransaction(async session => {
    const previous = await StockMovement.findOne({ requestKey: `manual:${input.requestId}` }).session(session);
    if (previous && previous.fingerprint !== hash) throw new AppError(409, "This stock request key belongs to different details");
    const item = await RetailProduct.findById(id).session(session);
    if (!item) throw new AppError(404, "Product not found");
    if (previous) return { product: publicProduct(item, actor), movement: publicMovement(previous), replayed: true };
    if (item.version !== input.version) throw new AppError(409, "Stock changed. Refresh before adjusting.");
    const after = item.stock + input.change;
    if (!Number.isSafeInteger(after) || after < 0 || after > MAX_STOCK) throw new AppError(409, "Stock adjustment would exceed inventory limits or make stock negative");
    const updated = await RetailProduct.findOneAndUpdate({ _id: id, version: input.version, stock: item.stock }, { $inc: { stock: input.change, version: 1 } }, { new: true, runValidators: true, session });
    if (!updated) throw new AppError(409, "Stock changed. Refresh before adjusting.");
    const record = await movement(updated, actor, item.stock, input.kind, input.reason, `manual:${input.requestId}`, hash, session, null, recordedAt);
    return { product: publicProduct(updated, actor), movement: publicMovement(record), replayed: false };
  });
}
export function saleAmounts(lines: { quantity: number; unitPriceLkr: number }[], method: IRetailSale["method"], cash: number | null) {
  if (!lines.length || lines.length > 50 || !lines.every(line => Number.isSafeInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 1000 && Number.isSafeInteger(line.unitPriceLkr) && line.unitPriceLkr >= 1 && line.unitPriceLkr <= 10_000_000)) throw new AppError(400, "Invalid whole-LKR sale lines");
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceLkr, 0);
  if (!Number.isSafeInteger(total) || total < 1 || total > MAX_SALE_LKR) throw new AppError(400, "Sale total exceeds safe whole-LKR limits");
  if (method === "CASH" && (cash === null || !Number.isSafeInteger(cash) || cash < total || cash > MAX_SALE_LKR)) throw new AppError(400, "Cash tendered must cover the complete sale total");
  if (method !== "CASH" && cash !== null) throw new AppError(400, "Non-cash sales cannot include cash tendered");
  return { amountLkr: total, changeLkr: method === "CASH" ? cash! - total : 0 };
}
export async function checkout(actor: RetailActor, input: CheckoutInput, soldAt = new Date()) {
  retailAccess(actor, ["retail.read", "retail.checkout"]);
  const items = [...input.items].sort((a, b) => a.productId.localeCompare(b.productId));
  const hash = fingerprint([actor.id, items, input.method, input.cashTenderedLkr, input.memberId, input.reference, input.expectedTotalLkr]);
  const date = todayInColombo(soldAt);
  return financialTransaction(async session => {
    const previous = await RetailSale.findOne({ requestId: input.requestId }).session(session);
    if (previous) {
      if (previous.fingerprint !== hash) throw new AppError(409, "This checkout key belongs to a different purchase or cashier");
      return { sale: publicSale(previous), replayed: true };
    }
    // This is the same lock/revision used by membership payments, expenses and closing.
    // Replays above do not write money or stock, and remain valid after a day closes.
    await lockOpenFinancialDay(date, session);
    let member: mongoose.HydratedDocument<IMember> | null = null;
    if (input.memberId) {
      retailAccess(actor, ["members.read"]);
      member = await Member.findById(input.memberId).session(session);
      if (!member || !member.isActive) throw new AppError(400, "Select an existing active member or use a walk-in sale");
    }
    const products: mongoose.HydratedDocument<IRetailProduct>[] = [], lines: RetailSaleLine[] = [];
    for (const requested of items) {
      const product = await RetailProduct.findById(requested.productId).session(session);
      if (!product || !product.isActive) throw new AppError(409, "A selected product is no longer available");
      if (product.sellingPriceLkr !== requested.expectedUnitPriceLkr) throw new AppError(409, `${product.name}: price changed. Refresh the product and review the cart.`);
      if (product.stock < requested.quantity) throw new AppError(409, `${product.name}: insufficient stock. Refresh availability.`);
      products.push(product);
      lines.push({ product: product._id, name: product.name, sku: product.sku, barcode: product.barcode, quantity: requested.quantity, unitPriceLkr: product.sellingPriceLkr, lineTotalLkr: product.sellingPriceLkr * requested.quantity });
    }
    const amounts = saleAmounts(lines, input.method, input.cashTenderedLkr);
    if (amounts.amountLkr !== input.expectedTotalLkr) throw new AppError(409, "The server total differs from the displayed total. Review the cart.");
    const saleId = new mongoose.Types.ObjectId();
    for (let index = 0; index < products.length; index++) {
      const product = products[index], line = lines[index];
      const updated = await RetailProduct.findOneAndUpdate(
        { _id: product._id, isActive: true, version: product.version, sellingPriceLkr: line.unitPriceLkr, stock: { $gte: line.quantity } },
        { $inc: { stock: -line.quantity, version: 1 } }, { new: true, runValidators: true, session },
      );
      if (!updated) throw new AppError(409, "Stock or price changed during checkout. Refresh and review the cart.");
      await movement(updated, actor, product.stock, "SALE", "Completed retail checkout", `sale:${saleId}:${product._id}`, hash, session, saleId, soldAt);
    }
    // This immutable record IS the retail money ledger posting; no membership
    // invoice/payment is created and no second retail payment can double-count it.
    const sale = new RetailSale({ _id: saleId, saleNumber: `WF-POS-${saleId.toString().toUpperCase()}`, requestId: input.requestId, fingerprint: hash, lines, ...amounts,
      method: input.method, cashTenderedLkr: input.cashTenderedLkr, reference: input.reference, member: member?._id ?? null, memberName: member?.fullName ?? "", memberReference: member?.memberId ?? "",
      cashier: actor.id, cashierName: actor.fullName, soldAt, date });
    await sale.save({ session });
    return { sale: publicSale(sale), replayed: false };
  });
}
