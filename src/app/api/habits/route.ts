import { NextRequest, NextResponse } from "next/server";
import { listHabits, createHabit } from "@/lib/db";
import { validateHabitBody } from "./validate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all") === "1";
  return NextResponse.json(await listHabits(all), {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=60" },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const v = validateHabitBody(body);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  return NextResponse.json(await createHabit(v.value as never), { status: 201 });
}
