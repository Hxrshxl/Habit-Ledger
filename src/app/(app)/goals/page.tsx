"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/AppDataProvider";
import Link from "next/link";
import {
  Habit, Entry, Goal, Milestone,
  buildEntryMap, ekey, statForRange, localToday, parseDate, fmt, addDays,
  GOAL_TIMEFRAMES, GoalHealth, goalProgress, milestoneProgress, goalHealth, isGoalStalled,
  EISENHOWER_QUADRANTS, EisenhowerQuadrant, deadlineUrgency,
} from "@/lib/core";
import { jget, jsend } from "@/lib/client";
import ConfirmModal from "@/components/ConfirmModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<GoalHealth, { label: string; cls: string }> = {
  great:   { label: "On track",    cls: "pace-badge on-track" },
  good:    { label: "Good",        cls: "pace-badge on-track" },
  at_risk: { label: "At risk",     cls: "pace-badge behind" },
  stalled: { label: "Stalled",     cls: "pace-badge expired" },
};

function daysLeft(dateStr: string | null, today: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((parseDate(dateStr).getTime() - parseDate(today).getTime()) / 86400000);
}

function EisenhowerBadge({ value }: { value: EisenhowerQuadrant | null }) {
  if (!value) return null;
  const q = EISENHOWER_QUADRANTS.find((x) => x.value === value);
  if (!q) return null;
  return (
    <span
      className={`pill${q.pillCls ? " " + q.pillCls : ""}`}
      style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.03em" }}
      title={q.desc}
    >
      {q.label}
    </span>
  );
}

function DeadlineBadge({ targetDate, today }: { targetDate: string | null; today: string }) {
  const u = deadlineUrgency(targetDate, today);
  if (!u) return null;
  return (
    <span
      className={`pill${u.pillCls ? " " + u.pillCls : ""}`}
      style={{ fontSize: 10 }}
    >
      {u.label}
    </span>
  );
}

function ProgressBar({ pct, health }: { pct: number; health?: GoalHealth }) {
  const color = health === "great" ? "var(--green)"
    : health === "at_risk" ? "var(--red)"
    : health === "stalled" ? "var(--border)"
    : "var(--accent)";
  return (
    <div className="meter" style={{ height: 6, borderRadius: 4 }}>
      <i style={{ width: `${pct}%`, background: color, borderRadius: 4 }} />
    </div>
  );
}

// ── Milestone row ──────────────────────────────────────────────────────────────

function MilestoneRow({
  ms, habits, emap, today, onStatusChange, onDelete, onEdit,
}: {
  ms: Milestone;
  habits: Habit[];
  emap: Map<string, Entry>;
  today: string;
  onStatusChange: (id: number, status: string) => void;
  onDelete: (id: number) => void;
  onEdit: (ms: Milestone) => void;
}) {
  const pct = milestoneProgress(ms, habits, emap, today);
  const dl  = daysLeft(ms.target_date, today);
  const linked = habits.filter((h) => h.milestone_id === ms.id);

  return (
    <div className="milestone-card">
      <div className="spread">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={ms.status === "completed"}
              onChange={(e) => onStatusChange(ms.id, e.target.checked ? "completed" : "active")}
              title="Mark complete"
            />
            <span
              className="milestone-title"
              style={{ textDecoration: ms.status === "completed" ? "line-through" : undefined, opacity: ms.status === "completed" ? 0.6 : 1 }}
            >
              {ms.title}
            </span>
            <span className={`pace-badge ${ms.status === "completed" ? "on-track" : ms.status === "active" ? "ahead" : "neutral"}`}>
              {ms.status}
            </span>
          </div>
          {ms.explanation && <div className="muted small" style={{ marginTop: 3, marginLeft: 24 }}>{ms.explanation}</div>}
          <div className="row" style={{ gap: 10, marginTop: 4, marginLeft: 24, flexWrap: "wrap" }}>
            {ms.target_date && dl !== null && (
              <span className="muted small">{dl >= 0 ? `${dl}d left · ` : "Passed · "}{ms.target_date}</span>
            )}
            {ms.estimated_duration && <span className="faint small">~{ms.estimated_duration}</span>}
            {linked.length > 0 && <span className="muted small">{linked.length} habit{linked.length !== 1 ? "s" : ""}</span>}
          </div>
          {ms.status !== "completed" && linked.length > 0 && (
            <div style={{ marginTop: 6, marginLeft: 24 }}>
              <ProgressBar pct={pct} />
              <span className="faint small">{pct}% completion</span>
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 4, flexShrink: 0 }}>
          <button className="btn btn-sm" onClick={() => onEdit(ms)}>Edit</button>
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(ms.id)}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ── Goal card ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal, milestones, habits, emap, entries, today,
  onDelete, onEdit, onMilestoneStatusChange, onMilestoneDelete, onMilestoneEdit, onAddMilestone,
}: {
  goal: Goal;
  milestones: Milestone[];
  habits: Habit[];
  emap: Map<string, Entry>;
  entries: Entry[];
  today: string;
  onDelete: (g: Goal) => void;
  onEdit: (g: Goal) => void;
  onMilestoneStatusChange: (id: number, status: string) => void;
  onMilestoneDelete: (id: number) => void;
  onMilestoneEdit: (ms: Milestone) => void;
  onAddMilestone: (goalId: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const gMs = milestones.filter((m) => m.goal_id === goal.id);
  const pct = goalProgress(goal, milestones, habits, emap, today);
  const health = goalHealth(goal, milestones, habits, emap, entries, today);
  const dl = daysLeft(goal.target_date, today);
  const tf = GOAL_TIMEFRAMES.find((t) => t.value === goal.timeframe);
  const completedMs = gMs.filter((m) => m.status === "completed").length;

  return (
    <div className="card life-goal-card" style={{ borderLeft: `3px solid ${health === "great" ? "var(--green)" : health === "at_risk" ? "var(--red)" : health === "stalled" ? "var(--border)" : "var(--accent)"}` }}>
      {/* Header */}
      <div className="spread" style={{ cursor: "pointer" }} onClick={() => setExpanded((e) => !e)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="life-goal-title" style={{ margin: 0 }}>{goal.name}</span>
            <EisenhowerBadge value={goal.eisenhower} />
            <DeadlineBadge targetDate={goal.target_date} today={today} />
            <span className={`pill ${goal.category ? "accent" : ""}`} style={{ fontSize: 10 }}>{goal.category}</span>
            <span className={HEALTH_CONFIG[health].cls}>{HEALTH_CONFIG[health].label}</span>
          </div>
          {goal.description && (
            <div className="muted small" style={{ marginTop: 2 }}>{goal.description}</div>
          )}
          <div className="row" style={{ gap: 12, marginTop: 6, flexWrap: "wrap" }}>
            {tf && <span className="faint small">{tf.label}</span>}
            {dl !== null && (
              <span className="muted small">{dl >= 0 ? `${dl} days left` : `${Math.abs(dl)}d overdue`} · {goal.target_date}</span>
            )}
            <span className="muted small">{completedMs}/{gMs.length} milestones done</span>
            <span className="num small">{pct}%</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <ProgressBar pct={pct} health={health} />
          </div>
        </div>
        <div className="row" style={{ gap: 4, alignItems: "flex-start", flexShrink: 0, marginLeft: 12 }}>
          <span className="muted" style={{ fontSize: 16 }}>{expanded ? "▾" : "▸"}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn btn-sm btn-primary" onClick={() => onAddMilestone(goal.id)}>+ Milestone</button>
        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onEdit(goal); }}>Edit</button>
        <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); onDelete(goal); }}>Delete</button>
      </div>

      {/* Milestones */}
      {expanded && (
        <div className="stack" style={{ marginTop: 10, gap: 8 }}>
          {gMs.length === 0 ? (
            <div className="muted small">No milestones yet. Add milestones manually or use the Goal Wizard to generate an AI plan.</div>
          ) : (
            gMs.map((ms) => (
              <MilestoneRow
                key={ms.id}
                ms={ms}
                habits={habits}
                emap={emap}
                today={today}
                onStatusChange={onMilestoneStatusChange}
                onDelete={onMilestoneDelete}
                onEdit={onMilestoneEdit}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Edit forms ────────────────────────────────────────────────────────────────

interface GoalFormState {
  id?: number;
  name: string;
  description: string;
  category: string;
  priority: string;
  timeframe: string;
  start_date: string;
  target_date: string;
  status: string;
  eisenhower: EisenhowerQuadrant | "";
}

interface MsFormState {
  id?: number;
  goal_id: number;
  title: string;
  explanation: string;
  estimated_duration: string;
  success_criteria: string;
  target_date: string;
  status: string;
}

const CATEGORIES = ["Career", "Finance", "Health", "Learning", "Personal", "Other"];
const STATUSES   = ["active", "completed", "paused", "stalled"];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const today = localToday();

  const {
    habits: allHabits,
    goals, setGoals,
    milestones: msList, setMilestones: setMsList,
    appLoading, refresh: refreshData,
  } = useAppData();
  const habits = allHabits.filter(h => !h.archived);

  const [entries,  setEntries]  = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [err,      setErr]      = useState("");
  const loading = appLoading || entriesLoading;

  // Forms
  const [goalForm, setGoalForm] = useState<GoalFormState | null>(null);
  const [msForm,   setMsForm]   = useState<MsFormState | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  const [confirmGoal, setConfirmGoal] = useState<Goal | null>(null);
  const [confirmMsId, setConfirmMsId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setEntriesLoading(true);
    try {
      const from = fmt(addDays(parseDate(today), -365));
      const es = await jget<Entry[]>(`/api/entries?from=${from}&to=${today}`);
      setEntries(es); setErr("");
    } catch (e) { setErr((e as Error).message); }
    setEntriesLoading(false);
  }, [today]);

  useEffect(() => { load(); }, [load]);

  const emap = useMemo(() => buildEntryMap(entries), [entries]);

  // ── Goal CRUD ──────────────────────────────────────────────────────────────

  async function saveGoal() {
    if (!goalForm || !goalForm.name.trim()) { setErr("Goal name is required."); return; }
    setSaving(true); setErr("");
    try {
      if (goalForm.id) {
        await jsend(`/api/goals/${goalForm.id}`, "PATCH", {
          name:        goalForm.name.trim(),
          description: goalForm.description.trim(),
          category:    goalForm.category,
          priority:    goalForm.priority,
          timeframe:   goalForm.timeframe,
          start_date:  goalForm.start_date || null,
          target_date: goalForm.target_date || null,
          status:      goalForm.status,
          eisenhower:  goalForm.eisenhower || null,
        });
      } else {
        await jsend("/api/goals", "POST", {
          name:        goalForm.name.trim(),
          description: goalForm.description.trim(),
          category:    goalForm.category,
          priority:    goalForm.priority,
          timeframe:   goalForm.timeframe,
          start_date:  goalForm.start_date || null,
          target_date: goalForm.target_date || null,
          eisenhower:  goalForm.eisenhower || null,
        });
      }
      setGoalForm(null);
      await refreshData();
    } catch (e) { setErr((e as Error).message); }
    setSaving(false);
  }

  async function removeGoal(g: Goal) {
    setConfirmGoal(g);
  }

  async function confirmRemoveGoal() {
    if (!confirmGoal) return;
    const g = confirmGoal;
    setConfirmGoal(null);
    setErr("");
    setDeleting((prev) => new Set(prev).add(g.id));
    setGoals((prev) => prev.filter((x) => x.id !== g.id));
    setMsList((prev) => prev.filter((m) => m.goal_id !== g.id));
    try {
      await jsend(`/api/goals/${g.id}`, "DELETE");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(g.id); return s; });
    }
    await refreshData();
  }

  // ── Milestone CRUD ─────────────────────────────────────────────────────────

  async function saveMilestone() {
    if (!msForm || !msForm.title.trim()) { setErr("Milestone title is required."); return; }
    setSaving(true); setErr("");
    try {
      if (msForm.id) {
        await jsend(`/api/milestones/${msForm.id}`, "PATCH", {
          title:              msForm.title.trim(),
          explanation:        msForm.explanation.trim(),
          estimated_duration: msForm.estimated_duration.trim(),
          success_criteria:   msForm.success_criteria.trim(),
          target_date:        msForm.target_date || null,
          status:             msForm.status,
        });
      } else {
        await jsend("/api/milestones", "POST", {
          goal_id:            msForm.goal_id,
          title:              msForm.title.trim(),
          explanation:        msForm.explanation.trim(),
          estimated_duration: msForm.estimated_duration.trim(),
          success_criteria:   msForm.success_criteria.trim(),
          target_date:        msForm.target_date || null,
        });
      }
      setMsForm(null);
      await refreshData();
    } catch (e) { setErr((e as Error).message); }
    setSaving(false);
  }

  async function onMilestoneStatusChange(id: number, status: string) {
    try {
      await jsend(`/api/milestones/${id}`, "PATCH", { status });
      setMsList((prev) => prev.map((m) => m.id === id ? { ...m, status: status as Milestone["status"] } : m));
    } catch (e) { setErr((e as Error).message); }
  }

  async function onMilestoneDelete(id: number) {
    setConfirmMsId(id);
  }

  async function confirmMilestoneDelete() {
    if (confirmMsId === null) return;
    const id = confirmMsId;
    setConfirmMsId(null);
    try {
      await jsend(`/api/milestones/${id}`, "DELETE");
      setMsList((prev) => prev.filter((m) => m.id !== id));
    } catch (e) { setErr((e as Error).message); }
  }

  // ── Group goals by timeframe ───────────────────────────────────────────────

  const stalledGoals = useMemo(
    () => goals.filter((g) => isGoalStalled(g, msList, habits, entries, today) && g.status === "active"),
    [goals, msList, habits, entries, today]
  );

  const upcomingMilestones = useMemo(() => {
    const cutoff = fmt(addDays(parseDate(today), 14));
    return msList
      .filter((m) => m.status !== "completed" && m.target_date && m.target_date <= cutoff && m.target_date >= today)
      .sort((a, b) => (a.target_date ?? "").localeCompare(b.target_date ?? ""))
      .slice(0, 5);
  }, [msList, today]);

  const timeframeGroups = useMemo(() => {
    const order = ["3m", "6m", "1y", "3y", "5y", "custom"];
    const groups: Record<string, Goal[]> = {};
    for (const g of goals) {
      const tf = g.timeframe ?? "custom";
      if (!groups[tf]) groups[tf] = [];
      groups[tf].push(g);
    }
    return order.filter((tf) => groups[tf]?.length).map((tf) => ({
      timeframe: tf,
      label: GOAL_TIMEFRAMES.find((t) => t.value === tf)?.label ?? tf,
      goals: groups[tf],
    }));
  }, [goals]);

  if (loading) return <div className="muted">Loading…</div>;

  const blankGoalForm = (): GoalFormState => ({
    name: "", description: "", category: "Career", priority: "medium",
    timeframe: "1y", start_date: today, target_date: "", status: "active", eisenhower: "",
  });

  return (
    <div className="stack">
      {confirmGoal && (
        <ConfirmModal
          title={`Delete "${confirmGoal.name}"?`}
          message="This will permanently delete the goal, all its milestones, and unlink any associated habits."
          confirmLabel="Delete goal"
          danger
          onConfirm={confirmRemoveGoal}
          onCancel={() => setConfirmGoal(null)}
        />
      )}
      {confirmMsId !== null && (
        <ConfirmModal
          title="Delete milestone?"
          message="Habits linked to this milestone will be unlinked. This cannot be undone."
          confirmLabel="Delete milestone"
          danger
          onConfirm={confirmMilestoneDelete}
          onCancel={() => setConfirmMsId(null)}
        />
      )}
      {/* ── Header ── */}
      <div className="page-head spread">
        <h1>Goals</h1>
        <div className="row">
          <Link href="/goals/create" className="btn btn-sm btn-primary" style={{ textDecoration: "none" }}>
            + New goal (AI)
          </Link>
          <button className="btn btn-sm" onClick={() => setGoalForm(blankGoalForm())}>
            + Manual goal
          </button>
        </div>
      </div>

      {err && <div className="error-text">{err}</div>}

      {/* ── Empty state ── */}
      {goals.length === 0 && !goalForm && (
        <div className="wizard-get-started card">
          <div className="wizard-gs-icon">🎯</div>
          <div className="wizard-gs-body">
            <div className="wizard-gs-title">Define your first goal</div>
            <div className="wizard-gs-desc">
              Tell the AI what you want to achieve. It will break it into milestones and generate daily habits
              tailored to your timeline — no templates, fully dynamic.
            </div>
          </div>
          <Link href="/goals/create" className="btn btn-primary" style={{ textDecoration: "none", flexShrink: 0 }}>
            Start with AI →
          </Link>
        </div>
      )}

      {/* ── Stalled goals alert ── */}
      {stalledGoals.length > 0 && (
        <div className="card" style={{ borderLeft: "3px solid var(--red)" }}>
          <div className="section-title" style={{ color: "var(--red)" }}>Stalled goals ({stalledGoals.length})</div>
          <div className="muted small" style={{ marginBottom: 8 }}>No habit activity in the last 7 days. Take action or pause these goals.</div>
          <div className="stack" style={{ gap: 4 }}>
            {stalledGoals.map((g) => (
              <div key={g.id} className="spread">
                <span className="small">{g.name}</span>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => setGoalForm({ id: g.id, name: g.name, description: g.description, category: g.category, priority: g.priority, timeframe: g.timeframe, start_date: g.start_date ?? today, target_date: g.target_date ?? "", status: g.status, eisenhower: (g.eisenhower ?? "") as EisenhowerQuadrant | "" })}>
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Upcoming milestones ── */}
      {upcomingMilestones.length > 0 && (
        <div className="card">
          <div className="section-title">Due in the next 2 weeks</div>
          <div className="stack" style={{ gap: 6 }}>
            {upcomingMilestones.map((ms) => {
              const g = goals.find((g) => g.id === ms.goal_id);
              const dl = daysLeft(ms.target_date, today);
              return (
                <div key={ms.id} className="spread small">
                  <div>
                    {g && <span className="faint" style={{ fontSize: 10 }}>{g.name} · </span>}
                    <span>{ms.title}</span>
                  </div>
                  <span className={`pace-badge ${(dl ?? 0) <= 3 ? "behind" : "on-track"}`}>{dl}d</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Goal tree grouped by timeframe ── */}
      {timeframeGroups.map(({ timeframe, label, goals: tGoals }) => (
        <div key={timeframe}>
          <div className="section-title" style={{ marginBottom: 8 }}>{label}</div>
          <div className="stack" style={{ gap: 12 }}>
            {tGoals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                milestones={msList}
                habits={habits}
                emap={emap}
                entries={entries}
                today={today}
                onDelete={removeGoal}
                onEdit={(g) => setGoalForm({ id: g.id, name: g.name, description: g.description, category: g.category, priority: g.priority, timeframe: g.timeframe, start_date: g.start_date ?? today, target_date: g.target_date ?? "", status: g.status, eisenhower: (g.eisenhower ?? "") as EisenhowerQuadrant | "" })}
                onMilestoneStatusChange={onMilestoneStatusChange}
                onMilestoneDelete={onMilestoneDelete}
                onMilestoneEdit={(ms) => setMsForm({ id: ms.id, goal_id: ms.goal_id, title: ms.title, explanation: ms.explanation, estimated_duration: ms.estimated_duration, success_criteria: ms.success_criteria, target_date: ms.target_date ?? "", status: ms.status })}
                onAddMilestone={(goalId) => setMsForm({ goal_id: goalId, title: "", explanation: "", estimated_duration: "", success_criteria: "", target_date: "", status: "pending" })}
              />
            ))}
          </div>
        </div>
      ))}

      {/* ── Goal form ── */}
      {goalForm && (
        <div className="card stack" style={{ marginTop: 16 }}>
          <div className="section-title">{goalForm.id ? "Edit goal" : "New goal"}</div>
          <div className="form-row">
            <label className="field" style={{ flex: "2 1 260px" }}>
              <span className="label">Goal</span>
              <input className="input" autoFocus value={goalForm.name}
                placeholder="e.g. Switch to 15 LPA role"
                onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") saveGoal(); }} />
            </label>
            <label className="field">
              <span className="label">Category</span>
              <select className="select" value={goalForm.category} onChange={(e) => setGoalForm({ ...goalForm, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="field" style={{ maxWidth: 120 }}>
              <span className="label">Priority</span>
              <select className="select" value={goalForm.priority} onChange={(e) => setGoalForm({ ...goalForm, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>

          {/* Eisenhower matrix picker */}
          <div className="field">
            <span className="label">Quadrant (Eisenhower matrix)</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxWidth: 480 }}>
              {EISENHOWER_QUADRANTS.map((q) => {
                const selected = goalForm.eisenhower === q.value;
                return (
                  <button
                    key={q.value}
                    type="button"
                    onClick={() => setGoalForm({ ...goalForm, eisenhower: selected ? "" : q.value })}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                      background: selected ? "var(--accent-soft, var(--card))" : "var(--card)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "border-color 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className={`pill${q.pillCls ? " " + q.pillCls : ""}`} style={{ fontSize: 10, margin: 0 }}>{q.label}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{q.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {goalForm.eisenhower && (
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginTop: 6, fontSize: 11 }}
                onClick={() => setGoalForm({ ...goalForm, eisenhower: "" })}
              >
                Clear quadrant
              </button>
            )}
          </div>

          <label className="field">
            <span className="label">Description (optional)</span>
            <input className="input" value={goalForm.description}
              placeholder="Why this goal matters"
              onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} />
          </label>
          <div className="form-row">
            <label className="field">
              <span className="label">Timeline</span>
              <select className="select" value={goalForm.timeframe} onChange={(e) => setGoalForm({ ...goalForm, timeframe: e.target.value })}>
                {GOAL_TIMEFRAMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="label">Start date</span>
              <input className="input" type="date" value={goalForm.start_date}
                onChange={(e) => setGoalForm({ ...goalForm, start_date: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Target date</span>
              <input className="input" type="date" value={goalForm.target_date}
                onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })} />
            </label>
            {goalForm.id && (
              <label className="field">
                <span className="label">Status</span>
                <select className="select" value={goalForm.status} onChange={(e) => setGoalForm({ ...goalForm, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={saveGoal} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="btn btn-sm" onClick={() => { setGoalForm(null); setErr(""); }}>Cancel</button>
          </div>
          {err && <div className="error-text">{err}</div>}
        </div>
      )}

      {/* ── Milestone form ── */}
      {msForm && (
        <div className="card stack" style={{ marginTop: 16 }}>
          <div className="section-title">{msForm.id ? "Edit milestone" : `New milestone under "${goals.find((g) => g.id === msForm.goal_id)?.name ?? "goal"}"`}</div>
          <div className="form-row">
            <label className="field" style={{ flex: "2 1 260px" }}>
              <span className="label">Milestone title</span>
              <input className="input" autoFocus value={msForm.title}
                placeholder="e.g. Complete 150 DSA problems"
                onChange={(e) => setMsForm({ ...msForm, title: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") saveMilestone(); }} />
            </label>
            <label className="field" style={{ maxWidth: 160 }}>
              <span className="label">Target date</span>
              <input className="input" type="date" value={msForm.target_date}
                onChange={(e) => setMsForm({ ...msForm, target_date: e.target.value })} />
            </label>
            {msForm.id && (
              <label className="field" style={{ maxWidth: 140 }}>
                <span className="label">Status</span>
                <select className="select" value={msForm.status} onChange={(e) => setMsForm({ ...msForm, status: e.target.value })}>
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
            )}
          </div>
          <div className="form-row">
            <label className="field" style={{ flex: 1 }}>
              <span className="label">Explanation (why this milestone matters)</span>
              <input className="input" value={msForm.explanation}
                placeholder="What does completing this unlock?"
                onChange={(e) => setMsForm({ ...msForm, explanation: e.target.value })} />
            </label>
            <label className="field" style={{ maxWidth: 160 }}>
              <span className="label">Est. duration</span>
              <input className="input" value={msForm.estimated_duration}
                placeholder="e.g. 3 weeks"
                onChange={(e) => setMsForm({ ...msForm, estimated_duration: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span className="label">Success criteria</span>
            <input className="input" value={msForm.success_criteria}
              placeholder="How will you know this is done?"
              onChange={(e) => setMsForm({ ...msForm, success_criteria: e.target.value })} />
          </label>
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={saveMilestone} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="btn btn-sm" onClick={() => { setMsForm(null); setErr(""); }}>Cancel</button>
          </div>
          {err && <div className="error-text">{err}</div>}
        </div>
      )}
    </div>
  );
}
