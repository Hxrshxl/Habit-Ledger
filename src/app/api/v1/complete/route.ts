import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, listHabits, setEntry } from "@/lib/db";
import { localToday } from "@/lib/core";

export const dynamic = "force-dynamic";

// POST { habit: "DSA - 1" } or { habitId: "..." }, optional { date: "YYYY-MM-DD" }
export async function POST(req: NextRequest) {
  if (!await checkApiKey(req.headers.get("authorization")))
    return NextResponse.json({ error: "Unauthorized. Pass Authorization: Bearer <api key>." }, { status: 401 });
  const b = await req.json().catch(() => null);
  const date = String(b?.date ?? localToday());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > localToday())
    return NextResponse.json({ error: "Invalid or future date." }, { status: 400 });

  const habits = await listHabits();
  const q = String(b?.habit ?? "").toLowerCase().trim();
  const hId = String(b?.habitId ?? "").trim();
  const habit = hId
    ? habits.find((h) => h.id === hId)
    : habits.find((h) => h.name.toLowerCase() === q) ?? habits.find((h) => q && h.name.toLowerCase().includes(q));
  if (!habit) return NextResponse.json({ error: "Habit not found. Pass habit (name) or habitId." }, { status: 404 });

  await setEntry(habit.id, date, { status: "done", source: "api" });
  return NextResponse.json({ ok: true, habit: habit.name, date });
}
