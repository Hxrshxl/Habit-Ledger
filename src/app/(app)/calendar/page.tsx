"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/AppDataProvider";
import { buildEntryMap, ekey, isScheduled, localToday, parseDate, fmt, addDays } from "@/lib/core";
import type { Entry, ContextDay } from "@/lib/core";
import { jget } from "@/lib/client";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MOODS = ["","😞","😕","😐","🙂","😄"];
const ENERGY = ["","🪫","😴","⚡","🔥","🚀"];

function monthBounds(year: number, month: number) {
  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function cellColor(pct: number): string {
  if (pct === 0) return "var(--border)";
  if (pct < 50) return "var(--amber-soft)";
  if (pct < 80) return "var(--accent-soft)";
  return "var(--green-soft)";
}
function cellBorder(pct: number): string {
  if (pct === 0) return "var(--border)";
  if (pct < 50) return "var(--amber)";
  if (pct < 80) return "var(--accent)";
  return "var(--green)";
}

export default function CalendarPage() {
  const today = localToday();
  const now = parseDate(today);
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [contexts, setContexts] = useState<ContextDay[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { habits } = useAppData();

  const { from, to } = useMemo(() => monthBounds(year, month0), [year, month0]);

  const load = useCallback(async () => {
    setLoading(true);
    const [e, c] = await Promise.all([
      jget<Entry[]>(`/api/entries?from=${from}&to=${to}`),
      jget<ContextDay[]>(`/api/context?from=${from}&to=${to}`),
    ]);
    setEntries(e ?? []);
    setContexts(c ?? []);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const emap = useMemo(() => buildEntryMap(entries), [entries]);
  const ctxMap = useMemo(() => {
    const m = new Map<string, ContextDay>();
    for (const c of contexts) m.set(c.date, c);
    return m;
  }, [contexts]);

  function prevMonth() { if (month0 === 0) { setMonth0(11); setYear(y => y - 1); } else setMonth0(m => m - 1); }
  function nextMonth() { if (month0 === 11) { setMonth0(0); setYear(y => y + 1); } else setMonth0(m => m + 1); }

  // Build calendar grid
  const firstWd = new Date(year, month0, 1).getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(firstWd).fill(null)];
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  function dayStats(date: string) {
    const scheduled = habits.filter(h => !h.archived && isScheduled(h, date));
    const done = scheduled.filter(h => emap.get(ekey(h.id, date))?.status === "done");
    const skipped = scheduled.filter(h => emap.get(ekey(h.id, date))?.status === "skipped");
    const missed = scheduled.filter(h => {
      const e = emap.get(ekey(h.id, date));
      return !e && date < today;
    });
    const effective = scheduled.length - skipped.length;
    const pct = effective > 0 ? Math.round((done.length / effective) * 100) : 0;
    return { scheduled, done, skipped, missed, pct, effective };
  }

  const selStats = selectedDay ? dayStats(selectedDay) : null;
  const selCtx = selectedDay ? ctxMap.get(selectedDay) : null;

  return (
    <div className="stack">
      <div className="page-head spread">
        <h1>Calendar</h1>
        <div className="row">
          <button className="btn btn-sm" onClick={prevMonth}>←</button>
          <span style={{ fontWeight: 600, minWidth: 130, textAlign: "center" }}>{MONTHS[month0]} {year}</span>
          <button className="btn btn-sm" onClick={nextMonth}>→</button>
          <button className="btn btn-sm" onClick={() => { setYear(now.getFullYear()); setMonth0(now.getMonth()); }} disabled={year === now.getFullYear() && month0 === now.getMonth()}>Today</button>
        </div>
      </div>

      {/* Weekday headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {WD.map(w => (
          <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 0" }}>{w}</div>
        ))}

        {/* Day cells */}
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const isFuture = date > today;
          const isToday = date === today;
          const stats = !isFuture ? dayStats(date) : null;
          const ctx = ctxMap.get(date);
          const isSelected = date === selectedDay;

          return (
            <div
              key={date}
              onClick={() => !isFuture && setSelectedDay(isSelected ? null : date)}
              style={{
                borderRadius: "var(--radius-sm)",
                border: `2px solid ${isSelected ? "var(--accent)" : isToday ? "var(--accent)" : stats ? cellBorder(stats.pct) : "var(--border)"}`,
                background: isFuture ? "transparent" : stats ? cellColor(stats.pct) : "transparent",
                padding: "6px 4px",
                cursor: isFuture ? "default" : "pointer",
                minHeight: 56,
                opacity: isFuture ? 0.35 : 1,
                transition: "box-shadow 0.1s",
              }}
              onMouseEnter={e => { if (!isFuture) e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--accent)" : "var(--text)", textAlign: "right", marginBottom: 4 }}>
                {Number(date.slice(8))}
              </div>
              {stats && stats.effective > 0 && (
                <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center" }}>
                  {stats.done.length}/{stats.effective}
                </div>
              )}
              {ctx && (ctx.mood || ctx.energy) && (
                <div style={{ textAlign: "center", fontSize: 12, marginTop: 2 }}>
                  {ctx.mood ? MOODS[ctx.mood] : ""}{ctx.energy ? ENERGY[ctx.energy] : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="row muted small" style={{ gap: 16, flexWrap: "wrap" }}>
        {[["var(--border)","No data"],["var(--amber-soft)","< 50%"],["var(--accent-soft)","50–79%"],["var(--green-soft)","≥ 80%"]].map(([bg, lbl]) => (
          <span key={lbl} className="row" style={{ gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: "1px solid var(--border)", display: "inline-block" }} />
            {lbl}
          </span>
        ))}
      </div>

      {/* Day detail panel */}
      {selectedDay && selStats && (
        <div className="card stack" style={{ marginTop: 4 }}>
          <div className="spread">
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {parseDate(selectedDay).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <div className="row" style={{ gap: 8 }}>
              {selCtx?.mood && <span title="Mood">{MOODS[selCtx.mood]} mood {selCtx.mood}/5</span>}
              {selCtx?.energy && <span title="Energy">{ENERGY[selCtx.energy]} energy {selCtx.energy}/5</span>}
              {selCtx?.sleep_hours && <span className="muted small">😴 {selCtx.sleep_hours}h sleep</span>}
              <button className="btn btn-sm" onClick={() => setSelectedDay(null)}>✕</button>
            </div>
          </div>

          {selCtx?.notes && (
            <div style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic", borderLeft: "3px solid var(--border)", paddingLeft: 10 }}>
              {selCtx.notes}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {/* Done */}
            {selStats.done.length > 0 && (
              <div>
                <div className="stat-label" style={{ color: "var(--green)", marginBottom: 6 }}>✓ Done ({selStats.done.length})</div>
                {selStats.done.map(h => {
                  const e = emap.get(ekey(h.id, selectedDay));
                  return (
                    <div key={h.id} style={{ fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
                      {h.name}
                      {e?.duration_minutes && <span className="muted"> · {e.duration_minutes}m</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Skipped */}
            {selStats.skipped.length > 0 && (
              <div>
                <div className="stat-label" style={{ color: "var(--amber)", marginBottom: 6 }}>– Skipped ({selStats.skipped.length})</div>
                {selStats.skipped.map(h => (
                  <div key={h.id} style={{ fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>{h.name}</div>
                ))}
              </div>
            )}
            {/* Missed */}
            {selStats.missed.length > 0 && (
              <div>
                <div className="stat-label" style={{ color: "var(--red)", marginBottom: 6 }}>· Missed ({selStats.missed.length})</div>
                {selStats.missed.map(h => (
                  <div key={h.id} style={{ fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--border)", color: "var(--faint)" }}>{h.name}</div>
                ))}
              </div>
            )}
          </div>

          {selStats.effective === 0 && (
            <div className="state-note">No habits scheduled for this day.</div>
          )}
        </div>
      )}

      {loading && <div className="muted small">Loading…</div>}
    </div>
  );
}
