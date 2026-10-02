# PokerBankroll

A lightweight, installable PWA to track your weekly poker night and live standings — replacing the
manual WhatsApp tally. **Anyone in the group can view results with no login.** Organizer writes are
protected by a shared PIN. Data is served by a low-cost Azure Functions API backed by Cosmos DB.

## Features

- 📊 **Live standings** — cumulative net per player, sorted, with games played.
- 🗓️ **Session history** — every poker night with per-player results.
- ➕ **Frictionless add** — pick players, type each net; the app enforces the night **balances to zero**.
- 👤 **Guests → members** — a guest is auto-promoted to member after 5+ games.
- 🃏 **Multiple tables** in one sheet — run more than one poker group from the same data.
- 📱 **Installable PWA** — add to home screen; standings viewable offline.

## How it works

```
PWA (React + Vite + TS)  ──HTTPS/JSON──▶  Azure Functions  ──▶  Cosmos DB
        GitHub Pages                       Flex Consumption     free tier
```

The API runs on demand and Cosmos uses its lifetime free tier. See [`api/README.md`](./api/README.md)
for deployment, migration, and rollback details.

## Setup

### 1. Backend

The production backend is in [`api/`](./api) and runs as an Azure Functions Flex Consumption app.
Infrastructure can be recreated with [`infra/deploy.ps1`](./infra/deploy.ps1).

### 2. Frontend

```bash
npm install
cp .env.example .env       # then put your Azure /api/poker URL in VITE_API_URL
npm run dev                # http://localhost:5173
```

### 3. Deploy (free static hosting)

```bash
npm run build              # outputs dist/
```

Host `dist/` on GitHub Pages, Netlify, or any static host. Share the URL (optionally
`...?table=<tableId>`) with your group.

## Scripts

| Command             | Description                         |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Start the dev server                |
| `npm test`          | Run unit tests (domain logic)       |
| `npm run build`     | Typecheck + production build (PWA)  |
| `npm run lint`      | Lint                                |
| `npm run format`    | Prettier format                     |
| `npm run api:build` | Typecheck and compile the Azure API |
| `npm run api:test`  | Run Azure API unit tests            |

## Project layout

```
api/           Azure Functions API, Cosmos data access, and migration tooling
infra/         Reproducible Azure resource provisioning
apps-script/   Legacy Google Apps Script backend retained for rollback
spec/          requirements.md, design.md, tasks.md
src/domain/    pure logic: standings + zero-sum validation (unit-tested)
src/lib/       config, API client, data provider, formatting
src/routes/    Standings, History, SessionDetail, AddSession, Players
src/components/ TableBar, etc.
```

## Notes

- Reads remain open; writes require the organizer PIN.
- The legacy Google Sheet is retained as a rollback snapshot but is no longer the production source
  of truth after the Azure cutover.
