import { createHash } from "node:crypto";
import mongoose, { Schema } from "mongoose";

// A viewer's logout revokes only that visitor, never the shared identity's
// sessionVersion. Store a digest, not a usable JWT/session credential.
const demoSessionSchema = new Schema({
  _id: { type: String, required: true },
  staff: { type: Schema.Types.ObjectId, required: true, ref: "Staff" },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { versionKey: false, collection: "public_demo_sessions", autoCreate: false, autoIndex: false });

export const DemoSession = mongoose.model("PublicDemoSession", demoSessionSchema);
export const demoSessionDigest = (id: string) => createHash("sha256").update(id).digest("hex");
