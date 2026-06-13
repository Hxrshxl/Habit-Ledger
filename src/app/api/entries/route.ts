import { NextRequest, NextResponse } from "next/server";
import { entriesForRange, entriesSince } from "@/lib/db";

export const dynamic = "force-dynamic";
const D = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  // Legacy ?all=1 still supported: bounded to 2 years to prevent unbounded scans
  if (req.nextUrl.searchParams.get("all") === "1") {
    const since = new Date(); since.setFullYear(since.getFullYear() - 2);
    const sinceStr = since.toISOString().slice(0, 10);
    return NextResponse.json(await entriesSince(sinceStr), {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=30" },
    });
  }
  if (!from || !to || !D.test(from) || !D.test(to))
    return NextResponse.json({ error: "Pass ?from=YYYY-MM-DD&to=YYYY-MM-DD." }, { status: 400 });
  return NextResponse.json(await entriesForRange(from, to), {
    headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=30" },
  });
}
