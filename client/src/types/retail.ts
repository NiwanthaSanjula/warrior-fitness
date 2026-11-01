import type { FinancialMethod, Pagination } from "./financial";
export const retailCategories = { SUPPLEMENTS: "Supplements", BEVERAGES: "Beverages", SNACKS: "Snacks", ACCESSORIES: "Accessories", MERCHANDISE: "Merchandise", OTHER: "Other" } as const;
export type RetailCategory = keyof typeof retailCategories;
export interface ProductProfile { name: string; sku: string; barcode: string | null; category: RetailCategory; sellingPriceLkr: number; lowStockThreshold: number; supplierName: string; supplierContact: string; isActive: boolean }
export interface RetailProduct extends Omit<ProductProfile, "lowStockThreshold" | "supplierName" | "supplierContact"> { id: string; stock: number; version: number; lowStockThreshold?: number; supplierName?: string; supplierContact?: string }
export interface RetailList<T> { success: boolean; data: T[]; pagination: Pagination }
export interface ProductFilters { q?: string; barcode?: string; sku?: string; category?: RetailCategory; status?: "active" | "inactive" | "all"; stock?: "in" | "low" | "out"; page?: number; limit?: number }
export interface CartLine { product: RetailProduct; quantity: number }
export interface CheckoutInput { requestId: string; items: { productId: string; quantity: number; expectedUnitPriceLkr: number }[]; expectedTotalLkr: number; method: FinancialMethod; cashTenderedLkr: number | null; memberId: string | null; reference: string }
export interface RetailSale { id: string; saleNumber: string; currency: "LKR"; date: string; soldAt: string; lines: { productId: string; name: string; sku: string; barcode: string | null; quantity: number; unitPriceLkr: number; lineTotalLkr: number }[]; amountLkr: number; method: FinancialMethod; cashTenderedLkr: number | null; changeLkr: number; reference: string; memberId: string | null; memberName: string; memberReference: string; cashierId: string; cashierName: string }
export interface CheckoutResult { success: boolean; sale: RetailSale; replayed: boolean }
export interface ProductResult { success: boolean; product: RetailProduct }
export interface StockInput { requestId: string; kind: "RESTOCK" | "ADJUSTMENT"; change: number; reason: string; version: number }
export interface StockMovement { id: string; productId: string; productName: string; sku: string; kind: "OPENING" | "RESTOCK" | "ADJUSTMENT" | "SALE"; change: number; before: number; after: number; reason: string; actorName: string; saleId: string | null; recordedAt: string }
export interface SalesFilters { from: string; to: string; method?: FinancialMethod; q?: string; page?: number; limit?: number }
export interface SalesResult extends RetailList<RetailSale> { period: { from: string; to: string }; scope: "OWN" | "ALL" }
export interface RetailDashboard {
  success: boolean; today: { date: string; amountLkr: number; count: number; units: number }; period: { from: string; to: string }; summary: { amountLkr: number; count: number; units: number };
  byMethod: { method: FinancialMethod; amountLkr: number; count: number }[]; trend: { date: string; value: number }[]; bestSelling: { productId: string; name: string; sku: string; quantity: number; amountLkr: number }[]; recent: RetailSale[];
  stock: { activeProducts: number; lowStockCount: number; outOfStockCount: number; lowStock: RetailProduct[]; outOfStock: RetailProduct[] };
}
