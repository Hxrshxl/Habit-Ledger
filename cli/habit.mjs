#!/usr/bin/env node
// Habit Ledger CLI — talks to the external v1 API.
//
// Setup:
//   export HABIT_URL=http://localhost:3000
//   export HABIT_KEY=<your API key from Settings>
//
// Usage:
//   node cli/habit.mjs status            today's scheduled habits + state
//   node cli/habit.mjs list              all active habits
//   node cli/habit.mjs done <name> [date]  mark done (fuzzy name match), date = YYYY-MM-DD

const URL_ = process.env.HABIT_URL || "http://localhost:3000";
const KEY = process.env.HABIT_KEY;

if (!KEY) {
  console.error("Set HABIT_KEY (Settings → API access) and optionally HABIT_URL.");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function api(path, method = "GET", body) {
  const r = await fetch(`${URL_}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const [cmd, ...rest] = process.argv.slice(2);

try {
  if (cmd === "status") {
    const s = await api("/api/v1/status");
    console.log(`Today ${s.date} — ${s.done}/${s.total} done\n`);
    for (const h of s.habits) {
      const mark = h.status === "done" ? "✓" : h.status === "skipped" ? "–" : "·";
      console.log(`  ${mark} ${h.name}${h.streak ? `  (streak ${h.streak})` : ""}`);
    }
  } else if (cmd === "list") {
    const hs = await api("/api/v1/habits");
    for (const h of hs) console.log(`  ${h.id}. ${h.name} [${h.category}]`);
  } else if (cmd === "done") {
    const name = rest[0];
    const date = rest[1];
    if (!name) throw new Error('usage: done "<habit name>" [YYYY-MM-DD]');
    const r = await api("/api/v1/complete", "POST", { habit: name, date });
    console.log(`✓ ${r.habit} marked done for ${r.date}`);
  } else {
    console.log("commands: status | list | done <name> [date]");
  }
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
