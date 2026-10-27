
import type { StaffRole } from "../modules/auth/staff.model.js";

declare global {
  namespace Express {
    interface Request {
      staff?: {
        id: string;
        fullName: string;
        email: string;
        role: StaffRole;
      };
    }
  }
}

export {};
