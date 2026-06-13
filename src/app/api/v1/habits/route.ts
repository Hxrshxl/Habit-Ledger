import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, listHabits } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await checkApiKey(req.headers.get("authorization")))
    return NextResponse.json({ error: "Unauthorized. Pass Authorization: Bearer <api key>." }, { status: 401 });
  return NextResponse.json((await listHabits()).map((h) => ({ id: h.id, name: h.name, category: h.category })));
}
