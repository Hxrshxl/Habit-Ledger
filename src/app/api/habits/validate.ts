export function validateHabitBody(b: Record<string, unknown>, partial = false) {
  const out: Record<string, unknown> = {};
  const FREQ   = ["daily", "weekdays", "weekly", "interval"];
  const VERIFY = ["manual", "leetcode", "github"];

  if (b.name !== undefined || !partial) {
    const name = String(b.name ?? "").trim();
    if (!name) return { error: "Habit name is required." };
    out.name = name.slice(0, 80);
  }
  if (b.category !== undefined) out.category = String(b.category).trim().slice(0, 40) || "General";
  if (b.goal !== undefined) {
    const g = Number(b.goal);
    if (!Number.isInteger(g) || g < 1 || g > 31) return { error: "Goal must be 1-31 days." };
    out.goal = g;
  }
  if (b.frequency_type !== undefined) {
    if (!FREQ.includes(String(b.frequency_type))) return { error: "frequency_type must be daily, weekdays, weekly or interval." };
    out.frequency_type = b.frequency_type;
  }
  if (b.interval_days !== undefined) {
    const n = Number(b.interval_days);
    if (!Number.isInteger(n) || n < 1 || n > 365) return { error: "interval_days must be 1-365." };
    out.interval_days = n;
  }
  if (b.weekdays !== undefined) {
    const parts = String(b.weekdays).split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.some((p) => !/^[0-6]$/.test(p))) return { error: "weekdays must be CSV of 0-6." };
    out.weekdays = parts.join(",");
  }
  if (b.times_per_week !== undefined) {
    const t = Number(b.times_per_week);
    if (!Number.isInteger(t) || t < 1 || t > 7) return { error: "times_per_week must be 1-7." };
    out.times_per_week = t;
  }
  if (b.quantity_target !== undefined) {
    const q = Number(b.quantity_target);
    if (!Number.isInteger(q) || q < 0 || q > 100000) return { error: "quantity_target must be 0-100000." };
    out.quantity_target = q;
  }
  if (b.quantity_unit !== undefined) out.quantity_unit = String(b.quantity_unit).slice(0, 20);
  if (b.verify_type !== undefined) {
    if (!VERIFY.includes(String(b.verify_type))) return { error: "verify_type must be manual, leetcode or github." };
    out.verify_type = b.verify_type;
  }
  if (b.verify_config !== undefined) {
    try {
      const cfg = typeof b.verify_config === "string" ? JSON.parse(b.verify_config) : b.verify_config;
      out.verify_config = JSON.stringify({
        username: String(cfg?.username ?? "").slice(0, 60),
        repo: String(cfg?.repo ?? "").slice(0, 100),
      });
    } catch {
      return { error: "verify_config must be JSON." };
    }
  }
  if (b.goal_id !== undefined) out.goal_id = b.goal_id === null ? null : String(b.goal_id);
  if (b.milestone_id !== undefined) out.milestone_id = b.milestone_id === null ? null : String(b.milestone_id);
  if (b.archived !== undefined) out.archived = b.archived ? 1 : 0;
  if (b.why !== undefined) out.why = String(b.why).slice(0, 120);
  if (b.pause_until !== undefined) {
    if (b.pause_until === null) out.pause_until = null;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(String(b.pause_until))) out.pause_until = String(b.pause_until);
    else return { error: "pause_until must be YYYY-MM-DD or null." };
  }
  return { value: out };
}
