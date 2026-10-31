import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import NotificationsPage from "../src/pages/NotificationsPage";
import { notificationsApi, type MemberNotificationConsent, type NotificationOverview, type SimulationResult } from "../src/api/notifications.api";
import { membersApi } from "../src/api/members.api";
import { authState, receptionist, renderWithAuth } from "./helpers/auth";
import { memberConsent, notificationMemberId, notificationMembers, notificationOverview } from "./fixtures/notifications";

vi.mock("../src/api/notifications.api", () => ({ notificationsApi: { overview: vi.fn(), simulate: vi.fn(), consent: vi.fn(), saveConsent: vi.fn() } }));
vi.mock("../src/api/members.api", () => ({ membersApi: { getMembers: vi.fn() } }));
vi.mock("../src/pages/DashboardPage", () => ({ default: () => <h1>Permitted dashboard</h1> }));
vi.mock("../src/pages/LoginPage", () => ({ default: () => <h1>Login required</h1> }));
let savedConsent: MemberNotificationConsent;
const apiError = (message: string) => ({ isAxiosError: true, response: { status: 409, data: { message } } });
const simulated: SimulationResult = { success: true, due: 1, simulated: 1, duplicates: 0, skipped: 0, realMessagesSent: 0, deliveryMode: "SIMULATION_ONLY" };
beforeEach(() => {
  savedConsent = structuredClone(memberConsent);
  vi.mocked(notificationsApi.overview).mockReset().mockResolvedValue(structuredClone(notificationOverview));
  vi.mocked(notificationsApi.simulate).mockReset().mockResolvedValue(simulated);
  vi.mocked(notificationsApi.consent).mockReset().mockImplementation(async id => ({ ...savedConsent, memberId: id }));
  vi.mocked(notificationsApi.saveConsent).mockReset().mockImplementation(async (id, next) => {
    savedConsent = { ...savedConsent, memberId: id, whatsappOptIn: next, updatedAt: "2026-01-15T06:00:00Z" }; return savedConsent;
  });
  vi.mocked(membersApi.getMembers).mockReset().mockResolvedValue(structuredClone(notificationMembers));
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
function page() { return renderWithAuth(<NotificationsPage />, authState("ADMIN"), "/notifications"); }
async function ready() { await screen.findByRole("link", { name: "Example Member · WF-EXAMPLE-001" }); }
async function lookup(input = notificationMemberId) {
  fireEvent.change(screen.getByLabelText("Member search"), { target: { value: input } });
  fireEvent.submit(screen.getByRole("form", { name: "Find member consent" }));
}
async function optIn() {
  await lookup(); await screen.findByText("Example Member · Not opted in");
  fireEvent.click(screen.getByRole("checkbox", { name: /member explicitly agreed/ }));
  fireEvent.click(screen.getByRole("button", { name: "Record confirmed opt-in" }));
  await screen.findByRole("button", { name: "Revoke consent" });
}

describe("Notification Center authorization", () => {
  it("permits Admin navigation and the real route", async () => {
    renderWithAuth(<App />, authState("ADMIN"), "/notifications"); await ready();
    expect(screen.getByRole("link", { name: "Notifications" })).toHaveAttribute("href", "/notifications");
    expect(screen.getByRole("link", { name: "Notifications" })).toHaveAttribute("aria-current", "page");
  });
  it("blocks Receptionist direct navigation despite forged settings permission and makes no notifications requests", async () => {
    renderWithAuth(<App />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["settings.manage"] } }), "/notifications");
    expect(await screen.findByRole("heading", { name: "Permitted dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Notifications" })).not.toBeInTheDocument();
    Object.values(notificationsApi).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("also gates data requests on a standalone Receptionist page", () => {
    renderWithAuth(<NotificationsPage />, authState("RECEPTIONIST"));
    expect(screen.getByRole("alert")).toHaveTextContent("Admin access is required");
    Object.values(notificationsApi).forEach(fn => expect(fn).not.toHaveBeenCalled()); expect(membersApi.getMembers).not.toHaveBeenCalled();
  });
  it("redirects unauthenticated navigation to login without API requests", async () => {
    renderWithAuth(<App />, authState(null), "/notifications");
    expect(await screen.findByRole("heading", { name: "Login required" })).toBeInTheDocument();
    Object.values(notificationsApi).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
});

describe("real notification rendering, dates and read states", () => {
  it("shows disabled automation without inventing a prior execution", async () => {
    page(); await ready();
    const panel = within(screen.getByRole("region", { name: "Automatic simulation" }));
    expect(panel.getByText("Disabled")).toBeInTheDocument(); expect(panel.getByText("No automatic execution recorded yet.")).toBeInTheDocument();
    expect(panel.queryByText(/Next daily slot/)).not.toBeInTheDocument();
  });
  it("shows the enabled Colombo schedule and last successful simulation counts", async () => {
    vi.mocked(notificationsApi.overview).mockResolvedValueOnce({ ...notificationOverview, scheduler: {
      ...notificationOverview.scheduler, enabled: true, nextRunAt: "2026-01-16T03:30:00Z", lastRun: {
        scheduledDate: "2026-01-15", status: "SUCCEEDED", startedAt: "2026-01-15T03:30:00Z", completedAt: "2026-01-15T03:31:00Z",
        summary: { due: 3, simulated: 2, duplicates: 1, skipped: 0 }, failureCode: null,
      },
    } });
    page(); await ready(); const panel = within(screen.getByRole("region", { name: "Automatic simulation" }));
    expect(panel.getByText("Enabled")).toBeInTheDocument(); expect(panel.getByText(/Next daily slot: 16 Jan 2026, 09:00/)).toBeInTheDocument();
    expect(panel.getByText(/Last automatic run: Simulation completed/)).toBeInTheDocument();
    expect(panel.getByText(/2 simulated · 1 already recorded · 0 skipped/)).toBeInTheDocument();
    expect(panel.getByText(/backend process must be running/)).toBeInTheDocument();
  });
  it.each(["FAILED", "RUNNING"] as const)("shows a truthful %s result while preserving manual simulation", async status => {
    vi.mocked(notificationsApi.overview).mockResolvedValueOnce({ ...notificationOverview, scheduler: {
      ...notificationOverview.scheduler, enabled: true, lastRun: { scheduledDate: "2026-01-15", status, startedAt: "2026-01-15T03:30:00Z", completedAt: null, summary: null, failureCode: status === "FAILED" ? "SIMULATION_FAILED" : null },
    } });
    page(); await ready(); const panel = within(screen.getByRole("region", { name: "Automatic simulation" }));
    expect(panel.getByText(status === "FAILED" ? /Failed — review history and retry manually/ : /Last automatic run: Started — completion unconfirmed/)).toBeInTheDocument();
    expect(panel.queryByText(/Simulation completed/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simulate due reminders" })).toBeEnabled();
  });
  it("distinguishes unavailable execution history from no prior execution", async () => {
    vi.mocked(notificationsApi.overview).mockResolvedValueOnce({ ...notificationOverview, scheduler: { ...notificationOverview.scheduler, historyAvailable: false } });
    page(); await ready(); const panel = within(screen.getByRole("region", { name: "Automatic simulation" }));
    expect(panel.getByText(/Execution history unavailable/)).toBeInTheDocument();
    expect(panel.queryByText("No automatic execution recorded yet.")).not.toBeInTheDocument();
  });
  it("identifies scheduled history without assigning an Admin actor or claiming delivery", async () => {
    vi.mocked(notificationsApi.overview).mockResolvedValueOnce({ ...notificationOverview, recent: [{ ...notificationOverview.recent[0], trigger: "SCHEDULED", createdBy: null }] });
    page(); await ready(); const history = within(screen.getByRole("region", { name: "Simulation history" }));
    expect(history.getByText("Automatic simulation")).toBeInTheDocument(); expect(history.getByText("SIMULATED")).toBeInTheDocument();
    expect(history.queryByText("Manual simulation")).not.toBeInTheDocument();
  });
  it("renders API-backed counts, inclusive last-valid dates, history and Colombo timestamps", async () => {
    page(); await ready();
    expect(screen.getByText(/As of 15 Jan 2026 · Colombo/)).toBeInTheDocument();
    expect(screen.getAllByText(/Valid through 22 Jan 2026/)).toHaveLength(2);
    expect(screen.getByText(/15 Jan 2026, 11:30 · Colombo/)).toBeInTheDocument();
    expect(screen.getByText("SIMULATED")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Example Member · WF-EXAMPLE-001" })).toHaveAttribute("href", `/members/${notificationMemberId}`);
    expect(within(screen.getByRole("region", { name: "Notification totals" })).getAllByText("1")).toHaveLength(3);
    expect(screen.getByText(/No WhatsApp messages are transmitted/)).toBeInTheDocument();
    expect(notificationsApi.overview).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("shows loading instead of manufactured counts until the overview settles", async () => {
    let resolve!: (value: NotificationOverview) => void;
    vi.mocked(notificationsApi.overview).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    page(); expect(screen.getByLabelText("Loading Membership reminders")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Notification totals" })).getAllByText("Loading…")).toHaveLength(3);
    expect(screen.queryByText("No simulated notifications yet.")).not.toBeInTheDocument();
    await act(async () => resolve(notificationOverview)); await ready();
  });
  it("distinguishes genuine empty results from errors", async () => {
    vi.mocked(notificationsApi.overview).mockResolvedValueOnce({ ...notificationOverview, due: [], recent: [], simulatedToday: 0 });
    page(); expect(await screen.findByText("No simulated notifications yet.")).toBeInTheDocument();
    expect(screen.getByText("No opted-in memberships are at a reminder milestone today.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simulate due reminders" })).toBeDisabled();
    expect(within(screen.getByRole("region", { name: "Notification totals" })).getAllByText("0")).toHaveLength(3);
  });
  it("hides stale values on failure and retries without blocking member consent", async () => {
    vi.mocked(notificationsApi.overview).mockRejectedValueOnce(apiError("Overview unavailable"));
    page(); await screen.findByRole("button", { name: "Retry Membership reminders" });
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Notification totals" })).getAllByText("Unavailable")).toHaveLength(3);
    await lookup(); await screen.findByText("Example Member · Not opted in");
    fireEvent.click(screen.getByRole("button", { name: "Retry Membership reminders" })); await ready();
  });
  it("refreshes counts from the API rather than retaining old totals", async () => {
    page(); await ready();
    vi.mocked(notificationsApi.overview).mockResolvedValueOnce({ ...notificationOverview, simulatedToday: 5 });
    fireEvent.click(screen.getByRole("button", { name: "Refresh notifications" }));
    expect(await screen.findByText("5")).toBeInTheDocument(); expect(notificationsApi.overview).toHaveBeenCalledTimes(2);
  });
});

describe("explicit and correctly targeted consent", () => {
  it("searches through the existing members API and loads the selected member's preference", async () => {
    page(); await ready(); await lookup("Example");
    fireEvent.click(await screen.findByRole("button", { name: "Manage consent for Example Member" }));
    await screen.findByText("Example Member · Not opted in");
    expect(membersApi.getMembers).toHaveBeenCalledWith({ q: "Example", page: 1, limit: 10, status: "all" }, expect.any(AbortSignal));
    expect(notificationsApi.consent).toHaveBeenCalledWith(notificationMemberId, expect.any(AbortSignal));
  });
  it("requires a checked explicit-consent confirmation before enabling opt-in", async () => {
    page(); await ready(); await lookup();
    const record = await screen.findByRole("button", { name: "Record confirmed opt-in" }); expect(record).toBeDisabled();
    fireEvent.click(record); expect(notificationsApi.saveConsent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /member explicitly agreed/ })); fireEvent.click(record);
    await screen.findByRole("button", { name: "Revoke consent" });
    expect(notificationsApi.saveConsent).toHaveBeenCalledWith(notificationMemberId, true, true);
    expect(await screen.findByText("Explicit opt-in recorded.")).toBeInTheDocument();
  });
  it("confirms revocation and updates the visible preference", async () => {
    page(); await ready(); await optIn();
    fireEvent.click(screen.getByRole("button", { name: "Revoke consent" }));
    await screen.findByRole("button", { name: "Record confirmed opt-in" });
    expect(notificationsApi.saveConsent).toHaveBeenLastCalledWith(notificationMemberId, false, false);
    expect(screen.getByText(/Consent revoked/)).toBeInTheDocument();
  });
  it("does not revoke consent when the confirmation is cancelled", async () => {
    savedConsent.whatsappOptIn = true; vi.mocked(window.confirm).mockReturnValueOnce(false);
    page(); await ready(); await lookup();
    fireEvent.click(await screen.findByRole("button", { name: "Revoke consent" }));
    expect(notificationsApi.saveConsent).not.toHaveBeenCalled();
  });
  it("ignores stale consent lookups after a different member is selected", async () => {
    let resolveOld!: (value: MemberNotificationConsent) => void;
    vi.mocked(notificationsApi.consent).mockImplementationOnce(() => new Promise(done => { resolveOld = done; }));
    page(); await ready(); await lookup();
    await waitFor(() => expect(notificationsApi.consent).toHaveBeenCalledOnce());
    const secondId = "000000000000000000000011";
    vi.mocked(notificationsApi.consent).mockResolvedValueOnce({ ...memberConsent, memberId: secondId, memberName: "Second Example" });
    await lookup(secondId); await screen.findByText("Second Example · Not opted in");
    await act(async () => resolveOld(memberConsent));
    expect(screen.queryByText("Example Member · Not opted in")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /member explicitly agreed/ }));
    fireEvent.click(screen.getByRole("button", { name: "Record confirmed opt-in" }));
    await waitFor(() => expect(notificationsApi.saveConsent).toHaveBeenCalledWith(secondId, true, true));
  });
  it("handles lookup failure with retry and distinguishes no search results", async () => {
    vi.mocked(notificationsApi.consent).mockRejectedValueOnce(apiError("Member not found"));
    page(); await ready(); await lookup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Member not found");
    fireEvent.click(screen.getByRole("button", { name: "Retry Selected member preference" }));
    await screen.findByText("Example Member · Not opted in");
    vi.mocked(membersApi.getMembers).mockResolvedValueOnce({ ...notificationMembers, data: [] });
    await lookup("No match"); expect(await screen.findByText("No members match this search.")).toBeInTheDocument();
  });
  it("reports failed preference saves without claiming success", async () => {
    vi.mocked(notificationsApi.saveConsent).mockRejectedValueOnce(apiError("Consent save failed"));
    page(); await ready(); await lookup();
    fireEvent.click(await screen.findByRole("checkbox", { name: /member explicitly agreed/ }));
    fireEvent.click(screen.getByRole("button", { name: "Record confirmed opt-in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Consent save failed");
    expect(screen.queryByText("Explicit opt-in recorded.")).not.toBeInTheDocument();
  });
});

describe("manual simulation and duplicate handling", () => {
  it("does not simulate automatically and never labels previews as delivered", async () => {
    page(); await ready(); expect(notificationsApi.simulate).not.toHaveBeenCalled();
    expect(screen.queryByText("SENT", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("SIMULATED", { exact: true })).toBeInTheDocument();
  });
  it("requires confirmation and does not submit cancelled simulations", async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    page(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Simulate due reminders" }));
    expect(notificationsApi.simulate).not.toHaveBeenCalled();
  });
  it("shows simulated, duplicate and skipped counts and refreshes history", async () => {
    vi.mocked(notificationsApi.simulate).mockResolvedValueOnce({ ...simulated, simulated: 0, duplicates: 1, skipped: 2 });
    page(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Simulate due reminders" }));
    expect(await screen.findByText("Simulated 0 reminder(s). 1 already recorded; 2 no longer eligible. No real messages sent.")).toBeInTheDocument();
    expect(notificationsApi.simulate).toHaveBeenCalledWith();
    await waitFor(() => expect(notificationsApi.overview).toHaveBeenCalledTimes(2));
  });
  it("blocks double submits while a simulation is in flight", async () => {
    let resolve!: (value: SimulationResult) => void;
    vi.mocked(notificationsApi.simulate).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    page(); await ready(); const button = screen.getByRole("button", { name: "Simulate due reminders" });
    fireEvent.click(button); fireEvent.click(button); expect(notificationsApi.simulate).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Simulating…" })).toBeDisabled();
    await act(async () => resolve(simulated));
  });
  it("explains partial/uncertain failure and refreshes history for safe retry", async () => {
    vi.mocked(notificationsApi.simulate).mockRejectedValueOnce(apiError("Simulation failed"));
    page(); await ready(); fireEvent.click(screen.getByRole("button", { name: "Simulate due reminders" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Some entries may already be recorded");
    expect(screen.queryByText(/Simulated 1 reminder/)).not.toBeInTheDocument();
    await waitFor(() => expect(notificationsApi.overview).toHaveBeenCalledTimes(2));
  });
});
