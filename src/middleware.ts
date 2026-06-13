import { NextRequest, NextResponse } from "next/server";

/**
 * If APP_PASSWORD is set, gate all pages and the internal API behind a
 * login cookie. Public surfaces stay open: /login, /share/*, /api/v1/*
 * (Bearer-key gated in the routes), /api/login, and static assets.
 */

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const open =
    pathname.startsWith("/login") ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/api/v1") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icon");
  if (open) return NextResponse.next();

  const cookie = req.cookies.get("hl_auth")?.value;
  if (cookie && cookie === (await sha256Hex(pw))) return NextResponse.next();

  if (pathname.startsWith("/api"))
    return NextResponse.json({ error: "Locked. Sign in first." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
