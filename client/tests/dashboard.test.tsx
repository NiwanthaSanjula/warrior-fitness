import { financialApi } from "../src/api/financial.api";
import { equipmentApi } from "../src/api/equipment.api";
import { retailApi } from "../src/api/retail.api";
import { notificationsApi } from "../src/api/notifications.api";
import { commandDay, commandEquipment, commandFaults, commandRetail, commandOwnSales, commandScheduler } from "./fixtures/command-center";
import { closingFixture } from "./fixtures/financial";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../src/auth/auth-context";
import type { Permission } from "../src/auth/permissions";
import { MemoryRouter } from "react-router";
import DashboardPage from "../src/pages/DashboardPage";
import { reportsApi } from "../src/api/reports.api";
import { attentionApi } from "../src/api/attention.api";
import { attendanceApi } from "../src/api/attendance.api";
import { authState, receptionist, renderWithAuth } from "./helpers/auth";
import { activeFixture, activityFixture, attendanceFixture, collectionsFixture, dueFixture, expiringFixture, gymDate, outstandingFixture, receivablesFixture } from "./fixtures/dashboard";
import type { AttendanceSummaryResponse } from "../src/types/attendance";

vi.mock("../src/api/reports.api", () => ({ reportsApi: { getActiveMembers: vi.fn(), getCollections: vi.fn(), getReceivables: vi.fn(), getInvoices: vi.fn(), getMembershipActivity: vi.fn(), getAttendanceTrends: vi.fn() } }));
vi.mock("../src/api/attention.api", () => ({ attentionApi: { getExpiring: vi.fn(), getOutstanding: vi.fn(), getDueFollowUps: vi.fn() } }));
vi.mock("../src/api/attendance.api", () => ({ attendanceApi: { getSummary: vi.fn() } }));

vi.mock("../src/api/financial.api", () => ({ financialApi: { getDay: vi.fn() } }));
vi.mock("../src/api/equipment.api", () => ({ equipmentApi: { dashboard: vi.fn(), alerts: vi.fn() } }));
vi.mock("../src/api/retail.api", () => ({ retailApi: { dashboard: vi.fn(), sales: vi.fn() } }));
vi.mock("../src/api/notifications.api", () => ({ notificationsApi: { automationStatus: vi.fn() } }));

const metric = (name: string) => within(screen.getByRole("article", { name }));
const panel = (name: string) => {
  const tabs: Record<string, string> = { "Expiring memberships": "Expiring", "Overdue payments": "Overdue", "Follow-ups due": "Follow-ups" };
  if (tabs[name]) {
    const tab = screen.getByRole("tab", { name: new RegExp(tabs[name]) });
    if (tab.getAttribute("aria-selected") !== "true") fireEvent.click(tab);
    return within(screen.getByRole("tabpanel", { name: new RegExp(tabs[name]) }));
  }
  if(name === "Equipment faults") { if (!screen.getByText("Fault details").closest("details")!.open) fireEvent.click(screen.getByText("Fault details")); return within(screen.getByRole("region", {name:"Equipment readiness"}).querySelector('details:last-child')!); }
  if(name === "Latest retail sales") { if (!screen.getByText("Recent retail receipts").closest("details")!.open) fireEvent.click(screen.getByText("Recent retail receipts")); return within(screen.getByText("Recent retail receipts").closest("details")!); }
  return within(screen.getByRole("region", { name }));
};
const recState = (permissions: Permission[]) => authState("RECEPTIONIST", { staff: { ...receptionist, permissions } });
const assertNoReports = () => Object.values(reportsApi).forEach((method) => expect(method).not.toHaveBeenCalled());

async function settled() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh dashboard" })).toBeEnabled());
}

beforeEach(() => {
  vi.mocked(financialApi.getDay).mockReset().mockResolvedValue(structuredClone(commandDay));
  vi.mocked(equipmentApi.dashboard).mockReset().mockResolvedValue(structuredClone(commandEquipment));
  vi.mocked(equipmentApi.alerts).mockReset().mockResolvedValue(structuredClone(commandFaults));
  vi.mocked(retailApi.dashboard).mockReset().mockResolvedValue(structuredClone(commandRetail));
  vi.mocked(retailApi.sales).mockReset().mockResolvedValue(structuredClone(commandOwnSales));
  vi.mocked(notificationsApi.automationStatus).mockReset().mockResolvedValue({ success: true, scheduler: structuredClone(commandScheduler) });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T20:00:00.000Z")); // Already Nov 1 in Colombo.
  vi.mocked(reportsApi.getActiveMembers).mockReset().mockResolvedValue(structuredClone(activeFixture));
  vi.mocked(reportsApi.getMembershipActivity).mockReset().mockResolvedValue(structuredClone(activityFixture));
  vi.mocked(reportsApi.getCollections).mockReset().mockResolvedValue(structuredClone(collectionsFixture));
  vi.mocked(reportsApi.getReceivables).mockReset().mockResolvedValue(structuredClone(receivablesFixture));
  vi.mocked(attendanceApi.getSummary).mockReset().mockResolvedValue(structuredClone(attendanceFixture));
  vi.mocked(attentionApi.getExpiring).mockReset().mockResolvedValue(structuredClone(expiringFixture));
  vi.mocked(attentionApi.getOutstanding).mockReset().mockResolvedValue(structuredClone(outstandingFixture));
  vi.mocked(attentionApi.getDueFollowUps).mockReset().mockResolvedValue(structuredClone(dueFixture));
});

describe("connected command center", () => {
  const noAdminRequests = () => {
    assertNoReports();
    [financialApi.getDay, equipmentApi.dashboard, equipmentApi.alerts, retailApi.dashboard, notificationsApi.automationStatus].forEach(method => expect(method).not.toHaveBeenCalled());
  };
  it("reads one financial day for combined collections instead of adding independent reports", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN")); await settled();
    expect(financialApi.getDay).toHaveBeenCalledExactlyOnceWith(gymDate, expect.any(AbortSignal));
    expect(metric("Today's collections").getByText("LKR 15,000")).toBeInTheDocument();
    expect(screen.queryByText("LKR 999,999")).not.toBeInTheDocument();
    expect(panel("7-day collections").getByText(/Membership & POS/)).toBeInTheDocument();
    expect(panel("Daily cash closing").getByText("Open · live ledger")).toBeInTheDocument();
    expect(panel("Daily cash closing").getByRole("link", { name: "Review day" })).toHaveAttribute("href", `/cash-closing?date=${gymDate}`);
  });
  it("displays the closed historical snapshot and labels legacy membership-only amounts", async () => {
    vi.mocked(financialApi.getDay).mockResolvedValue({ success: true, status: "CLOSED", closing: { ...closingFixture, date: gymDate } });
    renderWithAuth(<DashboardPage />, authState("ADMIN")); await settled();
    expect(metric("Today's collections").getAllByText("LKR 85,000")).toHaveLength(2);
    expect(panel("Daily cash closing").getByText("Closed · stored snapshot")).toBeInTheDocument();
    expect(panel("Daily cash closing").getByText(/Legacy membership-only closing/)).toBeInTheDocument();
  });
  it("prioritizes safety, simulation failures and overdue maintenance, with working module destinations", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN")); await settled();
    const alerts = within(screen.getByRole("list", { name: "Prioritized gym alerts" })).getAllByRole("listitem");
    expect(alerts[0]).toHaveTextContent("CRITICAL equipment fault");
    expect(alerts[1]).toHaveTextContent("Reminder simulation failed");
    expect(alerts[2]).toHaveTextContent("overdue equipment services");
    expect(within(alerts[0]).getByRole("link")).toHaveAttribute("href", `/equipment/${commandFaults.data[0].equipmentId}#equipment-history`);
    expect(within(alerts[1]).getByRole("link")).toHaveAttribute("href", "/notifications#automation-status");
    expect(within(alerts[2]).getByRole("link")).toHaveAttribute("href", "/equipment/maintenance");
  });
  it("connects low stock, service queues and retail receipts to the existing workflows", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN")); await settled();
    const stock = panel("Retail stock attention");
    expect(stock.getByText(/Example protein shake/)).toBeInTheDocument();
    expect(stock.getAllByRole("link", { name: "Restock" })[0]).toHaveAttribute("href", `/retail/products?product=${commandRetail.stock.outOfStock[0].id}#retail-restock`);
    fireEvent.click(screen.getByText("Service queue"));
    expect(panel("Equipment readiness").getByRole("link", { name: "Plan service" })).toHaveAttribute("href", `/equipment/${commandEquipment.queue[0].id}#equipment-actions`);
    expect(panel("Latest retail sales").getByRole("link", { name: "View receipt" })).toHaveAttribute("href", `/retail/sales/${commandRetail.recent[0].id}`);
    expect(panel("Latest retail sales").getByText(/1 Nov 2026, 01:30/)).toBeInTheDocument();
  });
  it("shows simulation-only scheduler health using the minimal status endpoint", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN")); await settled();
    expect(panel("Reminder automation").getByText("Reminder simulation failed")).toBeInTheDocument();
    expect(panel("Reminder automation").getByText("Enabled")).toBeInTheDocument();
    expect(panel("Reminder automation").getByText(/Simulation only/)).toBeInTheDocument();
    expect(notificationsApi.automationStatus).toHaveBeenCalledOnce();
  });
  it("shows unavailable automation history as unconfirmed rather than healthy", async () => {
    vi.mocked(notificationsApi.automationStatus).mockResolvedValue({ success: true, scheduler: { ...commandScheduler, historyAvailable: false, lastRun: null } });
    renderWithAuth(<DashboardPage />, authState("ADMIN")); await settled();
    expect(panel("Reminder automation").getByText("Automation history unavailable")).toBeInTheDocument();
    expect(panel("Reminder automation").getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Reminder simulation completed")).not.toBeInTheDocument();
  });
  it("keeps loading connected panels separate from successfully loaded attendance", async () => {
    let resolve!: (value: typeof commandFaults) => void;
    vi.mocked(equipmentApi.alerts).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    expect(panel("Equipment faults").getByRole("status")).toBeInTheDocument();
    expect(await metric("Today's attendance").findByText("31")).toBeInTheDocument();
    expect(panel("Equipment faults").queryByText("No unresolved equipment faults.")).not.toBeInTheDocument();
    await act(async () => resolve(commandFaults)); await settled();
  });
  it("isolates a failed maintenance source and retries it without refetching Finance", async () => {
    vi.mocked(equipmentApi.dashboard).mockRejectedValueOnce(new Error("Fictional failure"));
    renderWithAuth(<DashboardPage />, authState("ADMIN")); await settled();
    expect(panel("Equipment readiness").getByRole("alert")).toBeInTheDocument();
    expect(panel("Equipment readiness").queryByText("0")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Prioritized gym alerts" })).getByText(new RegExp(commandFaults.data[0].equipmentName))).toBeInTheDocument();
    expect(screen.getByText(/this list may be incomplete/)).toBeInTheDocument();
    fireEvent.click(panel("Equipment readiness").getByRole("button", { name: "Retry Equipment readiness" })); await settled();
    expect(equipmentApi.dashboard).toHaveBeenCalledTimes(2); expect(financialApi.getDay).toHaveBeenCalledOnce();
  });
  it("rejects inconsistent financial sources with a retry instead of displaying a false total", async () => {
    vi.mocked(financialApi.getDay).mockResolvedValueOnce({ ...commandDay, totals: { ...commandDay.totals, collections: { ...commandDay.totals.collections, CASH: 1 } } });
    renderWithAuth(<DashboardPage />, authState("ADMIN")); await settled();
    expect(metric("Today's collections").getByRole("alert")).toBeInTheDocument();
    expect(metric("Today's collections").queryByText("LKR 0")).not.toBeInTheDocument();
    expect(panel("Daily cash closing").getByRole("alert")).toBeInTheDocument();
    fireEvent.click(metric("Today's collections").getByRole("button", { name: "Retry Today's collections" })); await settled();
    expect(metric("Today's collections").getByText("LKR 15,000")).toBeInTheDocument();
  });
  it("renders genuinely empty equipment and retail queues without false failure alerts", async () => {
    vi.mocked(equipmentApi.dashboard).mockResolvedValue({ ...commandEquipment, statistics: { overdue: 0, dueToday: 0, activeWork: 0, openIncidents: 0, unavailable: 0 }, queue: [] });
    vi.mocked(equipmentApi.alerts).mockResolvedValue({ success: true, data: [] });
    vi.mocked(retailApi.dashboard).mockResolvedValue({ ...commandRetail, recent: [], stock: { activeProducts: 0, outOfStock: [], lowStock: [], lowStockCount: 0, outOfStockCount: 0 } });
    renderWithAuth(<DashboardPage />, authState("ADMIN")); await settled();
    expect(screen.getByText("No unresolved equipment faults.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Service queue"));
    expect(screen.getByText("No service due or overdue.")).toBeInTheDocument();
    expect(screen.getByText("Stock levels healthy.")).toBeInTheDocument();
    expect(screen.getByText("No permitted retail sales were returned for today.")).toBeInTheDocument();
    expect(screen.queryByText(/products out of stock/)).not.toBeInTheDocument();
  });
  it("refreshes all connected sources with the same Colombo date", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN")); await settled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" })); await settled();
    [financialApi.getDay, equipmentApi.dashboard, equipmentApi.alerts, retailApi.dashboard, notificationsApi.automationStatus].forEach(method => expect(method).toHaveBeenCalledTimes(2));
    expect(retailApi.dashboard).toHaveBeenLastCalledWith({ from: "2026-10-26", to: gymDate }, expect.any(AbortSignal));
  });
  it("gives default Receptionists scoped own receipts and POS, without any Admin source", async () => {
    renderWithAuth(<DashboardPage />, authState("RECEPTIONIST")); await settled();
    noAdminRequests();
    expect(retailApi.sales).toHaveBeenCalledExactlyOnceWith({ from: gymDate, to: gymDate, page: 1, limit: 3 }, expect.any(AbortSignal));
    expect(panel("Your retail sales today").getByRole("link", { name: "View receipt" })).toHaveAttribute("href", `/retail/sales/${commandOwnSales.data[0].id}`);
    expect(screen.getByRole("link", { name: "POS checkout" })).toHaveAttribute("href", "/retail/checkout");
    expect(screen.queryByRole("region", { name: "Retail stock attention" })).not.toBeInTheDocument();
  });
  it("requires both POS route prerequisites, and does not infer history permission from checkout", () => {
    renderWithAuth(<DashboardPage />, recState(["retail.checkout"]));
    noAdminRequests(); expect(retailApi.sales).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "POS checkout" })).not.toBeInTheDocument();
  });
  it("permits checkout-only operational links without requesting business summaries", () => {
    renderWithAuth(<DashboardPage />, recState(["retail.read", "retail.checkout"]));
    noAdminRequests(); expect(retailApi.sales).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "POS checkout" })).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
  it("blocks new Admin sources for Receptionists even with forged sensitive grants", () => {
    renderWithAuth(<DashboardPage />, recState(["cash-closings.manage", "equipment.manage", "retail.manage", "settings.manage"]));
    noAdminRequests(); expect(retailApi.sales).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Connected operations" })).not.toBeInTheDocument();
  });
  it("aborts Admin requests and prevents late financial results leaking after role removal", async () => {
    let resolve!: (value: typeof commandDay) => void;
    vi.mocked(financialApi.getDay).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const tree = (role: "ADMIN" | "RECEPTIONIST") => <AuthContext.Provider value={role === "ADMIN" ? authState("ADMIN") : recState([])}><MemoryRouter><DashboardPage /></MemoryRouter></AuthContext.Provider>;
    const view = render(tree("ADMIN")); const signal = vi.mocked(financialApi.getDay).mock.calls[0][1];
    view.rerender(tree("RECEPTIONIST")); expect(signal?.aborted).toBe(true);
    await act(async () => resolve(commandDay));
    expect(screen.queryByRole("article", { name: "Today's collections" })).not.toBeInTheDocument();
    expect(screen.queryByText("LKR 15,000")).not.toBeInTheDocument();
  });
});
afterEach(() => vi.useRealTimers());

describe("API-backed daily operations dashboard", () => {
  it("consolidates the overview into six KPIs and uses reported purchase types for the membership visual", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN")); await settled();
    expect(within(screen.getByRole("region", { name: "Operational overview" })).getAllByRole("article")).toHaveLength(6);
    expect(screen.queryByRole("article", { name: "Overdue balance" })).not.toBeInTheDocument();
    expect(panel("Membership purchases").getByRole("img", { name: "12 membership purchases: New 8, Renewals 4" })).toBeInTheDocument();
    expect(reportsApi.getMembershipActivity).toHaveBeenCalledExactlyOnceWith({ from: "2026-10-26", to: gymDate }, expect.any(AbortSignal));
  });
  it("keeps one member work queue visible and supports arrow-key tab selection", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN")); await settled();
    const expiring = screen.getByRole("tab", { name: /Expiring/ });
    expect(expiring).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    fireEvent.keyDown(expiring, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Overdue/ })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: /Overdue/ })).toHaveTextContent("Example Overdue Member");
    expect(screen.getByRole("tabpanel")).not.toHaveTextContent("Example Expiring Member");
    fireEvent.keyDown(screen.getByRole("tab", { name: /Overdue/ }), { key: "End" });
    expect(screen.getByRole("tabpanel", { name: /Follow-ups/ })).toHaveTextContent("Example Follow-up Member");
  });
  it("shows Admin KPIs using returned totals, rather than queue page sizes", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    await settled();
    expect(metric("Active memberships").getByText("142")).toBeInTheDocument();
    expect(metric("Today's collections").getByText("LKR 15,000")).toBeInTheDocument();
    expect(metric("Today's collections").getByText("Membership collections")).toBeInTheDocument();
    expect(metric("Today's collections").getByText("LKR 12,500")).toBeInTheDocument();
    expect(metric("Today's collections").getByText("LKR 2,500")).toBeInTheDocument();
    expect(metric("Today's attendance").getByText("31")).toBeInTheDocument();
    expect(metric("Outstanding balance").getByText("LKR 48,000")).toBeInTheDocument();
    expect(metric("Outstanding balance").getByText(/LKR 18,000 overdue included/)).toBeInTheDocument();
    expect(metric("Expiring in 7 days").getByText("9")).toBeInTheDocument();
    expect(metric("Scheduled follow-ups due").getByText("6")).toBeInTheDocument();
    expect(reportsApi.getActiveMembers).toHaveBeenCalledOnce();
    expect(reportsApi.getReceivables).toHaveBeenCalledOnce();
  });

  it("renders seven real daily chart values with whole-number LKR formatting", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    await settled();
    const collections = within(screen.getByRole("table", { name: "7-day collections trend daily values" }));
    const attendance = within(screen.getByRole("table", { name: "7-day attendance trend daily values" }));
    expect(collections.getAllByRole("row")).toHaveLength(8);
    expect(attendance.getAllByRole("row")).toHaveLength(8);
    expect(within(collections.getByRole("row", { name: "27 Oct 2026 LKR 1,200 LKR 500" })).getAllByRole("cell")[0]).toHaveTextContent("LKR 1,200");
    expect(attendance.getByRole("row", { name: "01 Nov 2026 31" })).toBeInTheDocument();
    expect(panel("7-day collections").getByText("LKR 20,000")).toBeInTheDocument();
    expect(screen.queryByText(/recent payments/i)).not.toBeInTheDocument();
  });

  it("uses Colombo today and an inclusive seven-date range across a month boundary", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    await settled();
    expect(screen.getByText(/01 Nov 2026 · Asia\/Colombo/)).toBeInTheDocument();
    expect(attendanceApi.getSummary).toHaveBeenCalledWith(gymDate, expect.any(AbortSignal));
    expect(reportsApi.getCollections).toHaveBeenCalledWith({ from: "2026-10-26", to: gymDate }, expect.any(AbortSignal));
    expect(attentionApi.getExpiring).toHaveBeenCalledWith({ days: 7, page: 1, limit: 5 }, expect.any(AbortSignal));
  });

  it("shows actual attention records, last-valid dates, overdue amounts and valid workflow links", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    await settled();
    expect(panel("Expiring memberships").getByText("Example Expiring Member")).toBeInTheDocument();
    expect(panel("Expiring memberships").getByText(/Monthly example.*01 Nov/)).toBeInTheDocument();
    expect(panel("Expiring memberships").getByText("Today")).toBeInTheDocument();
    expect(panel("Expiring memberships").getByRole("link", { name: "Renew" })).toHaveAttribute("href", "/members/member-expiry/membership");
    expect(panel("Overdue payments").getByText("LKR 10,000")).toBeInTheDocument();
    expect(panel("Overdue payments").getByText(/Due 29 Oct/)).toBeInTheDocument();
    expect(panel("Overdue payments").queryByText("Example Future Payment Member")).not.toBeInTheDocument();
    expect(panel("Overdue payments").getByRole("link", { name: "View overdue payments" })).toHaveAttribute("href", "/payments");
    expect(panel("Follow-ups due").getByText("Due 31 Oct")).toBeInTheDocument();
    expect(panel("Follow-ups due").getByRole("link", { name: "Follow up" })).toHaveAttribute("href", "/attention/follow-ups/member/member-follow-up/PAYMENT_OUTSTANDING");
  });

  it("provides the default Receptionist operational view without any Reports request", async () => {
    renderWithAuth(<DashboardPage />, authState("RECEPTIONIST"));
    await settled();
    assertNoReports();
    expect(metric("Today's attendance").getByText("31")).toBeInTheDocument();
    expect(metric("Outstanding balance").getByText("LKR 48,000")).toBeInTheDocument();
    expect(metric("Outstanding balance").getByText(/LKR 18,000 overdue included/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Expiring/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Follow-ups/ })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Today's collections" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "7-day collections" })).not.toBeInTheDocument();
    const actions = within(screen.getByRole("navigation", { name: "Quick actions" }));
    expect(actions.getByRole("link", { name: "Register member" })).toHaveAttribute("href", "/members/new");
    expect(actions.getByRole("link", { name: "Payments & invoices" })).toHaveAttribute("href", "/payments");
    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
    await settled();
    assertNoReports();
  });

  it.each([
    ["attendance.read", "Today's attendance"],
    ["attention.read", "Expiring in 7 days"],
    ["follow-ups.read", "Scheduled follow-ups due"],
  ] as const)("limits requests and sections to the %s grant", async (permission, title) => {
    renderWithAuth(<DashboardPage />, recState([permission]));
    await settled();
    assertNoReports();
    expect(screen.getByRole("article", { name: title })).toBeInTheDocument();
    expect(attendanceApi.getSummary).toHaveBeenCalledTimes(permission === "attendance.read" ? 1 : 0);
    expect(attentionApi.getExpiring).toHaveBeenCalledTimes(permission === "attention.read" ? 1 : 0);
    expect(attentionApi.getOutstanding).toHaveBeenCalledTimes(permission === "attention.read" ? 1 : 0);
    expect(attentionApi.getDueFollowUps).toHaveBeenCalledTimes(permission === "follow-ups.read" ? 1 : 0);
    expect(screen.queryByRole("link", { name: "Register member" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Payments & invoices" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage membership" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Example Expiring Member" })).not.toBeInTheDocument();
  });

  it("does not infer dashboard data access from write permissions or a forged Receptionist report grant", () => {
    renderWithAuth(<DashboardPage />, recState(["members.create", "payments.record", "attendance.check-in", "follow-ups.create", "reports.read"]));
    assertNoReports();
    expect(attendanceApi.getSummary).not.toHaveBeenCalled();
    Object.values(attentionApi).forEach((method) => expect(method).not.toHaveBeenCalled());
    expect(screen.getByText(/No dashboard data is enabled/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Register member" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Due follow-ups" })).not.toBeInTheDocument();
  });

  it("shows no business data or quick actions for an explicitly empty permission list", () => {
    renderWithAuth(<DashboardPage />, recState([]));
    assertNoReports();
    expect(attendanceApi.getSummary).not.toHaveBeenCalled();
    Object.values(attentionApi).forEach((method) => expect(method).not.toHaveBeenCalled());
    expect(screen.queryByRole("navigation", { name: "Quick actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("does not show membership workflow links without both route prerequisites", async () => {
    renderWithAuth(<DashboardPage />, recState(["attention.read", "members.read"]));
    await settled();
    expect(panel("Expiring memberships").getByRole("link", { name: "Open member" })).toHaveAttribute("href", "/front-desk?member=member-expiry");
    expect(screen.queryByRole("link", { name: "Manage membership" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Follow-up history" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review invoices" })).not.toBeInTheDocument();
  });

  it("keeps other panels usable while attendance is loading without displaying a false zero", async () => {
    let resolve!: (value: AttendanceSummaryResponse) => void;
    vi.mocked(attendanceApi.getSummary).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    expect(metric("Today's attendance").getByRole("status")).toBeInTheDocument();
    expect(metric("Today's attendance").queryByText("0")).not.toBeInTheDocument();
    expect(await screen.findByText("142")).toBeInTheDocument();
    expect(await screen.findByText("Example Expiring Member")).toBeInTheDocument();
    await act(async () => resolve(attendanceFixture));
    await settled();
    expect(metric("Today's attendance").getByText("31")).toBeInTheDocument();
  });

  it("distinguishes genuine zero totals and empty queues from loading or errors", async () => {
    const zero = { CASH: 0, CARD: 0, BANK_TRANSFER: 0 };
    vi.mocked(financialApi.getDay).mockResolvedValue({ ...commandDay, totals: { ...commandDay.totals, collections: zero, membershipCollections: zero, retailCollections: zero, paymentCount: 0, retailSaleCount: 0 } });
    vi.mocked(attentionApi.getExpiring).mockResolvedValue({ ...expiringFixture, data: [], total: 0, totalPages: 0 });
    vi.mocked(attentionApi.getDueFollowUps).mockResolvedValue({ ...dueFixture, data: [], total: 0, totalPages: 0 });
    vi.mocked(attentionApi.getOutstanding).mockResolvedValue({ ...outstandingFixture, data: [], total: 0, totalPages: 0, summary: { membersWithOutstanding: 0, totalOutstandingLkr: 0, totalOverdueLkr: 0, openInvoiceCount: 0, overdueInvoiceCount: 0 } });
    vi.mocked(attendanceApi.getSummary).mockResolvedValue({ success: true, data: { ...attendanceFixture.data, totalCheckIns: 0, last7Days: attendanceFixture.data.last7Days.map((day) => ({ ...day, checkIns: 0 })) } });
    vi.mocked(retailApi.dashboard).mockResolvedValue({ ...commandRetail, summary: { ...commandRetail.summary, amountLkr: 0 }, trend: commandRetail.trend.map(day => ({ ...day, value: 0 })) });
    vi.mocked(reportsApi.getCollections).mockResolvedValue({ ...collectionsFixture, summary: { totalCollectedLkr: 0, paymentCount: 0, averagePaymentLkr: 0 }, byDay: collectionsFixture.byDay.map((day) => ({ ...day, totalCollectedLkr: 0, paymentCount: 0 })) });
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    await settled();
    expect(metric("Today's attendance").getByText("0")).toBeInTheDocument();
    expect(metric("Today's collections").getAllByText("LKR 0")[0]).toBeInTheDocument();
    expect(screen.getByText("No memberships expiring in the next 7 days.")).toBeInTheDocument();
    expect(panel("Overdue payments").getByText("No overdue payments.")).toBeInTheDocument();
    expect(panel("Follow-ups due").getByText("No scheduled follow-ups due.")).toBeInTheDocument();
    expect(screen.getByText("No collections recorded in this period.")).toBeInTheDocument();
    expect(screen.getByText("No check-ins recorded in this period.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("isolates API errors, never substitutes zero, and retries only the failed source", async () => {
    vi.mocked(attendanceApi.getSummary).mockRejectedValueOnce(new Error("Fictional failure"));
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    await settled();
    expect(metric("Today's attendance").getByRole("alert")).toBeInTheDocument();
    expect(metric("Today's attendance").queryByText("0")).not.toBeInTheDocument();
    expect(panel("7-day attendance").getByRole("alert")).toBeInTheDocument();
    expect(metric("Today's collections").getByText("LKR 15,000")).toBeInTheDocument();
    expect(panel("Follow-ups due").getByText("Example Follow-up Member")).toBeInTheDocument();
    fireEvent.click(metric("Today's attendance").getByRole("button", { name: "Retry Today's attendance" }));
    await settled();
    expect(metric("Today's attendance").getByText("31")).toBeInTheDocument();
    expect(attendanceApi.getSummary).toHaveBeenCalledTimes(2);
    expect(reportsApi.getCollections).toHaveBeenCalledOnce();
    expect(attentionApi.getDueFollowUps).toHaveBeenCalledOnce();
  });

  it("preserves other queues and financial cards if one attention queue fails", async () => {
    vi.mocked(attentionApi.getExpiring).mockRejectedValueOnce(new Error("Fictional failure"));
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    await settled();
    expect(panel("Expiring memberships").getByRole("alert")).toBeInTheDocument();
    expect(metric("Expiring in 7 days").queryByText("0")).not.toBeInTheDocument();
    expect(panel("Overdue payments").getByText("Example Overdue Member")).toBeInTheDocument();
    expect(metric("Outstanding balance").getByText("LKR 48,000")).toBeInTheDocument();
    fireEvent.click(panel("Expiring memberships").getByRole("button", { name: "Retry Expiring memberships" }));
    await settled();
    expect(panel("Expiring memberships").getByText("Example Expiring Member")).toBeInTheDocument();
  });

  it("does not turn failed financial requests into LKR zero or block operational data", async () => {
    vi.mocked(financialApi.getDay).mockRejectedValueOnce(new Error("Fictional failure"));
    vi.mocked(reportsApi.getCollections).mockRejectedValueOnce(new Error("Fictional failure"));
    vi.mocked(reportsApi.getReceivables).mockRejectedValueOnce(new Error("Fictional failure"));
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    await settled();
    for (const title of ["Today's collections", "Outstanding balance"]) {
      expect(metric(title).getByRole("alert")).toBeInTheDocument();
      expect(metric(title).queryByText("LKR 0")).not.toBeInTheDocument();
    }
    expect(metric("Today's attendance").getByText("31")).toBeInTheDocument();
  });

  it("reloads all permitted sources and updates visible data on refresh", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    await settled();
    vi.mocked(reportsApi.getActiveMembers).mockResolvedValueOnce({ ...activeFixture, summary: { totalActiveMembers: 143 } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
    expect(metric("Active memberships").getByRole("status")).toBeInTheDocument();
    expect(metric("Active memberships").queryByText("142")).not.toBeInTheDocument();
    await settled();
    expect(metric("Active memberships").getByText("143")).toBeInTheDocument();
    for (const method of [reportsApi.getActiveMembers, reportsApi.getCollections, reportsApi.getReceivables, attendanceApi.getSummary, attentionApi.getExpiring, attentionApi.getOutstanding, attentionApi.getDueFollowUps]) expect(method).toHaveBeenCalledTimes(2);
  });

  it("refreshes the gym date after Colombo midnight", async () => {
    renderWithAuth(<DashboardPage />, recState(["attendance.read"]));
    await settled();
    vi.setSystemTime(new Date("2026-11-01T18:31:00.000Z"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh dashboard" }));
    await settled();
    expect(attendanceApi.getSummary).toHaveBeenLastCalledWith("2026-11-02", expect.any(AbortSignal));
    expect(screen.getByText(/02 Nov 2026 · Asia\/Colombo/)).toBeInTheDocument();
  });

  it("cancels in-flight requests and hides data immediately when permissions are removed", async () => {
    let resolve!: (value: AttendanceSummaryResponse) => void;
    vi.mocked(attendanceApi.getSummary).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const tree = (permissions: Permission[]) => <AuthContext.Provider value={recState(permissions)}><MemoryRouter><DashboardPage /></MemoryRouter></AuthContext.Provider>;
    const view = render(tree(["attendance.read"]));
    const signal = vi.mocked(attendanceApi.getSummary).mock.calls[0][1];
    view.rerender(tree([]));
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(attendanceFixture));
    expect(screen.queryByRole("article", { name: "Today's attendance" })).not.toBeInTheDocument();
    expect(screen.getByText(/No dashboard data is enabled/)).toBeInTheDocument();
  });
});
