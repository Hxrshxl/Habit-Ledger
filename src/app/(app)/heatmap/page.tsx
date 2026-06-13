"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Habit, Entry, buildEntryMap, ekey, eachDay, isScheduled, localToday, parseDate, weekdayOf, categoryColor } from "@/lib/core";
import { jget } from "@/lib/client";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function levelClass(ratio: number, hasData: boolean): string {
  if (!hasData) return "h0";
  if (ratio >= 0.95) return "h4";
  if (ratio >= 0.7) return "h3";
  if (ratio >= 0.4) return "h2";
  return "h1";
}

function Heat({ year, value }: { year: number; value: (date: string) => { ratio: number; has: boolean; tip: string } | null }) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const days = useMemo(() => [...eachDay(from, to)], [from, to]);
  // pad so column 0 starts on Sunday
  const lead = weekdayOf(from);
  const cells: ({ d: string } | null)[] = [...Array(lead).fill(null), ...days.map((d) => ({ d }))];
  const weeks: ({ d: string } | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // month labels at the week where the month starts
  const monthLabel = (w: ({ d: string } | null)[]) => {
    const first = w.find(Boolean);
    if (!first) return "";
    const dt = parseDate(first.d);
    return dt.getDate() <= 7 ? MONTHS[dt.getMonth()] : "";
  };

  return (
    <div className="heat-scroll">
      <div style={{ display: "flex", gap: 2 }}>
        {weeks.map((w, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div className="small muted" style={{ height: 14, fontSize: 9.5, whiteSpace: "nowrap" }}>{monthLabel(w)}</div>
            {Array.from({ length: 7 }, (_, di) => {
              const c = w[di];
              if (!c) return <div key={di} className="heat-cell" style={{ visibility: "hidden" }} />;
              const v = value(c.d);
              if (!v) return <div key={di} className="heat-cell h0" style={{ opacity: 0.35 }} title={`${c.d} · not scheduled`} />;
              return <div key={di} className={`heat-cell ${levelClass(v.ratio, v.has)}`} title={v.tip} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HeatmapPage() {
  const today = localToday();
  const [year, setYear] = useState(parseDate(today).getFullYear());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [hs, es] = await Promise.all([
        jget<Habit[]>("/api/habits"),
        jget<Entry[]>(`/api/entries?from=${year}-01-01&to=${year}-12-31`),
      ]);
      setHabits(hs); setEntries(es); setErr("");
    } catch (e) { setErr((e as Error).message); }
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const emap = useMemo(() => buildEntryMap(entries), [entries]);

  const overall = useCallback((d: string) => {
    if (d > today) return { ratio: 0, has: false, tip: `${d}` };
    let done = 0, sched = 0;
    for (const h of habits) {
      if (!isScheduled(h, d)) continue;
      const e = emap.get(ekey(h.id, d));
      if (e?.status === "skipped") continue;
      sched++;
      if (e?.status === "done") done++;
    }
    if (sched === 0) return null;
    return { ratio: done / sched, has: done > 0, tip: `${d} · ${done}/${sched} habits` };
  }, [habits, emap, today]);

  if (loading) return <div className="muted">Loading…</div>;

  return (
    <div className="stack">
      <div className="page-head spread">
        <h1>Heatmap</h1>
        <div className="row">
          <button className="btn btn-sm" onClick={() => setYear(year - 1)}>←</button>
          <span className="mono">{year}</span>
          <button className="btn btn-sm" onClick={() => setYear(year + 1)}>→</button>
        </div>
      </div>
      {err && <div className="error-text">{err}</div>}

      <div className="card stack">
        <div className="section-title">All habits — {year}</div>
        <Heat year={year} value={overall} />
        <div className="heat-legend small muted">
          <span>Less</span>
          {["h0","h1","h2","h3","h4"].map((c) => <span key={c} className={`heat-cell ${c}`} />)}
          <span>More</span>
        </div>
      </div>

      {habits.map((h) => (
        <div className="card stack" key={h.id}>
          <div className="section-title row">
            <span className="cat-dot" style={{ background: categoryColor(h.category) }} />
            {h.name}
          </div>
          <Heat
            year={year}
            value={(d) => {
              if (d > today) return { ratio: 0, has: false, tip: d };
              if (!isScheduled(h, d)) return null;
              const e = emap.get(ekey(h.id, d));
              if (e?.status === "skipped") return { ratio: 0, has: false, tip: `${d} · skipped${e.note ? `: ${e.note}` : ""}` };
              const done = e?.status === "done";
              return {
                ratio: done ? 1 : 0,
                has: done,
                tip: `${d} · ${done ? "done" : "missed"}${e?.quantity != null ? ` · ${e.quantity} ${h.quantity_unit}` : ""}${e?.note ? ` · ${e.note}` : ""}`,
              };
            }}
          />
        </div>
      ))}
    </div>
  );
}
