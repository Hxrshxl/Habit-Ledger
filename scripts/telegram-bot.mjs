#!/usr/bin/env node
// Telegram bot scaffold for Habit Ledger.
//
// 1. Create a bot with @BotFather, get the token.
// 2. export TELEGRAM_TOKEN=...   HABIT_URL=http://localhost:3000   HABIT_KEY=<api key>
// 3. node scripts/telegram-bot.mjs
//
// Commands in chat:
//   /status          today's habits
//   /done <name>     mark a habit done (fuzzy match)

const TG = process.env.TELEGRAM_TOKEN;
const URL_ = process.env.HABIT_URL || "http://localhost:3000";
const KEY = process.env.HABIT_KEY;

if (!TG || !KEY) {
  console.error("Need TELEGRAM_TOKEN and HABIT_KEY env vars.");
  process.exit(1);
}

const tg = (method, body) =>
  fetch(`https://api.telegram.org/bot${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const api = async (path, method = "GET", body) => {
  const r = await fetch(`${URL_}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};

let offset = 0;
console.log("Bot polling… Ctrl+C to stop.");

while (true) {
  try {
    const res = await tg("getUpdates", { offset, timeout: 25 });
    for (const u of res.result ?? []) {
      offset = u.update_id + 1;
      const msg = u.message;
      if (!msg?.text) continue;
      const chat = msg.chat.id;
      const text = msg.text.trim();

      try {
        if (text.startsWith("/status")) {
          const s = await api("/api/v1/status");
          const lines = s.habits.map((h) => `${h.status === "done" ? "✅" : h.status === "skipped" ? "⏭" : "⬜"} ${h.name}`);
          await tg("sendMessage", { chat_id: chat, text: `${s.date} — ${s.done}/${s.total}\n${lines.join("\n")}` });
        } else if (text.startsWith("/done ")) {
          const name = text.slice(6).trim();
          const r = await api("/api/v1/complete", "POST", { habit: name });
          await tg("sendMessage", { chat_id: chat, text: `✅ ${r.habit} done for ${r.date}` });
        } else {
          await tg("sendMessage", { chat_id: chat, text: "Commands: /status, /done <habit name>" });
        }
      } catch (e) {
        await tg("sendMessage", { chat_id: chat, text: `⚠️ ${e.message}` });
      }
    }
  } catch (e) {
    console.error("poll error:", e.message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
