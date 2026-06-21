import { NextRequest, NextResponse } from "next/server";
import { listExperiments, createExperiment, getHabit } from "@/lib/db";

export const dynamic = "force-dynamic";
const D = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  return NextResponse.json(await listExperiments());
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim();
  const habitId = String(b?.habit_id ?? "").trim();
  if (!name || !habitId || !await getHabit(habitId))
    return NextResponse.json({ error: "name and a valid habit_id are required." }, { status: 400 });
  for (const k of ["a_from", "a_to", "b_from", "b_to"])
    if (!D.test(String(b?.[k] ?? ""))) return NextResponse.json({ error: `${k} must be YYYY-MM-DD.` }, { status: 400 });
  if (b.a_from > b.a_to || b.b_from > b.b_to)
    return NextResponse.json({ error: "Each condition's start must be before its end." }, { status: 400 });
  return NextResponse.json(
    await createExperiment({
      name: name.slice(0, 80),
      habit_id: habitId,
      a_label: String(b.a_label ?? "Condition A").slice(0, 40),
      a_from: b.a_from, a_to: b.a_to,
      b_label: String(b.b_label ?? "Condition B").slice(0, 40),
      b_from: b.b_from, b_to: b.b_to,
    }),
    { status: 201 }
  );
}
