# PokerBankroll — Execution Tasks

Ordered, independently verifiable tasks. Each maps to requirements (FR-*). Mark `[x]` when its
acceptance check passes.

## Phase 0 — Foundations
- [x] T0.1 Scaffold Vite + React + TS; run dev server. _Verify:_ app boots locally.
- [x] T0.2 Add ESLint, Prettier, Vitest + RTL. _Verify:_ lint + empty test run pass.
- [x] T0.3 Define `domain/types.ts` (Table, Player, Session, Result, Standing). _Verify:_ typecheck.

## Phase 1 — Pure domain logic (TDD, no Google needed)
- [x] T1.1 `validation.ts` zero-sum check with epsilon. _Verify:_ tests pass/fail/tolerance. (FR-4)
- [x] T1.2 `standings.ts` compute cumulativeNet + gamesPlayed + status, scoped by tableId.
      _Verify:_ tests incl. guest->member at 5 games. (FR-2, FR-5)

## Phase 2 — Backend (Google Apps Script)
- [x] T2.1 Create the Google Sheet with 4 tabs + headers (Tables, Players, Sessions, Results).
- [x] T2.2 Write `apps-script/Code.gs`: `doGet` (bootstrap/tables) + `doPost`
      (createTable/addPlayer/renamePlayer/addSession/editSession/deleteSession) returning JSON.
- [x] T2.3 Server-side zero-sum validation + id generation + guest->member recompute. (FR-4, FR-5)
- [x] T2.4 Deploy as web app ("Execute as me / Anyone"). Document steps in `apps-script/README.md`.
      _Verify:_ curl GET bootstrap returns JSON; POST addSession writes rows.

## Phase 3 — Frontend data layer
- [x] T3.1 `config.ts` resolve Apps Script URL (env) + table from `?table=`. (FR-1, FR-9)
- [x] T3.2 `api.ts` typed GET/POST wrappers mapping to domain types. _Verify:_ reads live data.

## Phase 4 — Public UI (no login)
- [x] T4.1 App shell + routing + mobile-first layout.
- [x] T4.2 TablePicker: choose table, auto-select when only one. (FR-1)
- [x] T4.3 StandingsPage + StandingsTable: leaderboard name/status/games/net, sorted. (FR-2)
- [x] T4.4 HistoryPage list + SessionDetailPage. (FR-3)
- [x] T4.5 Loading / empty / offline states + refresh control. (FR-8 AC-2)

## Phase 5 — Editing (no login)
- [x] T5.1 AddSessionPage: SessionForm (date default today, location, notes) + PlayerPicker
      (select existing / add guest) + per-player net inputs + live zero-sum validation. (FR-4)
- [x] T5.2 Save -> `POST addSession` -> refresh standings; guests auto-promote at 5 games. (FR-4, FR-5)
- [x] T5.3 Edit/delete existing session with recompute. (FR-6)
- [x] T5.4 PlayersPage: add guest, rename player (stable id). (FR-5)
- [x] T5.5 Create-table action in UI. (FR-7)

## Phase 6 — PWA & polish
- [x] T6.1 `vite-plugin-pwa`: manifest, icons, installable. _Verify:_ install prompt on mobile. (FR-8)
- [x] T6.2 Service worker: cache app shell + last standings/history for offline read. (FR-8)
- [x] T6.3 Disable writes when offline with clear messaging. (FR-8 AC-3)
- [x] T6.4 Final mobile UX pass (tap targets, fast add flow) + empty-state copy.

## Phase 7 — Ship
- [~] T7.1 Build + deploy static site (GitHub Pages / Netlify). _Build works; deploy pending your host choice._
- [x] T7.2 README: how to view, how to set up the sheet + Apps Script, env/config vars.
- [~] T7.3 Smoke test full flow on a phone: view + add session (no login). _Pending your Apps Script URL._

## Deferred / Future
- [ ] Optional per-table edit passcode.
- [ ] Charts/trends over time.
- [ ] Bring-your-own-sheet onboarding for other groups.
