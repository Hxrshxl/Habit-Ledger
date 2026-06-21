import { NextResponse } from "next/server";
import { listHabits, createHabit, setEntry } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ImportRow {
  date: string;
  task: string;
  category?: string;
  status?: string;
  note?: string;
  duration_minutes?: string;
}

// Normalize various date formats → YYYY-MM-DD
function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  raw = raw.trim();

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // DD/MM/YYYY or DD-MM-YYYY (Indian format)
  const dmy = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (!isNaN(Date.parse(iso))) return iso;
  }

  // Try native parse as fallback (handles "Jun 15 2026" etc.)
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

function normalizeStatus(raw: string | undefined): "done" | "skipped" {
  if (!raw) return "done";
  const v = raw.toLowerCase().trim();
  if (["skip", "skipped", "no", "0", "x", "false"].includes(v)) return "skipped";
  return "done";
}

export async function POST(req: Request) {
  try {
    const { rows }: { rows: ImportRow[] } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided." }, { status: 400 });
    }

    // Load existing habits (all, including archived) for name-matching
    const existing = await listHabits(true);
    const habitByName = new Map<string, string>(); // lowercase name → habit id
    for (const h of existing) {
      habitByName.set(h.name.toLowerCase().trim(), h.id);
    }

    let createdCount = 0;
    let entriesSet = 0;
    const errors: string[] = [];

    // Collect unique tasks (preserve first-seen category)
    const taskMeta = new Map<string, string>(); // lower name → category
    for (const row of rows) {
      if (!row.task?.trim()) continue;
      const key = row.task.trim().toLowerCase();
      if (!taskMeta.has(key)) taskMeta.set(key, row.category?.trim() || "General");
    }

    // Create habits that don't exist yet
    for (const [key, category] of taskMeta) {
      if (!habitByName.has(key)) {
        // Recover original casing from rows
        const originalName = rows.find(r => r.task.trim().toLowerCase() === key)!.task.trim();
        const h = await createHabit({ name: originalName, category, frequency_type: "daily" });
        habitByName.set(key, h.id);
        createdCount++;
      }
    }

    // Set entries row by row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const task = row.task?.trim();
      if (!task) { errors.push(`Row ${i + 2}: empty task name`); continue; }

      const date = normalizeDate(row.date);
      if (!date) { errors.push(`Row ${i + 2}: unreadable date "${row.date}"`); continue; }

      const habitId = habitByName.get(task.toLowerCase());
      if (!habitId) { errors.push(`Row ${i + 2}: no habit for "${task}"`); continue; }

      const status = normalizeStatus(row.status);
      const note = row.note?.trim() || null;
      const dur = row.duration_minutes ? parseInt(row.duration_minutes, 10) : null;

      await setEntry(habitId, date, {
        status,
        note,
        source: "import",
        duration_minutes: dur && !isNaN(dur) ? dur : null,
      });
      entriesSet++;
    }

    return NextResponse.json({ created_habits: createdCount, entries_set: entriesSet, errors });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
