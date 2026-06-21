import { NextRequest, NextResponse } from "next/server";
import { listMilestones, createMilestone } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const goalId = req.nextUrl.searchParams.get("goalId") ?? undefined;
  const milestones = await listMilestones(goalId);
  return NextResponse.json(milestones, {
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" },
  });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const goalId = String(b?.goal_id ?? "").trim();
  const title = String(b?.title ?? "").trim();
  if (!goalId || !title) {
    return NextResponse.json({ error: "goal_id and title are required." }, { status: 400 });
  }
  const D = /^\d{4}-\d{2}-\d{2}$/;
  return NextResponse.json(
    await createMilestone({
      goal_id:            goalId,
      title:              title.slice(0, 150),
      explanation:        String(b?.explanation ?? "").slice(0, 500),
      estimated_duration: String(b?.estimated_duration ?? "").slice(0, 60),
      order_index:        Number(b?.order_index ?? 0),
      dependencies:       Array.isArray(b?.dependencies) ? JSON.stringify(b.dependencies) : "[]",
      success_criteria:   String(b?.success_criteria ?? "").slice(0, 400),
      target_date:        b?.target_date && D.test(b.target_date) ? b.target_date : null,
    }),
    { status: 201 }
  );
}
