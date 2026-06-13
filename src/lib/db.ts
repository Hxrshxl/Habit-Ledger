import { createClient, Client } from "@libsql/client";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import type { Habit, Entry, ContextDay, Goal, Milestone, Experiment, WeeklyReview } from "./core";

// ── Singleton (survives Next.js hot-reload in dev) ──────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __habitClient: Client | undefined;
  // eslint-disable-next-line no-var
  var __habitInit: Promise<void> | undefined;
}

type SqlVal = string | number | bigint | null;

function getClient(): Client {
  if (!globalThis.__habitClient) {
    const url = process.env.TURSO_DATABASE_URL ?? "file:./data/habits.db";
    if (url.startsWith("file:")) {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    }
    globalThis.__habitClient = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    globalThis.__habitInit = initSchema(globalThis.__habitClient, url);
  }
  return globalThis.__habitClient;
}

// Returns an initialized client. After schema init resolves, subsequent
// awaits on the same resolved promise are synchronous no-ops.
async function db(): Promise<Client> {
  const c = getClient();
  await globalThis.__habitInit;
  return c;
}

async function q<T>(sql: string, args: SqlVal[] = []): Promise<T[]> {
  const c = await db();
  const r = await c.execute({ sql, args: args as never });
  return r.rows as unknown as T[];
}

async function q1<T>(sql: string, args: SqlVal[] = []): Promise<T | null> {
  return (await q<T>(sql, args))[0] ?? null;
}

async function run(sql: string, args: SqlVal[] = []): Promise<{ changes: number; lastId: number }> {
  const c = await db();
  const r = await c.execute({ sql, args: args as never });
  return { changes: r.rowsAffected, lastId: Number(r.lastInsertRowid ?? 0) };
}

async function batchRun(stmts: Array<{ sql: string; args: SqlVal[] }>): Promise<void> {
  if (!stmts.length) return;
  const c = await db();
  await c.batch(stmts as never, "write");
}

// ── Schema & Seed ────────────────────────────────────────────────────────────

async function initSchema(client: Client, url: string): Promise<void> {
  // WAL + performance PRAGMAs apply only to local file-based SQLite
  if (url.startsWith("file:")) {
    for (const p of [
      "PRAGMA journal_mode = WAL",
      "PRAGMA synchronous   = NORMAL",
      "PRAGMA cache_size    = -65536",
      "PRAGMA mmap_size     = 268435456",
      "PRAGMA temp_store    = MEMORY",
    ]) {
      try { await client.execute(p); } catch {}
    }
  }
  try { await client.execute("PRAGMA foreign_keys = ON"); } catch {}

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS habits (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      category        TEXT    NOT NULL DEFAULT 'General',
      goal            INTEGER NOT NULL DEFAULT 30,
      frequency_type  TEXT    NOT NULL DEFAULT 'daily',
      weekdays        TEXT    NOT NULL DEFAULT '',
      times_per_week  INTEGER NOT NULL DEFAULT 3,
      quantity_target INTEGER NOT NULL DEFAULT 0,
      quantity_unit   TEXT    NOT NULL DEFAULT '',
      verify_type     TEXT    NOT NULL DEFAULT 'manual',
      verify_config   TEXT    NOT NULL DEFAULT '{}',
      goal_id         INTEGER,
      position        INTEGER NOT NULL DEFAULT 0,
      archived        INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS entries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      date       TEXT    NOT NULL,
      status     TEXT    NOT NULL DEFAULT 'done',
      quantity   INTEGER,
      note       TEXT,
      source     TEXT    NOT NULL DEFAULT 'manual',
      created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE (habit_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
    CREATE TABLE IF NOT EXISTS daily_context (
      date        TEXT PRIMARY KEY,
      mood        INTEGER,
      energy      INTEGER,
      sleep_hours REAL
    );
    CREATE TABLE IF NOT EXISTS goals (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      target_date TEXT
    );
    CREATE TABLE IF NOT EXISTS experiments (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      a_label  TEXT NOT NULL, a_from TEXT NOT NULL, a_to TEXT NOT NULL,
      b_label  TEXT NOT NULL, b_from TEXT NOT NULL, b_to TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      ts       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      type     TEXT NOT NULL,
      habit_id INTEGER,
      date     TEXT,
      detail   TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT    NOT NULL,
      name       TEXT    NOT NULL,
      amount     REAL    NOT NULL,
      type       TEXT    NOT NULL DEFAULT 'expense',
      category   TEXT    NOT NULL DEFAULT 'Other',
      note       TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE TABLE IF NOT EXISTS expense_budgets (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      month    TEXT    NOT NULL,
      category TEXT    NOT NULL,
      amount   REAL    NOT NULL,
      UNIQUE(month, category)
    );
    CREATE TABLE IF NOT EXISTS weekly_reviews (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start   TEXT    NOT NULL UNIQUE,
      went_well    TEXT    NOT NULL DEFAULT '',
      got_in_way   TEXT    NOT NULL DEFAULT '',
      protect_time TEXT    NOT NULL DEFAULT '',
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS milestones (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id            INTEGER NOT NULL,
      title              TEXT    NOT NULL,
      explanation        TEXT    NOT NULL DEFAULT '',
      estimated_duration TEXT    NOT NULL DEFAULT '',
      order_index        INTEGER NOT NULL DEFAULT 0,
      dependencies       TEXT    NOT NULL DEFAULT '[]',
      success_criteria   TEXT    NOT NULL DEFAULT '',
      status             TEXT    NOT NULL DEFAULT 'pending',
      target_date        TEXT,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint   TEXT    NOT NULL UNIQUE,
      p256dh     TEXT    NOT NULL,
      auth       TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrations run BEFORE indexes so migrated columns exist when indexes reference them
  const mig = async (sql: string) => { try { await client.execute(sql); } catch {} };
  // legacy goal columns
  await mig("ALTER TABLE goals ADD COLUMN parent_id INTEGER");
  await mig("ALTER TABLE goals ADD COLUMN created_at TEXT");
  // new goal planning fields
  await mig("ALTER TABLE goals ADD COLUMN category TEXT NOT NULL DEFAULT 'General'");
  await mig("ALTER TABLE goals ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'");
  await mig("ALTER TABLE goals ADD COLUMN timeframe TEXT NOT NULL DEFAULT 'custom'");
  await mig("ALTER TABLE goals ADD COLUMN start_date TEXT");
  await mig("ALTER TABLE goals ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  await mig("ALTER TABLE goals ADD COLUMN ai_context TEXT NOT NULL DEFAULT ''");
  await mig("ALTER TABLE goals ADD COLUMN eisenhower TEXT");
  // habit fields
  await mig("ALTER TABLE habits ADD COLUMN why TEXT NOT NULL DEFAULT ''");
  await mig("ALTER TABLE habits ADD COLUMN milestone_id INTEGER");
  await mig("ALTER TABLE habits ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 7");

  await client.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_entries_habit_date   ON entries(habit_id, date);
    CREATE INDEX IF NOT EXISTS idx_habits_goal_archived ON habits(goal_id, archived);
    CREATE INDEX IF NOT EXISTS idx_habits_position      ON habits(archived, position);
    CREATE INDEX IF NOT EXISTS idx_goals_parent         ON goals(parent_id);
    CREATE INDEX IF NOT EXISTS idx_milestones_goal      ON milestones(goal_id);
    CREATE INDEX IF NOT EXISTS idx_habits_milestone     ON habits(milestone_id);
  `);

  // One-time data migration: move old goals-as-milestones into the milestones table
  await migrateLegacyMilestones(client);

  if (url.startsWith("file:")) {
    try { await client.execute("PRAGMA optimize"); } catch {}
  }

  await seedIfEmpty(client);
}

async function migrateLegacyMilestones(client: Client): Promise<void> {
  // Move goals with parent_id != null to the milestones table, then delete them from goals.
  // Already migrated rows have no matching goals.parent_id, so this is safe to re-run.
  const legacy = await client.execute(
    "SELECT id, name, description, target_date, parent_id, created_at FROM goals WHERE parent_id IS NOT NULL"
  );
  if (legacy.rows.length === 0) return;

  for (const row of legacy.rows) {
    const r = await client.execute({
      sql: "INSERT INTO milestones (goal_id, title, explanation, target_date, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
      args: [row.parent_id, row.name, row.description ?? "", row.target_date, row.created_at ?? new Date().toISOString()],
    });
    const newMsId = Number(r.lastInsertRowid ?? 0);
    if (newMsId > 0) {
      await client.execute({ sql: "UPDATE habits SET milestone_id = ? WHERE goal_id = ?", args: [newMsId, row.id] });
    }
    await client.execute({ sql: "DELETE FROM goals WHERE id = ?", args: [row.id] });
  }
}

async function seedIfEmpty(client: Client): Promise<void> {
  const r = await client.execute("SELECT COUNT(*) AS c FROM habits");
  if (Number(r.rows[0].c) > 0) return;

  const defaults: Array<[string, number, string]> = [
    ["Wake Up Early", 30, "Routine"],
    ["DSA - Revision", 30, "Learning"],
    ["DSA - 1", 30, "Learning"],
    ["DSA - 2", 20, "Learning"],
    ["DSA - 3", 30, "Learning"],
    ["System Design - Revision", 30, "Learning"],
    ["System Design - New", 30, "Learning"],
    ["Drink 3L Water", 25, "Health"],
    ["Track Expenses 💵", 30, "Finance"],
    ["Skincare Routine ✨", 30, "Routine"],
  ];

  await client.batch(
    defaults.map(([name, goal, cat], i) => ({
      sql: "INSERT INTO habits (name, goal, category, position) VALUES (?, ?, ?, ?)",
      args: [name, goal, cat, i],
    })),
    "write"
  );
}

// ── Events ───────────────────────────────────────────────────────────────────

export async function logEvent(
  type: string, habitId: number | null, date: string | null, detail: object
): Promise<void> {
  await run(
    "INSERT INTO events (type, habit_id, date, detail) VALUES (?, ?, ?, ?)",
    [type, habitId, date, JSON.stringify(detail)]
  );
}

export async function recentEvents(limit = 50) {
  return q(
    "SELECT id, ts, type, habit_id, date, detail FROM events ORDER BY id DESC LIMIT ?",
    [Math.min(200, limit)]
  );
}

// ── Habits ────────────────────────────────────────────────────────────────────

const HABIT_COLS =
  "id, name, category, goal, frequency_type, weekdays, times_per_week, quantity_target, quantity_unit, verify_type, verify_config, goal_id, milestone_id, interval_days, position, archived, why";

export async function listHabits(includeArchived = false): Promise<Habit[]> {
  const sql = includeArchived
    ? `SELECT ${HABIT_COLS} FROM habits ORDER BY position, id`
    : `SELECT ${HABIT_COLS} FROM habits WHERE archived = 0 ORDER BY position, id`;
  return q<Habit>(sql);
}

export async function getHabit(id: number): Promise<Habit | null> {
  return q1<Habit>(`SELECT ${HABIT_COLS} FROM habits WHERE id = ?`, [id]);
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
  goal_id?: number | null;
  milestone_id?: number | null;
  archived?: number;
  why?: string;
}

export async function createHabit(input: HabitInput): Promise<Habit> {
  const posRow = await q1<{ m: number }>("SELECT COALESCE(MAX(position), -1) AS m FROM habits");
  const maxPos = posRow?.m ?? -1;
  const { lastId } = await run(
    `INSERT INTO habits
     (name, category, goal, frequency_type, weekdays, times_per_week,
      quantity_target, quantity_unit, verify_type, verify_config, goal_id, milestone_id, interval_days, position, why)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.category ?? "General",
      input.goal ?? 30,
      input.frequency_type ?? "daily",
      input.weekdays ?? "",
      input.times_per_week ?? 3,
      input.quantity_target ?? 0,
      input.quantity_unit ?? "",
      input.verify_type ?? "manual",
      input.verify_config ?? "{}",
      input.goal_id ?? null,
      input.milestone_id ?? null,
      input.interval_days ?? 7,
      maxPos + 1,
      input.why ?? "",
    ]
  );
  await logEvent("habit_created", lastId, null, { name: input.name });
  return (await getHabit(lastId))!;
}

export async function updateHabit(id: number, input: Partial<HabitInput>): Promise<Habit | null> {
  if (!await getHabit(id)) return null;
  const allowed: Record<string, string> = {
    name: "name", category: "category", goal: "goal", frequency_type: "frequency_type",
    weekdays: "weekdays", times_per_week: "times_per_week", interval_days: "interval_days",
    quantity_target: "quantity_target",
    quantity_unit: "quantity_unit", verify_type: "verify_type", verify_config: "verify_config",
    goal_id: "goal_id", milestone_id: "milestone_id", archived: "archived", why: "why",
  };
  const stmts: Array<{ sql: string; args: SqlVal[] }> = [];
  for (const [k, col] of Object.entries(allowed)) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined) stmts.push({ sql: `UPDATE habits SET ${col} = ? WHERE id = ?`, args: [v as SqlVal, id] });
  }
  if (stmts.length) await batchRun(stmts);
  await logEvent("habit_updated", id, null, input as object);
  return getHabit(id);
}

export async function reorderHabits(orderedIds: number[]): Promise<void> {
  await batchRun(
    orderedIds.map((id, i) => ({ sql: "UPDATE habits SET position = ? WHERE id = ?", args: [i, id] as SqlVal[] }))
  );
}

export async function deleteHabit(id: number): Promise<boolean> {
  const { changes } = await run("DELETE FROM habits WHERE id = ?", [id]);
  if (changes > 0) await logEvent("habit_deleted", id, null, {});
  return changes > 0;
}

// ── Entries ───────────────────────────────────────────────────────────────────

const ENTRY_COLS = "habit_id, date, status, quantity, note, source, created_at";

export async function entriesForRange(from: string, to: string): Promise<Entry[]> {
  return q<Entry>(
    `SELECT ${ENTRY_COLS} FROM entries WHERE date >= ? AND date <= ? ORDER BY date`,
    [from, to]
  );
}

export async function entriesForHabit(habitId: number): Promise<Entry[]> {
  return q<Entry>(`SELECT ${ENTRY_COLS} FROM entries WHERE habit_id = ? ORDER BY date`, [habitId]);
}

/** Bounded history — callers should pass an explicit from date. */
export async function entriesSince(from: string): Promise<Entry[]> {
  return q<Entry>(`SELECT ${ENTRY_COLS} FROM entries WHERE date >= ? ORDER BY date`, [from]);
}

export interface EntryInput {
  status?: "done" | "skipped" | null;
  quantity?: number | null;
  note?: string | null;
  source?: string;
}

export async function setEntry(habitId: number, date: string, input: EntryInput): Promise<Entry | null> {
  const existing = await q1<Entry>(
    `SELECT ${ENTRY_COLS} FROM entries WHERE habit_id = ? AND date = ?`,
    [habitId, date]
  );

  const next = {
    status: input.status !== undefined ? input.status : existing?.status ?? null,
    quantity: input.quantity !== undefined ? input.quantity : existing?.quantity ?? null,
    note: input.note !== undefined ? input.note : existing?.note ?? null,
    source: input.source ?? existing?.source ?? "manual",
  };

  if (next.status === null && next.quantity === null && (next.note === null || next.note === "")) {
    if (existing) {
      await run("DELETE FROM entries WHERE habit_id = ? AND date = ?", [habitId, date]);
      await logEvent("entry_cleared", habitId, date, {});
    }
    return null;
  }

  const status = next.status ?? "done";
  if (existing) {
    await run(
      "UPDATE entries SET status = ?, quantity = ?, note = ?, source = ? WHERE habit_id = ? AND date = ?",
      [status, next.quantity, next.note, next.source, habitId, date]
    );
  } else {
    await run(
      "INSERT INTO entries (habit_id, date, status, quantity, note, source) VALUES (?, ?, ?, ?, ?, ?)",
      [habitId, date, status, next.quantity, next.note, next.source]
    );
  }
  await logEvent(existing ? "entry_updated" : "entry_set", habitId, date, {
    status, quantity: next.quantity, source: next.source,
  });
  return q1<Entry>(`SELECT ${ENTRY_COLS} FROM entries WHERE habit_id = ? AND date = ?`, [habitId, date]);
}

// ── Context ───────────────────────────────────────────────────────────────────

export async function listContext(from: string, to: string): Promise<ContextDay[]> {
  return q<ContextDay>(
    "SELECT date, mood, energy, sleep_hours FROM daily_context WHERE date >= ? AND date <= ? ORDER BY date",
    [from, to]
  );
}

export async function allContext(): Promise<ContextDay[]> {
  return q<ContextDay>("SELECT date, mood, energy, sleep_hours FROM daily_context ORDER BY date");
}

export async function setContext(
  date: string, mood: number | null, energy: number | null, sleep: number | null
): Promise<void> {
  await run(
    `INSERT INTO daily_context (date, mood, energy, sleep_hours) VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET mood = excluded.mood, energy = excluded.energy, sleep_hours = excluded.sleep_hours`,
    [date, mood, energy, sleep]
  );
}

// ── Goals ─────────────────────────────────────────────────────────────────────

const GOAL_COLS = "id, name, description, target_date, parent_id, created_at, category, priority, timeframe, start_date, status, ai_context, eisenhower";

export async function listGoals(): Promise<Goal[]> {
  return q<Goal>(`SELECT ${GOAL_COLS} FROM goals WHERE parent_id IS NULL ORDER BY id`);
}

export async function getGoal(id: number): Promise<Goal | null> {
  return q1<Goal>(`SELECT ${GOAL_COLS} FROM goals WHERE id = ?`, [id]);
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
  const { lastId } = await run(
    `INSERT INTO goals (name, description, target_date, category, priority, timeframe, start_date, ai_context, eisenhower, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))`,
    [
      fields.name,
      fields.description ?? "",
      fields.target_date ?? null,
      fields.category ?? "General",
      fields.priority ?? "medium",
      fields.timeframe ?? "custom",
      fields.start_date ?? null,
      fields.ai_context ?? "",
      fields.eisenhower ?? null,
    ]
  );
  return (await getGoal(lastId))!;
}

export async function updateGoal(
  id: number,
  fields: {
    name?: string; description?: string; target_date?: string | null;
    category?: string; priority?: string; timeframe?: string;
    start_date?: string | null; status?: string; ai_context?: string;
    eisenhower?: string | null;
  }
): Promise<Goal | null> {
  const sets: string[] = [];
  const args: SqlVal[] = [];
  const add = (col: string, val: SqlVal) => { sets.push(`${col} = ?`); args.push(val); };
  if (fields.name        !== undefined) add("name",        fields.name);
  if (fields.description !== undefined) add("description", fields.description);
  if (fields.target_date !== undefined) add("target_date", fields.target_date);
  if (fields.category    !== undefined) add("category",    fields.category);
  if (fields.priority    !== undefined) add("priority",    fields.priority);
  if (fields.timeframe   !== undefined) add("timeframe",   fields.timeframe);
  if (fields.start_date  !== undefined) add("start_date",  fields.start_date);
  if (fields.status      !== undefined) add("status",      fields.status);
  if (fields.ai_context  !== undefined) add("ai_context",  fields.ai_context);
  if (fields.eisenhower  !== undefined) add("eisenhower",  fields.eisenhower);
  if (sets.length) await run(`UPDATE goals SET ${sets.join(", ")} WHERE id = ?`, [...args, id]);
  return getGoal(id);
}

export async function deleteGoal(id: number): Promise<boolean> {
  // Gather milestones from both old (goals.parent_id) and new (milestones table)
  const newMs = await q<{ id: number }>("SELECT id FROM milestones WHERE goal_id = ?", [id]);
  const oldMs = await q<{ id: number }>("SELECT id FROM goals WHERE parent_id = ?", [id]);

  const stmts: Array<{ sql: string; args: SqlVal[] }> = [];
  // Unlink habits from new milestones
  for (const { id: msId } of newMs) {
    stmts.push({ sql: "UPDATE habits SET milestone_id = NULL WHERE milestone_id = ?", args: [msId] });
    stmts.push({ sql: "UPDATE habits SET goal_id = NULL WHERE goal_id = ?", args: [msId] });
  }
  // Unlink habits from old milestone-as-goals
  for (const { id: msId } of oldMs) {
    stmts.push({ sql: "UPDATE habits SET goal_id = NULL WHERE goal_id = ?", args: [msId] });
  }
  stmts.push({ sql: "UPDATE habits SET goal_id = NULL WHERE goal_id = ?", args: [id] });
  stmts.push({ sql: "DELETE FROM milestones WHERE goal_id = ?", args: [id] });
  if (oldMs.length > 0) {
    stmts.push({ sql: "DELETE FROM goals WHERE parent_id = ?", args: [id] });
  }
  stmts.push({ sql: "DELETE FROM goals WHERE id = ?", args: [id] });

  const c = await db();
  const results = await c.batch(stmts as never, "write");
  return results[results.length - 1].rowsAffected > 0;
}

// ── Milestones ────────────────────────────────────────────────────────────────

const MS_COLS = "id, goal_id, title, explanation, estimated_duration, order_index, dependencies, success_criteria, status, target_date, created_at";

export async function listMilestones(goalId?: number): Promise<Milestone[]> {
  if (goalId !== undefined) {
    return q<Milestone>(`SELECT ${MS_COLS} FROM milestones WHERE goal_id = ? ORDER BY order_index, id`, [goalId]);
  }
  return q<Milestone>(`SELECT ${MS_COLS} FROM milestones ORDER BY goal_id, order_index, id`);
}

export async function getMilestone(id: number): Promise<Milestone | null> {
  return q1<Milestone>(`SELECT ${MS_COLS} FROM milestones WHERE id = ?`, [id]);
}

interface MilestoneCreateFields {
  goal_id: number;
  title: string;
  explanation?: string;
  estimated_duration?: string;
  order_index?: number;
  dependencies?: string;
  success_criteria?: string;
  target_date?: string | null;
}

export async function createMilestone(fields: MilestoneCreateFields): Promise<Milestone> {
  const { lastId } = await run(
    `INSERT INTO milestones (goal_id, title, explanation, estimated_duration, order_index, dependencies, success_criteria, status, target_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`,
    [
      fields.goal_id,
      fields.title,
      fields.explanation ?? "",
      fields.estimated_duration ?? "",
      fields.order_index ?? 0,
      fields.dependencies ?? "[]",
      fields.success_criteria ?? "",
      fields.target_date ?? null,
    ]
  );
  return (await getMilestone(lastId))!;
}

export async function updateMilestone(
  id: number,
  fields: {
    title?: string; explanation?: string; estimated_duration?: string;
    order_index?: number; dependencies?: string; success_criteria?: string;
    status?: string; target_date?: string | null;
  }
): Promise<Milestone | null> {
  const sets: string[] = [];
  const args: SqlVal[] = [];
  const add = (col: string, val: SqlVal) => { sets.push(`${col} = ?`); args.push(val); };
  if (fields.title              !== undefined) add("title",              fields.title);
  if (fields.explanation        !== undefined) add("explanation",        fields.explanation);
  if (fields.estimated_duration !== undefined) add("estimated_duration", fields.estimated_duration);
  if (fields.order_index        !== undefined) add("order_index",        fields.order_index);
  if (fields.dependencies       !== undefined) add("dependencies",       fields.dependencies);
  if (fields.success_criteria   !== undefined) add("success_criteria",   fields.success_criteria);
  if (fields.status             !== undefined) add("status",             fields.status);
  if (fields.target_date        !== undefined) add("target_date",        fields.target_date);
  if (sets.length) await run(`UPDATE milestones SET ${sets.join(", ")} WHERE id = ?`, [...args, id]);
  return getMilestone(id);
}

export async function deleteMilestone(id: number): Promise<boolean> {
  await run("UPDATE habits SET milestone_id = NULL WHERE milestone_id = ?", [id]);
  const { changes } = await run("DELETE FROM milestones WHERE id = ?", [id]);
  return changes > 0;
}

// ── Experiments ───────────────────────────────────────────────────────────────

export async function listExperiments(): Promise<Experiment[]> {
  return q<Experiment>(
    "SELECT id, name, habit_id, a_label, a_from, a_to, b_label, b_from, b_to FROM experiments ORDER BY id DESC"
  );
}

export async function createExperiment(x: Omit<Experiment, "id">): Promise<Experiment> {
  const { lastId } = await run(
    "INSERT INTO experiments (name, habit_id, a_label, a_from, a_to, b_label, b_from, b_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [x.name, x.habit_id, x.a_label, x.a_from, x.a_to, x.b_label, x.b_from, x.b_to]
  );
  return (await q1<Experiment>(
    "SELECT id, name, habit_id, a_label, a_from, a_to, b_label, b_from, b_to FROM experiments WHERE id = ?",
    [lastId]
  ))!;
}

export async function deleteExperiment(id: number): Promise<boolean> {
  const { changes } = await run("DELETE FROM experiments WHERE id = ?", [id]);
  return changes > 0;
}

// ── Settings / Tokens ─────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const r = await q1<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
  return r?.value ?? null;
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  if (value === null) {
    await run("DELETE FROM settings WHERE key = ?", [key]);
    return;
  }
  await run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
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
  const c = await db();
  await c.execute({
    sql: "INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)",
    args: [sub.endpoint, sub.p256dh, sub.auth],
  });
}

export async function deletePushSub(endpoint: string): Promise<void> {
  const c = await db();
  await c.execute({ sql: "DELETE FROM push_subscriptions WHERE endpoint = ?", args: [endpoint] });
}

export async function listPushSubs(): Promise<PushSub[]> {
  const c = await db();
  const rows = (await c.execute("SELECT endpoint, p256dh, auth FROM push_subscriptions")).rows;
  return rows.map((r) => ({ endpoint: String(r.endpoint), p256dh: String(r.p256dh), auth: String(r.auth) }));
}

// ── Backup / Import ───────────────────────────────────────────────────────────

export async function exportAll() {
  const c = await db();
  return {
    version: 3,
    exported_at: new Date().toISOString(),
    habits: (await c.execute(`SELECT ${HABIT_COLS}, created_at FROM habits`)).rows,
    goals: (await c.execute(`SELECT ${GOAL_COLS} FROM goals`)).rows,
    milestones: (await c.execute(`SELECT ${MS_COLS} FROM milestones`)).rows,
    entries: (await c.execute("SELECT habit_id, date, status, quantity, note, source, created_at FROM entries")).rows,
    daily_context: (await c.execute("SELECT date, mood, energy, sleep_hours FROM daily_context")).rows,
    experiments: (await c.execute("SELECT id, name, habit_id, a_label, a_from, a_to, b_label, b_from, b_to FROM experiments")).rows,
  };
}

export async function importAll(data: {
  habits?: unknown[]; goals?: unknown[]; milestones?: unknown[]; entries?: unknown[];
  daily_context?: unknown[]; experiments?: unknown[];
}): Promise<void> {
  const goals = (data.goals ?? []) as Goal[];
  const milestones = (data.milestones ?? []) as Milestone[];
  const habits = (data.habits ?? []) as (Habit & { created_at?: string })[];
  const entries = (data.entries ?? []) as Entry[];
  const ctx = (data.daily_context ?? []) as ContextDay[];
  const exps = (data.experiments ?? []) as Experiment[];

  const stmts: Array<{ sql: string; args: SqlVal[] }> = [
    { sql: "DELETE FROM entries", args: [] },
    { sql: "DELETE FROM experiments", args: [] },
    { sql: "DELETE FROM habits", args: [] },
    { sql: "DELETE FROM milestones", args: [] },
    { sql: "DELETE FROM goals", args: [] },
    { sql: "DELETE FROM daily_context", args: [] },
  ];

  for (const g of goals)
    stmts.push({
      sql: `INSERT INTO goals (id, name, description, target_date, category, priority, timeframe, start_date, status, ai_context, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [g.id, g.name, g.description ?? "", g.target_date ?? null,
        g.category ?? "General", g.priority ?? "medium", g.timeframe ?? "custom",
        g.start_date ?? null, g.status ?? "active", g.ai_context ?? "", g.created_at ?? null],
    });

  for (const m of milestones)
    stmts.push({
      sql: `INSERT INTO milestones (id, goal_id, title, explanation, estimated_duration, order_index, dependencies, success_criteria, status, target_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [m.id, m.goal_id, m.title, m.explanation ?? "", m.estimated_duration ?? "",
        m.order_index ?? 0, m.dependencies ?? "[]", m.success_criteria ?? "",
        m.status ?? "pending", m.target_date ?? null, m.created_at],
    });

  for (const h of habits)
    stmts.push({
      sql: `INSERT INTO habits (id, name, category, goal, frequency_type, weekdays, times_per_week,
              quantity_target, quantity_unit, verify_type, verify_config, goal_id, milestone_id, position, archived, why)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        h.id, h.name, h.category ?? "General", h.goal ?? 30, h.frequency_type ?? "daily",
        h.weekdays ?? "", h.times_per_week ?? 3, h.quantity_target ?? 0, h.quantity_unit ?? "",
        h.verify_type ?? "manual", h.verify_config ?? "{}", h.goal_id ?? null,
        h.milestone_id ?? null, h.position ?? 0, h.archived ?? 0, h.why ?? "",
      ],
    });

  for (const e of entries)
    stmts.push({
      sql: "INSERT INTO entries (habit_id, date, status, quantity, note, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        e.habit_id, e.date, e.status ?? "done", e.quantity ?? null, e.note ?? null,
        e.source ?? "manual",
        e.created_at ?? new Date().toISOString().slice(0, 19).replace("T", " "),
      ],
    });

  for (const c of ctx)
    stmts.push({
      sql: "INSERT INTO daily_context (date, mood, energy, sleep_hours) VALUES (?, ?, ?, ?)",
      args: [c.date, c.mood ?? null, c.energy ?? null, c.sleep_hours ?? null],
    });

  for (const x of exps)
    stmts.push({
      sql: "INSERT INTO experiments (id, name, habit_id, a_label, a_from, a_to, b_label, b_from, b_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [x.id, x.name, x.habit_id, x.a_label, x.a_from, x.a_to, x.b_label, x.b_from, x.b_to],
    });

  await batchRun(stmts);
  await logEvent("import", null, null, { habits: habits.length, entries: entries.length });
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export interface Expense {
  id: number; date: string; name: string; amount: number;
  type: "expense" | "credit"; category: string; note: string | null; created_at: string;
}
export interface ExpenseBudget {
  id: number; month: string; category: string; amount: number;
}

const EXP_COLS = "id, date, name, amount, type, category, note, created_at";

export async function listExpenses(from: string, to: string): Promise<Expense[]> {
  return q<Expense>(
    `SELECT ${EXP_COLS} FROM expenses WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC`,
    [from, to]
  );
}

export async function createExpense(input: {
  date: string; name: string; amount: number;
  type?: "expense" | "credit"; category?: string; note?: string | null;
}): Promise<Expense> {
  const { lastId } = await run(
    "INSERT INTO expenses (date, name, amount, type, category, note) VALUES (?, ?, ?, ?, ?, ?)",
    [
      input.date, input.name.trim().slice(0, 120), Math.abs(input.amount),
      input.type ?? "expense", input.category ?? "Other", input.note ?? null,
    ]
  );
  return (await q1<Expense>(`SELECT ${EXP_COLS} FROM expenses WHERE id = ?`, [lastId]))!;
}

export async function updateExpense(id: number, input: Partial<{
  date: string; name: string; amount: number; type: string; category: string; note: string | null;
}>): Promise<Expense | null> {
  const allowed: Record<string, string> = {
    date: "date", name: "name", amount: "amount", type: "type", category: "category", note: "note",
  };
  const stmts: Array<{ sql: string; args: SqlVal[] }> = [];
  for (const [k, col] of Object.entries(allowed)) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined) stmts.push({ sql: `UPDATE expenses SET ${col} = ? WHERE id = ?`, args: [v as SqlVal, id] });
  }
  if (stmts.length) await batchRun(stmts);
  return q1<Expense>(`SELECT ${EXP_COLS} FROM expenses WHERE id = ?`, [id]);
}

export async function deleteExpense(id: number): Promise<boolean> {
  const { changes } = await run("DELETE FROM expenses WHERE id = ?", [id]);
  return changes > 0;
}

export async function listBudgets(month: string): Promise<ExpenseBudget[]> {
  return q<ExpenseBudget>(
    "SELECT id, month, category, amount FROM expense_budgets WHERE month = ? ORDER BY category",
    [month]
  );
}

export async function setBudget(month: string, category: string, amount: number): Promise<void> {
  await run(
    `INSERT INTO expense_budgets (month, category, amount) VALUES (?, ?, ?)
     ON CONFLICT(month, category) DO UPDATE SET amount = excluded.amount`,
    [month, category, amount]
  );
}

export async function deleteBudget(id: number): Promise<boolean> {
  const { changes } = await run("DELETE FROM expense_budgets WHERE id = ?", [id]);
  return changes > 0;
}

// ── Weekly Reviews ────────────────────────────────────────────────────────────

export async function listReviews(limit = 8): Promise<WeeklyReview[]> {
  return q<WeeklyReview>(
    "SELECT id, week_start, went_well, got_in_way, protect_time, created_at FROM weekly_reviews ORDER BY week_start DESC LIMIT ?",
    [Math.min(20, limit)]
  );
}

export async function getReview(weekStart: string): Promise<WeeklyReview | null> {
  return q1<WeeklyReview>(
    "SELECT id, week_start, went_well, got_in_way, protect_time, created_at FROM weekly_reviews WHERE week_start = ?",
    [weekStart]
  );
}

export async function upsertReview(
  weekStart: string, wentWell: string, gotInWay: string, protectTime: string
): Promise<WeeklyReview> {
  await run(
    `INSERT INTO weekly_reviews (week_start, went_well, got_in_way, protect_time)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(week_start) DO UPDATE SET
       went_well = excluded.went_well,
       got_in_way = excluded.got_in_way,
       protect_time = excluded.protect_time`,
    [weekStart, wentWell, gotInWay, protectTime]
  );
  return (await getReview(weekStart))!;
}
