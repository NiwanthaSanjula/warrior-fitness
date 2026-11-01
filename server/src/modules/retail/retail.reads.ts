import mongoose, { type PipelineStage } from "mongoose";
import type { z } from "zod";
import { AppError } from "../../utils/AppError.js";
import { addDays, todayInColombo } from "../memberships/membership.dates.js";
import { resolveReportPeriod } from "../reports/reports.period.js";
import { PAYMENT_METHODS, type PaymentMethod } from "../billing/payment.model.js";
import { RetailProduct, RetailSale, StockMovement, type IRetailProduct, type IRetailSale } from "./retail.model.js";
import { publicMovement, publicProduct, publicSale, retailAccess, type RetailActor } from "./retail.service.js";
import type { movementQuery, productQuery, reportQuery, saleQuery } from "./retail.validation.js";
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pagination = (total: number, query: { page: number; limit: number }) => ({ page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) });
function periodFor(from?: string, to?: string) {
  const result = resolveReportPeriod({ from, to });
  if (!result.success) throw new AppError(400, result.message);
  return result.period;
}
export async function listProducts(actor: RetailActor, query: z.infer<typeof productQuery>) {
  retailAccess(actor, ["retail.read"]);
  if (actor.role !== "ADMIN" && query.status !== "active") throw new AppError(403, "Inactive products are Admin-only");
  const filter: Record<string, unknown> = {};
  if (query.status !== "all") filter.isActive = query.status === "active";
  if (query.category) filter.category = query.category;
  if (query.q) filter.$or = ["name", "sku", "barcode"].map(field => ({ [field]: { $regex: escape(query.q), $options: "i" } }));
  if (query.barcode) filter.barcode = query.barcode;
  if (query.sku) filter.sku = query.sku;
  if (query.stock === "in") filter.stock = { $gt: 0 };
  if (query.stock === "out") filter.stock = 0;
  if (query.stock === "low") { filter.stock = { $gt: 0 }; filter.$expr = { $lte: ["$stock", "$lowStockThreshold"] }; }
  const [items, total] = await Promise.all([RetailProduct.find(filter).sort({ name: 1, _id: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(), RetailProduct.countDocuments(filter)]);
  return { data: items.map(item => publicProduct(item, actor)), pagination: pagination(total, query) };
}
export async function getProduct(actor: RetailActor, id: string) {
  retailAccess(actor, ["retail.read"]);
  const item = await RetailProduct.findOne({ _id: id, ...(actor.role !== "ADMIN" ? { isActive: true } : {}) });
  if (!item) throw new AppError(404, "Product not found");
  return { product: publicProduct(item, actor) };
}
export async function listMovements(actor: RetailActor, id: string, query: z.infer<typeof movementQuery>) {
  retailAccess(actor, ["retail.manage"], true);
  const [items, total] = await Promise.all([StockMovement.find({ product: id }).sort({ recordedAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(), StockMovement.countDocuments({ product: id })]);
  return { data: items.map(publicMovement), pagination: pagination(total, query) };
}
export async function listSales(actor: RetailActor, query: z.infer<typeof saleQuery>) {
  retailAccess(actor, ["retail.sales.read"]);
  const period = periodFor(query.from, query.to);
  const match: Record<string, unknown> = { date: { $gte: period.from, $lte: period.to }, ...(actor.role !== "ADMIN" ? { cashier: new mongoose.Types.ObjectId(actor.id) } : {}) };
  if (query.method) match.method = query.method;
  if (query.q) match.$or = ["saleNumber", "reference", "memberName", "lines.name", "lines.sku"].map(field => ({ [field]: { $regex: escape(query.q), $options: "i" } }));
  const [items, total] = await Promise.all([RetailSale.find(match).sort({ soldAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(), RetailSale.countDocuments(match)]);
  return { data: items.map(publicSale), pagination: pagination(total, query), period: { from: period.from, to: period.to }, scope: actor.role === "ADMIN" ? "ALL" : "OWN" };
}
export async function getSale(actor: RetailActor, id: string) {
  retailAccess(actor, ["retail.sales.read"]);
  const item = await RetailSale.findOne({ _id: id, ...(actor.role !== "ADMIN" ? { cashier: actor.id } : {}) });
  if (!item) throw new AppError(404, "Sale not found or unavailable to this account");
  return { sale: publicSale(item) };
}
type Summary = { amountLkr: number; count: number; units: number };
type SaleReport = { overall: Summary[]; methods: { _id: PaymentMethod; amountLkr: number; count: number }[]; days: { _id: string; amountLkr: number }[]; best: { _id: mongoose.Types.ObjectId; name: string; sku: string; quantity: number; amountLkr: number }[]; recent: (IRetailSale & { _id: mongoose.Types.ObjectId })[] };
export async function retailDashboard(actor: RetailActor, query: z.infer<typeof reportQuery>) {
  retailAccess(actor, ["retail.manage"], true);
  const today = todayInColombo(), period = periodFor(query.from ?? addDays(query.to ?? today, -6), query.to);
  const sum = { $group: { _id: null, amountLkr: { $sum: "$amountLkr" }, count: { $sum: 1 }, units: { $sum: { $sum: "$lines.quantity" } } } };
  const pipeline: PipelineStage[] = [
    { $match: { date: { $gte: period.from, $lte: period.to } } },
    { $facet: {
      overall: [sum], methods: [{ $group: { _id: "$method", amountLkr: { $sum: "$amountLkr" }, count: { $sum: 1 } } }],
      days: [{ $group: { _id: "$date", amountLkr: { $sum: "$amountLkr" } } }, { $sort: { _id: 1 } }],
      best: [{ $sort: { soldAt: 1, _id: 1 } }, { $unwind: "$lines" }, { $group: { _id: "$lines.product", name: { $last: "$lines.name" }, sku: { $last: "$lines.sku" }, quantity: { $sum: "$lines.quantity" }, amountLkr: { $sum: "$lines.lineTotalLkr" } } }, { $sort: { quantity: -1, amountLkr: -1, _id: 1 } }, { $limit: 8 }],
      recent: [{ $sort: { soldAt: -1, _id: -1 } }, { $limit: 6 }],
    } },
  ];
  type StockResult = { summary: { count: number; low: number; out: number }[]; low: (IRetailProduct & { _id: mongoose.Types.ObjectId })[]; out: (IRetailProduct & { _id: mongoose.Types.ObjectId })[] };
  const [reports, todayResults, stockResults] = await Promise.all([
    RetailSale.aggregate<SaleReport>(pipeline), RetailSale.aggregate<Summary>([{ $match: { date: today } }, sum]),
    RetailProduct.aggregate<StockResult>([{ $match: { isActive: true } }, { $facet: {
      summary: [{ $group: { _id: null, count: { $sum: 1 }, low: { $sum: { $cond: [{ $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$lowStockThreshold"] }] }, 1, 0] } }, out: { $sum: { $cond: [{ $eq: ["$stock", 0] }, 1, 0] } } } }],
      low: [{ $match: { stock: { $gt: 0 }, $expr: { $lte: ["$stock", "$lowStockThreshold"] } } }, { $sort: { stock: 1, name: 1 } }, { $limit: 8 }],
      out: [{ $match: { stock: 0 } }, { $sort: { name: 1 } }, { $limit: 8 }],
    } }]),
  ]);
  const report = reports[0], stock = stockResults[0], empty = { amountLkr: 0, count: 0, units: 0 }, overall = report?.overall[0] ?? empty, todaySummary = todayResults[0] ?? empty;
  const trend = Array.from({ length: period.days }, (_, i) => { const date = addDays(period.from, i); return { date, value: report?.days.find(row => row._id === date)?.amountLkr ?? 0 }; });
  const byMethod = PAYMENT_METHODS.map(method => ({ method, amountLkr: report?.methods.find(row => row._id === method)?.amountLkr ?? 0, count: report?.methods.find(row => row._id === method)?.count ?? 0 }));
  const bestSelling = (report?.best ?? []).map(row => ({ productId: String(row._id), name: row.name, sku: row.sku, quantity: row.quantity, amountLkr: row.amountLkr }));
  if (![overall.amountLkr, overall.count, overall.units, todaySummary.amountLkr, ...trend.map(row => row.value), ...byMethod.map(row => row.amountLkr), ...bestSelling.map(row => row.amountLkr)].every(Number.isSafeInteger)) throw new AppError(400, "Retail report totals exceed safe whole-LKR limits");
  return { today: { date: today, ...todaySummary }, period: { from: period.from, to: period.to }, summary: overall, byMethod, trend, bestSelling,
    recent: (report?.recent ?? []).map(publicSale), stock: { activeProducts: stock?.summary[0]?.count ?? 0, lowStockCount: stock?.summary[0]?.low ?? 0, outOfStockCount: stock?.summary[0]?.out ?? 0, lowStock: (stock?.low ?? []).map(item => publicProduct(item, actor)), outOfStock: (stock?.out ?? []).map(item => publicProduct(item, actor)) } };
}
