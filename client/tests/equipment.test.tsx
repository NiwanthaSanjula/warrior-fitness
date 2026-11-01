import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { AuthProvider } from "../src/auth/AuthProvider";
import { authApi } from "../src/api/auth.api";
import App from "../src/App";
import AppLayout from "../src/components/AppLayout";
import EquipmentPage from "../src/pages/EquipmentPage";
import EquipmentDetailPage from "../src/pages/EquipmentDetailPage";
import EquipmentMaintenancePage from "../src/pages/EquipmentMaintenancePage";
import { AvailabilityForm, EquipmentForm, FaultForm, WorkOrderForm } from "../src/components/equipment/EquipmentForms";
import { IncidentCard, WorkCard } from "../src/components/equipment/MaintenanceCards";
import { equipmentApi } from "../src/api/equipment.api";
import { financialApi } from "../src/api/financial.api";
import { equipmentDetailUrl, equipmentLoginReturn } from "../src/utils/equipment";
import { admin, authState, receptionist, renderWithAuth } from "./helpers/auth";
import { equipmentFixture as item, equipmentPagination, equipmentWorkFixture as work, incidentFixture as incident, inventoryFixture, maintenanceFixture } from "./fixtures/equipment";
import { expenseFixture, expenseListFixture } from "./fixtures/financial";

vi.mock("../src/api/equipment.api", () => ({ equipmentApi: { list: vi.fn(), get: vi.fn(), history: vi.fn(), create: vi.fn(), update: vi.fn(), status: vi.fn(), report: vi.fn(), review: vi.fn(), createWork: vi.fn(), assign: vi.fn(), transition: vi.fn(), linkExpense: vi.fn(), dashboard: vi.fn(), works: vi.fn(), incidents: vi.fn() } }));
vi.mock("../src/api/financial.api", () => ({ financialApi: { getExpenses: vi.fn() } }));
vi.mock("../src/api/auth.api", () => ({ authApi: { getCurrentStaff: vi.fn(), login: vi.fn(), logout: vi.fn() } }));
vi.mock("../src/pages/DashboardPage", () => ({ default: () => <h1>Permitted dashboard</h1> }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,ZmFrZQ==") } }));
const failure = (message: string) => ({ isAxiosError: true, response: { status: 409, data: { message } } });
beforeEach(() => {
  Object.values(equipmentApi).forEach(method => vi.mocked(method).mockReset());
  vi.mocked(equipmentApi.list).mockResolvedValue(structuredClone(inventoryFixture));
  vi.mocked(equipmentApi.get).mockResolvedValue({ success: true, equipment: { ...item } });
  vi.mocked(equipmentApi.history).mockResolvedValue({ success: true, data: [{ ...incident }], pagination: equipmentPagination });
  vi.mocked(equipmentApi.dashboard).mockResolvedValue(structuredClone(maintenanceFixture));
  vi.mocked(equipmentApi.works).mockResolvedValue({ success: true, data: [{ ...work }], pagination: equipmentPagination });
  vi.mocked(equipmentApi.incidents).mockResolvedValue({ success: true, data: [{ ...incident }], pagination: equipmentPagination });
  for (const method of [equipmentApi.create, equipmentApi.update, equipmentApi.status, equipmentApi.report, equipmentApi.review, equipmentApi.createWork, equipmentApi.assign, equipmentApi.transition, equipmentApi.linkExpense]) vi.mocked(method).mockResolvedValue({ success: true, equipment: { ...item, version: 3 } });
  vi.mocked(financialApi.getExpenses).mockReset().mockResolvedValue({ ...expenseListFixture, data: [{ ...expenseFixture, id: "000000000000000000000103", category: "MAINTENANCE", description: "Recorded repair expense", amountLkr: 3500 }] });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
function detail(role: "ADMIN" | "RECEPTIONIST" = "ADMIN", permissions = role === "ADMIN" ? admin.permissions : receptionist.permissions) {
  return renderWithAuth(<Routes><Route path="/equipment/:id" element={<EquipmentDetailPage />} /></Routes>, authState(role, { staff: { ...(role === "ADMIN" ? admin : receptionist), permissions } }), `/equipment/${item.id}`);
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("equipment routing, navigation and QR security", () => {
  it("groups Admin inventory/maintenance links and highlights the active child", async () => {
    renderWithAuth(<App />, authState("ADMIN"), "/equipment/maintenance");
    await screen.findByRole("heading", { name: "Maintenance Command Center" });
    expect(screen.getByRole("button", { name: "Equipment" })).toHaveAttribute("aria-expanded", "true");
    const links = within(screen.getByRole("list", { name: "Equipment pages" }));
    expect(links.getByRole("link", { name: "Maintenance" })).toHaveAttribute("aria-current", "page");
    expect(links.getByRole("link", { name: "Equipment Inventory" })).not.toHaveAttribute("aria-current");
  });
  it("shows only Inventory to Receptionists and supports disclosure collapse", () => {
    renderWithAuth(<AppLayout />, authState("RECEPTIONIST"), "/equipment");
    const toggle = screen.getByRole("button", { name: "Equipment" });
    expect(screen.getByRole("link", { name: "Equipment Inventory" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Maintenance" })).not.toBeInTheDocument();
    fireEvent.click(toggle); expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle); expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
  it("honors deny-all and never calls equipment APIs from denied routes", async () => {
    renderWithAuth(<App />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: [] } }), "/equipment");
    await screen.findByRole("heading", { name: "Permitted dashboard" });
    expect(screen.queryByRole("button", { name: "Equipment" })).not.toBeInTheDocument();
    Object.values(equipmentApi).forEach(method => expect(method).not.toHaveBeenCalled());
  });
  it("denies Receptionist maintenance administration despite forged grants", async () => {
    renderWithAuth(<App />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["equipment.read", "equipment.manage"] } }), "/equipment/maintenance");
    await screen.findByRole("heading", { name: "Permitted dashboard" });
    expect(equipmentApi.dashboard).not.toHaveBeenCalled(); expect(equipmentApi.works).not.toHaveBeenCalled();
  });
  it("requires login for scanned profiles and preserves the safe equipment destination", async () => {
    const auth = authState(null);
    renderWithAuth(<App />, auth, `/equipment/${item.id}`);
    fireEvent.change(await screen.findByPlaceholderText("admin@warriorfitness.lk"), { target: { value: "example@example.test" } });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), { target: { value: "Fictional password 123" } });
    fireEvent.submit(screen.getByRole("button", { name: /Sign in/i }).closest("form")!);
    await waitFor(() => expect(auth.login).toHaveBeenCalled());
    expect(equipmentApi.get).not.toHaveBeenCalled(); // Context remains unauthenticated in this test.
  });
  it("encodes only a private-free HTTP(S) profile URL and rejects hostile login redirects", async () => {
    expect(equipmentDetailUrl("https://gym.example.test/other?token=secret", item.id)).toBe(`https://gym.example.test/equipment/${item.id}`);
    expect(() => equipmentDetailUrl("javascript:alert(1)", item.id)).toThrow();
    expect(() => equipmentDetailUrl("https://gym.example.test", "../../private")).toThrow();
    expect(equipmentLoginReturn({ equipmentReturnTo: `/equipment/${item.id}` })).toBe(`/equipment/${item.id}`);
    for (const target of ["https://evil.test", "//evil.test", "/equipment/../reports", "/equipment?token=secret", "/reports"]) expect(equipmentLoginReturn({ equipmentReturnTo: target })).toBe("/dashboard");
    detail();
    await screen.findByRole("img", { name: "QR code for GYM-100" });
    const qr = await import("qrcode");
    expect(qr.default.toDataURL).toHaveBeenCalledWith(`${window.location.origin}/equipment/${item.id}`, expect.objectContaining({ width: 240 }));
    vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Print QR label" })); expect(window.print).toHaveBeenCalledOnce();
  });
  it("returns to the scanned profile when the real auth provider completes login", async () => {
    vi.mocked(authApi.getCurrentStaff).mockRejectedValueOnce(new Error("No simulated session"));
    vi.mocked(authApi.login).mockResolvedValueOnce({ success: true, staff: admin });
    render(<MemoryRouter initialEntries={[`/equipment/${item.id}`]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Email Address"), { target: { value: "admin@example.test" } });
    change("Password", "Fictional demo login");
    fireEvent.submit(screen.getByRole("button", { name: /Sign in/i }).closest("form")!);
    expect(await screen.findByRole("heading", { name: item.name })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Permitted dashboard" })).not.toBeInTheDocument();
    expect(equipmentApi.get).toHaveBeenCalledWith(item.id, expect.any(AbortSignal));
  });
});

describe("inventory and profile reads", () => {
  it("renders real inventory, statistics, Colombo dates and searchable paginated filters", async () => {
    vi.mocked(equipmentApi.list).mockResolvedValue({ ...inventoryFixture, pagination: { page: 1, limit: 10, total: 11, totalPages: 2 } });
    renderWithAuth(<EquipmentPage />, authState("ADMIN"));
    expect(screen.getByLabelText("Loading Equipment inventory")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: item.name })).toHaveAttribute("href", `/equipment/${item.id}`);
    expect(screen.getByText("15 Jan 2026")).toBeInTheDocument();
    change("Search equipment", "belt.*"); change("Equipment status", "OPERATIONAL"); change("Equipment category", "CARDIO"); change("Location filter", "Cardio");
    fireEvent.submit(screen.getByRole("form", { name: "Equipment inventory filters" }));
    await waitFor(() => expect(equipmentApi.list).toHaveBeenLastCalledWith({ q: "belt.*", status: "OPERATIONAL", category: "CARDIO", location: "Cardio", page: 1, limit: 10 }, expect.any(AbortSignal)));
    fireEvent.click(await screen.findByRole("button", { name: "Next inventory page" }));
    await waitFor(() => expect(equipmentApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.any(AbortSignal)));
  });
  it("distinguishes failure and successful empty inventory, supports retry and refresh", async () => {
    vi.mocked(equipmentApi.list).mockRejectedValueOnce(failure("Inventory unavailable")).mockResolvedValueOnce({ ...inventoryFixture, data: [] });
    renderWithAuth(<EquipmentPage />, authState("ADMIN"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Inventory unavailable");
    expect(screen.queryByText("No equipment matches these filters.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Unavailable")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Retry Equipment inventory" }));
    await screen.findByText("No equipment matches these filters.");
    fireEvent.click(screen.getByRole("button", { name: "Refresh equipment" }));
    await waitFor(() => expect(equipmentApi.list).toHaveBeenCalledTimes(3));
  });
  it("hides registration and maintenance actions on the permitted Receptionist directory", async () => {
    renderWithAuth(<EquipmentPage />, authState("RECEPTIONIST")); await screen.findByRole("link", { name: item.name });
    expect(screen.queryByRole("button", { name: "Register equipment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Maintenance" })).not.toBeInTheDocument();
  });
  it("shows Admin-only financial metadata and QR plus full history selection", async () => {
    detail(); await screen.findByRole("heading", { name: item.name });
    expect(screen.getByText(/LKR.*200,000/)).toBeInTheDocument();
    expect(screen.getByText("Private safety assessment", { exact: false })).toBeInTheDocument();
    vi.mocked(equipmentApi.history).mockResolvedValueOnce({ success: true, data: [{ id: "event", action: "EQUIPMENT_REGISTERED", notes: "Registered example asset", actorName: "Example Admin", recordedAt: "2026-01-15T19:00:00Z" }], pagination: equipmentPagination });
    fireEvent.click(screen.getByRole("button", { name: "Activity history" }));
    await screen.findByText("Registered example asset");
    expect(screen.getByText(/16 Jan 2026.*00:30.*Colombo/)).toBeInTheDocument();
  });
  it("hides financial/private fields, Admin actions, activity and QR for Receptionists even if a payload contains them", async () => {
    detail("RECEPTIONIST"); await screen.findByRole("heading", { name: item.name });
    for (const label of ["Edit inventory", "Change availability", "Create maintenance work", "Activity history", "Print QR label"]) expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    expect(screen.queryByText(/200,000|Private safety assessment/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report a fault" })).toBeInTheDocument();
    vi.mocked(equipmentApi.history).mockResolvedValueOnce({ success: true, data: [{ ...work }], pagination: equipmentPagination });
    fireEvent.click(screen.getByRole("button", { name: "Maintenance history" }));
    await screen.findByText(work.title);
    expect(screen.queryByText(/Private service provider|Private contact|Private instructions|Private repair notes|5,000/)).not.toBeInTheDocument();
    expect(financialApi.getExpenses).not.toHaveBeenCalled();
  });
  it("requires the report permission, hides retired actions and handles invalid IDs without requests", async () => {
    const view = detail("RECEPTIONIST", ["equipment.read"]); await screen.findByRole("heading", { name: item.name });
    expect(screen.queryByRole("button", { name: "Report a fault" })).not.toBeInTheDocument(); view.unmount();
    vi.mocked(equipmentApi.get).mockResolvedValue({ success: true, equipment: { ...item, status: "RETIRED" } });
    const retired = detail(); await screen.findByRole("heading", { name: item.name });
    expect(screen.queryByRole("button", { name: "Create maintenance work" })).not.toBeInTheDocument(); retired.unmount();
    vi.mocked(equipmentApi.get).mockClear();
    renderWithAuth(<Routes><Route path="/equipment/:id" element={<EquipmentDetailPage />} /></Routes>, authState("ADMIN"), "/equipment/bad-id");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid equipment link"); expect(equipmentApi.get).not.toHaveBeenCalled();
  });
  it("isolates history failures from equipment detail and supports history retry", async () => {
    vi.mocked(equipmentApi.history).mockRejectedValueOnce(failure("History unavailable")); detail();
    await screen.findByRole("heading", { name: item.name });
    expect(await screen.findByRole("alert")).toHaveTextContent("History unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry Breakdown history" }));
    await screen.findByText(incident.description);
  });
});

describe("equipment workflow forms", () => {
  it("creates an asset with normalized ID and whole-LKR metadata", async () => {
    const saved = vi.fn(); renderWithAuth(<EquipmentForm saved={saved} />, authState("ADMIN"));
    change("Asset ID", " gym-100 "); change("Equipment name", item.name); change("Location / section", item.location); change("Purchase price (LKR)", "200000");
    fireEvent.submit(screen.getByRole("form", { name: "Register equipment" }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(equipmentApi.create).toHaveBeenCalledWith(expect.objectContaining({ assetId: "GYM-100", purchasePriceLkr: 200000, location: item.location }));
    expect(financialApi.getExpenses).not.toHaveBeenCalled();
  });
  it("rejects fractional prices and invalid recurring schedules before API writes", async () => {
    renderWithAuth(<EquipmentForm saved={vi.fn()} />, authState("ADMIN"));
    change("Asset ID", "GYM-100"); change("Equipment name", item.name); change("Location / section", item.location); change("Purchase price (LKR)", "1.5");
    fireEvent.submit(screen.getByRole("form", { name: "Register equipment" })); await screen.findByRole("alert"); expect(equipmentApi.create).not.toHaveBeenCalled();
    change("Purchase price (LKR)", "100"); change("Preventive interval (days)", "30");
    fireEvent.submit(screen.getByRole("form", { name: "Register equipment" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/service|date|schedule/i)); expect(equipmentApi.create).not.toHaveBeenCalled();
  });
  it("edits inventory without allowing the permanent asset ID to be rewritten", async () => {
    renderWithAuth(<EquipmentForm item={item} saved={vi.fn()} />, authState("ADMIN"));
    expect(screen.queryByLabelText("Asset ID")).not.toBeInTheDocument(); change("Equipment name", "Updated example treadmill");
    fireEvent.submit(screen.getByRole("form", { name: "Edit equipment" }));
    await waitFor(() => expect(equipmentApi.update).toHaveBeenCalledWith(item, expect.objectContaining({ name: "Updated example treadmill" })));
    expect(window.confirm).toHaveBeenCalled();
  });
  it("requires availability confirmation and handles stale-version errors without success", async () => {
    const done = vi.fn(); renderWithAuth(<AvailabilityForm item={item} done={done} />, authState("ADMIN"));
    change("New status", "OUT_OF_SERVICE"); change("Reason for status change", "Needs safety inspection");
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.submit(screen.getByRole("form", { name: "Change equipment availability" })); expect(equipmentApi.status).not.toHaveBeenCalled();
    vi.mocked(equipmentApi.status).mockRejectedValueOnce(failure("Equipment changed. Refresh first."));
    fireEvent.submit(screen.getByRole("form", { name: "Change equipment availability" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Equipment changed"); expect(done).not.toHaveBeenCalled();
  });
  it("keeps the same fault request key after an uncertain response and prevents double submission", async () => {
    const done = vi.fn(); let reject: (reason: unknown) => void = () => {};
    vi.mocked(equipmentApi.report).mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    renderWithAuth(<FaultForm item={item} done={done} />, authState("RECEPTIONIST"));
    change("Problem description", incident.description); change("Severity", "HIGH");
    const form = screen.getByRole("form", { name: "Report equipment fault" });
    fireEvent.submit(form); fireEvent.submit(form); expect(equipmentApi.report).toHaveBeenCalledOnce();
    await act(async () => reject(failure("Connection lost"))); await screen.findByRole("alert");
    fireEvent.submit(form); await waitFor(() => expect(done).toHaveBeenCalled());
    expect(vi.mocked(equipmentApi.report).mock.calls[0][1].requestId).toBe(vi.mocked(equipmentApi.report).mock.calls[1][1].requestId);
  });
  it("creates work linked to a selected breakdown, keeping estimates separate from expenses", async () => {
    renderWithAuth(<WorkOrderForm item={item} incidentId={incident.id} done={vi.fn()} />, authState("ADMIN"));
    change("Work order title", "Repair noisy treadmill belt"); change("Service provider", "Example provider"); change("Estimated repair cost (LKR)", "5000");
    fireEvent.submit(screen.getByRole("form", { name: "Create maintenance work order" }));
    await waitFor(() => expect(equipmentApi.createWork).toHaveBeenCalledWith(item, expect.objectContaining({ incidentId: incident.id, kind: "REPAIR", estimatedCostLkr: 5000 })));
    expect(financialApi.getExpenses).not.toHaveBeenCalled();
  });
  it("reviews a fault with an explanation and authenticated backend attribution", async () => {
    renderWithAuth(<IncidentCard incident={incident} item={item} manage done={vi.fn()} createWork={vi.fn()} />, authState("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Review fault" })); change("Review notes", "Technician inspected the fault");
    fireEvent.submit(screen.getByRole("form", { name: "Review breakdown" }));
    await waitFor(() => expect(equipmentApi.review).toHaveBeenCalledWith(item, incident.id, "ACKNOWLEDGE", "Technician inspected the fault"));
  });
  it("starts assigned work and prevents starting unassigned work", async () => {
    const view = renderWithAuth(<WorkCard work={{ ...work, technician: "", provider: "" }} item={item} manage done={vi.fn()} />, authState("ADMIN"));
    expect(screen.getByRole("button", { name: "Start work order" })).toBeDisabled(); view.unmount();
    renderWithAuth(<WorkCard work={work} item={item} manage done={vi.fn()} />, authState("ADMIN"));
    fireEvent.submit(screen.getByRole("form", { name: "Start maintenance work" }));
    await waitFor(() => expect(equipmentApi.transition).toHaveBeenCalledWith(item, work.id, { action: "START" }));
  });
  it("records completion notes, optional service date and an explicit return-to-service choice", async () => {
    renderWithAuth(<WorkCard work={{ ...work, status: "IN_PROGRESS" }} item={item} manage done={vi.fn()} />, authState("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Complete work" })); change("Repair / completion notes", "Belt inspected and repaired");
    change("Override next service date (optional)", "2027-01-01"); fireEvent.click(screen.getByLabelText("Return equipment to operational status after completion"));
    fireEvent.submit(screen.getByRole("form", { name: "Complete maintenance work" }));
    await waitFor(() => expect(equipmentApi.transition).toHaveBeenCalledWith(item, work.id, { action: "COMPLETE", repairNotes: "Belt inspected and repaired", nextServiceDate: "2027-01-01", returnToService: true }));
  });
  it("cancels with a reason and preserves completed work against lifecycle edits", async () => {
    const view = renderWithAuth(<WorkCard work={work} item={item} manage done={vi.fn()} />, authState("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel work order" })); change("Cancellation reason", "Awaiting replacement parts");
    fireEvent.submit(screen.getByRole("form", { name: "Cancel maintenance work" }));
    await waitFor(() => expect(equipmentApi.transition).toHaveBeenCalledWith(item, work.id, { action: "CANCEL", reason: "Awaiting replacement parts" })); view.unmount();
    renderWithAuth(<WorkCard work={{ ...work, status: "COMPLETED" }} item={item} manage done={vi.fn()} />, authState("ADMIN"));
    for (const label of ["Edit assignment", "Start work order", "Cancel work order", "Complete work"]) expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  });
  it("links a verified Finance result only after search and confirmation", async () => {
    renderWithAuth(<WorkCard work={{ ...work, status: "COMPLETED" }} item={item} manage done={vi.fn()} />, authState("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Link existing expense" })); expect(financialApi.getExpenses).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole("form", { name: "Find existing equipment expense" }));
    fireEvent.click(await screen.findByRole("radio")); fireEvent.submit(screen.getByRole("form", { name: "Link verified expense" }));
    await waitFor(() => expect(equipmentApi.linkExpense).toHaveBeenCalledWith(item, work.id, "000000000000000000000103"));
    expect(screen.getByText(/planning only/)).toHaveTextContent(/5,000/);
  });
});

describe("maintenance command center", () => {
  it("renders actual due queues/work/faults and independent status/severity filters", async () => {
    renderWithAuth(<EquipmentMaintenancePage />, authState("ADMIN"));
    await screen.findByText(work.title); expect(screen.getByText(incident.description)).toBeInTheDocument();
    expect(screen.getByText(/Due today · 15 Jan 2026/)).toBeInTheDocument();
    change("Work status", "COMPLETED"); change("Fault severity", "CRITICAL"); change("Fault status", "ACKNOWLEDGED");
    await waitFor(() => expect(equipmentApi.works).toHaveBeenLastCalledWith("COMPLETED", 1, expect.any(AbortSignal)));
    await waitFor(() => expect(equipmentApi.incidents).toHaveBeenLastCalledWith("ACKNOWLEDGED", "CRITICAL", 1, expect.any(AbortSignal)));
  });
  it("isolates panel failures and refreshes all three resources", async () => {
    vi.mocked(equipmentApi.dashboard).mockRejectedValueOnce(failure("Queue unavailable"));
    renderWithAuth(<EquipmentMaintenancePage />, authState("ADMIN"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Queue unavailable"); await screen.findByText(work.title);
    expect(screen.getAllByText("Unavailable")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Refresh maintenance" }));
    await waitFor(() => { expect(equipmentApi.dashboard).toHaveBeenCalledTimes(2); expect(equipmentApi.works).toHaveBeenCalledTimes(2); expect(equipmentApi.incidents).toHaveBeenCalledTimes(2); });
  });
  it("shows genuine empty states and blocks standalone Receptionist requests", async () => {
    vi.mocked(equipmentApi.dashboard).mockResolvedValue({ ...maintenanceFixture, queue: [] }); vi.mocked(equipmentApi.works).mockResolvedValue({ success: true, data: [], pagination: equipmentPagination }); vi.mocked(equipmentApi.incidents).mockResolvedValue({ success: true, data: [], pagination: equipmentPagination });
    const view = renderWithAuth(<EquipmentMaintenancePage />, authState("ADMIN")); await screen.findByText("No work orders match this filter.");
    expect(screen.getByText("No equipment needs service in this attention window.")).toBeInTheDocument(); expect(screen.getByText("No fault reports match this filter.")).toBeInTheDocument(); view.unmount();
    Object.values(equipmentApi).forEach(method => vi.mocked(method).mockClear());
    renderWithAuth(<EquipmentMaintenancePage />, authState("RECEPTIONIST"));
    expect(screen.getByRole("alert")).toHaveTextContent("Admin access is required"); Object.values(equipmentApi).forEach(method => expect(method).not.toHaveBeenCalled());
  });
});
