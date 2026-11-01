import { readFileSync, lstatSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

export const DEMO_DATABASE = "warrior_fitness_demo";
export const DEMO_NAMESPACE = "warrior-fitness-demo-v1";
export const DEMO_ENV_FILE = fileURLToPath(new URL("../../../.env.demo.local", import.meta.url));
export class DemoError extends Error {}
export type DemoMode = "dry-run" | "check" | "apply";
export function demoMode(args: string[]): DemoMode {
  if (args.length === 0) return "dry-run";
  if (args.length !== 1 || !["--dry-run", "--check", "--apply"].includes(args[0])) throw new DemoError("Use exactly one of --dry-run, --check or --apply. Default is offline dry-run.");
  return args[0].slice(2) as DemoMode;
}
export function verifyDemoUri(uri: string) {
  // Do not rely on a driver default database or a dbName override. This also
  // supports Atlas non-SRV replica-set URIs with comma-separated hosts.
  const match = /^mongodb(?:\+srv)?:\/\/[^/?#]+\/([^/?#]+)(?:\?[^#]*)?$/.exec(uri);
  if (!match || match[1] !== DEMO_DATABASE) throw new DemoError(`DEMO_MONGODB_URI must explicitly target /${DEMO_DATABASE}. No other database is permitted.`);
}
export function verifyConnectedDatabase(databaseName: string | undefined) {
  if (databaseName !== DEMO_DATABASE) throw new DemoError("Connected database identity could not be verified as warrior_fitness_demo. No writes permitted.");
}
export interface DemoConfig { uri: string; password: string; jwtSecret: string; port: number; clientUrl: string; publicLoginEnabled?: boolean }
export function parseDemoConfig(values: Record<string, string>, needsCredentials: boolean): DemoConfig {
  if (values.NODE_ENV === "production" || process.env.NODE_ENV === "production") throw new DemoError("Demo tools cannot run in production mode.");
  const uri = values.DEMO_MONGODB_URI?.trim();
  if (!uri) throw new DemoError("DEMO_MONGODB_URI is missing from server/.env.demo.local. Normal application MONGODB_URI is never used.");
  const allowed = new Set(["DEMO_MONGODB_URI", "DEMO_STAFF_PASSWORD", "JWT_SECRET", "PORT", "CLIENT_URL", "NODE_ENV", "DEMO_PUBLIC_LOGIN_ENABLED"]);
  if (Object.keys(values).some(key => !allowed.has(key))) throw new DemoError("Demo configuration contains an unsupported setting. Use only the documented demo keys; never copy the normal application .env into this file.");
  verifyDemoUri(uri);
  const password = values.DEMO_STAFF_PASSWORD ?? "", jwtSecret = values.JWT_SECRET ?? "";
  if (needsCredentials && (password.length < 12 || password.length > 128 || jwtSecret.length < 32)) throw new DemoError("Set DEMO_STAFF_PASSWORD (12–128 characters) and JWT_SECRET (at least 32 characters) in the ignored demo configuration. Do not share them.");
  const port = Number(values.PORT ?? 5000), clientUrl = values.CLIENT_URL ?? "http://localhost:5173";
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?$/.test(clientUrl)) throw new DemoError("Demo PORT must be valid and CLIENT_URL must be a local HTTP(S) origin.");
  if (values.DEMO_PUBLIC_LOGIN_ENABLED !== undefined && !["true", "false"].includes(values.DEMO_PUBLIC_LOGIN_ENABLED)) throw new DemoError("DEMO_PUBLIC_LOGIN_ENABLED must be true or false.");
  return { uri, password, jwtSecret, port, clientUrl, publicLoginEnabled: values.DEMO_PUBLIC_LOGIN_ENABLED === "true" };
}
export function loadDemoConfig(needsCredentials: boolean): DemoConfig {
  try {
    if (!lstatSync(DEMO_ENV_FILE).isFile()) throw new Error();
  } catch { throw new DemoError("Create the Git-ignored server/.env.demo.local as documented in docs/sprints/demo-data.md. No connection attempted."); }
  // Fail closed if Git cannot establish that the secret file is ignored AND
  // untracked. No credentials are passed to the Git process or its output.
  const cwd = fileURLToPath(new URL("../../../", import.meta.url));
  try {
    execFileSync("git", ["check-ignore", "--quiet", ".env.demo.local"], { cwd, stdio: "ignore" });
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", ".env.demo.local"], { cwd, stdio: "ignore" });
    if (tracked.status !== 1) throw new Error();
  } catch { throw new DemoError("Demo configuration must be Git-ignored and untracked; safety check failed."); }
  return parseDemoConfig(parse(readFileSync(DEMO_ENV_FILE)), needsCredentials);
}
export function installDemoEnvironment(config: DemoConfig) {
  // Must run before dynamic imports of application modules. dotenv/config can
  // only read this explicit demo file; inherited normal-app values are replaced.
  process.env.DOTENV_CONFIG_PATH = DEMO_ENV_FILE;
  process.env.DOTENV_CONFIG_QUIET = "true";
  process.env.DOTENV_CONFIG_OVERRIDE = "";
  process.env.DOTENV_KEY = "";
  process.env.NODE_ENV = "development";
  process.env.MONGODB_URI = config.uri;
  process.env.JWT_SECRET = config.jwtSecret;
  process.env.PORT = String(config.port);
  process.env.CLIENT_URL = config.clientUrl;
  process.env.NOTIFICATION_SCHEDULER_ENABLED = "false";
  process.env.DEMO_PUBLIC_LOGIN_ENABLED = String(config.publicLoginEnabled ?? false);
}
export function safeDemoFailure(error: unknown): string {
  if (error instanceof DemoError) return error.message;
  // Never return driver messages/stacks, which can contain a URI or credentials.
  const name = error instanceof Error ? error.name : "";
  if (/Mongo|ServerSelection|Network|Timeout/i.test(name)) return "Database/network operation failed. No Atlas troubleshooting attempted. Check the dedicated demo configuration locally; credentials were not printed.";
  return "Demo operation failed. Seeding stopped; completed operations are retained and can be resumed safely. No raw error or credentials printed.";
}
