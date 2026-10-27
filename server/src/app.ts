
import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { notFound } from "./middlewares/notFound.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";

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

// API routes
app.use("/api/health", healthRouter);

// Error handling (must come after routes)
app.use(notFound);
app.use(errorHandler);

export { app };
