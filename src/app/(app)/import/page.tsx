"use client";

import { useCallback, useRef, useState } from "react";
import { jsend } from "@/lib/client";

export const dynamic = "force-dynamic";

interface ParsedRow {
  [key: string]: string;
}

interface ImportResult {
  created_habits: number;
  entries_set: number;
  errors: string[];
}

// --- Inline CSV parser (handles quoted fields, CRLF, embedded commas) ---
function parseCSVText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;

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
    } else {
      cell += ch;
    }
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

export default function ImportPage() {
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseErr, setParseErr] = useState("");

  // Column mapping
  const [dateCol, setDateCol] = useState(NONE);
  const [taskCol, setTaskCol] = useState(NONE);
  const [catCol, setCatCol] = useState(NONE);
  const [statusCol, setStatusCol] = useState(NONE);
  const [noteCol, setNoteCol] = useState(NONE);
  const [durCol, setDurCol] = useState(NONE);

  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleFile(file: File) {
    setParseErr(""); setResult(null); setHeaders([]); setRows([]);
    setFileName(file.name);

    try {
      let raw: string[][];

      if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
        const text = await file.text();
        raw = parseCSVText(text);
      } else {
        // Excel: dynamic import xlsx to keep main bundle lean
        const XLSX = await import("xlsx");
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(ab), { type: "array", cellDates: true, dateNF: "YYYY-MM-DD" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, dateNF: "YYYY-MM-DD" });
      }

      if (!raw || raw.length < 2) { setParseErr("File has no data rows."); return; }

      const hdrs = raw[0].map(h => String(h ?? "").trim());
      const dataRows: ParsedRow[] = raw.slice(1).map(r =>
        Object.fromEntries(hdrs.map((h, i) => [h, String(r[i] ?? "").trim()]))
      );

      setHeaders(hdrs);
      setRows(dataRows);

      // Auto-detect columns
      setDateCol(detectCol(hdrs, ["date", "day", "dt"]) || NONE);
      setTaskCol(detectCol(hdrs, ["task", "habit", "name", "activity", "work", "todo", "item"]) || NONE);
      setCatCol(detectCol(hdrs, ["category", "cat", "type", "group"]) || NONE);
      setStatusCol(detectCol(hdrs, ["status", "done", "complete", "result"]) || NONE);
      setNoteCol(detectCol(hdrs, ["note", "remark", "comment", "desc"]) || NONE);
      setDurCol(detectCol(hdrs, ["duration", "minutes", "mins", "time"]) || NONE);
    } catch (e) {
      setParseErr(`Failed to parse file: ${String(e)}`);
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dropRef.current?.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    dropRef.current?.classList.add("drag-over");
  };

  const onDragLeave = () => dropRef.current?.classList.remove("drag-over");

  // Build preview rows using current column mapping
  const previewRows = rows.slice(0, 10).map(r => ({
    date:     dateCol   !== NONE ? r[dateCol]   : "",
    task:     taskCol   !== NONE ? r[taskCol]   : "",
    category: catCol    !== NONE ? r[catCol]    : "",
    status:   statusCol !== NONE ? r[statusCol] : "",
    note:     noteCol   !== NONE ? r[noteCol]   : "",
  }));

  const uniqueHabits = taskCol !== NONE
    ? [...new Set(rows.map(r => r[taskCol]).filter(Boolean))].length
    : 0;

  const canImport = dateCol !== NONE && taskCol !== NONE && rows.length > 0 && !importing;

  async function doImport() {
    if (!canImport) return;
    setImporting(true);
    setResult(null);

    const payload = rows
      .filter(r => r[dateCol]?.trim() && r[taskCol]?.trim())
      .map(r => ({
        date:             r[dateCol],
        task:             r[taskCol],
        category:         catCol    !== NONE ? r[catCol]    : undefined,
        status:           statusCol !== NONE ? r[statusCol] : undefined,
        note:             noteCol   !== NONE ? r[noteCol]   : undefined,
        duration_minutes: durCol    !== NONE ? r[durCol]    : undefined,
      }));

    try {
      const res = await jsend<ImportResult>("/api/import/csv", "POST", { rows: payload });
      setResult(res);
    } catch (e) {
      setResult({ created_habits: 0, entries_set: 0, errors: [String(e)] });
    } finally {
      setImporting(false);
    }
  }

  const ColSelect = ({ label, value, onChange }: {
    label: string; value: string; onChange: (v: string) => void;
  }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ width: 130, color: "var(--muted)", fontSize: 13 }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ flex: 1, maxWidth: 200 }}
      >
        <option value={NONE}>(not mapped)</option>
        {headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );

  return (
    <div className="page-wrap">
      <div className="page-header">
        <h1>Import Habits</h1>
        <p className="muted small">
          Upload a CSV or Excel file. Each row becomes an entry — new habits are created automatically.
        </p>
      </div>

      {/* Step 1: Upload */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">1 — Upload file</div>

        <div
          ref={dropRef}
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          style={{
            border: "2px dashed var(--border-strong)",
            borderRadius: 8,
            padding: "32px 20px",
            textAlign: "center",
            cursor: "pointer",
            color: "var(--muted)",
            transition: "border-color 0.15s, background 0.15s",
          }}
          className="drop-zone"
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>↑</div>
          <div>Drag &amp; drop your file here, or <strong>click to browse</strong></div>
          <div className="small muted" style={{ marginTop: 4 }}>
            Supports .csv, .xlsx, .xls
          </div>
          {fileName && (
            <div style={{ marginTop: 10, color: "var(--text)", fontWeight: 600 }}>
              {fileName} — {rows.length} rows
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {parseErr && <div className="small" style={{ color: "var(--red)", marginTop: 8 }}>{parseErr}</div>}
      </div>

      {headers.length > 0 && (
        <>
          {/* Step 2: Column mapping */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">2 — Map columns</div>
            <ColSelect label="Date *"         value={dateCol}   onChange={setDateCol} />
            <ColSelect label="Task / Habit *" value={taskCol}   onChange={setTaskCol} />
            <ColSelect label="Category"       value={catCol}    onChange={setCatCol} />
            <ColSelect label="Status"         value={statusCol} onChange={setStatusCol} />
            <ColSelect label="Note"           value={noteCol}   onChange={setNoteCol} />
            <ColSelect label="Duration (min)" value={durCol}    onChange={setDurCol} />
            <div className="small muted" style={{ marginTop: 8 }}>
              Status values: "done" / "yes" → done &nbsp;·&nbsp; "skip" / "no" → skipped &nbsp;·&nbsp; blank → done
            </div>
          </div>

          {/* Step 3: Preview */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>3 — Preview</span>
              <span className="small muted">
                {rows.length} rows &nbsp;·&nbsp; {uniqueHabits} unique habit{uniqueHabits !== 1 ? "s" : ""}
              </span>
            </div>

            {dateCol === NONE || taskCol === NONE ? (
              <div className="muted small">Map at least the Date and Task columns to see a preview.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["Date", "Task", catCol !== NONE && "Category", statusCol !== NONE && "Status", noteCol !== NONE && "Note"]
                        .filter(Boolean)
                        .map(h => (
                          <th key={String(h)} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 500 }}>
                            {String(h)}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "5px 8px" }}>{r.date || <span className="muted">—</span>}</td>
                        <td style={{ padding: "5px 8px" }}>{r.task || <span className="muted">—</span>}</td>
                        {catCol    !== NONE && <td style={{ padding: "5px 8px", color: "var(--muted)" }}>{r.category}</td>}
                        {statusCol !== NONE && <td style={{ padding: "5px 8px", color: "var(--muted)" }}>{r.status}</td>}
                        {noteCol   !== NONE && <td style={{ padding: "5px 8px", color: "var(--muted)" }}>{r.note}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 10 && (
                  <div className="small muted" style={{ padding: "6px 8px" }}>
                    … and {rows.length - 10} more rows
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 4: Import */}
          <div className="card">
            <div className="card-title">4 — Import</div>

            {result ? (
              <div>
                {result.entries_set > 0 && (
                  <div style={{ color: "var(--green)", fontWeight: 600, marginBottom: 6 }}>
                    Import complete!
                  </div>
                )}
                <div className="small" style={{ marginBottom: 4 }}>
                  {result.created_habits > 0 && <div>+ {result.created_habits} new habit{result.created_habits !== 1 ? "s" : ""} created</div>}
                  <div>+ {result.entries_set} entries marked done</div>
                </div>
                {result.errors.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary className="small muted" style={{ cursor: "pointer" }}>
                      {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} skipped
                    </summary>
                    <ul className="small muted" style={{ marginTop: 6, paddingLeft: 16 }}>
                      {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </details>
                )}
                <button
                  className="btn-outline"
                  style={{ marginTop: 12 }}
                  onClick={() => { setResult(null); setRows([]); setHeaders([]); setFileName(""); }}
                >
                  Import another file
                </button>
              </div>
            ) : (
              <div>
                <div className="small muted" style={{ marginBottom: 12 }}>
                  This will create any missing habits and mark each row&apos;s entry as done on the given date.
                  Already-logged entries for the same (habit, date) will be updated, not duplicated.
                </div>
                <button
                  className="btn"
                  onClick={doImport}
                  disabled={!canImport}
                >
                  {importing
                    ? "Importing…"
                    : `Import ${rows.filter(r => dateCol !== NONE && taskCol !== NONE && r[dateCol]?.trim() && r[taskCol]?.trim()).length} rows`}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* CSV template download */}
      {rows.length === 0 && !parseErr && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-title">Expected file format</div>
          <div className="small muted" style={{ marginBottom: 8 }}>
            Your file should have at least a date column and a task/habit name column.
            Column names are detected automatically — any of these work:
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Date", "Task", "Category", "Status", "Note", "Duration"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontWeight: 500 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["2026-06-21", "Morning Run", "Health", "", "", ""],
                  ["2026-06-21", "DSA Practice", "Learning", "done", "Solved 2 problems", "45"],
                  ["21/06/2026", "Read 20 pages", "Learning", "", "", ""],
                  ["2026-06-22", "Morning Run", "Health", "skip", "Rest day", ""],
                ].map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: "5px 8px", color: cell ? "var(--text)" : "var(--faint)" }}>
                        {cell || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
            <strong>Date formats accepted:</strong> YYYY-MM-DD &nbsp;·&nbsp; DD/MM/YYYY &nbsp;·&nbsp; DD-MM-YYYY<br />
            <strong>Status values:</strong> blank or "done" → done &nbsp;·&nbsp; "skip" / "skipped" → skipped<br />
            <strong>Excel tip:</strong> Format date cells as Text or YYYY-MM-DD before exporting to CSV.
          </div>
          <button
            className="btn-outline"
            style={{ marginTop: 12 }}
            onClick={() => {
              const csv = `Date,Task,Category,Status,Note,Duration\n2026-06-21,Morning Run,Health,,, \n2026-06-21,DSA Practice,Learning,done,Solved 2 problems,45\n`;
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
              a.download = "habit-import-template.csv";
              a.click();
            }}
          >
            Download template CSV
          </button>
        </div>
      )}
    </div>
  );
}
