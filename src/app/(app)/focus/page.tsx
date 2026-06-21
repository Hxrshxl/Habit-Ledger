"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/AppDataProvider";
import Link from "next/link";
import {
  Habit, Entry, Goal, Milestone,
  buildEntryMap, ekey, isScheduled, localToday, parseDate, fmt, addDays,
  goalProgress, goalHealth, deadlineUrgency,
  EISENHOWER_QUADRANTS, EisenhowerQuadrant,
  isEscalatedToday, weekKey, eachDay,
} from "@/lib/core";
import { jget, jsend } from "@/lib/client";

// ── Priority tiers ────────────────────────────────────────────────────────────
//  0 = Do quadrant (critical, act now)
//  1 = Escalated weekly (must do today to hit weekly target)
//  2 = Deadline today / overdue milestone
//  3 = Schedule quadrant (important, planned)
//  4 = Regular routine (daily / weekday / interval)
//  5 = Delegate quadrant
//  6 = Eliminate quadrant

interface FocusItem {
  key: string;
  habitId: string;
  name: string;
  done: boolean;
  eisenhower: EisenhowerQuadrant | null;
  escalated: boolean;
  tier: number;
  deadlineLabel: string | null;
  deadlineCls: string;
  streakDays: number;
  habit: Habit;
  linkedGoalName: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_META: Record<number, { label: string; accent: string; bg: string }> = {
  0: { label: "Do — Act now",         accent: "var(--red)",    bg: "rgba(239,68,68,0.06)" },
  1: { label: "Must do today",         accent: "var(--red)",    bg: "rgba(239,68,68,0.04)" },
  2: { label: "Deadline hit",          accent: "var(--red)",    bg: "rgba(239,68,68,0.04)" },
  3: { label: "Schedule — Important",  accent: "var(--accent)", bg: "rgba(99,102,241,0.06)" },
  4: { label: "Routine",               accent: "var(--border)", bg: "transparent" },
  5: { label: "Delegate",              accent: "#f59e0b",       bg: "rgba(245,158,11,0.05)" },
  6: { label: "Eliminate / Defer",     accent: "var(--faint)",  bg: "transparent" },
};

const EIS_PILL: Record<EisenhowerQuadrant, { label: string; cls: string }> = {
  do:       { label: "Do",       cls: "pill red"    },
  schedule: { label: "Schedule", cls: "pill accent"  },
  delegate: { label: "Delegate", cls: "pill amber"   },
  eliminate:{ label: "Eliminate",cls: "pill"         },
};

function QuadrantCell({
  quad, goals, milestones, habits, emap, entries, today,
}: {
  quad: typeof EISENHOWER_QUADRANTS[0];
  goals: Goal[];
  milestones: Milestone[];
  habits: Habit[];
  emap: Map<string, Entry>;
  entries: Entry[];
  today: string;
}) {
  const cellGoals = goals.filter((g) => g.eisenhower === quad.value && g.status === "active");

  const borderColor = quad.pillCls === "red"    ? "var(--red)"
    : quad.pillCls === "accent" ? "var(--accent)"
    : quad.pillCls === "amber"  ? "#f59e0b"
    : "var(--border)";

  const bgColor = quad.pillCls === "red"    ? "rgba(239,68,68,0.04)"
    : quad.pillCls === "accent" ? "rgba(99,102,241,0.04)"
    : quad.pillCls === "amber"  ? "rgba(245,158,11,0.04)"
    : "rgba(0,0,0,0.01)";

  return (
    <div style={{
      border: `1.5px solid ${borderColor}`,
      borderRadius: 8,
      padding: "10px 12px",
      background: bgColor,
      minHeight: 100,
    }}>
      <div className="row" style={{ gap: 6, marginBottom: 8, alignItems: "center" }}>
        <span className={`pill ${quad.pillCls}`} style={{ fontSize: 10, fontWeight: 700 }}>{quad.label}</span>
        <span className="faint" style={{ fontSize: 10 }}>{quad.desc}</span>
      </div>
      {cellGoals.length === 0 ? (
        <div className="faint" style={{ fontSize: 11 }}>No goals here</div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {cellGoals.map((g) => {
            const pct    = goalProgress(g, milestones, habits, emap, today);
            const health = goalHealth(g, milestones, habits, emap, entries, today);
            const dl     = deadlineUrgency(g.target_date, today);
            const barColor = health === "great" ? "var(--green)" : health === "at_risk" ? "var(--red)" : health === "stalled" ? "var(--border)" : "var(--accent)";
            return (
              <div key={g.id}>
                <div className="spread" style={{ alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.name}
                  </span>
                  <div className="row" style={{ gap: 4, flexShrink: 0, marginLeft: 6 }}>
                    {dl && <span className={`pill ${dl.pillCls}`} style={{ fontSize: 9 }}>{dl.label}</span>}
                    <span className="faint" style={{ fontSize: 10 }}>{pct}%</span>
                  </div>
                </div>
                <div style={{ height: 3, background: "var(--border)", borderRadius: 2 }}>
                  <div style={{ height: 3, width: `${pct}%`, background: barColor, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FocusPage() {
  const today  = localToday();
  const weekStart = weekKey(today);

  const { habits: allHabits, goals, milestones, appLoading } = useAppData();
  const habits = allHabits.filter(h => !h.archived);

  const [entries,    setEntries]    = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [err,        setErr]        = useState("");
  const loading = appLoading || entriesLoading;

  const load = useCallback(async () => {
    setEntriesLoading(true);
    try {
      const es = await jget<Entry[]>(`/api/entries?from=${weekStart}&to=${today}`);
      setEntries(es); setErr("");
    } catch (e) { setErr((e as Error).message); }
    setEntriesLoading(false);
  }, [today, weekStart]);

  useEffect(() => { load(); }, [load]);

  const emap = useMemo(() => buildEntryMap(entries), [entries]);

  // Build today's focus list
  const focusItems = useMemo<FocusItem[]>(() => {
    const items: FocusItem[] = [];

    for (const h of habits) {
      if (h.archived) continue;

      const scheduledToday = isScheduled(h, today);
      const escalated      = isEscalatedToday(h, emap, today);
      if (!scheduledToday && !escalated) continue;

      const entry    = emap.get(ekey(h.id, today));
      const done     = entry?.status === "done";
      const skipped  = entry?.status === "skipped";
      if (skipped) continue;

      // Resolve eisenhower via milestone → goal chain
      const ms   = milestones.find((m) => m.id === h.milestone_id);
      const goal = ms ? goals.find((g) => g.id === ms.goal_id) : null;
      const eis  = (goal?.eisenhower ?? null) as EisenhowerQuadrant | null;

      // Deadline urgency from linked milestone
      const dlInfo = ms ? deadlineUrgency(ms.target_date, today) : null;

      // Streak (simple: count consecutive done days ending today)
      let streak = 0;
      for (let i = 0; i < 60; i++) {
        const d = fmt(addDays(parseDate(today), -i));
        if (emap.get(ekey(h.id, d))?.status === "done") streak++;
        else if (i > 0) break; // gap — stop (today might not be done yet, that's ok for i=0)
      }
      if (!done) streak = Math.max(0, streak - 0); // don't count today if not done

      // Compute tier
      let tier: number;
      if (eis === "do")       tier = 0;
      else if (escalated)     tier = 1;
      else if (dlInfo && (dlInfo.level === "today" || dlInfo.level === "overdue")) tier = 2;
      else if (eis === "schedule") tier = 3;
      else if (!eis)          tier = 4;
      else if (eis === "delegate")  tier = 5;
      else                    tier = 6; // eliminate

      items.push({
        key:          `h-${h.id}`,
        habitId:      h.id,
        name:         h.name,
        done,
        eisenhower:   eis,
        escalated,
        tier,
        deadlineLabel: dlInfo?.label ?? null,
        deadlineCls:   dlInfo?.pillCls ?? "",
        streakDays:   streak,
        habit:        h,
        linkedGoalName: goal?.name ?? null,
      });
    }

    // Sort: done items last, then by tier, then by name
    items.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.name.localeCompare(b.name);
    });

    return items;
  }, [habits, emap, milestones, goals, today]);

  async function toggle(item: FocusItem) {
    const next = item.done ? null : "done";
    setEntries((prev) => {
      const rest = prev.filter((e) => !(e.habit_id === item.habitId && e.date === today));
      if (next === null) return rest;
      return [...rest, {
        habit_id: item.habitId, date: today, status: "done",
        quantity: null, note: null, source: "manual", duration_minutes: null, created_at: new Date().toISOString(),
      }];
    });
    try {
      await jsend("/api/entries/set", "POST", { habitId: item.habitId, date: today, status: next, quantity: null });
    } catch (e) {
      setEntries(await jget<Entry[]>(`/api/entries?from=${weekStart}&to=${today}`));
      alert((e as Error).message);
    }
  }

  // ── Pomodoro widget ──────────────────────────────────────────────────────────
  const WORK_SECS = 25 * 60;
  const BREAK_SECS = 5 * 60;
  const [pomOpen,      setPomOpen]      = useState(false);
  const [pomHabitId,   setPomHabitId]   = useState("");
  const [pomSecsLeft,  setPomSecsLeft]  = useState(WORK_SECS);
  const [pomRunning,   setPomRunning]   = useState(false);
  const [pomPhase,     setPomPhase]     = useState<"work" | "break">("work");

  // Set default habit once today's scheduled list is ready
  useEffect(() => {
    const firstToday = habits.find(h => isScheduled(h, today) && emap.get(ekey(h.id, today))?.status !== "done");
    if (firstToday && !pomHabitId) setPomHabitId(firstToday.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits.length, pomHabitId]);

  useEffect(() => {
    if (!pomRunning) return;
    const id = setInterval(() => {
      setPomSecsLeft(s => {
        if (s <= 1) {
          clearInterval(id);
          setPomRunning(false);
          if (pomPhase === "work") {
            // Auto-log the entry
            if (pomHabitId) {
              jsend("/api/entries/set", "POST", { habitId: pomHabitId, date: today, status: "done", source: "pomodoro", duration_minutes: 25 }).catch(() => {});
              setEntries(prev => {
                const rest = prev.filter(e => !(e.habit_id === pomHabitId && e.date === today));
                return [...rest, { habit_id: pomHabitId, date: today, status: "done", quantity: null, note: null, source: "pomodoro", duration_minutes: 25, created_at: new Date().toISOString() }];
              });
            }
            setPomPhase("break");
            return BREAK_SECS;
          } else {
            setPomPhase("work");
            return WORK_SECS;
          }
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomRunning, pomPhase, pomHabitId, today]);

  function pomReset() { setPomRunning(false); setPomPhase("work"); setPomSecsLeft(WORK_SECS); }

  if (loading) return <div className="state-note">Loading…</div>;
  if (err)     return <div className="state-note error-text">{err}</div>;

  const pending = focusItems.filter((i) => !i.done);
  const done    = focusItems.filter((i) => i.done);

  // Group pending by tier
  const tierGroups = new Map<number, FocusItem[]>();
  for (const item of pending) {
    if (!tierGroups.has(item.tier)) tierGroups.set(item.tier, []);
    tierGroups.get(item.tier)!.push(item);
  }

  const unclassifiedGoals = goals.filter((g) => !g.eisenhower && g.status === "active");

  const dateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="stack">
      {/* ── Header ── */}
      <div className="page-head spread">
        <div>
          <h1>Focus</h1>
          <div className="muted small">{dateStr} · {done.length}/{focusItems.length} done today</div>
        </div>
        <Link href="/goals" className="btn btn-sm" style={{ textDecoration: "none" }}>Manage goals →</Link>
      </div>

      {/* ── Main two-column ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

        {/* ── LEFT: Eisenhower Matrix ── */}
        <div className="stack" style={{ gap: 12 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Goal Matrix</div>

          {/* 2×2 grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {EISENHOWER_QUADRANTS.map((quad) => (
              <QuadrantCell
                key={quad.value}
                quad={quad}
                goals={goals}
                milestones={milestones}
                habits={habits}
                emap={emap}
                entries={entries}
                today={today}
              />
            ))}
          </div>

          {/* Unclassified goals */}
          {unclassifiedGoals.length > 0 && (
            <div className="card stack" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 2 }}>
                <span className="section-title" style={{ margin: 0 }}>Unclassified</span>
                <span className="faint small">— assign a quadrant in Goals</span>
              </div>
              {unclassifiedGoals.map((g) => (
                <div key={g.id} className="spread small">
                  <span>{g.name}</span>
                  <Link href="/goals" className="faint small" style={{ color: "var(--accent)", textDecoration: "none" }}>Classify →</Link>
                </div>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="card" style={{ padding: "10px 14px" }}>
            <div className="section-title" style={{ marginBottom: 8 }}>Eisenhower Matrix</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11 }}>
              <div><span className="pill red" style={{ fontSize: 9 }}>Do</span> <span className="muted">Urgent + Important</span></div>
              <div><span className="pill accent" style={{ fontSize: 9 }}>Schedule</span> <span className="muted">Not Urgent + Important</span></div>
              <div><span className="pill amber" style={{ fontSize: 9 }}>Delegate</span> <span className="muted">Urgent + Not Important</span></div>
              <div><span className="pill" style={{ fontSize: 9 }}>Eliminate</span> <span className="muted">Not Urgent + Not Important</span></div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Pomodoro + Today's Priority Stack ── */}
        <div className="stack" style={{ gap: 12 }}>

          {/* Pomodoro widget */}
          {(() => {
            const totalSecs = pomPhase === "work" ? WORK_SECS : BREAK_SECS;
            const C = 2 * Math.PI * 40;
            const remaining = pomSecsLeft / totalSecs;
            const mins = String(Math.floor(pomSecsLeft / 60)).padStart(2, "0");
            const secs = String(pomSecsLeft % 60).padStart(2, "0");
            const todayHabits = habits.filter(h => isScheduled(h, today));
            const isWorkDone = pomPhase === "break" && pomSecsLeft === BREAK_SECS && !pomRunning;
            return (
              <div className="card" style={{ padding: "10px 14px" }}>
                <div className="spread">
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>🍅 Pomodoro</span>
                    {pomPhase === "break" && <span className="pill green" style={{ fontSize: 10 }}>Break</span>}
                    {isWorkDone && <span className="pill green" style={{ fontSize: 10 }}>Session done ✓</span>}
                  </div>
                  <button className="btn btn-sm" onClick={() => setPomOpen(o => !o)}>{pomOpen ? "▲" : "▼"}</button>
                </div>
                {pomOpen && (
                  <div className="stack" style={{ gap: 14, marginTop: 12, alignItems: "center" }}>
                    {/* Circular ring */}
                    <svg width={120} height={120} viewBox="-60 -60 120 120">
                      <circle r={40} fill="none" stroke="var(--border)" strokeWidth={8} />
                      <circle r={40} fill="none"
                        stroke={pomPhase === "work" ? "var(--accent)" : "var(--green)"}
                        strokeWidth={8}
                        strokeDasharray={`${C}`}
                        strokeDashoffset={`${C * (1 - remaining)}`}
                        strokeLinecap="round"
                        transform="rotate(-90)"
                        style={{ transition: "stroke-dashoffset 0.9s linear" }}
                      />
                      <text x={0} y={6} textAnchor="middle" fontSize={22} fontWeight={700} fill="var(--text)">{mins}:{secs}</text>
                      <text x={0} y={22} textAnchor="middle" fontSize={9} fill="var(--muted)">{pomPhase === "work" ? "FOCUS" : "BREAK"}</text>
                    </svg>

                    {/* Habit picker (only in work phase) */}
                    {pomPhase === "work" && (
                      <select className="select" value={pomHabitId} onChange={e => setPomHabitId(e.target.value)} style={{ maxWidth: 240 }} disabled={pomRunning}>
                        <option value="">— Pick a habit —</option>
                        {todayHabits.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                      </select>
                    )}

                    {/* Controls */}
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn btn-sm btn-primary"
                        onClick={() => setPomRunning(r => !r)}
                        disabled={pomPhase === "work" && !pomHabitId}
                      >{pomRunning ? "⏸ Pause" : (pomSecsLeft === totalSecs ? "▶ Start" : "▶ Resume")}</button>
                      <button className="btn btn-sm" onClick={pomReset}>↺ Reset</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="section-title" style={{ marginBottom: 0 }}>Today&apos;s Priority</div>

          {focusItems.length === 0 && (
            <div className="card muted small">Nothing scheduled today. Add habits in the <Link href="/tracker" style={{ color: "var(--accent)" }}>Tracker</Link>.</div>
          )}

          {/* Pending items grouped by tier */}
          {Array.from(tierGroups.entries()).map(([tier, items]) => {
            const meta = TIER_META[tier];
            return (
              <div key={tier} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
                {/* Tier header */}
                <div style={{
                  padding: "6px 12px",
                  background: meta.bg,
                  borderBottom: `2px solid ${meta.accent}`,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: meta.accent, display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: meta.accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {meta.label}
                  </span>
                  <span className="faint" style={{ fontSize: 10 }}>{items.length} task{items.length !== 1 ? "s" : ""}</span>
                </div>

                {/* Items */}
                <div className="stack" style={{ gap: 0 }}>
                  {items.map((item, idx) => (
                    <FocusRow
                      key={item.key}
                      item={item}
                      onToggle={() => toggle(item)}
                      showBorder={idx < items.length - 1}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Completed section */}
          {done.length > 0 && (
            <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", opacity: 0.7 }}>
              <div style={{
                padding: "6px 12px",
                background: "rgba(16,185,129,0.06)",
                borderBottom: "2px solid var(--green)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Completed
                </span>
                <span className="faint" style={{ fontSize: 10 }}>{done.length} done</span>
              </div>
              <div className="stack" style={{ gap: 0 }}>
                {done.map((item, idx) => (
                  <FocusRow
                    key={item.key}
                    item={item}
                    onToggle={() => toggle(item)}
                    showBorder={idx < done.length - 1}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All done state */}
          {pending.length === 0 && done.length > 0 && (
            <div className="card" style={{ textAlign: "center", padding: "20px 16px", borderColor: "var(--green)" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🎯</div>
              <div style={{ fontWeight: 700, color: "var(--green)" }}>All done for today!</div>
              <div className="muted small" style={{ marginTop: 4 }}>{done.length} habits completed</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Focus row ─────────────────────────────────────────────────────────────────

function FocusRow({
  item, onToggle, showBorder,
}: {
  item: FocusItem;
  onToggle: () => void;
  showBorder: boolean;
}) {
  const eiPill = item.eisenhower ? EIS_PILL[item.eisenhower] : null;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px",
        background: item.done ? "var(--green-soft, rgba(16,185,129,0.05))" : "var(--card)",
        borderBottom: showBorder ? "1px solid var(--border)" : undefined,
        transition: "background 0.15s",
      }}
    >
      <input
        type="checkbox"
        checked={item.done}
        onChange={onToggle}
        disabled={item.habit.verify_type !== "manual"}
        style={{ flexShrink: 0, cursor: "pointer" }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{
            fontSize: 13, fontWeight: 500,
            textDecoration: item.done ? "line-through" : undefined,
            color: item.done ? "var(--muted)" : undefined,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.name}
          </span>
          {item.escalated && !item.done && (
            <span className="pill red" style={{ fontSize: 9, fontWeight: 700 }}>last chance today</span>
          )}
          {item.deadlineLabel && !item.done && (
            <span className={`pill ${item.deadlineCls}`} style={{ fontSize: 9 }}>{item.deadlineLabel}</span>
          )}
          {eiPill && (
            <span className={eiPill.cls} style={{ fontSize: 9 }}>{eiPill.label}</span>
          )}
        </div>
        {(item.linkedGoalName || item.streakDays >= 2) && (
          <div className="row" style={{ gap: 8, marginTop: 1 }}>
            {item.linkedGoalName && (
              <span className="faint" style={{ fontSize: 10 }}>↳ {item.linkedGoalName}</span>
            )}
            {item.streakDays >= 2 && (
              <span className="faint" style={{ fontSize: 10 }}>🔥 {item.streakDays}d streak</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
