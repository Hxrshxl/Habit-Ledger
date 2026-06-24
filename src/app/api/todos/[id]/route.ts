import { NextRequest, NextResponse } from "next/server";
import { updateTodo, deleteTodo } from "@/lib/db";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = (await params).id;
  const b = await req.json().catch(() => null);
  if (!id || !b) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const D = /^\d{4}-\d{2}-\d{2}$/;
  const fields: Parameters<typeof updateTodo>[1] = {};
  if (b.status   !== undefined) fields.status   = ["pending","completed"].includes(b.status) ? b.status : "pending";
  if (b.title    !== undefined) fields.title    = String(b.title).trim().slice(0, 200);
  if (b.due_date !== undefined) fields.due_date = b.due_date && D.test(b.due_date) ? b.due_date : null;
  return NextResponse.json(await updateTodo(id, fields));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = (await params).id;
  await deleteTodo(id);
  return NextResponse.json({ deleted: true });
}
