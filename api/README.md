# PokerBankroll Azure API

TypeScript Azure Functions v4 API backed by Azure Cosmos DB for NoSQL.

## Production resources

- Resource group: `pokerbankroll-prod-rg`
- Region: `centralindia`
- Function app: `pokerbankroll-api-2880e4`
- Cosmos account: `pokerbankroll-2880e4` (lifetime free tier)
- Database/container: `pokerbankroll/data`
- Partition key: `/tableId`
- API: `https://pokerbankroll-api-2880e4.azurewebsites.net/api/poker`

The API preserves the previous Apps Script envelope and actions, so the React frontend only needs a
different `VITE_API_URL`.

## Local development

```powershell
npm ci --prefix api
npm run build --prefix api
npm test --prefix api
```

Copy `local.settings.example.json` to `local.settings.json` and supply local secrets before running
Azure Functions Core Tools. Never commit `local.settings.json`.

`EDIT_PIN_HASH` is the lowercase SHA-256 hex digest of the four-digit organizer PIN. The plain PIN
is never stored in Azure.

## Data model

All records are stored in one container and partitioned by `tableId`. Document types are `table`,
`player`, `session`, `result`, `buyIn`, `wallet`, and `walletTransaction`. Mutations affecting
multiple documents use Cosmos transactional batches within the table partition.

Tables opt into either `legacy` or `wallet` mode when created. Existing imported tables have no mode
and remain legacy. Wallet tables define a constant `chipsPerRupee` and `defaultBuyIn`. A mutable
wallet balance projection uses optimistic concurrency to prevent overspending, while every movement
is also appended to the immutable transaction ledger.

Anonymous bootstrap responses intentionally exclude wallet balances and transactions. The frontend
retrieves them through the PIN-protected `walletBootstrap` action and never persists them to its
offline cache.

Wallet transaction types:

- `top_up` / `cash_out` for organizer cash movements.
- `buy_in` / `buy_out` for live-night play.
- `buy_in_adjustment`, `buy_in_reversal`, `buy_out_reversal`, and `session_reversal` for immutable
  correction history.

Financial commands use client operation IDs stored as command documents in the same transactional
batch. Identical retries return the original result; reusing an operation ID with changed inputs is
rejected.

Table deletion requires the exact table name. The API first marks the table as deleting so all
concurrent mutations fail their ETag guard, hides the table from bootstrap, deletes other partition
documents in resumable batches, and removes the tombstone last.

## Importing an Apps Script export

The import is idempotent and validates duplicate IDs, references, and zero-sum closed sessions:

```powershell
$env:COSMOS_ENDPOINT = '<account endpoint>'
$env:COSMOS_KEY = '<account key>'
node api\scripts\import-bootstrap.mjs .\bootstrap.json
Remove-Item Env:COSMOS_ENDPOINT,Env:COSMOS_KEY
```

## Deployment

Build the API, package `host.json`, `package.json`, `package-lock.json`, `dist/`, and production
`node_modules/` at the ZIP root, then deploy:

```powershell
az functionapp deployment source config-zip `
  --resource-group pokerbankroll-prod-rg `
  --name pokerbankroll-api-2880e4 `
  --src api-deploy.zip
```

## Rollback

The Google Apps Script deployment and Sheet are retained. To roll the frontend back, restore the
GitHub `VITE_API_URL` secret to the Apps Script `/exec` endpoint and rerun `deploy.yml`. Any writes
made after the Azure cutover must be reconciled before rollback.
