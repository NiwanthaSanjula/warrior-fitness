
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { connectDatabase } from "../config/db.js";
import { Staff } from "../modules/auth/staff.model.js";

async function seedAdmin(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  const credentialsSchema = z.object({
    email: z.email().trim().toLowerCase(),
    password: z.string()
      .min(12)

      .refine(
        (value) =>
          Buffer.byteLength(value, "utf8") <= 72,
        "Password is too long"
      ),
  });

  const credentials = credentialsSchema.parse({
    email,
    password,
  });

  try {
    await connectDatabase();

    const existingAdmin = await Staff.exists({
      role: "ADMIN",
    });

    if (existingAdmin) {
      console.log(
        "An admin already exists. No new admin created."
      );
      return;
    }

    const existingEmail = await Staff.exists({
      email: credentials.email,
    });

    if (existingEmail) {
      throw new Error(
        "This email is already used by another staff account."
      );
    }

    const passwordHash = await bcrypt.hash(
      credentials.password,
      12
    );

    await Staff.create({
      fullName: "Gym Administrator",
      email: credentials.email,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    });

    console.log("Initial admin created successfully.");
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin().catch((error: unknown) => {
  console.error("Admin setup failed:", error);
  process.exitCode = 1;
});
