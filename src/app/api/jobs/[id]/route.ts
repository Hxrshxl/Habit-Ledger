import { NextRequest, NextResponse } from "next/server";
import { updateJob, deleteJob } from "@/lib/db";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = (await params).id;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  const job = await updateJob(id, body);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  return NextResponse.json(job);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = (await params).id;
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const ok = await deleteJob(id);
  if (!ok) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
