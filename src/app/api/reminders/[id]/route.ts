import { NextRequest, NextResponse } from "next/server";
import { updateReminder, deleteReminder } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};

  if (b?.message !== undefined) patch.message = String(b.message).trim();
  if (b?.time    !== undefined) {
    const t = String(b.time).trim();
    if (!/^\d{2}:\d{2}$/.test(t)) return NextResponse.json({ error: "time must be HH:MM." }, { status: 400 });
    patch.time = t;
  }
  if (b?.days    !== undefined) patch.days    = String(b.days).trim();
  if (b?.enabled !== undefined) patch.enabled = Boolean(b.enabled);

  await updateReminder(id, patch as Parameters<typeof updateReminder>[1]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteReminder(id);
  return NextResponse.json({ ok: true });
}
