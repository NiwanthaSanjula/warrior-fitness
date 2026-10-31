import type { Schema } from "mongoose";
import { AppError } from "../../utils/AppError.js";

export function rejectFinancialMutation(): never {
  throw new AppError(409, "Recorded financial history cannot be modified or deleted");
}

export function appendOnly(schema: Schema): void {
  schema.pre("save", function () {
    if (!this.isNew) rejectFinancialMutation();
  });
  schema.pre([
    "updateOne", "updateMany", "replaceOne", "findOneAndUpdate", "findOneAndReplace",
    "deleteOne", "deleteMany", "findOneAndDelete",
  ], rejectFinancialMutation);
  schema.pre("deleteOne", { document: true, query: false }, rejectFinancialMutation);
  schema.pre("bulkWrite", rejectFinancialMutation);
}
