# PokerBankroll — Requirements

## 1. Vision
A lightweight, frictionless Progressive Web App (PWA) to replace manual WhatsApp tracking of a
weekly group poker game. It records each night's results and shows live standings. Data lives in a
single **Google Sheet** the group owns. **Anyone in the group can view and edit — no login.**

## 2. Users / Roles
- **Group member (no login):** anyone with the link. Can view standings/history and add/edit
  sessions and players. No account, no sign-in. (Trust model = same as the WhatsApp group.)
- **Setup owner (one-time):** the person who creates the Google Sheet and deploys the Apps Script
  web app once. After that they are just a normal group member in the app.

## 3. Core Concepts
- **Table:** an independent poker group/game within the sheet. The sheet can hold **multiple tables**;
  each table has its own players, sessions, and standings. (Group starts with one table.)
- **Session:** one poker night for a table. Has a date, location, optional notes, and per-player
  net results that must sum to ~zero (zero-sum after buy-ins returned to the bank).
- **Player:** a person at a table. Status is **guest** or **member**.
- **Guest -> Member promotion:** a guest who has played **5+ sessions** (within that table) is
  automatically promoted to **member**.
- **Standing:** a player's cumulative net profit/loss across all sessions in their table.

## 4. Functional Requirements (User Stories + Acceptance Criteria)

### FR-1 — Select / view a table
As a member, I want to pick which poker table I'm looking at.
- AC-1: If multiple tables exist, the app lets me choose one (or via `?table=<id>` link).
- AC-2: If only one table exists, it is selected automatically.
- AC-3: All views (standings/history/add) are scoped to the selected table.

### FR-2 — View live standings (no login)
- AC-1: Standings load with no authentication.
- AC-2: Each player shows: name, status (guest/member), games played, cumulative net result.
- AC-3: Sorted by cumulative net result (highest first) by default.
- AC-4: Reflects the latest data in the sheet on each load/refresh.

### FR-3 — View session history (no login)
- AC-1: A list of sessions shows date, location, player count, most recent first.
- AC-2: Selecting a session shows date, location, notes, and each player's net result.

### FR-4 — Add a session (no login)
- AC-1: Enter date (defaults today), location, optional notes.
- AC-2: Select participating players and/or add a new guest by name.
- AC-3: Enter each participant's net result (+/-).
- AC-4: App validates nets sum to within a small tolerance of zero; blocks save with a clear
  message (showing the difference) if not.
- AC-5: On save, the session is written to the sheet and standings update.

### FR-5 — Manage players (no login)
- AC-1: Add a player as a guest (scoped to the table).
- AC-2: A guest reaching 5+ played sessions is recorded/shown as a member automatically.
- AC-3: Rename a player without losing history (stable id).

### FR-6 — Edit / delete a session (no login)
- AC-1: Edit a session (same validation as FR-4).
- AC-2: Delete a session; standings and games-played recompute.

### FR-7 — Manage tables (lightweight)
- AC-1: Create a new table (name) within the same sheet.
- AC-2: Each table's data is isolated from other tables.

### FR-8 — Installable PWA
- AC-1: Installable on a phone home screen.
- AC-2: Previously loaded standings/history viewable offline (read-only cache).
- AC-3: Writes require connectivity; clear message shown when offline.

### FR-9 — Shareable link
- AC-1: A link (optionally with `?table=<id>`) opens the app straight to a table's standings.

## 5. Non-Functional Requirements
- **Lightweight & fast:** minimal deps; quick load on mobile data.
- **Frictionless:** view and add with no login; few taps to record a night.
- **Free / zero infra cost:** static frontend hosting + Google Sheet + Apps Script (all free tiers).
- **Owner-controlled data:** data lives in the group's own Google Sheet (also hand-editable).
- **Responsive:** mobile-first; usable at the table on a phone.

## 6. Out of Scope (v1)
- Real accounts / per-user permissions (open edit by design).
- "Bring your own sheet" multi-group onboarding for outside groups.
- Buy-in/cash-out levels, hand histories, stakes/game-type analytics.
- Real-money transactions or payments.

## 7. Future / Expansion
- Optional shared **edit passcode** per table if open editing becomes a problem.
- Charts/trends over time.
- Bring-your-own-sheet onboarding for other groups.
