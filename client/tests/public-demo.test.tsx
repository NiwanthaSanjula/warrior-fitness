import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { AxiosError, AxiosHeaders } from "axios";
import { api } from "../src/api/api";
import LoginPage from "../src/pages/LoginPage";
import AppLayout from "../src/components/AppLayout";
import { AuthProvider } from "../src/auth/AuthProvider";
import { useAuth } from "../src/auth/auth-context";
import { hasPermissions, type Permission } from "../src/auth/permissions";
import { authApi } from "../src/api/auth.api";
import { admin, authState, renderWithAuth } from "./helpers/auth";

vi.mock("../src/api/auth.api", () => ({ authApi: { getCurrentStaff: vi.fn(), login: vi.fn(), loginDemo: vi.fn(), logout: vi.fn() } }));
const viewer = { ...admin, id: "70de00000000000000000001", fullName: "Demo Visitor", readOnly: true };
function Session() {
  const { staff, logout, loading } = useAuth();
  return <><h1>Dashboard</h1><output aria-label="Current session">{loading ? "Loading" : staff ? `${staff.fullName}: ${staff.readOnly ? "Read Only" : "Staff"}` : "Signed out"}</output><button onClick={() => void logout()}>Log out</button></>;
}
function loginPage() {
  return render(<MemoryRouter initialEntries={["/login"]}><AuthProvider><Routes><Route path="/login" element={<LoginPage />} /><Route path="/dashboard" element={<Session />} /></Routes></AuthProvider></MemoryRouter>);
}
beforeEach(() => {
  vi.mocked(authApi.getCurrentStaff).mockReset().mockRejectedValue(new Error("No existing session"));
  vi.mocked(authApi.loginDemo).mockReset().mockResolvedValue({ success: true, staff: viewer });
  vi.mocked(authApi.login).mockReset().mockResolvedValue({ success: true, staff: admin });
  vi.mocked(authApi.logout).mockReset().mockResolvedValue({ success: true, message: "Signed out" });
});

describe("one-click public demo login", () => {
  it("signs in and opens the existing dashboard without filling staff credentials", async () => {
    loginPage();
    fireEvent.click(screen.getByRole("button", { name: "Try Demo — Explore Warrior Fitness" }));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current session")).toHaveTextContent("Demo Visitor: Read Only");
    expect(authApi.loginDemo).toHaveBeenCalledExactlyOnceWith(); expect(authApi.login).not.toHaveBeenCalled();
  });
  it("disables both sign-in paths during demo login and prevents repeated submissions", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof authApi.loginDemo>>) => void;
    vi.mocked(authApi.loginDemo).mockReturnValue(new Promise(done => { resolve = done; }));
    loginPage(); const button = screen.getByRole("button", { name: /Try Demo/ });
    fireEvent.click(button); fireEvent.click(button);
    expect(screen.getByRole("button", { name: /Opening demo/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "SIGN IN" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Starting your read-only session");
    expect(authApi.loginDemo).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ success: true, staff: viewer }));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
  it("reports unavailable/disabled demo access, retains typed Admin credentials, and permits retry", async () => {
    vi.mocked(authApi.loginDemo).mockRejectedValueOnce({ isAxiosError: true, response: { status: 503, data: { message: "Public demo access is unavailable." } } });
    loginPage();
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "owner@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "fictional-local-input-only" } });
    fireEvent.click(screen.getByRole("button", { name: /Try Demo/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Public demo access is unavailable");
    expect(screen.getByLabelText("Email Address")).toHaveValue("owner@example.test");
    expect(screen.getByLabelText("Password")).toHaveValue("fictional-local-input-only");
    await waitFor(() => expect(screen.getByRole("button", { name: /Try Demo/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Try Demo/ }));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
  it("preserves original email/password Admin sign-in", async () => {
    loginPage();
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "admin@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "fictional-admin-input-only" } });
    fireEvent.submit(screen.getByRole("button", { name: "SIGN IN" }).closest("form")!);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current session")).toHaveTextContent("Example Admin: Staff");
    expect(authApi.login).toHaveBeenCalledWith("admin@example.test", "fictional-admin-input-only");
    expect(authApi.loginDemo).not.toHaveBeenCalled();
  });
  it("restores read-only mode through /me on reload and clears frontend state on logout", async () => {
    vi.mocked(authApi.getCurrentStaff).mockResolvedValue({ success: true, staff: viewer });
    render(<AuthProvider><Session /></AuthProvider>);
    await waitFor(() => expect(screen.getByLabelText("Current session")).toHaveTextContent("Demo Visitor: Read Only"));
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(screen.getByLabelText("Current session")).toHaveTextContent("Signed out"));
    expect(authApi.logout).toHaveBeenCalledTimes(1);
  });
  it("does not let a stale anonymous /me 401 cancel a newer successful demo login", async () => {
    let rejectRestore!: (error: unknown) => void;
    vi.mocked(authApi.getCurrentStaff).mockReturnValue(new Promise((_resolve, reject) => { rejectRestore = reject; }));
    loginPage(); fireEvent.click(screen.getByRole("button", { name: /Try Demo/ }));
    await screen.findByRole("heading", { name: "Dashboard" });
    await act(async () => {
      const error = await api.get("/auth/me", { adapter: async config => {
        throw new AxiosError("Fictional earlier anonymous session", "ERR_BAD_REQUEST", config, undefined, {
          status: 401, statusText: "Unauthorized", headers: new AxiosHeaders(), config, data: {},
        });
      } }).catch(failure => failure);
      rejectRestore(error);
    });
    expect(screen.getByLabelText("Current session")).toHaveTextContent("Demo Visitor: Read Only");
  });
  it("shows the read-only indicator while keeping read-only Finance and Retail navigation", () => {
    renderWithAuth(<AppLayout />, authState("ADMIN", { staff: viewer }));
    expect(screen.getByText("Demo Mode — Read Only")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    expect(screen.getByRole("link", { name: "Expense Management" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "POS & Retail" }));
    expect(within(screen.getByRole("list", { name: "POS & Retail pages" })).getByRole("link", { name: "Retail Sales" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Point of Sale" })).not.toBeInTheDocument();
  });
});

describe("read-only frontend action permissions", () => {
  it.each<Permission>(["members.create", "members.update", "members.status", "memberships.enroll", "memberships.renew", "invoices.create", "payments.record", "attendance.check-in", "follow-ups.create", "equipment.report", "retail.checkout"])("hides %s for demo viewers without changing Admin grants", permission => {
    expect(hasPermissions(viewer, permission)).toBe(false); expect(hasPermissions(admin, permission)).toBe(true);
  });
  it.each<Permission>(["members.read", "memberships.read", "invoices.read", "payments.read", "attendance.read", "attention.read", "follow-ups.read", "reports.read", "equipment.read", "retail.read", "retail.sales.read", "expenses.manage", "cash-closings.manage"])("retains authorized %s reads", permission => {
    expect(hasPermissions(viewer, permission)).toBe(true);
  });
});
