import mongoose from "mongoose";
import { DEMO_DATABASE, DemoError, installDemoEnvironment, loadDemoConfig, safeDemoFailure } from "./demo/demo.config.js";
import { connectDemo, storedDemoState } from "./demo/demo.connection.js";

async function main() {
  const config = loadDemoConfig(true);
  installDemoEnvironment(config);
  await connectDemo(config);
  const state = await storedDemoState();
  if (!state?.complete || state.leaseToken && state.leaseUntil && state.leaseUntil > new Date()) throw new DemoError("Complete the demo seed before starting the demo API. No server was started.");
  // Same application/router/security stack as normal startup, with an explicitly
  // verified database and scheduler disabled. Never import server.ts or .env.
  const { app } = await import("../app.js");
  const { initializeDemoModels } = await import("./demo/demo.store.js");
  await initializeDemoModels();
  const server = app.listen(config.port, "127.0.0.1", () => console.log(`Demo API listening on 127.0.0.1:${config.port}; database ${DEMO_DATABASE}; notification delivery SIMULATED, scheduler disabled.`));
  server.on("error", async () => { console.error("Demo API could not bind its local port. No credentials printed."); await mongoose.disconnect(); process.exitCode = 1; });
  const stop = () => { server.close(() => { void mongoose.disconnect(); }); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
void main().catch(async error => { console.error(safeDemoFailure(error)); await mongoose.disconnect(); process.exitCode = 1; });
