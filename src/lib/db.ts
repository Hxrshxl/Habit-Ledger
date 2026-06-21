import { MongoClient, Db, ObjectId, Document } from "mongodb";
import crypto from "crypto";
import type { Habit, Entry, ContextDay, Goal, Milestone, Experiment, WeeklyReview } from "./core";

// ── Singleton (survives Next.js hot-reload in dev) ───────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __mongoClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var __dbInit: Promise<void> | undefined;
}

async function getDb(): Promise<Db> {
  if (!globalThis.__mongoClient) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI environment variable is not set");
    const client = new MongoClient(uri);
    globalThis.__mongoClient = client;
    globalThis.__dbInit = client.connect().then(() => initDb(client.db("habit_ledger")));
  }
  await globalThis.__dbInit;
  return globalThis.__mongoClient.db("habit_ledger");
}

async function initDb(db: Db): Promise<void> {
  await Promise.all([
    db.collection("entries").createIndex({ habit_id: 1, date: 1 }, { unique: true }),
    db.collection("entries").createIndex({ date: 1 }),
    db.collection("daily_context").createIndex({ date: 1 }, { unique: true }),
    db.collection("weekly_reviews").createIndex({ week_start: 1 }, { unique: true }),
    db.collection("expense_budgets").createIndex({ month: 1, category: 1 }, { unique: true }),
    db.collection("push_subscriptions").createIndex({ endpoint: 1 }, { unique: true }),
    db.collection("settings").createIndex({ key: 1 }, { unique: true }),
    db.collection("habits").createIndex({ position: 1, archived: 1 }),
    db.collection("milestones").createIndex({ goal_id: 1, order_index: 1 }),
    db.collection("jobs").createIndex({ status: 1 }),
    db.collection("jobs").createIndex({ created_at: -1 }),
    db.collection("daily_mits").createIndex({ date: 1 }, { unique: true }),
    db.collection("reminders").createIndex({ enabled: 1, time: 1 }),
  ]);
  const seeded = await db.collection("settings").findOne({ key: "seeded" });
  if (!seeded) {
    const count = await db.collection("habits").countDocuments();
    if (count === 0) await seedHabits(db);
    await db.collection("settings").updateOne(
      { key: "seeded" },
      { $set: { key: "seeded", value: "1" } },
      { upsert: true }
    );
  }
}

async function seedHabits(db: Db): Promise<void> {
  const defaults = [
    { name: "Wake Up Early", goal: 30, category: "Routine" },
    { name: "DSA - Revision", goal: 30, category: "Learning" },
    { name: "DSA - 1", goal: 30, category: "Learning" },
    { name: "DSA - 2", goal: 20, category: "Learning" },
    { name: "DSA - 3", goal: 30, category: "Learning" },
    { name: "System Design - Revision", goal: 30, category: "Learning" },
    { name: "System Design - New", goal: 30, category: "Learning" },
    { name: "Drink 3L Water", goal: 25, category: "Health" },
    { name: "Track Expenses 💵", goal: 30, category: "Finance" },
    { name: "Skincare Routine ✨", goal: 30, category: "Routine" },
  ];
  await db.collection("habits").insertMany(
    defaults.map((d, i) => ({
      ...d,
      frequency_type: "daily",
      weekdays: "",
      times_per_week: 3,
      quantity_target: 0,
      quantity_unit: "",
      verify_type: "manual",
      verify_config: "{}",
      goal_id: null,
      milestone_id: null,
      interval_days: 7,
      position: i,
      archived: 0,
      why: "",
      created_at: new Date().toISOString(),
    }))
  );
}

// ── Document → TypeScript converters ──────────────────────────────────────────

function toOid(id: string): ObjectId {
  try { return new ObjectId(id); } catch { throw new Error(`Invalid id: ${id}`); }
}

function docToHabit(doc: Document): Habit {
  const { _id, ...rest } = doc;
  return { pause_until: null, id: (_id as ObjectId).toString(), ...rest } as Habit;
}

function docToGoal(doc: Document): Goal {
  const { _id, ...rest } = doc;
  return { id: (_id as ObjectId).toString(), ...rest } as Goal;
}

function docToMilestone(doc: Document): Milestone {
  const { _id, ...rest } = doc;
  return { id: (_id as ObjectId).toString(), ...rest } as Milestone;
}

function docToEntry(doc: Document): Entry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = doc;
  return rest as Entry;
}

function docToContext(doc: Document): ContextDay {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = doc;
  return rest as ContextDay;
}

function docToReview(doc: Document): WeeklyReview {
  const { _id, ...rest } = doc;
  return { id: (_id as ObjectId).toString(), ...rest } as WeeklyReview;
}

function docToExperiment(doc: Document): Experiment {
  const { _id, ...rest } = doc;
  return { id: (_id as ObjectId).toString(), ...rest } as Experiment;
}

// ── Events ────────────────────────────────────────────────────────────────────

export async function logEvent(
  type: string, habitId: string | null, date: string | null, detail: object
): Promise<void> {
  const db = await getDb();
  await db.collection("events").insertOne({
    at: new Date(),
    kind: type,
    habit_id: habitId,
    date,
    detail: JSON.stringify(detail),
  });
}

export async function recentEvents(limit = 50) {
  const db = await getDb();
  const docs = await db.collection("events")
    .find({})
    .sort({ _id: -1 })
    .limit(Math.min(200, limit))
    .toArray();
  return docs.map((d) => ({
    id: (d._id as ObjectId).toString(),
    ts: d.at,
    type: d.kind,
    habit_id: d.habit_id,
    date: d.date,
    detail: d.detail,
  }));
}

// ── Habits ────────────────────────────────────────────────────────────────────

export async function listHabits(includeArchived = false): Promise<Habit[]> {
  const db = await getDb();
  const filter = includeArchived ? {} : { archived: 0 };
  const docs = await db.collection("habits").find(filter).sort({ position: 1, _id: 1 }).toArray();
  return docs.map(docToHabit);
}

export async function getHabit(id: string): Promise<Habit | null> {
  const db = await getDb();
  try {
    const doc = await db.collection("habits").findOne({ _id: toOid(id) });
    return doc ? docToHabit(doc) : null;
  } catch { return null; }
}

export interface HabitInput {
  name: string;
  category?: string;
  goal?: number;
  frequency_type?: string;
  weekdays?: string;
  times_per_week?: number;
  interval_days?: number;
  quantity_target?: number;
  quantity_unit?: string;
  verify_type?: string;
  verify_config?: string;
  goal_id?: string | null;
  milestone_id?: string | null;
  archived?: number;
  why?: string;
}

export async function createHabit(input: HabitInput): Promise<Habit> {
  const db = await getDb();
  const maxDoc = await db.collection("habits")
    .findOne({}, { sort: { position: -1 }, projection: { position: 1 } });
  const maxPos = (maxDoc?.position as number | undefined) ?? -1;

  const doc = {
    name: input.name,
    category: input.category ?? "General",
    goal: input.goal ?? 30,
    frequency_type: input.frequency_type ?? "daily",
    weekdays: input.weekdays ?? "",
    times_per_week: input.times_per_week ?? 3,
    quantity_target: input.quantity_target ?? 0,
    quantity_unit: input.quantity_unit ?? "",
    verify_type: input.verify_type ?? "manual",
    verify_config: input.verify_config ?? "{}",
    goal_id: input.goal_id ?? null,
    milestone_id: input.milestone_id ?? null,
    interval_days: input.interval_days ?? 7,
    position: maxPos + 1,
    archived: 0,
    why: input.why ?? "",
    created_at: new Date().toISOString(),
  };

  const result = await db.collection("habits").insertOne(doc);
  await logEvent("habit_created", result.insertedId.toString(), null, { name: input.name });
  return (await getHabit(result.insertedId.toString()))!;
}

export async function updateHabit(id: string, input: Partial<HabitInput>): Promise<Habit | null> {
  const db = await getDb();
  const update: Record<string, unknown> = {};
  const fields: (keyof HabitInput)[] = [
    "name", "category", "goal", "frequency_type", "weekdays", "times_per_week",
    "interval_days", "quantity_target", "quantity_unit", "verify_type", "verify_config",
    "goal_id", "milestone_id", "archived", "why",
  ];
  for (const field of fields) {
    if (input[field] !== undefined) update[field] = input[field];
  }
  if (Object.keys(update).length === 0) return getHabit(id);
  try {
    await db.collection("habits").updateOne({ _id: toOid(id) }, { $set: update });
    await logEvent("habit_updated", id, null, input as object);
    return getHabit(id);
  } catch { return null; }
}

export async function reorderHabits(orderedIds: string[]): Promise<void> {
  const db = await getDb();
  const ops = orderedIds.map((id, i) => ({
    updateOne: { filter: { _id: toOid(id) }, update: { $set: { position: i } } },
  }));
  if (ops.length) await db.collection("habits").bulkWrite(ops);
}

export async function deleteHabit(id: string): Promise<boolean> {
  const db = await getDb();
  try {
    const result = await db.collection("habits").deleteOne({ _id: toOid(id) });
    if (result.deletedCount > 0) { await logEvent("habit_deleted", id, null, {}); return true; }
    return false;
  } catch { return false; }
}

// ── Entries ───────────────────────────────────────────────────────────────────

export async function entriesForRange(from: string, to: string): Promise<Entry[]> {
  const db = await getDb();
  const docs = await db.collection("entries")
    .find({ date: { $gte: from, $lte: to } })
    .sort({ date: 1 })
    .toArray();
  return docs.map(docToEntry);
}

export async function entriesForHabit(habitId: string): Promise<Entry[]> {
  const db = await getDb();
  const docs = await db.collection("entries")
    .find({ habit_id: habitId })
    .sort({ date: 1 })
    .toArray();
  return docs.map(docToEntry);
}

export async function entriesSince(from: string): Promise<Entry[]> {
  const db = await getDb();
  const docs = await db.collection("entries")
    .find({ date: { $gte: from } })
    .sort({ date: 1 })
    .toArray();
  return docs.map(docToEntry);
}

export interface EntryInput {
  status?: "done" | "skipped" | null;
  quantity?: number | null;
  note?: string | null;
  source?: string;
  duration_minutes?: number | null;
}

export async function setEntry(habitId: string, date: string, input: EntryInput): Promise<Entry | null> {
  const db = await getDb();
  const col = db.collection("entries");
  const existing = await col.findOne({ habit_id: habitId, date });

  const next = {
    status: input.status !== undefined ? input.status : existing?.status ?? null,
    quantity: input.quantity !== undefined ? input.quantity : existing?.quantity ?? null,
    note: input.note !== undefined ? input.note : existing?.note ?? null,
    source: input.source ?? existing?.source ?? "manual",
    duration_minutes: input.duration_minutes !== undefined ? input.duration_minutes : existing?.duration_minutes ?? null,
  };

  if (next.status === null && next.quantity === null && (next.note === null || next.note === "")) {
    if (existing) {
      await col.deleteOne({ habit_id: habitId, date });
      await logEvent("entry_cleared", habitId, date, {});
    }
    return null;
  }

  const status = next.status ?? "done";
  const writtenAt = new Date().toISOString();
  await col.updateOne(
    { habit_id: habitId, date },
    { $set: { habit_id: habitId, date, status, quantity: next.quantity, note: next.note, source: next.source, duration_minutes: next.duration_minutes, created_at: writtenAt } },
    { upsert: true }
  );
  await logEvent(existing ? "entry_updated" : "entry_set", habitId, date, { status, quantity: next.quantity, source: next.source });
  return { habit_id: habitId, date, status, quantity: next.quantity, note: next.note, source: next.source, duration_minutes: next.duration_minutes, created_at: writtenAt };
}

// ── Context ───────────────────────────────────────────────────────────────────

export async function listContext(from: string, to: string): Promise<ContextDay[]> {
  const db = await getDb();
  const docs = await db.collection("daily_context")
    .find({ date: { $gte: from, $lte: to } })
    .sort({ date: 1 })
    .toArray();
  return docs.map(docToContext);
}

export async function allContext(): Promise<ContextDay[]> {
  const db = await getDb();
  const docs = await db.collection("daily_context").find({}).sort({ date: 1 }).toArray();
  return docs.map(docToContext);
}

export async function getContext(date: string): Promise<ContextDay | null> {
  const db = await getDb();
  const doc = await db.collection("daily_context").findOne({ date });
  return doc ? docToContext(doc) : null;
}

export async function setContext(
  date: string, mood: number | null, energy: number | null, sleep: number | null, notes?: string | null
): Promise<void> {
  const db = await getDb();
  await db.collection("daily_context").updateOne(
    { date },
    { $set: { date, mood, energy, sleep_hours: sleep, notes: notes ?? null } },
    { upsert: true }
  );
}

// ── Goals ─────────────────────────────────────────────────────────────────────

export async function listGoals(): Promise<Goal[]> {
  const db = await getDb();
  const docs = await db.collection("goals").find({}).sort({ _id: 1 }).toArray();
  return docs.map(docToGoal);
}

export async function getGoal(id: string): Promise<Goal | null> {
  const db = await getDb();
  try {
    const doc = await db.collection("goals").findOne({ _id: toOid(id) });
    return doc ? docToGoal(doc) : null;
  } catch { return null; }
}

interface GoalCreateFields {
  name: string;
  description?: string;
  target_date?: string | null;
  category?: string;
  priority?: string;
  timeframe?: string;
  start_date?: string | null;
  ai_context?: string;
  eisenhower?: string | null;
}

export async function createGoal(fields: GoalCreateFields): Promise<Goal> {
  const db = await getDb();
  const doc = {
    name: fields.name,
    description: fields.description ?? "",
    target_date: fields.target_date ?? null,
    category: fields.category ?? "General",
    priority: fields.priority ?? "medium",
    timeframe: fields.timeframe ?? "custom",
    start_date: fields.start_date ?? null,
    status: "active",
    ai_context: fields.ai_context ?? "",
    eisenhower: fields.eisenhower ?? null,
    parent_id: null,
    created_at: new Date().toISOString(),
  };
  const result = await db.collection("goals").insertOne(doc);
  return (await getGoal(result.insertedId.toString()))!;
}

export async function updateGoal(
  id: string,
  fields: {
    name?: string; description?: string; target_date?: string | null;
    category?: string; priority?: string; timeframe?: string;
    start_date?: string | null; status?: string; ai_context?: string;
    eisenhower?: string | null;
  }
): Promise<Goal | null> {
  const db = await getDb();
  const update: Record<string, unknown> = {};
  if (fields.name        !== undefined) update.name        = fields.name;
  if (fields.description !== undefined) update.description = fields.description;
  if (fields.target_date !== undefined) update.target_date = fields.target_date;
  if (fields.category    !== undefined) update.category    = fields.category;
  if (fields.priority    !== undefined) update.priority    = fields.priority;
  if (fields.timeframe   !== undefined) update.timeframe   = fields.timeframe;
  if (fields.start_date  !== undefined) update.start_date  = fields.start_date;
  if (fields.status      !== undefined) update.status      = fields.status;
  if (fields.ai_context  !== undefined) update.ai_context  = fields.ai_context;
  if (fields.eisenhower  !== undefined) update.eisenhower  = fields.eisenhower;
  if (Object.keys(update).length > 0) {
    try { await db.collection("goals").updateOne({ _id: toOid(id) }, { $set: update }); }
    catch { return null; }
  }
  return getGoal(id);
}

export async function deleteGoal(id: string): Promise<boolean> {
  const db = await getDb();
  const milestones = await db.collection("milestones").find({ goal_id: id }).toArray();
  const msIds = milestones.map((m) => (m._id as ObjectId).toString());
  if (msIds.length > 0) {
    await db.collection("habits").updateMany({ milestone_id: { $in: msIds } }, { $set: { milestone_id: null } });
  }
  await db.collection("milestones").deleteMany({ goal_id: id });
  try {
    const result = await db.collection("goals").deleteOne({ _id: toOid(id) });
    return result.deletedCount > 0;
  } catch { return false; }
}

// ── Milestones ────────────────────────────────────────────────────────────────

export async function listMilestones(goalId?: string): Promise<Milestone[]> {
  const db = await getDb();
  const filter = goalId ? { goal_id: goalId } : {};
  const docs = await db.collection("milestones")
    .find(filter)
    .sort({ goal_id: 1, order_index: 1, _id: 1 })
    .toArray();
  return docs.map(docToMilestone);
}

export async function getMilestone(id: string): Promise<Milestone | null> {
  const db = await getDb();
  try {
    const doc = await db.collection("milestones").findOne({ _id: toOid(id) });
    return doc ? docToMilestone(doc) : null;
  } catch { return null; }
}

interface MilestoneCreateFields {
  goal_id: string;
  title: string;
  explanation?: string;
  estimated_duration?: string;
  order_index?: number;
  dependencies?: string;
  success_criteria?: string;
  target_date?: string | null;
}

export async function createMilestone(fields: MilestoneCreateFields): Promise<Milestone> {
  const db = await getDb();
  const doc = {
    goal_id: fields.goal_id,
    title: fields.title,
    explanation: fields.explanation ?? "",
    estimated_duration: fields.estimated_duration ?? "",
    order_index: fields.order_index ?? 0,
    dependencies: fields.dependencies ?? "[]",
    success_criteria: fields.success_criteria ?? "",
    status: "pending",
    target_date: fields.target_date ?? null,
    created_at: new Date().toISOString(),
  };
  const result = await db.collection("milestones").insertOne(doc);
  return (await getMilestone(result.insertedId.toString()))!;
}

export async function updateMilestone(
  id: string,
  fields: {
    title?: string; explanation?: string; estimated_duration?: string;
    order_index?: number; dependencies?: string; success_criteria?: string;
    status?: string; target_date?: string | null;
  }
): Promise<Milestone | null> {
  const db = await getDb();
  const update: Record<string, unknown> = {};
  if (fields.title              !== undefined) update.title              = fields.title;
  if (fields.explanation        !== undefined) update.explanation        = fields.explanation;
  if (fields.estimated_duration !== undefined) update.estimated_duration = fields.estimated_duration;
  if (fields.order_index        !== undefined) update.order_index        = fields.order_index;
  if (fields.dependencies       !== undefined) update.dependencies       = fields.dependencies;
  if (fields.success_criteria   !== undefined) update.success_criteria   = fields.success_criteria;
  if (fields.status             !== undefined) update.status             = fields.status;
  if (fields.target_date        !== undefined) update.target_date        = fields.target_date;
  if (Object.keys(update).length > 0) {
    try { await db.collection("milestones").updateOne({ _id: toOid(id) }, { $set: update }); }
    catch { return null; }
  }
  return getMilestone(id);
}

export async function deleteMilestone(id: string): Promise<boolean> {
  const db = await getDb();
  await db.collection("habits").updateMany({ milestone_id: id }, { $set: { milestone_id: null } });
  try {
    const result = await db.collection("milestones").deleteOne({ _id: toOid(id) });
    return result.deletedCount > 0;
  } catch { return false; }
}

// ── Experiments ───────────────────────────────────────────────────────────────

export async function listExperiments(): Promise<Experiment[]> {
  const db = await getDb();
  const docs = await db.collection("experiments").find({}).sort({ _id: -1 }).toArray();
  return docs.map(docToExperiment);
}

export async function createExperiment(x: Omit<Experiment, "id">): Promise<Experiment> {
  const db = await getDb();
  const result = await db.collection("experiments").insertOne({ ...x });
  const doc = await db.collection("experiments").findOne({ _id: result.insertedId });
  return docToExperiment(doc!);
}

export async function deleteExperiment(id: string): Promise<boolean> {
  const db = await getDb();
  try {
    const result = await db.collection("experiments").deleteOne({ _id: toOid(id) });
    return result.deletedCount > 0;
  } catch { return false; }
}

// ── Settings / Tokens ─────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const doc = await db.collection("settings").findOne({ key });
  return doc ? (doc.value as string) : null;
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  const db = await getDb();
  if (value === null) { await db.collection("settings").deleteOne({ key }); return; }
  await db.collection("settings").updateOne(
    { key },
    { $set: { key, value } },
    { upsert: true }
  );
}

export async function regenerateToken(key: "api_key" | "share_token"): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  await setSetting(key, token);
  await logEvent(`${key}_regenerated`, null, null, {});
  return token;
}

export async function checkApiKey(authHeader: string | null): Promise<boolean> {
  const stored = await getSetting("api_key");
  if (!stored || !authHeader) return false;
  const given = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (given.length !== stored.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(stored));
}

// ── Push Subscriptions ────────────────────────────────────────────────────────

export interface PushSub { endpoint: string; p256dh: string; auth: string; }

export async function savePushSub(sub: PushSub): Promise<void> {
  const db = await getDb();
  await db.collection("push_subscriptions").updateOne(
    { endpoint: sub.endpoint },
    { $set: { ...sub, created_at: new Date().toISOString() } },
    { upsert: true }
  );
}

export async function deletePushSub(endpoint: string): Promise<void> {
  const db = await getDb();
  await db.collection("push_subscriptions").deleteOne({ endpoint });
}

export async function listPushSubs(): Promise<PushSub[]> {
  const db = await getDb();
  const docs = await db.collection("push_subscriptions").find({}).toArray();
  return docs.map((d) => ({ endpoint: d.endpoint as string, p256dh: d.p256dh as string, auth: d.auth as string }));
}

// ── Reminders ──────────────────────────────────────────────────────────────────

export interface Reminder {
  id: string;
  message: string;
  time: string;      // "HH:MM" in IST
  days: string;      // "daily" | CSV of weekday numbers 0-6 (0=Sun)
  enabled: boolean;
  created_at: string;
}

function docToReminder(d: Document): Reminder {
  return {
    id: String(d._id),
    message: d.message as string,
    time: d.time as string,
    days: d.days as string,
    enabled: d.enabled as boolean,
    created_at: d.created_at as string,
  };
}

export async function listReminders(): Promise<Reminder[]> {
  const db = await getDb();
  const docs = await db.collection("reminders").find({}).sort({ time: 1 }).toArray();
  return docs.map(docToReminder);
}

export async function createReminder(input: Omit<Reminder, "id" | "created_at">): Promise<Reminder> {
  const db = await getDb();
  const doc = { ...input, enabled: true, created_at: new Date().toISOString() };
  const r = await db.collection("reminders").insertOne(doc);
  return docToReminder({ _id: r.insertedId, ...doc });
}

export async function updateReminder(id: string, patch: Partial<Pick<Reminder, "message" | "time" | "days" | "enabled">>): Promise<void> {
  const db = await getDb();
  await db.collection("reminders").updateOne({ _id: new ObjectId(id) }, { $set: patch });
}

export async function deleteReminder(id: string): Promise<void> {
  const db = await getDb();
  await db.collection("reminders").deleteOne({ _id: new ObjectId(id) });
}

export async function listEnabledRemindersForTime(time: string): Promise<Reminder[]> {
  const db = await getDb();
  const docs = await db.collection("reminders").find({ enabled: true, time }).toArray();
  return docs.map(docToReminder);
}

// ── Backup / Import ───────────────────────────────────────────────────────────

export async function exportAll() {
  const db = await getDb();
  const [habits, goals, milestones, entries, daily_context, experiments] = await Promise.all([
    db.collection("habits").find({}).toArray(),
    db.collection("goals").find({}).toArray(),
    db.collection("milestones").find({}).toArray(),
    db.collection("entries").find({}).toArray(),
    db.collection("daily_context").find({}).toArray(),
    db.collection("experiments").find({}).toArray(),
  ]);
  return {
    version: 4,
    exported_at: new Date().toISOString(),
    habits: habits.map(docToHabit),
    goals: goals.map(docToGoal),
    milestones: milestones.map(docToMilestone),
    entries: entries.map(docToEntry),
    daily_context: daily_context.map(docToContext),
    experiments: experiments.map(docToExperiment),
  };
}

export async function importAll(data: {
  habits?: unknown[]; goals?: unknown[]; milestones?: unknown[]; entries?: unknown[];
  daily_context?: unknown[]; experiments?: unknown[];
}): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection("entries").deleteMany({}),
    db.collection("experiments").deleteMany({}),
    db.collection("habits").deleteMany({}),
    db.collection("milestones").deleteMany({}),
    db.collection("goals").deleteMany({}),
    db.collection("daily_context").deleteMany({}),
  ]);

  const goals       = (data.goals       ?? []) as Goal[];
  const milestones  = (data.milestones  ?? []) as Milestone[];
  const habits      = (data.habits      ?? []) as Habit[];
  const entries     = (data.entries     ?? []) as Entry[];
  const ctx         = (data.daily_context ?? []) as ContextDay[];
  const exps        = (data.experiments ?? []) as Experiment[];

  // Strip the id field so MongoDB generates new _id values
  if (goals.length)      await db.collection("goals").insertMany(goals.map(({ id: _id2, ...r }) => r));
  if (milestones.length) await db.collection("milestones").insertMany(milestones.map(({ id: _id2, ...r }) => r));
  if (habits.length)     await db.collection("habits").insertMany(habits.map(({ id: _id2, ...r }) => r));
  if (entries.length)    await db.collection("entries").insertMany(entries);
  if (ctx.length)        await db.collection("daily_context").insertMany(ctx);
  if (exps.length)       await db.collection("experiments").insertMany(exps.map(({ id: _id2, ...r }) => r));

  await logEvent("import", null, null, { habits: habits.length, entries: entries.length });
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export interface Expense {
  id: string; date: string; name: string; amount: number;
  type: "expense" | "credit"; category: string; note: string | null; created_at: string;
}
export interface ExpenseBudget {
  id: string; month: string; category: string; amount: number;
}

function docToExpense(doc: Document): Expense {
  const { _id, ...rest } = doc;
  return { id: (_id as ObjectId).toString(), ...rest } as Expense;
}

function docToBudget(doc: Document): ExpenseBudget {
  const { _id, ...rest } = doc;
  return { id: (_id as ObjectId).toString(), ...rest } as ExpenseBudget;
}

export async function listExpenses(from: string, to: string): Promise<Expense[]> {
  const db = await getDb();
  const docs = await db.collection("expenses")
    .find({ date: { $gte: from, $lte: to } })
    .sort({ date: -1, _id: -1 })
    .toArray();
  return docs.map(docToExpense);
}

export async function createExpense(input: {
  date: string; name: string; amount: number;
  type?: "expense" | "credit"; category?: string; note?: string | null;
}): Promise<Expense> {
  const db = await getDb();
  const doc = {
    date: input.date,
    name: input.name.trim().slice(0, 120),
    amount: Math.abs(input.amount),
    type: input.type ?? "expense",
    category: input.category ?? "Other",
    note: input.note ?? null,
    created_at: new Date().toISOString(),
  };
  const result = await db.collection("expenses").insertOne(doc);
  return docToExpense({ _id: result.insertedId, ...doc });
}

export async function updateExpense(id: string, input: Partial<{
  date: string; name: string; amount: number; type: string; category: string; note: string | null;
}>): Promise<Expense | null> {
  const db = await getDb();
  const update: Record<string, unknown> = {};
  if (input.name     !== undefined) update.name     = input.name;
  if (input.amount   !== undefined) update.amount   = input.amount;
  if (input.date     !== undefined) update.date     = input.date;
  if (input.type     !== undefined) update.type     = input.type;
  if (input.category !== undefined) update.category = input.category;
  if (input.note     !== undefined) update.note     = input.note;
  try {
    const oid = toOid(id);
    await db.collection("expenses").updateOne({ _id: oid }, { $set: update });
    const doc = await db.collection("expenses").findOne({ _id: oid });
    return doc ? docToExpense(doc) : null;
  } catch { return null; }
}

export async function deleteExpense(id: string): Promise<boolean> {
  const db = await getDb();
  try {
    const result = await db.collection("expenses").deleteOne({ _id: toOid(id) });
    return result.deletedCount > 0;
  } catch { return false; }
}

export async function listBudgets(month: string): Promise<ExpenseBudget[]> {
  const db = await getDb();
  const docs = await db.collection("expense_budgets")
    .find({ month })
    .sort({ category: 1 })
    .toArray();
  return docs.map(docToBudget);
}

export async function setBudget(month: string, category: string, amount: number): Promise<void> {
  const db = await getDb();
  await db.collection("expense_budgets").updateOne(
    { month, category },
    { $set: { month, category, amount } },
    { upsert: true }
  );
}

export async function deleteBudget(id: string): Promise<boolean> {
  const db = await getDb();
  try {
    const result = await db.collection("expense_budgets").deleteOne({ _id: toOid(id) });
    return result.deletedCount > 0;
  } catch { return false; }
}

// ── Weekly Reviews ────────────────────────────────────────────────────────────

export async function listReviews(limit = 8): Promise<WeeklyReview[]> {
  const db = await getDb();
  const docs = await db.collection("weekly_reviews")
    .find({})
    .sort({ week_start: -1 })
    .limit(Math.min(20, limit))
    .toArray();
  return docs.map(docToReview);
}

export async function getReview(weekStart: string): Promise<WeeklyReview | null> {
  const db = await getDb();
  const doc = await db.collection("weekly_reviews").findOne({ week_start: weekStart });
  return doc ? docToReview(doc) : null;
}

export async function upsertReview(
  weekStart: string, wentWell: string, gotInWay: string, protectTime: string
): Promise<WeeklyReview> {
  const db = await getDb();
  await db.collection("weekly_reviews").updateOne(
    { week_start: weekStart },
    { $set: { week_start: weekStart, went_well: wentWell, got_in_way: gotInWay, protect_time: protectTime, created_at: new Date().toISOString() } },
    { upsert: true }
  );
  return (await getReview(weekStart))!;
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  company: string;
  role: string;
  status: string;
  date_applied: string | null;
  referral: boolean;
  referral_contact: string;
  salary: string;
  job_link: string;
  notes: string;
  created_at: string;
}

function docToJob(doc: Document): Job {
  const { _id, ...rest } = doc;
  return { id: (_id as ObjectId).toString(), ...rest } as Job;
}

export async function listJobs(): Promise<Job[]> {
  const db = await getDb();
  const docs = await db.collection("jobs").find({}).sort({ created_at: -1 }).toArray();
  return docs.map(docToJob);
}

export async function createJob(input: Omit<Job, "id" | "created_at">): Promise<Job> {
  const db = await getDb();
  const doc = { ...input, created_at: new Date().toISOString() };
  const result = await db.collection("jobs").insertOne(doc);
  return docToJob({ _id: result.insertedId, ...doc });
}

export async function updateJob(id: string, input: Partial<Omit<Job, "id" | "created_at">>): Promise<Job | null> {
  const db = await getDb();
  try {
    const oid = toOid(id);
    await db.collection("jobs").updateOne({ _id: oid }, { $set: input });
    const doc = await db.collection("jobs").findOne({ _id: oid });
    return doc ? docToJob(doc) : null;
  } catch { return null; }
}

export async function deleteJob(id: string): Promise<boolean> {
  const db = await getDb();
  try {
    const result = await db.collection("jobs").deleteOne({ _id: toOid(id) });
    return result.deletedCount > 0;
  } catch { return false; }
}

// ── Daily MITs ────────────────────────────────────────────────────────────────

export async function getMits(date: string): Promise<string[]> {
  const db = await getDb();
  const doc = await db.collection("daily_mits").findOne({ date });
  return doc ? (doc.mit_ids as string[]) : [];
}

export async function setMits(date: string, mitIds: string[]): Promise<void> {
  const db = await getDb();
  await db.collection("daily_mits").updateOne(
    { date },
    { $set: { date, mit_ids: mitIds.slice(0, 3) } },
    { upsert: true }
  );
}
