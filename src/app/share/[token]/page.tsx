// Public, read-only share page. Server component — reads the DB directly.
// Valid only when the URL token matches the share_token setting.

import { listHabits, entriesForRange, getSetting } from "@/lib/db";
import { buildEntryMap, monthRange, statForRange, gradeOf, localToday, parseDate } from "@/lib/core";

export const dynamic = "force-dynamic";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const real = await getSetting("share_token");

  if (!real || !token || token !== real) {
    return (
      <div className="login-wrap">
        <div className="login-card card">
          <div className="section-title">Link not active</div>
          <div className="muted small">This share link is invalid or sharing has been disabled.</div>
        </div>
      </div>
    );
  }

  const today = localToday();
  const now = parseDate(today);
  const { from, to } = monthRange(now.getFullYear(), now.getMonth());
  const habits = await listHabits(false);
  const emap = buildEntryMap(await entriesForRange(from, to));

  const rows = habits.map((h) => ({ h, s: statForRange(h, emap, from, today < to ? today : to) }));
  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.s.pct, 0) / rows.length) : 0;

  return (
    <div className="login-wrap" style={{ alignItems: "flex-start", paddingTop: 48 }}>
      <div className="card stack" style={{ width: "100%", maxWidth: 560 }}>
        <div>
          <div className="section-title">Habit Ledger — {MONTHS[now.getMonth()]} {now.getFullYear()}</div>
          <div className="muted small">Read-only public view · month to date</div>
        </div>
        <div className="row" style={{ gap: 28 }}>
          <div><div className="stat-value">{avg}%</div><div className="stat-label">average completion</div></div>
          <div><div className="stat-value">{gradeOf(avg)}</div><div className="stat-label">grade</div></div>
        </div>
        <table className="table">
          <thead><tr><th>Habit</th><th className="num">Done</th><th className="num">%</th></tr></thead>
          <tbody>
            {rows.map(({ h, s }) => (
              <tr key={h.id}>
                <td>{h.name}</td>
                <td className="num">{s.done}</td>
                <td className="num">{s.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted small">Powered by Habit Ledger</div>
      </div>
    </div>
  );
}
