import { NextRequest, NextResponse } from "next/server";
import { listTodos, createTodo } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listTodos());
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const title = String(b?.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  const D = /^\d{4}-\d{2}-\d{2}$/;
  const due_date = b?.due_date && D.test(b.due_date) ? b.due_date : null;
  return NextResponse.json(await createTodo(title.slice(0, 200), due_date), { status: 201 });
}
