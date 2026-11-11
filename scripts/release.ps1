# ─── Rilascio di una nuova versione di RipartitoriApp ─────────────────────
# Uso (dal terminale di VS Code, nella cartella del progetto):
#   npm run release              → pubblica la versione scritta in package.json
#   npm run release -- 3.1.0     → imposta la versione 3.1.0 e la pubblica
#
# Il token GitHub va salvato UNA SOLA VOLTA nelle variabili di Windows:
#   [Environment]::SetEnvironmentVariable('GH_TOKEN', 'ghp_...', 'User')
# poi chiudi e riapri VS Code.

param([string]$Versione = '')

# I comandi esterni (git, npm) scrivono anche su stderr: gli errori si controllano con $LASTEXITCODE
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Ferma($messaggio) {
  Write-Host ''
  Write-Host "✕ $messaggio" -ForegroundColor Red
  exit 1
}
function Passo($messaggio) {
  Write-Host ''
  Write-Host "▶ $messaggio" -ForegroundColor Cyan
}

# 1. Token GitHub
if (-not $env:GH_TOKEN) { $env:GH_TOKEN = [Environment]::GetEnvironmentVariable('GH_TOKEN', 'User') }
if (-not $env:GH_TOKEN) {
  Ferma "Token GitHub non trovato. Eseguilo una volta:  [Environment]::SetEnvironmentVariable('GH_TOKEN', 'ghp_...', 'User')  e riapri VS Code."
}

# 2. Nessuna modifica non salvata in Git
$modifiche = git status --porcelain
if ($modifiche) {
  Write-Host $modifiche
  Ferma 'Ci sono modifiche non salvate in Git: fai prima il commit (git add -A ; git commit -m "...").'
}

# 3. Versione (eventualmente nuova)
if ($Versione) {
  Passo "Imposto la versione $Versione"
  npm version $Versione --no-git-tag-version | Out-Null
  if ($LASTEXITCODE -ne 0) { Ferma "Versione non valida: $Versione (formato 3.1.0)" }
  git add package.json package-lock.json
  git commit -m "Versione $Versione" | Out-Null
}
$versioneAttuale = (Get-Content package.json -Raw | ConvertFrom-Json).version
git fetch --tags --quiet
if (git tag --list "v$versioneAttuale") {
  Ferma "La versione v$versioneAttuale è già stata pubblicata. Usa: npm run release -- <nuova versione>"
}
Write-Host ''
Write-Host "Rilascio della versione $versioneAttuale" -ForegroundColor Green

# 4. Test automatici
Passo 'Test del parser XML'
npm test
if ($LASTEXITCODE -ne 0) { Ferma 'I test non sono passati: rilascio annullato.' }

# 5. Build e pubblicazione su GitHub
Passo 'Compilazione interfaccia'
npx vite build
if ($LASTEXITCODE -ne 0) { Ferma 'Compilazione non riuscita.' }

Passo 'Creazione installer e pubblicazione su GitHub'
npx electron-builder --win --publish always
if ($LASTEXITCODE -ne 0) { Ferma 'Creazione o pubblicazione non riuscita.' }

# 6. Tag e push del codice
Passo 'Salvataggio su GitHub (codice e tag)'
git tag "v$versioneAttuale"
git push
if ($LASTEXITCODE -ne 0) { Ferma 'Push del codice non riuscito (la release su GitHub è comunque pubblicata).' }
git push origin "v$versioneAttuale"

Write-Host ''
Write-Host "✓ Versione $versioneAttuale pubblicata. Le app installate proporranno l'aggiornamento al prossimo avvio." -ForegroundColor Green
