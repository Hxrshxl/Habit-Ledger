import { NextRequest, NextResponse } from "next/server";
import { setEntry, getHabit, entriesSince, getSetting, logEvent } from "@/lib/db";
import { buildEntryMap, computeStreak, localToday, addDays, parseDate, fmt } from "@/lib/core";

export const dynamic = "force-dynamic";

const MILESTONES = [7, 30, 100];
const MAX_STREAK = Math.max(...MILESTONES) + 5;

async function fireMilestoneWebhook(habitId: number) {
  const url = await getSetting("webhook_url");
  if (!url || !/^https?:\/\//.test(url)) return;
  const habit = await getHabit(habitId);
  if (!habit) return;
  const since = fmt(addDays(parseDate(localToday()), -(MAX_STREAK + 10)));
  const recentEntries = (await entriesSince(since)).filter((e) => e.habit_id === habitId);
  const streak = computeStreak(habit, buildEntryMap(recentEntries), localToday());
  if (!MILESTONES.includes(streak.current)) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "streak_milestone",
        habit: habit.name,
        streak: streak.current,
        unit: streak.unit,
        date: localToday(),
      }),
      signal: AbortSignal.timeout(4000),
    });
    await logEvent("webhook_fired", habitId, localToday(), { streak: streak.current });
  } catch {
    await logEvent("webhook_failed", habitId, localToday(), {});
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const habitId = Number(b?.habitId);
  const date = String(b?.date ?? "");
  if (!Number.isInteger(habitId)) return NextResponse.json({ error: "habitId is required." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  if (!await getHabit(habitId)) return NextResponse.json({ error: "Habit not found." }, { status: 404 });
  if (date > localToday()) return NextResponse.json({ error: "Future days are locked." }, { status: 400 });

  const input: { status?: "done" | "skipped" | null; quantity?: number | null; note?: string | null; source?: string } = {};
  if (b.status !== undefined) {
    if (b.status !== null && !["done", "skipped"].includes(b.status))
      return NextResponse.json({ error: "status must be done, skipped or null." }, { status: 400 });
    input.status = b.status;
  }
  if (b.quantity !== undefined) {
    if (b.quantity !== null && (!Number.isFinite(Number(b.quantity)) || Number(b.quantity) < 0))
      return NextResponse.json({ error: "quantity must be >= 0 or null." }, { status: 400 });
    input.quantity = b.quantity === null ? null : Number(b.quantity);
  }
  if (b.note !== undefined) input.note = b.note === null ? null : String(b.note).slice(0, 500);
  if (b.source !== undefined) input.source = String(b.source).slice(0, 20);

  const entry = await setEntry(habitId, date, input);
  if (entry?.status === "done") void fireMilestoneWebhook(habitId);
  return NextResponse.json({ entry });
}
