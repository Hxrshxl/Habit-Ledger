import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { listPushSubs, deletePushSub, listHabits, entriesForRange } from "@/lib/db";
import { isScheduled, localToday, buildEntryMap, ekey } from "@/lib/core";

export const dynamic = "force-dynamic";

function setupVapid() {
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const mail = process.env.VAPID_EMAIL ?? "mailto:admin@habit-ledger.app";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(mail, pub, priv);
  return true;
}

export async function POST(req: NextRequest) {
  if (!setupVapid()) {
    return NextResponse.json({ error: "VAPID keys not configured." }, { status: 503 });
  }

  // Optional: secure cron calls with a shared secret
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const today = localToday();
  const habits = await listHabits(false);
  const entries = await entriesForRange(today, today);
  const emap = buildEntryMap(entries);

  const pending = habits.filter((h) => {
    if (!isScheduled(h, today)) return false;
    const e = emap.get(ekey(h.id, today));
    return !e || e.status !== "done";
  });

  const subs = await listPushSubs();
  if (subs.length === 0) return NextResponse.json({ sent: 0 });

  const payload = JSON.stringify({
    title: pending.length === 0 ? "All done today! 🎉" : `${pending.length} habit${pending.length !== 1 ? "s" : ""} pending`,
    body: pending.length === 0
      ? "You completed everything on your list."
      : pending.slice(0, 3).map((h) => `· ${h.name}`).join("\n") + (pending.length > 3 ? `\n· +${pending.length - 3} more` : ""),
    url: "/",
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (e: unknown) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) {
        await deletePushSub(sub.endpoint);
      }
    }
  }

  return NextResponse.json({ sent, total: subs.length });
}

// Allow GET for easy manual trigger testing
export async function GET(req: NextRequest) {
  return POST(req);
}
