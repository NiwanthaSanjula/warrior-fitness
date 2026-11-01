import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AttendancePage from "../src/pages/AttendancePage";
import { attendanceApi } from "../src/api/attendance.api";
import { authState, receptionist, renderWithAuth } from "./helpers/auth";
import { attendanceFixture, gymDate } from "./fixtures/dashboard";
import { deskMember, deskVisit } from "./fixtures/front-desk";

vi.mock("../src/api/attendance.api", () => ({ attendanceApi: { getDaily: vi.fn(), getSummary: vi.fn(), checkIn: vi.fn(), searchMembers: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-31T20:00:00Z"));
  vi.mocked(attendanceApi.getDaily).mockResolvedValue({ success: true, date: gymDate, data: [{ ...deskVisit, memberName: deskMember.fullName, memberReference: deskMember.memberId, memberPhone: deskMember.phone }], total: 12, page: 1, limit: 10, totalPages: 2 });
  vi.mocked(attendanceApi.getSummary).mockResolvedValue(attendanceFixture);
});
afterEach(() => vi.useRealTimers());
describe("Attendance is history; Front Desk owns check-in", () => {
  it("preserves visit data and routes check-in to one workspace without competing search/write controls", async () => {
    renderWithAuth(<AttendancePage />, authState("RECEPTIONIST"), "/attendance");
    await screen.findByRole("link", { name: deskMember.fullName });
    expect(screen.getByRole("link", { name: "Front Desk" })).toHaveAttribute("href", "/front-desk");
    expect(screen.queryByRole("button", { name: /Check In/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Find a member for check-in" })).not.toBeInTheDocument();
    expect(attendanceApi.searchMembers).not.toHaveBeenCalled(); expect(attendanceApi.checkIn).not.toHaveBeenCalled();
    expect(screen.getByRole("table", { name: "Attendance history trend daily values" })).toBeInTheDocument();
  });
  it("retains date, search, pagination and refresh as read-only reporting operations", async () => {
    renderWithAuth(<AttendancePage />, authState("RECEPTIONIST"), "/attendance");
    await screen.findByRole("link", { name: deskMember.fullName });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-31" } });
    await waitFor(() => expect(attendanceApi.getDaily).toHaveBeenLastCalledWith({ date: "2026-10-31", search: "", page: 1, limit: 10 }, expect.any(AbortSignal)));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search daily check-ins" }), { target: { value: "Nimal" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(attendanceApi.getDaily).toHaveBeenLastCalledWith({ date: "2026-10-31", search: "Nimal", page: 1, limit: 10 }, expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole("button", { name: "Next attendance page" }));
    await waitFor(() => expect(attendanceApi.getDaily).toHaveBeenLastCalledWith({ date: "2026-10-31", search: "Nimal", page: 2, limit: 10 }, expect.any(AbortSignal)));
    const count = vi.mocked(attendanceApi.getDaily).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Refresh attendance" })); await waitFor(() => expect(attendanceApi.getDaily).toHaveBeenCalledTimes(count + 1));
    expect(attendanceApi.checkIn).not.toHaveBeenCalled();
  });
  it("does not show member profile links or Front Desk to history-only staff", async () => {
    renderWithAuth(<AttendancePage />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["attendance.read"] } }), "/attendance");
    await screen.findByText(deskMember.fullName);
    expect(screen.queryByRole("link", { name: deskMember.fullName })).not.toBeInTheDocument(); expect(screen.queryByRole("link", { name: "Front Desk" })).not.toBeInTheDocument();
  });
});
