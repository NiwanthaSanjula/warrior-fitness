import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Member } from "../src/modules/members/member.model.js";
import { Membership } from "../src/modules/memberships/membership.model.js";
import { NotificationConsent, ReminderLog, initializeNotificationModels } from "../src/modules/notifications/notification.model.js";
import { NotificationRun } from "../src/modules/notifications/notification-run.model.js";
import { runScheduledSimulation } from "../src/modules/notifications/notification.scheduler.js";
import { duePeriod, findDueReminders, getConsent, getNotificationOverview, publicReminder, saveConsent, simulateDueReminders, type ReminderPeriod } from "../src/modules/notifications/notification.service.js";

const actor = "000000000000000000000001", memberId = "000000000000000000000010";
const period = (startDate = "2025-12-01", endDateExclusive = "2026-01-23", id = "000000000000000000000020"): ReminderPeriod => ({ _id: new Types.ObjectId(id), member: new Types.ObjectId(memberId), planSnapshot: { name: "Example monthly plan" }, startDate, endDateExclusive });
const member = { _id: new Types.ObjectId(memberId), memberId: "WF-EXAMPLE-001", fullName: "Example Member", phone: "+94770000000", isActive: true };
const query = (data: () => unknown) => ({ select: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockImplementation(async () => data()) });
let periods: ReminderPeriod[], members: (typeof member)[], consents: { member: Types.ObjectId }[];
beforeEach(() => {
  periods = [period()]; members = [structuredClone(member)]; members[0]._id = new Types.ObjectId(memberId);
  consents = [{ member: new Types.ObjectId(memberId) }];
  vi.spyOn(Membership, "find").mockReturnValue(query(() => periods) as never);
  vi.spyOn(Member, "find").mockReturnValue(query(() => members) as never);
  vi.spyOn(NotificationConsent, "find").mockReturnValue(query(() => consents) as never);
  vi.spyOn(Member, "findById").mockReturnValue({ select: vi.fn().mockResolvedValue(member) } as never);
  vi.spyOn(NotificationConsent, "findOne").mockResolvedValue(null);
  vi.spyOn(Member, "exists").mockResolvedValue({ _id: member._id });
  vi.spyOn(NotificationConsent, "exists").mockResolvedValue({ _id: member._id });
  vi.spyOn(ReminderLog, "exists").mockResolvedValue(null);
  vi.spyOn(ReminderLog, "updateOne").mockResolvedValue({ upsertedCount: 1 } as never);
  vi.spyOn(NotificationConsent, "updateOne").mockResolvedValue({ acknowledged: true } as never);
  vi.spyOn(ReminderLog, "find").mockReturnValue(query(() => []) as never);
  vi.spyOn(ReminderLog, "countDocuments").mockResolvedValue(0);
  vi.spyOn(NotificationRun, "findOne").mockReturnValue(query(() => null) as never);
});

describe("expiry policy using real Colombo calendar helpers", () => {
  it.each([
    ["2026-01-23", "SEVEN_DAYS"], ["2026-01-19", "THREE_DAYS"], ["2026-01-16", "LAST_VALID_DAY"],
    ["2026-01-15", null], ["2026-01-17", null], ["2026-01-22", null], ["2026-01-24", null],
  ])("exclusive end %s has the correct milestone %s", (end, type) => {
    expect(duePeriod([period("2025-12-01", end)], "2026-01-15")?.reminderType ?? null).toBe(type);
  });
  it("uses inclusive starts and excludes future-only memberships", () => {
    expect(duePeriod([period("2026-01-15", "2026-01-16")], "2026-01-15")?.reminderType).toBe("LAST_VALID_DAY");
    expect(duePeriod([period("2026-01-16", "2026-01-19")], "2026-01-15")).toBeNull();
    expect(duePeriod([], "2026-01-15")).toBeNull();
  });
  it("suppresses old expiry after a longer future renewal is purchased", () => {
    const old = period("2025-12-01", "2026-01-16");
    const renewal = period("2026-01-16", "2026-02-16", "000000000000000000000021");
    expect(duePeriod([renewal, old], "2026-01-15")).toBeNull();
    expect(duePeriod([old, renewal], "2026-01-15")).toBeNull();
  });
  it("includes a future renewal milestone when another purchased period covers today", () => {
    const renewal = period("2026-01-16", "2026-01-19", "000000000000000000000021");
    const due = duePeriod([period("2025-12-01", "2026-01-16"), renewal], "2026-01-15");
    expect(due).toMatchObject({ period: renewal, lastValidDate: "2026-01-18", reminderType: "THREE_DAYS" });
  });
  it.each([
    ["2026-01-31", "2026-02-08", "SEVEN_DAYS"], ["2028-02-26", "2028-03-01", "THREE_DAYS"], ["2026-12-31", "2027-01-01", "LAST_VALID_DAY"],
  ])("preserves month, leap-day and year boundaries for %s", (today, end, expected) => {
    expect(duePeriod([period("2025-01-01", end)], today)?.reminderType).toBe(expected);
  });
  it("uses the Colombo day across UTC midnight differences", async () => {
    vi.setSystemTime(new Date("2026-01-14T18:29:59Z"));
    expect(await findDueReminders()).toEqual([]);
    vi.setSystemTime(new Date("2026-01-14T18:30:00Z"));
    expect((await findDueReminders())[0]).toMatchObject({ scheduledDate: "2026-01-15", lastValidDate: "2026-01-22" });
  });
});

describe("consent and eligible member selection", () => {
  it("requires affirmative stored consent and an active member", async () => {
    consents = [];
    expect(await findDueReminders()).toEqual([]);
    expect(NotificationConsent.find).toHaveBeenCalledWith({ member: { $in: [periods[0].member] }, whatsappOptIn: true });
    consents = [{ member: new Types.ObjectId(memberId) }]; members[0].isActive = false;
    expect(await findDueReminders()).toEqual([]);
  });
  it.each(["", "   "])("skips missing/blank phone %j", async phone => {
    members[0].phone = phone; expect(await findDueReminders()).toEqual([]);
  });
  it("does not load member records when no membership is at a milestone", async () => {
    periods = []; expect(await findDueReminders()).toEqual([]);
    expect(Member.find).not.toHaveBeenCalled(); expect(NotificationConsent.find).not.toHaveBeenCalled();
  });
  it("returns exact message, dates and identifiers from actual fixture records", async () => {
    expect(await findDueReminders()).toEqual([expect.objectContaining({ memberId, membershipId: String(period()._id), memberReference: member.memberId,
      memberName: member.fullName, recipient: member.phone, lastValidDate: "2026-01-22", reminderType: "SEVEN_DAYS",
      message: "Hi Example Member! Your Warrior Fitness Example monthly plan membership is valid through 2026-01-22. Please contact our reception to renew. Thank you for training with us!" })]);
  });
  it("defaults absent consent to off and reports missing members safely", async () => {
    expect(await getConsent(memberId)).toMatchObject({ memberId, whatsappOptIn: false, updatedAt: null });
    vi.mocked(Member.findById).mockReturnValue({ select: vi.fn().mockResolvedValue(null) } as never);
    await expect(getConsent(memberId)).rejects.toHaveProperty("statusCode", 404);
  });
  it.each([true, false])("records preference %s with authenticated actor and validators", async next => {
    await saveConsent(memberId, next, actor);
    expect(NotificationConsent.updateOne).toHaveBeenCalledWith({ member: memberId }, { $set: { whatsappOptIn: next, updatedBy: actor } }, { upsert: true, runValidators: true });
  });
  it("never creates consent for a missing member or reports a failed save as success", async () => {
    vi.mocked(Member.exists).mockResolvedValueOnce(null);
    await expect(saveConsent(memberId, true, actor)).rejects.toHaveProperty("statusCode", 404);
    expect(NotificationConsent.updateOne).not.toHaveBeenCalled();
    vi.mocked(NotificationConsent.updateOne).mockRejectedValueOnce(new Error("Fictional storage failure"));
    await expect(saveConsent(memberId, false, actor)).rejects.toThrow("storage failure");
  });
});

describe("simulation-only idempotent logging with mocked persistence", () => {
  it.each(["MANUAL", "SCHEDULED"] as const)("validates actor attribution for %s documents and upsert queries without a database", async trigger => {
    const record = new ReminderLog({ member: memberId, membership: period()._id, memberReference: member.memberId, memberName: member.fullName, recipient: member.phone, planName: "Example", lastValidDate: "2026-01-22", scheduledDate: "2026-01-15", reminderType: "SEVEN_DAYS", message: "Fictional preview", createdBy: null, trigger, status: "SIMULATED", channel: "WHATSAPP_SIMULATED" });
    const updateQuery = ReminderLog.where({});
    updateQuery.setUpdate({ $setOnInsert: record.toObject() });
    // Invoke actual Mongoose validation only; Query.exec remains blocked by the
    // existing isolation guard. This exercises the real query-context required rule.
    const actorPath = ReminderLog.schema.path("createdBy") as unknown as { doValidate(value: unknown, context: unknown, options: unknown): Promise<void> };
    if (trigger === "SCHEDULED") {
      await expect(record.validate()).resolves.toBeUndefined();
      await expect(actorPath.doValidate(null, updateQuery, { updateValidator: true })).resolves.toBeUndefined();
    } else {
      await expect(record.validate()).rejects.toThrow();
      await expect(actorPath.doValidate(null, updateQuery, { updateValidator: true })).rejects.toThrow();
    }
  });
  it.each(["eligible", "renewed", "missing consent"])("runs scheduled %s membership checks through the real engine", async scenario => {
    vi.spyOn(NotificationRun.prototype, "save").mockResolvedValue(undefined as never);
    vi.spyOn(NotificationRun, "updateOne").mockResolvedValue({ acknowledged: true } as never);
    if (scenario === "renewed") periods.push(period("2026-01-23", "2026-02-23", "000000000000000000000021"));
    if (scenario === "missing consent") consents = [];
    expect(await runScheduledSimulation("2026-01-15")).toMatchObject({ status: "SUCCEEDED" });
    if (scenario === "eligible") expect(ReminderLog.updateOne).toHaveBeenCalledWith(expect.anything(), { $setOnInsert: expect.objectContaining({ trigger: "SCHEDULED", createdBy: null, status: "SIMULATED", scheduledDate: "2026-01-15" }) }, expect.anything());
    else expect(ReminderLog.updateOne).not.toHaveBeenCalled();
  });
  it("stores only SIMULATED and never calls an external delivery client", async () => {
    expect(await simulateDueReminders(actor)).toEqual({ due: 1, simulated: 1, duplicates: 0, skipped: 0, realMessagesSent: 0, deliveryMode: "SIMULATION_ONLY" });
    expect(ReminderLog.updateOne).toHaveBeenCalledWith({ membership: String(period()._id), reminderType: "SEVEN_DAYS", scheduledDate: "2026-01-15" },
      { $setOnInsert: expect.objectContaining({ member: memberId, createdBy: actor, channel: "WHATSAPP_SIMULATED", status: "SIMULATED" }) }, { upsert: true, runValidators: true });
    expect(fetch).not.toHaveBeenCalled(); // Global socket/network isolation is also enforced.
  });
  it("repeated requests count existing entries instead of overwriting history", async () => {
    vi.mocked(ReminderLog.updateOne).mockResolvedValueOnce({ upsertedCount: 1 } as never).mockResolvedValueOnce({ upsertedCount: 0 } as never);
    expect((await simulateDueReminders(actor)).simulated).toBe(1);
    expect(await simulateDueReminders(actor)).toMatchObject({ simulated: 0, duplicates: 1 });
    for (const [, update] of vi.mocked(ReminderLog.updateOne).mock.calls) expect(Object.keys(update!)).toEqual(["$setOnInsert"]);
  });
  it("handles a racing duplicate-key error only when that reminder exists", async () => {
    vi.mocked(ReminderLog.updateOne).mockRejectedValueOnce({ code: 11000 });
    vi.mocked(ReminderLog.exists).mockResolvedValueOnce({ _id: member._id });
    expect(await simulateDueReminders(actor)).toMatchObject({ duplicates: 1, simulated: 0 });
    expect(ReminderLog.exists).toHaveBeenCalledWith({ membership: String(period()._id), reminderType: "SEVEN_DAYS", scheduledDate: "2026-01-15" });
  });
  it.each([{ code: 11000 }, new Error("Fictional write failure")])("propagates unconfirmed or unrelated storage errors", async failure => {
    vi.mocked(ReminderLog.updateOne).mockRejectedValueOnce(failure);
    await expect(simulateDueReminders(actor)).rejects.toBe(failure);
  });
  it.each(["consent", "status"])("rechecks %s before recording after discovery", async what => {
    vi.mocked(what === "consent" ? NotificationConsent.exists : Member.exists).mockResolvedValueOnce(null);
    expect(await simulateDueReminders(actor)).toMatchObject({ skipped: 1, simulated: 0 });
    expect(ReminderLog.updateOne).not.toHaveBeenCalled();
  });
  it("recomputes a stale browser preview after renewal without recording an old reminder", async () => {
    expect(await findDueReminders()).toHaveLength(1);
    periods.push(period("2026-01-23", "2026-02-23", "000000000000000000000021"));
    expect(await simulateDueReminders(actor)).toMatchObject({ due: 0, simulated: 0 });
    expect(ReminderLog.updateOne).not.toHaveBeenCalled();
  });
  it("enforces a unique reminder index and rejects real-delivery model values", async () => {
    expect(ReminderLog.schema.indexes()).toContainEqual([{ membership: 1, reminderType: 1, scheduledDate: 1 }, { unique: true }]);
    const record = new ReminderLog({ member: memberId, membership: period()._id, memberReference: member.memberId, memberName: member.fullName, recipient: member.phone, planName: "Example", lastValidDate: "2026-01-22", scheduledDate: "2026-01-15", reminderType: "SEVEN_DAYS", message: "Fictional preview", createdBy: actor, status: "SENT", channel: "WHATSAPP" });
    await expect(record.validate()).rejects.toThrow();
  });
  it("initializes both unique-indexed models and propagates initialization failure", async () => {
    vi.spyOn(NotificationConsent, "init").mockResolvedValue(undefined as never);
    vi.spyOn(ReminderLog, "init").mockResolvedValue(undefined as never);
    vi.spyOn(NotificationRun, "init").mockResolvedValue(undefined as never);
    await initializeNotificationModels(); expect(NotificationConsent.init).toHaveBeenCalledOnce(); expect(ReminderLog.init).toHaveBeenCalledOnce();
    vi.mocked(ReminderLog.init).mockRejectedValueOnce(new Error("Fictional index failure"));
    await expect(initializeNotificationModels()).rejects.toThrow("index failure");
  });
  it("maps history to the declared API contract and bounds reads", async () => {
    const record = new ReminderLog({ member: memberId, membership: period()._id, memberReference: member.memberId, memberName: member.fullName, recipient: member.phone, planName: "Example", lastValidDate: "2026-01-22", scheduledDate: "2026-01-15", reminderType: "SEVEN_DAYS", message: "Fictional preview", createdBy: actor, status: "SIMULATED", channel: "WHATSAPP_SIMULATED", createdAt: new Date() }).toObject();
    const historyQuery = query(() => [record]); vi.mocked(ReminderLog.find).mockReturnValue(historyQuery as never);
    const overview = await getNotificationOverview();
    expect(overview).toMatchObject({ asOfDate: "2026-01-15", deliveryMode: "SIMULATION_ONLY", recent: [{ id: String(record._id), memberId, membershipId: String(period()._id), createdAt: new Date().toISOString() }] });
    expect(historyQuery.limit).toHaveBeenCalledWith(50);
    expect(publicReminder(record)).not.toHaveProperty("_id");
    expect(ReminderLog.countDocuments).toHaveBeenCalledWith({ scheduledDate: "2026-01-15", status: "SIMULATED", channel: "WHATSAPP_SIMULATED" });
  });
});
