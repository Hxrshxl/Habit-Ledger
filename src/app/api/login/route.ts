import { NextRequest, NextResponse } from "next/server";
import { passwordEnabled, cookieValueFor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!passwordEnabled()) return NextResponse.json({ ok: true, note: "No password set." });
  const b = await req.json().catch(() => null);
  const pw = String(b?.password ?? "");
  if (pw !== process.env.APP_PASSWORD)
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("hl_auth", cookieValueFor(pw), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
