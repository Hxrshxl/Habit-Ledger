"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { jget, jsend } from "@/lib/client";
import ConfirmModal from "@/components/ConfirmModal";

interface Settings {
  api_key: string;
  share_token: string | null;
  webhook_url: string;
  coach_enabled: boolean;
  password_enabled: boolean;
}

interface VerifyResult { habit: string; type: string; marked: string[]; error?: string }

interface Reminder {
  id: string;
  message: string;
  time: string;
  days: string;
  enabled: boolean;
}

const WD_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SettingsPage() {
  const [s, setS]               = useState<Settings | null>(null);
  const [err, setErr]           = useState("");
  const [msg, setMsg]           = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyOut, setVerifyOut] = useState<VerifyResult[] | null>(null);
  const [pendingImport, setPendingImport] = useState<object | null>(null);

  // Push notifications
  const [pushSupported, setPushSupported]   = useState(false);
  const [pushEnabled,   setPushEnabled]     = useState(false);
  const [pushLoading,   setPushLoading]     = useState(false);
  const [pushErr,       setPushErr]         = useState("");
  const swRef = useRef<ServiceWorkerRegistration | null>(null);

  // PWA install detection
  const [isStandalone, setIsStandalone] = useState(false);
  useEffect(() => {
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
  }, []);

  // Custom reminders
  const [reminders,    setReminders]    = useState<Reminder[]>([]);
  const [rForm,        setRForm]        = useState({ message: "", time: "09:00", days: "daily" });
  const [rDays,        setRDays]        = useState<number[]>([]);
  const [rDayMode,     setRDayMode]     = useState<"daily" | "custom">("daily");
  const [rErr,         setRErr]         = useState("");
  const [rSaving,      setRSaving]      = useState(false);

  const loadReminders = useCallback(async () => {
    try { setReminders(await jget<Reminder[]>("/api/reminders")); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadReminders(); }, [loadReminders]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setPushSupported(true);
    navigator.serviceWorker.ready.then((reg) => {
      swRef.current = reg;
      reg.pushManager.getSubscription().then((sub) => setPushEnabled(!!sub));
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await jget<Settings>("/api/settings");
      setS(data); setErr("");
    } catch (e) { setErr((e as Error).message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function action(a: string, extra?: Record<string, unknown>) {
    setMsg(""); setErr("");
    try {
      await jsend("/api/settings", "POST", { action: a, ...extra });
      await load();
      setMsg("Saved.");
    } catch (e) { setErr((e as Error).message); }
  }

  async function runVerify() {
    setVerifying(true); setVerifyOut(null); setErr("");
    try {
      const r = await jsend<{ results: VerifyResult[] }>("/api/verify/run", "POST", {});
      setVerifyOut(r.results);
    } catch (e) { setErr((e as Error).message); }
    setVerifying(false);
  }

  async function importFile(f: File) {
    setErr(""); setMsg("");
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      setPendingImport(json);
    } catch (e) { setErr(`Import failed: ${(e as Error).message}`); }
  }

  async function togglePush() {
    setPushErr(""); setPushLoading(true);
    try {
      const reg = swRef.current ?? await navigator.serviceWorker.ready;
      swRef.current = reg;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await jsend("/api/push/subscribe", "DELETE", { endpoint: sub.endpoint });
        }
        setPushEnabled(false);
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { setPushErr("Notification permission denied."); setPushLoading(false); return; }
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
        const keyBytes = urlBase64ToUint8Array(vapidKey);
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
        await jsend("/api/push/subscribe", "POST", sub.toJSON());
        setPushEnabled(true);
      }
    } catch (e) { setPushErr((e as Error).message); }
    setPushLoading(false);
  }

  function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw     = atob(base64);
    const bytes   = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  async function addReminder() {
    setRErr(""); setRSaving(true);
    const days = rDayMode === "daily" ? "daily" : rDays.sort().join(",");
    if (rDayMode === "custom" && rDays.length === 0) { setRErr("Pick at least one day."); setRSaving(false); return; }
    if (!rForm.message.trim()) { setRErr("Message is required."); setRSaving(false); return; }
    try {
      await jsend("/api/reminders", "POST", { message: rForm.message.trim(), time: rForm.time, days });
      setRForm({ message: "", time: "09:00", days: "daily" });
      setRDays([]); setRDayMode("daily");
      await loadReminders();
    } catch (e) { setRErr((e as Error).message); }
    setRSaving(false);
  }

  async function toggleReminder(r: Reminder) {
    await jsend(`/api/reminders/${r.id}`, "PATCH", { enabled: !r.enabled }).catch(() => {});
    setReminders(prev => prev.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x));
  }

  async function deleteReminder(r: Reminder) {
    await jsend(`/api/reminders/${r.id}`, "DELETE").catch(() => {});
    setReminders(prev => prev.filter(x => x.id !== r.id));
  }

  function daysLabel(days: string): string {
    if (days === "daily") return "Every day";
    const nums = days.split(",").map(Number);
    if (nums.length === 5 && !nums.includes(0) && !nums.includes(6)) return "Weekdays";
    if (nums.length === 2 && nums.includes(0) && nums.includes(6)) return "Weekends";
    return nums.map(n => WD_LABELS[n]).join(", ");
  }

  async function confirmImport() {
    if (!pendingImport) return;
    const json = pendingImport;
    setPendingImport(null);
    try {
      await jsend("/api/import", "POST", json);
      setMsg("Import complete.");
    } catch (e) { setErr(`Import failed: ${(e as Error).message}`); }
  }

  if (!s) return <div className="muted">{err || "Loading…"}</div>;

  return (
    <div className="stack">
      {pendingImport && (
        <ConfirmModal
          title="Replace all data?"
          message="Importing will permanently overwrite ALL current habits, entries, goals, and settings with the backup file. This cannot be undone."
          confirmLabel="Yes, import"
          danger
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
      <div className="page-head"><h1>Settings</h1></div>
      {err && <div className="error-text">{err}</div>}
      {msg && <div className="ok-text">{msg}</div>}

      {/* ── Auto-verification ── */}
      <div className="card stack">
        <div className="section-title">Auto-verification</div>
        <div className="muted small">
          Automatically marks DSA or GitHub habit days as done based on your actual submissions.
          <strong> 100% free</strong> — uses public APIs, no account needed.
        </div>

        <div className="verify-how">
          <div className="verify-step">
            <span className="verify-num">1</span>
            <span>Tracker → click <strong>⋯</strong> on a habit → <strong>Edit</strong></span>
          </div>
          <div className="verify-step">
            <span className="verify-num">2</span>
            <span>Set <strong>Auto-verification</strong> to <em>LeetCode</em> or <em>GitHub</em>, enter your username</span>
          </div>
          <div className="verify-step">
            <span className="verify-num">3</span>
            <span>Click <strong>"Run verification now"</strong> below — back-fills last 30 days, verified days show green</span>
          </div>
        </div>

        <div>
          <button className="btn btn-primary btn-sm" onClick={runVerify} disabled={verifying}>
            {verifying ? "Checking…" : "Run verification now"}
          </button>
        </div>

        {verifyOut && (
          <table className="table">
            <thead><tr><th>Habit</th><th>Source</th><th>Result</th></tr></thead>
            <tbody>
              {verifyOut.length === 0 && (
                <tr><td colSpan={3} className="muted small">
                  No habits have auto-verification set up yet. Edit a habit in the Tracker to add your LeetCode username.
                </td></tr>
              )}
              {verifyOut.map((r, i) => (
                <tr key={i}>
                  <td>{r.habit}</td>
                  <td>{r.type}</td>
                  <td className="small">
                    {r.error
                      ? <span className="error-text">{r.error}</span>
                      : r.marked.length
                        ? <span className="ok-text">✓ marked {r.marked.length} day{r.marked.length !== 1 ? "s" : ""}: {r.marked.join(", ")}</span>
                        : <span className="muted">nothing new since last run</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Public share ── */}
      <div className="card stack">
        <div className="section-title">Public share link</div>
        <div className="muted small">
          Read-only page showing your current-month progress. Share with a mentor or friend for accountability — they see your stats, nothing else.
        </div>
        {s.share_token ? (
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            <code className="mono small" style={{ wordBreak: "break-all" }}>
              {typeof window !== "undefined" && window.location.origin}/share/{s.share_token}
            </code>
            <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/share/${s.share_token}`)}>Copy</button>
            <button className="btn btn-sm btn-danger" onClick={() => action("disable_share")}>Disable</button>
          </div>
        ) : (
          <div><button className="btn btn-sm" onClick={() => action("regen_share")}>Enable sharing</button></div>
        )}
      </div>

      {/* ── Install to home screen ── */}
      {!isStandalone && (
        <div className="card stack">
          <div className="section-title">Install app on your phone</div>
          <div className="muted small">Add to home screen so push notifications work even when the app is closed.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="stack" style={{ gap: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Android (Chrome)</div>
              {[
                "Open this app in Chrome on your phone",
                'Tap the 3-dot menu (⋮) → "Add to Home screen"',
                'Tap "Add" to confirm',
                "Open the app from your home screen",
                "Go to Settings → Enable reminders below",
              ].map((step, i) => (
                <div key={i} className="row" style={{ gap: 8, fontSize: 12, alignItems: "flex-start" }}>
                  <span style={{ fontWeight: 700, color: "var(--accent)", flexShrink: 0, width: 16 }}>{i + 1}</span>
                  <span className="muted">{step}</span>
                </div>
              ))}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>iPhone (iOS 16.4+ required)</div>
              {[
                "Open this app in Safari on your iPhone",
                'Tap the Share icon (□↑) at the bottom',
                'Scroll down → tap "Add to Home Screen"',
                "Open the app from your home screen (not Safari)",
                "Go to Settings → Enable reminders below",
              ].map((step, i) => (
                <div key={i} className="row" style={{ gap: 8, fontSize: 12, alignItems: "flex-start" }}>
                  <span style={{ fontWeight: 700, color: "var(--accent)", flexShrink: 0, width: 16 }}>{i + 1}</span>
                  <span className="muted">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Push notifications ── */}
      {pushSupported && (
        <div className="card stack">
          <div className="section-title">Push notifications</div>
          <div className="muted small">
            Enable once from your phone after installing the app to your home screen. Works even when the app is closed.
          </div>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <button
              className={`btn btn-sm${pushEnabled ? " btn-danger" : " btn-primary"}`}
              onClick={togglePush}
              disabled={pushLoading}
            >
              {pushLoading ? "…" : pushEnabled ? "Disable notifications" : "Enable notifications"}
            </button>
            {pushEnabled && <span className="ok-text" style={{ margin: 0 }}>Active — your phone is subscribed</span>}
            {pushErr && <span className="error-text" style={{ margin: 0 }}>{pushErr}</span>}
          </div>
        </div>
      )}

      {/* ── Custom reminders ── */}
      {pushSupported && (
        <div className="card stack">
          <div className="section-title">Custom reminders</div>
          <div className="muted small">
            Set timed alerts for anything — "Drink water", "10 LinkedIn connections", "Check emails". Fires at the exact minute on your phone via <strong>cron-job.org</strong> (see setup below).
          </div>

          {/* Add form */}
          <div className="stack" style={{ gap: 8, padding: "12px 14px", background: "var(--bg-alt)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            <div className="form-row">
              <label className="field" style={{ flex: "2 1 200px" }}>
                <span className="label">Message</span>
                <input className="input" placeholder="Drink water now" value={rForm.message} onChange={e => setRForm(f => ({ ...f, message: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") addReminder(); }} />
              </label>
              <label className="field" style={{ flex: "0 0 110px" }}>
                <span className="label">Time (IST)</span>
                <input className="input" type="time" value={rForm.time} onChange={e => setRForm(f => ({ ...f, time: e.target.value }))} />
              </label>
            </div>
            <div className="field">
              <span className="label">Days</span>
              <div className="row" style={{ gap: 6, marginTop: 4 }}>
                <button type="button" className={`pill${rDayMode === "daily" ? " accent" : ""}`} onClick={() => setRDayMode("daily")} style={{ cursor: "pointer" }}>Every day</button>
                <button type="button" className={`pill${rDayMode === "custom" ? " accent" : ""}`} onClick={() => setRDayMode("custom")} style={{ cursor: "pointer" }}>Custom</button>
                {rDayMode === "custom" && WD_LABELS.map((w, i) => (
                  <button key={i} type="button" className={`pill${rDays.includes(i) ? " accent" : ""}`} onClick={() => setRDays(d => d.includes(i) ? d.filter(x => x !== i) : [...d, i])} style={{ cursor: "pointer" }}>{w}</button>
                ))}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={addReminder} disabled={rSaving}>{rSaving ? "…" : "Add reminder"}</button>
              {rErr && <span className="error-text" style={{ margin: 0 }}>{rErr}</span>}
            </div>
          </div>

          {/* Reminder list */}
          {reminders.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              {reminders.map(r => (
                <div key={r.id} className="spread" style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", opacity: r.enabled ? 1 : 0.5 }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: "var(--accent)" }}>{r.time}</span>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{r.message}</span>
                    <span className="pill" style={{ fontSize: 10 }}>{daysLabel(r.days)}</span>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className={`btn btn-sm${r.enabled ? "" : " btn-primary"}`} onClick={() => toggleReminder(r)}>{r.enabled ? "On" : "Off"}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteReminder(r)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {reminders.length === 0 && <div className="muted small">No reminders yet — add one above.</div>}

          {/* cron-job.org setup instructions */}
          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>How to wire up cron-job.org (one-time setup)</summary>
            <div className="stack" style={{ gap: 8, marginTop: 10 }}>
              {[
                <>Go to <strong>cron-job.org</strong> → sign up free</>,
                <>Click <strong>Create cronjob</strong></>,
                <>URL: <code className="mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{typeof window !== "undefined" ? window.location.origin : "https://your-app.vercel.app"}/api/push/remind</code></>,
                <>Schedule: <strong>Every minute</strong> (Schedule → select * for all fields)</>,
                <>If you have <code className="mono">CRON_SECRET</code> set in .env.local, add a request header: <code className="mono">Authorization: Bearer YOUR_SECRET</code></>,
                <><strong>Save</strong> — cron-job.org will now ping your app every minute and fire matching reminders</>,
              ].map((step, i) => (
                <div key={i} className="row" style={{ gap: 8, fontSize: 12, alignItems: "flex-start" }}>
                  <span style={{ fontWeight: 700, color: "var(--accent)", flexShrink: 0, minWidth: 16 }}>{i + 1}</span>
                  <span className="muted">{step}</span>
                </div>
              ))}
              <div className="muted small" style={{ padding: "6px 10px", background: "var(--bg-alt)", borderRadius: 4, borderLeft: "3px solid var(--accent)" }}>
                All times are in IST (Asia/Kolkata). If your phone shows notifications, the setup is working.
              </div>
            </div>
          </details>
        </div>
      )}

      {/* ── Data ── */}
      <div className="card stack">
        <div className="section-title">Data &amp; backup</div>
        <div className="muted small">
          All data lives in <code className="mono">data/habits.db</code> on your machine — nothing goes to the cloud.
          Back up before major changes.
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <a className="btn btn-sm" href="/api/backup">Download backup (JSON)</a>
          <a className="btn btn-sm" href="/api/export">Export CSV</a>
          <a className="btn btn-sm" href="/api/export/ical">Download Calendar (.ics)</a>
          <label className="btn btn-sm" style={{ cursor: "pointer" }}>
            Import backup
            <input type="file" accept="application/json" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
          </label>
        </div>
      </div>

      {/* ── Status ── */}
      <div className="card stack">
        <div className="section-title">App status</div>
        <div className="stack" style={{ gap: 6, fontSize: 13 }}>
          <div className="row" style={{ gap: 10 }}>
            <span style={{ width: 120, color: "var(--muted)" }}>Password lock</span>
            {s.password_enabled
              ? <span className="ok-text">enabled</span>
              : <span className="muted">off · set <code className="mono">APP_PASSWORD</code> in .env.local to enable</span>}
          </div>
          <div className="row" style={{ gap: 10 }}>
            <span style={{ width: 120, color: "var(--muted)" }}>AI coach</span>
            {s.coach_enabled
              ? <span className="ok-text">enabled</span>
              : <span className="muted">off · requires <code className="mono">ANTHROPIC_API_KEY</code> (paid, optional)</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
