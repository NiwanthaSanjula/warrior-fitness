
import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  getRevenueCollections,
} from "./reports.controller.js";

export const reportsRouter = Router();

// Financial reporting is initially ADMIN-only.
reportsRouter.use(
  requireAuth,
  requireRole("ADMIN")
);

reportsRouter.get(
  "/revenue/collections",
  getRevenueCollections
);
