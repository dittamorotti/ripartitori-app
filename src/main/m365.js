// ─── Collegamento a Microsoft 365 (posta) tramite Microsoft Graph ───
// Accesso OAuth 2.0 con PKCE in una finestra di login Microsoft.
// L'app non vede mai la password: riceve un token che viene salvato
// cifrato con la protezione di Windows (safeStorage) e rinnovato da solo.
'use strict'

const { BrowserWindow, safeStorage, app } = require('electron')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// Registrazione app "Ripartitori QUNDIS" in Microsoft Entra (tenant Morotti Paolo).
// Non sono segreti: identificano l'app, l'accesso richiede comunque il login.
const CLIENT_ID = 'f3ee3f21-3e4c-462e-a0fb-006868b14647'
const TENANT_ID = '27a7dfed-1652-40cc-b834-bc9d270f6f03'
const REDIRECT_URI = 'http://localhost'
const SCOPES = 'offline_access User.Read Mail.ReadWrite'
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0`
const GRAPH = 'https://graph.microsoft.com/v1.0'

let tokenCache = null   // { accessToken, scadenza }

function fileToken() {
  return path.join(app.getPath('userData'), 'm365.dat')
}

// ─── Salvataggio cifrato del collegamento ────────────────────
function leggiSalvato() {
  try {
    if (!fs.existsSync(fileToken())) return null
    const raw = fs.readFileSync(fileToken())
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

function scriviSalvato(dati) {
  const json = JSON.stringify(dati)
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Cifratura di Windows non disponibile: impossibile salvare il collegamento in modo sicuro')
  fs.writeFileSync(fileToken(), safeStorage.encryptString(json))
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function chiamaToken(parametri) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPES, ...parametri }).toString(),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json.error_description ? json.error_description.split('\r\n')[0] : `HTTP ${res.status}`
    const err = new Error(msg)
    err.codice = json.error
    throw err
  }
  return json
}

function memorizza(json, account) {
  tokenCache = { accessToken: json.access_token, scadenza: Date.now() + (json.expires_in - 120) * 1000 }
  const salvato = leggiSalvato() || {}
  scriviSalvato({
    refreshToken: json.refresh_token || salvato.refreshToken,
    account: account || salvato.account || '',
  })
}

// ─── Login interattivo ───────────────────────────────────────
function collega(finestraPadre) {
  return new Promise((resolve, reject) => {
    const verifier = base64url(crypto.randomBytes(32))
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
    const state = base64url(crypto.randomBytes(16))
    const url = `${AUTH_BASE}/authorize?` + new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      response_mode: 'query',
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString()

    const win = new BrowserWindow({
      width: 520, height: 700,
      parent: finestraPadre || undefined,
      modal: !!finestraPadre,
      title: 'Accesso a Microsoft 365',
      autoHideMenuBar: true,
      webPreferences: { partition: 'm365login', nodeIntegration: false, contextIsolation: true },
    })

    let concluso = false
    const fine = (err, valore) => {
      if (concluso) return
      concluso = true
      if (!win.isDestroyed()) win.close()
      err ? reject(err) : resolve(valore)
    }

    const intercetta = async (event, navUrl) => {
      if (!navUrl.startsWith(REDIRECT_URI)) return
      event.preventDefault()
      const u = new URL(navUrl)
      if (u.searchParams.get('error')) {
        return fine(new Error(u.searchParams.get('error_description') || u.searchParams.get('error')))
      }
      if (u.searchParams.get('state') !== state) return fine(new Error('Risposta di accesso non valida'))
      try {
        const json = await chiamaToken({
          grant_type: 'authorization_code',
          code: u.searchParams.get('code'),
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier,
        })
        tokenCache = { accessToken: json.access_token, scadenza: Date.now() + (json.expires_in - 120) * 1000 }
        const me = await graph('/me?$select=mail,userPrincipalName')
        memorizza(json, me.mail || me.userPrincipalName || '')
        fine(null, { collegato: true, account: me.mail || me.userPrincipalName || '' })
      } catch (err) {
        fine(err)
      }
    }

    win.webContents.on('will-redirect', intercetta)
    win.webContents.on('will-navigate', intercetta)
    win.on('closed', () => fine(new Error('Accesso annullato')))
    win.loadURL(url)
  })
}

function scollega() {
  tokenCache = null
  try { if (fs.existsSync(fileToken())) fs.unlinkSync(fileToken()) } catch {}
  return { collegato: false }
}

function stato() {
  const s = leggiSalvato()
  return s && s.refreshToken ? { collegato: true, account: s.account || '' } : { collegato: false }
}

async function accessToken() {
  if (tokenCache && Date.now() < tokenCache.scadenza) return tokenCache.accessToken
  const s = leggiSalvato()
  if (!s || !s.refreshToken) throw new Error('Microsoft 365 non collegato')
  try {
    const json = await chiamaToken({ grant_type: 'refresh_token', refresh_token: s.refreshToken })
    memorizza(json)
    return tokenCache.accessToken
  } catch (err) {
    if (err.codice === 'invalid_grant') {
      scollega()
      throw new Error('Il collegamento a Microsoft 365 è scaduto: ricollegalo da Impostazioni')
    }
    throw err
  }
}

// ─── Chiamate Microsoft Graph ────────────────────────────────
async function graph(percorso, opzioni = {}) {
  const token = await accessToken()
  const url = percorso.startsWith('http') ? percorso : GRAPH + percorso
  const res = await fetch(url, {
    method: opzioni.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opzioni.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opzioni.body ? JSON.stringify(opzioni.body) : undefined,
  })
  if (res.status === 204) return {}
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error?.message || `Microsoft Graph: HTTP ${res.status}`)
  return json
}

function escOData(s) {
  return String(s).replace(/'/g, "''")
}

/** Messaggi della Posta in arrivo di un mittente, con allegati. */
async function messaggiDaMittente(mittente, massimo = 100) {
  const filtro = `from/emailAddress/address eq '${escOData(mittente)}' and hasAttachments eq true`
  let url = `/me/mailFolders/inbox/messages?$filter=${encodeURIComponent(filtro)}&$select=id,subject,receivedDateTime&$top=50`
  const risultati = []
  while (url && risultati.length < massimo) {
    const json = await graph(url)
    risultati.push(...(json.value || []))
    url = json['@odata.nextLink'] || null
  }
  return risultati.sort((a, b) => String(a.receivedDateTime).localeCompare(String(b.receivedDateTime)))
}

/** Allegati .zip di un messaggio, già decodificati. */
async function allegatiZip(messageId) {
  const json = await graph(`/me/messages/${encodeURIComponent(messageId)}/attachments`)
  return (json.value || [])
    .filter(a => a['@odata.type'] === '#microsoft.graph.fileAttachment' && /\.zip$/i.test(a.name || '') && a.contentBytes)
    .map(a => ({ nome: a.name, dati: Buffer.from(a.contentBytes, 'base64') }))
}

/** Sposta i messaggi in una sottocartella della Posta in arrivo (creata se manca). */
async function spostaInCartella(messageIds, nomeCartella) {
  const filtro = `displayName eq '${escOData(nomeCartella)}'`
  const trovate = await graph(`/me/mailFolders/inbox/childFolders?$filter=${encodeURIComponent(filtro)}`)
  let cartella = (trovate.value || [])[0]
  if (!cartella) {
    cartella = await graph('/me/mailFolders/inbox/childFolders', { method: 'POST', body: { displayName: nomeCartella } })
  }
  let spostati = 0
  const errori = []
  for (const id of messageIds) {
    try {
      await graph(`/me/messages/${encodeURIComponent(id)}/move`, { method: 'POST', body: { destinationId: cartella.id } })
      spostati++
    } catch (err) {
      errori.push(err.message)
    }
  }
  return { spostati, errori }
}

module.exports = { collega, scollega, stato, messaggiDaMittente, allegatiZip, spostaInCartella }
