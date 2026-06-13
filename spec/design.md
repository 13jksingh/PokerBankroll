# PokerBankroll — Design

## 1. Architecture Overview
A **static PWA** frontend talking to a **Google Apps Script web app** that reads/writes a single
**Google Sheet**. The Apps Script runs as the owner ("Execute as me, Anyone can access"), so
**no end-user login is required** for view or edit.

```
┌──────────────────────────────┐   HTTPS (JSON)   ┌─────────────────────────────┐
│  PWA (React + Vite + TS)     │ ───────────────▶ │  Apps Script Web App        │
│  - Mobile-first UI           │   GET ?action=…  │  (doGet / doPost)           │
│  - Standings / History / Add │ ◀─────────────── │  runs as owner, open access │
│  - No login                  │     JSON         │            │                │
└──────────────────────────────┘                  │            ▼                │
        static hosting (free)                      │   Google Sheet (one file)   │
                                                   │   Tabs: Tables, Players,    │
                                                   │         Sessions, Results   │
                                                   └─────────────────────────────┘
```

- **No backend the owner pays for**, no API keys exposed to write the sheet, no per-user OAuth.
- The Apps Script URL is the single API endpoint; the frontend never holds Google credentials.

## 2. Tech Stack (recommended)
- **Frontend:** TypeScript + React 18 + Vite; `react-router-dom`.
- **PWA:** `vite-plugin-pwa` (manifest, service worker, offline read cache).
- **Data fetching:** `fetch` + small wrapper; optional `@tanstack/react-query` for cache.
- **Backend:** Google Apps Script (single `Code.gs` with `doGet`/`doPost` JSON API).
- **Database:** one Google Sheet, multiple tabs.
- **Styling:** minimal CSS (mobile-first); keep dependencies light.
- **Testing:** Vitest + RTL for pure logic (standings, validation) and components.
- **Hosting:** GitHub Pages or Netlify (static).

## 3. Data Model (Google Sheet tabs)

### Tab: `Tables`
| Column    | Type     | Notes                         |
|-----------|----------|-------------------------------|
| tableId   | string   | unique id (e.g., `t_xxx`)     |
| name      | string   | display name                  |
| createdAt | ISO date |                               |

### Tab: `Players`
| Column    | Type     | Notes                                   |
|-----------|----------|-----------------------------------------|
| tableId   | string   | FK -> Tables.tableId (scopes the player)|
| playerId  | string   | unique id                               |
| name      | string   | display name                            |
| status    | enum     | `guest` \| `member` (auto-derived)      |
| createdAt | ISO date |                                         |

### Tab: `Sessions`
| Column    | Type     | Notes                       |
|-----------|----------|-----------------------------|
| tableId   | string   | FK -> Tables.tableId        |
| sessionId | string   | unique id                   |
| date      | ISO date | poker night date            |
| location  | string   | optional                    |
| notes     | string   | optional                    |
| createdAt | ISO date |                             |

### Tab: `Results` (long format — one row per player per session)
| Column    | Type   | Notes                                |
|-----------|--------|--------------------------------------|
| tableId   | string | FK -> Tables.tableId                 |
| sessionId | string | FK -> Sessions.sessionId             |
| playerId  | string | FK -> Players.playerId               |
| net       | number | net profit (+) / loss (-) for night  |

**Invariant:** for each `sessionId`, `sum(net) ≈ 0` (tolerance ±epsilon, e.g. 0.01).
**Scoping rule:** every query and write filters by `tableId`.

## 4. Apps Script API (single web app)
All requests hit one URL. Reads via `GET ?action=...`, writes via `POST` (JSON body).
Responses are JSON `{ ok: boolean, data?, error? }`.

- `GET  ?action=bootstrap` -> `{ tables, players, sessions, results }` (optionally `&table=<id>`)
- `GET  ?action=tables`
- `POST {action:'createTable', name}` -> `{ tableId }`
- `POST {action:'addPlayer', tableId, name}` -> `{ playerId }`
- `POST {action:'renamePlayer', tableId, playerId, name}`
- `POST {action:'addSession', tableId, date, location, notes, results:[{playerId,net}]}`
       -> validates zero-sum server-side; appends Session + Results; recomputes statuses
- `POST {action:'editSession', tableId, sessionId, ...}`
- `POST {action:'deleteSession', tableId, sessionId}`

Server-side responsibilities: id generation, zero-sum validation (defense in depth), and
guest->member recompute after writes.

## 5. Access / Security Model
- **Open view + edit, no login:** the Apps Script is deployed "Execute as: me (owner),
  Who has access: Anyone." Anyone with the app can read/write through it. This matches the
  group's existing WhatsApp trust level.
- **No secrets in the client:** the frontend only knows the Apps Script URL. The sheet itself need
  not be public; only the script accesses it.
- **Optional future guard:** a per-table edit passcode checked by the script (deferred, FR future).

## 6. App Structure (proposed)
```
apps-script/
  Code.gs                  # doGet/doPost JSON API (deployed to the sheet)
  README.md                # one-time deploy steps
src/
  main.tsx
  App.tsx
  routes/
    TablePicker.tsx        # FR-1
    StandingsPage.tsx      # FR-2 (home)
    HistoryPage.tsx        # FR-3
    SessionDetailPage.tsx  # FR-3
    AddSessionPage.tsx     # FR-4
    PlayersPage.tsx        # FR-5
  lib/
    api.ts                 # calls Apps Script (GET/POST), typed
    config.ts              # API URL + table from env / ?table=
  domain/
    types.ts               # Table, Player, Session, Result, Standing
    standings.ts           # pure: compute standings + status (unit-tested)
    validation.ts          # pure: zero-sum check (unit-tested)
  components/
    StandingsTable.tsx
    SessionForm.tsx
    PlayerPicker.tsx
  pwa/                     # manifest, icons, sw config
```

## 7. Key Flows
- **View standings:** `bootstrap` (or cached) -> filter by tableId -> compute -> render. (no login)
- **Add session:** fill form -> client zero-sum check -> `POST addSession` -> server re-validates,
  appends rows, recomputes statuses -> refresh standings.
- **Promotion:** after writes, server recomputes gamesPlayed per player; guest with >=5 -> member.

## 8. Error / Edge Handling
- Zero-sum fails -> block save (client) + reject (server) with the difference amount.
- Offline -> read from cache; writes disabled with a clear message.
- Multiple tables -> always scope by tableId; default to single table when only one exists.
- Typos -> rename keeps playerId stable (history preserved).

## 9. Decisions & Rationale
- **Apps Script + Sheet:** free, data stays in the group's own spreadsheet (hand-editable),
  and "Anyone can access" removes all per-user login friction for view and edit.
- **Single endpoint:** simplest possible client; no Google credentials in the browser.
- **`tableId` on every row:** enables multiple poker tables in one sheet without new files.
- **Long-format Results + server-side validation/promotion:** simple appends, trustworthy invariants.
