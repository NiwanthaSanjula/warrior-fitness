import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api/api";
import { equipmentApi } from "../src/api/equipment.api";
import { equipmentFixture as item } from "./fixtures/equipment";
import { equipmentProfileSchema } from "../src/validations/equipment.schema";
vi.mock("../src/api/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() } }));
beforeEach(() => { Object.values(api).forEach(method => vi.mocked(method).mockResolvedValue({ data: { success: true, equipment: item } })); });
describe("typed equipment API adapters", () => {
  it("uses existing Axios and passes read cancellation/pagination", async () => {
    const signal = new AbortController().signal;
    await equipmentApi.list({ page: 2, limit: 10, q: "GYM" }, signal);
    expect(api.get).toHaveBeenCalledWith("/equipment", { params: { page: 2, limit: 10, q: "GYM" }, signal });
    await equipmentApi.history(item.id, "work-orders", 3, signal);
    expect(api.get).toHaveBeenLastCalledWith(`/equipment/${item.id}/history`, { params: { kind: "work-orders", page: 3, limit: 10 }, signal });
  });
  it("sends the current equipment version for status, profile and incident edits", async () => {
    await equipmentApi.status(item, "RETIRED", "Unsafe to repair");
    expect(api.patch).toHaveBeenLastCalledWith(`/equipment/${item.id}/status`, { status: "RETIRED", reason: "Unsafe to repair", version: 2 });
    const fields = equipmentProfileSchema.parse(item);
    await equipmentApi.update(item, { ...fields, purchasePriceLkr: null });
    expect(api.put).toHaveBeenCalledWith(`/equipment/${item.id}`, expect.objectContaining({ version: 2 }));
    await equipmentApi.report(item, { requestId: "example-key", description: "Example problem", severity: "HIGH" });
    expect(api.post).toHaveBeenLastCalledWith(`/equipment/${item.id}/incidents`, expect.objectContaining({ version: 2, requestId: "example-key" }));
  });
  it("sends the current version for work creation, assignment, completion and expense references", async () => {
    const assignment = { technician: "Example", provider: "", contact: "", estimatedCostLkr: 2000 };
    await equipmentApi.createWork(item, { ...assignment, title: "Example service", kind: "PREVENTIVE", plannedDate: "2026-01-15", incidentId: null, notes: "" });
    expect(api.post).toHaveBeenLastCalledWith(`/equipment/${item.id}/work-orders`, expect.objectContaining({ version: 2, estimatedCostLkr: 2000 }));
    await equipmentApi.assign(item, "work", assignment);
    expect(api.patch).toHaveBeenLastCalledWith(`/equipment/${item.id}/work-orders/work/assignment`, { ...assignment, version: 2 });
    await equipmentApi.transition(item, "work", { action: "COMPLETE", repairNotes: "Example repair complete", returnToService: true });
    expect(api.post).toHaveBeenLastCalledWith(`/equipment/${item.id}/work-orders/work/transition`, expect.objectContaining({ version: 2, action: "COMPLETE" }));
    await equipmentApi.linkExpense(item, "work", "expense");
    expect(api.post).toHaveBeenLastCalledWith(`/equipment/${item.id}/work-orders/work/expenses`, { expenseId: "expense", version: 2 });
  });
});
