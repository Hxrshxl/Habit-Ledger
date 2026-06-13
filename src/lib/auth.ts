import crypto from "crypto";

/**
 * Optional password lock. Set APP_PASSWORD in the environment to require
 * login for the web UI and same-origin API. The /api/v1/* endpoints are
 * always gated by the Bearer API key instead (see checkApiKey in db.ts).
 */

export function passwordEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

export function cookieValueFor(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function cookieIsValid(cookie: string | undefined): boolean {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return true;
  if (!cookie) return false;
  const expected = cookieValueFor(pw);
  if (cookie.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
}
