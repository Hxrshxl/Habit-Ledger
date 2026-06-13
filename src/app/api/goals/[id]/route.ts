import { NextRequest, NextResponse } from "next/server";
import { updateGoal, deleteGoal } from "@/lib/db";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  const b = await req.json().catch(() => null);
  if (!Number.isInteger(id) || !b) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const D = /^\d{4}-\d{2}-\d{2}$/;
  const fields: Parameters<typeof updateGoal>[1] = {};
  if (b.name        !== undefined) fields.name        = String(b.name).trim().slice(0, 120);
  if (b.description !== undefined) fields.description = String(b.description).slice(0, 500);
  if (b.target_date !== undefined) fields.target_date = b.target_date && D.test(b.target_date) ? b.target_date : null;
  if (b.start_date  !== undefined) fields.start_date  = b.start_date && D.test(b.start_date) ? b.start_date : null;
  if (b.category    !== undefined) fields.category    = String(b.category).slice(0, 40);
  if (b.priority    !== undefined) fields.priority    = ["low","medium","high"].includes(b.priority) ? b.priority : "medium";
  if (b.timeframe   !== undefined) fields.timeframe   = ["3m","6m","1y","3y","5y","custom"].includes(b.timeframe) ? b.timeframe : "custom";
  if (b.status      !== undefined) fields.status      = ["active","completed","paused","stalled"].includes(b.status) ? b.status : "active";
  if (b.ai_context  !== undefined) fields.ai_context  = String(b.ai_context).slice(0, 1000);
  if (b.eisenhower  !== undefined) fields.eisenhower  = ["do","schedule","delegate","eliminate"].includes(b.eisenhower) ? b.eisenhower : null;
  return NextResponse.json(await updateGoal(id, fields));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await deleteGoal(id);
  return NextResponse.json({ deleted: true });
}
