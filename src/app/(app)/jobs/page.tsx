"use client";

import { useCallback, useEffect, useState } from "react";
import { jget, jsend } from "@/lib/client";
import type { Job } from "@/lib/db";
import ConfirmModal from "@/components/ConfirmModal";

const STAGES = [
  { key: "wishlist",  label: "Wishlist",  color: "var(--muted)" },
  { key: "applied",   label: "Applied",   color: "var(--accent)" },
  { key: "referral",  label: "Referral",  color: "var(--green)" },
  { key: "oa",        label: "OA",        color: "var(--amber)" },
  { key: "interview", label: "Interview", color: "var(--amber)" },
  { key: "offer",     label: "Offer",     color: "var(--green)" },
  { key: "rejected",  label: "Rejected",  color: "var(--red)" },
  { key: "withdrawn", label: "Withdrawn", color: "var(--faint)" },
] as const;

const NEXT: Record<string, string> = {
  wishlist: "applied", applied: "oa", referral: "interview",
  oa: "interview", interview: "offer",
};

function stageLabel(key: string) {
  return STAGES.find(s => s.key === key)?.label ?? key;
}

interface JobForm {
  id?: string;
  company: string; role: string; status: string; date_applied: string;
  referral: boolean; referral_contact: string;
  salary: string; job_link: string; notes: string;
}

const blank = (): JobForm => ({
  company: "", role: "", status: "applied", date_applied: "",
  referral: false, referral_contact: "", salary: "", job_link: "", notes: "",
});

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<JobForm | null>(null);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [showTerminal, setShowTerminal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Job | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setJobs(await jget<Job[]>("/api/jobs")); }
    catch (e) { setErr((e as Error).message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? jobs.filter(j => j.company.toLowerCase().includes(q) || j.role.toLowerCase().includes(q))
    : jobs;

  const visibleStages = showTerminal ? STAGES : STAGES.filter(s => s.key !== "rejected" && s.key !== "withdrawn");

  function colJobs(key: string) {
    return filtered.filter(j => j.status === key).sort((a, b) => (b.date_applied ?? "").localeCompare(a.date_applied ?? ""));
  }

  function openNew(status = "applied") { setForm({ ...blank(), status }); }

  function openEdit(j: Job) {
    setForm({
      id: j.id, company: j.company, role: j.role, status: j.status,
      date_applied: j.date_applied ?? "", referral: j.referral,
      referral_contact: j.referral_contact, salary: j.salary,
      job_link: j.job_link, notes: j.notes,
    });
  }

  async function saveForm() {
    if (!form) return;
    if (!form.company.trim()) { setErr("Company is required."); return; }
    if (!form.role.trim()) { setErr("Role is required."); return; }
    setErr("");
    const body = {
      company: form.company.trim(), role: form.role.trim(), status: form.status,
      date_applied: form.date_applied || null, referral: form.referral,
      referral_contact: form.referral_contact.trim(), salary: form.salary.trim(),
      job_link: form.job_link.trim(), notes: form.notes.trim(),
    };
    if (form.id) {
      const id = form.id;
      const prev = jobs.find(j => j.id === id)!;
      setJobs(js => js.map(j => j.id === id ? { ...j, ...body } : j));
      setForm(null);
      try {
        const updated = await jsend<Job>(`/api/jobs/${id}`, "PATCH", body);
        setJobs(js => js.map(j => j.id === id ? updated : j));
      } catch (e) {
        setErr((e as Error).message);
        setJobs(js => js.map(j => j.id === id ? prev : j));
      }
    } else {
      const tempId = `temp-${Date.now()}`;
      const temp: Job = { id: tempId, ...body, date_applied: body.date_applied, created_at: new Date().toISOString() };
      setJobs(js => [...js, temp]);
      setForm(null);
      try {
        const created = await jsend<Job>("/api/jobs", "POST", body);
        setJobs(js => js.map(j => j.id === tempId ? created : j));
      } catch (e) {
        setErr((e as Error).message);
        setJobs(js => js.filter(j => j.id !== tempId));
      }
    }
  }

  async function advance(j: Job, e: React.MouseEvent) {
    e.stopPropagation();
    const next = NEXT[j.status];
    if (!next) return;
    setJobs(js => js.map(x => x.id === j.id ? { ...x, status: next } : x));
    try { await jsend(`/api/jobs/${j.id}`, "PATCH", { status: next }); }
    catch (err) {
      setErr((err as Error).message);
      setJobs(js => js.map(x => x.id === j.id ? { ...x, status: j.status } : x));
    }
  }

  async function confirmRemove() {
    if (!confirmDelete) return;
    const j = confirmDelete;
    setConfirmDelete(null);
    setJobs(js => js.filter(x => x.id !== j.id));
    try { await jsend(`/api/jobs/${j.id}`, "DELETE"); }
    catch (e) {
      setErr((e as Error).message);
      setJobs(js => [...js, j]);
    }
  }

  const interviewing = jobs.filter(j => j.status === "interview").length;
  const offers = jobs.filter(j => j.status === "offer").length;

  if (loading) return <div className="muted">Loading…</div>;

  return (
    <div className="stack">
      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${confirmDelete.company} — ${confirmDelete.role}"?`}
          message="This will permanently remove this job from your tracker."
          confirmLabel="Delete"
          danger
          onConfirm={confirmRemove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Header */}
      <div className="page-head spread">
        <div>
          <h1>Job Tracker</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {jobs.length} tracked · {interviewing} interviewing · {offers} offer{offers !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="row">
          <input
            className="input"
            style={{ width: 210 }}
            placeholder="Search company or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={() => openNew()}>+ Add job</button>
        </div>
      </div>

      {err && <div className="error-text">{err}</div>}

      {/* Summary stats */}
      <div className="row" style={{ gap: 20, flexWrap: "wrap" }}>
        {STAGES.slice(0, 6).map(s => (
          <div key={s.key} style={{ textAlign: "center", minWidth: 48 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1.2 }}>
              {jobs.filter(j => j.status === s.key).length}
            </div>
            <div className="muted small">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Kanban board */}
      <div style={{ overflowX: "auto", paddingBottom: 8, marginLeft: -4, paddingLeft: 4 }}>
        <div style={{ display: "flex", gap: 10, minWidth: "max-content", alignItems: "flex-start" }}>
          {visibleStages.map(stage => {
            const cards = colJobs(stage.key);
            return (
              <div
                key={stage.key}
                style={{
                  width: 218, flexShrink: 0,
                  background: "var(--bg-2)", borderRadius: "var(--radius)",
                  padding: "10px 8px",
                  border: "1px solid var(--border)",
                  display: "flex", flexDirection: "column", gap: 8,
                }}
              >
                {/* Column header */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  paddingBottom: 8, borderBottom: `2px solid ${stage.color}`,
                }}>
                  <span style={{
                    fontWeight: 700, fontSize: 11, textTransform: "uppercase",
                    letterSpacing: "0.07em", color: stage.color,
                  }}>
                    {stage.label}
                  </span>
                  <span style={{
                    fontSize: 11, background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 99, padding: "1px 7px", color: "var(--muted)", fontWeight: 600,
                  }}>
                    {cards.length}
                  </span>
                </div>

                {/* Job cards */}
                {cards.map(j => (
                  <div
                    key={j.id}
                    onClick={() => openEdit(j)}
                    style={{
                      background: "var(--card)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)", padding: "10px 12px",
                      cursor: "pointer", transition: "box-shadow 0.1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent)")}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, wordBreak: "break-word" }}>{j.company}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, marginBottom: 6 }}>{j.role}</div>

                    <div className="row" style={{ gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
                      {j.referral && <span className="pill green" style={{ fontSize: 10, padding: "1px 7px" }}>Referral</span>}
                      {j.salary && <span className="pill" style={{ fontSize: 10, padding: "1px 7px" }}>{j.salary}</span>}
                    </div>

                    {j.date_applied && (
                      <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 6 }}>{j.date_applied}</div>
                    )}

                    {j.notes && (
                      <div style={{
                        fontSize: 11, color: "var(--muted)", marginBottom: 6,
                        overflow: "hidden", display: "-webkit-box",
                        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>
                        {j.notes}
                      </div>
                    )}

                    {/* Card actions */}
                    <div
                      className="row"
                      style={{ gap: 4, marginTop: 6 }}
                      onClick={e => e.stopPropagation()}
                    >
                      {NEXT[j.status] && (
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 10, padding: "2px 6px", flex: 1 }}
                          onClick={e => advance(j, e)}
                        >
                          → {stageLabel(NEXT[j.status])}
                        </button>
                      )}
                      {j.job_link && (
                        <a
                          href={j.job_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm"
                          style={{ fontSize: 10, padding: "2px 6px", textDecoration: "none" }}
                          onClick={e => e.stopPropagation()}
                        >
                          JD
                        </a>
                      )}
                      <button
                        className="btn btn-sm"
                        style={{ fontSize: 10, padding: "2px 6px", color: "var(--faint)", border: "1px solid var(--border)", background: "transparent", marginLeft: "auto" }}
                        onClick={e => { e.stopPropagation(); setConfirmDelete(j); }}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add to column */}
                <button
                  className="btn btn-sm"
                  style={{ border: "1px dashed var(--border)", background: "transparent", color: "var(--faint)", fontSize: 12 }}
                  onClick={() => openNew(stage.key)}
                >
                  + Add
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Toggle terminal columns */}
      <label className="row small muted" style={{ cursor: "pointer", userSelect: "none" }}>
        <input type="checkbox" checked={showTerminal} onChange={e => setShowTerminal(e.target.checked)} />
        Show Rejected / Withdrawn columns
      </label>

      {/* Inline add/edit form */}
      {form && (
        <div className="card stack" style={{ marginTop: 4 }}>
          <div className="section-title">{form.id ? "Edit job" : "Add job"}</div>
          <div className="form-row">
            <label className="field">
              <span className="label">Company *</span>
              <input className="input" value={form.company} placeholder="Google"
                onChange={e => setForm({ ...form, company: e.target.value })} />
            </label>
            <label className="field" style={{ flex: "2 1 180px" }}>
              <span className="label">Role *</span>
              <input className="input" value={form.role} placeholder="SDE-2 Backend"
                onChange={e => setForm({ ...form, role: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Status</span>
              <select className="select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label className="field">
              <span className="label">Date Applied</span>
              <input className="input" type="date" value={form.date_applied}
                onChange={e => setForm({ ...form, date_applied: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Salary / CTC</span>
              <input className="input" value={form.salary} placeholder="30-40 LPA"
                onChange={e => setForm({ ...form, salary: e.target.value })} />
            </label>
            <label className="field" style={{ flex: "2 1 180px" }}>
              <span className="label">Job Link / JD URL</span>
              <input className="input" value={form.job_link} placeholder="https://…"
                onChange={e => setForm({ ...form, job_link: e.target.value })} />
            </label>
          </div>
          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <label className="field row" style={{ alignItems: "center", gap: 8, flex: "0 0 auto", marginBottom: 12 }}>
              <input type="checkbox" checked={form.referral}
                onChange={e => setForm({ ...form, referral: e.target.checked })} />
              <span style={{ fontSize: 13 }}>Referral?</span>
            </label>
            {form.referral && (
              <label className="field" style={{ flex: "2 1 200px" }}>
                <span className="label">Referral Contact</span>
                <input className="input" value={form.referral_contact}
                  placeholder="John Doe · john@example.com"
                  onChange={e => setForm({ ...form, referral_contact: e.target.value })} />
              </label>
            )}
          </div>
          <label className="field">
            <span className="label">Notes / Timeline</span>
            <textarea
              className="input"
              style={{ resize: "vertical", minHeight: 70 }}
              value={form.notes}
              placeholder="Round 1 done 20 Jun · Waiting for Round 2…"
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <div className="row">
            <button className="btn btn-primary" onClick={saveForm}>Save</button>
            <button className="btn" onClick={() => { setForm(null); setErr(""); }}>Cancel</button>
            {form.id && (
              <button className="btn btn-danger" style={{ marginLeft: "auto" }}
                onClick={() => {
                  const j = jobs.find(x => x.id === form!.id);
                  if (j) { setForm(null); setConfirmDelete(j); }
                }}>
                Delete job
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
