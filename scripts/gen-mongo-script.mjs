/**
 * Generate a mongosh/Compass script from data/plan.tsv that inserts
 * one Goal + one Milestone per row into habit_ledger.
 *
 * Run:  node scripts/gen-mongo-script.mjs > data/import-dsa-prep.mongodb.js
 * Then paste the output into mongosh or Compass' "mongosh" tab.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = resolve(process.cwd(), "data/plan.tsv");
const GOAL_NAME = "DSA Prep";
const CATEGORY = "Learning";
const START_YEAR = 2026;

const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
const MIN_BY_DIFF = { easy: 20, medium: 30, hard: 45, review: 20 };
const pad = (n) => String(n).padStart(2, "0");

function parseDate(s, ctx) {
  const lower = String(s).toLowerCase().trim();
  let month = -1;
  for (const [k, v] of Object.entries(MONTHS)) { if (lower.includes(k)) { month = v; break; } }
  const day = lower.match(/\b(\d{1,2})\b/);
  if (month < 0 || !day) return null;
  if (ctx.lastMonth !== null && month < ctx.lastMonth) ctx.year += 1;
  ctx.lastMonth = month;
  return `${ctx.year}-${pad(month + 1)}-${pad(+day[1])}`;
}

const lines = readFileSync(SRC, "utf8").split(/\r?\n/);
const ctx = { year: START_YEAR, lastMonth: null };
const rows = [];
for (const line of lines) {
  if (!line.trim()) continue;
  const parts = line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/);
  const dateRaw = (parts[0] ?? "").trim();
  const task = parts.slice(1).join(" ").trim();
  if (!task) continue;
  if (/^date$/i.test(dateRaw) && /problem|task/i.test(task)) continue;
  const date = parseDate(dateRaw, ctx);
  if (!date) continue;
  let difficulty = "";
  const m = task.match(/[–-]\s*(Easy|Medium|Hard)\s*$/i);
  if (m) difficulty = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  else if (/review|wrap-?up/i.test(task)) difficulty = "Review";
  rows.push({ date, task, difficulty, minutes: MIN_BY_DIFF[difficulty.toLowerCase()] ?? 30 });
}

const first = rows[0].date, last = rows[rows.length - 1].date;
const days = new Set(rows.map((r) => r.date)).size;

const ms = rows.map((r, i) => ({
  goal_id: "__GOAL_ID__",
  title: r.task,
  explanation: r.difficulty ? `Difficulty: ${r.difficulty}` : "",
  estimated_duration: `${r.minutes} min`,
  order_index: i,
  dependencies: "[]",
  success_criteria: "",
  status: "pending",
  target_date: r.date,
  created_at: "__NOW__",
}));

const out = `// Auto-generated from data/plan.tsv — paste into mongosh (or Compass > mongosh tab).
// Creates goal "${GOAL_NAME}" + ${rows.length} milestones (${first} → ${last}, ${days} days).
use habit_ledger;

const now = new Date().toISOString();
const goalId = new ObjectId();

db.goals.insertOne({
  _id: goalId,
  name: ${JSON.stringify(GOAL_NAME)},
  description: ${JSON.stringify(`Imported study plan — ${rows.length} topics across ${days} days, ${first} to ${last}.`)},
  target_date: ${JSON.stringify(last)},
  category: ${JSON.stringify(CATEGORY)},
  priority: "high",
  timeframe: "custom",
  start_date: ${JSON.stringify(first)},
  status: "active",
  ai_context: "",
  eisenhower: "schedule",
  parent_id: null,
  created_at: now,
});

const milestones = ${JSON.stringify(ms, null, 2)}
  .map((m, i) => ({ ...m, goal_id: goalId.toString(), created_at: now }));

db.milestones.insertMany(milestones);

print("Inserted goal " + goalId.toString() + " with " + milestones.length + " milestones");
`;

process.stdout.write(out);
