import { NextRequest, NextResponse } from "next/server";
import { getContext, listContext, setContext } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (date) {
    const ctx = await getContext(date);
    return NextResponse.json(ctx);
  }
  if (from && to) {
    const list = await listContext(from, to);
    return NextResponse.json(list);
  }
  return NextResponse.json({ error: "Provide ?date= or ?from=&to=" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.date) return NextResponse.json({ error: "date required" }, { status: 400 });
  await setContext(
    body.date,
    body.mood ?? null,
    body.energy ?? null,
    body.sleep_hours ?? null,
    body.notes ?? null,
  );
  return NextResponse.json({ ok: true });
}
