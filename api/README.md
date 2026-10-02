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
`player`, `session`, `result`, and `buyIn`. Mutations affecting multiple documents use Cosmos
transactional batches within the table partition.

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
