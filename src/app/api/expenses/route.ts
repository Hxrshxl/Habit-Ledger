import { NextRequest, NextResponse } from "next/server";
import { listExpenses, createExpense } from "@/lib/db";
import { localToday } from "@/lib/core";

export const dynamic = "force-dynamic";
const D = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to   = req.nextUrl.searchParams.get("to");
  const month = req.nextUrl.searchParams.get("month"); // YYYY-MM shortcut
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-");
    const last = new Date(Number(y), Number(m), 0).getDate();
    return NextResponse.json(await listExpenses(`${month}-01`, `${month}-${String(last).padStart(2, "0")}`));
  }
  if (!from || !to || !D.test(from) || !D.test(to))
    return NextResponse.json({ error: "Pass ?month=YYYY-MM or ?from=&to=YYYY-MM-DD." }, { status: 400 });
  return NextResponse.json(await listExpenses(from, to));
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const name   = String(b?.name ?? "").trim();
  const amount = Number(b?.amount);
  const date   = String(b?.date ?? localToday());

  if (!name)                       return NextResponse.json({ error: "name is required." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0)
                                   return NextResponse.json({ error: "amount must be a positive number." }, { status: 400 });
  if (!D.test(date) || date > localToday())
                                   return NextResponse.json({ error: "date must be YYYY-MM-DD and not in the future." }, { status: 400 });
  if (b?.type && !["expense", "credit"].includes(b.type))
                                   return NextResponse.json({ error: "type must be expense or credit." }, { status: 400 });

  return NextResponse.json(await createExpense({
    date, name, amount,
    type:     b?.type ?? "expense",
    category: String(b?.category ?? "Other").trim().slice(0, 50),
    note:     b?.note ? String(b.note).slice(0, 300) : null,
  }), { status: 201 });
}
