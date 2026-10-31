import { Types } from "mongoose";
import { vi } from "vitest";
import { Staff, type IStaff, type StaffRole } from "../../src/modules/auth/staff.model.js";
import { AUTH_COOKIE_NAME, createAuthToken } from "../../src/modules/auth/token.js";

export function staffFixture(role: StaffRole = "ADMIN", overrides: Partial<IStaff> = {}) {
  return new Staff({
    _id: new Types.ObjectId(role === "ADMIN" ? "000000000000000000000001" : "000000000000000000000002"),
    fullName: role === "ADMIN" ? "Example Admin" : "Example Receptionist",
    email: role === "ADMIN" ? "admin@example.test" : "reception@example.test",
    passwordHash: "fictional-password-hash-not-a-real-credential",
    role,
    isActive: true,
    ...overrides,
  });
}

export function mockLoginLookup(staff: ReturnType<typeof staffFixture> | null) {
  const select = vi.fn().mockResolvedValue(staff);
  const lookup = vi.spyOn(Staff, "findOne").mockReturnValue(
    { select } as unknown as ReturnType<typeof Staff.findOne>
  );
  return { lookup, select };
}

export function sessionCookie(staffId: string, sessionVersion = 0): string {
  return `${AUTH_COOKIE_NAME}=${createAuthToken(staffId, sessionVersion)}`;
}
