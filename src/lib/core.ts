// Shared types + pure logic (dates, scheduling, streaks, stats).
// No imports — safe for both server routes and client components.

// ---------------- Types ----------------

export type Frequency = "daily" | "weekdays" | "weekly" | "interval";
export type VerifyType = "manual" | "leetcode" | "github";
export type EntryStatus = "done" | "skipped";

export interface Habit {
  id: string;
  name: string;
  category: string;
  goal: number; // monthly target (daily habits); per-week target for weekly habits lives in times_per_week
  frequency_type: Frequency;
  weekdays: string; // CSV of 0-6 (0=Sun), used when frequency_type === 'weekdays'
  times_per_week: number; // used when frequency_type === 'weekly'
  quantity_target: number; // 0 = simple checkbox habit
  quantity_unit: string;
  verify_type: VerifyType;
  verify_config: string; // JSON: { username, repo? }
  goal_id: string | null;
  milestone_id: string | null;
  interval_days: number;        // used when frequency_type === 'interval' (e.g. 14 = every 2 weeks)
  position: number;
  archived: number;
  why: string; // one-line reason, e.g. "→ Razorpay backend interview"
  pause_until: string | null;  // YYYY-MM-DD: habit not scheduled on or before this date
}

export interface Entry {
  habit_id: string;
  date: string; // YYYY-MM-DD
  status: EntryStatus;
  quantity: number | null;
  note: string | null;
  source: string; // manual | api | leetcode | github | telegram | pomodoro
  duration_minutes: number | null;
  created_at: string;
}

export interface ContextDay {
  date: string;
  mood: number | null; // 1-5
  energy: number | null; // 1-5
  sleep_hours: number | null;
  notes: string | null;
}

export interface Todo {
  id: string;
  title: string;
  due_date: string | null;  // YYYY-MM-DD
  status: "pending" | "completed";
  created_at: string;
}

export type GoalStatus       = "active" | "completed" | "paused" | "stalled";
export type GoalPriority     = "low" | "medium" | "high";
export type GoalTimeframe    = "3m" | "6m" | "1y" | "3y" | "5y" | "custom";
export type MilestoneStatus  = "pending" | "active" | "completed";
export type EisenhowerQuadrant = "do" | "schedule" | "delegate" | "eliminate";

export interface Goal {
  id: string;
  name: string;
  description: string;
  target_date: string | null;
  parent_id: string | null;   // deprecated, kept for DB compat
  created_at: string | null;
  // new fields (default-valued in migrations)
  category: string;
  priority: GoalPriority;
  timeframe: GoalTimeframe;
  start_date: string | null;
  status: GoalStatus;
  ai_context: string;
  eisenhower: EisenhowerQuadrant | null;
}

export const EISENHOWER_QUADRANTS: {
  value: EisenhowerQuadrant;
  label: string;
  desc: string;
  pillCls: string;
  urgent: boolean;
  important: boolean;
}[] = [
  { value: "do",       label: "Do",       desc: "Urgent + Important",         pillCls: "red",    urgent: true,  important: true  },
  { value: "schedule", label: "Schedule", desc: "Not Urgent + Important",      pillCls: "accent", urgent: false, important: true  },
  { value: "delegate", label: "Delegate", desc: "Urgent + Not Important",      pillCls: "amber",  urgent: true,  important: false },
  { value: "eliminate",label: "Eliminate",desc: "Not Urgent + Not Important",  pillCls: "",       urgent: false, important: false },
];

export type DeadlineUrgency = "overdue" | "today" | "critical" | "soon" | "normal";

export function deadlineUrgency(
  targetDate: string | null,
  today: string
): { level: DeadlineUrgency; label: string; pillCls: string } | null {
  if (!targetDate) return null;
  const dl = Math.ceil((parseDate(targetDate).getTime() - parseDate(today).getTime()) / 86400000);
  if (dl < 0)   return { level: "overdue",  label: `${Math.abs(dl)}d overdue`, pillCls: "red"   };
  if (dl === 0) return { level: "today",    label: "Due today!",               pillCls: "red"   };
  if (dl <= 3)  return { level: "critical", label: `${dl}d left`,              pillCls: "red"   };
  if (dl <= 7)  return { level: "soon",     label: `${dl}d left`,              pillCls: "amber" };
  if (dl <= 30) return { level: "normal",   label: `${dl}d left`,              pillCls: ""      };
  return null;
}

export interface Milestone {
  id: string;
  goal_id: string;
  title: string;
  explanation: string;
  estimated_duration: string;
  order_index: number;
  dependencies: string;  // JSON: number[] of sibling order_index values
  success_criteria: string;
  status: MilestoneStatus;
  target_date: string | null;
  created_at: string;
}

// ── Goal planning helpers ──────────────────────────────────────────────────────

export const GOAL_TIMEFRAMES: { value: GoalTimeframe; label: string; months: number | null }[] = [
  { value: "3m",     label: "3 months",  months: 3 },
  { value: "6m",     label: "6 months",  months: 6 },
  { value: "1y",     label: "1 year",    months: 12 },
  { value: "3y",     label: "3 years",   months: 36 },
  { value: "5y",     label: "5 years",   months: 60 },
  { value: "custom", label: "Custom",    months: null },
];

export const GOAL_CATEGORIES = ["Career", "Finance", "Health", "Learning", "Personal", "Other"];

export function computeTargetDate(timeframe: GoalTimeframe, startDate: string): string | null {
  const tf = GOAL_TIMEFRAMES.find((t) => t.value === timeframe);
  if (!tf?.months) return null;
  const d = parseDate(startDate);
  d.setMonth(d.getMonth() + tf.months);
  return fmt(d);
}

// ── Progress engine ────────────────────────────────────────────────────────────

export function milestoneProgress(
  ms: Milestone,
  habits: Habit[],
  emap: Map<string, Entry>,
  today: string
): number {
  if (ms.status === "completed") return 100;
  const linked = habits.filter((h) => h.milestone_id === ms.id);
  if (linked.length === 0) return 0;
  const from = ms.target_date
    ? fmt(addDays(parseDate(ms.target_date), -90))
    : fmt(addDays(parseDate(today), -90));
  const from2 = from < today ? from : fmt(addDays(parseDate(today), -90));
  let done = 0, target = 0;
  for (const h of linked) {
    const s = statForRange(h, emap, from2, today);
    done += s.done;
    target += Math.max(1, s.target);
  }
  return target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
}

export function goalProgress(
  goal: Goal,
  milestones: Milestone[],
  habits: Habit[],
  emap: Map<string, Entry>,
  today: string
): number {
  const gMs = milestones.filter((m) => m.goal_id === goal.id);
  if (gMs.length === 0) return 0;
  const total = gMs.reduce((sum, ms) => sum + milestoneProgress(ms, habits, emap, today), 0);
  return Math.round(total / gMs.length);
}

export type GoalHealth = "great" | "good" | "at_risk" | "stalled";

export function goalHealth(
  goal: Goal,
  milestones: Milestone[],
  habits: Habit[],
  emap: Map<string, Entry>,
  entries: Entry[],
  today: string
): GoalHealth {
  if (goal.status === "stalled") return "stalled";

  const gMs = milestones.filter((m) => m.goal_id === goal.id);
  const linkedIds = new Set(habits.filter((h) => gMs.some((m) => m.id === h.milestone_id)).map((h) => h.id));

  // Stalled: no milestone habits or no completions in 7 days
  if (linkedIds.size === 0) return "stalled";
  const cutoff = fmt(addDays(parseDate(today), -7));
  const hasRecentActivity = entries.some((e) => e.date >= cutoff && e.status === "done" && linkedIds.has(e.habit_id));
  if (!hasRecentActivity) return "stalled";

  const pct = goalProgress(goal, milestones, habits, emap, today);

  // Compare against expected progress
  if (goal.start_date && goal.target_date) {
    const totalDays = Math.max(1, Math.ceil(
      (parseDate(goal.target_date).getTime() - parseDate(goal.start_date).getTime()) / 86400000
    ));
    const elapsed = Math.max(0, Math.ceil(
      (parseDate(today).getTime() - parseDate(goal.start_date).getTime()) / 86400000
    ));
    const expectedPct = Math.min(100, Math.round((elapsed / totalDays) * 100));
    if (pct >= expectedPct + 5) return "great";
    if (pct >= expectedPct - 15) return "good";
    return "at_risk";
  }

  return pct >= 75 ? "great" : pct >= 40 ? "good" : "at_risk";
}

export function isGoalStalled(
  goal: Goal,
  milestones: Milestone[],
  habits: Habit[],
  entries: Entry[],
  today: string
): boolean {
  if (goal.status !== "active") return false;
  const gMs = milestones.filter((m) => m.goal_id === goal.id);
  const linkedIds = new Set(habits.filter((h) => gMs.some((m) => m.id === h.milestone_id)).map((h) => h.id));
  if (linkedIds.size === 0) return true;
  const cutoff = fmt(addDays(parseDate(today), -7));
  return !entries.some((e) => e.date >= cutoff && e.status === "done" && linkedIds.has(e.habit_id));
}

/**
 * Returns true when a weekly habit MUST be completed today to hit its times_per_week target.
 * Logic: if (remaining completions needed) >= (days left in week including today), today is mandatory.
 */
export function isEscalatedToday(
  h: Habit,
  emap: Map<string, Entry>,
  today: string
): boolean {
  if (h.frequency_type !== "weekly") return false;
  const n = h.times_per_week;
  if (n <= 0) return false;
  const monday = weekKey(today);
  const wd = weekdayOf(today);               // 0=Sun, 1=Mon ... 6=Sat
  const daysLeftInWeek = 7 - ((wd + 6) % 7); // Mon→7, Tue→6, ... Sun→1
  let done = 0;
  for (const d of eachDay(monday, today)) {
    if (emap.get(ekey(h.id, d))?.status === "done") done++;
  }
  const remaining = n - done;
  return remaining > 0 && remaining >= daysLeftInWeek;
}

export interface WeeklyReview {
  id: string;
  week_start: string;   // YYYY-MM-DD (Monday)
  went_well: string;
  got_in_way: string;
  protect_time: string;
  created_at: string;
}

export interface Experiment {
  id: string;
  name: string;
  habit_id: string;
  a_label: string;
  a_from: string;
  a_to: string;
  b_label: string;
  b_from: string;
  b_to: string;
}

// ---------------- Date helpers ----------------

export const pad = (n: number) => String(n).padStart(2, "0");

export function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: string): Date {
  return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function localToday(): string {
  // Intl ensures correct IST date on Vercel (UTC) servers and locally
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function isLeap(y: number): boolean { return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0); }

export function daysInMonth(year: number, month0: number): number {
  return month0 === 1 && isLeap(year) ? 29 : DAYS_PER_MONTH[month0];
}

// Tomohiko Sakamoto's algorithm — no Date allocation.
const _SAK = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
export function weekdayOf(dateStr: string): number {
  let y = +dateStr.slice(0, 4);
  const m = +dateStr.slice(5, 7);
  const d = +dateStr.slice(8, 10);
  if (m < 3) y--;
  return (y + (y >> 2) - Math.floor(y / 100) + Math.floor(y / 400) + _SAK[m - 1] + d) % 7;
}

/** Monday-start week key, e.g. '2026-06-08' (the Monday of that week). No Date allocation. */
export function weekKey(dateStr: string): string {
  const shift = (weekdayOf(dateStr) + 6) % 7; // Mon=0
  if (shift === 0) return dateStr;
  let y = +dateStr.slice(0, 4);
  let m = +dateStr.slice(5, 7);
  let d = +dateStr.slice(8, 10) - shift;
  if (d < 1) { m--; if (m < 1) { m = 12; y--; } d += daysInMonth(y, m - 1); }
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Allocation-free generator: pure integer arithmetic, no Date objects per iteration.
export function* eachDay(from: string, to: string): Generator<string> {
  let y = +from.slice(0, 4), m = +from.slice(5, 7), d = +from.slice(8, 10);
  const ey = +to.slice(0, 4), em = +to.slice(5, 7), ed = +to.slice(8, 10);
  while (y < ey || (y === ey && (m < em || (m === em && d <= ed)))) {
    yield `${y}-${pad(m)}-${pad(d)}`;
    if (++d > daysInMonth(y, m - 1)) { d = 1; if (++m > 12) { m = 1; y++; } }
  }
}

// ---------------- Scheduling ----------------

// Fixed epoch used as reference for interval scheduling
const INTERVAL_EPOCH = "2024-01-01";
// Pre-computed ms — avoids a Date allocation on every isScheduled() call with interval type
const INTERVAL_EPOCH_MS = parseDate(INTERVAL_EPOCH).getTime();

export function isScheduled(h: Habit, dateStr: string): boolean {
  if (h.pause_until && dateStr <= h.pause_until) return false;
  if (h.frequency_type === "daily") return true;
  if (h.frequency_type === "weekly") return true; // any day counts toward weekly target
  if (h.frequency_type === "interval") {
    const diff = Math.round((parseDate(dateStr).getTime() - INTERVAL_EPOCH_MS) / 86400000);
    const n    = h.interval_days > 0 ? h.interval_days : 7;
    return diff >= 0 && diff % n === 0;
  }
  const set = h.weekdays
    ? h.weekdays.split(",").map((x) => Number(x.trim())).filter((x) => x >= 0 && x <= 6)
    : [];
  return set.includes(weekdayOf(dateStr));
}

/** How many completions this habit aims for inside [from, to]. */
export function targetInRange(h: Habit, from: string, to: string): number {
  let days = 0;
  let scheduled = 0;
  for (const d of eachDay(from, to)) {
    days++;
    if (h.frequency_type === "weekdays" && isScheduled(h, d)) scheduled++;
  }
  if (h.frequency_type === "daily") return Math.min(h.goal, days);
  if (h.frequency_type === "weekdays") return scheduled;
  if (h.frequency_type === "interval") return scheduled; // each occurrence = 1 target
  return Math.round((h.times_per_week * days) / 7); // weekly
}

export function monthRange(year: number, month0: number): { from: string; to: string } {
  return {
    from: `${year}-${pad(month0 + 1)}-01`,
    to: `${year}-${pad(month0 + 1)}-${pad(daysInMonth(year, month0))}`,
  };
}

// ---------------- Entry map ----------------

export const ekey = (habitId: string, date: string) => `${habitId}|${date}`;

export function buildEntryMap(entries: Entry[]): Map<string, Entry> {
  const m = new Map<string, Entry>();
  for (const e of entries) m.set(ekey(e.habit_id, e.date), e);
  return m;
}

// ---------------- Streak engine ----------------

export interface StreakInfo {
  current: number;
  longest: number;
  freezes: number; // banked streak-freezes (earned 1 per 7 consecutive, max 3)
  unit: "days" | "weeks";
}

const FREEZE_EVERY = 7;
const FREEZE_CAP = 3;

/**
 * Daily / weekday habits: walk scheduled days chronologically.
 * - done   -> streak grows; every 7 consecutive earns a freeze (cap 3)
 * - skipped-> neutral (pauses, never breaks)
 * - missed -> consumes a freeze if banked, otherwise resets
 * - today  -> never breaks the streak if still pending
 * Weekly habits: streak counts consecutive weeks hitting times_per_week;
 * the in-progress week is neutral until it's met.
 */
export function computeStreak(h: Habit, emap: Map<string, Entry>, today: string, startHint?: string): StreakInfo {
  if (h.frequency_type === "weekly") return weeklyStreak(h, emap, today);

  // If no hint, scan emap for this habit's earliest entry (O(E) — callers should pass hint when batching).
  let earliest = startHint ?? today;
  if (!startHint) {
    for (const k of emap.keys()) {
      const p = k.indexOf("|");
      if (k.slice(0, p) === h.id) { const date = k.slice(p + 1); if (date < earliest) earliest = date; }
    }
  }
  const start = earliest < today ? earliest : fmt(addDays(parseDate(today), -365));

  let current = 0;
  let longest = 0;
  let freezes = 0;
  let sinceEarn = 0;

  for (const d of eachDay(start, today)) {
    if (!isScheduled(h, d)) continue;
    const e = emap.get(ekey(h.id, d));
    if (e?.status === "done") {
      current++;
      sinceEarn++;
      if (sinceEarn % FREEZE_EVERY === 0 && freezes < FREEZE_CAP) freezes++;
    } else if (e?.status === "skipped") {
      continue; // pause
    } else if (d === today) {
      continue; // pending today
    } else if (freezes > 0) {
      freezes--; // consume a freeze, streak survives
    } else {
      current = 0;
      sinceEarn = 0;
    }
    if (current > longest) longest = current;
  }
  return { current, longest, freezes, unit: "days" };
}

function weeklyStreak(h: Habit, emap: Map<string, Entry>, today: string): StreakInfo {
  // Count done per week over the last 52 weeks.
  const perWeek = new Map<string, number>();
  const start = fmt(addDays(parseDate(today), -371));
  for (const d of eachDay(start, today)) {
    const e = emap.get(ekey(h.id, d));
    if (e?.status === "done") {
      const wk = weekKey(d);
      perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1);
    }
  }
  const thisWeek = weekKey(today);
  const weeks: string[] = [];
  let w = weekKey(start);
  while (w <= thisWeek) {
    weeks.push(w);
    w = fmt(addDays(parseDate(w), 7));
  }

  let current = 0;
  let longest = 0;
  let run = 0;
  for (const wk of weeks) {
    const met = (perWeek.get(wk) ?? 0) >= h.times_per_week;
    if (met) run++;
    else if (wk !== thisWeek) run = 0; // current week pending is neutral
    if (run > longest) longest = run;
  }
  // current = run ending at the latest met week (this week neutral if unmet)
  current = run;
  return { current, longest, freezes: 0, unit: "weeks" };
}

/** Compute streaks for all habits in one pass (O(E) emap scan instead of O(H×E)). */
export function computeStreakBatch(habits: Habit[], emap: Map<string, Entry>, today: string): Map<string, StreakInfo> {
  const earliest = new Map<string, string>();
  for (const k of emap.keys()) {
    const p = k.indexOf("|");
    const id = k.slice(0, p);
    const date = k.slice(p + 1);
    const prev = earliest.get(id);
    if (!prev || date < prev) earliest.set(id, date);
  }
  const result = new Map<string, StreakInfo>();
  for (const h of habits) result.set(h.id, computeStreak(h, emap, today, earliest.get(h.id)));
  return result;
}

// ---------------- Stats ----------------

export interface RangeStat {
  done: number;
  skipped: number;
  scheduled: number;
  target: number;
  pct: number; // done / target
}

export function statForRange(h: Habit, emap: Map<string, Entry>, from: string, to: string): RangeStat {
  let done = 0;
  let skipped = 0;
  let scheduled = 0;
  for (const d of eachDay(from, to)) {
    if (!isScheduled(h, d)) continue;
    scheduled++;
    const e = emap.get(ekey(h.id, d));
    if (e?.status === "done") done++;
    else if (e?.status === "skipped") skipped++;
  }
  const rawTarget = targetInRange(h, from, to);
  const target = Math.max(1, rawTarget);
  const effectiveTarget = Math.max(1, rawTarget - skippedReduction(h, skipped));
  const pct = Math.min(100, Math.round((done / effectiveTarget) * 100));
  return { done, skipped, scheduled, target, pct };
}

/** Skipped days shrink the effective target for daily/weekday habits (sick days shouldn't tank the month). */
function skippedReduction(h: Habit, skipped: number): number {
  return h.frequency_type === "weekly" ? 0 : skipped;
}

export function gradeOf(pct: number): string {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 45) return "D";
  return "F";
}

/** Per-weekday completion rate for a habit over a range. Returns [ {sched, done} x7 ] (index = JS weekday). */
export function weekdayMatrix(h: Habit, emap: Map<string, Entry>, from: string, to: string) {
  const rows = Array.from({ length: 7 }, () => ({ sched: 0, done: 0 }));
  for (const d of eachDay(from, to)) {
    if (!isScheduled(h, d)) continue;
    const wd = weekdayOf(d);
    rows[wd].sched++;
    if (emap.get(ekey(h.id, d))?.status === "done") rows[wd].done++;
  }
  return rows;
}

/** P(B done | A done) - P(B done), over days both scheduled. */
export function pairLift(
  a: Habit,
  b: Habit,
  emap: Map<string, Entry>,
  from: string,
  to: string
): { lift: number; baseB: number; condB: number; n: number } | null {
  let both = 0;
  let aDone = 0;
  let bDone = 0;
  let n = 0;
  for (const d of eachDay(from, to)) {
    if (d > localToday()) break;
    if (!isScheduled(a, d) || !isScheduled(b, d)) continue;
    n++;
    const da = emap.get(ekey(a.id, d))?.status === "done";
    const db = emap.get(ekey(b.id, d))?.status === "done";
    if (da) aDone++;
    if (db) bDone++;
    if (da && db) both++;
  }
  if (n < 14 || aDone < 5) return null; // not enough signal
  const baseB = bDone / n;
  const condB = both / aDone;
  return { lift: condB - baseB, baseB, condB, n };
}

/** Overall completion on days matching a context predicate vs not. */
export function contextSplit(
  habits: Habit[],
  emap: Map<string, Entry>,
  ctx: ContextDay[],
  pred: (c: ContextDay) => boolean
): { withPct: number; withoutPct: number; withN: number; withoutN: number } | null {
  let wDone = 0, wSched = 0, oDone = 0, oSched = 0, withN = 0, withoutN = 0;
  for (const c of ctx) {
    const match = pred(c);
    let sched = 0, done = 0;
    for (const h of habits) {
      if (!isScheduled(h, c.date)) continue;
      sched++;
      if (emap.get(ekey(h.id, c.date))?.status === "done") done++;
    }
    if (sched === 0) continue;
    if (match) { wDone += done; wSched += sched; withN++; }
    else { oDone += done; oSched += sched; withoutN++; }
  }
  if (withN < 3 || withoutN < 3) return null;
  return {
    withPct: Math.round((wDone / Math.max(1, wSched)) * 100),
    withoutPct: Math.round((oDone / Math.max(1, oSched)) * 100),
    withN,
    withoutN,
  };
}

// ---------------- Badges ----------------

export interface Badge {
  id: string;
  label: string;
  desc: string;
  earned: boolean;
}

export function computeBadges(
  habits: Habit[],
  emap: Map<string, Entry>,
  streaks: Map<string, StreakInfo>,
  allEntries: Entry[]
): Badge[] {
  const totalDone = allEntries.filter((e) => e.status === "done").length;
  const bestCurrent = Math.max(0, ...[...streaks.values()].map((s) => s.current));
  const bestEver = Math.max(0, ...[...streaks.values()].map((s) => s.longest));

  // Perfect day: some day where every scheduled habit was done.
  const byDate = new Map<string, Entry[]>();
  for (const e of allEntries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }
  let perfectDay = false;
  let perfectDays = 0;
  for (const [date] of byDate) {
    const sched = habits.filter((h) => isScheduled(h, date));
    if (sched.length === 0) continue;
    if (sched.every((h) => emap.get(ekey(h.id, date))?.status === "done")) {
      perfectDay = true;
      perfectDays++;
    }
  }

  return [
    { id: "streak7", label: "One Week", desc: "7-day streak on any habit", earned: bestCurrent >= 7 || bestEver >= 7 },
    { id: "streak30", label: "One Month", desc: "30-day streak on any habit", earned: bestEver >= 30 },
    { id: "streak100", label: "Century", desc: "100-day streak on any habit", earned: bestEver >= 100 },
    { id: "done100", label: "100 Club", desc: "100 total completions", earned: totalDone >= 100 },
    { id: "done500", label: "500 Club", desc: "500 total completions", earned: totalDone >= 500 },
    { id: "perfect1", label: "Perfect Day", desc: "Every scheduled habit done in one day", earned: perfectDay },
    { id: "perfect7", label: "Perfect Week", desc: "7 perfect days total", earned: perfectDays >= 7 },
  ];
}

// ---------------- Risk ----------------

/** Habits scheduled today, not yet done, with weak history on this weekday. */
export function atRiskToday(
  habits: Habit[],
  emap: Map<string, Entry>,
  today: string,
  lookbackFrom: string
): Array<{ habit: Habit; rate: number; samples: number }> {
  const wd = weekdayOf(today);
  const out: Array<{ habit: Habit; rate: number; samples: number }> = [];
  for (const h of habits) {
    if (!isScheduled(h, today)) continue;
    const e = emap.get(ekey(h.id, today));
    if (e?.status) continue; // already done or intentionally skipped
    const m = weekdayMatrix(h, emap, lookbackFrom, fmt(addDays(parseDate(today), -1)));
    const { sched, done } = m[wd];
    if (sched < 3) continue;
    const rate = done / sched;
    if (rate < 0.5) out.push({ habit: h, rate: Math.round(rate * 100), samples: sched });
  }
  return out.sort((a, b) => a.rate - b.rate);
}

// ---------------- Trend ----------------

export function weeklyTrend(
  habits: Habit[],
  emap: Map<string, Entry>,
  today: string,
  weeks = 12
): Array<{ week: string; pct: number }> {
  const out: Array<{ week: string; pct: number }> = [];
  const thisMon = parseDate(weekKey(today));
  for (let i = weeks - 1; i >= 0; i--) {
    const from = fmt(addDays(thisMon, -7 * i));
    const to = fmt(addDays(parseDate(from), 6));
    let done = 0;
    let target = 0;
    for (const h of habits) {
      const s = statForRange(h, emap, from, to > today ? today : to);
      done += s.done;
      target += Math.max(0, targetInRange(h, from, to > today ? today : to) - s.skipped);
    }
    out.push({ week: from.slice(5), pct: target > 0 ? Math.round((done / target) * 100) : 0 });
  }
  return out;
}

// ---------------- Category color (deterministic, no table needed) ----------------

const CAT_COLORS = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0d9488", "#be185d"];

export function categoryColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CAT_COLORS[h % CAT_COLORS.length];
}
