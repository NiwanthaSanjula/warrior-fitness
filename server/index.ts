/// <reference path="./src/types/express.d.ts" />
import express from "express";
import { app } from "./src/app.js";
import { initializeApplication } from "./src/config/initialize.js";

// Native Vercel Express entry point. Never import the local port listener or
// background scheduler here. All routes remain on the existing application.
const vercelApp = express();
vercelApp.disable("x-powered-by");
vercelApp.use(async (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    await initializeApplication();
  } catch {
    console.error("API initialization failed. Check the private database configuration and access.");
    res.status(503).json({ success: false, message: "Service temporarily unavailable. Please try again." });
    return;
  }
  next();
});
vercelApp.use(app);

export default vercelApp;
