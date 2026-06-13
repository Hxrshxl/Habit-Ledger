import { NextRequest, NextResponse } from "next/server";
import { recentEvents } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  return NextResponse.json(await recentEvents(Number.isInteger(limit) ? limit : 50));
}
