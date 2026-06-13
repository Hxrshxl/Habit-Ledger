import { NextRequest, NextResponse } from "next/server";
import { listBudgets, setBudget } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "Pass ?month=YYYY-MM." }, { status: 400 });
  return NextResponse.json(await listBudgets(month));
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const month    = String(b?.month ?? "").trim();
  const category = String(b?.category ?? "").trim().slice(0, 50);
  const amount   = Number(b?.amount);

  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "month must be YYYY-MM." }, { status: 400 });
  if (!category)
    return NextResponse.json({ error: "category is required." }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0)
    return NextResponse.json({ error: "amount must be a non-negative number." }, { status: 400 });

  await setBudget(month, category, amount);
  return NextResponse.json({ ok: true }, { status: 201 });
}
