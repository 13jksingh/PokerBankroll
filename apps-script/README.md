# Backend setup — Google Apps Script (one-time, ~5 min)

This is the database + API for PokerBankroll. Everything is free and the data lives in **your**
Google Sheet. No one needs to log in to view or add results.

## Steps

1. **Create a Google Sheet**
   - Go to <https://sheets.google.com> and create a new blank spreadsheet.
   - Name it e.g. `PokerBankroll Data`. (Tabs are created automatically — you don't need to add them.)

2. **Add the script**
   - In the sheet: **Extensions → Apps Script**.
   - Delete any sample code, then paste the full contents of [`Code.gs`](./Code.gs).
   - Click **Save** (disk icon).

3. **Deploy as a Web App**
   - Click **Deploy → New deployment**.
   - Gear icon → **Web app**.
   - **Description:** PokerBankroll API
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**
   - Click **Deploy**, authorize when prompted (allow access to your sheet).
   - Copy the **Web app URL** — it ends in `/exec`.

4. **Point the app at it**
   - In the project root, create a file named `.env`:
     ```
     VITE_API_URL=https://script.google.com/macros/s/XXXXXXXX/exec
     ```
   - Restart the dev server (`npm run dev`).

5. **First use**
   - Open the app, click **+ New table**, name it (e.g. "Friday Game").
   - Add a night under **Add** — enter each player's net; it must balance to zero.

## Updating the script later
After editing `Code.gs`, do **Deploy → Manage deployments → Edit → Version: New version → Deploy**
so the `/exec` URL serves the new code.

## Notes
- "Who has access: Anyone" means anyone with the app/URL can read and write — same trust level as
  your group chat. A per-table edit passcode can be added later if needed.
- You can always open the Google Sheet directly to inspect or correct data by hand.
- Multiple poker tables live in the same sheet (each row carries a `tableId`).

## Quick test (optional)
```bash
curl "https://script.google.com/macros/s/XXXX/exec?action=bootstrap"
# -> {"ok":true,"data":{"tables":[],"players":[],"sessions":[],"results":[]}}
```

## One-time WhatsApp history import (JAcK)

The first ~6 weeks of results were recorded in the WhatsApp group, not the app.
They've been extracted and validated into [`history-data.json`](./history-data.json)
(13 nights, 02 May–10 Jun; 13 Jun is omitted because it's already in the app).

The original hand-recorded nightly tallies didn't all sum to zero (chips left on
the table / under-reported losses). Each night's leftover imbalance has been
**divided equally among that night's players** so every night is a true zero-sum
game. The balanced nets are in `results`; the exact chat numbers are kept in
`rawResults` for audit. The importer uploads via the normal `addSession` path —
no special backend flag is needed.

**To run the import:**

1. Make sure the latest `Code.gs` is deployed (only needed if you changed it).
2. Preview first (uploads nothing):
   ```bash
   node apps-script/import-history.mjs --dry-run
   ```
3. Upload for real:
   ```bash
   node apps-script/import-history.mjs
   ```

The script auto-creates any missing players and is **safe to re-run** — it skips
any night (matched by date + player set) that already exists, so it won't create
duplicates.

> ⚠️ Review item: the **17 May** night lists `Prabhjot −1880`, but the group's
> published totals only reconcile if that entry is excluded/relabeled. It's
> imported as written — edit that one session in the app if it was a different
> player.

