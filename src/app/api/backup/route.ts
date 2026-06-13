import { NextResponse } from "next/server";
import { exportAll } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse(JSON.stringify(await exportAll(), null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="habit-ledger-backup.json"',
    },
  });
}
