/** Title-cases a string: "ADITYA S" → "Aditya S" */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Extracts the merchant/counterparty name from a raw SBI transaction detail
 * string for display purposes. Runs at render time only — never mutates stored data.
 *
 * Handles:
 *   WDL TFR UPI/DR/<ref>/<name>/…  → name, title-cased
 *   DEP TFR UPI/CR/<ref>/<name>/…  → name, title-cased
 *   IMPS/<ref>/<name>/…            → name as-is (may contain IDs/codes)
 *   Anything else                   → original string (truncated to 40 chars)
 */
export function extractMerchantName(raw: string): string {
  if (!raw) return raw;

  // UPI debit/credit
  const upi = raw.match(/^(?:WDL|DEP)\s+TFR\s+UPI\/(?:DR|CR)\/\d+\/([^/]+)/i);
  if (upi) return titleCase(upi[1].trim());

  // IMPS: "IMPS/616821344790/ICN-XX554-RELIANCE/rcode"
  const imps = raw.match(/^IMPS\/\d+\/([^/]+)/i);
  if (imps) return imps[1].trim();

  // No pattern match — return original, capped to avoid layout overflow
  return raw.length > 40 ? raw.slice(0, 40).trimEnd() + "…" : raw;
}
