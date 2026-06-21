/**
 * Tests for extractMerchantName.
 * Run: node src/lib/__tests__/extractMerchantName.test.mjs
 * Requires Node 18+ (uses node:test built-in runner).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// Inline JS mirror of src/lib/expenses.ts — no build step needed.
function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
function extractMerchantName(raw) {
  if (!raw) return raw;
  const upi = raw.match(/^(?:WDL|DEP)\s+TFR\s+UPI\/(?:DR|CR)\/\d+\/([^/]+)/i);
  if (upi) return titleCase(upi[1].trim());
  const imps = raw.match(/^IMPS\/\d+\/([^/]+)/i);
  if (imps) return imps[1].trim();
  return raw.length > 40 ? raw.slice(0, 40).trimEnd() + "…" : raw;
}

// ── Standard UPI debit ──────────────────────────────────────────────────────
test("WDL UPI/DR extracts and title-cases merchant", () => {
  assert.strictEqual(
    extractMerchantName("WDL TFR UPI/DR/615213338223/Amazon I/RATN/amazon@rap/You"),
    "Amazon I"
  );
});

// ── Standard UPI credit ─────────────────────────────────────────────────────
test("DEP UPI/CR extracts and title-cases counterparty", () => {
  assert.strictEqual(
    extractMerchantName("DEP TFR UPI/CR/703988592182/ADITYA S/HDFC/8208584349/rent"),
    "Aditya S"
  );
});

test("WDL UPI/DR all-caps merchant title-cased", () => {
  assert.strictEqual(
    extractMerchantName("WDL TFR UPI/DR/652031937054/GROWW IN/HDFC/groww.brk@/Paid"),
    "Groww In"
  );
});

test("single-word merchant extracted correctly", () => {
  assert.strictEqual(
    extractMerchantName("WDL TFR UPI/DR/615405319768/Euronet/UTIB/gpayrechar/UPI"),
    "Euronet"
  );
});

test("DEP UPI/CR two-word name extracted", () => {
  assert.strictEqual(
    extractMerchantName("DEP TFR UPI/CR/389661055696/JAYESH N/ICIC/9665492118/Paym"),
    "Jayesh N"
  );
});

// ── IMPS ────────────────────────────────────────────────────────────────────
test("IMPS row extracts name segment as-is (no title-case)", () => {
  assert.strictEqual(
    extractMerchantName("IMPS/616821344790/ICN-XX554-RELIANCE/rcode"),
    "ICN-XX554-RELIANCE"
  );
});

// ── Non-UPI / fallback ───────────────────────────────────────────────────────
test("salary credit (CEMTEX DEP BY SALARY) returns original", () => {
  assert.strictEqual(
    extractMerchantName("CEMTEX DEP BY SALARY"),
    "CEMTEX DEP BY SALARY"
  );
});

test("already-clean name passes through unchanged", () => {
  assert.strictEqual(extractMerchantName("Amazon"), "Amazon");
});

test("long non-matching string is truncated with ellipsis", () => {
  const long = "SOME VERY LONG UNKNOWN TRANSACTION TYPE THAT WONT FIT";
  const result = extractMerchantName(long);
  assert.ok(result.endsWith("…"), "should end with ellipsis");
  assert.ok(result.length <= 41, "should be max 41 chars (40 + ellipsis)");
});

test("empty string returns empty string", () => {
  assert.strictEqual(extractMerchantName(""), "");
});
