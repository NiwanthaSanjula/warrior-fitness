import mongoose from "mongoose";
import { DEMO_DATABASE, DEMO_NAMESPACE, DemoError, verifyConnectedDatabase, verifyDemoUri, type DemoConfig } from "./demo.config.js";

export interface StoredDemoState { _id: string; anchoredAt: string; planHash: string; complete: boolean; leaseToken?: string | null; leaseUntil?: Date }
export async function connectDemo(config: DemoConfig) {
  verifyDemoUri(config.uri);
  if (process.env.NODE_ENV === "production") throw new DemoError("Demo database access is forbidden in production mode.");
  mongoose.set("autoCreate", false); mongoose.set("autoIndex", false); mongoose.set("bufferCommands", false);
  await mongoose.connect(config.uri, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, readPreference: "primary" });
  verifyConnectedDatabase(mongoose.connection.db?.databaseName);
  console.log(`Verified connected database: ${DEMO_DATABASE}. No write has run.`);
}
export function demoDatabase() {
  verifyConnectedDatabase(mongoose.connection.db?.databaseName);
  return mongoose.connection.db!;
}
export async function storedDemoState() {
  return demoDatabase().collection<StoredDemoState>("demo_seed_state").findOne({ _id: DEMO_NAMESPACE });
}
export async function preflightDemoWrites() {
  const db = demoDatabase();
  const hello = await db.command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid") throw new DemoError("The demo database needs Atlas or a transaction-capable replica set. No writes attempted; standalone MongoDB is unsupported.");
  if (!(await storedDemoState())) {
    // A database with this name is not automatically disposable. First use must
    // be empty. Inspect existence only, never read/print unrelated record bodies.
    for await (const collection of db.listCollections({}, { nameOnly: true })) {
      if (!collection.name.startsWith("system.") && await db.collection(collection.name).findOne({}, { projection: { _id: 1 } })) throw new DemoError("The demo database contains records without this seeder's ownership manifest. No writes permitted; do not erase them.");
    }
  }
}
