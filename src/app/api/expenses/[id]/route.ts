import { NextRequest, NextResponse } from "next/server";
import { updateExpense, deleteExpense } from "@/lib/db";
import { localToday } from "@/lib/core";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = (await params).id;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });

  const input: Record<string, unknown> = {};
  if (b.name     !== undefined) input.name     = String(b.name).trim().slice(0, 120);
  if (b.amount   !== undefined) input.amount   = Math.abs(Number(b.amount));
  if (b.date     !== undefined) input.date     = String(b.date);
  if (b.type     !== undefined) input.type     = b.type;
  if (b.category !== undefined) input.category = String(b.category).trim().slice(0, 50);
  if (b.note     !== undefined) input.note     = b.note ? String(b.note).slice(0, 300) : null;

  if (input.date && (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date)) || String(input.date) > localToday()))
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  const expense = await updateExpense(id, input);
  if (!expense) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
  return NextResponse.json(expense);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = (await params).id;
  if (!id || !await deleteExpense(id))
    return NextResponse.json({ error: "Expense not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
