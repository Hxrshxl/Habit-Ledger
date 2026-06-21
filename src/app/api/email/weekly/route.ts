import { NextRequest, NextResponse } from "next/server";
import { listHabits, entriesForRange } from "@/lib/db";
import { buildEntryMap, ekey, isScheduled, localToday, addDays, parseDate, fmt, computeStreakBatch } from "@/lib/core";

export const dynamic = "force-dynamic";

function istSunday(): string {
  // Returns the most recent Sunday in IST
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = now.getDay(); // 0=Sun
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day);
  return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, "0")}-${String(sunday.getDate()).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`)
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const apiKey  = process.env.RESEND_API_KEY;
  const toEmail = process.env.DIGEST_EMAIL;
  if (!apiKey || !toEmail)
    return NextResponse.json({ error: "RESEND_API_KEY or DIGEST_EMAIL not set." }, { status: 503 });

  const today   = localToday();
  const weekAgo = fmt(addDays(parseDate(today), -6));

  const habits  = (await listHabits(false));
  const entries = await entriesForRange(weekAgo, today);
  const emap    = buildEntryMap(entries);
  const streaks = computeStreakBatch(habits, emap, today);

  // Per-habit week stats
  const rows = habits.map((h) => {
    let sched = 0, done = 0;
    for (let i = 0; i <= 6; i++) {
      const d = fmt(addDays(parseDate(today), -i));
      if (!isScheduled(h, d)) continue;
      sched++;
      if (emap.get(ekey(h.id, d))?.status === "done") done++;
    }
    const pct = sched > 0 ? Math.round((done / sched) * 100) : null;
    return { h, sched, done, pct, streak: streaks.get(h.id)?.current ?? 0 };
  }).filter((r) => r.sched > 0).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

  const overall = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + (r.pct ?? 0), 0) / rows.length)
    : 0;

  const best   = rows[0];
  const worst  = rows[rows.length - 1];
  const topStreak = [...rows].sort((a, b) => b.streak - a.streak)[0];

  const bar = (pct: number) => {
    const filled = Math.round(pct / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${pct}%`;
  };

  const tableRows = rows.map((r) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${r.h.name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${r.done}/${r.sched}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:${(r.pct ?? 0) >= 70 ? "#16a34a" : (r.pct ?? 0) >= 40 ? "#d97706" : "#dc2626"};">${r.pct ?? 0}%</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${r.streak > 0 ? `🔥 ${r.streak}d` : "—"}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Segoe UI',system-ui,sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
    <div style="background:#4f46e5;padding:24px 28px;">
      <div style="color:#fff;font-size:20px;font-weight:700;">Habit Ledger</div>
      <div style="color:#c7d2fe;font-size:13px;margin-top:4px;">Weekly digest · ${weekAgo} → ${today}</div>
    </div>
    <div style="padding:24px 28px;">

      <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap;">
        <div style="flex:1;min-width:100px;background:#f3f4f6;border-radius:8px;padding:14px 16px;">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Overall</div>
          <div style="font-size:28px;font-weight:700;color:#111827;margin-top:2px;">${overall}%</div>
        </div>
        ${best ? `<div style="flex:1;min-width:100px;background:#f0fdf4;border-radius:8px;padding:14px 16px;">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Best habit</div>
          <div style="font-size:14px;font-weight:600;color:#16a34a;margin-top:2px;">${best.h.name}</div>
          <div style="font-size:12px;color:#6b7280;">${best.pct}%</div>
        </div>` : ""}
        ${topStreak && topStreak.streak > 0 ? `<div style="flex:1;min-width:100px;background:#fefce8;border-radius:8px;padding:14px 16px;">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Top streak</div>
          <div style="font-size:14px;font-weight:600;color:#d97706;margin-top:2px;">🔥 ${topStreak.streak}d</div>
          <div style="font-size:12px;color:#6b7280;">${topStreak.h.name}</div>
        </div>` : ""}
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e5e7eb;">Habit</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e5e7eb;">Done</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e5e7eb;">Rate</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e5e7eb;">Streak</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      ${worst && worst !== best && (worst.pct ?? 0) < 60 ? `
      <div style="margin-top:20px;padding:12px 14px;background:#fef2f2;border-radius:8px;border-left:3px solid #dc2626;">
        <div style="font-size:12px;font-weight:600;color:#dc2626;">Needs attention</div>
        <div style="font-size:13px;color:#111827;margin-top:3px;">${worst.h.name} — only ${worst.pct}% this week. Try scheduling it at a fixed time.</div>
      </div>` : ""}

      <div style="margin-top:20px;text-align:center;">
        <a href="${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/insights" style="background:#4f46e5;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;display:inline-block;">View full insights →</a>
      </div>
    </div>
    <div style="padding:12px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">
      Habit Ledger · Weekly digest · ${istSunday()}
    </div>
  </div>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      from:    "Habit Ledger <digest@resend.dev>",
      to:      [toEmail],
      subject: `Weekly digest: ${overall}% · ${today}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Resend error: ${err}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sent_to: toEmail, overall });
}

// Allow GET for easy manual testing
export async function GET(req: NextRequest) { return POST(req); }
