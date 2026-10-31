
import { app } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { initializeFinancialModels } from "./modules/financial/financial.service.js";

async function startServer(): Promise<void> {
  try {
    await connectDatabase();
    await initializeFinancialModels();

    app.listen(env.PORT, "127.0.0.1", () => {
      console.log(
        `API running at http://localhost:${env.PORT}✅`
      );

      console.log(
        `Environment: ${env.NODE_ENV}`
      );
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

void startServer();
