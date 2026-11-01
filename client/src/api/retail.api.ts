import { api } from "./api";
import type { CheckoutInput, CheckoutResult, ProductFilters, ProductProfile, ProductResult, RetailDashboard, RetailList, RetailProduct, RetailSale, SalesFilters, SalesResult, StockInput, StockMovement } from "../types/retail";
const productPath = (id: string) => `/retail/products/${encodeURIComponent(id)}`;
export const retailApi = {
  async products(params: ProductFilters, signal?: AbortSignal): Promise<RetailList<RetailProduct>> { return (await api.get("/retail/products", { params, signal })).data; },
  async product(id: string, signal?: AbortSignal): Promise<ProductResult> { return (await api.get(productPath(id), { signal })).data; },
  async createProduct(input: ProductProfile & { initialStock: number }): Promise<ProductResult> { return (await api.post("/retail/products", input)).data; },
  async updateProduct(item: RetailProduct, input: ProductProfile): Promise<ProductResult> { return (await api.put(productPath(item.id), { ...input, version: item.version })).data; },
  async stock(id: string, input: StockInput): Promise<ProductResult & { movement: StockMovement; replayed: boolean }> { return (await api.post(`${productPath(id)}/stock`, input)).data; },
  async movements(id: string, page: number, signal?: AbortSignal): Promise<RetailList<StockMovement>> { return (await api.get(`${productPath(id)}/movements`, { params: { page, limit: 10 }, signal })).data; },
  async checkout(input: CheckoutInput): Promise<CheckoutResult> { return (await api.post("/retail/checkout", input)).data; },
  async sales(params: SalesFilters, signal?: AbortSignal): Promise<SalesResult> { return (await api.get("/retail/sales", { params, signal })).data; },
  async sale(id: string, signal?: AbortSignal): Promise<{ success: boolean; sale: RetailSale }> { return (await api.get(`/retail/sales/${encodeURIComponent(id)}`, { signal })).data; },
  async dashboard(params: { from: string; to: string }, signal?: AbortSignal): Promise<RetailDashboard> { return (await api.get("/retail/dashboard", { params, signal })).data; },
};
