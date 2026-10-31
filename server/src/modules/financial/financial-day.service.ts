import mongoose, { type ClientSession } from "mongoose";
import { AppError } from "../../utils/AppError.js";
import { FinancialDay } from "./financial-day.model.js";

export async function lockOpenFinancialDay(date: string, session: ClientSession) {
  const day = await FinancialDay.findOneAndUpdate(
    { _id: date },
    { $inc: { revision: 1 }, $setOnInsert: { closed: false } },
    { upsert: true, new: true, session },
  );
  if (!day || day.closed) {
    throw new AppError(409, `Financial day ${date} is closed. No new payments or expenses may be recorded for it.`);
  }
  return day;
}

export function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export async function financialTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  // The driver retries transient write conflicts. A first-use day upsert or
  // concurrent idempotency insert can instead surface E11000: retry the whole
  // transaction, allowing its replay/date checks to observe the winning commit.
  for (let attempt = 0; ; attempt++) {
    try {
      return await mongoose.connection.transaction(work, {
        readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary",
      });
    } catch (error) {
      if (!isDuplicateKey(error) || attempt >= 2) throw error;
    }
  }
}
