"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { localToday, GOAL_TIMEFRAMES, GoalTimeframe, GOAL_CATEGORIES, computeTargetDate } from "@/lib/core";
import { jsend } from "@/lib/client";

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface PlanData {
  milestones: GeneratedMilestone[];
}

// ── Step components ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="row" style={{ gap: 8, justifyContent: "center", marginBottom: 24 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 12, fontWeight: 600,
            background: i < current ? "var(--accent)" : i === current ? "var(--accent)" : "var(--bg-2)",
            color: i <= current ? "#fff" : "var(--faint)",
            opacity: i < current ? 0.6 : 1,
          }}
        >
          {i < current ? "✓" : i + 1}
        </div>
      ))}
    </div>
  );
}

// Step 1 — Timeline + Category + Priority
function Step1({
  timeframe, setTimeframe, category, setCategory, priority, setPriority, onNext,
}: {
  timeframe: GoalTimeframe;
  setTimeframe: (t: GoalTimeframe) => void;
  category: string;
  setCategory: (c: string) => void;
  priority: string;
  setPriority: (p: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="stack">
      <div>
        <div className="section-title">Choose your timeline</div>
        <div className="muted small" style={{ marginBottom: 16 }}>How long do you have to achieve this goal?</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {GOAL_TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              className={`btn${timeframe === tf.value ? " btn-primary" : ""}`}
              style={{ padding: "14px 8px", textAlign: "center" }}
              onClick={() => setTimeframe(tf.value)}
            >
              <div style={{ fontWeight: 700, fontSize: 16 }}>{tf.label}</div>
              {tf.months && <div className="faint small">{tf.months} mo</div>}
            </button>
          ))}
        </div>
      </div>

      <div className="form-row">
        <label className="field">
          <span className="label">Category</span>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {GOAL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">Priority</span>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="high">High — primary focus</option>
            <option value="medium">Medium — steady work</option>
            <option value="low">Low — background effort</option>
          </select>
        </label>
      </div>

      <button className="btn btn-primary" onClick={onNext} style={{ alignSelf: "flex-end" }}>
        Next →
      </button>
    </div>
  );
}

// Step 2 — Goal details
function Step2({
  title, setTitle, description, setDescription, startDate, setStartDate,
  targetDate, setTargetDate, timeframe, onBack, onNext,
}: {
  title: string; setTitle: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  startDate: string; setStartDate: (v: string) => void;
  targetDate: string; setTargetDate: (v: string) => void;
  timeframe: GoalTimeframe;
  onBack: () => void; onNext: () => void;
}) {
  const tf = GOAL_TIMEFRAMES.find((t) => t.value === timeframe);
  const autoTarget = tf?.months ? computeTargetDate(timeframe, startDate) ?? "" : "";

  return (
    <div className="stack">
      <div className="section-title">Define your goal</div>
      <label className="field">
        <span className="label">What do you want to achieve?</span>
        <input
          className="input" autoFocus value={title}
          placeholder={
            timeframe === "3m" ? "e.g. Solve 150 DSA problems" :
            timeframe === "6m" ? "e.g. Switch to 12-16 LPA role" :
            timeframe === "1y" ? "e.g. Become a strong backend engineer" :
            timeframe === "3y" ? "e.g. Build a ₹1L/month income stream" :
            "e.g. Reach financial independence"
          }
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) onNext(); }}
          style={{ fontSize: 16, padding: "10px 12px" }}
        />
      </label>
      <label className="field">
        <span className="label">Description (optional)</span>
        <textarea
          className="input" rows={3} value={description}
          placeholder="More details — what success looks like for you"
          onChange={(e) => setDescription(e.target.value)}
          style={{ resize: "vertical" }}
        />
      </label>
      <div className="form-row">
        <label className="field">
          <span className="label">Start date</span>
          <input className="input" type="date" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">
            Target date
            {autoTarget && <span className="muted small"> (suggested: {autoTarget})</span>}
          </span>
          <input className="input" type="date" value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)} />
        </label>
      </div>
      {!targetDate && autoTarget && (
        <button className="btn btn-sm" style={{ alignSelf: "flex-start" }}
          onClick={() => setTargetDate(autoTarget)}>
          Use suggested date ({autoTarget})
        </button>
      )}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-sm" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext} disabled={!title.trim()}>
          Next →
        </button>
      </div>
    </div>
  );
}

// Step 3 — Context
function Step3({
  aiContext, setAiContext, onBack, onGenerate, generating,
}: {
  aiContext: string; setAiContext: (v: string) => void;
  onBack: () => void; onGenerate: () => void; generating: boolean;
}) {
  return (
    <div className="stack">
      <div className="section-title">Optional context</div>
      <div className="muted small">
        Tell the AI about your current situation, constraints, or priorities.
        This makes the generated plan much more accurate.
      </div>
      <textarea
        className="input" rows={6} autoFocus value={aiContext}
        placeholder={
          "Examples:\n" +
          "• I'm currently working 9-5, can give 1-2 hours daily\n" +
          "• I'm a beginner at DSA, know Python well\n" +
          "• Budget constraint: ₹500/month max\n" +
          "• I have a job interview in 3 months"
        }
        onChange={(e) => setAiContext(e.target.value)}
        style={{ resize: "vertical" }}
      />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-sm" onClick={onBack} disabled={generating}>← Back</button>
        <button className="btn btn-primary" onClick={onGenerate} disabled={generating}>
          {generating ? (
            <span className="row" style={{ gap: 8 }}>
              <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
              Generating plan…
            </span>
          ) : (
            "Generate AI Plan →"
          )}
        </button>
      </div>
    </div>
  );
}

// Step 4 — Review & edit plan
function Step4({
  plan, setPlan, onBack, onSave, saving, saveErr,
}: {
  plan: PlanData;
  setPlan: (p: PlanData) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  saveErr: string;
}) {
  function updateMilestone(idx: number, field: keyof GeneratedMilestone, value: string) {
    const ms = [...plan.milestones];
    ms[idx] = { ...ms[idx], [field]: value };
    setPlan({ milestones: ms });
  }

  function updateHabit(msIdx: number, hIdx: number, field: keyof GeneratedHabit, value: string | number) {
    const ms = [...plan.milestones];
    const habits = [...ms[msIdx].habits];
    habits[hIdx] = { ...habits[hIdx], [field]: value };
    ms[msIdx] = { ...ms[msIdx], habits };
    setPlan({ milestones: ms });
  }

  function removeMilestone(idx: number) {
    setPlan({ milestones: plan.milestones.filter((_, i) => i !== idx) });
  }

  function removeHabit(msIdx: number, hIdx: number) {
    const ms = [...plan.milestones];
    ms[msIdx] = { ...ms[msIdx], habits: ms[msIdx].habits.filter((_, i) => i !== hIdx) };
    setPlan({ milestones: ms });
  }

  function addHabit(msIdx: number) {
    const ms = [...plan.milestones];
    ms[msIdx] = {
      ...ms[msIdx],
      habits: [...ms[msIdx].habits, { title: "", frequency: "daily", times_per_week: 5, target: 1, unit: "time", why: "" }],
    };
    setPlan({ milestones: ms });
  }

  return (
    <div className="stack">
      <div className="section-title">Review your AI-generated plan</div>
      <div className="muted small">
        Edit any milestone or habit before saving. You can always add more later.
      </div>

      {plan.milestones.map((ms, msIdx) => (
        <div key={msIdx} className="card stack" style={{ borderLeft: "3px solid var(--accent)" }}>
          <div className="spread">
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <span className="pill accent" style={{ fontSize: 11, flexShrink: 0 }}>M{ms.order_index}</span>
              <input
                className="input"
                value={ms.title}
                onChange={(e) => updateMilestone(msIdx, "title", e.target.value)}
                style={{ fontWeight: 600, fontSize: 14 }}
              />
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => removeMilestone(msIdx)} style={{ flexShrink: 0 }}>✕</button>
          </div>

          {ms.explanation && (
            <div className="muted small">{ms.explanation}</div>
          )}

          <div className="form-row" style={{ gap: 8 }}>
            {ms.estimated_duration && (
              <span className="faint small">~{ms.estimated_duration}</span>
            )}
            {ms.target_date && (
              <span className="faint small">Target: {ms.target_date}</span>
            )}
            {ms.success_criteria && (
              <span className="faint small">Done when: {ms.success_criteria}</span>
            )}
          </div>

          <div className="section-title" style={{ fontSize: 11, margin: "4px 0" }}>Habits</div>
          <div className="stack" style={{ gap: 6 }}>
            {ms.habits.map((h, hIdx) => (
              <div key={hIdx} className="milestone-card">
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <input
                    className="input"
                    value={h.title}
                    onChange={(e) => updateHabit(msIdx, hIdx, "title", e.target.value)}
                    placeholder="Habit name"
                    style={{ flex: 2 }}
                  />
                  <select
                    className="select"
                    value={h.frequency}
                    onChange={(e) => updateHabit(msIdx, hIdx, "frequency", e.target.value)}
                    style={{ flex: 1, minWidth: 90 }}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekdays">Weekdays</option>
                    <option value="weekly">Weekly</option>
                  </select>
                  <button className="btn btn-sm btn-danger" onClick={() => removeHabit(msIdx, hIdx)}>✕</button>
                </div>
                {h.why && <div className="faint small" style={{ marginTop: 2 }}>{h.why}</div>}
              </div>
            ))}
            <button className="btn btn-sm" onClick={() => addHabit(msIdx)} style={{ alignSelf: "flex-start" }}>
              + Add habit
            </button>
          </div>
        </div>
      ))}

      {saveErr && <div className="error-text">{saveErr}</div>}

      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-sm" onClick={onBack} disabled={saving}>← Regenerate</button>
        <button className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : `Save plan (${plan.milestones.length} milestones)`}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GoalCreatePage() {
  const router = useRouter();
  const today = localToday();

  // Step state
  const [step, setStep] = useState(0);

  // Form values
  const [timeframe, setTimeframe]   = useState<GoalTimeframe>("1y");
  const [category,  setCategory]    = useState("Career");
  const [priority,  setPriority]    = useState("medium");
  const [title,     setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate]   = useState(today);
  const [targetDate, setTargetDate] = useState("");
  const [aiContext, setAiContext]   = useState("");

  // Generation + save state
  const [plan,       setPlan]       = useState<PlanData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genErr,     setGenErr]     = useState("");
  const [saving,     setSaving]     = useState(false);
  const [saveErr,    setSaveErr]    = useState("");

  const tf = GOAL_TIMEFRAMES.find((t) => t.value === timeframe);
  const timeframeLabel = tf?.label ?? "custom";

  async function generatePlan() {
    setGenerating(true); setGenErr(""); setPlan(null);
    try {
      const data = await jsend<{ milestones: GeneratedMilestone[] }>("/api/goals/generate", "POST", {
        title,
        description,
        category,
        timeframe_label: timeframeLabel,
        start_date:  startDate,
        target_date: targetDate || null,
        ai_context:  aiContext,
      });
      setPlan({ milestones: data.milestones });
      setStep(3);
    } catch (e) {
      setGenErr((e as Error).message);
    }
    setGenerating(false);
  }

  async function savePlan() {
    if (!plan) return;
    setSaving(true); setSaveErr("");
    try {
      // 1. Create goal
      const goal = await jsend<{ id: number }>("/api/goals", "POST", {
        name:        title.trim(),
        description: description.trim(),
        category,
        priority,
        timeframe,
        start_date:  startDate,
        target_date: targetDate || null,
        ai_context:  aiContext.trim(),
      });

      // 2. Create milestones sequentially (need IDs), then habits in parallel
      const milestonesWithHabits: { id: number; habits: GeneratedHabit[] }[] = [];
      for (const ms of plan.milestones) {
        const milestone = await jsend<{ id: number }>("/api/milestones", "POST", {
          goal_id:            goal.id,
          title:              ms.title.trim(),
          explanation:        ms.explanation,
          estimated_duration: ms.estimated_duration,
          order_index:        ms.order_index,
          dependencies:       ms.dependencies,
          success_criteria:   ms.success_criteria,
          target_date:        ms.target_date,
        });
        milestonesWithHabits.push({ id: milestone.id, habits: ms.habits });
      }

      await Promise.all(
        milestonesWithHabits.flatMap(({ id: milestoneId, habits }) =>
          habits
            .filter((h) => h.title.trim())
            .map((h) =>
              jsend("/api/habits", "POST", {
                name:           h.title.trim(),
                category,
                frequency_type: h.frequency === "weekdays" ? "weekdays" : h.frequency === "weekly" ? "weekly" : "daily",
                weekdays:       h.frequency === "weekdays" ? "1,2,3,4,5" : "",
                times_per_week: h.times_per_week ?? 5,
                goal:           30,
                milestone_id:   milestoneId,
                why:            h.why,
              })
            )
        )
      );

      router.push("/goals");
    } catch (e) {
      setSaveErr((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="page-head">
        <h1>New goal</h1>
        <div className="muted small">AI will generate your milestones and habits — no templates, fully dynamic.</div>
      </div>

      <div className="card stack">
        <StepIndicator current={step} total={4} />

        {step === 0 && (
          <Step1
            timeframe={timeframe} setTimeframe={setTimeframe}
            category={category}  setCategory={setCategory}
            priority={priority}  setPriority={setPriority}
            onNext={() => setStep(1)}
          />
        )}

        {step === 1 && (
          <Step2
            title={title}             setTitle={setTitle}
            description={description} setDescription={setDescription}
            startDate={startDate}     setStartDate={setStartDate}
            targetDate={targetDate}   setTargetDate={setTargetDate}
            timeframe={timeframe}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <Step3
            aiContext={aiContext} setAiContext={setAiContext}
            onBack={() => setStep(1)}
            onGenerate={generatePlan}
            generating={generating}
          />
        )}

        {step === 2 && genErr && <div className="error-text">{genErr}</div>}

        {step === 3 && plan && (
          <Step4
            plan={plan}   setPlan={setPlan}
            onBack={() => { setPlan(null); setStep(2); }}
            onSave={savePlan}
            saving={saving}
            saveErr={saveErr}
          />
        )}
      </div>
    </div>
  );
}
