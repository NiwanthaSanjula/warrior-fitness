
import type {
  ClientSession,
  HydratedDocument,
} from "mongoose";

import type {
  IMembership,
} from "../memberships/membership.model.js";

import {
  todayInColombo,
} from "../memberships/membership.dates.js";

import { Invoice } from "./invoice.model.js";

/**
 * Creates one invoice from a purchased membership.
 *
 * When a session is provided, invoice creation
 * participates in the caller's MongoDB transaction.
 *
 * The caller is responsible for handling duplicate
 * invoice errors.
 */
export async function createInvoiceForMembership(
  membership: HydratedDocument<IMembership>,
  staffId: string,
  session?: ClientSession
) {
  const invoiceNumber =
    `WF-INV-${membership._id.toString().toUpperCase()}`;

  const invoice = new Invoice({
    invoiceNumber,

    member: membership.member,
    membership: membership._id,

    // Never read today's catalogue price.
    // Use the terms agreed at purchase.
    planCode: membership.planSnapshot.code,
    planName: membership.planSnapshot.name,

    totalLkr: membership.planSnapshot.priceLkr,
    paidLkr: 0,

    dueDate: todayInColombo(),
    createdBy: staffId,
  });

  await invoice.save(
    session ? { session } : {}
  );

  return invoice;
}
