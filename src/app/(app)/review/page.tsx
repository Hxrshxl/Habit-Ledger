"use client";

import { useCallback, useEffect, useState } from "react";
import { WeeklyReview, localToday, weekKey, fmt, addDays, parseDate } from "@/lib/core";
import { jget, jsend } from "@/lib/client";

function mondaysBefore(n: number): string[] {
  const today = localToday();
  const thisMonday = weekKey(today);
  const weeks: string[] = [];
  for (let i = 0; i < n; i++) {
    weeks.push(fmt(addDays(parseDate(thisMonday), -7 * i)));
  }
  return weeks;
}

function weekLabel(monday: string): string {
  const d = parseDate(monday);
  const sun = fmt(addDays(d, 6));
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${d.toLocaleDateString("en-IN", opts)} – ${parseDate(sun).toLocaleDateString("en-IN", opts)}`;
}

function isCurrentWeek(monday: string): boolean {
  return monday === weekKey(localToday());
}

export default function ReviewPage() {
  const [reviews, setReviews]       = useState<(WeeklyReview | null)[]>([]);
  const [selectedWeek, setSelected] = useState<string>(weekKey(localToday()));
  const [form, setForm]             = useState({ went_well: "", got_in_way: "", protect_time: "" });
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [err, setErr]               = useState("");

  const weeks = mondaysBefore(6); // current week + 5 previous

  const loadReviews = useCallback(async () => {
    const data = await jget<WeeklyReview[]>("/api/reviews?limit=8").catch(() => []);
    setReviews(data ?? []);
  }, []);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  // When selected week changes, fill form from existing review or blank
  useEffect(() => {
    const existing = reviews.find((r) => r?.week_start === selectedWeek);
    if (existing) {
      setForm({ went_well: existing.went_well, got_in_way: existing.got_in_way, protect_time: existing.protect_time });
    } else {
      setForm({ went_well: "", got_in_way: "", protect_time: "" });
    }
  }, [selectedWeek, reviews]);

  async function save() {
    setSaving(true); setErr(""); setSaved(false);
    try {
      await jsend("/api/reviews", "POST", { week_start: selectedWeek, ...form });
      await loadReviews();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr((e as Error).message); }
    setSaving(false);
  }

  const pastReviews = reviews.filter(
    (r): r is WeeklyReview => r !== null && r.week_start !== selectedWeek
  ).slice(0, 4);

  const currentWeekMonday = weekKey(localToday());

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Weekly Review</h1>
      </div>

      <div className="muted small">
        A 3-question reflection each week. Your answers help you notice patterns and protect what matters.
      </div>

      {/* Week selector */}
      <div className="card">
        <div className="label" style={{ marginBottom: 8 }}>Select week</div>
        <div className="review-week-tabs">
          {weeks.map((w) => (
            <button
              key={w}
              className={`review-week-tab${selectedWeek === w ? " active" : ""}${reviews.find((r) => r?.week_start === w) ? " has-review" : ""}`}
              onClick={() => setSelected(w)}
            >
              {isCurrentWeek(w) ? "This week" : weekLabel(w)}
              {reviews.find((r) => r?.week_start === w) && <span className="review-dot" />}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="card stack">
        <div className="section-title">
          {selectedWeek === currentWeekMonday ? "This week's review" : `Review: ${weekLabel(selectedWeek)}`}
        </div>

        <label className="field">
          <span className="label review-q">1. What went well this week?</span>
          <textarea
            className="input review-textarea"
            rows={3}
            value={form.went_well}
            placeholder="Wins, progress, habits that clicked…"
            onChange={(e) => setForm({ ...form, went_well: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="label review-q">2. What got in the way?</span>
          <textarea
            className="input review-textarea"
            rows={3}
            value={form.got_in_way}
            placeholder="Obstacles, distractions, unexpected blockers…"
            onChange={(e) => setForm({ ...form, got_in_way: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="label review-q">3. One thing I'll protect time for next week</span>
          <textarea
            className="input review-textarea"
            rows={2}
            value={form.protect_time}
            placeholder="e.g. Morning DSA block 7–8am, no meetings before 10am…"
            onChange={(e) => setForm({ ...form, protect_time: e.target.value })}
          />
        </label>

        <div className="row">
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save review"}
          </button>
          {saved && <span className="ok-text" style={{ margin: 0 }}>Saved ✓</span>}
          {err && <span className="error-text" style={{ margin: 0 }}>{err}</span>}
        </div>
      </div>

      {/* Past reviews */}
      {pastReviews.length > 0 && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="section-title" style={{ margin: 0 }}>Last 4 weeks</div>
          {pastReviews.map((r) => (
            <div key={r.week_start} className="card review-history-card" onClick={() => setSelected(r.week_start)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(r.week_start)}>
              <div className="review-history-week">{weekLabel(r.week_start)}</div>
              {r.went_well && (
                <div className="review-history-row">
                  <span className="review-history-label">Went well</span>
                  <span className="review-history-text">{r.went_well}</span>
                </div>
              )}
              {r.got_in_way && (
                <div className="review-history-row">
                  <span className="review-history-label">Got in the way</span>
                  <span className="review-history-text">{r.got_in_way}</span>
                </div>
              )}
              {r.protect_time && (
                <div className="review-history-row">
                  <span className="review-history-label">Protected time</span>
                  <span className="review-history-text review-commitment">{r.protect_time}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
