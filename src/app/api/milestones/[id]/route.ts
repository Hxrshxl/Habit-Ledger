import { NextRequest, NextResponse } from "next/server";
import { updateMilestone, deleteMilestone } from "@/lib/db";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  const b = await req.json().catch(() => null);
  if (!Number.isInteger(id) || !b) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const D = /^\d{4}-\d{2}-\d{2}$/;
  const fields: Parameters<typeof updateMilestone>[1] = {};
  if (b.title              !== undefined) fields.title              = String(b.title).trim().slice(0, 150);
  if (b.explanation        !== undefined) fields.explanation        = String(b.explanation).slice(0, 500);
  if (b.estimated_duration !== undefined) fields.estimated_duration = String(b.estimated_duration).slice(0, 60);
  if (b.order_index        !== undefined) fields.order_index        = Number(b.order_index);
  if (b.dependencies       !== undefined) fields.dependencies       = Array.isArray(b.dependencies) ? JSON.stringify(b.dependencies) : "[]";
  if (b.success_criteria   !== undefined) fields.success_criteria   = String(b.success_criteria).slice(0, 400);
  if (b.status             !== undefined) fields.status             = ["pending","active","completed"].includes(b.status) ? b.status : "pending";
  if (b.target_date        !== undefined) fields.target_date        = b.target_date && D.test(b.target_date) ? b.target_date : null;
  return NextResponse.json(await updateMilestone(id, fields));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await deleteMilestone(id);
  return NextResponse.json({ deleted: true });
}
