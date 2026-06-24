"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/AppDataProvider";
import Link from "next/link";
import {
  Habit, Entry, Goal, Milestone, Todo, WeeklyReview, buildEntryMap, ekey, isScheduled, localToday,
  computeStreakBatch, statForRange, monthRange, weeklyTrend, computeBadges,
  fmt, addDays, parseDate, categoryColor, gradeOf, StreakInfo, eachDay, weekdayOf, weekKey,
  goalProgress, goalHealth, GoalHealth, computeEffectiveDay, computeDSABacklog,
} from "@/lib/core";
import { jget, jsend } from "@/lib/client";

// ─── sub-components ────────────────────────────────────────────────────────

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const CATS = ["General", "Learning", "Health", "Finance", "Routine"];

// Returns how many sub-checkboxes a habit should show (0 = none).
// DSA habits are excluded here — they use milestones instead.
function habitSubCount(h: Habit): number {
  if (/dsa/i.test(h.name)) return 0;
  if (h.quantity_target > 1) return Math.min(h.quantity_target, 15);
  const m = h.name.match(/\b([2-9]|1[0-5])\b/);
  return m ? parseInt(m[1]) : 0;
}

function levelCls(r: number) {
  if (r >= 0.95) return "h4";
  if (r >= 0.7)  return "h3";
  if (r >= 0.4)  return "h2";
  if (r > 0)     return "h1";
  return "h0";
}

const OverallHeat = memo(function OverallHeat({ habits, emap, today }: { habits: Habit[]; emap: Map<string, Entry>; today: string }) {
  const from  = fmt(addDays(parseDate(today), -181));
  const allDays = useMemo(() => [...eachDay(from, today)], [from, today]);
  const lead  = weekdayOf(from);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...allDays];
  const cols: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));

  return (
    <div className="heat-scroll">
      <div style={{ display: "flex", gap: 3 }}>
        {cols.map((col, ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {Array.from({ length: 7 }, (_, di) => {
              const d = col[di];
              if (!d) return <div key={di} className="heat-cell" style={{ visibility: "hidden" }} />;
              let done = 0, sched = 0;
              for (const h of habits) {
                if (!isScheduled(h, d)) continue;
                const e = emap.get(ekey(h.id, d));
                if (e?.status === "skipped") continue;
                sched++;
                if (e?.status === "done") done++;
              }
              const cls = sched === 0 ? "h0" : levelCls(done / sched);
              const tip = sched === 0 ? d : `${d} · ${done}/${sched} habits`;
              return <div key={di} className={`heat-cell ${cls}`} title={tip} style={sched === 0 ? { opacity: 0.35 } : undefined} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

const TrendChart = memo(function TrendChart({ data }: { data: Array<{ week: string; pct: number }> }) {
  const W = 520, H = 90, P = 18;
  if (data.length === 0) return <div className="muted small">No data yet.</div>;
  const step = (W - P * 2) / Math.max(1, data.length - 1);
  const y = (p: number) => H - P - (p / 100) * (H - P * 2);
  const pts = data.map((d, i) => `${P + i * step},${y(d.pct)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly completion trend">
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={P} x2={W - P} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeWidth="1" />
          <text x={2} y={y(g) + 3} fontSize="9" fill="var(--faint)">{g}</text>
        </g>
      ))}
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={i} cx={P + i * step} cy={y(d.pct)} r="2.5" fill="var(--accent)">
          <title>{d.week}: {d.pct}%</title>
        </circle>
      ))}
    </svg>
  );
});

// ─── Intention banner ──────────────────────────────────────────────────────

function IntentionBanner({
  goals, habits, emap, today,
}: {
  goals: Goal[];
  habits: Habit[];
  emap: Map<string, Entry>;
  today: string;
}) {
  const STORAGE_KEY = `hl_banner_dismissed_${today}`;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(!!localStorage.getItem(STORAGE_KEY));
  }, [STORAGE_KEY]);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  }

  // Find most urgent milestone: smallest positive days-left, has linked habits
  const milestones = goals.filter((g) => g.parent_id !== null && g.target_date);
  const urgent = milestones
    .map((g) => {
      const dl = Math.ceil((parseDate(g.target_date!).getTime() - parseDate(today).getTime()) / 86400000);
      const linked = habits.filter((h) => h.goal_id === g.id);
      return { g, dl, linked };
    })
    .filter((x) => x.dl >= 0 && x.linked.length > 0)
    .sort((a, b) => a.dl - b.dl)[0];

  // Today's pending habits
  const todayScheduled = habits.filter((h) => isScheduled(h, today));
  const todayDone      = todayScheduled.filter((h) => emap.get(ekey(h.id, today))?.status === "done");
  const todayPending   = todayScheduled.filter((h) => !emap.get(ekey(h.id, today))?.status);

  const allDoneToday = todayPending.length === 0 && todayScheduled.length > 0;

  if (dismissed) return null;
  if (!urgent && todayScheduled.length === 0) return null;

  if (allDoneToday) {
    return (
      <div className="intention-banner success">
        <span className="intention-icon">🎯</span>
        <div className="intention-body">
          <strong>All done today!</strong> {todayDone.length}/{todayScheduled.length} habits complete.
          {urgent && <span className="muted small"> Working toward: {urgent.g.name} · {urgent.dl}d left.</span>}
        </div>
        <button className="intention-close" onClick={dismiss} title="Dismiss">×</button>
      </div>
    );
  }

  return (
    <div className="intention-banner">
      <span className="intention-icon">🎯</span>
      <div className="intention-body">
        {urgent ? (
          <>
            <strong>{urgent.g.name}</strong>
            <span className="intention-days"> · {urgent.dl} day{urgent.dl !== 1 ? "s" : ""} left</span>
          </>
        ) : (
          <strong>Today's habits</strong>
        )}
        {todayPending.length > 0 && (
          <div className="intention-pending">
            Still to do: {todayPending.slice(0, 3).map((h) => h.name).join(", ")}
            {todayPending.length > 3 ? ` +${todayPending.length - 3} more` : ""}
          </div>
        )}
      </div>
      <button className="intention-close" onClick={dismiss} title="Dismiss for today">×</button>
    </div>
  );
}

// ─── add-habit form state type ─────────────────────────────────────────────

interface AddForm {
  name: string;
  category: string;
  frequency_type: "daily" | "weekdays" | "weekly";
  weekdays: string[];   // e.g. ["1","2","3","4","5"]
  times_per_week: number;
  goal: number;
}

const blankForm = (): AddForm => ({
  name: "", category: "General", frequency_type: "daily",
  weekdays: [], times_per_week: 3, goal: 30,
});

// ─── page ──────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const today  = localToday();
  const yearAgo = fmt(addDays(parseDate(today), -365));

  const { habits: allHabits, goals, milestones, setMilestones, appLoading, refresh: refreshData } = useAppData();
  const habits = allHabits.filter(h => !h.archived);

  const [entries,      setEntries]      = useState<Entry[]>([]);
  const [lastReview,   setLastReview]   = useState<WeeklyReview | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [err,          setErr]          = useState("");
  const loading = appLoading || entriesLoading;

  // add-habit panel
  const [showAdd, setShowAdd] = useState(false);
  const [af,      setAf]      = useState<AddForm>(blankForm());
  const [addErr,  setAddErr]  = useState("");
  const [addOk,   setAddOk]   = useState("");

  // todos
  const [todos,       setTodos]       = useState<Todo[]>([]);
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [todoTitle,   setTodoTitle]   = useState("");
  const [todoDue,     setTodoDue]     = useState("");

  useEffect(() => {
    jget<Todo[]>("/api/todos").then(t => setTodos(t ?? [])).catch(() => {});
  }, []);

  async function addTodo() {
    if (!todoTitle.trim()) return;
    const t = await jsend<Todo>("/api/todos", "POST", { title: todoTitle.trim(), due_date: todoDue || null });
    if (t) setTodos(prev => [...prev, t]);
    setTodoTitle(""); setTodoDue(""); setShowAddTodo(false);
  }

  async function toggleTodo(todo: Todo) {
    const next = todo.status === "completed" ? "pending" : "completed";
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: next } : t));
    await jsend(`/api/todos/${todo.id}`, "PATCH", { status: next });
  }

  async function removeTodo(id: string) {
    setTodos(prev => prev.filter(t => t.id !== id));
    await jsend(`/api/todos/${id}`, "DELETE", {});
  }

  const load = useCallback(async () => {
    setEntriesLoading(true); setErr("");
    try {
      const lastMonday = fmt(addDays(parseDate(weekKey(today)), -7));
      const [e, rv] = await Promise.all([
        jget<Entry[]>(`/api/entries?from=${yearAgo}&to=${today}`),
        jget<WeeklyReview | null>(`/api/reviews?week=${lastMonday}`),
      ]);
      setEntries(e);
      setLastReview(rv ?? null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't load."); }
    setEntriesLoading(false);
  }, [today, yearAgo]);

  useEffect(() => { load(); }, [load]);

  const emap = useMemo(() => buildEntryMap(entries), [entries]);

  const streaks = useMemo(() => computeStreakBatch(habits, emap, today), [habits, emap, today]);

  const now  = new Date();
  const { from: mFrom } = monthRange(now.getFullYear(), now.getMonth());

  const monthStat = useMemo(() => {
    let done = 0, target = 0;
    for (const h of habits) {
      const s = statForRange(h, emap, mFrom, today);
      done   += s.done;
      target += Math.max(1, s.target - s.skipped);
    }
    return { done, target, pct: target ? Math.round((done / target) * 100) : 0 };
  }, [habits, emap, mFrom, today]);

  const todayList = useMemo(() => habits.filter((h) => isScheduled(h, today)), [habits, today]);
  const todayDone = todayList.filter((h) => emap.get(ekey(h.id, today))?.status === "done").length;

  const trend  = useMemo(() => weeklyTrend(habits, emap, today, 12), [habits, emap, today]);
  const badges = useMemo(() => computeBadges(habits, emap, streaks, entries), [habits, emap, streaks, entries]);

  const bestStreak = useMemo(() => {
    let best: { h: Habit; s: StreakInfo } | null = null;
    for (const h of habits) {
      const s = streaks.get(h.id)!;
      if (!best || s.current > best.s.current) best = { h, s };
    }
    return best && best.s.current > 0 ? best : null;
  }, [habits, streaks]);

  const totalFreezes = useMemo(
    () => [...streaks.values()].reduce((a, s) => a + s.freezes, 0),
    [streaks]
  );

  const [markingAll, setMarkingAll] = useState(false);

  // Today's milestones (DSA problems scheduled for today)
  const todayMs = useMemo(() => computeEffectiveDay(milestones, today), [milestones, today]);

  const [expandedHabits, setExpandedHabits] = useState<Set<string>>(new Set());
  function toggleExpand(id: string) {
    setExpandedHabits(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Per-habit sub-task completion stored in localStorage, keyed by habit+date.
  const [subTasks, setSubTasks] = useState<Map<string, boolean[]>>(new Map());

  useEffect(() => {
    const init = new Map<string, boolean[]>();
    for (const h of todayList) {
      const n = habitSubCount(h);
      if (n < 2) continue;
      try {
        const raw = localStorage.getItem(`hl_sub_${h.id}_${today}`);
        init.set(h.id, raw ? JSON.parse(raw) : Array(n).fill(false));
      } catch {
        init.set(h.id, Array(n).fill(false));
      }
    }
    setSubTasks(init);
  }, [todayList, today]);

  async function toggleSubTask(h: Habit, idx: number) {
    const n = habitSubCount(h);
    const current = subTasks.get(h.id) ?? Array(n).fill(false);
    const updated = [...current];
    updated[idx] = !updated[idx];
    try { localStorage.setItem(`hl_sub_${h.id}_${today}`, JSON.stringify(updated)); } catch {}
    setSubTasks(prev => new Map(prev).set(h.id, updated));
    if (updated.every(Boolean) && emap.get(ekey(h.id, today))?.status !== "done") {
      setEntries(prev => {
        const rest = prev.filter(e => !(e.habit_id === h.id && e.date === today));
        return [...rest, { habit_id: h.id, date: today, status: "done", quantity: n, note: null, source: "manual", duration_minutes: null, created_at: new Date().toISOString() }];
      });
      jsend("/api/entries/set", "POST", { habitId: h.id, date: today, status: "done", quantity: n }).catch(() => {});
    }
  }

  async function toggleMilestone(ms: Milestone) {
    const next = ms.status === "completed" ? "pending" : "completed";
    const updatedMs = milestones.map(x => x.id === ms.id ? { ...x, status: next as Milestone["status"] } : x);
    setMilestones(updatedMs);
    try {
      await jsend(`/api/milestones/${ms.id}`, "PATCH", { status: next });
      // Auto-tick DSA habit when all today's problems are checked off
      if (next === "completed") {
        const todayMsUpdated = computeEffectiveDay(updatedMs, today);
        const allDone = todayMsUpdated.length > 0 && todayMsUpdated.every(m => m.status === "completed");
        if (allDone) {
          const dsaHabit = todayList.find(h => /dsa/i.test(h.name));
          if (dsaHabit && emap.get(ekey(dsaHabit.id, today))?.status !== "done") {
            setEntries(prev => {
              const rest = prev.filter(e => !(e.habit_id === dsaHabit.id && e.date === today));
              return [...rest, { habit_id: dsaHabit.id, date: today, status: "done", quantity: null, note: null, source: "manual", duration_minutes: null, created_at: new Date().toISOString() }];
            });
            jsend("/api/entries/set", "POST", { habitId: dsaHabit.id, date: today, status: "done", quantity: null }).catch(() => {});
          }
        }
      }
    } catch {
      setMilestones(prev => prev.map(x => x.id === ms.id ? { ...x, status: ms.status } : x));
    }
  }

  // MITs
  const [mitIds, setMitIds] = useState<string[]>([]);
  const [mitPicker, setMitPicker] = useState(false);

  useEffect(() => {
    jget<string[]>(`/api/mits?date=${today}`).then(setMitIds).catch(() => {});
  }, [today]);

  async function saveMits(ids: string[]) {
    setMitIds(ids);
    await jsend("/api/mits", "POST", { date: today, mit_ids: ids }).catch(() => {});
  }

  function toggleMit(id: string) {
    if (mitIds.includes(id)) { saveMits(mitIds.filter(x => x !== id)); }
    else if (mitIds.length < 3) { saveMits([...mitIds, id]); }
  }

  async function markAllDone() {
    setMarkingAll(true);
    const pending = todayList.filter((h) => {
      const e = emap.get(ekey(h.id, today));
      return h.verify_type === "manual" && (!e || e.status !== "done");
    });
    // Optimistic
    setEntries((prev) => {
      const rest = prev.filter((e) => !pending.some((h) => h.id === e.habit_id && e.date === today));
      return [...rest, ...pending.map((h) => ({
        habit_id: h.id, date: today, status: "done" as const,
        quantity: null, note: null, source: "manual" as const, duration_minutes: null, created_at: new Date().toISOString(),
      }))];
    });
    try {
      await Promise.all(pending.map((h) => jsend("/api/entries/set", "POST", { habitId: h.id, date: today, status: "done", quantity: null })));
    } catch (e) {
      setEntries(await jget<Entry[]>(`/api/entries?from=${yearAgo}&to=${today}`));
      alert(e instanceof Error ? e.message : "Failed.");
    }
    setMarkingAll(false);
  }

  async function quickToggle(h: Habit) {
    const cur  = emap.get(ekey(h.id, today));
    const next = cur?.status === "done" ? null : "done";
    let quantity: number | null = null;
    if (next === "done" && h.quantity_target > 0) {
      const v = prompt(`${h.name} — how many ${h.quantity_unit || "units"}? (target ${h.quantity_target})`, String(h.quantity_target));
      if (v === null) return;
      quantity = Number(v) || 0;
    }

    // Optimistic update — show the change instantly
    setEntries((prev) => {
      const rest = prev.filter((e) => !(e.habit_id === h.id && e.date === today));
      if (next === null) return rest;
      return [...rest, { habit_id: h.id, date: today, status: "done", quantity, note: cur?.note ?? null, source: "manual", duration_minutes: null, created_at: new Date().toISOString() }];
    });

    try {
      await jsend("/api/entries/set", "POST", { habitId: h.id, date: today, status: next, quantity });
    } catch (e) {
      // Roll back on failure
      setEntries(await jget<Entry[]>(`/api/entries?from=${yearAgo}&to=${today}`));
      alert(e instanceof Error ? e.message : "Failed.");
    }
  }

  async function submitAddHabit() {
    if (!af.name.trim()) { setAddErr("Habit name is required."); return; }
    setAddErr("");
    try {
      await jsend("/api/habits", "POST", {
        name:            af.name.trim(),
        category:        af.category,
        frequency_type:  af.frequency_type,
        weekdays:        af.weekdays.join(","),
        times_per_week:  af.times_per_week,
        goal:            af.goal,
      });
      setAf(blankForm());
      setShowAdd(false);
      setAddOk(`"${af.name.trim()}" added!`);
      setTimeout(() => setAddOk(""), 3000);
      await Promise.all([refreshData(), load()]);
    } catch (e) { setAddErr(e instanceof Error ? e.message : "Failed to add habit."); }
  }

  function toggleWD(i: string) {
    setAf((f) => ({
      ...f,
      weekdays: f.weekdays.includes(i) ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i].sort(),
    }));
  }

  if (loading) return <div className="state-note">Loading…</div>;
  if (err)     return <div className="state-note">{err}</div>;

  const dateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // Monday reminder: show last week's commitment on Mondays
  const isMonday = new Date().getDay() === 1;

  return (
    <>
      {/* ── Daily intention banner ── */}
      <IntentionBanner goals={goals} habits={habits} emap={emap} today={today} />

      {/* ── Monday reminder ── */}
      {isMonday && lastReview?.protect_time && (
        <div className="monday-reminder">
          <span className="monday-icon">📌</span>
          <div>
            <span className="monday-label">Last week you committed to protect time for:</span>
            <span className="monday-commitment"> {lastReview.protect_time}</span>
          </div>
          <Link href="/review" className="monday-link">This week's review →</Link>
        </div>
      )}

      {/* ── Header with inline stats ── */}
      <div className="page-head spread">
        <div>
          <h1>Dashboard</h1>
          <div className="dash-meta">
            <span className="muted">{dateStr}</span>
            <span className="dash-dot">·</span>
            <span className="num">{monthStat.pct}%</span>
            <span className="pill accent" style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4 }}>{gradeOf(monthStat.pct)}</span>
            <span className="dash-dot">·</span>
            <span className="num">{todayDone}/{todayList.length}</span>
            <span className="muted small">today</span>
            <span className="dash-dot">·</span>
            <span className="num">{bestStreak ? bestStreak.s.current : 0}
              <span className="muted" style={{ fontWeight: 400 }}>{bestStreak?.s.unit === "weeks" ? "w" : "d"}</span>
            </span>
            <span className="muted small">streak</span>
            {totalFreezes > 0 && (
              <>
                <span className="dash-dot">·</span>
                <span className="faint small">❄ {totalFreezes}</span>
              </>
            )}
          </div>
        </div>
        <div className="row">
          {addOk && <span className="ok-text" style={{ margin: 0 }}>{addOk}</span>}
          <button
            className={showAdd ? "btn btn-sm" : "btn btn-sm btn-primary"}
            onClick={() => { setShowAdd(s => !s); setShowAddTodo(false); setAddErr(""); }}
          >
            {showAdd ? "Cancel" : "+ Habit"}
          </button>
          <button
            className={showAddTodo ? "btn btn-sm" : "btn btn-sm btn-primary"}
            onClick={() => { setShowAddTodo(s => !s); setShowAdd(false); }}
          >
            {showAddTodo ? "Cancel" : "+ To-do"}
          </button>
          <Link href="/tracker" className="btn btn-sm" style={{ textDecoration: "none" }}>
            Open tracker
          </Link>
        </div>
      </div>

      {/* ── Add habit panel ── */}
      {showAdd && (
        <div className="card section">
          <div className="section-title">New habit</div>
          <div className="form-row">
            <label className="field" style={{ flex: "2 1 200px" }}>
              <span className="label">Habit name</span>
              <input
                className="input"
                placeholder="e.g. Read 20 pages"
                value={af.name}
                autoFocus
                onChange={(e) => setAf({ ...af, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") submitAddHabit(); }}
              />
            </label>
            <label className="field">
              <span className="label">Category</span>
              <select className="select" value={af.category} onChange={(e) => setAf({ ...af, category: e.target.value })}>
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="label">Frequency</span>
              <select
                className="select"
                value={af.frequency_type}
                onChange={(e) => setAf({ ...af, frequency_type: e.target.value as AddForm["frequency_type"], weekdays: [] })}
              >
                <option value="daily">Every day</option>
                <option value="weekdays">Specific days</option>
                <option value="weekly">X times per week</option>
              </select>
            </label>
          </div>

          {af.frequency_type === "weekdays" && (
            <div className="field">
              <span className="label">Which days?</span>
              <div className="row" style={{ gap: 6 }}>
                {WD.map((w, i) => (
                  <button
                    key={w} type="button"
                    className={`pill${af.weekdays.includes(String(i)) ? " accent" : ""}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => toggleWD(String(i))}
                  >{w}</button>
                ))}
              </div>
            </div>
          )}

          {af.frequency_type === "weekly" && (
            <div className="form-row">
              <label className="field" style={{ maxWidth: 200 }}>
                <span className="label">Times per week</span>
                <input
                  className="input" type="number" min={1} max={7}
                  value={af.times_per_week}
                  onChange={(e) => setAf({ ...af, times_per_week: Number(e.target.value) })}
                />
              </label>
            </div>
          )}

          <div className="form-row" style={{ alignItems: "center" }}>
            <label className="field" style={{ maxWidth: 180 }}>
              <span className="label">Monthly goal (days)</span>
              <input
                className="input" type="number" min={1} max={31}
                value={af.goal}
                onChange={(e) => setAf({ ...af, goal: Number(e.target.value) })}
              />
            </label>
            <div style={{ alignSelf: "end", display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={submitAddHabit}>Add habit</button>
              <button className="btn btn-sm" onClick={() => { setShowAdd(false); setAf(blankForm()); setAddErr(""); }}>Cancel</button>
            </div>
            {addErr && <span className="error-text" style={{ margin: 0 }}>{addErr}</span>}
          </div>
        </div>
      )}

      {/* ── Add To-do panel ── */}
      {showAddTodo && (
        <div className="card section">
          <div className="section-title">New to-do</div>
          <div className="form-row" style={{ alignItems: "end" }}>
            <label className="field" style={{ flex: "2 1 200px" }}>
              <span className="label">What do you need to do?</span>
              <input
                className="input"
                placeholder="e.g. Update resume, Send follow-up email"
                value={todoTitle}
                autoFocus
                onChange={e => setTodoTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addTodo(); }}
              />
            </label>
            <label className="field" style={{ maxWidth: 180 }}>
              <span className="label">Due date (optional)</span>
              <input
                className="input"
                type="date"
                value={todoDue}
                onChange={e => setTodoDue(e.target.value)}
              />
            </label>
            <div style={{ display: "flex", gap: 8, paddingBottom: 1 }}>
              <button className="btn btn-primary btn-sm" onClick={addTodo}>Save</button>
              <button className="btn btn-sm" onClick={() => { setShowAddTodo(false); setTodoTitle(""); setTodoDue(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MITs card ── */}
      <div className="card stack" style={{ gap: 10 }}>
        <div className="spread">
          <div>
            <div className="section-title" style={{ margin: 0 }}>Most Important Tasks</div>
            <div className="muted small" style={{ marginTop: 2 }}>
              {mitIds.length === 0 ? "Pick up to 3 MITs for today" : `${mitIds.filter(id => emap.get(ekey(id, today))?.status === "done").length}/${mitIds.length} done`}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => setMitPicker(p => !p)}>
            {mitPicker ? "Done" : "Edit MITs"}
          </button>
        </div>

        {/* MIT progress */}
        {mitIds.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            {mitIds.map(id => {
              const h = habits.find(x => x.id === id);
              if (!h) return null;
              const done = emap.get(ekey(id, today))?.status === "done";
              return (
                <div key={id} className="spread" style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: done ? "var(--green-soft)" : undefined }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="cat-dot" style={{ background: categoryColor(h.category) }} />
                    <span style={{ fontWeight: 500, fontSize: 13, textDecoration: done ? "line-through" : undefined, color: done ? "var(--muted)" : undefined }}>{h.name}</span>
                  </div>
                  <span>{done ? "✓" : "○"}</span>
                </div>
              );
            })}
            <div className="meter">
              <i style={{ width: `${Math.round((mitIds.filter(id => emap.get(ekey(id, today))?.status === "done").length / mitIds.length) * 100)}%` }} />
            </div>
          </div>
        )}

        {/* Picker */}
        {mitPicker && (
          <div className="stack" style={{ gap: 4, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <div className="muted small">Select up to 3 habits from today&apos;s schedule:</div>
            {todayList.map(h => {
              const selected = mitIds.includes(h.id);
              const done = emap.get(ekey(h.id, today))?.status === "done";
              return (
                <label key={h.id} className="row" style={{ gap: 8, padding: "4px 8px", borderRadius: 4, cursor: "pointer", background: selected ? "var(--accent-soft)" : undefined }}>
                  <input type="checkbox" checked={selected} disabled={!selected && mitIds.length >= 3} onChange={() => toggleMit(h.id)} />
                  <span className="cat-dot" style={{ background: categoryColor(h.category) }} />
                  <span style={{ fontSize: 13, fontWeight: selected ? 600 : 400, textDecoration: done ? "line-through" : undefined }}>{h.name}</span>
                  {done && <span className="pill green" style={{ fontSize: 10, marginLeft: "auto" }}>done</span>}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Main two-column ── */}
      <div className="grid-2 section" style={{ alignItems: "start" }}>

        {/* Left — Today's habits + check-in */}
        <div className="card stack">
          <div className="spread" style={{ alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Today&apos;s habits</h3>
            {todayList.length > 0 && todayDone < todayList.length && (
              <button
                className="btn btn-sm btn-primary"
                onClick={markAllDone}
                disabled={markingAll}
                style={{ fontSize: 11 }}
              >
                {markingAll ? "…" : "All done today"}
              </button>
            )}
          </div>
          {todayList.length === 0 && <div className="muted small">Nothing scheduled today.</div>}
          <div className="stack" style={{ gap: 5 }}>
            {todayList.map((h) => {
              const e = emap.get(ekey(h.id, today));
              const s = streaks.get(h.id)!;
              const done = e?.status === "done";
              // DSA habits: use database milestones with named problems
              const habitMs = /dsa/i.test(h.name) ? todayMs : [];
              // Other quantity habits: use local checkboxes (1, 2, 3…)
              const subCount = habitSubCount(h);
              const habitSubs = subCount > 0 ? (subTasks.get(h.id) ?? Array(subCount).fill(false)) : [];
              const hasSubItems = habitMs.length > 0 || habitSubs.length > 0;
              const subDone = habitMs.length > 0
                ? habitMs.filter(m => m.status === "completed").length
                : habitSubs.filter(Boolean).length;
              const subTotal = habitMs.length > 0 ? habitMs.length : habitSubs.length;
              return (
                <div key={h.id}>
                  <div
                    className="spread"
                    style={{
                      padding: "6px 10px",
                      border: "1px solid var(--border)",
                      borderRadius: hasSubItems ? "6px 6px 0 0" : 6,
                      background: done ? "var(--green-soft)" : undefined,
                    }}
                  >
                    <label className="row" style={{ gap: 8, cursor: "pointer", flex: 1, minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => quickToggle(h)}
                        disabled={h.verify_type !== "manual"}
                      />
                      <span className="cat-dot" style={{ background: categoryColor(h.category), flexShrink: 0 }} />
                      <span style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {h.name}
                      </span>
                      {hasSubItems && (
                        <span className="muted small" style={{ marginLeft: 4, flexShrink: 0 }}>
                          {subDone}/{subTotal}
                        </span>
                      )}
                    </label>
                    <span className="row" style={{ gap: 5, flexShrink: 0 }}>
                      {e?.status === "skipped" && <span className="pill amber">skip</span>}
                      {e && ["leetcode","github"].includes(e.source) && <span className="pill green">✓</span>}
                      {s.current >= 2 && <span className="pill">{s.current}{s.unit === "weeks" ? "w" : "d"}</span>}
                      {hasSubItems && (
                        <button
                          onClick={() => toggleExpand(h.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 11, padding: "0 2px", lineHeight: 1 }}
                        >
                          {expandedHabits.has(h.id) ? "▲" : "▼"}
                        </button>
                      )}
                    </span>
                  </div>
                  {hasSubItems && expandedHabits.has(h.id) && (
                    <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 6px 6px", padding: "4px 10px 6px 32px" }}>
                      {habitMs.length > 0 ? (
                        // DSA: named problems from milestones
                        habitMs.map(ms => (
                          <label key={ms.id} className="row" style={{ gap: 8, padding: "3px 0", cursor: "pointer" }}>
                            <input type="checkbox" checked={ms.status === "completed"} onChange={() => toggleMilestone(ms)} />
                            <span style={{ fontSize: 12, flex: 1, textDecoration: ms.status === "completed" ? "line-through" : undefined, color: ms.status === "completed" ? "var(--muted)" : undefined }}>
                              {ms.title}
                            </span>
                          </label>
                        ))
                      ) : (
                        // Quantity habits: numbered checkboxes
                        <div className="row" style={{ gap: 8, flexWrap: "wrap", paddingTop: 2 }}>
                          {habitSubs.map((checked, idx) => (
                            <label key={idx} className="row" style={{ gap: 4, cursor: "pointer", padding: "3px 8px", borderRadius: 4, border: "1px solid var(--border)", background: checked ? "var(--green-soft)" : undefined }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleSubTask(h, idx)} style={{ width: 13, height: 13 }} />
                              <span style={{ fontSize: 11, fontWeight: 500, color: checked ? "var(--muted)" : undefined, textDecoration: checked ? "line-through" : undefined }}>
                                {idx + 1}
                            </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* To-Dos card */}
        {(() => {
          const pending = todos.filter(t => t.status === "pending");
          const done    = todos.filter(t => t.status === "completed");
          const overdue = pending.filter(t => t.due_date && t.due_date < today);
          const dueToday = pending.filter(t => t.due_date === today);
          const upcoming = pending.filter(t => t.due_date && t.due_date > today);
          const noDate   = pending.filter(t => !t.due_date);
          const groups = [
            { label: "Overdue", items: overdue, color: "var(--red)" },
            { label: "Today", items: dueToday, color: "var(--accent)" },
            { label: "Upcoming", items: upcoming, color: "var(--muted)" },
            { label: "No date", items: noDate, color: "var(--faint)" },
          ].filter(g => g.items.length > 0);
          if (todos.length === 0) return (
            <div className="card stack">
              <div className="spread"><h3 style={{ margin: 0 }}>To-Dos</h3></div>
              <div className="muted small">No to-dos yet. Hit "+ To-do" to add one.</div>
            </div>
          );
          return (
            <div className="card stack">
              <h3 style={{ margin: 0 }}>To-Dos {pending.length > 0 && <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({pending.length} pending)</span>}</h3>
              {groups.map(g => (
                <div key={g.label}>
                  <div className="stat-label" style={{ color: g.color, marginBottom: 4 }}>{g.label}</div>
                  {g.items.map(t => (
                    <div key={t.id} className="spread" style={{ padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                      <label className="row" style={{ gap: 8, cursor: "pointer", flex: 1 }}>
                        <input type="checkbox" checked={false} onChange={() => toggleTodo(t)} />
                        <span style={{ fontSize: 13 }}>{t.title}</span>
                        {t.due_date && <span className="muted small" style={{ marginLeft: 4 }}>{t.due_date}</span>}
                      </label>
                      <button onClick={() => removeTodo(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--faint)", fontSize: 14, padding: "0 4px" }} title="Delete">×</button>
                    </div>
                  ))}
                </div>
              ))}
              {done.length > 0 && (
                <div className="muted small" style={{ marginTop: 4 }}>✓ {done.length} completed
                  {done.slice(0, 3).map(t => (
                    <span key={t.id} style={{ marginLeft: 8, textDecoration: "line-through" }}>
                      {t.title}
                      <button onClick={() => removeTodo(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--faint)", fontSize: 12, padding: "0 2px" }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Right — Heatmap + Trend + Goals */}
        <div className="stack">
          <div className="card">
            <div className="spread" style={{ marginBottom: 10 }}>
              <div className="section-title" style={{ margin: 0 }}>Last 6 months</div>
              <div className="heat-legend small muted">
                <span>Less</span>
                {["h0","h1","h2","h3","h4"].map((c) => <span key={c} className={`heat-cell ${c}`} />)}
                <span>More</span>
              </div>
            </div>
            <OverallHeat habits={habits} emap={emap} today={today} />
          </div>

          <div className="card trend">
            <h3>12-week trend</h3>
            <TrendChart data={trend} />
          </div>

          <div className="card">
            <div className="spread" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Goals</h3>
              <Link href="/goals" className="small" style={{ color: "var(--accent)" }}>Manage →</Link>
            </div>
            {goals.length === 0 ? (
              <div className="muted small">No goals yet. <Link href="/goals/create" style={{ color: "var(--accent)" }}>Create one →</Link></div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {goals.filter((g) => g.status === "active").slice(0, 4).map((g) => {
                  const pct  = goalProgress(g, milestones, habits, emap, today);
                  const health = goalHealth(g, milestones, habits, emap, entries, today);
                  const barColor = health === "great" ? "var(--green)"
                    : health === "at_risk" ? "var(--red)"
                    : health === "stalled" ? "var(--border)"
                    : "var(--accent)";
                  return (
                    <div key={g.id}>
                      <div className="spread small" style={{ marginBottom: 4 }}>
                        <span style={{ fontWeight: 500 }}>{g.name}</span>
                        <span className="row" style={{ gap: 6 }}>
                          {health === "stalled" && <span className="pill amber" style={{ fontSize: 10 }}>stalled</span>}
                          {health === "at_risk"  && <span className="pill red"   style={{ fontSize: 10 }}>at risk</span>}
                          <span className="num muted">{pct}%</span>
                        </span>
                      </div>
                      <div className="meter"><i style={{ width: `${pct}%`, background: barColor }} /></div>
                    </div>
                  );
                })}
                {goals.filter((g) => g.status === "active").length > 4 && (
                  <div className="muted small">{goals.filter((g) => g.status === "active").length - 4} more goals →</div>
                )}
              </div>
            )}
          </div>

          {/* DSA backlog indicator */}
          {(() => {
            const { pendingCount, daysBack, oldestDate } = computeDSABacklog(milestones, today);
            if (pendingCount === 0) return null;
            return (
              <div className="card" style={{ border: "1px solid var(--amber)", background: "var(--amber-soft)" }}>
                <div className="spread">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>📉 DSA Backlog</div>
                    <div className="muted small" style={{ marginTop: 2 }}>
                      {pendingCount} problem{pendingCount !== 1 ? "s" : ""} pending
                      {oldestDate && <> · since {oldestDate}</>}
                    </div>
                  </div>
                  <span className="pill red" style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                    {daysBack} day{daysBack !== 1 ? "s" : ""} behind
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Upcoming milestones */}
          {(() => {
            const in14 = fmt(addDays(parseDate(today), 14));
            const upcoming = milestones
              .filter((m) => m.status !== "completed" && m.target_date && m.target_date >= today && m.target_date <= in14)
              .sort((a, b) => (a.target_date ?? "").localeCompare(b.target_date ?? ""))
              .slice(0, 4);
            if (upcoming.length === 0) return null;
            return (
              <div className="card">
                <h3 style={{ margin: "0 0 10px" }}>Upcoming milestones</h3>
                <div className="stack" style={{ gap: 8 }}>
                  {upcoming.map((m) => {
                    const goal = goals.find((g) => g.id === m.goal_id);
                    const daysAway = Math.ceil((parseDate(m.target_date!).getTime() - parseDate(today).getTime()) / 86400000);
                    return (
                      <div key={m.id} className="spread small">
                        <div>
                          {goal && <div className="faint" style={{ fontSize: 10, marginBottom: 1 }}>{goal.name}</div>}
                          <span style={{ fontWeight: 500 }}>{m.title}</span>
                        </div>
                        <span className={`pill ${daysAway <= 3 ? "red" : "amber"}`} style={{ fontSize: 10, flexShrink: 0 }}>
                          {daysAway === 0 ? "today" : `${daysAway}d`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Milestones ── */}
      <div className="card">
        <h3>Milestones</h3>
        <div className="row" style={{ gap: 7 }}>
          {badges.map((b) => (
            <span
              key={b.id}
              className={"pill " + (b.earned ? "accent" : "")}
              title={b.desc}
              style={{ opacity: b.earned ? 1 : 0.5 }}
            >
              {b.earned ? "●" : "○"} {b.label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
