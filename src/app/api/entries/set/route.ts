import { NextRequest, NextResponse } from "next/server";
import { setEntry, getHabit, entriesSince, getSetting, logEvent, listPushSubs, deletePushSub } from "@/lib/db";
import { buildEntryMap, computeStreak, localToday, addDays, parseDate, fmt } from "@/lib/core";
import webpush from "web-push";

export const dynamic = "force-dynamic";

const MILESTONES = [7, 30, 100];
const MAX_STREAK = Math.max(...MILESTONES) + 5;

async function fireMilestonePush(habitName: string, streak: number) {
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const mail = process.env.VAPID_EMAIL ?? "mailto:admin@habit-ledger.app";
  if (!pub || !priv) return;
  webpush.setVapidDetails(mail, pub, priv);
  const subs = await listPushSubs();
  const payload = JSON.stringify({
    title: `🔥 ${streak}-day streak!`,
    body: `${habitName} — you've hit ${streak} days in a row. Keep going!`,
    url: "/",
  });
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    } catch (e: unknown) {
      const s = (e as { statusCode?: number }).statusCode;
      if (s === 410 || s === 404) await deletePushSub(sub.endpoint);
    }
  }
}

async function fireMilestoneWebhook(habitId: string) {
  const habit = await getHabit(habitId);
  if (!habit) return;
  const since = fmt(addDays(parseDate(localToday()), -(MAX_STREAK + 10)));
  const recentEntries = (await entriesSince(since)).filter((e) => e.habit_id === habitId);
  const streak = computeStreak(habit, buildEntryMap(recentEntries), localToday());
  if (!MILESTONES.includes(streak.current)) return;

  // Push notification — fires regardless of webhook config
  void fireMilestonePush(habit.name, streak.current);

  // Webhook — optional
  const url = await getSetting("webhook_url");
  if (!url || !/^https?:\/\//.test(url)) return;
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
  const habitId = String(b?.habitId ?? "").trim();
  const date = String(b?.date ?? "");
  if (!habitId) return NextResponse.json({ error: "habitId is required." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  if (!await getHabit(habitId)) return NextResponse.json({ error: "Habit not found." }, { status: 404 });
  if (date > localToday()) return NextResponse.json({ error: "Future days are locked." }, { status: 400 });

  const input: { status?: "done" | "skipped" | null; quantity?: number | null; note?: string | null; source?: string; duration_minutes?: number | null } = {};
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
  if (b.duration_minutes !== undefined) {
    if (b.duration_minutes !== null && (!Number.isInteger(Number(b.duration_minutes)) || Number(b.duration_minutes) < 0))
      return NextResponse.json({ error: "duration_minutes must be a non-negative integer or null." }, { status: 400 });
    input.duration_minutes = b.duration_minutes === null ? null : Number(b.duration_minutes);
  }

  const entry = await setEntry(habitId, date, input);
  if (entry?.status === "done") void fireMilestoneWebhook(habitId);
  return NextResponse.json({ entry });
}
