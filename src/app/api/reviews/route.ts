import { NextRequest, NextResponse } from "next/server";
import { listReviews, upsertReview, getReview } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const week = req.nextUrl.searchParams.get("week");
  if (week) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week))
      return NextResponse.json({ error: "week must be YYYY-MM-DD" }, { status: 400 });
    return NextResponse.json(await getReview(week) ?? null);
  }
  const limit = Math.min(20, Number(req.nextUrl.searchParams.get("limit") ?? "8"));
  return NextResponse.json(await listReviews(limit));
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const week = String(b.week_start ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week))
    return NextResponse.json({ error: "week_start must be YYYY-MM-DD" }, { status: 400 });
  const review = await upsertReview(
    week,
    String(b.went_well ?? "").slice(0, 1000),
    String(b.got_in_way ?? "").slice(0, 1000),
    String(b.protect_time ?? "").slice(0, 500),
  );
  return NextResponse.json(review, { status: 201 });
}
