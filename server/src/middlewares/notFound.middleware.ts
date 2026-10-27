
import type { RequestHandler } from "express";

import { AppError } from "../utils/AppError.js";

export const notFound: RequestHandler = (
  _req,
  _res,
  next
) => {
  next(new AppError(404, "API endpoint not found"));
};
