import { NextRequest, NextResponse } from "next/server";
import { inflate } from "node:zlib";
import { promisify } from "node:util";

const inflateAsync = promisify(inflate);

export const dynamic = "force-dynamic";

// ─── PDF text extraction (no third-party libraries) ──────────

function decodePdfStr(raw: string): string {
  return raw
    .replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\n/g, " ").replace(/\\r/g, "").replace(/\\t/g, " ")
    .replace(/\\\\/g, "\\").replace(/\\\(/g, "(").replace(/\\\)/g, ")");
}

function decodeHex(hex: string): string {
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2)
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function streamToLines(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  const re = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(Tj|'|")|<([0-9a-fA-F]*)>\s*Tj|\[([\s\S]*?)\]\s*TJ|(T\*|Td|TD)/g;
  let m: RegExpExecArray | null;
  const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ""; };
  while ((m = re.exec(s)) !== null) {
    if (m[5]) { flush(); }
    else if (m[2]) {
      const txt = decodePdfStr(m[1]);
      if (m[2] === "'" || m[2] === '"') { flush(); cur = txt; } else cur += txt;
    } else if (m[3] !== undefined) { cur += decodeHex(m[3]); }
    else if (m[4] !== undefined) {
      const parts = m[4].match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)|<([0-9a-fA-F]*)>/g) ?? [];
      for (const p of parts) {
        if (p.startsWith("(")) cur += decodePdfStr(p.slice(1, -1));
        else cur += decodeHex(p.slice(1, -1));
      }
    }
  }
  flush();
  return out;
}

async function extractPDFText(buf: Buffer): Promise<string[]> {
  const bin = buf.toString("binary");
  const all: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  const inflations: Promise<string>[] = [];
  const rawChunks: string[] = [];
  while ((m = streamRe.exec(bin)) !== null) {
    rawChunks.push(m[1]);
    inflations.push(
      inflateAsync(Buffer.from(m[1], "binary"))
        .then((d) => d.toString("binary"))
        .catch(() => m![1])
    );
  }
  const decoded = await Promise.all(inflations);
  for (const d of decoded) all.push(...streamToLines(d));
  return all;
}

// ─── Transaction detection ────────────────────────────────────

export interface ParsedTx {
  date: string; name: string; amount: number;
  type: "expense" | "credit"; category: string;
}

const MMAP: Record<string, string> = {
  jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
  jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
};

function parseDate(line: string): string | null {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})\b/))) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    if (iso >= "2000-01-01" && iso <= "2099-12-31") return iso;
  }
  if ((m = line.match(/\b(\d{1,2})[\s\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s\-](\d{2,4})\b/i))) {
    const mo = MMAP[m[2].toLowerCase().slice(0, 3)] ?? "01";
    const y  = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${mo}-${m[1].padStart(2,"0")}`;
  }
  if ((m = line.match(/\b(\d{4})[\/\-](\d{2})[\/\-](\d{2})\b/)))
    return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function parseAmount(line: string): { amount: number; type: "expense" | "credit" } | null {
  const re = /(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)\s*(Dr|Cr|DR|CR|Debit|Credit)?(?!\d)/g;
  let best: { amount: number; type: "expense" | "credit" } | null = null;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(line)) !== null) {
    const n = parseFloat(hit[1].replace(/,/g, ""));
    if (!isFinite(n) || n < 1 || n > 50_000_000) continue;
    const isCr = hit[2] ? /cr|credit/i.test(hit[2]) : false;
    if (!best || hit[2]) { best = { amount: n, type: isCr ? "credit" : "expense" }; if (hit[2]) break; }
  }
  return best;
}

function guessCategory(desc: string): string {
  const d = desc.toLowerCase();
  if (/swiggy|zomato|blinkit|bigbasket|grocer|restaurant|food|meal|lunch|dinner/.test(d)) return "Food";
  if (/uber|ola|rapido|metro|bus|train|railway|petrol|fuel|parking|cab/.test(d)) return "Transport";
  if (/netflix|spotify|prime|hotstar|movie|cinema|game/.test(d)) return "Entertainment";
  if (/amazon|flipkart|myntra|nykaa|meesho|shop|mall|mart|store/.test(d)) return "Shopping";
  if (/hospital|pharmacy|apollo|medical|doctor|clinic|health/.test(d)) return "Health";
  if (/electricity|water|gas|bill|broadband|internet|airtel|jio|bsnl|recharge/.test(d)) return "Utilities";
  if (/school|college|course|tuition|education|udemy|fees/.test(d)) return "Education";
  if (/hotel|flight|oyo|makemytrip|goibibo|yatra|travel|irctc/.test(d)) return "Travel";
  return "Other";
}

function parseTransactions(lines: string[]): ParsedTx[] {
  const txs: ParsedTx[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const candidates = [lines[i], `${lines[i]} ${lines[i + 1] ?? ""}`];
    for (const line of candidates) {
      const date    = parseDate(line);
      const amtInfo = parseAmount(line);
      if (!date || !amtInfo) continue;
      const key = `${date}|${amtInfo.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let desc = line
        .replace(/\d{1,2}[\/\-]\d{2}[\/\-]\d{2,4}/g, "")
        .replace(/\d{4}[\/\-]\d{2}[\/\-]\d{2}/g, "")
        .replace(/\d{1,2}[\s\-](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s\-]\d{2,4}/gi, "")
        .replace(/\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?\s*(?:Dr|Cr|DR|CR|Debit|Credit)?/g, "")
        .replace(/[|\/\\]{2,}/g, " ").replace(/\s+/g, " ").trim();
      if (!desc || desc.length < 2) desc = "Transaction";
      const type: "expense" | "credit" =
        /salary|credited|refund|interest\s+paid|dividend|cashback/i.test(line)
          ? "credit" : amtInfo.type;
      txs.push({ date, name: desc.slice(0, 120), amount: amtInfo.amount, type, category: guessCategory(desc) });
      break;
    }
  }
  return txs.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Route ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid multipart data." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf")
    return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
  if (file.size > 25 * 1024 * 1024)
    return NextResponse.json({ error: "File too large (max 25 MB)." }, { status: 400 });
  const buf          = Buffer.from(await file.arrayBuffer());
  const lines        = await extractPDFText(buf);
  const transactions = parseTransactions(lines);
  return NextResponse.json({ transactions, meta: { linesExtracted: lines.length, found: transactions.length } });
}
