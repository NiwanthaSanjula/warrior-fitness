import { describe, expect, it } from "vitest";
import { ADMIN_ONLY_PERMISSIONS, PERMISSIONS, RECEPTIONIST_PERMISSIONS, effectivePermissions } from "../src/modules/auth/permissions.js";
import { Staff } from "../src/modules/auth/staff.model.js";
import { staffFixture } from "./helpers/staff.js";

describe("central permission policy and schema compatibility", () => {
  it("gives Admin every known permission even with an explicit empty override", () => {
    expect(effectivePermissions(staffFixture("ADMIN", { permissions: [] }))).toEqual([...PERMISSIONS]);
  });

  it("preserves every existing Receptionist operation when permissions are absent", () => {
    const legacy = Staff.hydrate({ _id: "000000000000000000000002", role: "RECEPTIONIST", isActive: true });
    expect(legacy.permissions).toBeUndefined();
    expect(legacy.sessionVersion).toBe(0);
    expect(effectivePermissions(legacy)).toEqual([...RECEPTIONIST_PERMISSIONS]);
  });

  it("treats an explicit empty override as no business permissions", () => {
    expect(effectivePermissions(staffFixture("RECEPTIONIST", { permissions: [] }))).toEqual([]);
  });

  it("applies only explicitly granted custom operations", () => {
    expect(effectivePermissions(staffFixture("RECEPTIONIST", { permissions: ["members.read"] }))).toEqual(["members.read"]);
  });

  it("never grants Admin-only or unknown operations to a Receptionist", () => {
    expect(effectivePermissions({ role: "RECEPTIONIST", permissions: [...ADMIN_ONLY_PERMISSIONS, "unknown.permission"] })).toEqual([]);
  });

  it("rejects unknown stored permission values without database access", async () => {
    const staff = staffFixture();
    staff.set("permissions", ["unknown.permission"]);
    await expect(staff.validate()).rejects.toHaveProperty("name", "ValidationError");
  });
});
