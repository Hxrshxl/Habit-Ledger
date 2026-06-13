import { NextResponse } from "next/server";
import { listHabits } from "@/lib/db";

export const dynamic = "force-dynamic";

const WD_ICAL = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function icalDate(dateStr: string): string {
  return dateStr.replace(/-/g, "") + "T000000Z";
}

function icalEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function rrule(h: { frequency_type: string; weekdays: string; times_per_week: number; interval_days: number }): string {
  if (h.frequency_type === "daily") return "RRULE:FREQ=DAILY";
  if (h.frequency_type === "interval") return `RRULE:FREQ=DAILY;INTERVAL=${h.interval_days || 7}`;
  if (h.frequency_type === "weekly") return `RRULE:FREQ=WEEKLY;INTERVAL=1`;
  // weekdays — specific days
  const days = h.weekdays
    ? h.weekdays.split(",").map((n) => WD_ICAL[Number(n.trim())]).filter(Boolean).join(",")
    : "MO,TU,WE,TH,FR";
  return `RRULE:FREQ=WEEKLY;BYDAY=${days}`;
}

export async function GET() {
  const habits = await listHabits(false);
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  // Use today as DTSTART
  const todayStr = now.toISOString().slice(0, 10);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Habit Ledger//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Habit Ledger",
    "X-WR-TIMEZONE:Asia/Kolkata",
  ];

  for (const h of habits) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:habit-${h.id}@habit-ledger`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${todayStr.replace(/-/g, "")}`,
      `${rrule(h)}`,
      `SUMMARY:${icalEscape(h.name)}`,
      h.why ? `DESCRIPTION:${icalEscape(h.why)}` : "DESCRIPTION:",
      `CATEGORIES:${icalEscape(h.category)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="habit-ledger.ics"',
    },
  });
}
