import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";

export const PUBLIC_DEMO_DATABASE = "warrior_fitness_demo";
export const DEMO_VIEWER_ID = "70de00000000000000000001";
export const DEMO_VIEWER_EMAIL = "public-demo-viewer@warrior-fitness.invalid";

export function publicDemoAvailable(): boolean {
  return env.DEMO_PUBLIC_LOGIN_ENABLED === true && mongoose.connection.readyState === 1 &&
    mongoose.connection.db?.databaseName === PUBLIC_DEMO_DATABASE;
}

export function assertPublicDemoDatabase(): void {
  if (!publicDemoAvailable()) throw new AppError(503, "Public demo access is unavailable.");
}

// Explicitly audited reads. Unknown GET endpoints fail closed too: a future
// handler must be reviewed for side effects before public viewers may use it.
const objectId = "[a-fA-F0-9]{24}";
export const DEMO_READ_PATHS = [
  /^\/api\/auth\/me\/?$/,
  new RegExp(`^/api/(members|plans)(/${objectId})?/?$`),
  new RegExp(`^/api/memberships/member/${objectId}(/summary)?/?$`),
  new RegExp(`^/api/invoices(/overview|/member/${objectId}|/${objectId})?/?$`),
  new RegExp(`^/api/payments/invoice/${objectId}/?$`),
  new RegExp(`^/api/attendance(/summary|/member-search|/member/${objectId})?/?$`),
  new RegExp(`^/api/attention/(expiring|outstanding|inactive-attendance|follow-ups/due|follow-ups/member/${objectId})/?$`),
  /^\/api\/reports\/(revenue\/(collections|invoices|receivables)|memberships\/(activity|active)|attendance\/trends)\/?$/,
  /^\/api\/expenses\/?$/,
  /^\/api\/cash-closings(\/day\/\d{4}-\d{2}-\d{2})?\/?$/,
  new RegExp(`^/api/equipment(/maintenance|/alerts|/work-orders|/incidents|/${objectId}(/history)?)?/?$`),
  new RegExp(`^/api/retail/(dashboard|products(/${objectId}(/movements)?)?|sales(/${objectId})?)/?$`),
  new RegExp(`^/api/notifications/(overview|automation-status|consent/${objectId})/?$`),
  new RegExp(`^/api/staff(/permissions|/audit|/${objectId})?/?$`),
];

export function demoReadPermitted(method: string, path: string): boolean {
  return ["GET", "HEAD"].includes(method) && DEMO_READ_PATHS.some(pattern => pattern.test(path));
}
