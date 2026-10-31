import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router";
import App from "../src/App";
import AppLayout from "../src/components/AppLayout";
import StaffManagementPage from "../src/pages/StaffManagementPage";
import { staffApi } from "../src/api/staff.api";
import type { ManagedStaff } from "../src/types/staff";
import { admin, authState, receptionist, renderWithAuth } from "./helpers/auth";
import { inactiveStaff, managedAdmin, managedReceptionist, staffAudit, staffCatalogue, staffDirectory } from "./fixtures/staff";

vi.mock("../src/api/staff.api", () => ({ staffApi: {
  getStaff: vi.fn(), getById: vi.fn(), getCatalogue: vi.fn(), createStaff: vi.fn(), updateProfile: vi.fn(),
  updatePermissions: vi.fn(), updateStatus: vi.fn(), resetPassword: vi.fn(), getAudit: vi.fn(),
} }));
vi.mock("../src/pages/DashboardPage", () => ({ default: () => <h1>Permitted dashboard</h1> }));
vi.mock("../src/pages/LoginPage", () => ({ default: () => <h1>Login required</h1> }));
const rejection = (message: string) => ({ isAxiosError: true, response: { status: 409, data: { message } } });
beforeEach(() => {
  vi.mocked(staffApi.getStaff).mockReset().mockResolvedValue(structuredClone(staffDirectory));
  vi.mocked(staffApi.getById).mockReset().mockImplementation(async (id) => ({ success: true, staff: structuredClone(staffDirectory.data.find((person) => person.id === id)!) }));
  vi.mocked(staffApi.getCatalogue).mockReset().mockResolvedValue(structuredClone(staffCatalogue));
  vi.mocked(staffApi.getAudit).mockReset().mockResolvedValue(structuredClone(staffAudit));
  vi.mocked(staffApi.createStaff).mockReset().mockResolvedValue({ success: true, staff: structuredClone(managedReceptionist) });
  for (const method of [staffApi.updateProfile, staffApi.updatePermissions, staffApi.updateStatus, staffApi.resetPassword]) {
    vi.mocked(method).mockReset().mockResolvedValue({ success: true, changed: true, staff: { ...structuredClone(managedReceptionist), version: 4 } });
  }
});
function page() { return renderWithAuth(<StaffManagementPage />, authState("ADMIN"), "/staff"); }
async function manage(target: ManagedStaff = managedReceptionist) {
  fireEvent.click(await screen.findByRole("button", { name: `Manage ${target.fullName}` }));
  return within(await screen.findByRole("form", { name: "Edit staff profile" }));
}
async function creation() {
  fireEvent.click(await screen.findByRole("button", { name: "Create Receptionist" }));
  const form = within(screen.getByRole("form", { name: "Create staff account" }));
  fireEvent.change(form.getByLabelText("Full name"), { target: { value: "New Example" } });
  fireEvent.change(form.getByLabelText("Email address"), { target: { value: " NEW@example.test " } });
  fireEvent.change(form.getByLabelText("Initial password"), { target: { value: "Fictional password 123" } });
  fireEvent.change(form.getByLabelText("Confirm initial password"), { target: { value: "Fictional password 123" } });
  return form;
}
function confirm() { fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirm changes" })); }

describe("staff access and navigation", () => {
  it("shows the active Staff Management navigation and real page to Admins", async () => {
    renderWithAuth(<App />, authState("ADMIN", { staff: { ...admin, permissions: [] } }), "/staff");
    expect(await screen.findByRole("button", { name: "Manage Example Receptionist" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Staff Management" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Staff Management" })).toHaveAttribute("href", "/staff");
    expect(staffApi.getStaff).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10 }), expect.any(AbortSignal));
  });
  it("redirects Receptionists with forged staff grants and never requests staff or audit data", async () => {
    renderWithAuth(<App />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["staff.manage"] } }), "/staff");
    expect(await screen.findByRole("heading", { name: "Permitted dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Staff Management" })).not.toBeInTheDocument();
    Object.values(staffApi).forEach((method) => expect(method).not.toHaveBeenCalled());
  });
  it("redirects unauthenticated staff URLs to login", async () => {
    renderWithAuth(<App />, authState(null), "/staff");
    expect(await screen.findByRole("heading", { name: "Login required" })).toBeInTheDocument();
    Object.values(staffApi).forEach((method) => expect(method).not.toHaveBeenCalled());
  });
  it("also gates standalone page requests and hides the link on the existing layout", () => {
    renderWithAuth(<><AppLayout /><StaffManagementPage /></>, authState("RECEPTIONIST"));
    expect(screen.getByRole("alert")).toHaveTextContent("Admin access is required");
    expect(screen.queryByRole("link", { name: "Staff Management" })).not.toBeInTheDocument();
    Object.values(staffApi).forEach((method) => expect(method).not.toHaveBeenCalled());
  });
});

describe("staff directory and audit reads", () => {
  it("shows names, emails, roles, status, permission mode and timestamped actor/target history", async () => {
    page();
    expect(await screen.findByText("reception@example.test")).toBeInTheDocument();
    expect(screen.getByText("inactive@example.test")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Manage Inactive Example" }).closest("li")!).getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("Default permissions")).toBeInTheDocument();
    expect(screen.getByText("Custom permissions")).toBeInTheDocument();
    expect(await screen.findByText("Receptionist created")).toBeInTheDocument();
    expect(screen.getByText(/Example Admin · Account: Example Receptionist/)).toBeInTheDocument();
    expect(screen.getByText(/15 Jan 2026.*11:30.*Colombo/)).toBeInTheDocument();
    expect(document.querySelector("input[type='password']")).toBeNull();
    expect(document.body.textContent).not.toContain("passwordHash");
  });
  it("applies literal search and role/status filters and requests subsequent pages", async () => {
    vi.mocked(staffApi.getStaff).mockResolvedValue({ ...staffDirectory, pagination: { page: 1, limit: 10, total: 11, totalPages: 2 } });
    page(); await screen.findByRole("button", { name: "Manage Example Receptionist" });
    fireEvent.change(screen.getByLabelText("Search staff"), { target: { value: "example.test" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "RECEPTIONIST" } });
    fireEvent.change(screen.getByLabelText("Account status"), { target: { value: "active" } });
    fireEvent.submit(screen.getByRole("form", { name: "Staff directory filters" }));
    await waitFor(() => expect(staffApi.getStaff).toHaveBeenLastCalledWith(expect.objectContaining({ search: "example.test", role: "RECEPTIONIST", status: "active", page: 1 }), expect.any(AbortSignal)));
    fireEvent.click(await screen.findByRole("button", { name: "Next staff page" }));
    await waitFor(() => expect(staffApi.getStaff).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.any(AbortSignal)));
  });
  it("distinguishes loading, error, retry and successful empty results", async () => {
    vi.mocked(staffApi.getStaff).mockRejectedValueOnce(rejection("Directory unavailable")).mockResolvedValueOnce({ ...staffDirectory, data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    page(); expect(screen.getByLabelText("Loading Staff directory")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Directory unavailable");
    expect(screen.queryByText("No staff match these filters.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry Staff directory" }));
    expect(await screen.findByText("No staff match these filters.")).toBeInTheDocument();
  });
  it("isolates audit failure, retries it and scopes history to the selected account", async () => {
    vi.mocked(staffApi.getAudit).mockRejectedValueOnce(rejection("Audit unavailable"));
    page(); await screen.findByRole("button", { name: "Manage Example Receptionist" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Audit unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry Recent staff activity" }));
    await screen.findByText("Receptionist created");
    await manage();
    await waitFor(() => expect(staffApi.getAudit).toHaveBeenLastCalledWith({ targetId: receptionist.id, page: 1, limit: 10 }, expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole("button", { name: "Show all staff activity" }));
    await waitFor(() => expect(staffApi.getAudit).toHaveBeenLastCalledWith({ targetId: undefined, page: 1, limit: 10 }, expect.any(AbortSignal)));
  });
  it("refreshes directory, selected staff and audit history", async () => {
    page(); await manage();
    const counts = [vi.mocked(staffApi.getStaff).mock.calls.length, vi.mocked(staffApi.getById).mock.calls.length, vi.mocked(staffApi.getAudit).mock.calls.length];
    fireEvent.click(screen.getByRole("button", { name: "Refresh staff" }));
    await waitFor(() => {
      expect(staffApi.getStaff).toHaveBeenCalledTimes(counts[0] + 1);
      expect(staffApi.getById).toHaveBeenCalledTimes(counts[1] + 1);
      expect(staffApi.getAudit).toHaveBeenCalledTimes(counts[2] + 1);
    });
  });
});

describe("Receptionist creation", () => {
  it("sends normalized name/email and password through the existing create API without role or permission injection", async () => {
    page(); await creation();
    fireEvent.submit(screen.getByRole("form", { name: "Create staff account" }));
    await waitFor(() => expect(staffApi.createStaff).toHaveBeenCalledWith({ fullName: "New Example", email: "new@example.test", password: "Fictional password 123" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Receptionist created with default permissions");
    await screen.findByRole("form", { name: "Edit staff profile" });
  });
  it.each(["short", "x".repeat(73), "😀".repeat(19)])("rejects invalid password length before requesting creation (%s)", async (password) => {
    page(); const form = await creation();
    fireEvent.change(form.getByLabelText("Initial password"), { target: { value: password } });
    fireEvent.change(form.getByLabelText("Confirm initial password"), { target: { value: password } });
    fireEvent.submit(screen.getByRole("form", { name: "Create staff account" }));
    expect(screen.getByRole("alert")).toBeInTheDocument(); expect(staffApi.createStaff).not.toHaveBeenCalled();
  });
  it("requires matching passwords and valid profile fields", async () => {
    page(); const form = await creation();
    fireEvent.change(form.getByLabelText("Confirm initial password"), { target: { value: "Different password 123" } });
    fireEvent.submit(screen.getByRole("form", { name: "Create staff account" }));
    expect(screen.getByRole("alert")).toHaveTextContent("match"); expect(staffApi.createStaff).not.toHaveBeenCalled();
    fireEvent.change(form.getByLabelText("Full name"), { target: { value: "x" } });
    fireEvent.change(form.getByLabelText("Email address"), { target: { value: "invalid" } });
    fireEvent.submit(screen.getByRole("form", { name: "Create staff account" }));
    expect(staffApi.createStaff).not.toHaveBeenCalled();
  });
  it("prevents duplicate pending submits and clears sensitive fields after a rejected request", async () => {
    let reject!: (reason: unknown) => void;
    vi.mocked(staffApi.createStaff).mockImplementationOnce(() => new Promise((_, failure) => { reject = failure; }));
    page(); const form = await creation();
    const node = screen.getByRole("form", { name: "Create staff account" });
    fireEvent.submit(node); fireEvent.submit(node);
    expect(staffApi.createStaff).toHaveBeenCalledOnce();
    await act(async () => reject(rejection("Email already exists")));
    expect(screen.getByRole("alert")).toHaveTextContent("Email already exists");
    expect(form.getByLabelText("Initial password")).toHaveValue("");
    expect(form.getByLabelText("Confirm initial password")).toHaveValue("");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("confirmed staff profile and access changes", () => {
  it("confirms normalized profile edits with the current version and refreshes successful history", async () => {
    page(); const form = await manage();
    fireEvent.change(form.getByLabelText("Full name"), { target: { value: " Updated Example " } });
    fireEvent.change(form.getByLabelText("Email address"), { target: { value: " UPDATE@example.test " } });
    fireEvent.submit(screen.getByRole("form", { name: "Edit staff profile" }));
    expect(screen.getByRole("alertdialog", { name: "Confirm profile changes" })).toBeInTheDocument();
    expect(staffApi.updateProfile).not.toHaveBeenCalled();
    confirm();
    await waitFor(() => expect(staffApi.updateProfile).toHaveBeenCalledWith(receptionist.id, { fullName: "Updated Example", email: "update@example.test", expectedVersion: 3 }));
    expect(await screen.findByRole("status")).toHaveTextContent("Existing sessions were revoked");
    await waitFor(() => expect(staffApi.getById).toHaveBeenCalledTimes(2));
  });
  it("keeps cancellation keyboard accessible and never submits cancelled changes", async () => {
    page(); await manage();
    const open = screen.getByRole("button", { name: "Deactivate account" }); open.focus(); fireEvent.click(open);
    const dialog = screen.getByRole("alertdialog", { name: "Deactivate staff account" });
    const cancel = within(dialog).getByRole("button", { name: "Cancel" }); expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true }); expect(within(dialog).getByRole("button", { name: "Confirm changes" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(open).toHaveFocus();
    expect(staffApi.updateStatus).not.toHaveBeenCalled();
  });
  it("groups only assignable permissions and can explicitly remove every business permission", async () => {
    page(); await manage();
    expect(await screen.findByRole("group", { name: "Members" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Payments" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(staffCatalogue.defaultPermissions.length);
    expect(screen.getByRole("checkbox", { name: "Record payments" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getAllByRole("checkbox").every((input) => !(input as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save permission choices" })); confirm();
    await waitFor(() => expect(staffApi.updatePermissions).toHaveBeenCalledWith(receptionist.id, { permissions: [], expectedVersion: 3 }));
  });
  it("saves selected checkboxes without granting Admin-only operations", async () => {
    page(); await manage(); await screen.findByRole("checkbox", { name: "Record payments" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Record payments" }));
    fireEvent.click(screen.getByRole("button", { name: "Save permission choices" })); confirm();
    await waitFor(() => expect(staffApi.updatePermissions).toHaveBeenCalledWith(receptionist.id, { permissions: staffCatalogue.defaultPermissions.filter((key) => key !== "payments.record"), expectedVersion: 3 }));
  });
  it("restores legacy/default access using null rather than an empty or copied override", async () => {
    page(); await manage(inactiveStaff);
    fireEvent.click(await screen.findByRole("button", { name: "Restore default permissions" }));
    expect(screen.getByRole("alertdialog", { name: "Restore default permissions" })).toBeInTheDocument(); confirm();
    await waitFor(() => expect(staffApi.updatePermissions).toHaveBeenCalledWith(inactiveStaff.id, { permissions: null, expectedVersion: 8 }));
  });
  it.each([managedReceptionist, inactiveStaff])("confirms the appropriate activation transition for $fullName", async (target) => {
    page(); await manage(target);
    fireEvent.click(screen.getByRole("button", { name: target.isActive ? "Deactivate account" : "Activate account" })); confirm();
    await waitFor(() => expect(staffApi.updateStatus).toHaveBeenCalledWith(target.id, { isActive: !target.isActive, expectedVersion: target.version }));
  });
  it("protects Admin status, role and permissions while allowing profile and password management", async () => {
    page(); await manage(managedAdmin);
    expect(screen.getByText(/cannot deactivate or demote any Admin/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Deactivate|Activate) account$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save permission choices" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset password" })).toBeInTheDocument();
    expect(within(screen.getByRole("form", { name: "Edit staff profile" })).queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("shows a stale-write rejection without a false success and lets the Admin refresh", async () => {
    vi.mocked(staffApi.updateStatus).mockRejectedValueOnce(rejection("Staff account changed. Refresh before trying again."));
    page(); await manage(); fireEvent.click(screen.getByRole("button", { name: "Deactivate account" })); confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Staff account changed");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh staff" }));
    await waitFor(() => expect(staffApi.getById).toHaveBeenCalledTimes(2));
  });
  it("reports no-op edits without claiming an audit event or revoked sessions", async () => {
    vi.mocked(staffApi.updateProfile).mockResolvedValueOnce({ success: true, changed: false, staff: managedReceptionist });
    page(); await manage(); fireEvent.submit(screen.getByRole("form", { name: "Edit staff profile" })); confirm();
    expect(await screen.findByRole("status")).toHaveTextContent("No changes were needed; no audit event was added");
  });
});

describe("password resets and own sessions", () => {
  it("validates reset confirmation and submits only password plus version after confirmation", async () => {
    page(); await manage(); fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    const dialog = within(screen.getByRole("alertdialog", { name: "Reset staff password" }));
    fireEvent.change(dialog.getByLabelText("New password"), { target: { value: "Fictional reset 123" } });
    fireEvent.change(dialog.getByLabelText("Confirm new password"), { target: { value: "Different reset 123" } });
    confirm(); expect(dialog.getByRole("alert")).toHaveTextContent("match"); expect(staffApi.resetPassword).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText("Confirm new password"), { target: { value: "Fictional reset 123" } });
    confirm();
    await waitFor(() => expect(staffApi.resetPassword).toHaveBeenCalledWith(receptionist.id, { password: "Fictional reset 123", expectedVersion: 3 }));
    await screen.findByRole("status"); expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("prevents concurrent reset submissions and clears both password inputs after failure", async () => {
    let reject!: (reason: unknown) => void;
    vi.mocked(staffApi.resetPassword).mockImplementationOnce(() => new Promise((_, failure) => { reject = failure; }));
    page(); await manage(); fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    const node = screen.getByRole("alertdialog"); const dialog = within(node);
    fireEvent.change(dialog.getByLabelText("New password"), { target: { value: "Fictional reset 123" } });
    fireEvent.change(dialog.getByLabelText("Confirm new password"), { target: { value: "Fictional reset 123" } });
    fireEvent.submit(node.querySelector("form")!); fireEvent.submit(node.querySelector("form")!);
    expect(staffApi.resetPassword).toHaveBeenCalledOnce();
    await act(async () => reject(rejection("Unable to update account")));
    expect(dialog.getByRole("alert")).toHaveTextContent("Unable to update account");
    expect(dialog.getByLabelText("New password")).toHaveValue("");
    expect(dialog.getByLabelText("Confirm new password")).toHaveValue("");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("uses the existing logout flow and login redirect after changing the current Admin password", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    vi.mocked(staffApi.resetPassword).mockResolvedValueOnce({ success: true, changed: true, staff: { ...managedAdmin, version: 1 } });
    renderWithAuth(<Routes><Route path="/staff" element={<StaffManagementPage />} /><Route path="/login" element={<h1>Sign in again</h1>} /></Routes>, authState("ADMIN", { logout }), "/staff");
    await manage(managedAdmin); fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    const dialog = within(screen.getByRole("alertdialog"));
    expect(dialog.getByText(/This is your account/)).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText("New password"), { target: { value: "Fictional reset 123" } });
    fireEvent.change(dialog.getByLabelText("Confirm new password"), { target: { value: "Fictional reset 123" } });
    confirm();
    expect(await screen.findByRole("heading", { name: "Sign in again" })).toBeInTheDocument();
    expect(logout).toHaveBeenCalledOnce();
  });
  it("reloads sign-in instead of keeping stale Admin auth when logout fails after a self reset", async () => {
    const logout = vi.fn().mockRejectedValue(new Error("Fictional logout connection failure"));
    vi.mocked(staffApi.resetPassword).mockResolvedValueOnce({ success: true, changed: true, staff: { ...managedAdmin, version: 1 } });
    renderWithAuth(<StaffManagementPage />, authState("ADMIN", { logout }), "/staff");
    await manage(managedAdmin); fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    const dialog = within(screen.getByRole("alertdialog"));
    fireEvent.change(dialog.getByLabelText("New password"), { target: { value: "Fictional reset 123" } });
    fireEvent.change(dialog.getByLabelText("Confirm new password"), { target: { value: "Fictional reset 123" } });
    // jsdom cannot navigate. Replace only the location read while retaining all
    // other browser globals; the full reload is also verified in real Chrome.
    const realWindow = window;
    const replace = vi.fn();
    vi.stubGlobal("window", new Proxy(realWindow, { get: (target, key) => key === "location" ? { replace } : Reflect.get(target, key, target) }));
    try {
      confirm();
      await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/login"));
      expect(logout).toHaveBeenCalledOnce();
    } finally { vi.stubGlobal("window", realWindow); }
  });
});
