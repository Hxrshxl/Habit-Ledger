import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { listEnabledRemindersForTime, listPushSubs, deletePushSub } from "@/lib/db";

export const dynamic = "force-dynamic";

function setupVapid(): boolean {
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const mail = process.env.VAPID_EMAIL ?? "mailto:admin@habit-ledger.app";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(mail, pub, priv);
  return true;
}

function istHHMM(): string {
  // Always evaluate in IST regardless of server TZ
  return new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).slice(0, 5); // "09:30"
}

function istDayOfWeek(): number {
  // 0=Sun … 6=Sat in IST
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return d.getDay();
}

export async function POST(req: NextRequest) {
  // Auth: must match CRON_SECRET if set
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  if (!setupVapid()) {
    return NextResponse.json({ error: "VAPID keys not configured." }, { status: 503 });
  }

  const currentTime = istHHMM();
  const currentDay  = istDayOfWeek();

  const reminders = await listEnabledRemindersForTime(currentTime);

  // Filter by day
  const due = reminders.filter((r) => {
    if (r.days === "daily") return true;
    return r.days.split(",").map(Number).includes(currentDay);
  });

  if (due.length === 0) return NextResponse.json({ sent: 0, time: currentTime });

  const subs = await listPushSubs();
  if (subs.length === 0) return NextResponse.json({ sent: 0, time: currentTime });

  let sent = 0;
  for (const reminder of due) {
    const payload = JSON.stringify({
      title: "Habit Ledger",
      body: reminder.message,
      url: "/",
    });
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) await deletePushSub(sub.endpoint);
      }
    }
  }

  return NextResponse.json({ sent, time: currentTime, reminders: due.length });
}

// Allow GET so cron-job.org can use simple GET requests too
export async function GET(req: NextRequest) {
  return POST(req);
}
