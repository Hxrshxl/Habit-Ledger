import { NextResponse } from "next/server";
import { listHabits, entriesSince } from "@/lib/db";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  const names = new Map((await listHabits(true)).map((h) => [h.id, h.name]));
  const rows = [["habit_id", "habit", "date", "status", "quantity", "note", "source", "logged_at"]];
  for (const e of await entriesSince("2000-01-01"))
    rows.push([
      String(e.habit_id), names.get(e.habit_id) ?? "?", e.date, e.status,
      e.quantity === null ? "" : String(e.quantity), e.note ?? "", e.source, e.created_at,
    ]);
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="habit-ledger-export.csv"',
    },
  });
}
