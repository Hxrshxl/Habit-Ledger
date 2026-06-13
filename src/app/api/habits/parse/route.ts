import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface ParsedHabit {
  name: string;
  category: string;
  frequency_type: "daily" | "weekdays" | "weekly" | "interval";
  interval_days: number;
  weekdays: string;
  times_per_week: number;
  quantity_target: number;
  quantity_unit: string;
  why: string;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });

  const b = await req.json().catch(() => null);
  const text = String(b?.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "text is required." }, { status: 400 });

  const prompt = `You are a habit-tracker assistant. Parse the following plain-English habit description and return structured JSON.

User input: "${text}"

Return ONLY a valid JSON object with this exact structure:
{
  "name": "Short action-oriented habit name (start with a verb, max 60 chars)",
  "category": "One of: Health, Learning, Career, Finance, Personal, Routine, Other",
  "frequency_type": "daily | weekdays | weekly | interval",
  "interval_days": 7,
  "weekdays": "",
  "times_per_week": 1,
  "quantity_target": 0,
  "quantity_unit": "",
  "why": "One sentence: why this habit matters"
}

Rules for frequency_type:
- "daily" → every single day (e.g. "meditate daily", "drink water every day")
- "weekdays" → specific named days (e.g. "every Saturday and Sunday" → weekdays="0,6"; "every Monday Wednesday Friday" → weekdays="1,3,5"; "weekdays only" → weekdays="1,2,3,4,5")
  - Weekday codes: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  - weekdays field = comma-separated codes, e.g. "1,3,5"
- "weekly" → X times per week without specific days (e.g. "3 times a week", "twice weekly")
  - times_per_week = the number (1-7)
- "interval" → every N days/weeks/months (e.g. "every 2 weeks", "once a month", "twice a month")
  - interval_days = number of days between occurrences
  - "twice a month" or "2 times a month" → interval_days=15
  - "once a month" or "monthly" → interval_days=30
  - "every 2 weeks" or "biweekly" or "fortnightly" → interval_days=14
  - "every week" → interval_days=7
  - "every 3 months" or "quarterly" → interval_days=90
  - "every 10 days" → interval_days=10

Rules for quantity:
- If the user mentions a measurable amount (pages, km, minutes, problems, glasses, reps), set quantity_target > 0 and quantity_unit to the unit
- "read 30 pages" → quantity_target=30, quantity_unit="pages"
- "run 5km" → quantity_target=5, quantity_unit="km"
- "drink 8 glasses of water" → quantity_target=8, quantity_unit="glasses"
- Otherwise quantity_target=0, quantity_unit=""

Category inference:
- Health: exercise, diet, sleep, grooming, medical
- Learning: reading, courses, studying, coding practice
- Career: job search, networking, work tasks, portfolio
- Finance: savings, budgeting, expenses
- Routine: daily chores, maintenance tasks
- Personal: relationships, hobbies, mental health

Return nothing except the JSON object.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  let raw: string;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("[parse] Gemini error", res.status, err.slice(0, 400));
      return NextResponse.json({ error: `Gemini error: ${res.status} ${err.slice(0, 200)}` }, { status: 502 });
    }
    const data = await res.json();
    raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch (e) {
    return NextResponse.json({ error: `Failed to reach Gemini: ${(e as Error).message}` }, { status: 502 });
  }

  let parsed: ParsedHabit;
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
    if (!parsed.name) throw new Error("name missing");
  } catch {
    return NextResponse.json({ error: "AI returned invalid JSON. Try rephrasing." }, { status: 502 });
  }

  const FREQ = ["daily", "weekdays", "weekly", "interval"];
  const result: ParsedHabit = {
    name:           String(parsed.name ?? "").slice(0, 80),
    category:       ["Health","Learning","Career","Finance","Personal","Routine","Other"].includes(parsed.category) ? parsed.category : "Health",
    frequency_type: FREQ.includes(parsed.frequency_type) ? parsed.frequency_type as ParsedHabit["frequency_type"] : "daily",
    interval_days:  Math.max(1, Math.min(365, Number(parsed.interval_days) || 7)),
    weekdays:       String(parsed.weekdays ?? ""),
    times_per_week: Math.max(1, Math.min(7, Number(parsed.times_per_week) || 1)),
    quantity_target: Math.max(0, Number(parsed.quantity_target) || 0),
    quantity_unit:  String(parsed.quantity_unit ?? "").slice(0, 20),
    why:            String(parsed.why ?? "").slice(0, 120),
  };

  return NextResponse.json(result);
}
