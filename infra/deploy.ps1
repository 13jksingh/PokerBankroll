param(
  [string]$ResourceGroup = 'pokerbankroll-prod-rg',
  [string]$Location = 'centralindia',
  [string]$Suffix = '2880e4',
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-f0-9]{64}$')]
  [string]$PinHash,
  [string]$AllowedOrigins = 'https://13jksingh.github.io,http://localhost:5173'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$cosmosAccount = "pokerbankroll-$Suffix"
$storageAccount = "pokerbankroll$Suffix"
$functionApp = "pokerbankroll-api-$Suffix"

az group create `
  --name $ResourceGroup `
  --location $Location `
  --tags application=PokerBankroll environment=production `
  --output none

az cosmosdb create `
  --name $cosmosAccount `
  --resource-group $ResourceGroup `
  --locations regionName=$Location failoverPriority=0 isZoneRedundant=False `
  --enable-free-tier true `
  --default-consistency-level Session `
  --tags application=PokerBankroll environment=production `
  --output none

az cosmosdb sql database create `
  --account-name $cosmosAccount `
  --resource-group $ResourceGroup `
  --name pokerbankroll `
  --throughput 1000 `
  --output none

az cosmosdb sql container create `
  --account-name $cosmosAccount `
  --resource-group $ResourceGroup `
  --database-name pokerbankroll `
  --name data `
  --partition-key-path /tableId `
  --output none

az storage account create `
  --name $storageAccount `
  --resource-group $ResourceGroup `
  --location $Location `
  --sku Standard_LRS `
  --kind StorageV2 `
  --min-tls-version TLS1_2 `
  --allow-blob-public-access false `
  --tags application=PokerBankroll environment=production `
  --output none

az functionapp create `
  --resource-group $ResourceGroup `
  --name $functionApp `
  --storage-account $storageAccount `
  --flexconsumption-location $Location `
  --runtime node `
  --runtime-version 22 `
  --tags application=PokerBankroll environment=production `
  --output none

$endpoint = az cosmosdb show `
  --name $cosmosAccount `
  --resource-group $ResourceGroup `
  --query documentEndpoint `
  --output tsv
$key = az cosmosdb keys list `
  --name $cosmosAccount `
  --resource-group $ResourceGroup `
  --type keys `
  --query primaryMasterKey `
  --output tsv

az functionapp config appsettings set `
  --resource-group $ResourceGroup `
  --name $functionApp `
  --settings `
    "COSMOS_ENDPOINT=$endpoint" `
    "COSMOS_KEY=$key" `
    COSMOS_DATABASE=pokerbankroll `
    COSMOS_CONTAINER=data `
    "EDIT_PIN_HASH=$PinHash" `
    "ALLOWED_ORIGINS=$AllowedOrigins" `
  --output none

az functionapp update `
  --resource-group $ResourceGroup `
  --name $functionApp `
  --set httpsOnly=true `
  --output none

Write-Host "Provisioned https://$functionApp.azurewebsites.net/api/poker"
