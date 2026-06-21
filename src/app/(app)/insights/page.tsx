"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/AppDataProvider";
import {
  Habit, Entry, Experiment, buildEntryMap, monthRange, statForRange,
  gradeOf, weekdayMatrix, pairLift, localToday, parseDate, addDays, fmt, pad, categoryColor,
} from "@/lib/core";
import { jget, jsend } from "@/lib/client";

const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface Ev { id: number; at: string; kind: string; detail: string }

export default function InsightsPage() {
  const today = localToday();
  const now = parseDate(today);
  const { habits: allHabits, appLoading } = useAppData();
  const habits = allHabits.filter(h => !h.archived);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [exps, setExps] = useState<Experiment[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [coach, setCoach] = useState<string>("");
  const [coachBusy, setCoachBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const loading = appLoading || dataLoading;
  const [expForm, setExpForm] = useState({ name: "", habit_id: "", a_label: "Condition A", a_from: "", a_to: "", b_label: "Condition B", b_from: "", b_to: "" });

  const load = useCallback(async () => {
    setDataLoading(true);
    try {
      const [es, xs, evs] = await Promise.all([
        jget<Entry[]>(`/api/entries?from=${fmt(addDays(now, -90))}&to=${today}`),
        jget<Experiment[]>("/api/experiments"),
        jget<Ev[]>("/api/events"),
      ]);
      setEntries(es); setExps(xs); setEvents(evs); setErr("");
    } catch (e) { setErr((e as Error).message); }
    setDataLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  // Set default habit for experiment form once habits arrive from context
  useEffect(() => {
    if (habits.length && !expForm.habit_id) {
      setExpForm(f => ({ ...f, habit_id: habits[0].id }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits.length]);

  const emap = useMemo(() => buildEntryMap(entries), [entries]);
  const last90from = fmt(addDays(now, -89));

  // ---- report card (this month vs last) ----
  const thisM = monthRange(now.getFullYear(), now.getMonth());
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastM = monthRange(lastDate.getFullYear(), lastDate.getMonth());

  const report = useMemo(() => {
    const rows = habits.map((h) => ({
      h,
      cur: statForRange(h, emap, thisM.from, thisM.to),
      prev: statForRange(h, emap, lastM.from, lastM.to),
    }));
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    const curPct = avg(rows.map((r) => r.cur.pct));
    const prevPct = avg(rows.map((r) => r.prev.pct));
    const best = [...rows].sort((a, b) => b.cur.pct - a.cur.pct)[0];
    const worst = [...rows].sort((a, b) => a.cur.pct - b.cur.pct)[0];
    return { rows, curPct, prevPct, best, worst };
  }, [habits, emap, thisM.from, thisM.to, lastM.from, lastM.to]);

  // ---- weekday matrix over last 90 days ----
  const wkRows = useMemo(() => habits.map((h) => ({ h, m: weekdayMatrix(h, emap, last90from, today) })), [habits, emap, last90from, today]);

  // ---- pair lifts (top 6 by |lift|) ----
  const lifts = useMemo(() => {
    const out: { a: Habit; b: Habit; lift: number; baseB: number; condB: number; n: number }[] = [];
    for (const a of habits) for (const b of habits) {
      if (a.id === b.id) continue;
      const r = pairLift(a, b, emap, last90from, today);
      if (r) out.push({ a, b, ...r });
    }
    return out.sort((x, y) => Math.abs(y.lift) - Math.abs(x.lift)).slice(0, 6);
  }, [habits, emap, last90from, today]);


  // ---- weekly time (last 7 days duration sum per habit) ----
  const weeklyTime = useMemo(() => {
    const from7 = fmt(addDays(now, -7));
    const result: { h: Habit; minutes: number }[] = [];
    for (const h of habits) {
      let total = 0;
      for (const e of entries) {
        if (e.habit_id === h.id && e.date >= from7 && e.date <= today && e.duration_minutes) {
          total += e.duration_minutes;
        }
      }
      if (total > 0) result.push({ h, minutes: total });
    }
    return result.sort((a, b) => b.minutes - a.minutes);
  }, [habits, entries, today, now]);

  // ---- network graph edges (unique pairs, |lift| >= 0.1, n >= 14) ----
  const netEdges = useMemo(() => {
    const out: { a: Habit; b: Habit; lift: number; n: number }[] = [];
    for (let i = 0; i < habits.length; i++) {
      for (let j = i + 1; j < habits.length; j++) {
        const a = habits[i], b = habits[j];
        const r = pairLift(a, b, emap, last90from, today);
        if (r && Math.abs(r.lift) >= 0.1 && r.n >= 14) out.push({ a, b, lift: r.lift, n: r.n });
      }
    }
    return out;
  }, [habits, emap, last90from, today]);

  async function runCoach() {
    setCoachBusy(true); setCoach("");
    try {
      const r = await jsend<{ advice: string }>("/api/coach", "POST", {});
      setCoach(r.advice);
    } catch (e) { setCoach(`Coach unavailable: ${(e as Error).message}`); }
    setCoachBusy(false);
  }

  async function saveExp() {
    const f = expForm;
    if (!f.name || !f.a_from || !f.a_to || !f.b_from || !f.b_to) { setErr("Experiment needs a name and both date ranges"); return; }
    try {
      await jsend("/api/experiments", "POST", f);
      setExpForm({ ...f, name: "" });
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

  async function delExp(id: string) {
    try { await jsend(`/api/experiments/${id}`, "DELETE"); await load(); } catch (e) { setErr((e as Error).message); }
  }

  if (loading) return <div className="muted">Loading…</div>;

  return (
    <div className="stack">
      <div className="page-head"><h1>Insights</h1></div>
      {err && <div className="error-text">{err}</div>}

      {/* Report card */}
      <div className="card stack">
        <div className="section-title">Report card — {MONTHS[now.getMonth()]} {now.getFullYear()}</div>
        <div className="row" style={{ gap: 28 }}>
          <div><div className="stat-value">{gradeOf(report.curPct)}</div><div className="stat-label">grade · {report.curPct}% avg</div></div>
          <div><div className="stat-value">{report.curPct - report.prevPct >= 0 ? "+" : ""}{report.curPct - report.prevPct}%</div><div className="stat-label">vs last month ({report.prevPct}%)</div></div>
          {report.best && <div><div className="stat-value small-stat">{report.best.h.name}</div><div className="stat-label">strongest · {report.best.cur.pct}%</div></div>}
          {report.worst && <div><div className="stat-value small-stat">{report.worst.h.name}</div><div className="stat-label">weakest · {report.worst.cur.pct}%</div></div>}
        </div>
        <table className="table">
          <thead><tr><th>Habit</th><th className="num">This month</th><th className="num">Last month</th><th className="num">Δ</th><th>Grade</th></tr></thead>
          <tbody>
            {report.rows.map(({ h, cur, prev }) => (
              <tr key={h.id}>
                <td>{h.name}</td>
                <td className="num">{cur.pct}%</td>
                <td className="num">{prev.pct}%</td>
                <td className="num" style={{ color: cur.pct - prev.pct >= 0 ? "var(--green)" : "var(--red)" }}>{cur.pct - prev.pct >= 0 ? "+" : ""}{cur.pct - prev.pct}</td>
                <td>{gradeOf(cur.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Weekday matrix */}
      <div className="card stack">
        <div className="section-title">Weekday performance — last 90 days</div>
        <div className="muted small">Red cells are where your week leaks. Schedule around them or change the habit's frequency.</div>
        <table className="table">
          <thead><tr><th>Habit</th>{WD.map((w) => <th key={w} className="num">{w}</th>)}</tr></thead>
          <tbody>
            {wkRows.map(({ h, m }) => (
              <tr key={h.id}>
                <td>{h.name}</td>
                {m.map((c, i) => {
                  const pct = c.sched ? Math.round((c.done / c.sched) * 100) : null;
                  const color = pct === null ? "var(--muted)" : pct >= 70 ? "var(--green)" : pct >= 40 ? "var(--amber)" : "var(--red)";
                  return <td key={i} className="num" style={{ color }}>{pct === null ? "—" : `${pct}%`}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pair lifts */}
      <div className="card stack">
        <div className="section-title">Habit correlations — last 90 days</div>
        <div className="muted small">“When A happens, how much more likely is B?” Needs 14+ shared days to show.</div>
        {lifts.length === 0 ? <div className="muted">Not enough data yet — keep tracking for ~2 weeks.</div> : (
          <table className="table">
            <thead><tr><th>When you do…</th><th>…this changes</th><th className="num">Baseline</th><th className="num">Given A</th><th className="num">Lift</th></tr></thead>
            <tbody>
              {lifts.map((r, i) => (
                <tr key={i}>
                  <td>{r.a.name}</td>
                  <td>{r.b.name}</td>
                  <td className="num">{Math.round(r.baseB * 100)}%</td>
                  <td className="num">{Math.round(r.condB * 100)}%</td>
                  <td className="num" style={{ color: r.lift >= 0 ? "var(--green)" : "var(--red)" }}>{r.lift >= 0 ? "+" : ""}{Math.round(r.lift * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Weekly time */}
      {weeklyTime.length > 0 && (
        <div className="card stack">
          <div className="section-title">Time spent — last 7 days</div>
          <div className="muted small">Logged when you tap &quot;done&quot; and enter minutes. Only habits with time logged appear here.</div>
          {(() => {
            const maxMins = Math.max(...weeklyTime.map(r => r.minutes));
            return (
              <div className="stack" style={{ gap: 8 }}>
                {weeklyTime.map(({ h, minutes }) => {
                  const hrs = Math.floor(minutes / 60);
                  const mins = minutes % 60;
                  const label = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                  return (
                    <div key={h.id} className="stack" style={{ gap: 3 }}>
                      <div className="spread">
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{h.name}</span>
                        <span className="muted small">{label}</span>
                      </div>
                      <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.round((minutes / maxMins) * 100)}%`, background: categoryColor(h.category), borderRadius: 4, transition: "width 0.4s" }} />
                      </div>
                    </div>
                  );
                })}
                <div className="muted small" style={{ textAlign: "right" }}>
                  Total: {(() => { const t = weeklyTime.reduce((a, r) => a + r.minutes, 0); const h = Math.floor(t / 60); return h > 0 ? `${h}h ${t % 60}m` : `${t}m`; })()}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Network graph */}
      <div className="card stack">
        <div className="section-title">Habit correlation network</div>
        <div className="muted small">Green edge = doing A boosts B. Red = negative correlation. Edges appear at ≥10% lift with ≥14 shared days.</div>
        {netEdges.length === 0 ? (
          <div className="muted">Not enough correlated pairs yet — keep tracking for ~2 weeks.</div>
        ) : (() => {
          // Build unique node set from edges
          const nodeMap = new Map<string, Habit>();
          for (const e of netEdges) { nodeMap.set(e.a.id, e.a); nodeMap.set(e.b.id, e.b); }
          const nodes = [...nodeMap.values()];
          const n = nodes.length;
          const CX = 300, CY = 220, R = Math.min(160, 40 * n);
          const pos = nodes.map((_, i) => ({
            x: CX + R * Math.cos((2 * Math.PI * i) / n - Math.PI / 2),
            y: CY + R * Math.sin((2 * Math.PI * i) / n - Math.PI / 2),
          }));
          const idxMap = new Map(nodes.map((h, i) => [h.id, i]));
          return (
            <svg viewBox={`0 0 600 ${CY * 2 + 80}`} style={{ width: "100%", maxWidth: 600 }}>
              {/* Edges */}
              {netEdges.map((e, ei) => {
                const ai = idxMap.get(e.a.id)!;
                const bi = idxMap.get(e.b.id)!;
                const pa = pos[ai], pb = pos[bi];
                const strokeW = Math.max(1, Math.min(5, Math.abs(e.lift) * 15));
                return (
                  <line key={ei}
                    x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                    stroke={e.lift >= 0 ? "var(--green)" : "var(--red)"}
                    strokeWidth={strokeW} strokeOpacity={0.55}
                  >
                    <title>{e.a.name} ↔ {e.b.name}: {e.lift >= 0 ? "+" : ""}{Math.round(e.lift * 100)}% lift</title>
                  </line>
                );
              })}
              {/* Nodes */}
              {nodes.map((h, i) => {
                const p = pos[i];
                const words = h.name.split(" ").slice(0, 2).join(" ");
                return (
                  <g key={h.id}>
                    <circle cx={p.x} cy={p.y} r={20} fill={categoryColor(h.category)} fillOpacity={0.85} stroke="var(--bg)" strokeWidth={2}>
                      <title>{h.name}</title>
                    </circle>
                    <text x={p.x} y={p.y + 34} textAnchor="middle" fontSize={9} fill="var(--muted)" style={{ userSelect: "none" }}>{words}</text>
                  </g>
                );
              })}
            </svg>
          );
        })()}
        <div className="row muted small" style={{ gap: 16 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 16, height: 3, background: "var(--green)", borderRadius: 2, display: "inline-block" }} /> Positive lift</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 16, height: 3, background: "var(--red)", borderRadius: 2, display: "inline-block" }} /> Negative lift</span>
        </div>
      </div>

      {/* Experiments */}
      <div className="card stack">
        <div className="section-title">Self-experiments (A/B)</div>
        <div className="muted small">Compare your own completion rate across two date ranges — e.g. “DSA before work” vs “after work”.</div>
        {exps.map((x) => {
          const h = habits.find((hh) => hh.id === x.habit_id);
          if (!h) return null;
          const a = statForRange(h, emap, x.a_from, x.a_to);
          const b = statForRange(h, emap, x.b_from, x.b_to);
          const winner = a.pct === b.pct ? "Tie" : a.pct > b.pct ? x.a_label : x.b_label;
          return (
            <div key={x.id} className="section">
              <div className="spread">
                <strong>{x.name}</strong>
                <button className="btn btn-sm btn-danger" onClick={() => delExp(x.id)}>✕</button>
              </div>
              <div className="small muted">{h.name}</div>
              <table className="table">
                <thead><tr><th></th><th>Range</th><th className="num">Done</th><th className="num">%</th></tr></thead>
                <tbody>
                  <tr><td>{x.a_label}</td><td className="mono small">{x.a_from} → {x.a_to}</td><td className="num">{a.done}</td><td className="num">{a.pct}%</td></tr>
                  <tr><td>{x.b_label}</td><td className="mono small">{x.b_from} → {x.b_to}</td><td className="num">{b.done}</td><td className="num">{b.pct}%</td></tr>
                </tbody>
              </table>
              <div className="small">Winner: <strong>{winner}</strong> {a.pct !== b.pct && <span className="muted">by {Math.abs(a.pct - b.pct)} points</span>}</div>
            </div>
          );
        })}
        <div className="form-row">
          <label className="field"><span className="label">Name</span><input className="input" value={expForm.name} onChange={(e) => setExpForm({ ...expForm, name: e.target.value })} placeholder="DSA morning vs evening" /></label>
          <label className="field"><span className="label">Habit</span>
            <select className="select" value={expForm.habit_id} onChange={(e) => setExpForm({ ...expForm, habit_id: e.target.value })}>
              {habits.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label className="field"><span className="label">A label</span><input className="input" value={expForm.a_label} onChange={(e) => setExpForm({ ...expForm, a_label: e.target.value })} /></label>
          <label className="field"><span className="label">A from</span><input className="input" type="date" value={expForm.a_from} onChange={(e) => setExpForm({ ...expForm, a_from: e.target.value })} /></label>
          <label className="field"><span className="label">A to</span><input className="input" type="date" value={expForm.a_to} onChange={(e) => setExpForm({ ...expForm, a_to: e.target.value })} /></label>
        </div>
        <div className="form-row">
          <label className="field"><span className="label">B label</span><input className="input" value={expForm.b_label} onChange={(e) => setExpForm({ ...expForm, b_label: e.target.value })} /></label>
          <label className="field"><span className="label">B from</span><input className="input" type="date" value={expForm.b_from} onChange={(e) => setExpForm({ ...expForm, b_from: e.target.value })} /></label>
          <label className="field"><span className="label">B to</span><input className="input" type="date" value={expForm.b_to} onChange={(e) => setExpForm({ ...expForm, b_to: e.target.value })} /></label>
        </div>
        <div><button className="btn btn-primary btn-sm" onClick={saveExp}>Add experiment</button></div>
      </div>

      {/* AI coach */}
      <div className="card stack">
        <div className="section-title">AI coach</div>
        <div className="muted small">Sends your last 30 days of stats (numbers only) to Gemini and returns 3 specific suggestions. Requires GEMINI_API_KEY in .env.local.</div>
        <div><button className="btn btn-sm" onClick={runCoach} disabled={coachBusy}>{coachBusy ? "Thinking…" : "Get coaching"}</button></div>
        {coach && <div className="section" style={{ whiteSpace: "pre-wrap" }}>{coach}</div>}
      </div>

      {/* Audit log */}
      <div className="card stack">
        <div className="section-title">Recent activity (audit log)</div>
        <table className="table">
          <thead><tr><th>When</th><th>Event</th><th>Detail</th></tr></thead>
          <tbody>
            {events.slice(0, 25).map((ev) => (
              <tr key={ev.id}><td className="mono small">{ev.at}</td><td>{ev.kind}</td><td className="small muted">{ev.detail}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
