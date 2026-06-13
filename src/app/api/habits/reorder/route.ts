import { NextRequest, NextResponse } from "next/server";
import { reorderHabits } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number) : null;
  if (!ids || ids.some((n: number) => !Number.isInteger(n)))
    return NextResponse.json({ error: "Pass { ids: number[] } in display order." }, { status: 400 });
  await reorderHabits(ids);
  return NextResponse.json({ ok: true });
}
