import { NextResponse } from "next/server";
import { listHabits, setEntry, entriesForHabit, logEvent } from "@/lib/db";
import { localToday, fmt } from "@/lib/core";

export const dynamic = "force-dynamic";

async function leetcodeDates(username: string): Promise<string[]> {
  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Referer: "https://leetcode.com" },
    body: JSON.stringify({
      query:
        "query recentAc($username: String!, $limit: Int!) { recentAcSubmissionList(username: $username, limit: $limit) { timestamp } }",
      variables: { username, limit: 50 },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`LeetCode responded ${res.status}`);
  const data = await res.json();
  const list: Array<{ timestamp: string }> = data?.data?.recentAcSubmissionList ?? [];
  return [...new Set(list.map((s) => fmt(new Date(Number(s.timestamp) * 1000))))];
}

async function githubDates(username: string, repo?: string): Promise<string[]> {
  const res = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`,
    {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "habit-ledger" },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
  const events = (await res.json()) as Array<{ type: string; created_at: string; repo?: { name: string } }>;
  const r = (repo ?? "").toLowerCase();
  return [
    ...new Set(
      events
        .filter((e) => e.type === "PushEvent")
        .filter((e) => !r || e.repo?.name?.toLowerCase() === r || e.repo?.name?.toLowerCase().endsWith(`/${r}`))
        .map((e) => e.created_at.slice(0, 10))
    ),
  ];
}

export async function POST() {
  const today = localToday();
  const results: Array<{ habit: string; type: string; marked: string[]; error?: string }> = [];

  for (const habit of await listHabits()) {
    if (habit.verify_type === "manual") continue;
    let cfg: { username?: string; repo?: string } = {};
    try { cfg = JSON.parse(habit.verify_config || "{}"); } catch { /* ignore */ }
    if (!cfg.username) {
      results.push({ habit: habit.name, type: habit.verify_type, marked: [], error: "No username configured." });
      continue;
    }
    try {
      const dates =
        habit.verify_type === "leetcode"
          ? await leetcodeDates(cfg.username)
          : await githubDates(cfg.username, cfg.repo || undefined);
      const have = new Set(
        (await entriesForHabit(habit.id)).filter((e) => e.status === "done").map((e) => e.date)
      );
      const marked: string[] = [];
      for (const d of dates) {
        if (d > today || have.has(d)) continue;
        await setEntry(habit.id, d, { status: "done", source: habit.verify_type });
        marked.push(d);
      }
      await logEvent("verify_run", habit.id, today, { source: habit.verify_type, marked: marked.length });
      results.push({ habit: habit.name, type: habit.verify_type, marked: marked.sort() });
    } catch (err) {
      results.push({
        habit: habit.name, type: habit.verify_type, marked: [],
        error: err instanceof Error ? err.message : "Verification failed.",
      });
    }
  }
  return NextResponse.json({ results });
}
