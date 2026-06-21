import { NextRequest, NextResponse } from "next/server";
import { getMits, setMits } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = new URL(req.url).searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
  const ids = await getMits(date);
  return NextResponse.json(ids);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.date) return NextResponse.json({ error: "date required" }, { status: 400 });
  const ids: string[] = Array.isArray(body.mit_ids) ? body.mit_ids : [];
  await setMits(body.date, ids);
  return NextResponse.json({ ok: true });
}
