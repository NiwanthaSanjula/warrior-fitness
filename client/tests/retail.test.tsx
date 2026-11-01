import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router";
import App from "../src/App";
import AppLayout from "../src/components/AppLayout";
import RetailCheckoutPage from "../src/pages/RetailCheckoutPage";
import RetailProductsPage from "../src/pages/RetailProductsPage";
import RetailSalesPage from "../src/pages/RetailSalesPage";
import RetailReceiptPage from "../src/pages/RetailReceiptPage";
import RetailDashboardPage from "../src/pages/RetailDashboardPage";
import { ProductForm, StockForm } from "../src/components/retail/ProductForms";
import { MethodTotals, ClosingSnapshot } from "../src/components/financial/FinancialWidgets";
import { retailApi } from "../src/api/retail.api";
import { membersApi } from "../src/api/members.api";
import { pendingCheckoutKey } from "../src/utils/retail";
import { authState, receptionist, renderWithAuth } from "./helpers/auth";
import { emptyProduct, pendingRetailCheckout, retailDashboard, retailPagination, retailProduct, retailProducts, retailSale, retailSales, stockMovement } from "./fixtures/retail";
import { closingFixture } from "./fixtures/financial";
vi.mock("../src/api/retail.api", () => ({ retailApi: { products: vi.fn(), product: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), stock: vi.fn(), movements: vi.fn(), checkout: vi.fn(), sales: vi.fn(), sale: vi.fn(), dashboard: vi.fn() } }));
vi.mock("../src/api/members.api", () => ({ membersApi: { getMembers: vi.fn() } }));
vi.mock("../src/pages/DashboardPage", () => ({ default: () => <h1>Permitted dashboard</h1> }));
const failure = (message: string, status = 409) => ({ isAxiosError: true, response: { status, data: { message } } });
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
beforeEach(() => {
  sessionStorage.clear();
  Object.values(retailApi).forEach(method => vi.mocked(method).mockReset());
  vi.mocked(retailApi.products).mockResolvedValue(structuredClone(retailProducts));
  vi.mocked(retailApi.product).mockResolvedValue({ success: true, product: { ...retailProduct } });
  vi.mocked(retailApi.createProduct).mockResolvedValue({ success: true, product: { ...retailProduct } });
  vi.mocked(retailApi.updateProduct).mockResolvedValue({ success: true, product: { ...retailProduct, version: 3 } });
  vi.mocked(retailApi.stock).mockResolvedValue({ success: true, product: { ...retailProduct, stock: 15, version: 3 }, movement: { ...stockMovement }, replayed: false });
  vi.mocked(retailApi.movements).mockResolvedValue({ success: true, data: [{ ...stockMovement }], pagination: retailPagination });
  vi.mocked(retailApi.checkout).mockResolvedValue({ success: true, sale: structuredClone(retailSale), replayed: false });
  vi.mocked(retailApi.sales).mockResolvedValue(structuredClone(retailSales));
  vi.mocked(retailApi.sale).mockResolvedValue({ success: true, sale: structuredClone(retailSale) });
  vi.mocked(retailApi.dashboard).mockResolvedValue(structuredClone(retailDashboard));
  vi.mocked(membersApi.getMembers).mockReset().mockResolvedValue({ success: true, data: [{ id: "000000000000000000000202", fullName: "Fictional Member", memberId: "WF-DEMO-MEMBER", isActive: true }], pagination: { page: 1, limit: 5, total: 1, totalPages: 1 } } as never);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
function checkout(role: "ADMIN" | "RECEPTIONIST" = "RECEPTIONIST") { return renderWithAuth(<RetailCheckoutPage />, authState(role)); }
async function add() { fireEvent.click(await screen.findByRole("button", { name: `Add ${retailProduct.name}` })); }
async function cashCart(quantity = "2") { await add(); change(`Quantity for ${retailProduct.name}`, quantity); change("Cash received (LKR)", "1500"); }

describe("retail routing and navigation authorization", () => {
  it("groups all Admin retail routes and highlights only the active child", async () => {
    renderWithAuth(<App />, authState("ADMIN"), "/retail/checkout"); await screen.findByRole("heading", { name: "Point of Sale" });
    expect(screen.getByRole("button", { name: "POS & Retail" })).toHaveAttribute("aria-expanded", "true");
    const links = within(screen.getByRole("list", { name: "POS & Retail pages" })); expect(links.getAllByRole("link")).toHaveLength(4);
    expect(links.getByRole("link", { name: "Point of Sale" })).toHaveAttribute("aria-current", "page"); expect(links.getByRole("link", { name: "Retail Dashboard" })).not.toHaveAttribute("aria-current");
  });
  it("shows only permitted Receptionist links and denies forged Admin reporting", async () => {
    renderWithAuth(<App />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["retail.read", "retail.checkout", "retail.sales.read", "retail.manage"] } }), "/retail");
    await screen.findByRole("heading", { name: "Permitted dashboard" }); fireEvent.click(screen.getByRole("button", { name: "POS & Retail" }));
    const links = within(screen.getByRole("list", { name: "POS & Retail pages" })); expect(links.getAllByRole("link")).toHaveLength(3); expect(links.queryByRole("link", { name: "Retail Dashboard" })).not.toBeInTheDocument(); expect(retailApi.dashboard).not.toHaveBeenCalled();
  });
  it("hides checkout without both product and checkout grants and honors explicit deny-all", async () => {
    const view = renderWithAuth(<AppLayout />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["retail.read"] } }), "/retail/products");
    expect(screen.queryByRole("link", { name: "Point of Sale" })).not.toBeInTheDocument(); expect(screen.getByRole("link", { name: "Products & Inventory" })).toBeInTheDocument(); view.unmount();
    renderWithAuth(<App />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: [] } }), "/retail/checkout");
    await screen.findByRole("heading", { name: "Permitted dashboard" }); expect(screen.queryByRole("button", { name: "POS & Retail" })).not.toBeInTheDocument(); Object.values(retailApi).forEach(method => expect(method).not.toHaveBeenCalled());
  });
  it("requires login on direct retail receipt access", async () => {
    renderWithAuth(<App />, authState(null), `/retail/sales/${retailSale.id}`); await screen.findByRole("button", { name: /SIGN IN/i }); expect(retailApi.sale).not.toHaveBeenCalled();
  });
});

describe("checkout cart, scanners and payments", () => {
  it("renders API products, loading state, real prices and unavailable products", async () => {
    checkout(); expect(screen.getByLabelText("Loading Available products")).toBeInTheDocument(); await screen.findByRole("button", { name: `Add ${retailProduct.name}` });
    expect(screen.getByRole("button", { name: `Add ${emptyProduct.name}` })).toBeDisabled(); expect(screen.getByText("Your cart is empty. Scan or choose a product.")).toBeInTheDocument(); expect(membersApi.getMembers).not.toHaveBeenCalled();
  });
  it("adds, adjusts and removes products with whole-LKR totals and cash change", async () => {
    checkout(); await cashCart(); const cart = within(screen.getByRole("region", { name: "Current sale" }));
    expect(cart.getAllByText(/LKR.*1,000/).length).toBeGreaterThan(0); expect(cart.getByText("Change").parentElement).toHaveTextContent(/LKR.*500/);
    fireEvent.click(screen.getByRole("button", { name: `Increase ${retailProduct.name}` })); expect(screen.getByLabelText(`Quantity for ${retailProduct.name}`)).toHaveValue(3);
    fireEvent.click(screen.getByRole("button", { name: `Decrease ${retailProduct.name}` })); expect(screen.getByLabelText(`Quantity for ${retailProduct.name}`)).toHaveValue(2);
    fireEvent.click(screen.getByRole("button", { name: `Remove ${retailProduct.name}` })); expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled();
  });
  it("supports USB keyboard-style barcode submit and SKU fallback without submitting checkout", async () => {
    checkout(); await screen.findByRole("button", { name: `Add ${retailProduct.name}` });
    vi.mocked(retailApi.products).mockResolvedValueOnce({ success: true, data: [retailProduct], pagination: retailPagination });
    change("Scan barcode or SKU", retailProduct.barcode!); fireEvent.submit(screen.getByRole("form", { name: "Barcode checkout input" }));
    await screen.findByLabelText(`Quantity for ${retailProduct.name}`); expect(retailApi.products).toHaveBeenCalledWith({ barcode: retailProduct.barcode, status: "active", page: 1, limit: 2 }, expect.any(AbortSignal)); expect(retailApi.checkout).not.toHaveBeenCalled();
    vi.mocked(retailApi.products).mockResolvedValueOnce({ success: true, data: [], pagination: retailPagination }).mockResolvedValueOnce({ success: true, data: [retailProduct], pagination: retailPagination });
    change("Scan barcode or SKU", "shake-001"); fireEvent.submit(screen.getByRole("form", { name: "Barcode checkout input" }));
    await waitFor(() => expect(screen.getByLabelText(`Quantity for ${retailProduct.name}`)).toHaveValue(2));
  });
  it("supports the barcode focus shortcut and reports unknown barcodes", async () => {
    checkout(); await screen.findByRole("button", { name: `Add ${retailProduct.name}` });
    fireEvent.keyDown(window, { altKey: true, code: "KeyB" }); expect(screen.getByLabelText("Scan barcode or SKU")).toHaveFocus();
    vi.mocked(retailApi.products).mockResolvedValue({ success: true, data: [], pagination: retailPagination }); change("Scan barcode or SKU", "UNKNOWN"); fireEvent.submit(screen.getByRole("form", { name: "Barcode checkout input" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No active product matches"); expect(retailApi.checkout).not.toHaveBeenCalled();
  });
  it("waits for an in-progress barcode lookup before completing or refreshing the cart", async () => {
    checkout(); await cashCart("1");
    let resolve: (value: typeof retailProducts) => void = () => {};
    vi.mocked(retailApi.products).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    change("Scan barcode or SKU", retailProduct.barcode!); fireEvent.submit(screen.getByRole("form", { name: "Barcode checkout input" }));
    expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Refresh cart prices & stock" })).toBeDisabled(); expect(retailApi.checkout).not.toHaveBeenCalled();
    await act(async () => resolve({ ...retailProducts, data: [retailProduct] }));
    await waitFor(() => expect(screen.getByLabelText(`Quantity for ${retailProduct.name}`)).toHaveValue(2)); expect(screen.getByRole("button", { name: "Complete sale" })).toBeEnabled();
  });
  it("blocks quantities above stock and insufficient/fractional cash", async () => {
    checkout(); await cashCart("11"); expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled(); expect(screen.getByText("Insufficient stock. Reduce this quantity.")).toBeInTheDocument();
    change(`Quantity for ${retailProduct.name}`, "2"); change("Cash received (LKR)", "999"); expect(screen.getByText("Cash short by")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled();
    change("Cash received (LKR)", "1000.5"); expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled();
  });
  it.each(["CARD", "BANK_TRANSFER"] as const)("submits one %s payment with no cash amount or split payment fields", async method => {
    checkout(); await cashCart(); change("Payment method", method); fireEvent.click(screen.getByRole("button", { name: "Complete sale" })); await screen.findByRole("region", { name: "Completed retail receipt" });
    expect(retailApi.checkout).toHaveBeenCalledWith(expect.objectContaining({ method, cashTenderedLkr: null, expectedTotalLkr: 1000, items: [{ productId: retailProduct.id, quantity: 2, expectedUnitPriceLkr: 500 }], memberId: null }));
    expect(vi.mocked(retailApi.checkout).mock.calls[0][0]).not.toHaveProperty("amountLkr");
  });
  it("associates an existing member only when member viewing is permitted", async () => {
    checkout(); await cashCart(); change("Find member", "Fictional"); fireEvent.submit(screen.getByRole("form", { name: "Find retail customer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Fictional Member · WF-DEMO-MEMBER" })); fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    await waitFor(() => expect(retailApi.checkout).toHaveBeenCalledWith(expect.objectContaining({ memberId: "000000000000000000000202" })));
  });
  it("does not request member data or Admin reporting for a restricted Receptionist", async () => {
    renderWithAuth(<RetailCheckoutPage />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["retail.read", "retail.checkout"] } })); await add();
    expect(screen.queryByLabelText("Find member")).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Sales history" })).not.toBeInTheDocument(); expect(membersApi.getMembers).not.toHaveBeenCalled(); expect(retailApi.dashboard).not.toHaveBeenCalled();
  });
  it("prints a real returned receipt, clears cart/recovery and starts a new sale", async () => {
    checkout(); await cashCart(); fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    const receipt = within(await screen.findByRole("region", { name: "Completed retail receipt" })); expect(receipt.getByText(retailSale.saleNumber)).toBeInTheDocument(); expect(receipt.getByText(/16 Jan 2026.*00:30.*Asia\/Colombo/)).toBeInTheDocument();
    expect(receipt.getByText("Cashier: Example Receptionist")).toBeInTheDocument(); expect(receipt.getByText("Customer: Walk-in")).toBeInTheDocument(); expect(sessionStorage.getItem(pendingCheckoutKey(receptionist.id))).toBeNull();
    vi.spyOn(window, "print").mockImplementation(() => {}); fireEvent.click(screen.getByRole("button", { name: "Print retail receipt" })); expect(window.print).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Start next sale" })); expect(screen.getByText("Your cart is empty. Scan or choose a product.")).toBeInTheDocument();
  });
  it("distinguishes catalog failures, retry and successful empty results", async () => {
    vi.mocked(retailApi.products).mockRejectedValueOnce(failure("Shelf unavailable", 503)).mockResolvedValueOnce({ success: true, data: [], pagination: retailPagination });
    checkout(); expect(await screen.findByRole("alert")).toHaveTextContent("Shelf unavailable"); expect(screen.queryByText("No active products match this search.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry Available products" })); await screen.findByText("No active products match this search.");
  });
  it("updates shelf filters and pagination, and refreshes authoritative cart prices explicitly", async () => {
    vi.mocked(retailApi.products).mockResolvedValue({ ...retailProducts, pagination: { page: 1, limit: 8, total: 9, totalPages: 2 } });
    checkout(); await add(); change("Search shelf", "shake"); change("Shelf category", "SUPPLEMENTS"); fireEvent.submit(screen.getByRole("form", { name: "Checkout product filters" }));
    await waitFor(() => expect(retailApi.products).toHaveBeenLastCalledWith(expect.objectContaining({ q: "shake", category: "SUPPLEMENTS", page: 1 }), expect.any(AbortSignal)));
    fireEvent.click(await screen.findByRole("button", { name: "Next checkout catalog page" })); await waitFor(() => expect(retailApi.products).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.any(AbortSignal)));
    vi.mocked(retailApi.product).mockResolvedValue({ success: true, product: { ...retailProduct, sellingPriceLkr: 600 } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh cart prices & stock" })); await screen.findByText(/Cart prices and stock refreshed/); expect(within(screen.getByRole("region", { name: "Current sale" })).getAllByText(/LKR.*600/).length).toBeGreaterThan(0);
  });
});

describe("checkout idempotency and uncertain outcomes", () => {
  it("prevents double submission and freezes the cart while a checkout is pending", async () => {
    let resolve: (result: Awaited<ReturnType<typeof retailApi.checkout>>) => void = () => {};
    vi.mocked(retailApi.checkout).mockReturnValueOnce(new Promise(done => { resolve = done; })); checkout(); await cashCart();
    const button = screen.getByRole("button", { name: "Complete sale" }); fireEvent.click(button); fireEvent.click(button); expect(retailApi.checkout).toHaveBeenCalledOnce(); expect(screen.getByLabelText("Payment method")).toBeDisabled();
    expect(JSON.parse(sessionStorage.getItem(pendingCheckoutKey(receptionist.id))!).expectedTotalLkr).toBe(1000);
    await act(async () => resolve({ success: true, sale: retailSale, replayed: false })); await screen.findByRole("region", { name: "Completed retail receipt" });
  });
  it("retries an uncertain response using exactly the same idempotent payload", async () => {
    vi.mocked(retailApi.checkout).mockRejectedValueOnce(failure("Unconfirmed outcome", 503)).mockResolvedValueOnce({ success: true, sale: retailSale, replayed: true });
    checkout(); await cashCart(); fireEvent.click(screen.getByRole("button", { name: "Complete sale" })); await screen.findByRole("button", { name: "Retry same checkout" });
    expect(screen.getByRole("button", { name: `Add ${retailProduct.name}` })).toBeDisabled(); fireEvent.click(screen.getByRole("button", { name: "Retry same checkout" })); await screen.findByText(/Existing sale recovered/);
    const calls = vi.mocked(retailApi.checkout).mock.calls; expect(calls[1][0]).toEqual(calls[0][0]); expect(sessionStorage.getItem(pendingCheckoutKey(receptionist.id))).toBeNull();
  });
  it("restores pending checkout after remount and isolates recovery by cashier", async () => {
    sessionStorage.setItem(pendingCheckoutKey(receptionist.id), JSON.stringify(pendingRetailCheckout)); const view = checkout();
    expect(screen.getByText("Checkout outcome unconfirmed")).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Retry same checkout" })); await screen.findByRole("region", { name: "Completed retail receipt" }); expect(retailApi.checkout).toHaveBeenCalledWith(pendingRetailCheckout); view.unmount();
    sessionStorage.setItem(pendingCheckoutKey(receptionist.id), JSON.stringify(pendingRetailCheckout)); checkout("ADMIN"); expect(screen.queryByText("Checkout outcome unconfirmed")).not.toBeInTheDocument();
  });
  it("keeps the pending key after lost authorization so a previous successful attempt is not charged again", async () => {
    sessionStorage.setItem(pendingCheckoutKey(receptionist.id), JSON.stringify(pendingRetailCheckout)); vi.mocked(retailApi.checkout).mockRejectedValueOnce(failure("Authorization changed", 403)); checkout(); fireEvent.click(screen.getByRole("button", { name: "Retry same checkout" })); await screen.findByRole("alert");
    expect(sessionStorage.getItem(pendingCheckoutKey(receptionist.id))).not.toBeNull(); expect(screen.getByRole("button", { name: "Retry same checkout" })).toBeInTheDocument();
  });
  it("releases a confirmed stock/price rejection for review without silently changing the cart", async () => {
    vi.mocked(retailApi.checkout).mockRejectedValueOnce(failure("Price changed. Review cart.")); checkout(); await cashCart(); fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Price changed"); expect(screen.getByRole("button", { name: "Complete sale" })).toBeEnabled(); expect(sessionStorage.getItem(pendingCheckoutKey(receptionist.id))).toBeNull(); expect(screen.getByLabelText(`Quantity for ${retailProduct.name}`)).toHaveValue(2);
  });
  it("never submits money when browser recovery cannot be saved", async () => {
    checkout(); await cashCart(); vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("Fictional storage failure"); }); fireEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No sale was submitted"); expect(retailApi.checkout).not.toHaveBeenCalled();
  });
  it("blocks checkout on corrupt pending recovery instead of discarding an uncertain charge", () => {
    sessionStorage.setItem(pendingCheckoutKey(receptionist.id), "corrupt"); checkout(); expect(screen.getByRole("alert")).toHaveTextContent("Pending checkout recovery data is invalid"); expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled(); expect(retailApi.checkout).not.toHaveBeenCalled();
  });
});

describe("Admin product and inventory workflows", () => {
  it("creates a product with unique normalized codes, whole price and opening stock", async () => {
    const saved = vi.fn(); renderWithAuth(<ProductForm saved={saved} />, authState("ADMIN"));
    change("Product name", "New example snack"); change("SKU", " snack-001 "); change("Barcode (optional)", "1234567890"); change("Selling price (LKR)", "250"); change("Initial stock quantity", "20");
    fireEvent.submit(screen.getByRole("form", { name: "Create retail product" }));
    await waitFor(() => expect(saved).toHaveBeenCalled()); expect(retailApi.createProduct).toHaveBeenCalledWith(expect.objectContaining({ sku: "SNACK-001", barcode: "1234567890", sellingPriceLkr: 250, initialStock: 20, isActive: true }));
  });
  it("validates fractional prices and surfaces duplicate SKU/barcode errors", async () => {
    renderWithAuth(<ProductForm saved={vi.fn()} />, authState("ADMIN")); change("Product name", "Example product"); change("SKU", "DEMO-001"); change("Selling price (LKR)", "1.5");
    fireEvent.submit(screen.getByRole("form", { name: "Create retail product" })); await screen.findByRole("alert"); expect(retailApi.createProduct).not.toHaveBeenCalled();
    change("Selling price (LKR)", "500"); vi.mocked(retailApi.createProduct).mockRejectedValueOnce(failure("SKU or barcode is already registered")); fireEvent.submit(screen.getByRole("form", { name: "Create retail product" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("SKU or barcode is already registered"));
  });
  it("edits price, supplier and activation without writing stock through the profile form", async () => {
    renderWithAuth(<ProductForm item={retailProduct} saved={vi.fn()} />, authState("ADMIN")); change("Selling price (LKR)", "600"); fireEvent.click(screen.getByLabelText("Active and available for sale"));
    fireEvent.submit(screen.getByRole("form", { name: "Edit retail product" })); await waitFor(() => expect(retailApi.updateProduct).toHaveBeenCalledWith(retailProduct, expect.objectContaining({ sellingPriceLkr: 600, isActive: false })));
    expect(screen.queryByLabelText("Initial stock quantity")).not.toBeInTheDocument(); expect(retailApi.stock).not.toHaveBeenCalled();
  });
  it("records a reasoned stock correction with the selected version and confirmation", async () => {
    const done = vi.fn(); renderWithAuth(<StockForm item={retailProduct} done={done} />, authState("ADMIN")); change("Stock operation", "ADJUSTMENT"); change("Quantity change", "-2"); change("Stock movement reason", "Fictional damaged items");
    fireEvent.submit(screen.getByRole("form", { name: "Record stock movement" })); await waitFor(() => expect(done).toHaveBeenCalled());
    expect(retailApi.stock).toHaveBeenCalledWith(retailProduct.id, { kind: "ADJUSTMENT", change: -2, reason: "Fictional damaged items", version: 2, requestId: expect.any(String) }); expect(window.confirm).toHaveBeenCalled();
  });
  it("rejects invalid restocks/reasons and cancels declined confirmations", async () => {
    renderWithAuth(<StockForm item={retailProduct} done={vi.fn()} />, authState("ADMIN")); change("Quantity change", "-2"); change("Stock movement reason", "Valid explanation"); fireEvent.submit(screen.getByRole("form", { name: "Record stock movement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Restocking must add stock"); expect(retailApi.stock).not.toHaveBeenCalled();
    change("Quantity change", "2"); change("Stock movement reason", "bad"); fireEvent.submit(screen.getByRole("form", { name: "Record stock movement" })); await waitFor(() => expect(retailApi.stock).not.toHaveBeenCalled());
    change("Stock movement reason", "Valid explanation"); vi.mocked(window.confirm).mockReturnValueOnce(false); fireEvent.submit(screen.getByRole("form", { name: "Record stock movement" })); expect(retailApi.stock).not.toHaveBeenCalled();
  });
  it("retries an uncertain stock operation without generating a different request key", async () => {
    vi.mocked(retailApi.stock).mockRejectedValueOnce(failure("Outcome unconfirmed", 503)); renderWithAuth(<StockForm item={retailProduct} done={vi.fn()} />, authState("ADMIN"));
    change("Quantity change", "5"); change("Stock movement reason", "Example supplier delivery"); fireEvent.submit(screen.getByRole("form", { name: "Record stock movement" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry same stock request" })); await waitFor(() => expect(retailApi.stock).toHaveBeenCalledTimes(2));
    expect(vi.mocked(retailApi.stock).mock.calls[1]).toEqual(vi.mocked(retailApi.stock).mock.calls[0]);
  });
  it("renders full Admin product/history controls and applies inventory filters", async () => {
    renderWithAuth(<RetailProductsPage />, authState("ADMIN"), `/retail/products?product=${retailProduct.id}`);
    await screen.findByRole("form", { name: "Edit retail product" }); expect(screen.getByLabelText("Supplier contact")).toHaveValue("Private supplier contact"); await screen.findByText(stockMovement.reason);
    expect(screen.getByText("10 → 15")).toBeInTheDocument(); change("Search retail products", "shake"); change("Product category", "SUPPLEMENTS"); change("Stock availability", "low"); change("Product status", "all"); fireEvent.submit(screen.getByRole("form", { name: "Retail product filters" }));
    await waitFor(() => expect(retailApi.products).toHaveBeenLastCalledWith(expect.objectContaining({ q: "shake", stock: "low", category: "SUPPLEMENTS", status: "all", page: 1 }), expect.any(AbortSignal)));
  });
  it("hides sensitive product fields, history and stock controls from Receptionists", async () => {
    renderWithAuth(<RetailProductsPage />, authState("RECEPTIONIST"), `/retail/products?product=${retailProduct.id}`); await screen.findByRole("button", { name: "Close product" });
    expect(screen.queryByRole("button", { name: "New product" })).not.toBeInTheDocument(); expect(screen.queryByLabelText("Supplier contact")).not.toBeInTheDocument(); expect(screen.queryByRole("form", { name: "Record stock movement" })).not.toBeInTheDocument(); expect(retailApi.movements).not.toHaveBeenCalled();
  });
  it("isolates history failure from product details and supports history retry", async () => {
    vi.mocked(retailApi.movements).mockRejectedValueOnce(failure("Stock history unavailable", 503)); renderWithAuth(<RetailProductsPage />, authState("ADMIN"), `/retail/products?product=${retailProduct.id}`); await screen.findByRole("form", { name: "Edit retail product" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Stock history unavailable"); fireEvent.click(screen.getByRole("button", { name: "Retry Stock movement history" })); await screen.findByText(stockMovement.reason);
  });
});

describe("sales reporting, receipts and Finance compatibility", () => {
  it("paginates/searches own sales and links to original receipts", async () => {
    vi.mocked(retailApi.sales).mockResolvedValue({ ...retailSales, pagination: { page: 1, limit: 12, total: 13, totalPages: 2 } }); renderWithAuth(<RetailSalesPage />, authState("RECEPTIONIST"));
    expect(await screen.findByRole("link", { name: "View receipt" })).toHaveAttribute("href", `/retail/sales/${retailSale.id}`); expect(screen.getByText(/Other cashiers' sales are not available/)).toBeInTheDocument();
    change("Search sales", "DEMO"); change("Sales payment method", "CASH"); fireEvent.submit(screen.getByRole("form", { name: "Retail sales filters" }));
    await waitFor(() => expect(retailApi.sales).toHaveBeenLastCalledWith(expect.objectContaining({ q: "DEMO", method: "CASH", page: 1 }), expect.any(AbortSignal)));
    fireEvent.click(await screen.findByRole("button", { name: "Next retail sales page" })); await waitFor(() => expect(retailApi.sales).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.any(AbortSignal)));
  });
  it("loads a protected printable receipt and surfaces unavailable/other-cashier records", async () => {
    const view = renderWithAuth(<Routes><Route path="/retail/sales/:id" element={<RetailReceiptPage />} /></Routes>, authState("RECEPTIONIST"), `/retail/sales/${retailSale.id}`); await screen.findByRole("button", { name: "Print retail receipt" }); view.unmount();
    vi.mocked(retailApi.sale).mockRejectedValueOnce(failure("Sale not found or unavailable", 404)); renderWithAuth(<Routes><Route path="/retail/sales/:id" element={<RetailReceiptPage />} /></Routes>, authState("RECEPTIONIST"), `/retail/sales/${retailSale.id}`); expect(await screen.findByRole("alert")).toHaveTextContent("Sale not found or unavailable");
  });
  it("renders API-backed reports, meaningful charts and actionable queues", async () => {
    renderWithAuth(<RetailDashboardPage />, authState("ADMIN")); expect(screen.getByLabelText("Loading Today's retail collections")).toBeInTheDocument();
    await screen.findByRole("figure", { name: "Retail daily collections" }); expect(screen.getByRole("link", { name: "1. Example protein shake" })).toHaveAttribute("href", `/retail/products?product=${retailProduct.id}`); expect(screen.getByRole("link", { name: /Example water.*WATER-001/ })).toHaveAttribute("href", `/retail/products?product=${emptyProduct.id}`);
    expect(screen.getByText("2 units")).toBeInTheDocument(); change("Report from", "2026-01-10"); change("Report to", "2026-01-16"); fireEvent.submit(screen.getByRole("form", { name: "Retail report period" }));
    await waitFor(() => expect(retailApi.dashboard).toHaveBeenLastCalledWith({ from: "2026-01-10", to: "2026-01-16" }, expect.any(AbortSignal)));
  });
  it("does not present failed reports as zero sales and supports refresh/retry", async () => {
    vi.mocked(retailApi.dashboard).mockRejectedValueOnce(failure("Report unavailable", 503)); renderWithAuth(<RetailDashboardPage />, authState("ADMIN"));
    await screen.findAllByRole("alert"); expect(screen.queryByText("No retail transactions in this period.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry Today's retail collections" })); await screen.findByRole("figure", { name: "Retail daily collections" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh retail dashboard" })); await waitFor(() => expect(retailApi.dashboard).toHaveBeenCalledTimes(3));
  });
  it("shows successful empty reports and blocks standalone Receptionist report requests", async () => {
    vi.mocked(retailApi.dashboard).mockResolvedValue({ ...retailDashboard, recent: [], bestSelling: [], summary: { amountLkr: 0, count: 0, units: 0 } }); const view = renderWithAuth(<RetailDashboardPage />, authState("ADMIN")); await screen.findByText("No retail transactions in this period."); expect(screen.getByText("No products sold in this period.")).toBeInTheDocument(); view.unmount();
    vi.mocked(retailApi.dashboard).mockClear(); renderWithAuth(<RetailDashboardPage />, authState("RECEPTIONIST")); expect(screen.getByRole("alert")).toHaveTextContent("Admin access is required"); expect(retailApi.dashboard).not.toHaveBeenCalled();
  });
  it("shows membership, POS and combined method totals without changing legacy snapshots", () => {
    const mixed = { ...closingFixture.totals, collections: { CASH: 7000, BANK_TRANSFER: 6000, CARD: 4000 }, membershipCollections: { CASH: 5000, BANK_TRANSFER: 2000, CARD: 1000 }, retailCollections: { CASH: 2000, BANK_TRANSFER: 4000, CARD: 3000 }, retailSaleCount: 3 };
    const view = renderWithAuth(<MethodTotals totals={mixed} />, authState("ADMIN")); const cash = within(screen.getByRole("row", { name: /Cash LKR/ }));
    expect(cash.getAllByRole("cell").map(cell => cell.textContent)).toEqual(["LKR 5,000", "LKR 2,000", "LKR 7,000", "LKR 2,000"]); expect(screen.getByText(/3 retail sales/)).toBeInTheDocument(); view.unmount();
    const original = structuredClone(closingFixture); renderWithAuth(<ClosingSnapshot closing={closingFixture} />, authState("ADMIN")); expect(screen.getByText("Legacy membership-only snapshot. Original closing amounts are preserved.")).toBeInTheDocument(); expect(closingFixture).toEqual(original);
  });
});
