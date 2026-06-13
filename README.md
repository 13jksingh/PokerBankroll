# PokerBankroll

A lightweight, installable PWA to track your weekly poker night and live standings — replacing the
manual WhatsApp tally. **Anyone in the group can view and add results with no login.** Data lives in
your own Google Sheet (free, and you can edit it by hand anytime).

## Features
- 📊 **Live standings** — cumulative net per player, sorted, with games played.
- 🗓️ **Session history** — every poker night with per-player results.
- ➕ **Frictionless add** — pick players, type each net; the app enforces the night **balances to zero**.
- 👤 **Guests → members** — a guest is auto-promoted to member after 5+ games.
- 🃏 **Multiple tables** in one sheet — run more than one poker group from the same data.
- 📱 **Installable PWA** — add to home screen; standings viewable offline.

## How it works
```
PWA (React + Vite + TS)  ──HTTPS/JSON──▶  Google Apps Script web app  ──▶  Google Sheet (DB)
        static hosting                    (runs as you, open access)        4 tabs
```
No server you pay for, no per-user login. See [`spec/`](./spec) for full requirements & design.

## Setup

### 1. Backend (one-time, ~5 min)
Follow [`apps-script/README.md`](./apps-script/README.md): create a Google Sheet, paste
`apps-script/Code.gs`, deploy as a Web App ("Execute as: Me", "Who has access: Anyone"), and copy
the `/exec` URL.

### 2. Frontend
```bash
npm install
cp .env.example .env       # then put your /exec URL in VITE_API_URL
npm run dev                # http://localhost:5173
```

### 3. Deploy (free static hosting)
```bash
npm run build              # outputs dist/
```
Host `dist/` on GitHub Pages, Netlify, or any static host. Share the URL (optionally
`...?table=<tableId>`) with your group.

## Scripts
| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm test` | Run unit tests (domain logic) |
| `npm run build` | Typecheck + production build (PWA) |
| `npm run lint` | Lint |
| `npm run format` | Prettier format |

## Project layout
```
apps-script/   Google Apps Script backend (Code.gs) + setup guide
spec/          requirements.md, design.md, tasks.md
src/domain/    pure logic: standings + zero-sum validation (unit-tested)
src/lib/       config, API client, data provider, formatting
src/routes/    Standings, History, SessionDetail, AddSession, Players
src/components/ TableBar, etc.
```

## Notes
- "Open access" matches your group's existing WhatsApp trust level. A per-table edit passcode can be
  added later if needed (see `spec/requirements.md` §7).
- The Google Sheet remains the source of truth and is always hand-editable.
