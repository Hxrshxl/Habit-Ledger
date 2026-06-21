import { NextResponse } from "next/server";
import { createExpense } from "@/lib/db";

export const dynamic = "force-dynamic";

const VALID_CATS = new Set([
  "Food","Transport","Entertainment","Shopping",
  "Health","Utilities","Education","Travel","Other",
  "Investment","Rent","Recharge",
]);

function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  raw = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (!isNaN(Date.parse(iso))) return iso;
  }
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return null;
}

interface ExpenseRow {
  date: string;
  name: string;
  amount: string;
  category?: string;
  note?: string;
  type?: string;
}

export async function POST(req: Request) {
  try {
    const { rows }: { rows: ExpenseRow[] } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ error: "No rows." }, { status: 400 });

    let inserted = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const date = normalizeDate(row.date);
      if (!date) { errors.push(`Row ${i + 2}: bad date "${row.date}"`); continue; }

      const name = row.name?.trim();
      if (!name) { errors.push(`Row ${i + 2}: empty name`); continue; }

      const amount = parseFloat(String(row.amount).replace(/[₹,\s]/g, ""));
      if (isNaN(amount) || amount <= 0) { errors.push(`Row ${i + 2}: bad amount "${row.amount}"`); continue; }

      const cat = row.category?.trim() || "Other";
      const category = VALID_CATS.has(cat) ? cat : "Other";
      const type = row.type?.toLowerCase() === "credit" ? "credit" : "expense";

      await createExpense({
        date,
        name,
        amount,
        type,
        category,
        note: row.note?.trim() || null,
      });
      inserted++;
    }

    return NextResponse.json({ inserted, errors });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
