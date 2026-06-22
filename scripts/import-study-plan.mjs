/**
 * Import a study plan (topics per day) into MongoDB as a Goal + Milestones.
 *
 * Each row of the source  ->  one Milestone whose target_date is that day.
 * All milestones are grouped under a single parent Goal.
 *
 * SOURCE FILE (you provide this):
 *   (a) .tsv / .txt : two columns "date <TAB> task". Difficulty is read from the
 *                     task suffix ("... – Medium"); review rows are tagged "Review".
 *   (b) .json       : array of objects with fields
 *                     date, task, section, difficulty, minutes, link, status
 *   (c) .xlsx/.xls/.csv : columns date, topic|task, difficulty (+ optional
 *                     section, minutes, link). Header names are aliased.
 *
 *   date accepts: "2026-06-23" | "Mon, Jun 23" | "Jun 23" | "23 Jun" | Excel serial.
 *   When the year is absent it is inferred (rolls forward when the month wraps).
 *
 * USAGE:
 *   node scripts/import-study-plan.mjs <file> [--goal "DSA Prep"] [--category Learning]
 *                                             [--start-year 2026] [--dry] [--fresh]
 *     --dry        Parse + print what WOULD be written. Writes nothing.
 *     --fresh      Delete an existing goal of the same name (+ its milestones) first.
 *     --goal NAME  Parent goal name        (default "DSA Prep")
 *     --category C Goal category           (default "Learning")
 *     --start-year Year for the first row when dates lack a year (default current year)
 *
 * Reads MONGODB_URI from .env.local automatically (same as the other scripts).
 */

import { MongoClient, ObjectId } from "mongodb";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";

const __dir = dirname(fileURLToPath(import.meta.url));

// ── CLI args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const OPTS_WITH_VALUE = ["--goal", "--category", "--start-year"];
const flag = (name) => argv.includes(`--${name}`);
function opt(name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
}
const filePath = argv.find((a, i) => !a.startsWith("--") && !OPTS_WITH_VALUE.includes(argv[i - 1]));
const DRY = flag("dry");
const FRESH = flag("fresh");
const GOAL_NAME = opt("goal", "DSA Prep");
const CATEGORY = opt("category", "Learning");
const START_YEAR = Number(opt("start-year", String(new Date().getFullYear())));

if (!filePath) {
  console.error("✗ No source file given.\n  e.g. node scripts/import-study-plan.mjs data/plan.tsv --dry");
  process.exit(1);
}
const absFile = resolve(process.cwd(), filePath);
if (!existsSync(absFile)) { console.error(`✗ File not found: ${absFile}`); process.exit(1); }

// ── Env ─────────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(__dir, "../.env.local");
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
}

// ── Date parsing ──────────────────────────────────────────────────────────────
const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
const pad = (n) => String(n).padStart(2, "0");

function parseDate(raw, ctx) {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
  if (typeof raw === "number") {
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(raw) : null;
    if (d && d.y) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;

  const lower = s.toLowerCase();
  let month = -1;
  for (const [k, v] of Object.entries(MONTHS)) { if (lower.includes(k)) { month = v; break; } }
  const dayMatch = lower.match(/\b(\d{1,2})\b/);
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  if (month < 0 || !dayMatch) return { error: s };

  const day = +dayMatch[1];
  let year;
  if (yearMatch) year = +yearMatch[1];
  else {
    if (ctx.lastMonth !== null && month < ctx.lastMonth) ctx.year += 1; // Dec -> Jan
    year = ctx.year;
  }
  ctx.lastMonth = month;
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// ── Column resolution (sheets) ────────────────────────────────────────────────
function pickCol(headers, aliases) {
  for (const a of aliases) { const h = headers.find((k) => k.toLowerCase().trim() === a); if (h) return h; }
  for (const a of aliases) { const h = headers.find((k) => k.toLowerCase().includes(a)); if (h) return h; }
  return null;
}

// ── Readers ───────────────────────────────────────────────────────────────────
// Each row: { date, topic, difficulty, section, minutes, link, srcStatus }
function readRows() {
  const f = absFile.toLowerCase();
  if (f.endsWith(".json")) return readJson();
  if (f.endsWith(".tsv") || f.endsWith(".txt")) return readText();
  return readSheet();
}

const MIN_BY_DIFF = { easy: 20, medium: 30, hard: 45, review: 20 };

function readText() {
  const lines = readFileSync(absFile, "utf8").split(/\r?\n/);
  const ctx = { year: START_YEAR, lastMonth: null };
  const rows = [], errors = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/);
    const dateRaw = (parts[0] ?? "").trim();
    const task = parts.slice(1).join(" ").trim();
    if (!task) continue;
    if (/^date$/i.test(dateRaw) && /problem|task/i.test(task)) continue; // header
    const parsed = parseDate(dateRaw, ctx);
    if (!parsed || parsed.error) { errors.push({ row: i + 1, date: dateRaw, topic: task }); continue; }
    let difficulty = "";
    const m = task.match(/[–-]\s*(Easy|Medium|Hard)\s*$/i);
    if (m) difficulty = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    else if (/review|wrap-?up/i.test(task)) difficulty = "Review";
    rows.push({
      date: parsed, topic: task, difficulty, section: "",
      minutes: MIN_BY_DIFF[difficulty.toLowerCase()] ?? 30, link: "", srcStatus: "",
    });
  }
  return { rows, errors, cols: { dateCol: "Date", topicCol: "Problem / Task", diffCol: "(from suffix)" } };
}

function readJson() {
  const arr = JSON.parse(readFileSync(absFile, "utf8"));
  if (!Array.isArray(arr)) throw new Error("JSON root must be an array of rows.");
  const ctx = { year: START_YEAR, lastMonth: null };
  const rows = [], errors = [];
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i];
    const topic = String(r.task ?? r.topic ?? r.title ?? r.name ?? "").trim();
    if (!topic) continue;
    const parsed = parseDate(r.date, ctx);
    if (!parsed || parsed.error) { errors.push({ row: i + 1, date: r.date, topic }); continue; }
    rows.push({
      date: parsed, topic,
      difficulty: String(r.difficulty ?? r.level ?? "").trim(),
      section: String(r.section ?? "").trim(),
      minutes: Number(r.minutes) || 0,
      link: String(r.link ?? "").trim(),
      srcStatus: String(r.status ?? "").trim(),
    });
  }
  return { rows, errors, cols: { dateCol: "date", topicCol: "task", diffCol: "difficulty" } };
}

function readSheet() {
  const wb = XLSX.readFile(absFile, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  if (json.length === 0) throw new Error("Sheet has no rows.");
  const headers = Object.keys(json[0]);
  const dateCol = pickCol(headers, ["date", "day"]);
  const topicCol = pickCol(headers, ["topic", "task", "name", "title", "subject", "problem"]);
  const diffCol = pickCol(headers, ["difficulty", "level", "diff"]);
  const sectCol = pickCol(headers, ["section", "category", "pattern"]);
  const minCol = pickCol(headers, ["minutes", "mins", "time"]);
  const linkCol = pickCol(headers, ["link", "url"]);
  if (!dateCol) throw new Error(`No date column found. Headers: ${headers.join(", ")}`);
  if (!topicCol) throw new Error(`No topic column found. Headers: ${headers.join(", ")}`);
  const ctx = { year: START_YEAR, lastMonth: null };
  const rows = [], errors = [];
  for (let i = 0; i < json.length; i++) {
    const r = json[i];
    const topic = String(r[topicCol] ?? "").trim();
    if (!topic) continue;
    const parsed = parseDate(r[dateCol], ctx);
    if (!parsed || parsed.error) { errors.push({ row: i + 2, date: r[dateCol], topic }); continue; }
    rows.push({
      date: parsed, topic,
      difficulty: diffCol ? String(r[diffCol] ?? "").trim() : "",
      section: sectCol ? String(r[sectCol] ?? "").trim() : "",
      minutes: minCol ? Number(r[minCol]) || 0 : 0,
      link: linkCol ? String(r[linkCol] ?? "").trim() : "",
      srcStatus: "",
    });
  }
  return { rows, errors, cols: { dateCol, topicCol, diffCol } };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const { rows, errors, cols } = readRows();

  console.log(`\nSource: ${filePath}`);
  console.log(`Columns -> date: "${cols.dateCol}"  topic: "${cols.topicCol}"  difficulty: ${cols.diffCol}`);
  console.log(`Parsed ${rows.length} rows${errors.length ? `, ${errors.length} unparseable` : ""}.`);
  if (errors.length) {
    console.log(`\n⚠ Could not parse the date on these rows (skipped):`);
    for (const e of errors.slice(0, 20)) console.log(`   row ${e.row}: date="${e.date}"  topic="${e.topic}"`);
    if (errors.length > 20) console.log(`   ...and ${errors.length - 20} more`);
  }
  if (rows.length === 0) { console.error("\n✗ Nothing to import."); process.exit(1); }

  const first = rows[0].date, last = rows[rows.length - 1].date;
  const days = new Set(rows.map((r) => r.date)).size;
  console.log(`\nGoal:       "${GOAL_NAME}"  (category ${CATEGORY})`);
  console.log(`Range:      ${first}  →  ${last}   (${days} distinct days)`);
  console.log(`Milestones: ${rows.length}`);
  console.log(`\nFirst 5:`);
  for (const r of rows.slice(0, 5)) console.log(`   ${r.date}  ${r.topic}`);
  console.log(`Last 5:`);
  for (const r of rows.slice(-5)) console.log(`   ${r.date}  ${r.topic}`);

  if (DRY) { console.log(`\n--dry: no database changes made. Re-run without --dry to write.`); return; }

  const env = loadEnv();
  const URI = env.MONGODB_URI || process.env.MONGODB_URI;
  if (!URI) { console.error("\n✗ MONGODB_URI not found in .env.local"); process.exit(1); }

  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db("habit_ledger");
  const goalsCol = db.collection("goals");
  const msCol = db.collection("milestones");

  const existing = await goalsCol.findOne({ name: GOAL_NAME });
  if (existing) {
    if (FRESH) {
      await msCol.deleteMany({ goal_id: existing._id.toString() });
      await goalsCol.deleteOne({ _id: existing._id });
      console.log(`\n(removed existing goal "${GOAL_NAME}" and its milestones — --fresh)`);
    } else {
      console.error(`\n✗ A goal named "${GOAL_NAME}" already exists. Use --fresh to replace, or --goal "Other name".`);
      await client.close();
      process.exit(1);
    }
  }

  const now = new Date().toISOString();
  const goalDoc = {
    _id: new ObjectId(),
    name: GOAL_NAME,
    description: `Imported study plan — ${rows.length} topics across ${days} days, ${first} to ${last}.`,
    target_date: last,
    category: CATEGORY,
    priority: "high",
    timeframe: "custom",
    start_date: first,
    status: "active",
    ai_context: "",
    eisenhower: "schedule",
    parent_id: null,
    created_at: now,
  };
  await goalsCol.insertOne(goalDoc);
  const goalId = goalDoc._id.toString();

  const mapStatus = (s) => {
    const t = (s || "").toLowerCase();
    if (t.includes("done") || t.includes("complete")) return "completed";
    if (t.includes("progress") || t.includes("active")) return "active";
    return "pending";
  };

  const msDocs = rows.map((r, i) => {
    const expl = [];
    if (r.section) expl.push(r.section);
    if (r.difficulty) expl.push(`Difficulty: ${r.difficulty}`);
    if (r.link) expl.push(r.link);
    return {
      _id: new ObjectId(),
      goal_id: goalId,
      title: r.topic,
      explanation: expl.join("\n"),
      estimated_duration: r.minutes ? `${r.minutes} min` : "1 day",
      order_index: i,
      dependencies: "[]",
      success_criteria: "",
      status: mapStatus(r.srcStatus),
      target_date: r.date,
      created_at: now,
    };
  });
  const res = await msCol.insertMany(msDocs);

  console.log(`\n✓ Created goal "${GOAL_NAME}" (${goalId})`);
  console.log(`✓ Inserted ${res.insertedCount} milestones into habit_ledger.milestones`);
  await client.close();
}

run().catch((e) => { console.error("\n✗", e.message); process.exit(1); });
