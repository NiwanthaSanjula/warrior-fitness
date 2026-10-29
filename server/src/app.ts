
import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { notFound } from "./middlewares/notFound.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import cookieParser from "cookie-parser";
import { authRouter } from "./modules/auth/auth.routes.js";
import { staffRouter } from "./modules/staff/staff.routes.js";
import { memberRouter } from "./modules/members/member.routes.js";
import { planRouter } from "./modules/membership-plans/plan.routes.js";
import { membershipRouter } from "./modules/memberships/membership.routes.js";
import { invoiceRouter } from "./modules/billing/invoice.routes.js";

const app = express();

// Basic security
app.disable("x-powered-by");
app.use(helmet());

// CORS
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

// Public health endpoint
app.use("/api/health", healthRouter);

// Authentication endpoints
app.use("/api/auth", authRouter);

// Protected admin staff management
app.use("/api/staff", staffRouter);

app.use("/api/members", memberRouter);
app.use("/api/plans", planRouter);
app.use("/api/memberships", membershipRouter);
app.use("/api/invoices", invoiceRouter);

// Error handling (must come after routes)
app.use(notFound);
app.use(errorHandler);

export { app };
