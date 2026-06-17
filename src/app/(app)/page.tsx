"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/AppDataProvider";
import Link from "next/link";
import {
  Habit, Entry, Goal, Milestone, WeeklyReview, buildEntryMap, ekey, isScheduled, localToday,
  computeStreakBatch, statForRange, monthRange, weeklyTrend, computeBadges,
  fmt, addDays, parseDate, categoryColor, gradeOf, StreakInfo, eachDay, weekdayOf, weekKey,
  goalProgress, goalHealth, GoalHealth,
} from "@/lib/core";
import { jget, jsend } from "@/lib/client";

// ─── sub-components ────────────────────────────────────────────────────────

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const CATS = ["General", "Learning", "Health", "Finance", "Routine"];

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

  const { habits: allHabits, goals, milestones, appLoading, refresh: refreshData } = useAppData();
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
        quantity: null, note: null, source: "manual" as const, created_at: new Date().toISOString(),
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
      return [...rest, { habit_id: h.id, date: today, status: "done", quantity, note: cur?.note ?? null, source: "manual", created_at: new Date().toISOString() }];
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
            onClick={() => { setShowAdd(!showAdd); setAddErr(""); }}
          >
            {showAdd ? "Cancel" : "+ Add habit"}
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
              return (
                <div
                  key={h.id}
                  className="spread"
                  style={{
                    padding: "6px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
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
                  </label>
                  <span className="row" style={{ gap: 5, flexShrink: 0 }}>
                    {e?.status === "skipped" && <span className="pill amber">skip</span>}
                    {e && ["leetcode","github"].includes(e.source) && <span className="pill green">✓</span>}
                    {s.current >= 2 && <span className="pill">{s.current}{s.unit === "weeks" ? "w" : "d"}</span>}
                  </span>
                </div>
              );
            })}
          </div>

        </div>

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
