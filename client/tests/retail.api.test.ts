import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api/api";
import { retailApi } from "../src/api/retail.api";
import { pendingRetailCheckout, retailProduct } from "./fixtures/retail";
import { productProfileSchema } from "../src/validations/retail.schema";
vi.mock("../src/api/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
beforeEach(() => { Object.values(api).forEach(method => vi.mocked(method).mockResolvedValue({ data: { success: true } })); });
describe("retail API adapters", () => {
  it("uses existing Axios with exact barcode/SKU filters and abort signals", async () => {
    const signal = new AbortController().signal;
    await retailApi.products({ barcode: "1234567890123", limit: 2 }, signal); expect(api.get).toHaveBeenCalledWith("/retail/products", { params: { barcode: "1234567890123", limit: 2 }, signal });
    await retailApi.products({ sku: "SHAKE-001", limit: 2 }, signal); expect(api.get).toHaveBeenLastCalledWith("/retail/products", { params: { sku: "SHAKE-001", limit: 2 }, signal });
  });
  it("sends the product's current version for profile edits without stock or derived financial fields", async () => {
    await retailApi.updateProduct(retailProduct, productProfileSchema.parse(retailProduct));
    expect(api.put).toHaveBeenCalledWith(`/retail/products/${retailProduct.id}`, expect.objectContaining({ version: 2, sellingPriceLkr: 500 }));
    expect(vi.mocked(api.put).mock.calls[0][1]).not.toHaveProperty("stock");
  });
  it("posts checkout only to the separate retail endpoint, preserving its idempotency key", async () => {
    await retailApi.checkout(pendingRetailCheckout); expect(api.post).toHaveBeenCalledExactlyOnceWith("/retail/checkout", pendingRetailCheckout);
  });
  it("preserves stock request/version and uses read endpoints for history and reports", async () => {
    const input = { kind: "RESTOCK" as const, change: 5, reason: "Example delivery", version: 2, requestId: "11111111-1111-4111-8111-111111111111" };
    await retailApi.stock(retailProduct.id, input); expect(api.post).toHaveBeenCalledWith(`/retail/products/${retailProduct.id}/stock`, input);
    const signal = new AbortController().signal;
    await retailApi.movements(retailProduct.id, 2, signal); expect(api.get).toHaveBeenLastCalledWith(`/retail/products/${retailProduct.id}/movements`, { params: { page: 2, limit: 10 }, signal });
    await retailApi.dashboard({ from: "2026-01-10", to: "2026-01-16" }, signal); expect(api.get).toHaveBeenLastCalledWith("/retail/dashboard", { params: { from: "2026-01-10", to: "2026-01-16" }, signal });
  });
});
