import type { Express } from "express";
import cors from "cors";

export function configureHttp(app: Express, config: { NODE_ENV: string; CLIENT_URL: string }) {
  // Render terminates HTTPS at its reverse proxy. Do not trust arbitrary hops.
  app.set("trust proxy", config.NODE_ENV === "production" ? 1 : false);
  app.use(cors({
    origin: (origin, callback) => callback(null, origin === config.CLIENT_URL ? origin : false),
    credentials: true,
  }));
  if (config.NODE_ENV === "production") {
    // SameSite=None permits cross-site cookies, so CORS alone is insufficient:
    // even a simple HTML form must be rejected before a mutation can execute.
    app.use((req, res, next) => {
      if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
      if (req.get("Origin") !== config.CLIENT_URL) {
        res.status(403).json({ success: false, message: "Request origin is not permitted." });
        return;
      }
      next();
    });
  }
}
