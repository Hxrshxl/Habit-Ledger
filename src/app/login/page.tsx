"use client";

import { useState } from "react";

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!r.ok) { setErr("Wrong password"); setBusy(false); return; }
      window.location.href = "/";
    } catch {
      setErr("Login failed"); setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card card stack">
        <div>
          <div className="section-title">Habit Ledger</div>
          <div className="muted small">This instance is password-protected.</div>
        </div>
        <input
          className="input" type="password" placeholder="Password" value={pw} autoFocus
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        {err && <div className="error-text">{err}</div>}
        <button className="btn btn-primary" onClick={submit} disabled={busy || !pw}>{busy ? "…" : "Unlock"}</button>
      </div>
    </div>
  );
}
