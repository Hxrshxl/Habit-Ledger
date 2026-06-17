import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface GeneratedHabit {
  title: string;
  frequency: string;
  times_per_week: number;
  target: number;
  unit: string;
  why: string;
}

interface GeneratedMilestone {
  title: string;
  explanation: string;
  estimated_duration: string;
  order_index: number;
  dependencies: number[];
  success_criteria: string;
  target_date: string | null;
  habits: GeneratedHabit[];
}

interface GeminiPlan {
  milestones: GeneratedMilestone[];
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

  const b = await req.json().catch(() => null);
  if (!b?.title) return NextResponse.json({ error: "title is required." }, { status: 400 });

  const { title, description = "", category = "General", timeframe_label = "custom",
    start_date, target_date, ai_context = "" } = b;

  const prompt = `You are an expert goal execution planner. Your job is to break down a user's goal into a realistic, actionable plan with milestones and daily habits.

User Goal: "${title}"
Category: ${category}
Description: "${description}"
Timeline: ${timeframe_label} (${start_date} to ${target_date ?? "open-ended"})
User context / constraints: "${ai_context || "none provided"}"
Today's date: ${start_date}

Generate a practical plan. Return ONLY a valid JSON object with this exact structure:

{
  "milestones": [
    {
      "title": "Milestone title (concise, action-oriented)",
      "explanation": "Why this milestone matters and what achieving it unlocks",
      "estimated_duration": "e.g. '3 weeks' or '2 months'",
      "order_index": 1,
      "dependencies": [],
      "success_criteria": "Specific, measurable definition of 'done' for this milestone",
      "target_date": "YYYY-MM-DD or null",
      "habits": [
        {
          "title": "Habit name (start with a verb, be specific)",
          "frequency": "daily",
          "times_per_week": 5,
          "target": 1,
          "unit": "session",
          "why": "One sentence: how this habit drives the milestone"
        }
      ]
    }
  ]
}

Guidelines:
- Timeline milestone count: 3 months → 2-3, 6 months → 3-4, 1 year → 4-6, 3+ years → 5-8
- Each milestone must have 2-4 habits (no more, no less)
- Habits must be concrete: "Solve 2 DSA problems" not "Practice coding"
- frequency options: "daily", "weekdays", "weekly"
- Milestones build sequentially — later ones depend on earlier completions
- dependencies = array of order_index values this milestone depends on (empty for first)
- Spread target_dates evenly across the timeline; use null only if no target_date provided
- All content must be specific to THIS goal — no generic advice
- Return nothing except the JSON object`;

  let raw: string;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(30000),
      }
    );
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return NextResponse.json({ error: `Gemini API error: ${res.status} ${err.slice(0, 200)}` }, { status: 502 });
    }
    const data = await res.json();
    raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch (e) {
    return NextResponse.json({ error: `Failed to reach Gemini: ${(e as Error).message}` }, { status: 502 });
  }

  let plan: GeminiPlan;
  try {
    // Strip markdown fences if Gemini wraps the JSON
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    plan = JSON.parse(cleaned);
    if (!Array.isArray(plan.milestones)) throw new Error("milestones missing");
  } catch {
    return NextResponse.json({ error: "AI returned invalid JSON. Try again." }, { status: 502 });
  }

  // Normalise and validate the plan
  const milestones: GeneratedMilestone[] = plan.milestones.map((ms, i) => ({
    title:              String(ms.title ?? `Milestone ${i + 1}`).slice(0, 150),
    explanation:        String(ms.explanation ?? "").slice(0, 500),
    estimated_duration: String(ms.estimated_duration ?? "").slice(0, 60),
    order_index:        Number(ms.order_index ?? i + 1),
    dependencies:       Array.isArray(ms.dependencies) ? ms.dependencies.map(Number) : [],
    success_criteria:   String(ms.success_criteria ?? "").slice(0, 400),
    target_date:        ms.target_date && /^\d{4}-\d{2}-\d{2}$/.test(String(ms.target_date)) ? String(ms.target_date) : null,
    habits: (Array.isArray(ms.habits) ? ms.habits : []).map((h) => ({
      title:         String(h.title ?? "Habit").slice(0, 120),
      frequency:     ["daily","weekdays","weekly"].includes(h.frequency) ? h.frequency : "daily",
      times_per_week: Number(h.times_per_week ?? 5),
      target:        Number(h.target ?? 1),
      unit:          String(h.unit ?? "time").slice(0, 40),
      why:           String(h.why ?? "").slice(0, 200),
    })),
  }));

  return NextResponse.json({ milestones });
}
