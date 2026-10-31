
import type { StaffRole } from "../modules/auth/staff.model.js";
import type { Permission } from "../modules/auth/permissions.js";

declare global {
  namespace Express {
    interface Request {
      staff?: {
        id: string;
        fullName: string;
        email: string;
        role: StaffRole;
        permissions: Permission[];
      };
    }
  }
}

export {};
