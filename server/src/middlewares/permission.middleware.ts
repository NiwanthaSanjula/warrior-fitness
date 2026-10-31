import type { RequestHandler } from "express";
import { PERMISSIONS, type Permission } from "../modules/auth/permissions.js";

export function requirePermission(...permissions: [Permission, ...Permission[]]): RequestHandler {
  return (req, res, next) => {
    if (!req.staff) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }
    if (!permissions.every((permission) => PERMISSIONS.includes(permission) && req.staff!.permissions.includes(permission))) {
      res.status(403).json({ success: false, message: "You do not have permission" });
      return;
    }
    next();
  };
}
