# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run start    # Run production server
```

No lint or test scripts are configured.

## Architecture

**Next.js 15 App Router** — single codebase for UI + API. All routes use `export const dynamic = "force-dynamic"`.

### Key directories

- `src/app/(app)/` — Protected UI pages (dashboard, tracker, goals, insights, expenses, etc.)
- `src/app/api/` — Internal API routes (password-gated via middleware)
- `src/app/api/v1/` — Public REST API (Bearer token auth, used by CLI and Telegram bot)
- `src/lib/core.ts` — All pure logic: types, date helpers, scheduling, streak computation, stats, badges, correlations. **No DB imports — safe on both client and server.**
- `src/lib/db.ts` — MongoDB layer: connection singleton, all CRUD, seed, backup, API key management, event logging.
- `src/lib/auth.ts` — Password auth (SHA-256 cookie `hl_auth`).
- `src/lib/client.ts` — Fetch wrappers (`jget`, `jsend`) and `makeStaleGuard()`.
- `src/components/AppDataProvider.tsx` — React context that fetches habits/goals/milestones once and caches them for child pages.
- `src/middleware.ts` — Protects all app + internal API routes. Public: `/login`, `/share/*`, `/api/v1/*`, `/api/login`.

### Data flow

Client → `jget`/`jsend` → `/api/…` route → `db.ts` function → MongoDB  
UI state lives in `AppDataProvider` context + local `useState`.

### MongoDB

Database: `habit_ledger`. Collections: `habits`, `entries`, `goals`, `milestones`, `daily_context`, `weekly_reviews`, `experiments`, `expenses`, `expense_budgets`, `push_subscriptions`, `settings`, `events`.

Connection uses a global singleton to survive Next.js hot-reload. All IDs are plain strings (MongoDB ObjectId hex). The `entries` collection has a unique index on `(habit_id, date)`.

The `settings` collection is a key-value store (keys: `api_key`, `share_token`, `webhook_url`, `seeded`).

### Auth

- **UI / internal API**: optional password via `APP_PASSWORD` env var → SHA-256 compared with `crypto.timingSafeEqual`, stored as HTTP-only cookie for 30 days.
- **v1 API**: Bearer token stored in `settings` collection, compared with `crypto.timingSafeEqual`.

### Habit scheduling

`isScheduled(habit, date)` in `core.ts` handles four frequency types: `daily`, `weekdays` (specific days), `times_per_week` (any N days in the week), `interval` (every N days from creation).

### Streak & freeze tokens

Computed in real-time from entries (never stored). Users earn one freeze token per 7 consecutive days (max 3 held), which absorbs a single missed scheduled day.

## Environment variables

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string (**required**) |
| `APP_PASSWORD` | Locks UI + internal API with a password (optional) |
| `GEMINI_API_KEY` | Google Gemini 2.0 Flash — habit NL parsing, goal planning (optional) |
| `ANTHROPIC_API_KEY` | Claude — Insights AI coach endpoint (optional) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push public key, exposed to browser (optional) |
| `VAPID_PUBLIC_KEY` | Web Push public key, server-side (optional) |
| `VAPID_PRIVATE_KEY` | Web Push private key (optional) |
| `VAPID_EMAIL` | Contact email for Web Push (optional) |
| `CRON_SECRET` | Vercel cron auth token for `/api/push/notify` (optional) |

## External integrations

- **CLI** (`cli/habit.mjs`): uses `/api/v1/*` with `HABIT_URL` + `HABIT_KEY` env vars.
- **Telegram bot** (`scripts/telegram-bot.mjs`): long-polling, uses `TELEGRAM_TOKEN` + `HABIT_URL` + `HABIT_KEY`.
- **Vercel cron** (`vercel.json`): hits `/api/push/notify` at 06:00 UTC daily.
- **Auto-verification**: fetches LeetCode (GraphQL) and GitHub (public events) on-demand to back-fill entries with `source: "leetcode"` or `source: "github"`.
