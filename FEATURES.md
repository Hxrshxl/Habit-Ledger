# Habit Ledger — Feature List

A self-hosted habit tracker built with Next.js 15, React 19, and SQLite (local or Turso).

---

## 1. Dashboard

The home page. Everything visible at a glance.

- **Today's habits checklist** — all habits scheduled for today listed with one-click checkboxes. Done items turn green instantly (optimistic update, rolls back on error).
- **All done today button** — single button marks every pending manual habit as done in parallel.
- **Inline stats bar** — shows current month completion %, letter grade (A/B/C/D/F), today's done/total count, and best current streak.
- **Activity heatmap** — GitHub-style 6-month heatmap across all habits. Cell colour = ratio of done/scheduled for that day.
- **12-week trend chart** — SVG line chart of weekly completion percentage over the last 12 weeks.
- **Goals progress** — active goals shown with health-coloured progress bars and stalled/at-risk pills.
- **Upcoming milestones** — milestones due within 14 days with colour-coded urgency (red ≤ 3 days, amber otherwise).
- **Badges/milestones panel** — earned badges (7-day streak, 30-day streak, 100% week, etc.) shown as pills.
- **Daily intention banner** — contextual banner showing the most urgent milestone deadline and what's still pending today. Dismissable per-day (stored in localStorage).
- **Monday reminder** — on Mondays, shows what you committed to protect time for in last week's review.
- **Quick add habit panel** — inline form to add a new habit without leaving the dashboard (name, category, frequency, weekdays, monthly goal).

---

## 2. Habit Tracker

Full habit management at `/tracker`.

### Frequency types
| Type | What it means | Example |
|---|---|---|
| `daily` | Every single day | Meditate |
| `weekdays` | Specific days of the week | Gym on Mon/Wed/Fri |
| `weekly` | X times per week (any days) | Read 3 times a week |
| `interval` | Every N days | Cut nails every 14 days |

### Habit fields
- **Name** — action-oriented habit name (max 80 chars)
- **Category** — Health, Learning, Career, Finance, Personal, Routine, Other (colour-coded dots)
- **Why** — one-line reason / motivation shown on the card
- **Quantity target** — optional numeric goal with unit (e.g. 30 pages, 5 km, 8 glasses)
- **Monthly goal** — target number of completions per month
- **Auto-verification** — LeetCode or GitHub (see §8)
- **Milestone link** — attach the habit to a specific goal milestone
- **Position** — drag-to-reorder via up/down arrows

### Habit grid
- Card shows: category dot, name, why, frequency badge, streak, monthly progress bar
- Inline edit and delete (with confirmation modal, no browser dialogs)
- Archive/unarchive — archived habits hidden from tracker but entries preserved

### Natural Language Quick-Add
A text bar above the grid: type a plain-English description and the app creates the habit automatically.

- Examples: `"cut nails twice a month"` → interval 15d · `"run 5km every weekday"` → weekdays Mon–Fri · `"read 30 pages daily"` → daily, qty 30 pages
- Powered by Gemini 2.0 Flash (`POST /api/habits/parse`)
- Shows a preview card with editable name, category badge, and frequency before saving
- Handles all 4 frequency types + quantity extraction

---

## 3. Goals System

Strategic goal management at `/goals` and `/goals/create`.

### Goal fields
- Name, description, category, priority (low/medium/high), timeframe (3m/6m/1y/3y/5y/custom), start date, target date, status (active/paused/completed/stalled)

### Goal cards
- Progress bar coloured by health status
- Health pills: **stalled** (no habit activity in 7+ days) · **at risk** (completion < 50% of expected) · **great** (≥ 80%)
- Milestone timeline shown beneath each goal

### Milestones
- Each goal has ordered milestones with: title, explanation, success criteria, estimated duration, dependencies, target date, status
- Milestones link to habits — habit entries feed into milestone progress

### AI Goal Planner (`/goals/create`)
Multi-step wizard:
1. Fill in goal name, description, timeframe
2. Click "Generate plan with AI" — Gemini creates a structured milestone breakdown with explanations and duration estimates
3. Review and edit the generated milestones
4. Save — milestones created sequentially (need IDs), then all milestone habits created in parallel

---

## 4. Insights

Analytics at `/insights`.

- **Monthly breakdown** — per-habit completion counts and percentages for any month
- **Weekday matrix** — which days of the week you most/least complete each habit
- **Pair lift analysis** — which habit pairs tend to be done together (correlation)
- **Experiments (A/B testing)** — compare completion rates across two date ranges for any habit (e.g. "did morning workouts improve after I changed my alarm?")
- **AI coach** — ask a question about your habits in plain English; the coach has context of your recent entries and streaks (requires `ANTHROPIC_API_KEY`)

---

## 5. Weekly Review

Structured retrospective at `/review`.

- Select any of the last 6 weeks from a tab bar
- Three-field form: **What went well**, **What got in the way**, **Protect time for** (commitment for next week)
- Saved reviews persist; Dashboard shows Monday reminder with last week's protect-time commitment

---

## 6. Expenses & Budgets

Finance tracking at `/expenses`.

- **Manual entry** — add expense or credit with date, name, amount, category, note
- **Monthly view** — navigate months, see totals, category breakdown
- **Budget management** — set monthly budget per category, see spent vs. budget with progress bars and overspend warnings
- **PDF bank statement import** — upload a PDF statement; Gemini extracts transactions; review list with checkboxes before confirming import
- **Categories** — Food, Transport, Entertainment, Shopping, Health, Utilities, Education, Travel, Other (colour-coded)

---

## 7. Heatmap

Full-year heatmap at `/heatmap`.

- Per-habit activity heatmap for the full calendar year
- Each cell = one day; colour intensity = done/scheduled ratio
- Click any cell to see which habits were completed that day

---

## 8. Auto-Verification

Automatically mark habit days as done from external sources — no manual logging needed.

- **LeetCode** — fetches recent accepted submissions via LeetCode GraphQL API; marks the habit done on days you solved a problem
- **GitHub** — fetches your public push events; marks done on days you pushed code (optional: filter to a specific repo)
- **100% free** — uses public APIs, no tokens or accounts required
- Run on demand from Settings → "Run verification now", or schedule it via cron
- Back-fills last ~30 days of activity
- Verified entries shown with a green ✓ pill in the tracker

---

## 9. Push Notifications

Daily reminder via browser push (Web Push API / VAPID).

- Enable/disable toggle in Settings
- Requests browser notification permission on first enable
- Notification content: count of pending habits for today, names of first 3 pending habits
- If all habits are done: "All done today 🎉" message
- Clicking the notification opens the app
- Cron job in `vercel.json` fires the notify endpoint at 6 AM daily
- Stale subscriptions (410/404) are automatically cleaned up from the database

---

## 10. iCal Export

Download your habits as a recurring calendar file.

- Settings → Data & backup → "Download Calendar (.ics)"
- Each habit becomes a `VEVENT` with an `RRULE` matching its frequency:
  - `daily` → `RRULE:FREQ=DAILY`
  - `interval` → `RRULE:FREQ=DAILY;INTERVAL=N`
  - `weekly` → `RRULE:FREQ=WEEKLY`
  - `weekdays` → `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,...`
- Import into Google Calendar, Apple Calendar, Outlook — habit days show up as transparent all-day events

---

## 11. Public Share Link

Read-only shareable page for accountability.

- Settings → Enable sharing → generates a unique token
- Public URL: `/share/<token>` — shows current-month progress for all habits
- No login required to view; shows stats only, not raw data
- Disable at any time (invalidates the token immediately)

---

## 12. Data Management

- **Backup** — download full JSON backup (`GET /api/backup`) containing all habits, entries, goals, milestones, settings
- **Import** — upload a JSON backup to restore; shows a confirmation modal before overwriting (cannot be undone)
- **CSV export** — export all entries as CSV (`GET /api/export`)
- **iCal export** — see §10

---

## 13. Password Protection

- Set `APP_PASSWORD` in `.env.local` to lock the app behind a login page
- Session cookie-based auth; middleware protects all app routes
- Settings page shows whether password lock is active

---

## 14. REST API (External Access)

External API for integrations (e.g. Telegram bot, scripts, mobile shortcuts).

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/habits` | GET | List all habits (name, id, category) |
| `/api/v1/status` | GET | Today's completion status per habit |
| `/api/v1/complete` | POST | Mark a habit done for today |

Authentication: `Authorization: Bearer <api_key>` (key generated in Settings).

---

## 15. PWA — Install on Phone

The app is a Progressive Web App and can be installed on any phone.

- **Android (Chrome)**: tap ⋮ → "Add to Home Screen" — opens full-screen like a native app
- **iOS (Safari)**: tap Share → "Add to Home Screen"
- Service worker (`public/sw.js`) handles push notifications and enables offline installability
- App manifest (`public/manifest.json`) with icons, theme colour, standalone display mode

---

## 16. Streak & Badge Engine

Computed in `src/lib/core.ts` — no DB writes, pure calculation from entries.

- **Current streak** — consecutive days (or weeks for weekly habits) with at least one done entry
- **Best streak** — historical max streak per habit
- **Freeze tokens** — automatically earned when you complete ≥ 70% of that week's habits; protect streak through a missed day (up to 2 active at once)
- **Streak unit** — daily habits count in days; weekly habits count in weeks
- **Badges**: 7-day, 30-day, 100-day streaks; Perfect Week; Century Club; etc.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19, TypeScript strict mode |
| Database | SQLite via `@libsql/client` (local file or Turso cloud) |
| AI | Google Gemini 2.0 Flash (habit parsing + goal planning) |
| AI Coach | Anthropic Claude (optional, requires API key) |
| Push | Web Push API + VAPID (`web-push` npm package) |
| Hosting | Vercel (with cron jobs for push notifications) |
| Auth | Cookie-based session, middleware-protected routes |
| PWA | Service worker + Web App Manifest |
