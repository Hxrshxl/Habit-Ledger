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

      {/* ── Push notifications ── */}
      {pushSupported && (
        <div className="card stack">
          <div className="section-title">Push notifications</div>
          <div className="muted small">
            Get a daily reminder at 6 AM with your pending habits. Works even when the app is closed (requires browser permission).
          </div>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <button
              className={`btn btn-sm${pushEnabled ? " btn-danger" : " btn-primary"}`}
              onClick={togglePush}
              disabled={pushLoading}
            >
              {pushLoading ? "…" : pushEnabled ? "Disable reminders" : "Enable daily reminder"}
            </button>
            {pushEnabled && <span className="ok-text" style={{ margin: 0 }}>Reminders active · fires at 6 AM</span>}
            {pushErr && <span className="error-text" style={{ margin: 0 }}>{pushErr}</span>}
          </div>
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
