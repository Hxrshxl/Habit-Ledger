import { NextRequest, NextResponse } from "next/server";
import { listGoals, createGoal } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listGoals(), {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" },
  });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Goal name is required." }, { status: 400 });
  const D = /^\d{4}-\d{2}-\d{2}$/;
  return NextResponse.json(
    await createGoal({
      name: name.slice(0, 120),
      description:  String(b?.description ?? "").slice(0, 500),
      target_date:  b?.target_date && D.test(b.target_date) ? b.target_date : null,
      category:     String(b?.category ?? "General").slice(0, 40),
      priority:     ["low","medium","high"].includes(b?.priority) ? b.priority : "medium",
      timeframe:    ["3m","6m","1y","3y","5y","custom"].includes(b?.timeframe) ? b.timeframe : "custom",
      start_date:   b?.start_date && D.test(b.start_date) ? b.start_date : null,
      ai_context:   String(b?.ai_context ?? "").slice(0, 1000),
      eisenhower:   ["do","schedule","delegate","eliminate"].includes(b?.eisenhower) ? b.eisenhower : null,
    }),
    { status: 201 }
  );
}
