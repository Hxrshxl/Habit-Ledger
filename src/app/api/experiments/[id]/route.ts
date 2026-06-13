import { NextRequest, NextResponse } from "next/server";
import { deleteExperiment } from "@/lib/db";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !await deleteExperiment(id))
    return NextResponse.json({ error: "Experiment not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
