// ─── Lettura delle email da Outlook classico installato sul PC ───
// Usa l'automazione COM di Outlook tramite PowerShell: nessun permesso
// Microsoft 365 né amministratore. Non funziona con il "nuovo Outlook".
'use strict'

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

function psStringa(v) {
  return `'${String(v ?? '').replace(/'/g, "''")}'`
}

// Esegue uno script PowerShell. Le righe "@@P@@testo" sono messaggi di avanzamento
// (passati a onProgresso mentre lo script lavora); il resto dell'output è il risultato.
function eseguiPowerShell(script, timeoutMs = 180000, onProgresso = null) {
  const completo = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Scrivi-Avanzamento([string]$t) { [Console]::Out.WriteLine('@@P@@' + $t); [Console]::Out.Flush() }
function Scrivi-Risultato([string]$t) { [Console]::Out.WriteLine($t); [Console]::Out.Flush() }
try {
${script}
} catch {
  Scrivi-Risultato ('@@ERRORE@@' + $_.Exception.Message)
  exit 1
}`
  const codificato = Buffer.from(completo, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificato],
      { windowsHide: true })
    let resto = ''
    let errOut = ''
    const risultato = []
    let errore = null
    const gestisciRiga = (riga) => {
      riga = riga.replace(/\r$/, '')
      if (riga.startsWith('@@P@@')) { if (onProgresso) onProgresso(riga.slice(5)) }
      else if (riga.startsWith('@@ERRORE@@')) errore = riga.slice(10).trim()
      else if (riga.trim()) risultato.push(riga)
    }
    const timer = setTimeout(() => { errore = 'timed out'; ps.kill() }, timeoutMs)
    ps.stdout.setEncoding('utf8')
    ps.stdout.on('data', (d) => {
      resto += d
      const righe = resto.split('\n')
      resto = righe.pop()
      righe.forEach(gestisciRiga)
    })
    ps.stderr.setEncoding('utf8')
    ps.stderr.on('data', (d) => { errOut += d })
    ps.on('error', (err) => { clearTimeout(timer); reject(new Error(traduciErrore(err.message))) })
    ps.on('close', (code) => {
      clearTimeout(timer)
      if (resto) gestisciRiga(resto)
      if (errore) return reject(new Error(traduciErrore(errore)))
      if (code !== 0 && risultato.length === 0) return reject(new Error(traduciErrore(errOut.trim() || `PowerShell terminato con codice ${code}`)))
      resolve(risultato.join('\n').trim())
    })
  })
}

function traduciErrore(msg) {
  if (/80040154|Class not registered|classe non registrata|Impossibile recuperare la class factory COM/i.test(msg)) {
    return 'Outlook classico non è installato su questo PC (il "nuovo Outlook" non è supportato)'
  }
  if (/timed out|ETIMEDOUT|SIGTERM/i.test(msg)) return 'Outlook non ha risposto in tempo: controlla che sia aperto e non mostri finestre di avviso'
  return msg || 'Errore sconosciuto di Outlook'
}

function comeArray(v) {
  if (v === null || v === undefined || v === '') return []
  return Array.isArray(v) ? v : [v]
}

const APRI_OUTLOOK = `
$ol = New-Object -ComObject Outlook.Application
$ns = $ol.GetNamespace('MAPI')
$inbox = $ns.GetDefaultFolder(6)
`

/** Verifica che Outlook classico sia utilizzabile; restituisce l'account e quante mail del mittente ci sono. */
async function prova(mittente) {
  const out = await eseguiPowerShell(`${APRI_OUTLOOK}
$mitt = ${psStringa(String(mittente || '').toLowerCase())}
$n = 0
foreach ($it in @($inbox.Items.Restrict("[SenderEmailAddress] = '" + $mitt.Replace("'", "''") + "'"))) { $n++ }
$account = ''
try { $account = $ns.Accounts.Item(1).SmtpAddress } catch {}
Scrivi-Risultato ([pscustomobject]@{ account = $account; trovate = $n } | ConvertTo-Json -Compress)
`, 60000)
  return JSON.parse(out)
}

/**
 * Mail della Posta in arrivo del mittente con allegati .zip.
 * Gli zip vengono salvati in cartellaDest; restituisce [{ id, oggetto, ricevuta, zips: [{ nome, dati }] }]
 */
async function messaggiConZip(mittente, cartellaDest, onProgresso) {
  fs.mkdirSync(cartellaDest, { recursive: true })
  const out = await eseguiPowerShell(`Scrivi-Avanzamento 'Avvio di Outlook…'
${APRI_OUTLOOK}
Scrivi-Avanzamento ('Outlook pronto — cartella: ' + $inbox.Name)
$mitt = ${psStringa(String(mittente || '').toLowerCase())}
$dest = ${psStringa(cartellaDest)}
$items = @($inbox.Items.Restrict("[SenderEmailAddress] = '" + $mitt.Replace("'", "''") + "'"))
Scrivi-Avanzamento ('Email di ' + $mitt + ' nella Posta in arrivo: ' + $items.Count)
$risultati = New-Object System.Collections.ArrayList
$n = 0
$i = 0
foreach ($it in $items) {
  $i++
  if ($it.Class -ne 43) { continue }
  if ([string]$it.SenderEmailAddress -ne $mitt -and ([string]$it.SenderEmailAddress).ToLower() -ne $mitt) { continue }
  $file = New-Object System.Collections.ArrayList
  foreach ($a in @($it.Attachments)) {
    if ([string]$a.FileName -match '\\.zip$') {
      $n++
      $p = Join-Path $dest (('{0:D3}_' -f $n) + ([string]$a.FileName -replace '[\\\\/:*?"<>|]', '_'))
      $a.SaveAsFile($p)
      [void]$file.Add([pscustomobject]@{ nome = [string]$a.FileName; percorso = $p })
    }
  }
  Scrivi-Avanzamento ('Email ' + $i + ' di ' + $items.Count + ': ' + [string]$it.Subject + ' — ' + $file.Count + ' zip')
  if ($file.Count -eq 0) { continue }
  [void]$risultati.Add([pscustomobject]@{
    id = [string]$it.EntryID
    oggetto = [string]$it.Subject
    ricevuta = $it.ReceivedTime.ToString('s')
    file = @($file)
  })
}
Scrivi-Risultato (ConvertTo-Json -InputObject @($risultati) -Depth 5 -Compress)
`, 180000, onProgresso)
  const lista = comeArray(out ? JSON.parse(out) : [])
  return lista
    .map(m => ({
      id: m.id,
      oggetto: m.oggetto || '',
      ricevuta: m.ricevuta || '',
      zips: comeArray(m.file).map(f => ({ nome: f.nome, dati: fs.readFileSync(f.percorso) })),
    }))
    .sort((a, b) => String(a.ricevuta).localeCompare(String(b.ricevuta)))
}

/** Sposta le mail in una sottocartella della Posta in arrivo (creata se manca). */
async function spostaInCartella(ids, nomeCartella) {
  if (!ids || ids.length === 0) return { spostati: 0, errori: [] }
  const out = await eseguiPowerShell(`${APRI_OUTLOOK}
$nome = ${psStringa(nomeCartella)}
$cartella = $null
foreach ($f in @($inbox.Folders)) { if ($f.Name -eq $nome) { $cartella = $f; break } }
if (-not $cartella) { $cartella = $inbox.Folders.Add($nome) }
$ids = @(${ids.map(psStringa).join(', ')})
$spostati = 0
$errori = New-Object System.Collections.ArrayList
foreach ($id in $ids) {
  try { $m = $ns.GetItemFromID($id); [void]$m.Move($cartella); $spostati++ }
  catch { [void]$errori.Add($_.Exception.Message) }
}
Scrivi-Risultato ([pscustomobject]@{ spostati = $spostati; errori = @($errori) } | ConvertTo-Json -Compress)
`)
  const r = JSON.parse(out)
  return { spostati: r.spostati || 0, errori: comeArray(r.errori) }
}

function escHtml(t) {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Apre in Outlook una nuova email già compilata (non la invia).
 * La firma predefinita di Outlook viene mantenuta sotto il testo.
 */
async function creaBozza({ a = [], cc = [], oggetto = '', testo = '', allegati = [] }) {
  const html = '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt">'
    + escHtml(testo).replace(/\r?\n/g, '<br>') + '</div><br>'
  const out = await eseguiPowerShell(`${APRI_OUTLOOK}
$mail = $ol.CreateItem(0)
$mail.To = ${psStringa(a.join('; '))}
$mail.CC = ${psStringa(cc.join('; '))}
$mail.Subject = ${psStringa(oggetto)}
foreach ($p in @(${allegati.length ? allegati.map(psStringa).join(', ') : ''})) { if ($p) { [void]$mail.Attachments.Add($p) } }
$insp = $mail.GetInspector
$mail.HTMLBody = ${psStringa(html)} + $mail.HTMLBody
$mail.Display($false)
Scrivi-Risultato '{"ok":true}'
`, 60000)
  return JSON.parse(out || '{"ok":true}')
}

/** Cerca in Posta inviata una email con questo oggetto spedita dopo "dalle" (YYYY-MM-DDTHH:mm:ss, ora locale). */
async function cercaInviata(oggetto, dalle) {
  const out = await eseguiPowerShell(`${APRI_OUTLOOK}
$sent = $ns.GetDefaultFolder(5)
$items = $sent.Items
$items.Sort('[SentOn]', $true)
$ogg = ${psStringa(oggetto)}
$dalle = [datetime]::ParseExact(${psStringa(dalle)}, 'yyyy-MM-ddTHH:mm:ss', [Globalization.CultureInfo]::InvariantCulture)
$k = 0
$trovata = $null
foreach ($it in $items) {
  $k++
  if ($k -gt 40) { break }
  if ($it.Class -ne 43) { continue }
  if ($it.SentOn -lt $dalle) { break }
  if ([string]$it.Subject -eq $ogg) { $trovata = $it; break }
}
if ($trovata) { Scrivi-Risultato ([pscustomobject]@{ trovata = $true; inviataIl = $trovata.SentOn.ToString('s') } | ConvertTo-Json -Compress) }
else { Scrivi-Risultato '{"trovata":false}' }
`, 60000)
  return JSON.parse(out || '{"trovata":false}')
}

module.exports = { prova, messaggiConZip, spostaInCartella, creaBozza, cercaInviata }
