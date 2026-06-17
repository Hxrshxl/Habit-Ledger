"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/AppDataProvider";
import {
  Habit, Entry, Goal, Milestone, buildEntryMap, ekey, eachDay, isScheduled, monthRange,
  statForRange, computeStreakBatch, localToday, weekdayOf, parseDate, addDays, fmt, categoryColor,
} from "@/lib/core";
import { jget, jsend } from "@/lib/client";
import ConfirmModal from "@/components/ConfirmModal";

type Mode = "mark" | "skip" | "note";

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface HabitForm {
  id?: number;
  name: string;
  category: string;
  goal: number;
  frequency_type: "daily" | "weekdays" | "weekly" | "interval";
  weekdays: string[];
  times_per_week: number;
  interval_days: number;
  quantity_target: number;
  quantity_unit: string;
  verify_type: "manual" | "leetcode" | "github";
  verify_username: string;
  verify_repo: string;
  goal_id: number | null;
  milestone_id: number | null;
  why: string;
}

const emptyForm = (): HabitForm => ({
  name: "", category: "General", goal: 30, frequency_type: "daily", weekdays: [],
  times_per_week: 3, interval_days: 14, quantity_target: 0, quantity_unit: "",
  verify_type: "manual", verify_username: "", verify_repo: "",
  goal_id: null, milestone_id: null, why: "",
});

export default function TrackerPage() {
  const today = localToday();
  const twoYearsAgo = fmt(addDays(parseDate(today), -730));
  const now = parseDate(today);
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const { habits, goals, milestones, appLoading, refresh: refreshData } = useAppData();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [mode, setMode] = useState<Mode>("mark");
  const [form, setForm] = useState<HabitForm | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [entriesLoading, setEntriesLoading] = useState(true);
  const loading = appLoading || entriesLoading;
  const [confirmDelete, setConfirmDelete] = useState<Habit | null>(null);
  const [nlText,    setNlText]    = useState("");
  const [nlParsing, setNlParsing] = useState(false);
  const [nlPreview, setNlPreview] = useState<HabitForm | null>(null);
  const [nlErr,     setNlErr]     = useState("");

  const { from, to } = monthRange(year, month0);

  // Close 3-dot dropdown when clicking outside any .action-menu
  useEffect(() => {
    if (menuOpen === null) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest(".action-menu")) setMenuOpen(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const load = useCallback(async (refreshHabits = false) => {
    setEntriesLoading(true);
    try {
      const fetches: Promise<unknown>[] = [
        jget<Entry[]>(`/api/entries?from=${from}&to=${to}`).then(setEntries),
        jget<Entry[]>(`/api/entries?from=${twoYearsAgo}&to=${today}`).then(setAllEntries),
      ];
      if (refreshHabits) fetches.push(refreshData());
      await Promise.all(fetches);
      setErr("");
    } catch (e) { setErr((e as Error).message); }
    setEntriesLoading(false);
  }, [from, to, twoYearsAgo, today, refreshData]);

  useEffect(() => { load(); }, [load]);

  const emap = useMemo(() => buildEntryMap(entries), [entries]);
  const allMap = useMemo(() => buildEntryMap(allEntries), [allEntries]);
  const days = useMemo(() => [...eachDay(from, to)], [from, to]);
  const visible = useMemo(() => habits.filter((h) => (showArchived ? true : !h.archived)), [habits, showArchived]);
  const allStreaks = useMemo(() => computeStreakBatch(visible, allMap, today), [visible, allMap, today]);

  function prevMonth() { const m = month0 - 1; if (m < 0) { setMonth0(11); setYear(year - 1); } else setMonth0(m); }
  function nextMonth() { const m = month0 + 1; if (m > 11) { setMonth0(0); setYear(year + 1); } else setMonth0(m); }

  async function clickCell(h: Habit, date: string) {
    if (date > today) return;
    const cur = emap.get(ekey(h.id, date));

    // Note and skip modes use prompts — no useful state to guess optimistically
    if (mode === "note") {
      const note = window.prompt("Note for this day (empty to clear):", cur?.note ?? "");
      if (note === null) return;
      try {
        await jsend("/api/entries/set", "POST", { habitId: h.id, date, status: cur?.status ?? null, quantity: cur?.quantity ?? null, note: note.trim() || null, source: "manual" });
        await load();
      } catch (e) { setErr((e as Error).message); }
      return;
    }
    if (mode === "skip") {
      const next = cur?.status === "skipped" ? null : "skipped";
      let note = cur?.note ?? null;
      if (next === "skipped") {
        const r = window.prompt("Reason for skipping (optional):", "");
        if (r === null) return;
        if (r.trim()) note = r.trim();
      }
      try {
        await jsend("/api/entries/set", "POST", { habitId: h.id, date, status: next, quantity: null, note, source: "manual" });
        await load();
      } catch (e) { setErr((e as Error).message); }
      return;
    }

    // Mark mode — collect quantity if needed, then optimistic update
    const nextStatus: "done" | null = cur?.status === "done" ? null : "done";
    let quantity: number | null = null;
    if (nextStatus === "done" && h.quantity_target > 0) {
      const q = window.prompt(`Quantity (${h.quantity_unit || "units"}, target ${h.quantity_target}):`, String(h.quantity_target));
      if (q === null) return;
      const n = Number(q);
      if (!Number.isFinite(n) || n < 0) { setErr("Invalid quantity"); return; }
      quantity = n;
    }

    // Optimistically update both entry lists before the network round-trip
    const applyOptimistic = (list: Entry[]): Entry[] => {
      const rest = list.filter((e) => !(e.habit_id === h.id && e.date === date));
      if (nextStatus === null) return rest;
      return [...rest, { habit_id: h.id, date, status: "done", quantity, note: cur?.note ?? null, source: "manual", created_at: new Date().toISOString() }];
    };
    setEntries((prev) => applyOptimistic(prev));
    setAllEntries((prev) => applyOptimistic(prev));

    try {
      await jsend("/api/entries/set", "POST", { habitId: h.id, date, status: nextStatus, quantity, note: cur?.note ?? null, source: "manual" });
    } catch (e) {
      setErr((e as Error).message);
      await load(); // roll back on error
    }
  }

  async function move(h: Habit, dir: -1 | 1) {
    const ids = visible.map((x) => x.id);
    const i = ids.indexOf(h.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await jsend("/api/habits/reorder", "POST", { ids }); await load(true); } catch (e) { setErr((e as Error).message); }
  }

  function openEdit(h?: Habit) {
    if (!h) { setForm(emptyForm()); return; }
    let vc: { username?: string; repo?: string } = {};
    try { vc = JSON.parse(h.verify_config || "{}"); } catch { /* ignore */ }
    setForm({
      id: h.id, name: h.name, category: h.category, goal: h.goal,
      frequency_type: h.frequency_type,
      weekdays: h.weekdays ? h.weekdays.split(",").filter(Boolean) : [],
      times_per_week: h.times_per_week || 3,
      interval_days: h.interval_days || 14,
      quantity_target: h.quantity_target, quantity_unit: h.quantity_unit,
      verify_type: h.verify_type, verify_username: vc.username ?? "", verify_repo: vc.repo ?? "",
      goal_id: h.goal_id, milestone_id: h.milestone_id ?? null, why: h.why ?? "",
    });
  }

  async function saveForm() {
    if (!form) return;
    if (!form.name.trim()) { setErr("Habit name is required"); return; }
    const body = {
      name: form.name.trim(), category: form.category.trim() || "General",
      goal: form.goal, frequency_type: form.frequency_type,
      weekdays: form.weekdays.join(","), times_per_week: form.times_per_week,
      interval_days: form.interval_days,
      quantity_target: form.quantity_target, quantity_unit: form.quantity_unit.trim(),
      verify_type: form.verify_type,
      verify_config: JSON.stringify({ username: form.verify_username.trim(), repo: form.verify_repo.trim() || undefined }),
      goal_id:      form.goal_id,
      milestone_id: form.milestone_id,
      why:          form.why.trim(),
    };
    try {
      if (form.id) await jsend(`/api/habits/${form.id}`, "PATCH", body);
      else await jsend(`/api/habits`, "POST", body);
      setForm(null); await load(true);
    } catch (e) { setErr((e as Error).message); }
  }

  async function archive(h: Habit) {
    try { await jsend(`/api/habits/${h.id}`, "PATCH", { archived: h.archived ? 0 : 1 }); await load(true); } catch (e) { setErr((e as Error).message); }
  }

  async function remove(h: Habit) {
    setConfirmDelete(h);
  }

  async function confirmRemove() {
    if (!confirmDelete) return;
    const h = confirmDelete;
    setConfirmDelete(null);
    try { await jsend(`/api/habits/${h.id}`, "DELETE"); await load(true); } catch (e) { setErr((e as Error).message); }
  }

  const dayTotals = useMemo(() => days.map((d) => {
    let done = 0, goal = 0;
    for (const h of visible) {
      if (h.archived || !isScheduled(h, d)) continue;
      goal++;
      const e = emap.get(ekey(h.id, d));
      if (e?.status === "done") done++;
      else if (e?.status === "skipped") goal--;
    }
    return { done, goal };
  }), [days, visible, emap]);

  async function parseNL() {
    if (!nlText.trim() || nlParsing) return;
    setNlParsing(true); setNlErr(""); setNlPreview(null);
    try {
      const parsed = await jsend<{
        name: string; category: string;
        frequency_type: HabitForm["frequency_type"];
        interval_days: number; weekdays: string;
        times_per_week: number; quantity_target: number;
        quantity_unit: string; why: string;
      }>("/api/habits/parse", "POST", { text: nlText.trim() });
      setNlPreview({
        name: parsed.name,
        category: parsed.category,
        frequency_type: parsed.frequency_type,
        weekdays: parsed.weekdays ? parsed.weekdays.split(",").filter(Boolean) : [],
        times_per_week: parsed.times_per_week,
        interval_days: parsed.interval_days,
        quantity_target: parsed.quantity_target,
        quantity_unit: parsed.quantity_unit,
        goal: 30,
        verify_type: "manual",
        verify_username: "",
        verify_repo: "",
        goal_id: null,
        milestone_id: null,
        why: parsed.why,
      });
    } catch (e) { setNlErr((e as Error).message); }
    setNlParsing(false);
  }

  async function saveNlPreview() {
    if (!nlPreview) return;
    setNlParsing(true);
    try {
      await jsend("/api/habits", "POST", {
        name:           nlPreview.name,
        category:       nlPreview.category,
        frequency_type: nlPreview.frequency_type,
        weekdays:       nlPreview.weekdays.join(","),
        times_per_week: nlPreview.times_per_week,
        interval_days:  nlPreview.interval_days,
        quantity_target: nlPreview.quantity_target,
        quantity_unit:  nlPreview.quantity_unit,
        goal:           30,
        verify_type:    "manual",
        verify_config:  "{}",
        milestone_id:   null,
        why:            nlPreview.why,
      });
      setNlText(""); setNlPreview(null); setNlErr("");
      await load(true);
    } catch (e) { setNlErr((e as Error).message); }
    setNlParsing(false);
  }

  if (loading) return <div className="muted">Loading…</div>;

  return (
    <div className="stack">
      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${confirmDelete.name}"?`}
          message="This will permanently delete the habit and ALL its history. Archiving is usually better."
          confirmLabel="Delete"
          danger
          onConfirm={confirmRemove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      <div className="page-head spread">
        <div className="row">
          <button className="btn btn-sm" onClick={prevMonth}>←</button>
          <h1>{MONTHS[month0]} {year}</h1>
          <button className="btn btn-sm" onClick={nextMonth}>→</button>
        </div>
        <div className="row">
          <div className="mode-pills">
            {(["mark", "skip", "note"] as Mode[]).map((m) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
                {m === "mark" ? "✓ Mark" : m === "skip" ? "⊘ Skip" : "✎ Note"}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => openEdit()}>+ New habit</button>
        </div>
      </div>

      {err && <div className="error-text">{err}</div>}

      {/* ── Natural Language Quick-Add ── */}
      <div className="card stack" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1, fontSize: 14 }}
            placeholder='Describe a habit… e.g. "cut nails twice a month" or "gym every Monday Wednesday Friday"'
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") parseNL(); }}
            disabled={nlParsing}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={parseNL}
            disabled={!nlText.trim() || nlParsing}
            style={{ flexShrink: 0 }}
          >
            {nlParsing ? <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> : "→"}
          </button>
        </div>

        {nlErr && <div className="error-text small">{nlErr} — try rephrasing</div>}

        {nlPreview && (
          <div style={{ border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: "12px 16px" }}>
            <div className="spread" style={{ marginBottom: 8 }}>
              <div className="section-title" style={{ margin: 0 }}>AI understood this as:</div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-primary btn-sm" onClick={saveNlPreview} disabled={nlParsing}>
                  {nlParsing ? "Saving…" : "✓ Save habit"}
                </button>
                <button className="btn btn-sm" onClick={() => { setNlPreview(null); setNlErr(""); }}>✕</button>
              </div>
            </div>
            <div className="form-row" style={{ gap: 8 }}>
              <label className="field" style={{ flex: "2 1 200px" }}>
                <span className="label">Name</span>
                <input className="input" value={nlPreview.name}
                  onChange={(e) => setNlPreview({ ...nlPreview, name: e.target.value })} />
              </label>
              <label className="field">
                <span className="label">Category</span>
                <select className="select" value={nlPreview.category}
                  onChange={(e) => setNlPreview({ ...nlPreview, category: e.target.value })}>
                  {["Health","Learning","Career","Finance","Personal","Routine","Other"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="field" style={{ maxWidth: 160 }}>
                <span className="label">Frequency</span>
                <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <span className="pill accent" style={{ fontSize: 12 }}>
                    {nlPreview.frequency_type === "daily" ? "Every day"
                      : nlPreview.frequency_type === "interval" ? `Every ${nlPreview.interval_days} days`
                      : nlPreview.frequency_type === "weekly" ? `${nlPreview.times_per_week}×/week`
                      : nlPreview.weekdays.map((w) => WD[Number(w)]).join(" ")}
                  </span>
                </div>
              </label>
            </div>
            {nlPreview.why && <div className="faint small" style={{ marginTop: 4 }}>→ {nlPreview.why}</div>}
            {nlPreview.quantity_target > 0 && (
              <div className="muted small" style={{ marginTop: 2 }}>
                Quantity: {nlPreview.quantity_target} {nlPreview.quantity_unit}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="muted small">
        Mark toggles done · Skip pauses streak &amp; shrinks target · Note adds journal (amber underline) · Green = auto-verified · Dashed = not scheduled
      </div>

      <div className="card grid-scroll">
        <table className="tracker">
          <thead>
            <tr>
              <th className="hcell">Habit</th>
              {days.map((d) => {
                const day = Number(d.slice(8));
                const wkEdge = day !== 1 && (day - 1) % 7 === 0;
                return (
                  <th key={d} className={`day-td ${wkEdge ? "wk-edge" : ""} ${d === today ? "today-col" : ""}`}>
                    <div className="day-wd">{WD[weekdayOf(d)]}</div>
                    <div className="day-num">{day}</div>
                  </th>
                );
              })}
              <th className="tail">Done</th>
              <th className="tail">Left</th>
              <th className="tail">%</th>
              <th className="tail">Streak</th>
              <th className="tail"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((h) => {
              const st = statForRange(h, emap, from, to);
              const sk = allStreaks.get(h.id) ?? { current: 0, longest: 0, freezes: 0, unit: "days" as const };
              const left = Math.max(0, st.target - st.skipped - st.done);
              return (
                <tr key={h.id} style={h.archived ? { opacity: 0.45 } : undefined}>
                  <td className="hcell">
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <span className="cat-dot" style={{ background: categoryColor(h.category), flexShrink: 0 }} title={h.category} />
                      <span className="hname">{h.name}</span>
                    </div>
                    {h.why && (
                      <div className="hwhy">{h.why}</div>
                    )}
                    <div className="hmeta">
                      {h.frequency_type === "daily" ? "daily"
                        : h.frequency_type === "interval" ? `every ${h.interval_days}d`
                        : h.frequency_type === "weekdays" ? h.weekdays.split(",").map((w) => WD[Number(w)]).join(" ")
                        : `${h.times_per_week}×/week`}
                      {h.quantity_target > 0 ? ` · ${h.quantity_target} ${h.quantity_unit}` : ""}
                      {h.verify_type !== "manual" ? ` · ${h.verify_type}` : ""}
                    </div>
                  </td>
                  {days.map((d) => {
                    const day = Number(d.slice(8));
                    const wkEdge = day !== 1 && (day - 1) % 7 === 0;
                    const e = emap.get(ekey(h.id, d));
                    const sched = isScheduled(h, d);
                    const cls = [
                      "cellbtn",
                      e?.status === "done" ? (e.source !== "manual" ? "verified" : "done") : "",
                      e?.status === "skipped" ? "skipped" : "",
                      e?.note ? "has-note" : "",
                      !sched ? "unsched" : "",
                    ].join(" ");
                    const label = e?.status === "done"
                      ? (h.quantity_target > 0 && e.quantity != null ? String(e.quantity) : "✓")
                      : e?.status === "skipped" ? "–" : "";
                    return (
                      <td key={d} className={`day-td ${wkEdge ? "wk-edge" : ""} ${d === today ? "today-col" : ""}`}>
                        <button
                          className={cls}
                          disabled={d > today}
                          title={[e?.note, e?.source && e.source !== "manual" ? `via ${e.source}` : ""].filter(Boolean).join(" · ")}
                          onClick={() => clickCell(h, d)}
                        >{label}</button>
                      </td>
                    );
                  })}
                  <td className="tail num">{st.done}</td>
                  <td className="tail num">{left}</td>
                  <td className="tail num">{st.pct}%</td>
                  <td className="tail num">{sk.current}{sk.freezes > 0 ? ` ❄${sk.freezes}` : ""}</td>
                  <td className="tail">
                    <div className="action-menu">
                      <button
                        className="btn btn-sm action-trigger"
                        onClick={() => setMenuOpen(menuOpen === h.id ? null : h.id)}
                        title="Actions"
                      >⋯</button>
                      {menuOpen === h.id && (
                        <div className="action-drop">
                          <button onClick={() => { move(h, -1); setMenuOpen(null); }}>↑ Move up</button>
                          <button onClick={() => { move(h, 1); setMenuOpen(null); }}>↓ Move down</button>
                          <hr />
                          <button onClick={() => { openEdit(h); setMenuOpen(null); }}>Edit</button>
                          <button onClick={() => { archive(h); setMenuOpen(null); }}>
                            {h.archived ? "Unarchive" : "Archive"}
                          </button>
                          <hr />
                          <button className="danger" onClick={() => { remove(h); setMenuOpen(null); }}>Delete</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="hcell muted">Done / Goal</td>
              {days.map((d, i) => {
                const day = Number(d.slice(8));
                const wkEdge = day !== 1 && (day - 1) % 7 === 0;
                return (
                  <td key={d} className={`day-td small num ${wkEdge ? "wk-edge" : ""}`}>
                    {dayTotals[i].done}/{dayTotals[i].goal}
                  </td>
                );
              })}
              <td className="tail" colSpan={5}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {form && (
        <div className="card stack">
          <div className="section-title">{form.id ? "Edit habit" : "New habit"}</div>
          <div className="form-row">
            <label className="field"><span className="label">Name</span>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field"><span className="label">Category</span>
              <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </label>
            <label className="field"><span className="label">Monthly goal</span>
              <input className="input" type="number" min={1} max={31} value={form.goal} onChange={(e) => setForm({ ...form, goal: Number(e.target.value) })} />
            </label>
          </div>
          <div className="form-row">
            <label className="field"><span className="label">Frequency</span>
              <select className="select" value={form.frequency_type} onChange={(e) => setForm({ ...form, frequency_type: e.target.value as HabitForm["frequency_type"] })}>
                <option value="daily">Every day</option>
                <option value="weekdays">Specific weekdays</option>
                <option value="weekly">X times per week</option>
                <option value="interval">Every N days</option>
              </select>
            </label>
            {form.frequency_type === "weekdays" && (
              <div className="field"><span className="label">Days</span>
                <div className="row">
                  {WD.map((w, i) => (
                    <button key={w} type="button"
                      className={`pill ${form.weekdays.includes(String(i)) ? "accent" : ""}`}
                      onClick={() => setForm({
                        ...form,
                        weekdays: form.weekdays.includes(String(i))
                          ? form.weekdays.filter((x) => x !== String(i))
                          : [...form.weekdays, String(i)].sort(),
                      })}>{w}</button>
                  ))}
                </div>
              </div>
            )}
            {form.frequency_type === "weekly" && (
              <label className="field"><span className="label">Times per week</span>
                <input className="input" type="number" min={1} max={7} value={form.times_per_week} onChange={(e) => setForm({ ...form, times_per_week: Number(e.target.value) })} />
              </label>
            )}
            {form.frequency_type === "interval" && (
              <label className="field">
                <span className="label">Repeat every</span>
                <div className="row" style={{ gap: 6 }}>
                  <input className="input" type="number" min={1} max={365} value={form.interval_days}
                    onChange={(e) => setForm({ ...form, interval_days: Number(e.target.value) })}
                    style={{ width: 80 }} />
                  <span className="muted small" style={{ alignSelf: "center", whiteSpace: "nowrap" }}>days</span>
                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                    {[{label:"7d", v:7},{label:"14d", v:14},{label:"30d", v:30},{label:"90d", v:90}].map(({label,v}) => (
                      <button key={v} type="button"
                        className={`pill ${form.interval_days === v ? "accent" : ""}`}
                        onClick={() => setForm({ ...form, interval_days: v })}>{label}</button>
                    ))}
                  </div>
                </div>
              </label>
            )}
          </div>
          <div className="form-row">
            <label className="field"><span className="label">Quantity target (0 = checkbox)</span>
              <input className="input" type="number" min={0} value={form.quantity_target} onChange={(e) => setForm({ ...form, quantity_target: Number(e.target.value) })} />
            </label>
            <label className="field"><span className="label">Unit</span>
              <input className="input" placeholder="problems / litres / pages" value={form.quantity_unit} onChange={(e) => setForm({ ...form, quantity_unit: e.target.value })} />
            </label>
            <label className="field"><span className="label">Linked milestone</span>
              <select className="select" value={form.milestone_id ?? ""} onChange={(e) => setForm({ ...form, milestone_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— none —</option>
                {goals.map((g) => {
                  const gMs = milestones.filter((m) => m.goal_id === g.id);
                  return gMs.length > 0 ? (
                    <optgroup key={g.id} label={g.name}>
                      {gMs.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label className="field" style={{ flex: "2 1 300px" }}><span className="label">Why this habit? (one line, shown in grid)</span>
              <input className="input" placeholder="e.g. → Razorpay backend interview" value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} />
            </label>
          </div>
          <div className="form-row">
            <label className="field"><span className="label">Auto-verification</span>
              <select className="select" value={form.verify_type} onChange={(e) => setForm({ ...form, verify_type: e.target.value as HabitForm["verify_type"] })}>
                <option value="manual">Manual (checkbox)</option>
                <option value="leetcode">LeetCode accepted submission</option>
                <option value="github">GitHub push</option>
              </select>
            </label>
            {form.verify_type !== "manual" && (
              <label className="field"><span className="label">{form.verify_type === "leetcode" ? "LeetCode username" : "GitHub username"}</span>
                <input className="input" value={form.verify_username} onChange={(e) => setForm({ ...form, verify_username: e.target.value })} />
              </label>
            )}
            {form.verify_type === "github" && (
              <label className="field"><span className="label">Repo filter (optional, e.g. user/notes)</span>
                <input className="input" value={form.verify_repo} onChange={(e) => setForm({ ...form, verify_repo: e.target.value })} />
              </label>
            )}
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={saveForm}>Save</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
            {form.verify_type !== "manual" && <span className="muted small">Run verification from Settings → back-fills last 30 days.</span>}
          </div>
        </div>
      )}

      <div className="row">
        <label className="row small muted" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> show archived
        </label>
      </div>
    </div>
  );
}
