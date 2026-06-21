"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { jget, jsend } from "@/lib/client";
import type { ContextDay } from "@/lib/core";
import { addDays, fmt, localToday, parseDate } from "@/lib/core";

const MOODS = ["", "😞", "😕", "😐", "🙂", "😄"];
const ENERGY = ["", "🪫", "😴", "⚡", "🔥", "🚀"];

function fmtDisplay(date: string) {
  const d = parseDate(date);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function JournalPage() {
  const today = localToday();
  const [date, setDate] = useState(today);
  const [ctx, setCtx] = useState<ContextDay>({ date, mood: null, energy: null, sleep_hours: null, notes: null });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<ContextDay[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [day, hist] = await Promise.all([
      jget<ContextDay | null>(`/api/context?date=${date}`),
      jget<ContextDay[]>(`/api/context?from=${fmt(addDays(parseDate(date), -6))}&to=${date}`),
    ]);
    setCtx(day ?? { date, mood: null, energy: null, sleep_hours: null, notes: null });
    setHistory(hist.filter(h => h.date !== date).reverse());
    setSaved(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  async function save(patch: Partial<ContextDay>) {
    const updated = { ...ctx, ...patch };
    setCtx(updated);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await jsend("/api/context", "POST", {
        date: updated.date,
        mood: updated.mood,
        energy: updated.energy,
        sleep_hours: updated.sleep_hours,
        notes: updated.notes,
      });
      setSaving(false);
      setSaved(true);
    }, 600);
  }

  function go(dir: -1 | 1) {
    setDate(prev => fmt(addDays(parseDate(prev), dir)));
  }

  return (
    <div className="stack">
      {/* Header */}
      <div className="page-head spread">
        <div>
          <h1>Journal</h1>
          <div className="muted" style={{ fontSize: 13 }}>Daily mood, energy, sleep & notes</div>
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={() => go(-1)}>← Prev</button>
          <button className="btn btn-sm" onClick={() => setDate(today)} disabled={date === today}>Today</button>
          <button className="btn btn-sm" onClick={() => go(1)} disabled={date >= today}>Next →</button>
        </div>
      </div>

      {/* Date label */}
      <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtDisplay(date)}</div>

      {/* Metrics row */}
      <div className="card">
        <div className="form-row" style={{ gap: 24 }}>
          {/* Mood */}
          <div className="field" style={{ flex: "1 1 120px" }}>
            <span className="label">Mood</span>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              {[1,2,3,4,5].map(v => (
                <button
                  key={v}
                  onClick={() => save({ mood: ctx.mood === v ? null : v })}
                  style={{
                    fontSize: 22, background: "none", border: "2px solid",
                    borderColor: ctx.mood === v ? "var(--accent)" : "var(--border)",
                    borderRadius: "var(--radius-sm)", padding: "4px 6px",
                    opacity: ctx.mood && ctx.mood !== v ? 0.4 : 1,
                  }}
                  title={`Mood ${v}/5`}
                >{MOODS[v]}</button>
              ))}
            </div>
          </div>

          {/* Energy */}
          <div className="field" style={{ flex: "1 1 120px" }}>
            <span className="label">Energy</span>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              {[1,2,3,4,5].map(v => (
                <button
                  key={v}
                  onClick={() => save({ energy: ctx.energy === v ? null : v })}
                  style={{
                    fontSize: 22, background: "none", border: "2px solid",
                    borderColor: ctx.energy === v ? "var(--accent)" : "var(--border)",
                    borderRadius: "var(--radius-sm)", padding: "4px 6px",
                    opacity: ctx.energy && ctx.energy !== v ? 0.4 : 1,
                  }}
                  title={`Energy ${v}/5`}
                >{ENERGY[v]}</button>
              ))}
            </div>
          </div>

          {/* Sleep */}
          <div className="field" style={{ flex: "0 0 110px" }}>
            <span className="label">Sleep (hrs)</span>
            <input
              className="input"
              type="number" min={0} max={24} step={0.5}
              value={ctx.sleep_hours ?? ""}
              placeholder="7.5"
              onChange={e => save({ sleep_hours: e.target.value ? Number(e.target.value) : null })}
              style={{ marginTop: 4 }}
            />
          </div>
        </div>
      </div>

      {/* Notes textarea */}
      <div className="card stack" style={{ gap: 8 }}>
        <div className="spread">
          <span className="label" style={{ marginBottom: 0 }}>Notes / Journal Entry</span>
          <span className="muted small">{saving ? "Saving…" : saved ? "Saved ✓" : ""}</span>
        </div>
        <textarea
          className="input"
          style={{ resize: "vertical", minHeight: 160, fontSize: 14, lineHeight: 1.6 }}
          placeholder={`What happened today? What did you learn? How do you feel?\n\nThis is your private space…`}
          value={ctx.notes ?? ""}
          onChange={e => save({ notes: e.target.value || null })}
        />
      </div>

      {/* Last 6 days mini-history */}
      {history.length > 0 && (
        <div>
          <div className="section-title">Recent entries</div>
          <div className="stack" style={{ gap: 8 }}>
            {history.map(h => (
              <div
                key={h.date}
                className="card"
                style={{ cursor: "pointer", padding: "10px 14px" }}
                onClick={() => setDate(h.date)}
              >
                <div className="spread">
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{fmtDisplay(h.date)}</span>
                  <div className="row" style={{ gap: 8 }}>
                    {h.mood && <span title="Mood">{MOODS[h.mood]}</span>}
                    {h.energy && <span title="Energy">{ENERGY[h.energy]}</span>}
                    {h.sleep_hours && <span className="muted small">😴 {h.sleep_hours}h</span>}
                  </div>
                </div>
                {h.notes && (
                  <div className="muted small" style={{
                    marginTop: 4, overflow: "hidden",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>
                    {h.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
