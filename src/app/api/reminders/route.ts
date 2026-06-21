import { NextRequest, NextResponse } from "next/server";
import { listReminders, createReminder } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const reminders = await listReminders();
  return NextResponse.json(reminders);
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const message = String(b?.message ?? "").trim();
  const time    = String(b?.time    ?? "").trim();
  const days    = String(b?.days    ?? "daily").trim();

  if (!message) return NextResponse.json({ error: "message is required." }, { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(time)) return NextResponse.json({ error: "time must be HH:MM." }, { status: 400 });
  const [h, m] = time.split(":").map(Number);
  if (h > 23 || m > 59) return NextResponse.json({ error: "Invalid time value." }, { status: 400 });

  const reminder = await createReminder({ message, time, days, enabled: true });
  return NextResponse.json(reminder, { status: 201 });
}
