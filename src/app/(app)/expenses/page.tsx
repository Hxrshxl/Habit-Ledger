"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { jget, jsend } from "@/lib/client";

/* ── Types ── */
interface Expense {
  id: number; date: string; name: string; amount: number;
  type: "expense" | "credit"; category: string; note: string | null;
}
interface Budget { id: number; month: string; category: string; amount: number; }
interface PendingTx {
  _id: number; date: string; name: string; amount: string;
  type: "expense" | "credit"; category: string; selected: boolean;
}

/* ── Constants ── */
const DEFAULT_CATS = [
  "Food","Transport","Entertainment","Shopping",
  "Health","Utilities","Education","Travel","Other",
];
const CAT_COLORS: Record<string, string> = {
  Food:"#f59e0b",Transport:"#3b82f6",Entertainment:"#8b5cf6",
  Shopping:"#ec4899",Health:"#10b981",Utilities:"#6b7280",
  Education:"#f97316",Travel:"#14b8a6",Other:"#9ca3af",
};
const catColor = (c: string) => CAT_COLORS[c] ?? "#6366f1";

/* ── Helpers ── */
const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toMonth = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleString("default", { month: "long", year: "numeric" });
};
const addMonths = (m: string, delta: number) => {
  const [y, mo] = m.split("-").map(Number);
  return toMonth(new Date(y, mo - 1 + delta));
};
const todayStr = () => new Date().toISOString().slice(0, 10);

function blankForm() {
  return { name:"", amount:"", type:"expense" as "expense"|"credit", category:"Food", date:todayStr(), note:"" };
}
function groupByDate(exps: Expense[]) {
  const map = new Map<string, Expense[]>();
  for (const e of exps) { if (!map.has(e.date)) map.set(e.date, []); map.get(e.date)!.push(e); }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}
function summariseBycat(exps: Expense[]) {
  const map = new Map<string, number>();
  for (const e of exps) { if (e.type !== "expense") continue; map.set(e.category, (map.get(e.category) ?? 0) + e.amount); }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

/* ═══════════════════════════════════════════════════════════ */
export default function ExpensesPage() {
  const [month, setMonth]       = useState(toMonth(new Date()));
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets]   = useState<Budget[]>([]);
  const [loading, setLoading]   = useState(true);

  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(blankForm());
  const [saving, setSaving]         = useState(false);
  const [formErr, setFormErr]       = useState("");

  const [customCats, setCustomCats] = useState<string[]>([]);
  const [newCat, setNewCat]         = useState("");

  const [showBudget, setShowBudget]       = useState(false);
  const [budgetDraft, setBudgetDraft]     = useState<Record<string, string>>({});

  /* bulk upload */
  const [showUpload, setShowUpload]   = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [uploadErr, setUploadErr]     = useState("");
  const [pendingTxs, setPendingTxs]   = useState<PendingTx[]>([]);
  const [importing, setImporting]     = useState(false);
  const [uploadMeta, setUploadMeta]   = useState<{linesExtracted:number;found:number}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const allCats = [...DEFAULT_CATS, ...customCats.filter(c => !DEFAULT_CATS.includes(c))];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [exps, buds] = await Promise.all([
        jget<Expense[]>(`/api/expenses?month=${month}`),
        jget<Budget[]>(`/api/budgets?month=${month}`),
      ]);
      setExpenses(exps ?? []);
      setBudgets(buds ?? []);
    } catch { setExpenses([]); setBudgets([]); }
    setLoading(false);
  }, [month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const draft: Record<string, string> = {};
    for (const b of budgets) draft[b.category] = String(b.amount);
    setBudgetDraft(draft);
  }, [budgets]);

  const totalOut    = expenses.filter(e => e.type === "expense").reduce((s, e) => s + e.amount, 0);
  const totalIn     = expenses.filter(e => e.type === "credit").reduce((s, e) => s + e.amount, 0);
  const net         = totalIn - totalOut;
  const catSums     = summariseBycat(expenses);
  const budgetMap   = Object.fromEntries(budgets.map(b => [b.category, b.amount]));
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);

  /* ── helpers to close other panels ── */
  function openForm()   { setShowForm(true);   setShowBudget(false); setShowUpload(false); }
  function openBudget() { setShowBudget(true); setShowForm(false);   setShowUpload(false); }
  function openUpload() { setShowUpload(true); setShowForm(false);   setShowBudget(false); setPendingTxs([]); setUploadErr(""); setUploadMeta(null); }

  /* ── Add single expense ── */
  async function submitAdd(e: React.FormEvent) {
    e.preventDefault(); setFormErr("");
    const amount = parseFloat(form.amount);
    if (!form.name.trim()) return setFormErr("Name is required.");
    if (!isFinite(amount) || amount <= 0) return setFormErr("Enter a valid amount.");
    setSaving(true);
    try {
      const res = await jsend<Expense>("/api/expenses", "POST", {
        name: form.name.trim(), amount, type: form.type,
        category: form.category, date: form.date, note: form.note.trim() || null,
      });
      setExpenses(prev => [...prev, res].sort((a, b) => b.date.localeCompare(a.date)));
      setForm(blankForm()); setShowForm(false);
    } catch (err: unknown) {
      setFormErr(err instanceof Error ? err.message : "Failed to save.");
    }
    setSaving(false);
  }

  async function deleteExp(id: number) {
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    setExpenses(prev => prev.filter(e => e.id !== id));
  }

  async function saveBudgets() {
    await Promise.all(allCats.map(cat => {
      const val = parseFloat(budgetDraft[cat] ?? "0") || 0;
      return jsend("/api/budgets", "POST", { month, category: cat, amount: val }).catch(() => null);
    }));
    const buds = await jget<Budget[]>(`/api/budgets?month=${month}`).catch(() => []);
    setBudgets(buds ?? []); setShowBudget(false);
  }

  function addCustomCat() {
    const c = newCat.trim();
    if (!c || allCats.includes(c)) return;
    setCustomCats(prev => [...prev, c]); setNewCat("");
  }

  /* ── PDF upload & parse ── */
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadErr(""); setPendingTxs([]); setUploadMeta(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/expenses/parse-pdf", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setUploadErr(data.error ?? "Parse failed."); setUploading(false); return; }
      setUploadMeta(data.meta);
      setPendingTxs((data.transactions ?? []).map((t: { date:string;name:string;amount:number;type:"expense"|"credit";category:string }, i: number) => ({
        _id: i, date: t.date, name: t.name,
        amount: String(t.amount), type: t.type,
        category: allCats.includes(t.category) ? t.category : "Other",
        selected: true,
      })));
    } catch { setUploadErr("Network error. Try again."); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function updatePending(id: number, patch: Partial<PendingTx>) {
    setPendingTxs(txs => txs.map(t => t._id === id ? { ...t, ...patch } : t));
  }

  const selectedCount = pendingTxs.filter(t => t.selected).length;

  async function importSelected() {
    const toImport = pendingTxs.filter(t => t.selected);
    if (!toImport.length) return;
    setImporting(true);
    let failed = 0;
    for (const tx of toImport) {
      const amount = parseFloat(tx.amount);
      if (!isFinite(amount) || amount <= 0 || !tx.name.trim() || !tx.date) { failed++; continue; }
      try {
        await jsend<Expense>("/api/expenses", "POST", {
          name: tx.name.trim(), amount, type: tx.type,
          category: tx.category, date: tx.date, note: null,
        });
      } catch { failed++; }
    }
    setImporting(false);
    await load();
    setPendingTxs([]);
    setShowUpload(false);
    setUploadMeta(null);
    if (failed) alert(`Imported ${toImport.length - failed} entries. ${failed} failed (invalid data).`);
  }

  /* ── Render ── */
  const grouped = groupByDate(expenses);

  return (
    <div className="page">
      {/* Header */}
      <div className="exp-header">
        <h1>Expenses</h1>
        <div className="month-nav">
          <button onClick={() => setMonth(m => addMonths(m, -1))}>‹</button>
          <span className="month-label">{monthLabel(month)}</span>
          <button onClick={() => setMonth(m => addMonths(m, 1))} disabled={month >= toMonth(new Date())}>›</button>
        </div>
        <button className="btn btn-sm" onClick={() => showForm ? setShowForm(false) : openForm()}>
          {showForm ? "✕ Cancel" : "+ Add expense"}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => showUpload ? setShowUpload(false) : openUpload()}>
          {showUpload ? "✕ Cancel" : "↑ Upload statement"}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => showBudget ? setShowBudget(false) : openBudget()}>
          {showBudget ? "✕ Cancel" : "⚙ Budgets"}
        </button>
      </div>

      {/* Inline stats */}
      <div className="exp-meta">
        <span>Spent: <strong className="tag-out">{fmt(totalOut)}</strong></span>
        <span className="dash-dot">·</span>
        <span>Income: <strong className="tag-in">{fmt(totalIn)}</strong></span>
        <span className="dash-dot">·</span>
        <span>Net: <strong style={{ color: net >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(net)}</strong></span>
        {totalBudget > 0 && (
          <>
            <span className="dash-dot">·</span>
            <span>Budget: <strong>{fmt(totalBudget)}</strong></span>
            <span style={{ color: totalOut > totalBudget ? "var(--red)" : "var(--green)", fontWeight: 600 }}>
              ({totalOut > totalBudget ? `${fmt(totalOut - totalBudget)} over` : `${fmt(totalBudget - totalOut)} left`})
            </span>
          </>
        )}
      </div>

      {/* ── Add single expense ── */}
      {showForm && (
        <div className="exp-panel" style={{ marginBottom: 16 }}>
          <p className="exp-panel-title">New entry</p>
          <form className="exp-form" onSubmit={submitAdd}>
            <label>Name<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Lunch, Salary" autoFocus /></label>
            <label>Amount (₹)<input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" /></label>
            <label className="full">Type
              <div className="type-toggle">
                <button type="button" className={`type-btn${form.type === "expense" ? " active-exp" : ""}`} onClick={() => setForm(f => ({ ...f, type: "expense" }))}>— Expense</button>
                <button type="button" className={`type-btn${form.type === "credit" ? " active-crd" : ""}`}  onClick={() => setForm(f => ({ ...f, type: "credit" }))}>+ Credit</button>
              </div>
            </label>
            <label>Category
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {allCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Date<input type="date" value={form.date} max={todayStr()} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></label>
            <label className="full">Note (optional)<input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional note" /></label>
            {formErr && <p className="full" style={{ color:"var(--red)", fontSize:12, margin:0 }}>{formErr}</p>}
            <div className="full" style={{ display:"flex", gap:8 }}>
              <button type="submit" className="btn btn-sm" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setShowForm(false); setForm(blankForm()); setFormErr(""); }}>Cancel</button>
            </div>
          </form>
          <hr className="div" />
          <p style={{ fontSize:12, color:"var(--muted)", margin:"0 0 6px" }}>Add custom category</p>
          <div className="cat-add-row">
            <input value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCustomCat())} placeholder="e.g. Insurance, Gym…" />
            <button type="button" className="btn btn-sm btn-ghost" onClick={addCustomCat}>Add</button>
          </div>
          {customCats.length > 0 && (
            <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
              {customCats.map(c => (
                <span key={c} style={{ fontSize:12, background:"var(--accent-soft)", color:"var(--accent)", padding:"2px 8px", borderRadius:99 }}>
                  {c} <button style={{ background:"none", border:"none", color:"var(--accent)", cursor:"pointer", padding:0, marginLeft:2 }} onClick={() => setCustomCats(prev => prev.filter(x => x !== c))}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Upload statement ── */}
      {showUpload && (
        <div className="exp-panel" style={{ marginBottom: 16 }}>
          <p className="exp-panel-title">Bulk import from bank statement (PDF)</p>
          <p style={{ fontSize:12, color:"var(--muted)", margin:"0 0 10px" }}>
            Upload your bank's PDF statement. Transactions are extracted automatically — review and edit before importing.
          </p>
          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            {uploading ? (
              <span style={{ color:"var(--muted)" }}>Extracting transactions…</span>
            ) : (
              <>
                <span style={{ fontSize:24 }}>📄</span>
                <span style={{ color:"var(--muted)", fontSize:13 }}>Click to select a PDF file (max 25 MB)</span>
              </>
            )}
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display:"none" }} onChange={handleFileChange} />
          </div>
          {uploadErr && <p style={{ color:"var(--red)", fontSize:13, marginTop:8 }}>{uploadErr}</p>}
          {uploadMeta && (
            <p style={{ fontSize:12, color:"var(--muted)", marginTop:8 }}>
              Scanned {uploadMeta.linesExtracted} text lines · found <strong>{uploadMeta.found}</strong> candidate transactions
              {uploadMeta.found === 0 && " — PDF may use scanned images or an unsupported layout."}
            </p>
          )}

          {/* Review table */}
          {pendingTxs.length > 0 && (
            <>
              <div style={{ overflowX:"auto", marginTop:12 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12.5 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      <th style={{ padding:"4px 6px", textAlign:"center" }}>
                        <input type="checkbox"
                          checked={selectedCount === pendingTxs.length}
                          onChange={e => setPendingTxs(txs => txs.map(t => ({ ...t, selected: e.target.checked })))} />
                      </th>
                      <th style={{ padding:"4px 6px", textAlign:"left", fontWeight:600, color:"var(--muted)" }}>Date</th>
                      <th style={{ padding:"4px 6px", textAlign:"left", fontWeight:600, color:"var(--muted)" }}>Description</th>
                      <th style={{ padding:"4px 6px", textAlign:"right", fontWeight:600, color:"var(--muted)" }}>Amount ₹</th>
                      <th style={{ padding:"4px 6px", textAlign:"center", fontWeight:600, color:"var(--muted)" }}>Type</th>
                      <th style={{ padding:"4px 6px", textAlign:"left", fontWeight:600, color:"var(--muted)" }}>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingTxs.map(tx => (
                      <tr key={tx._id} style={{ borderBottom:"1px solid var(--border)", opacity: tx.selected ? 1 : 0.45 }}>
                        <td style={{ padding:"4px 6px", textAlign:"center" }}>
                          <input type="checkbox" checked={tx.selected} onChange={e => updatePending(tx._id, { selected: e.target.checked })} />
                        </td>
                        <td style={{ padding:"4px 6px" }}>
                          <input type="date" value={tx.date} max={todayStr()}
                            onChange={e => updatePending(tx._id, { date: e.target.value })}
                            style={{ border:"1px solid var(--border)", borderRadius:4, padding:"2px 4px", fontSize:12, background:"var(--bg)", width:120 }} />
                        </td>
                        <td style={{ padding:"4px 6px" }}>
                          <input value={tx.name} onChange={e => updatePending(tx._id, { name: e.target.value })}
                            style={{ border:"1px solid var(--border)", borderRadius:4, padding:"2px 6px", fontSize:12, background:"var(--bg)", width:"100%", minWidth:160 }} />
                        </td>
                        <td style={{ padding:"4px 6px" }}>
                          <input type="number" min="0.01" step="0.01" value={tx.amount}
                            onChange={e => updatePending(tx._id, { amount: e.target.value })}
                            style={{ border:"1px solid var(--border)", borderRadius:4, padding:"2px 4px", fontSize:12, background:"var(--bg)", width:90, textAlign:"right" }} />
                        </td>
                        <td style={{ padding:"4px 6px", textAlign:"center" }}>
                          <button onClick={() => updatePending(tx._id, { type: tx.type === "expense" ? "credit" : "expense" })}
                            style={{ fontSize:11, padding:"2px 8px", borderRadius:99, border:"1px solid",
                              background: tx.type === "expense" ? "var(--red-soft)" : "var(--green-soft)",
                              color: tx.type === "expense" ? "var(--red)" : "var(--green)",
                              borderColor: tx.type === "expense" ? "var(--red)" : "var(--green)", cursor:"pointer" }}>
                            {tx.type === "expense" ? "Exp" : "Crd"}
                          </button>
                        </td>
                        <td style={{ padding:"4px 6px" }}>
                          <select value={tx.category} onChange={e => updatePending(tx._id, { category: e.target.value })}
                            style={{ border:"1px solid var(--border)", borderRadius:4, padding:"2px 4px", fontSize:12, background:"var(--bg)" }}>
                            {allCats.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop:12, display:"flex", gap:8, alignItems:"center" }}>
                <button className="btn btn-sm" onClick={importSelected} disabled={importing || selectedCount === 0}>
                  {importing ? "Importing…" : `Import ${selectedCount} selected`}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setPendingTxs(txs => txs.map(t => ({ ...t, selected: true })))}>
                  Select all
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => { setPendingTxs([]); setUploadMeta(null); }}>
                  Clear
                </button>
                <span style={{ fontSize:12, color:"var(--muted)", marginLeft:"auto" }}>
                  {selectedCount} of {pendingTxs.length} selected
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Budget panel ── */}
      {showBudget && (
        <div className="exp-panel" style={{ marginBottom: 16 }}>
          <p className="exp-panel-title">Monthly budget — {monthLabel(month)}</p>
          <div className="budget-grid">
            {allCats.map(cat => (
              <>
                <label key={`lbl-${cat}`}>{cat}</label>
                <input key={`inp-${cat}`} type="number" min="0" step="1"
                  value={budgetDraft[cat] ?? ""} placeholder="0"
                  onChange={e => setBudgetDraft(d => ({ ...d, [cat]: e.target.value }))} />
              </>
            ))}
          </div>
          <div style={{ marginTop:12, display:"flex", gap:8 }}>
            <button className="btn btn-sm" onClick={saveBudgets}>Save budgets</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowBudget(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="state-note">Loading…</p>
      ) : (
        <div className="exp-two-col">
          {/* Left: expense list */}
          <div>
            {grouped.length === 0 && <p className="state-note">No entries for {monthLabel(month)}.</p>}
            {grouped.map(([date, items]) => (
              <div key={date} className="exp-day-group">
                <div className="exp-day-label">
                  {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" })}
                  <span style={{ marginLeft:8, color:"var(--faint)", fontSize:11 }}>
                    {fmt(items.filter(x => x.type === "expense").reduce((s, x) => s + x.amount, 0))}
                  </span>
                </div>
                {items.map(exp => (
                  <div key={exp.id} className="exp-item">
                    <span className="exp-cat-dot" style={{ background: catColor(exp.category) }} />
                    <div className="exp-item-info">
                      <div className="exp-item-name">{exp.name}</div>
                      <div className="exp-item-cat">{exp.category}{exp.note ? ` · ${exp.note}` : ""}</div>
                    </div>
                    <span className={`exp-item-amount ${exp.type === "credit" ? "credit" : "debit"}`}>
                      {exp.type === "credit" ? "+" : "−"}{fmt(exp.amount)}
                    </span>
                    <button className="exp-item-del" title="Delete" onClick={() => deleteExp(exp.id)}>×</button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Right: breakdown + summary */}
          <div>
            <div className="exp-panel">
              <p className="exp-panel-title">Spending by category</p>
              {catSums.length === 0 ? (
                <p style={{ color:"var(--muted)", fontSize:13 }}>No expenses yet.</p>
              ) : catSums.map(([cat, spent]) => {
                const budget = budgetMap[cat];
                const pct    = budget ? Math.min(100, (spent / budget) * 100) : 0;
                const over   = budget ? spent > budget : false;
                return (
                  <div key={cat} className="cat-row">
                    <div className="cat-row-head">
                      <span className="cat-row-name" style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ width:8, height:8, borderRadius:"50%", background:catColor(cat), display:"inline-block" }} />
                        {cat}
                      </span>
                      <span className="cat-row-amt">
                        {fmt(spent)}{budget ? ` / ${fmt(budget)}` : ""}
                        {over && <span style={{ color:"var(--red)", marginLeft:4, fontSize:11 }}>over</span>}
                      </span>
                    </div>
                    <div className="cat-bar-bg">
                      <div className={`cat-bar-fill${over ? " over-budget" : ""}`}
                        style={{ width: budget ? `${pct}%` : "100%", background: budget ? undefined : catColor(cat), opacity: budget ? 1 : 0.3 }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="exp-panel" style={{ marginTop: 0 }}>
              <p className="exp-panel-title">Month summary</p>
              <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:13 }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span>Total expenses</span><span style={{ fontWeight:600, color:"var(--red)" }}>{fmt(totalOut)}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span>Total income</span><span style={{ fontWeight:600, color:"var(--green)" }}>{fmt(totalIn)}</span>
                </div>
                <hr className="div" style={{ margin:"4px 0" }} />
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span>Net balance</span><span style={{ fontWeight:700, color: net >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(net)}</span>
                </div>
                {totalBudget > 0 && (
                  <>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <span>Total budget</span><span style={{ fontWeight:600 }}>{fmt(totalBudget)}</span>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <span>{totalOut > totalBudget ? "Over budget by" : "Budget remaining"}</span>
                      <span style={{ fontWeight:600, color: totalOut > totalBudget ? "var(--red)" : "var(--green)" }}>
                        {fmt(Math.abs(totalBudget - totalOut))}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
