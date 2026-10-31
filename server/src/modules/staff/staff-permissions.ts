import { RECEPTIONIST_PERMISSIONS } from "../auth/permissions.js";

// Group the server-owned assignable catalogue; Admin-only keys are never sent
// as assignable options. The values retain their exact S8-03 meaning.
const labels: Record<(typeof RECEPTIONIST_PERMISSIONS)[number], string> = {
  "members.read": "View members", "members.create": "Register members", "members.update": "Edit member profiles",
  "plans.read": "View membership plans",
  "memberships.read": "View memberships", "memberships.enroll": "Enroll members", "memberships.renew": "Renew memberships",
  "invoices.read": "View invoices and billing", "invoices.create": "Create invoices",
  "payments.read": "View payments and receipts", "payments.record": "Record payments",
  "attendance.read": "View attendance", "attendance.check-in": "Check in members",
  "attention.read": "View Attention Center", "follow-ups.read": "View follow-up history and due queue", "follow-ups.create": "Record follow-ups",
};
const groups = [
  ["members", "Members"], ["plans", "Membership plans"], ["memberships", "Memberships"],
  ["invoices", "Invoices"], ["payments", "Payments"], ["attendance", "Attendance"],
  ["attention", "Attention Center"], ["follow-ups", "Follow-ups"],
] as const;
export function staffPermissionCatalogue() {
  return {
    defaultPermissions: [...RECEPTIONIST_PERMISSIONS],
    groups: groups.map(([module, label]) => ({
      module, label,
      permissions: RECEPTIONIST_PERMISSIONS.filter((key) => key.split(".")[0] === module).map((key) => ({ key, label: labels[key] })),
    })),
  };
}
