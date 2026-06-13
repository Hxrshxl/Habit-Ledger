import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting, regenerateToken } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    api_key: await getSetting("api_key") ?? await regenerateToken("api_key"),
    share_token: await getSetting("share_token"),
    webhook_url: await getSetting("webhook_url") ?? "",
    coach_enabled: Boolean(process.env.ANTHROPIC_API_KEY),
    password_enabled: Boolean(process.env.APP_PASSWORD),
  });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  switch (b?.action) {
    case "regen_api_key":
      return NextResponse.json({ api_key: await regenerateToken("api_key") });
    case "regen_share":
      return NextResponse.json({ share_token: await regenerateToken("share_token") });
    case "disable_share":
      await setSetting("share_token", null);
      return NextResponse.json({ share_token: null });
    case "set_webhook": {
      const url = String(b.url ?? "").trim();
      if (url && !/^https?:\/\/.{4,500}$/.test(url))
        return NextResponse.json({ error: "Webhook must be an http(s) URL." }, { status: 400 });
      await setSetting("webhook_url", url || null);
      return NextResponse.json({ webhook_url: url });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
