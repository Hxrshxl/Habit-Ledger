import { NextResponse } from "next/server";
import { listHabits, entriesForRange, listContext } from "@/lib/db";
import {
  addDays, fmt, localToday, parseDate, buildEntryMap, computeStreak, statForRange,
} from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key)
    return NextResponse.json(
      { error: "AI coach is off. Set ANTHROPIC_API_KEY in your environment and restart to enable it." },
      { status: 400 }
    );

  const today = localToday();
  const from = fmt(addDays(parseDate(today), -30));
  const habits = await listHabits();
  const emap = buildEntryMap(await entriesForRange(from, today));

  const lines = habits.map((h) => {
    const s = statForRange(h, emap, from, today);
    const st = computeStreak(h, emap, today);
    return `${h.name} [${h.category}]: ${s.done} done / ${s.skipped} skipped over 30d, streak ${st.current} ${st.unit}`;
  });
  const ctx = await listContext(from, today);
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "n/a");
  lines.push(
    `Context: avg sleep ${avg(ctx.map((c) => c.sleep_hours!).filter((x) => x != null))}h, ` +
    `avg mood ${avg(ctx.map((c) => c.mood!).filter((x) => x != null))}/5`
  );

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{
        role: "user",
        content:
          `You are a pragmatic habit coach. My last 30 days:\n\n${lines.join("\n")}\n\n` +
          `Reply in under 130 words, plain text: 1) the biggest pattern, 2) weakest habit + one concrete fix, 3) one thing to keep doing.`,
      }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return NextResponse.json({ error: `Coach request failed (${res.status}).` }, { status: 502 });
  const data = await res.json();
  const text = (data?.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
  return NextResponse.json({ text });
}
