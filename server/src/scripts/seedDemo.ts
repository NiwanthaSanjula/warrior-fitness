import mongoose from "mongoose";
import { demoMode, DEMO_DATABASE, DemoError, loadDemoConfig, installDemoEnvironment, safeDemoFailure } from "./demo/demo.config.js";
import { buildDemoPlan, type Counts } from "./demo/demo.plan.js";
import { emptyReport, reportRows, runDemoSeed, type SeedReport } from "./demo/demo.runner.js";

function summary(report: SeedReport) {
  console.table(reportRows(report));
  const sum = (counts: Counts) => Object.values(counts).reduce((total, count) => total + count, 0);
  console.log(`Created: ${sum(report.created)}; skipped: ${sum(report.skipped)}; failed: ${sum(report.failed)}. Financial-day rows are maintained by existing ledger services.`);
}
async function main() {
  const mode = demoMode(process.argv.slice(2));
  if (mode === "dry-run") {
    const plan = buildDemoPlan();
    console.log(`OFFLINE DRY RUN — target ${DEMO_DATABASE}; ${plan.from} through ${plan.asOf} (Asia/Colombo).`);
    console.log("No configuration loaded, no database connection, no writes. Counts are a proposed NEW dataset, not an inspection of existing records.");
    summary(emptyReport(plan));
    console.log("Configure ignored server/.env.demo.local, use --check for a read-only identity check, then --apply for writes. Today and yesterday remain open."); return;
  }
  const config = loadDemoConfig(mode === "apply");
  const { connectDemo, storedDemoState, preflightDemoWrites } = await import("./demo/demo.connection.js");
  try {
    await connectDemo(config);
    await preflightDemoWrites(); // read-only, including ownership/transaction topology
    const existing = await storedDemoState();
    if (mode === "check") {
      console.log(`Read-only safety checks passed for ${DEMO_DATABASE}. ${existing ? `Existing demo anchor: ${existing.anchoredAt}; completed: ${existing.complete}.` : "Database is empty and ready for a new isolated demo dataset."} No write or index creation performed.`); return;
    }
    installDemoEnvironment(config);
    const { MongoDemoStore } = await import("./demo/demo.store.js");
    let last = 0;
    const result = await runDemoSeed(new MongoDemoStore(config.password), new Date(), report => {
      if (Object.keys(report.failed).length) summary(report);
      else if (Date.now() - last >= 10000) { console.log(`Demo progress: ${Object.values(report.created).reduce((a, b) => a + b, 0)} created, ${Object.values(report.skipped).reduce((a, b) => a + b, 0)} skipped.`); last = Date.now(); }
    });
    summary(result);
    console.log(`Demo snapshot: ${result.plan.from} through ${result.plan.asOf}. ${result.verified ? "Persisted ledger, invoice and stock checks passed." : "Previously completed snapshot preserved; no application writes or password resets performed."}`);
    if (result.plan.asOf !== buildDemoPlan().asOf) console.log("This repeat run retained its original date anchor. It did not shift historical records to today. See docs/sprints/demo-data.md.");
    console.log("Start the API with npm run dev:demo and the existing frontend with npm run dev. Demo login emails are documented; passwords are never printed.");
  } finally { await mongoose.disconnect(); }
}
void main().catch(error => { console.error(safeDemoFailure(error instanceof Error ? error : new DemoError("Demo task failed safely."))); process.exitCode = 1; });
