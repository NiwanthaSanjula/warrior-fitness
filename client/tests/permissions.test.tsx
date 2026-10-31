import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppLayout from "../src/components/AppLayout";
import MembersPage from "../src/pages/MembersPage";
import MemberProfilePage from "../src/pages/MemberProfilePage";
import InvoiceDetailPage from "../src/pages/InvoiceDetailPage";
import { Route, Routes } from "react-router";
import { membersApi } from "../src/api/members.api";
import { billingApi } from "../src/api/billing.api";
import { membershipsApi } from "../src/api/memberships.api";
import { attendanceApi } from "../src/api/attendance.api";
import { authState, receptionist, renderWithAuth } from "./helpers/auth";
import { PERMISSIONS, ADMIN_ONLY_PERMISSIONS } from "../../server/src/modules/auth/permissions";
import type { Permission } from "../src/auth/permissions";
import { hasPermissions } from "../src/auth/permissions";

vi.mock("../src/api/members.api", () => ({ membersApi: { getMembers: vi.fn(), getMemberById: vi.fn() } }));
vi.mock("../src/api/billing.api", () => ({ billingApi: { getInvoiceById: vi.fn(), getInvoicePayments: vi.fn() } }));

describe("frontend permission contract and real action visibility", () => {
  it("accepts every server catalogue key in the client wire type", () => {
    const keys: Permission[] = [...PERMISSIONS];
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("an empty permission list has no business access", () => {
    expect(hasPermissions({ ...receptionist, permissions: [] }, "members.read")).toBe(false);
  });

  it("custom permissions authorize only the requested capabilities", () => {
    const staff = { ...receptionist, permissions: ["members.read"] as Permission[] };
    expect(hasPermissions(staff, "members.read")).toBe(true);
    expect(hasPermissions(staff, "members.update")).toBe(false);
    expect(hasPermissions(staff, "members.read", "members.update")).toBe(false);
  });

  it("shows only permitted operational navigation for a custom Receptionist", () => {
    renderWithAuth(<AppLayout />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["members.read"] } }));
    expect(screen.getByRole("link", { name: "Manage Members" })).toBeInTheDocument();
    for (const name of ["Payments", "Attendance", "Attention Center", "Membership Plans", "Reports", "Settings"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("does not show Admin navigation for forged privileged Receptionist claims", () => {
    renderWithAuth(<AppLayout />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: [...ADMIN_ONLY_PERMISSIONS] } }));
    expect(screen.queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });

  it.each([false, true])("real member directory create-action access matches grant (%s)", async (canCreate) => {
    vi.mocked(membersApi.getMembers).mockResolvedValue({ success: true, data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    renderWithAuth(<MembersPage />, authState("RECEPTIONIST", {
      staff: { ...receptionist, permissions: canCreate ? ["members.read", "members.create"] : ["members.read"] },
    }));
    await waitFor(() => expect(membersApi.getMembers).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Add New Member" }) !== null).toBe(canCreate);
  });

  it("read-only member access never fetches unauthorized membership or attendance panels", async () => {
    vi.mocked(membersApi.getMemberById).mockResolvedValue({ success: true, message: "Fictional fixture", data: {
      id: "000000000000000000000003", memberId: "WF-EXAMPLE", fullName: "Example Member", phone: "0000000000",
      gender: null, dateOfBirth: null, address: null, emergencyContact: null,
      joinedAt: "2026-01-01T00:00:00.000Z", isActive: true, createdBy: receptionist.id,
    } });
    const memberships = vi.spyOn(membershipsApi, "getSummary");
    const attendance = vi.spyOn(attendanceApi, "getMemberHistory");
    renderWithAuth(<Routes><Route path="/members/:id" element={<MemberProfilePage />} /></Routes>,
      authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["members.read"] } }), "/members/000000000000000000000003");
    expect(await screen.findByRole("heading", { name: "Personal Information" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit Member" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage Membership" })).not.toBeInTheDocument();
    expect(memberships).not.toHaveBeenCalled();
    expect(attendance).not.toHaveBeenCalled();
  });

  it("invoice read access does not fetch payment history or offer payment recording", async () => {
    vi.mocked(billingApi.getInvoiceById).mockResolvedValue({ success: true, data: {
      id: "000000000000000000000004", invoiceNumber: "WF-INV-EXAMPLE", memberId: "000000000000000000000003",
      membershipId: "000000000000000000000005", planCode: "EXAMPLE", planName: "Example Plan",
      currency: "LKR", totalLkr: 1000, paidLkr: 0, balanceLkr: 1000, paymentStatus: "UNPAID", isOverdue: false,
      dueDate: "2026-01-15", createdBy: receptionist.id, createdAt: "2026-01-15T00:00:00.000Z", updatedAt: "2026-01-15T00:00:00.000Z",
    } });
    renderWithAuth(<Routes><Route path="/payments/invoices/:id" element={<InvoiceDetailPage />} /></Routes>,
      authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["invoices.read"] } }), "/payments/invoices/000000000000000000000004");
    expect(await screen.findByText("WF-INV-EXAMPLE")).toBeInTheDocument();
    expect(billingApi.getInvoicePayments).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Record Payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Payment History" })).not.toBeInTheDocument();
  });
});
