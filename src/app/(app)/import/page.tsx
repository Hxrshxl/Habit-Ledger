"use client";

import { useCallback, useRef, useState } from "react";
import { jsend } from "@/lib/client";

export const dynamic = "force-dynamic";

type ImportMode = "habits" | "expenses";

interface ParsedRow { [key: string]: string; }

interface HabitResult  { created_habits: number; entries_set: number; errors: string[]; }
interface ExpenseResult { inserted: number; errors: string[]; }
type ImportResult = HabitResult | ExpenseResult;

// --- Inline CSV parser ---
function parseCSVText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { cell += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      row.push(cell); cell = "";
    } else if ((ch === "\n" || ch === "\r") && !inQ) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(c => c.trim())) rows.push(row);
      row = []; cell = "";
    } else { cell += ch; }
  }
  if (cell || row.length) { row.push(cell); if (row.some(c => c.trim())) rows.push(row); }
  return rows;
}

function detectCol(headers: string[], keywords: string[]): string {
  for (const h of headers) {
    if (keywords.some(k => h.toLowerCase().includes(k))) return h;
  }
  return "";
}

const NONE = "__none__";

const EXPENSE_TEMPLATE = `Date,Name,Amount,Category,Note
2026-06-01,Amazon,1504.00,Shopping,
2026-06-02,Govind N,20.00,Other,UPI`;

export default function ImportPage() {
  const dropRef   = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<ImportMode>("habits");

  const [headers,  setHeaders]  = useState<string[]>([]);
  const [rows,     setRows]     = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseErr, setParseErr] = useState("");

  // Habit columns
  const [dateCol,   setDateCol]   = useState(NONE);
  const [taskCol,   setTaskCol]   = useState(NONE);
  const [catCol,    setCatCol]    = useState(NONE);
  const [statusCol, setStatusCol] = useState(NONE);
  const [noteCol,   setNoteCol]   = useState(NONE);
  const [durCol,    setDurCol]    = useState(NONE);

  // Expense columns
  const [eDateCol,  setEDateCol]  = useState(NONE);
  const [eNameCol,  setENameCol]  = useState(NONE);
  const [eAmtCol,   setEAmtCol]   = useState(NONE);
  const [eCatCol,   setECatCol]   = useState(NONE);
  const [eNoteCol,  setENoteCol]  = useState(NONE);
  const [eTypeCol,  setETypeCol]  = useState(NONE);

  const [importing, setImporting] = useState(false);
  const [result,    setResult]    = useState<ImportResult | null>(null);

  function resetFile() {
    setHeaders([]); setRows([]); setFileName(""); setParseErr(""); setResult(null);
    // Reset all column selectors
    [setDateCol, setTaskCol, setCatCol, setStatusCol, setNoteCol, setDurCol,
     setEDateCol, setENameCol, setEAmtCol, setECatCol, setENoteCol, setETypeCol]
      .forEach(fn => fn(NONE));
  }

  async function handleFile(file: File) {
    resetFile();
    setFileName(file.name);
    try {
      let raw: string[][];
      if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
        raw = parseCSVText(await file.text());
      } else {
        const XLSX = await import("xlsx");
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(ab), { type: "array", cellDates: true, dateNF: "YYYY-MM-DD" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, dateNF: "YYYY-MM-DD" });
      }
      if (!raw || raw.length < 2) { setParseErr("File has no data rows."); return; }
      const hdrs = raw[0].map(h => String(h ?? "").trim());
      setHeaders(hdrs);
      setRows(raw.slice(1).map(r => Object.fromEntries(hdrs.map((h, i) => [h, String(r[i] ?? "").trim()]))));

      if (mode === "habits") {
        setDateCol(detectCol(hdrs, ["date","day","dt"]) || NONE);
        setTaskCol(detectCol(hdrs, ["task","habit","name","activity","work","todo","item"]) || NONE);
        setCatCol (detectCol(hdrs, ["category","cat","type","group"]) || NONE);
        setStatusCol(detectCol(hdrs, ["status","done","complete"]) || NONE);
        setNoteCol  (detectCol(hdrs, ["note","remark","comment"]) || NONE);
        setDurCol   (detectCol(hdrs, ["duration","minutes","mins","time"]) || NONE);
      } else {
        setEDateCol(detectCol(hdrs, ["date","day","dt","value"]) || NONE);
        setENameCol(detectCol(hdrs, ["name","description","payee","merchant","to","details"]) || NONE);
        setEAmtCol (detectCol(hdrs, ["amount","amt","debit","credit","sum","inr","rs"]) || NONE);
        setECatCol (detectCol(hdrs, ["category","cat","type","group"]) || NONE);
        setENoteCol(detectCol(hdrs, ["note","remark","comment","narration"]) || NONE);
        setETypeCol(detectCol(hdrs, ["txn","type","direction","kind"]) || NONE);
      }
    } catch (e) { setParseErr(`Failed to parse: ${String(e)}`); }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dropRef.current?.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [mode]);

  async function doImport() {
    setImporting(true); setResult(null);
    try {
      if (mode === "habits") {
        const payload = rows
          .filter(r => dateCol !== NONE && taskCol !== NONE && r[dateCol]?.trim() && r[taskCol]?.trim())
          .map(r => ({
            date:             r[dateCol],
            task:             r[taskCol],
            category:         catCol    !== NONE ? r[catCol]    : undefined,
            status:           statusCol !== NONE ? r[statusCol] : undefined,
            note:             noteCol   !== NONE ? r[noteCol]   : undefined,
            duration_minutes: durCol    !== NONE ? r[durCol]    : undefined,
          }));
        setResult(await jsend<HabitResult>("/api/import/csv", "POST", { rows: payload }));
      } else {
        const payload = rows
          .filter(r => eDateCol !== NONE && eNameCol !== NONE && eAmtCol !== NONE
            && r[eDateCol]?.trim() && r[eNameCol]?.trim() && r[eAmtCol]?.trim())
          .map(r => ({
            date:     r[eDateCol],
            name:     r[eNameCol],
            amount:   r[eAmtCol],
            category: eCatCol  !== NONE ? r[eCatCol]  : undefined,
            note:     eNoteCol !== NONE ? r[eNoteCol] : undefined,
            type:     eTypeCol !== NONE ? r[eTypeCol] : undefined,
          }));
        setResult(await jsend<ExpenseResult>("/api/import/expenses", "POST", { rows: payload }));
      }
    } catch (e) {
      setResult({ inserted: 0, errors: [String(e)] } as ExpenseResult);
    } finally { setImporting(false); }
  }

  const isHabitResult  = (r: ImportResult): r is HabitResult  => "entries_set" in r;
  const isExpenseResult = (r: ImportResult): r is ExpenseResult => "inserted"    in r;

  const canImport = mode === "habits"
    ? dateCol !== NONE && taskCol !== NONE && rows.length > 0 && !importing
    : eDateCol !== NONE && eNameCol !== NONE && eAmtCol !== NONE && rows.length > 0 && !importing;

  const validRowCount = mode === "habits"
    ? rows.filter(r => dateCol !== NONE && taskCol !== NONE && r[dateCol]?.trim() && r[taskCol]?.trim()).length
    : rows.filter(r => eDateCol !== NONE && eNameCol !== NONE && eAmtCol !== NONE
        && r[eDateCol]?.trim() && r[eNameCol]?.trim() && r[eAmtCol]?.trim()).length;

  const ColSelect = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ width: 160, color: "var(--muted)", fontSize: 13 }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1, maxWidth: 220 }}>
        <option value={NONE}>(not mapped)</option>
        {headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );

  const previewCols = mode === "habits"
    ? [dateCol, taskCol, catCol, statusCol].filter(c => c !== NONE)
    : [eDateCol, eNameCol, eAmtCol, eCatCol, eNoteCol].filter(c => c !== NONE);

  return (
    <div className="page-wrap">
      <div className="page-header">
        <h1>Import</h1>
        <p className="muted small">Bulk-import habits or expenses from a CSV / Excel file.</p>
      </div>

      {/* Mode selector */}
      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <button
          className={`btn btn-sm${mode === "habits" ? " btn-primary" : ""}`}
          onClick={() => { setMode("habits"); resetFile(); }}
        >Habits</button>
        <button
          className={`btn btn-sm${mode === "expenses" ? " btn-primary" : ""}`}
          onClick={() => { setMode("expenses"); resetFile(); }}
        >Expenses / Bank statement</button>
      </div>

      {/* Step 1: Upload */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">1 — Upload file</div>
        <div
          ref={dropRef}
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add("drag-over"); }}
          onDragLeave={() => dropRef.current?.classList.remove("drag-over")}
          style={{
            border: "2px dashed var(--border-strong)", borderRadius: 8,
            padding: "32px 20px", textAlign: "center", cursor: "pointer",
            color: "var(--muted)", transition: "border-color 0.15s",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>↑</div>
          <div>Drag &amp; drop your file here, or <strong>click to browse</strong></div>
          <div className="small muted" style={{ marginTop: 4 }}>Supports .csv, .xlsx, .xls</div>
          {fileName && (
            <div style={{ marginTop: 10, color: "var(--text)", fontWeight: 600 }}>
              {fileName} — {rows.length} rows
            </div>
          )}
        </div>
        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.txt" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {parseErr && <div className="small" style={{ color: "var(--red)", marginTop: 8 }}>{parseErr}</div>}
      </div>

      {headers.length > 0 && (
        <>
          {/* Step 2: Column mapping */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">2 — Map columns</div>
            {mode === "habits" ? (
              <>
                <ColSelect label="Date *"         value={dateCol}   onChange={setDateCol} />
                <ColSelect label="Task / Habit *" value={taskCol}   onChange={setTaskCol} />
                <ColSelect label="Category"       value={catCol}    onChange={setCatCol} />
                <ColSelect label="Status"         value={statusCol} onChange={setStatusCol} />
                <ColSelect label="Note"           value={noteCol}   onChange={setNoteCol} />
                <ColSelect label="Duration (min)" value={durCol}    onChange={setDurCol} />
              </>
            ) : (
              <>
                <ColSelect label="Date *"      value={eDateCol}  onChange={setEDateCol} />
                <ColSelect label="Name *"      value={eNameCol}  onChange={setENameCol} />
                <ColSelect label="Amount *"    value={eAmtCol}   onChange={setEAmtCol} />
                <ColSelect label="Category"    value={eCatCol}   onChange={setECatCol} />
                <ColSelect label="Note"        value={eNoteCol}  onChange={setENoteCol} />
                <ColSelect label="Type (expense/credit)" value={eTypeCol} onChange={setETypeCol} />
                <div className="small muted" style={{ marginTop: 8 }}>
                  Categories: Food · Transport · Entertainment · Shopping · Health · Utilities · Education · Travel · Other
                </div>
              </>
            )}
          </div>

          {/* Step 3: Preview */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>3 — Preview (first 10 rows)</span>
              <span className="small muted">{rows.length} total rows</span>
            </div>
            {previewCols.length === 0 ? (
              <div className="muted small">Map required columns to see a preview.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {previewCols.map(c => (
                        <th key={c} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 500 }}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        {previewCols.map(c => (
                          <td key={c} style={{ padding: "5px 8px" }}>{r[c] || <span className="muted">—</span>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 10 && <div className="small muted" style={{ padding: "6px 8px" }}>… and {rows.length - 10} more rows</div>}
              </div>
            )}
          </div>

          {/* Step 4: Import */}
          <div className="card">
            <div className="card-title">4 — Import</div>
            {result ? (
              <div>
                {isHabitResult(result) && (
                  <div>
                    <div style={{ color: "var(--green)", fontWeight: 600, marginBottom: 6 }}>Import complete!</div>
                    <div className="small">
                      {result.created_habits > 0 && <div>+ {result.created_habits} new habits created</div>}
                      <div>+ {result.entries_set} entries marked done</div>
                    </div>
                  </div>
                )}
                {isExpenseResult(result) && (
                  <div>
                    <div style={{ color: "var(--green)", fontWeight: 600, marginBottom: 6 }}>Import complete!</div>
                    <div className="small">+ {result.inserted} expenses added to your tracker</div>
                  </div>
                )}
                {result.errors.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary className="small muted" style={{ cursor: "pointer" }}>{result.errors.length} rows skipped</summary>
                    <ul className="small muted" style={{ marginTop: 6, paddingLeft: 16 }}>
                      {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </details>
                )}
                <button className="btn-outline" style={{ marginTop: 12 }} onClick={resetFile}>Import another file</button>
              </div>
            ) : (
              <div>
                <div className="small muted" style={{ marginBottom: 12 }}>
                  {mode === "habits"
                    ? "Creates missing habits and marks entries as done. Safe to re-import — existing entries are updated, not duplicated."
                    : "Each debit row becomes an expense. Each credit row (if Type column set to 'credit') becomes income."}
                </div>
                <button className="btn btn-primary" onClick={doImport} disabled={!canImport}>
                  {importing ? "Importing…" : `Import ${validRowCount} rows`}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Template / format guide */}
      {rows.length === 0 && !parseErr && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-title">
            {mode === "habits" ? "Habit import format" : "Expense import format"}
          </div>
          {mode === "habits" ? (
            <>
              <div className="small muted" style={{ marginBottom: 8 }}>
                Minimum: a Date column and a Task/Habit column. Everything else is optional.
              </div>
              <div className="small muted" style={{ lineHeight: 1.8 }}>
                <strong>Date formats:</strong> YYYY-MM-DD · DD/MM/YYYY · DD-MM-YYYY<br />
                <strong>Status:</strong> blank/"done" → done &nbsp;·&nbsp; "skip"/"no" → skipped
              </div>
              <button className="btn-outline" style={{ marginTop: 12 }} onClick={() => {
                const csv = `Date,Task,Category,Status,Note,Duration\n2026-06-21,Morning Run,Health,,, \n2026-06-21,DSA Practice,Learning,done,Solved 2 problems,45\n`;
                const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                a.download = "habits-template.csv"; a.click();
              }}>Download habits template</button>
            </>
          ) : (
            <>
              <div className="small muted" style={{ marginBottom: 8 }}>
                Minimum: Date, Name, Amount. Category defaults to "Other" if not provided.
              </div>
              <div className="small muted" style={{ lineHeight: 1.8 }}>
                <strong>Amount:</strong> positive number (₹ sign and commas are stripped automatically)<br />
                <strong>Type:</strong> leave blank for expense · write "credit" for income entries<br />
                <strong>Date formats:</strong> YYYY-MM-DD · DD/MM/YYYY · DD-MM-YYYY
              </div>
              <button className="btn-outline" style={{ marginTop: 12 }} onClick={() => {
                const csv = `Date,Name,Amount,Category,Note\n${EXPENSE_TEMPLATE}\n`;
                const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                a.download = "expenses-template.csv"; a.click();
              }}>Download expenses template</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
