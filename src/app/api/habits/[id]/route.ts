import { NextRequest, NextResponse } from "next/server";
import { updateHabit, deleteHabit } from "@/lib/db";
import { validateHabitBody } from "../validate";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const v = validateHabitBody(body, true);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  const habit = await updateHabit(id, v.value as never);
  if (!habit) return NextResponse.json({ error: "Habit not found." }, { status: 404 });
  return NextResponse.json(habit);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  await deleteHabit(id);
  return NextResponse.json({ deleted: true });
}
