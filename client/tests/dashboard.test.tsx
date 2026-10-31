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
import { activeFixture, attendanceFixture, collectionsFixture, dueFixture, expiringFixture, gymDate, outstandingFixture, receivablesFixture } from "./fixtures/dashboard";
import type { AttendanceSummaryResponse } from "../src/types/attendance";

vi.mock("../src/api/reports.api", () => ({ reportsApi: { getActiveMembers: vi.fn(), getCollections: vi.fn(), getReceivables: vi.fn(), getInvoices: vi.fn(), getMembershipActivity: vi.fn(), getAttendanceTrends: vi.fn() } }));
vi.mock("../src/api/attention.api", () => ({ attentionApi: { getExpiring: vi.fn(), getOutstanding: vi.fn(), getDueFollowUps: vi.fn() } }));
vi.mock("../src/api/attendance.api", () => ({ attendanceApi: { getSummary: vi.fn() } }));

const metric = (name: string) => within(screen.getByRole("article", { name }));
const panel = (name: string) => within(screen.getByRole("region", { name }));
const recState = (permissions: Permission[]) => authState("RECEPTIONIST", { staff: { ...receptionist, permissions } });
const assertNoReports = () => Object.values(reportsApi).forEach((method) => expect(method).not.toHaveBeenCalled());

async function settled() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh dashboard" })).toBeEnabled());
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T20:00:00.000Z")); // Already Nov 1 in Colombo.
  vi.mocked(reportsApi.getActiveMembers).mockReset().mockResolvedValue(structuredClone(activeFixture));
  vi.mocked(reportsApi.getCollections).mockReset().mockResolvedValue(structuredClone(collectionsFixture));
  vi.mocked(reportsApi.getReceivables).mockReset().mockResolvedValue(structuredClone(receivablesFixture));
  vi.mocked(attendanceApi.getSummary).mockReset().mockResolvedValue(structuredClone(attendanceFixture));
  vi.mocked(attentionApi.getExpiring).mockReset().mockResolvedValue(structuredClone(expiringFixture));
  vi.mocked(attentionApi.getOutstanding).mockReset().mockResolvedValue(structuredClone(outstandingFixture));
  vi.mocked(attentionApi.getDueFollowUps).mockReset().mockResolvedValue(structuredClone(dueFixture));
});
afterEach(() => vi.useRealTimers());

describe("API-backed daily operations dashboard", () => {
  it("shows Admin KPIs using returned totals, rather than queue page sizes", async () => {
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    await settled();
    expect(metric("Active memberships").getByText("142")).toBeInTheDocument();
    expect(metric("Today's collections").getByText("LKR 12,500")).toBeInTheDocument();
    expect(metric("Today's collections").getByText("3 payments received today")).toBeInTheDocument();
    expect(metric("Today's attendance").getByText("31")).toBeInTheDocument();
    expect(metric("Outstanding balance").getByText("LKR 48,000")).toBeInTheDocument();
    expect(metric("Overdue balance").getByText("LKR 18,000")).toBeInTheDocument();
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
    expect(within(collections.getByRole("row", { name: "27 Oct 2026 LKR 1,200" })).getByRole("cell")).toHaveTextContent("LKR 1,200");
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
    expect(panel("Expiring memberships").getByRole("link", { name: "Example Expiring Member" })).toHaveAttribute("href", "/members/member-expiry");
    expect(panel("Expiring memberships").getByText(/Last valid 01 Nov 2026/)).toBeInTheDocument();
    expect(panel("Expiring memberships").getByText("Last valid day is today")).toBeInTheDocument();
    expect(panel("Expiring memberships").getByRole("link", { name: "Manage membership" })).toHaveAttribute("href", "/members/member-expiry/membership");
    expect(panel("Overdue payments").getByText("LKR 10,000 overdue")).toBeInTheDocument();
    expect(panel("Overdue payments").getByText(/Oldest due 29 Oct 2026/)).toBeInTheDocument();
    expect(panel("Overdue payments").queryByText("Example Future Payment Member")).not.toBeInTheDocument();
    expect(panel("Overdue payments").getByRole("link", { name: "Review invoices" })).toHaveAttribute("href", "/payments");
    expect(panel("Follow-ups due").getByText("Due 31 Oct 2026")).toBeInTheDocument();
    expect(panel("Follow-ups due").getByRole("link", { name: "Review follow-up" })).toHaveAttribute("href", "/attention/follow-ups/member/member-follow-up/PAYMENT_OUTSTANDING");
  });

  it("provides the default Receptionist operational view without any Reports request", async () => {
    renderWithAuth(<DashboardPage />, authState("RECEPTIONIST"));
    await settled();
    assertNoReports();
    expect(metric("Today's attendance").getByText("31")).toBeInTheDocument();
    expect(metric("Outstanding balance").getByText("LKR 48,000")).toBeInTheDocument();
    expect(metric("Overdue balance").getByText("LKR 18,000")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Expiring memberships" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Follow-ups due" })).toBeInTheDocument();
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
    expect(screen.getByText(/No operational dashboard data is enabled/)).toBeInTheDocument();
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
    expect(panel("Expiring memberships").getByRole("link", { name: "Example Expiring Member" })).toBeInTheDocument();
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
    vi.mocked(attentionApi.getExpiring).mockResolvedValue({ ...expiringFixture, data: [], total: 0, totalPages: 0 });
    vi.mocked(attentionApi.getDueFollowUps).mockResolvedValue({ ...dueFixture, data: [], total: 0, totalPages: 0 });
    vi.mocked(attentionApi.getOutstanding).mockResolvedValue({ ...outstandingFixture, data: [], total: 0, totalPages: 0, summary: { membersWithOutstanding: 0, totalOutstandingLkr: 0, totalOverdueLkr: 0, openInvoiceCount: 0, overdueInvoiceCount: 0 } });
    vi.mocked(attendanceApi.getSummary).mockResolvedValue({ success: true, data: { ...attendanceFixture.data, totalCheckIns: 0, last7Days: attendanceFixture.data.last7Days.map((day) => ({ ...day, checkIns: 0 })) } });
    vi.mocked(reportsApi.getCollections).mockResolvedValue({ ...collectionsFixture, summary: { totalCollectedLkr: 0, paymentCount: 0, averagePaymentLkr: 0 }, byDay: collectionsFixture.byDay.map((day) => ({ ...day, totalCollectedLkr: 0, paymentCount: 0 })) });
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    await settled();
    expect(metric("Today's attendance").getByText("0")).toBeInTheDocument();
    expect(metric("Today's collections").getByText("LKR 0")).toBeInTheDocument();
    expect(screen.getByText("No memberships expiring in the next 7 days.")).toBeInTheDocument();
    expect(screen.getByText("No overdue payments.")).toBeInTheDocument();
    expect(screen.getByText("No scheduled follow-ups due.")).toBeInTheDocument();
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
    expect(metric("Today's collections").getByText("LKR 12,500")).toBeInTheDocument();
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
    vi.mocked(reportsApi.getCollections).mockRejectedValueOnce(new Error("Fictional failure"));
    vi.mocked(reportsApi.getReceivables).mockRejectedValueOnce(new Error("Fictional failure"));
    renderWithAuth(<DashboardPage />, authState("ADMIN"));
    await settled();
    for (const title of ["Today's collections", "Outstanding balance", "Overdue balance"]) {
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
    expect(screen.getByText(/No operational dashboard data is enabled/)).toBeInTheDocument();
  });
});
