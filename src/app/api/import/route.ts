import { NextRequest, NextResponse } from "next/server";
import { importAll } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const data = await req.json().catch(() => null);
  if (!data || !Array.isArray(data.habits))
    return NextResponse.json({ error: "Not a Habit Ledger backup file." }, { status: 400 });
  try {
    await importAll(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed; database rolled back." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, habits: data.habits.length, entries: (data.entries ?? []).length });
}
