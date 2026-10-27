
import { Router } from "express";
import mongoose from "mongoose";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const isDatabaseConnected =
    mongoose.connection.readyState === 1;

  res.status(isDatabaseConnected ? 200 : 503).json({
    status: isDatabaseConnected ? "ok" : "degraded",
    service: "warrior-fitness-api",
    database: isDatabaseConnected
      ? "connected"
      : "disconnected",
  });
});
