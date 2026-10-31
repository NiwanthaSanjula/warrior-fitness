import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import AppLayout from "../src/components/AppLayout";
import ExpenseManagementPage from "../src/pages/ExpenseManagementPage";
import DailyCashClosingPage from "../src/pages/DailyCashClosingPage";
import ClosingHistoryPage from "../src/pages/ClosingHistoryPage";
import { financialApi } from "../src/api/financial.api";
import type { ExpenseRecord, FinancialWrite } from "../src/types/financial";
import { cashPreview } from "../src/utils/financial";
import { authState, receptionist, renderWithAuth } from "./helpers/auth";
import { closingFixture, dayFixture, expenseFixture, expenseListFixture, historyFixture } from "./fixtures/financial";

vi.mock("../src/api/financial.api", () => ({ financialApi: { getExpenses: vi.fn(), createExpense: vi.fn(), getDay: vi.fn(), closeDay: vi.fn(), getClosings: vi.fn() } }));
vi.mock("../src/pages/DashboardPage", () => ({ default: () => <h1>Permitted dashboard</h1> }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-01-15T06:00:00.000Z"));
  vi.mocked(financialApi.getExpenses).mockReset().mockResolvedValue(structuredClone(expenseListFixture));
  vi.mocked(financialApi.createExpense).mockReset().mockResolvedValue({ success: true, data: structuredClone(expenseFixture), replayed: false });
  vi.mocked(financialApi.getDay).mockReset().mockResolvedValue(structuredClone(dayFixture));
  vi.mocked(financialApi.closeDay).mockReset().mockResolvedValue({ success: true, data: structuredClone(closingFixture), replayed: false });
  vi.mocked(financialApi.getClosings).mockReset().mockResolvedValue(structuredClone(historyFixture));
});
afterEach(() => vi.useRealTimers());
const apiRejected = (message: string) => ({ isAxiosError: true, response: { status: 409, data: { message } } });
function fillExpense(amount = "2000") {
  fireEvent.change(screen.getByLabelText("Amount (LKR)"), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Fictional gym rent" } });
}
function fillClosing(explanation = "Fictional cash shortage") {
  fireEvent.change(screen.getByLabelText("Opening cash (LKR)"), { target: { value: "3000" } });
  fireEvent.change(screen.getByLabelText("Actual physical closing cash (LKR)"), { target: { value: "10800" } });
  fireEvent.change(screen.getByLabelText(/Discrepancy explanation/), { target: { value: explanation } });
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("financial authorization and navigation", () => {
  it.each(["/expenses", "/cash-closing", "/closing-history"])("denies Receptionist direct access to %s even with forged grants", async (path) => {
    renderWithAuth(<App />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["expenses.manage", "cash-closings.manage"] } }), path);
    expect(await screen.findByRole("heading", { name: "Permitted dashboard" })).toBeInTheDocument();
    Object.values(financialApi).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    expect(screen.queryByText("Expense Management")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Daily Cash Closing" })).not.toBeInTheDocument();
  });
  it("groups all four Admin financial destinations under Finance", () => {
    renderWithAuth(<AppLayout />, authState("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    const finance = within(screen.getByRole("list", { name: "Finance pages" }));
    expect(finance.getByRole("link", { name: "Payments & Invoices" })).toHaveAttribute("href", "/payments");
    expect(finance.getByRole("link", { name: "Expense Management" })).toHaveAttribute("href", "/expenses");
    expect(finance.getByRole("link", { name: "Daily Cash Closing" })).toHaveAttribute("href", "/cash-closing");
    expect(finance.getByRole("link", { name: "Closing History" })).toHaveAttribute("href", "/closing-history");
  });
  it.each([ExpenseManagementPage, DailyCashClosingPage, ClosingHistoryPage])("page-level checks do not fetch financial data for Receptionists", (Page) => {
    renderWithAuth(<Page />, authState("RECEPTIONIST"));
    expect(screen.getByRole("alert")).toHaveTextContent("Admin access is required");
    Object.values(financialApi).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
});

describe("expense operations", () => {
  it("renders real returned rows, whole LKR, category/method summaries and responsible staff", async () => {
    renderWithAuth(<ExpenseManagementPage />, authState("ADMIN"));
    const table = within(await screen.findByRole("table", { name: "Expense records" }));
    expect(table.getByText("15 Jan 2026")).toBeInTheDocument();
    expect(table.getByText("Fictional gym rent")).toBeInTheDocument();
    expect(table.getByText("LKR 2,000")).toBeInTheDocument();
    expect(table.getByText("Example Admin")).toBeInTheDocument();
    expect(screen.getByText("Expenses by category")).toBeInTheDocument();
    expect(financialApi.getExpenses).toHaveBeenCalledWith(expect.objectContaining({ from: "2025-12-17", to: "2026-01-15", page: 1, limit: 20 }), expect.any(AbortSignal));
  });
  it("submits a validated expense with a generated idempotency key and refreshes the ledger", async () => {
    renderWithAuth(<ExpenseManagementPage />, authState("ADMIN"));
    await screen.findByRole("table", { name: "Expense records" });
    fillExpense(); fireEvent.submit(screen.getByRole("form", { name: "Record expense" }));
    await waitFor(() => expect(financialApi.createExpense).toHaveBeenCalledOnce());
    expect(financialApi.createExpense).toHaveBeenCalledWith({ category: "RENT", description: "Fictional gym rent", amountLkr: 2000, method: "CASH", expenseDate: "2026-01-15", reference: "", requestId: expect.stringMatching(/^[a-f0-9-]{36}$/) });
    await waitFor(() => expect(financialApi.getExpenses).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status")).toHaveTextContent("Expense recorded successfully");
  });
  it.each(["0", "1.5", "10000001"])("does not submit invalid whole LKR amount %s", async (amount) => {
    renderWithAuth(<ExpenseManagementPage />, authState("ADMIN"));
    await screen.findByRole("table", { name: "Expense records" });
    fillExpense(amount); fireEvent.submit(screen.getByRole("form", { name: "Record expense" }));
    expect(screen.getByRole("alert")).toBeInTheDocument(); expect(financialApi.createExpense).not.toHaveBeenCalled();
  });
  it("prevents double submission while a request is pending", async () => {
    let resolve!: (value: FinancialWrite<ExpenseRecord>) => void;
    vi.mocked(financialApi.createExpense).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    renderWithAuth(<ExpenseManagementPage />, authState("ADMIN"));
    await screen.findByRole("table", { name: "Expense records" });
    fillExpense(); fireEvent.submit(screen.getByRole("form", { name: "Record expense" }));
    fireEvent.submit(screen.getByRole("form", { name: "Record expense" }));
    expect(financialApi.createExpense).toHaveBeenCalledOnce();
    await act(async () => resolve({ success: true, replayed: false, data: expenseFixture }));
  });
  it("retains the exact expense key and frozen payload after an unknown outcome", async () => {
    vi.mocked(financialApi.createExpense).mockRejectedValueOnce(new Error("Fictional connection loss"));
    renderWithAuth(<ExpenseManagementPage />, authState("ADMIN"));
    await screen.findByRole("table", { name: "Expense records" });
    fillExpense(); fireEvent.submit(screen.getByRole("form", { name: "Record expense" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry same expense" }));
    await waitFor(() => expect(financialApi.createExpense).toHaveBeenCalledTimes(2));
    expect(vi.mocked(financialApi.createExpense).mock.calls[1][0]).toBe(vi.mocked(financialApi.createExpense).mock.calls[0][0]);
  });
  it("shows a closed-period rejection and lets the user correct the rejected draft", async () => {
    vi.mocked(financialApi.createExpense).mockRejectedValueOnce(apiRejected("Financial day is closed"));
    renderWithAuth(<ExpenseManagementPage />, authState("ADMIN"));
    await screen.findByRole("table", { name: "Expense records" });
    fillExpense(); fireEvent.submit(screen.getByRole("form", { name: "Record expense" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Financial day is closed");
    expect(screen.getByLabelText("Amount (LKR)")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Retry same expense" })).not.toBeInTheDocument();
  });
  it("applies search/category/method filters and requests another result page", async () => {
    vi.mocked(financialApi.getExpenses).mockResolvedValue({ ...expenseListFixture, pagination: { page: 1, limit: 20, total: 21, totalPages: 2 } });
    renderWithAuth(<ExpenseManagementPage />, authState("ADMIN"));
    await screen.findByRole("table", { name: "Expense records" });
    fireEvent.change(screen.getByLabelText("Search expenses"), { target: { value: "rent" } });
    fireEvent.change(screen.getByLabelText("Filter category"), { target: { value: "RENT" } });
    fireEvent.change(screen.getByLabelText("Filter method"), { target: { value: "CASH" } });
    fireEvent.submit(screen.getByRole("form", { name: "Expense filters" }));
    await waitFor(() => expect(financialApi.getExpenses).toHaveBeenLastCalledWith(expect.objectContaining({ search: "rent", category: "RENT", method: "CASH", page: 1 }), expect.any(AbortSignal)));
    await screen.findByRole("table", { name: "Expense records" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(financialApi.getExpenses).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.any(AbortSignal)));
  });
  it("distinguishes initial loading, failed reads, retry and genuine empty results", async () => {
    vi.mocked(financialApi.getExpenses).mockRejectedValueOnce(new Error("Example failure")).mockResolvedValueOnce({ ...expenseListFixture, data: [], summary: { amountLkr: 0, count: 0 }, pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    renderWithAuth(<ExpenseManagementPage />, authState("ADMIN"));
    expect(screen.getByRole("status", { name: "Loading Expense ledger" })).toBeInTheDocument();
    const retry = await screen.findByRole("button", { name: "Retry Expense ledger" });
    expect(screen.queryByText("Filtered expense total")).not.toBeInTheDocument();
    fireEvent.click(retry);
    expect(await screen.findByText("No expenses match these filters.")).toBeInTheDocument();
  });
});

describe("daily cash closing", () => {
  it("separates Bank Transfer/Card and previews the cash-only shortage", async () => {
    renderWithAuth(<DailyCashClosingPage />, authState("ADMIN"));
    await screen.findByRole("table", { name: "Collections and expenses by method" });
    fillClosing();
    expect(screen.getByText("LKR 11,000")).toBeInTheDocument();
    expect(screen.getByText("Shortage")).toBeInTheDocument(); expect(screen.getByText("LKR 200")).toBeInTheDocument();
    expect(screen.getByText("LKR 50,000")).toBeInTheDocument(); expect(screen.getByText("LKR 25,000")).toBeInTheDocument();
    expect(cashPreview("", "", dayFixture.totals)).toEqual({ expected: null, variance: null });
  });
  it("requires a discrepancy explanation and explicit finalization confirmation", async () => {
    renderWithAuth(<DailyCashClosingPage />, authState("ADMIN"));
    await screen.findByRole("form", { name: "Finalize daily closing" });
    fillClosing(""); fireEvent.submit(screen.getByRole("form", { name: "Finalize daily closing" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Explain the cash shortage");
    expect(financialApi.closeDay).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Discrepancy explanation/), { target: { value: "Fictional count difference" } });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.submit(screen.getByRole("form", { name: "Finalize daily closing" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Confirm all entries");
    expect(financialApi.closeDay).not.toHaveBeenCalled();
  });
  it("sends the preview revision and displays the saved snapshot without edit controls", async () => {
    renderWithAuth(<DailyCashClosingPage />, authState("ADMIN"));
    await screen.findByRole("form", { name: "Finalize daily closing" });
    fillClosing(); fireEvent.submit(screen.getByRole("form", { name: "Finalize daily closing" }));
    expect(await screen.findByRole("region", { name: "Completed closing" })).toBeInTheDocument();
    expect(financialApi.closeDay).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-01-15", expectedRevision: 3, openingCashLkr: 3000, actualCashLkr: 10800, explanation: "Fictional cash shortage", requestId: expect.any(String) }));
    expect(screen.queryByRole("form", { name: "Finalize daily closing" })).not.toBeInTheDocument();
    expect(screen.getByText(/15 Jan 2026, 19:30/)).toBeInTheDocument();
  });
  it("reads completed dates from frozen snapshots rather than offering another closing", async () => {
    vi.mocked(financialApi.getDay).mockResolvedValue({ success: true, status: "CLOSED", closing: closingFixture });
    renderWithAuth(<DailyCashClosingPage />, authState("ADMIN"), "/cash-closing?date=2026-01-15");
    await screen.findByRole("region", { name: "Completed closing" });
    expect(screen.getByText("Completed · Read-only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalize closing" })).not.toBeInTheDocument();
    expect(financialApi.closeDay).not.toHaveBeenCalled();
  });
  it("reports changed-ledger conflicts and refreshes the preview on request", async () => {
    vi.mocked(financialApi.closeDay).mockRejectedValueOnce(apiRejected("The ledger changed. Refresh the day."));
    renderWithAuth(<DailyCashClosingPage />, authState("ADMIN"));
    await screen.findByRole("form", { name: "Finalize daily closing" });
    fillClosing(); fireEvent.submit(screen.getByRole("form", { name: "Finalize daily closing" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ledger changed");
    fireEvent.click(screen.getByRole("button", { name: "Refresh day" }));
    await waitFor(() => expect(financialApi.getDay).toHaveBeenCalledTimes(2));
  });
  it("retries uncertain closing outcomes with the same key and prevents changing dates meanwhile", async () => {
    vi.mocked(financialApi.closeDay).mockRejectedValueOnce(new Error("Fictional timeout"));
    renderWithAuth(<DailyCashClosingPage />, authState("ADMIN"));
    await screen.findByRole("form", { name: "Finalize daily closing" });
    fillClosing(); fireEvent.submit(screen.getByRole("form", { name: "Finalize daily closing" }));
    const retry = await screen.findByRole("button", { name: "Retry same closing" });
    expect(screen.getByLabelText("Gym date")).toBeDisabled(); expect(screen.getByRole("button", { name: "Refresh day" })).toBeDisabled();
    fireEvent.click(retry);
    await waitFor(() => expect(financialApi.closeDay).toHaveBeenCalledTimes(2));
    expect(vi.mocked(financialApi.closeDay).mock.calls[1][0]).toBe(vi.mocked(financialApi.closeDay).mock.calls[0][0]);
  });
  it("does not show a closing form or false zero cash while the preview fails", async () => {
    vi.mocked(financialApi.getDay).mockRejectedValueOnce(new Error("Fictional unavailable ledger"));
    renderWithAuth(<DailyCashClosingPage />, authState("ADMIN"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load day reconciliation");
    expect(screen.queryByRole("form", { name: "Finalize daily closing" })).not.toBeInTheDocument();
    expect(screen.queryByText("LKR 0")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry Day reconciliation" }));
    expect(await screen.findByRole("form", { name: "Finalize daily closing" })).toBeInTheDocument();
  });
});

describe("closing history", () => {
  it("renders immutable amounts and links to the date-specific snapshot", async () => {
    renderWithAuth(<ClosingHistoryPage />, authState("ADMIN"));
    const table = within(await screen.findByRole("table", { name: "Closing history records" }));
    expect(table.getByText("Shortage · LKR 200")).toBeInTheDocument();
    expect(table.getByRole("link", { name: "View closing" })).toHaveAttribute("href", "/cash-closing?date=2026-01-15");
    expect(screen.queryByRole("button", { name: /edit|delete/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh history" }));
    await waitFor(() => expect(financialApi.getClosings).toHaveBeenCalledTimes(2));
  });
  it("handles an empty period and applies a different period", async () => {
    vi.mocked(financialApi.getClosings).mockResolvedValue({ ...historyFixture, data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    renderWithAuth(<ClosingHistoryPage />, authState("ADMIN"));
    expect(await screen.findByText("No completed closings in this period.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.submit(screen.getByRole("form", { name: "Closing history filters" }));
    await waitFor(() => expect(financialApi.getClosings).toHaveBeenLastCalledWith({ from: "2026-01-01", to: "2026-01-15", page: 1, limit: 20 }, expect.any(AbortSignal)));
  });
});
