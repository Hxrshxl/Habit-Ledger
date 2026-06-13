import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, listHabits, entriesForRange } from "@/lib/db";
import { localToday, buildEntryMap, isScheduled, ekey } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await checkApiKey(req.headers.get("authorization")))
    return NextResponse.json({ error: "Unauthorized. Pass Authorization: Bearer <api key>." }, { status: 401 });
  const today = localToday();
  const emap = buildEntryMap(await entriesForRange(today, today));
  const habits = (await listHabits())
    .filter((h) => isScheduled(h, today))
    .map((h) => ({ id: h.id, name: h.name, status: emap.get(ekey(h.id, today))?.status ?? "pending" }));
  const done = habits.filter((h) => h.status === "done").length;
  return NextResponse.json({ date: today, done, total: habits.length, habits });
}
