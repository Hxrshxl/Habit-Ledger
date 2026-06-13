"use client";

// Tiny fetch helpers shared by all pages.

export async function jget<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `Request failed (${r.status})`);
  return r.json();
}

export async function jsend<T>(url: string, method: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `Request failed (${r.status})`);
  return r.json();
}

/**
 * Hook helper: returns a load function that ignores stale responses when the
 * component re-mounts or the user navigates away and back quickly.
 * Usage: const { load, abort } = useStaleGuard();
 */
export function makeStaleGuard() {
  let current = 0;
  return {
    next(): number { return ++current; },
    isFresh(gen: number): boolean { return gen === current; },
    abort(): void { current++; },
  };
}
