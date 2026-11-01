import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Staff } from "./staff.model.js";
import { DemoSession, demoSessionDigest } from "./demo-session.model.js";
import { assertPublicDemoDatabase, DEMO_VIEWER_EMAIL, DEMO_VIEWER_ID } from "./demo-access.js";
import { getAuthCookieMaxAge } from "./token.js";
import { AppError } from "../../utils/AppError.js";

export async function provisionDemoViewer() {
  assertPublicDemoDatabase();
  let viewer = await Staff.findOne({ email: DEMO_VIEWER_EMAIL });
  if (!viewer) {
    // No known/shared password exists. Password login also rejects this identity.
    const passwordHash = await bcrypt.hash(randomBytes(48).toString("hex"), 12);
    assertPublicDemoDatabase();
    try {
      viewer = await Staff.findOneAndUpdate(
        { _id: DEMO_VIEWER_ID, email: DEMO_VIEWER_EMAIL, isDemoViewer: true },
        { $setOnInsert: { fullName: "Demo Visitor", passwordHash, role: "ADMIN", isActive: true, sessionVersion: 0, createdAt: new Date(), updatedAt: new Date() } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, timestamps: false },
      );
    } catch (error) {
      // Concurrent first logins may race the unique email/_id indexes. Read the
      // exact reserved record; never replace a colliding staff account.
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) throw new AppError(503, "Public demo access is unavailable.");
      viewer = await Staff.findOne({ email: DEMO_VIEWER_EMAIL });
    }
  }
  if (!viewer || viewer.id !== DEMO_VIEWER_ID || viewer.isDemoViewer !== true || viewer.role !== "ADMIN" || !viewer.isActive) {
    throw new AppError(503, "Public demo identity is unavailable. No staff account was changed.");
  }
  await DemoSession.createIndexes();
  return viewer;
}

export async function startDemoSession() {
  try {
    const viewer = await provisionDemoViewer();
    const sessionId = randomBytes(32).toString("hex");
    assertPublicDemoDatabase();
    await DemoSession.create({ _id: demoSessionDigest(sessionId), staff: viewer._id, expiresAt: new Date(Date.now() + getAuthCookieMaxAge()) });
    return { viewer, sessionId };
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Storage/index failures must not expose connection or account details.
    throw new AppError(503, "Public demo access is unavailable. Please try again later.");
  }
}
