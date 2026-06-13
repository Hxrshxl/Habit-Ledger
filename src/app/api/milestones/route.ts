import { NextRequest, NextResponse } from "next/server";
import { listMilestones, createMilestone } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const goalId = req.nextUrl.searchParams.get("goalId");
  const milestones = goalId
    ? await listMilestones(Number(goalId))
    : await listMilestones();
  return NextResponse.json(milestones);
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const goalId = Number(b?.goal_id);
  const title = String(b?.title ?? "").trim();
  if (!Number.isInteger(goalId) || goalId <= 0 || !title) {
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
