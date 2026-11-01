import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { AuthContext, type AuthContextValue } from "../src/auth/auth-context";
import FrontDeskPage from "../src/pages/FrontDeskPage";
import { membersApi } from "../src/api/members.api";
import { membershipsApi } from "../src/api/memberships.api";
import { attendanceApi } from "../src/api/attendance.api";
import { billingApi } from "../src/api/billing.api";
import { authState, receptionist, renderWithAuth } from "./helpers/auth";
import { deskMember, otherDeskMember, deskSummary, deskMembership, deskVisit, deskInvoice } from "./fixtures/front-desk";

vi.mock("../src/api/members.api", () => ({ membersApi: { getMembers: vi.fn(), getMemberById: vi.fn() } }));
vi.mock("../src/api/memberships.api", () => ({ membershipsApi: { getSummary: vi.fn() } }));
vi.mock("../src/api/attendance.api", () => ({ attendanceApi: { getMemberHistory: vi.fn(), checkIn: vi.fn(), searchMembers: vi.fn() } }));
vi.mock("../src/api/billing.api", () => ({ billingApi: { getMemberInvoices: vi.fn() } }));

const selectedPath = `/front-desk?member=${deskMember.id}`;
const list = (data = [deskMember], total = data.length) => ({ success: true, data, pagination: { page: 1, limit: 8, total, totalPages: Math.ceil(total / 8) } });
const pending = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const input = () => screen.getByRole("combobox", { name: "Find a member" });
const pane = () => within(screen.getByRole("region", { name: "Selected member" }));
async function ready() { await waitFor(() => expect(screen.getByRole("button", { name: "Check In" })).toBeEnabled()); }
async function lookup(value = deskMember.memberId) {
  fireEvent.change(input(), { target: { value } });
  fireEvent.submit(input().closest("form")!);
  await screen.findByRole("heading", { name: deskMember.fullName });
}
beforeEach(() => {
  vi.resetAllMocks();
  // Freeze Date construction as well: the gym date is Nov 1 despite UTC Oct 31.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T20:00:00Z"));
  vi.mocked(membersApi.getMembers).mockResolvedValue(list());
  vi.mocked(membersApi.getMemberById).mockImplementation(async id => ({ success: true, message: "", data: id === otherDeskMember.id ? otherDeskMember : deskMember }));
  vi.mocked(membershipsApi.getSummary).mockImplementation(async id => ({ success: true, data: { ...deskSummary, memberId: id } }));
  vi.mocked(attendanceApi.getMemberHistory).mockResolvedValue({ success: true, member: { id: deskMember.id, memberReference: deskMember.memberId, fullName: deskMember.fullName }, data: [], total: 0, page: 1, limit: 1, totalPages: 0 });
  vi.mocked(billingApi.getMemberInvoices).mockResolvedValue({ success: true, data: [deskInvoice], total: 1 });
  vi.mocked(attendanceApi.checkIn).mockResolvedValue({ success: true, message: "", alreadyCheckedIn: false, data: deskVisit });
});
afterEach(() => vi.useRealTimers());

describe("Front Desk member search and keyboard workflow", () => {
  it("starts focused, requests no member data until a search or valid selection, and waits for 2 characters", async () => {
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), "/front-desk");
    expect(input()).toHaveFocus();
    expect(screen.getByText("Ready for the next member")).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: "N" } });
    fireEvent.submit(input().closest("form")!);
    expect(membersApi.getMembers).not.toHaveBeenCalled();
    expect(membersApi.getMemberById).not.toHaveBeenCalled();
    expect(billingApi.getMemberInvoices).not.toHaveBeenCalled();
  });
  it.each([deskMember.memberId, "Example Nimal", deskMember.phone])("opens a unique match for %s without automatically checking in", async query => {
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), "/front-desk");
    await lookup(query); await ready();
    expect(screen.getByRole("button", { name: "Check In" })).toHaveFocus();
    expect(input()).toHaveValue("");
    expect(attendanceApi.checkIn).not.toHaveBeenCalled();
    expect(membersApi.getMembers).toHaveBeenCalledWith({ q: query, page: 1, limit: 8, status: "all" }, expect.any(AbortSignal));
  });
  it("debounces typing and retries a normalized Sri Lankan phone only after an empty result", async () => {
    vi.mocked(membersApi.getMembers).mockResolvedValueOnce(list([])).mockResolvedValueOnce(list());
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), "/front-desk");
    fireEvent.change(input(), { target: { value: "+94 70 000 0101" } });
    await screen.findByRole("option", { name: /Example Nimal/ });
    expect(vi.mocked(membersApi.getMembers).mock.calls.map(call => call[0].q)).toEqual(["+94700000101", "0700000101"]);
    expect(attendanceApi.checkIn).not.toHaveBeenCalled();
  });
  it("requires a deliberate choice for ambiguous results and supports arrow keys and Escape", async () => {
    vi.mocked(membersApi.getMembers).mockResolvedValue(list([deskMember, otherDeskMember]));
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), "/front-desk");
    fireEvent.change(input(), { target: { value: "Example" } });
    fireEvent.submit(input().closest("form")!);
    await screen.findAllByRole("option");
    expect(screen.queryByRole("heading", { name: deskMember.fullName })).not.toBeInTheDocument();
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input()).toHaveAttribute("aria-activedescendant", `desk-result-${otherDeskMember.id}`);
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.submit(input().closest("form")!);
    await ready();
    expect(pane().getByRole("heading", { name: deskMember.fullName })).toBeInTheDocument();
    fireEvent.change(input(), { target: { value: "another" } });
    expect(screen.getByRole("button", { name: "Check In" })).toBeDisabled();
    expect(pane().getByRole("heading", { name: deskMember.fullName })).toBeInTheDocument();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input()).toHaveValue("");
    expect(pane().getByRole("heading", { name: deskMember.fullName })).toBeInTheDocument();
  });
  it("does not auto-select an incomplete page or the first fuzzy result", async () => {
    vi.mocked(membersApi.getMembers).mockResolvedValue(list([deskMember], 12));
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), "/front-desk");
    fireEvent.change(input(), { target: { value: "Example" } });
    fireEvent.submit(input().closest("form")!);
    await screen.findByRole("option");
    expect(screen.getByText(/Showing 8, narrow your search/)).toBeInTheDocument();
    expect(membersApi.getMemberById).not.toHaveBeenCalled();
  });
  it("has distinct empty and failed search states with recovery", async () => {
    vi.mocked(membersApi.getMembers).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(list([]));
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), "/front-desk");
    fireEvent.change(input(), { target: { value: "Nobody" } });
    fireEvent.submit(input().closest("form")!);
    fireEvent.click(await screen.findByRole("button", { name: "Retry search" }));
    expect(await screen.findByText("No members found.")).toBeInTheDocument();
    expect(membersApi.getMemberById).not.toHaveBeenCalled();
  });
  it("ignores late search responses after the term changes", async () => {
    const old = pending<Awaited<ReturnType<typeof membersApi.getMembers>>>();
    vi.mocked(membersApi.getMembers).mockReturnValueOnce(old.promise).mockResolvedValue(list([otherDeskMember]));
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), "/front-desk");
    fireEvent.change(input(), { target: { value: "old" } }); fireEvent.submit(input().closest("form")!);
    await waitFor(() => expect(membersApi.getMembers).toHaveBeenCalledTimes(1));
    fireEvent.change(input(), { target: { value: "Kamala" } });
    await screen.findByRole("option", { name: /Kamala/ });
    await act(async () => old.resolve(list()));
    expect(screen.queryByRole("option", { name: /Nimal/ })).not.toBeInTheDocument();
    expect(membersApi.getMemberById).not.toHaveBeenCalled();
  });
});

describe("selected member, permissions and existing workflows", () => {
  it("preserves the former attendance-only check-in grants without fetching the full member directory", async () => {
    vi.mocked(attendanceApi.searchMembers).mockResolvedValue({ success: true, data: [deskMember] });
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["attendance.read", "attendance.check-in", "memberships.read"] } }), "/front-desk");
    await lookup(); await ready();
    expect(attendanceApi.searchMembers).toHaveBeenCalledWith(deskMember.memberId, expect.any(AbortSignal));
    expect(membersApi.getMembers).not.toHaveBeenCalled(); expect(membersApi.getMemberById).not.toHaveBeenCalled(); expect(billingApi.getMemberInvoices).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "View Member Profile" })).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Renew Membership" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check In" })); expect(await screen.findByText("Check-in recorded.")).toBeInTheDocument();
  });
  it("shows real identity, coverage, Colombo visit time and server invoice balances, with member-specific links", async () => {
    vi.mocked(attendanceApi.getMemberHistory).mockResolvedValue({ success: true, member: { id: deskMember.id, memberReference: deskMember.memberId, fullName: deskMember.fullName }, data: [{ ...deskVisit, attendanceDate: "2026-10-31", checkedInAt: "2026-10-30T20:00:00Z" }], total: 1, page: 1, limit: 1, totalPages: 1 });
    renderWithAuth(<FrontDeskPage />, authState("ADMIN"), selectedPath);
    await ready();
    expect(pane().getByText("Active profile")).toBeInTheDocument();
    expect(pane().getByText("Active membership")).toBeInTheDocument();
    expect(pane().getByText("09 Nov 2026")).toBeInTheDocument();
    expect(pane().getByText(/31 Oct 2026, 01:30/)).toBeInTheDocument();
    expect(pane().getAllByText("LKR 2,000")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Renew Membership" })).toHaveAttribute("href", `/members/${deskMember.id}/membership`);
    expect(screen.getByRole("link", { name: "Collect Payment" })).toHaveAttribute("href", `/payments/invoices/${deskInvoice.id}`);
    expect(screen.getByRole("link", { name: "View Member Profile" })).toHaveAttribute("href", `/members/${deskMember.id}`);
    expect(attendanceApi.getMemberHistory).toHaveBeenCalledWith(deskMember.id, { page: 1, limit: 1 }, expect.any(AbortSignal));
  });
  it("hides denied data and actions and never requests the corresponding APIs", async () => {
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["members.read"] } }), selectedPath);
    await screen.findByRole("heading", { name: deskMember.fullName });
    expect(membershipsApi.getSummary).not.toHaveBeenCalled();
    expect(attendanceApi.getMemberHistory).not.toHaveBeenCalled();
    expect(billingApi.getMemberInvoices).not.toHaveBeenCalled();
    for (const text of ["Outstanding balance", "Last check-in", "Membership expiry"]) expect(screen.queryByText(text)).not.toBeInTheDocument();
    for (const name of ["Collect Payment", "Renew Membership"]) expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check In" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Member Profile" })).toBeInTheDocument();
  });
  it("allows a check-in grant without exposing denied membership, attendance or financial data", async () => {
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["members.read", "attendance.check-in"] } }), selectedPath);
    await ready(); fireEvent.click(screen.getByRole("button", { name: "Check In" }));
    expect(await screen.findByText("Check-in recorded.")).toBeInTheDocument();
    expect(membershipsApi.getSummary).not.toHaveBeenCalled(); expect(attendanceApi.getMemberHistory).not.toHaveBeenCalled(); expect(billingApi.getMemberInvoices).not.toHaveBeenCalled();
    expect(screen.queryByText("Last check-in")).not.toBeInTheDocument();
  });
  it("does not fetch data with explicit deny-all, even when rendered outside its route guard", () => {
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: [] } }), selectedPath);
    expect(screen.getByRole("alert")).toHaveTextContent("Front Desk access is not permitted");
    expect(membersApi.getMemberById).not.toHaveBeenCalled(); expect(billingApi.getMemberInvoices).not.toHaveBeenCalled();
  });
  it.each(["memberships.renew", "plans.read"] as const)("hides the renewal shortcut without %s", async permission => {
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: receptionist.permissions.filter(value => value !== permission) } }), selectedPath);
    await ready(); expect(screen.queryByRole("link", { name: "Renew Membership" })).not.toBeInTheDocument();
  });
  it("offers review instead of collection without payment permission", async () => {
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["members.read", "invoices.read"] } }), selectedPath);
    expect(await screen.findByRole("link", { name: "Review Payment" })).toHaveAttribute("href", `/payments/invoices/${deskInvoice.id}`);
    expect(screen.queryByRole("link", { name: "Collect Payment" })).not.toBeInTheDocument();
  });
  it("offers invoice review for a settled account and distinguishes a verified empty invoice history", async () => {
    vi.mocked(billingApi.getMemberInvoices).mockResolvedValueOnce({ success: true, data: [{ ...deskInvoice, paymentStatus: "PAID", balanceLkr: 0, paidLkr: 5000, isOverdue: false }], total: 1 }).mockResolvedValue({ success: true, data: [], total: 0 });
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), selectedPath);
    expect(await screen.findByRole("link", { name: "Review Payment" })).toHaveAttribute("href", `/payments/invoices/${deskInvoice.id}`);
    expect(screen.getByText("LKR 0")).toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Collect Payment" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh member" }));
    await waitFor(() => expect(billingApi.getMemberInvoices).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Review Payment" })).not.toBeInTheDocument());
    expect(screen.getByText("LKR 0")).toBeInTheDocument();
  });
  it("keeps profile failure distinct from a loading state and disables check-in until retry succeeds", async () => {
    vi.mocked(membersApi.getMemberById).mockRejectedValueOnce(new Error("unavailable"));
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), selectedPath);
    expect(await screen.findByText(/Profile unavailable/)).toBeInTheDocument();
    expect(screen.getByText("Member unavailable")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Check In" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry profile" })); await ready();
    expect(screen.getByRole("heading", { name: deskMember.fullName })).toBeInTheDocument();
  });
  it("does not expose a previous member's late balance response after changing selection", async () => {
    const invoices = pending<Awaited<ReturnType<typeof billingApi.getMemberInvoices>>>();
    vi.mocked(billingApi.getMemberInvoices).mockReturnValueOnce(invoices.promise).mockResolvedValue({ success: true, data: [], total: 0 });
    vi.mocked(membersApi.getMembers).mockResolvedValue(list([otherDeskMember]));
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), selectedPath); await ready();
    fireEvent.click(screen.getByRole("button", { name: "New search" }));
    fireEvent.change(input(), { target: { value: otherDeskMember.memberId } }); fireEvent.submit(input().closest("form")!);
    await screen.findByRole("heading", { name: otherDeskMember.fullName });
    await act(async () => invoices.resolve({ success: true, data: [deskInvoice], total: 1 }));
    expect(screen.getByText("LKR 0")).toBeInTheDocument(); expect(screen.queryByText("LKR 2,000")).not.toBeInTheDocument();
  });
  it("shows expiry and focuses renewal for an expired member", async () => {
    vi.mocked(membershipsApi.getSummary).mockResolvedValue({ success: true, data: { ...deskSummary, status: "EXPIRED", currentMembership: null, latestMembership: { ...deskMembership, status: "EXPIRED", lastValidDate: "2026-10-31", endDateExclusive: "2026-11-01" } } });
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), "/front-desk"); await lookup();
    expect(await screen.findByText("Expired membership")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check In" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Renew Membership" })).toHaveFocus();
    expect(attendanceApi.checkIn).not.toHaveBeenCalled();
  });
  it("shows enrollment only for a never-enrolled member with its grant", async () => {
    vi.mocked(membershipsApi.getSummary).mockResolvedValue({ success: true, data: { ...deskSummary, status: "NOT_ENROLLED", totalPeriods: 0, currentMembership: null, latestMembership: null } });
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), selectedPath);
    expect(await screen.findByRole("link", { name: "Enroll Membership" })).toHaveAttribute("href", `/members/${deskMember.id}/membership`);
    expect(screen.getByText("No membership recorded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check In" })).toBeDisabled();
  });
  it("shows renewed coverage through the latest purchased period while eligibility uses current coverage", async () => {
    const next = { ...deskMembership, id: "next", startDate: "2026-11-10", lastValidDate: "2026-12-09", endDateExclusive: "2026-12-10", status: "UPCOMING" as const, enrollmentType: "RENEWAL" as const };
    vi.mocked(membershipsApi.getSummary).mockResolvedValue({ success: true, data: { ...deskSummary, latestMembership: next, nextMembership: next, totalPeriods: 2 } });
    renderWithAuth(<FrontDeskPage />, authState("ADMIN"), selectedPath); await ready();
    expect(screen.getByText("09 Dec 2026")).toBeInTheDocument(); expect(screen.getByText(/Renewal starts 10 Nov 2026/)).toBeInTheDocument();
  });
  it("keeps balances unavailable on failure, retries only that source and preserves check-in", async () => {
    vi.mocked(billingApi.getMemberInvoices).mockRejectedValueOnce(new Error("unavailable"));
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), selectedPath); await ready();
    expect(screen.getByText(/Balance unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("LKR 0")).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Collect Payment" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry balance" }));
    await screen.findByRole("link", { name: "Collect Payment" });
    expect(membersApi.getMemberById).toHaveBeenCalledTimes(1); expect(membershipsApi.getSummary).toHaveBeenCalledTimes(1);
  });
  it("disables check-in if membership eligibility is unavailable, without losing the profile or payment workflow", async () => {
    vi.mocked(membershipsApi.getSummary).mockRejectedValueOnce(new Error("unavailable"));
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), selectedPath);
    await screen.findByRole("link", { name: "Collect Payment" });
    expect(screen.getByRole("button", { name: "Check In" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry membership" })); await ready();
  });
  it("rejects a malformed member link before requesting any data", () => {
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), "/front-desk?member=not-an-id");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid member reference"); expect(membersApi.getMemberById).not.toHaveBeenCalled();
  });
});

describe("explicit safe check-in and asynchronous recovery", () => {
  it("posts one explicit check-in, gives compact feedback, updates last visit and returns search focus", async () => {
    const post = pending<Awaited<ReturnType<typeof attendanceApi.checkIn>>>();
    vi.mocked(attendanceApi.checkIn).mockReturnValue(post.promise);
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), "/front-desk"); await lookup(); await ready();
    const button = screen.getByRole("button", { name: "Check In" });
    fireEvent.click(button); fireEvent.click(button);
    expect(attendanceApi.checkIn).toHaveBeenCalledTimes(1); expect(attendanceApi.checkIn).toHaveBeenCalledWith(deskMember.id);
    expect(screen.getByRole("button", { name: "Checking in…" })).toBeDisabled();
    await act(async () => post.resolve({ success: true, message: "", alreadyCheckedIn: false, data: deskVisit }));
    expect(screen.getByText("Check-in recorded.")).toBeInTheDocument(); expect(input()).toHaveFocus();
    expect(screen.getByRole("button", { name: "Checked in today" })).toBeDisabled();
    expect(screen.getByText(/1 Nov 2026, 01:30/)).toBeInTheDocument();
  });
  it("respects the server duplicate response instead of claiming another check-in", async () => {
    vi.mocked(attendanceApi.checkIn).mockResolvedValue({ success: true, message: "", alreadyCheckedIn: true, data: deskVisit });
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), selectedPath); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Check In" }));
    expect(await screen.findByText("Already checked in today.")).toBeInTheDocument(); expect(screen.queryByText("Check-in recorded.")).not.toBeInTheDocument();
  });
  it("does not retry a failed write automatically and allows explicit retry using server duplicate protection", async () => {
    vi.mocked(attendanceApi.checkIn).mockRejectedValueOnce(new Error("network"));
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), selectedPath); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Check In" }));
    await screen.findByRole("alert");
    expect(attendanceApi.checkIn).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Check In" }));
    await screen.findByText("Check-in recorded."); expect(attendanceApi.checkIn).toHaveBeenCalledTimes(2);
  });
  it("keeps an in-flight check-in attached to its member while searching for the next member", async () => {
    const post = pending<Awaited<ReturnType<typeof attendanceApi.checkIn>>>();
    vi.mocked(attendanceApi.checkIn).mockReturnValue(post.promise);
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), selectedPath); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Check In" }));
    vi.mocked(membersApi.getMembers).mockResolvedValue(list([otherDeskMember]));
    fireEvent.click(screen.getByRole("button", { name: "New search" }));
    fireEvent.change(input(), { target: { value: otherDeskMember.memberId } }); fireEvent.submit(input().closest("form")!);
    await screen.findByRole("heading", { name: otherDeskMember.fullName });
    expect(screen.getByRole("button", { name: "Check In" })).toBeDisabled();
    await act(async () => post.resolve({ success: true, message: "", alreadyCheckedIn: false, data: deskVisit }));
    await ready(); expect(screen.queryByText("Check-in recorded.")).not.toBeInTheDocument(); expect(screen.queryByText("Checked in today")).not.toBeInTheDocument();
  });
  it("blocks inactive profiles and an exclusive end date reached in Colombo", async () => {
    vi.mocked(membershipsApi.getSummary).mockResolvedValue({ success: true, data: { ...deskSummary, currentMembership: { ...deskMembership, endDateExclusive: "2026-11-01" } } });
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), selectedPath);
    await screen.findByText("Active membership"); expect(screen.getByRole("button", { name: "Check In" })).toBeDisabled();
    vi.mocked(membersApi.getMemberById).mockResolvedValue({ success: true, message: "", data: { ...deskMember, isActive: false } });
    fireEvent.click(screen.getByRole("button", { name: "Refresh member" }));
    expect(await screen.findByText("Inactive profile")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Check In" })).toBeDisabled();
  });
  it("refreshes selected resources on request and when returning to the browser tab", async () => {
    renderWithAuth(<FrontDeskPage />, authState("ADMIN"), selectedPath); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Refresh member" }));
    await waitFor(() => expect(membersApi.getMemberById).toHaveBeenCalledTimes(2));
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(membersApi.getMemberById).toHaveBeenCalledTimes(3));
    expect(billingApi.getMemberInvoices).toHaveBeenCalledTimes(3);
  });
  it("prefers a newer server attendance record after refreshing across a Colombo day boundary", async () => {
    renderWithAuth(<FrontDeskPage />, authState("RECEPTIONIST"), selectedPath); await ready();
    fireEvent.click(screen.getByRole("button", { name: "Check In" })); await screen.findByText("Check-in recorded.");
    vi.setSystemTime(new Date("2026-11-01T20:00:00Z"));
    vi.mocked(attendanceApi.getMemberHistory).mockResolvedValue({ success: true, member: { id: deskMember.id, memberReference: deskMember.memberId, fullName: deskMember.fullName }, data: [{ ...deskVisit, attendanceDate: "2026-11-02", checkedInAt: "2026-11-01T20:00:00Z" }], total: 2, page: 1, limit: 1, totalPages: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Refresh member" }));
    expect(await screen.findByText(/2 Nov 2026, 01:30/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checked in today" })).toBeDisabled();
  });
  it("discards private state and ignores late results when the staff permission set changes", async () => {
    const invoices = pending<Awaited<ReturnType<typeof billingApi.getMemberInvoices>>>();
    vi.mocked(billingApi.getMemberInvoices).mockReturnValue(invoices.promise);
    const auth = authState("ADMIN");
    function Tree({ value }: { value: AuthContextValue }) { return <AuthContext.Provider value={value}><MemoryRouter initialEntries={[selectedPath]}><FrontDeskPage /></MemoryRouter></AuthContext.Provider>; }
    const view = render(<Tree value={auth} />);
    await ready();
    view.rerender(<Tree value={authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["members.read"] } })} />);
    await act(async () => invoices.resolve({ success: true, data: [deskInvoice], total: 1 }));
    expect(screen.queryByText("Outstanding balance")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Check In" })).not.toBeInTheDocument();
  });
  it("navigates to the existing renewal route without posting a financial or membership write", async () => {
    function Location() { const location = useLocation(); return <output aria-label="Location">{location.pathname}</output>; }
    renderWithAuth(<><Location /><Routes><Route path="/front-desk" element={<FrontDeskPage />} /><Route path="/members/:id/membership" element={<h1>Existing renewal workflow</h1>} /></Routes></>, authState("RECEPTIONIST"), selectedPath);
    fireEvent.click(await screen.findByRole("link", { name: "Renew Membership" }));
    expect(screen.getByRole("heading", { name: "Existing renewal workflow" })).toBeInTheDocument(); expect(attendanceApi.checkIn).not.toHaveBeenCalled();
  });
});
