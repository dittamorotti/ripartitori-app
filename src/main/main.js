const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow
let db
let SQL

// ─── Percorso DB configurabile ───────────────────────────────
function getDbPath() {
  const configPath = path.join(app.getPath('userData'), 'db_config.json')
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      if (cfg.dbPath && fs.existsSync(path.dirname(cfg.dbPath))) return cfg.dbPath
    } catch(e) {}
  }
  return path.join(app.getPath('userData'), 'ripartitori.db')
}

function setDbPath(newPath) {
  const configPath = path.join(app.getPath('userData'), 'db_config.json')
  fs.writeFileSync(configPath, JSON.stringify({ dbPath: newPath }))
}

// ─── Percorso archivio import ────────────────────────────────
function getArchivioPath() {
  const imp = queryAllSafe('SELECT valore FROM impostazioni WHERE chiave = ?', ['archivio_path'])
  return imp[0]?.valore || ''
}

function queryAllSafe(sql, params = []) {
  try {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  } catch(e) { return [] }
}

function nomeCartellaCondominio(nome) {
  // Rimuove caratteri non validi per nome cartella Windows
  return nome.replace(/[\/:*?"<>|]/g, '_').trim()
}

function getCartellaCond(nomeCondominio) {
  const base = getArchivioPath()
  if (!base) return null
  return path.join(base, nomeCartellaCondominio(nomeCondominio))
}

function creaCartellaCond(nomeCondominio) {
  const cartella = getCartellaCond(nomeCondominio)
  if (!cartella) return null
  if (!fs.existsSync(cartella)) fs.mkdirSync(cartella, { recursive: true })
  return cartella
}

async function initDatabase() {
  const initSqlJs = require('sql.js')
  SQL = await initSqlJs()
  
  const dbPath = getDbPath()
  const localFallback = path.join(app.getPath('userData'), 'ripartitori.db')
  const isCustomPath = dbPath !== localFallback

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
    if (isCustomPath) fs.writeFileSync(localFallback, fileBuffer)
  } else if (isCustomPath && fs.existsSync(localFallback)) {
    const fileBuffer = fs.readFileSync(localFallback)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`CREATE TABLE IF NOT EXISTS condomini (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    indirizzo TEXT,
    citta TEXT,
    logo_path TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`)
  db.run(`CREATE TABLE IF NOT EXISTS piani (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    condominio_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    FOREIGN KEY (condominio_id) REFERENCES condomini(id)
  );`)
  db.run(`CREATE TABLE IF NOT EXISTS unita (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    piano_id INTEGER NOT NULL,
    proprietario TEXT,
    interno TEXT,
    note TEXT,
    FOREIGN KEY (piano_id) REFERENCES piani(id)
  );`)
  db.run(`CREATE TABLE IF NOT EXISTS ripartitori (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unita_id INTEGER NOT NULL,
    matricola TEXT NOT NULL,
    locale TEXT,
    note TEXT,
    FOREIGN KEY (unita_id) REFERENCES unita(id)
  );`)
  db.run(`CREATE TABLE IF NOT EXISTS impostazioni (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chiave TEXT UNIQUE NOT NULL,
    valore TEXT
  );`)
  
  saveDatabase()
}

function saveDatabase() {
  const dbPath = getDbPath()
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

function queryRun(sql, params = []) {
  db.run(sql, params)
  const res = db.exec('SELECT last_insert_rowid() as id')
  saveDatabase()
  if (res[0]) return res[0].values[0][0]
  return null
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
    title: 'Ripartitori QUNDIS',
  })

  // ─── Finestra Guida XML ───────────────────────────────────────
function createGuidaWindow() {
  const guidaWin = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Guida XML QUNDIS',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    parent: mainWindow,
    modal: false,
  })
  guidaWin.loadFile(path.join(__dirname, 'guida-xml.html'))
  guidaWin.setMenu(null)
}

// ─── Menu applicazione ────────────────────────────────────────
const { Menu } = require('electron')
const menuTemplate = [
  { role: 'fileMenu' },
  { role: 'editMenu' },
  { role: 'viewMenu' },
  { role: 'windowMenu' },
  {
    label: 'Help',
    submenu: [
      {
        label: 'Guida XML QUNDIS',
        accelerator: 'F1',
        click: () => createGuidaWindow()
      }
    ]
  }
]
const menu = Menu.buildFromTemplate(menuTemplate)
Menu.setApplicationMenu(menu)

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist-renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await initDatabase()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Condomini ───────────────────────────────────────────
ipcMain.handle('get-condomini', () => {
  return queryAll('SELECT * FROM condomini ORDER BY nome')
})

ipcMain.handle('add-condominio', (_, data) => {
  return queryRun(
    'INSERT INTO condomini (nome, indirizzo, citta, note) VALUES (?, ?, ?, ?)',
    [data.nome || '', data.indirizzo || '', data.citta || '', data.note || '']
  )
})

ipcMain.handle('update-condominio', (_, data) => {
  db.run(
    'UPDATE condomini SET nome=?, indirizzo=?, citta=?, note=? WHERE id=?',
    [data.nome || '', data.indirizzo || '', data.citta || '', data.note || '', data.id]
  )
  saveDatabase()
  return true
})

ipcMain.handle('delete-condominio', async (_, { id, eliminaArchivio }) => {
  const cond = queryAll('SELECT nome FROM condomini WHERE id = ?', [id])
  const nomeCondominio = cond[0]?.nome || ''
  const piani = queryAll('SELECT id FROM piani WHERE condominio_id = ?', [id])
  piani.forEach(p => {
    const unita = queryAll('SELECT id FROM unita WHERE piano_id = ?', [p.id])
    unita.forEach(u => {
      db.run('DELETE FROM ripartitori WHERE unita_id = ?', [u.id])
    })
    db.run('DELETE FROM unita WHERE piano_id = ?', [p.id])
  })
  db.run('DELETE FROM piani WHERE condominio_id = ?', [id])
  db.run('DELETE FROM condomini WHERE id = ?', [id])
  saveDatabase()
  // Elimina cartella archivio se richiesto
  if (eliminaArchivio && nomeCondominio) {
    const cartella = getCartellaCond(nomeCondominio)
    if (cartella && fs.existsSync(cartella)) {
      fs.rmSync(cartella, { recursive: true, force: true })
    }
  }
  return true
})

// ─── IPC: Piani ───────────────────────────────────────────────
ipcMain.handle('get-piani', (_, condominioId) => {
  return queryAll(`SELECT * FROM piani WHERE condominio_id = ? ORDER BY
  CASE
    WHEN nome LIKE '%Terra%'    THEN 0
    WHEN nome LIKE '%Primo%'    THEN 1
    WHEN nome LIKE '%Secondo%'  THEN 2
    WHEN nome LIKE '%Terzo%'    THEN 3
    WHEN nome LIKE '%Quarto%'   THEN 4
    WHEN nome LIKE '%Quinto%'   THEN 5
    WHEN nome LIKE '%Sesto%'    THEN 6
    WHEN nome LIKE '%Settimo%'  THEN 7
    WHEN nome LIKE '%Ottavo%'   THEN 8
    WHEN nome LIKE '%Nono%'     THEN 9
    WHEN nome LIKE '%Decimo%'   THEN 10
    ELSE 99
  END, nome`, [condominioId])
})

ipcMain.handle('add-piano', (_, data) => {
  return queryRun(
    'INSERT INTO piani (condominio_id, nome) VALUES (?, ?)',
    [data.condominio_id || 0, data.nome || '']
  )
})

ipcMain.handle('update-piano', (_, data) => {
  db.run('UPDATE piani SET nome=? WHERE id=?', [data.nome || '', data.id])
  saveDatabase()
  return true
})

ipcMain.handle('delete-piano', (_, id) => {
  const unita = queryAll('SELECT id FROM unita WHERE piano_id = ?', [id])
  unita.forEach(u => {
    db.run('DELETE FROM ripartitori WHERE unita_id = ?', [u.id])
  })
  db.run('DELETE FROM unita WHERE piano_id = ?', [id])
  db.run('DELETE FROM piani WHERE id = ?', [id])
  saveDatabase()
  return true
})

// ─── IPC: Unità ───────────────────────────────────────────────
ipcMain.handle('get-unita', (_, pianoId) => {
  return queryAll('SELECT * FROM unita WHERE piano_id = ? ORDER BY interno', [pianoId])
})

ipcMain.handle('add-unita', (_, data) => {
  return queryRun(
    'INSERT INTO unita (piano_id, proprietario, interno, note) VALUES (?, ?, ?, ?)',
    [data.piano_id || 0, data.proprietario || '', data.interno || '', data.note || '']
  )
})

ipcMain.handle('update-unita', (_, data) => {
  db.run(
    'UPDATE unita SET proprietario=?, interno=?, note=? WHERE id=?',
    [data.proprietario || '', data.interno || '', data.note || '', data.id]
  )
  saveDatabase()
  return true
})

ipcMain.handle('delete-unita', (_, id) => {
  db.run('DELETE FROM ripartitori WHERE unita_id = ?', [id])
  db.run('DELETE FROM unita WHERE id = ?', [id])
  saveDatabase()
  return true
})

// ─── IPC: Ripartitori ─────────────────────────────────────────
ipcMain.handle('get-ripartitori', (_, unitaId) => {
  return queryAll('SELECT * FROM ripartitori WHERE unita_id = ? ORDER BY locale', [unitaId])
})

ipcMain.handle('add-ripartitore', (_, data) => {
  return queryRun(
    'INSERT INTO ripartitori (unita_id, matricola, locale, note) VALUES (?, ?, ?, ?)',
    [data.unita_id || 0, data.matricola || '', data.locale || '', data.note || '']
  )
})

ipcMain.handle('update-ripartitore', (_, data) => {
  db.run(
    'UPDATE ripartitori SET matricola=?, locale=?, note=? WHERE id=?',
    [data.matricola || '', data.locale || '', data.note || '', data.id]
  )
  saveDatabase()
  return true
})

ipcMain.handle('delete-ripartitore', (_, id) => {
  db.run('DELETE FROM ripartitori WHERE id = ?', [id])
  saveDatabase()
  return true
})

// ─── IPC: Impostazioni ────────────────────────────────────────
ipcMain.handle('get-impostazioni', () => {
  const rows = queryAll('SELECT chiave, valore FROM impostazioni')
  const result = {}
  rows.forEach(row => { result[row.chiave] = row.valore })
  return result
})

ipcMain.handle('set-impostazione', (_, chiave, valore) => {
  db.run(
    'INSERT OR REPLACE INTO impostazioni (chiave, valore) VALUES (?, ?)',
    [chiave || '', valore || '']
  )
  saveDatabase()
  return true
})

// ─── IPC: File dialog ─────────────────────────────────────────
ipcMain.handle('open-file-dialog', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'XML Files', extensions: ['xml'] }]
  })
  return result.filePaths[0] || null
})

// ─── IPC: Leggi file ──────────────────────────────────────────
ipcMain.handle('read-file', (_, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return { success: true, content }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: Import CSV ──────────────────────────────────────────
ipcMain.handle('import-csv', (_, { nomeCondominio, righe }) => {
  try {
    const primaRiga = righe[0]
    const indirizzo = primaRiga.indirizzo || ''
    const citta = primaRiga.citta || ''

    // Ordina i piani con la stessa logica della query get-piani
    const ordinePiani = { 'terra': 0, 'primo': 1, 'secondo': 2, 'terzo': 3, 'quarto': 4, 'quinto': 5, 'sesto': 6, 'settimo': 7, 'ottavo': 8, 'nono': 9, 'decimo': 10 }
    function ordinePiano(nome) {
      const n = (nome || '').toLowerCase()
      for (const [k, v] of Object.entries(ordinePiani)) if (n.includes(k)) return v
      return 99
    }

    // Raggruppa piani e unità prima di toccare il DB
    const pianiMap = {}
    righe.forEach(r => {
      const piano = r.piano || 'Piano Non Specificato'
      if (!pianiMap[piano]) pianiMap[piano] = []
      pianiMap[piano].push(r)
    })
    const pianiOrdinati = Object.entries(pianiMap).sort((a, b) => ordinePiano(a[0]) - ordinePiano(b[0]))

    // ─── Transazione: tutte le insert in un colpo solo ────────
    db.run('BEGIN')
    let condominioId
    try {
      db.run(
        'INSERT INTO condomini (nome, indirizzo, citta, note) VALUES (?, ?, ?, ?)',
        [nomeCondominio, indirizzo, citta, '']
      )
      condominioId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]

      pianiOrdinati.forEach(([nomePiano, righeP]) => {
        db.run('INSERT INTO piani (condominio_id, nome) VALUES (?, ?)', [condominioId, nomePiano])
        const pianoId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]

        const unitaMap = {}
        righeP.forEach(r => {
          const key = r.proprietario || 'Sconosciuto'
          if (!unitaMap[key]) unitaMap[key] = []
          unitaMap[key].push(r)
        })

        Object.entries(unitaMap).forEach(([proprietario, righeU]) => {
          const inquilino = righeU[0].inquilino || ''
          const nomeUnita = inquilino ? `${proprietario} / ${inquilino}` : proprietario
          db.run(
            'INSERT INTO unita (piano_id, proprietario, interno, note) VALUES (?, ?, ?, ?)',
            [pianoId, nomeUnita, righeU[0].interno || '', inquilino]
          )
          const unitaId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
          righeU.forEach(r => {
            db.run(
              'INSERT INTO ripartitori (unita_id, matricola, locale, note) VALUES (?, ?, ?, ?)',
              [unitaId, r.matricola || '', r.locale || '', '']
            )
          })
        })
      })

      db.run('COMMIT')
    } catch (err) {
      db.run('ROLLBACK')
      throw err
    }

    // Una sola write su disco dopo il COMMIT
    saveDatabase()
    // Crea cartella archivio per il condominio
    try { creaCartellaCond(nomeCondominio) } catch(e) {}
    return { success: true, condominioId }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: Archivio Import XML ────────────────────────────────
ipcMain.handle('archivia-xml', (_, { nomeCondominio, filePath, dataLettura, sovrascrivi }) => {
  try {
    const cartella = creaCartellaCond(nomeCondominio)
    if (!cartella) return { success: false, error: 'Percorso archivio non configurato nelle Impostazioni.' }
    const dataStr = dataLettura || new Date().toISOString().slice(0, 10)
    const destName = `lettura_${dataStr}.xml`
    const destPath = path.join(cartella, destName)
    // Se esiste e non è stata chiesta sovrascrittura, avvisa il frontend
    if (fs.existsSync(destPath) && !sovrascrivi) {
      return { success: false, esistente: true, destPath, destName }
    }
    fs.copyFileSync(filePath, destPath)
    return { success: true, destPath, destName }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-storico-xml', (_, { nomeCondominio }) => {
  try {
    const cartella = getCartellaCond(nomeCondominio)
    if (!cartella || !fs.existsSync(cartella)) return { success: true, files: [] }
    const files = fs.readdirSync(cartella)
      .filter(f => f.endsWith('.xml'))
      .map(f => {
        const fullPath = path.join(cartella, f)
        const stat = fs.statSync(fullPath)
        return { nome: f, path: fullPath, size: stat.size, modified: stat.mtime.toISOString() }
      })
      .sort((a, b) => b.modified.localeCompare(a.modified))
    return { success: true, files }
  } catch (err) {
    return { success: false, error: err.message, files: [] }
  }
})

ipcMain.handle('apri-cartella-archivio', (_, { nomeCondominio }) => {
  try {
    const cartella = getCartellaCond(nomeCondominio)
    if (!cartella) return { success: false, error: 'Percorso archivio non configurato.' }
    if (!fs.existsSync(cartella)) fs.mkdirSync(cartella, { recursive: true })
    require('electron').shell.openPath(cartella)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-archivio-path', () => {
  return getArchivioPath()
})

ipcMain.handle('set-archivio-path', (_, percorso) => {
  try {
    if (!fs.existsSync(percorso)) return { success: false, error: 'Cartella non trovata: ' + percorso }
    db.run('INSERT OR REPLACE INTO impostazioni (chiave, valore) VALUES (?, ?)', ['archivio_path', percorso])
    saveDatabase()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: Cerca matricola nel DB ──────────────────────────────
ipcMain.handle('cerca-matricola', (_, matricola) => {
  const rows = queryAll(`
    SELECT 
      r.matricola, r.locale, r.note as r_note,
      u.id as unita_id, u.proprietario, u.interno, u.note as u_note,
      p.id as piano_id, p.nome as piano,
      c.id as condominio_id, c.nome as condominio, c.indirizzo, c.citta
    FROM ripartitori r
    JOIN unita u ON r.unita_id = u.id
    JOIN piani p ON u.piano_id = p.id
    JOIN condomini c ON p.condominio_id = c.id
    WHERE r.matricola = ?
  `, [matricola])
  return rows[0] || null
})

// ─── IPC: Genera PDF ──────────────────────────────────────────
ipcMain.handle('genera-pdf', async (_, { condominiData, modalita, unitaSelezionata, unitaSelezionate }) => {
  try {
    const savePath = await dialog.showSaveDialog(mainWindow, {
      title: 'Salva PDF',
      defaultPath: `Lettura_Ripartitori_${new Date().toLocaleDateString('it-IT').replace(/\//g, '-')}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    })
    if (savePath.canceled || !savePath.filePath) return { success: false }

    const imp = queryAll('SELECT chiave, valore FROM impostazioni')
    const impostazioni = {}
    imp.forEach(r => { impostazioni[r.chiave] = r.valore })

    const intestazione = impostazioni.intestazione || 'Lettura Ripartitori di Calore'
    const pieDiPagina  = impostazioni.pie_di_pagina || ''
    const logoPath     = impostazioni.logo_aziendale || ''

    // ─── Leggi campi visibili ─────────────────────────────────
    let campiVisibili = []
    try {
      const campiJson = impostazioni.campi_pdf
      if (campiJson) {
        const tutti = JSON.parse(campiJson)
        campiVisibili = tutti.filter(c => c.visible).map(c => c.key)
      }
    } catch(e) {}
    if (campiVisibili.length === 0) {
      campiVisibili = ['matricola','data_lettura','ora_lettura','valore_corrente','storico_mensile','data_errore','errorflags','status','powerstatus','locale','proprietario','interno','piano','condominio']
    }

    // ─── Logo ─────────────────────────────────────────────────
    let logoDataUri = ''
    let logoW = 0, logoH = 0
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        const buf = fs.readFileSync(logoPath)
        const ext = logoPath.toLowerCase().endsWith('.jpg') || logoPath.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png'
        logoDataUri = `data:image/${ext};base64,${buf.toString('base64')}`
        try {
          const sizeOf = require('image-size')
          const dims = sizeOf(buf)
          logoW = dims.width
          logoH = dims.height
        } catch(e) { logoW = 100; logoH = 100 }
      } catch(e) { logoDataUri = '' }
    }

    const logoMaxH = 36
    const logoMaxW = 120
    let logoStyle = ''
    if (logoW > 0 && logoH > 0) {
      const ratio = logoW / logoH
      const h = logoMaxH
      const w = Math.min(Math.round(h * ratio), logoMaxW)
      logoStyle = `height:${h}px;width:${w}px;object-fit:contain;`
    } else {
      logoStyle = `height:${logoMaxH}px;max-width:${logoMaxW}px;object-fit:contain;`
    }
    const logoHtml = logoDataUri
      ? `<img src="${logoDataUri}" style="${logoStyle}" />`
      : `<div style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
         </div>`

    // ─── Definizione TUTTI i campi disponibili ────────────────
    const CAMPI = {
      matricola:       { label: 'MATRICOLA',    align: 'left',   fn: (r,u,p,c) => r.identnr || '—',    mono: true },
      data_lettura:    { label: 'DATA',         align: 'left',   fn: (r,u,p,c) => r.date || '—' },
      ora_lettura:     { label: 'ORA',          align: 'left',   fn: (r,u,p,c) => r.time || '—' },
      valore_corrente: { label: 'H.C.A.',       align: 'right',  fn: (r,u,p,c) => r.hca?.value || '—', hca: true },
      storico_mensile: { label: 'STORICO (12 MESI)', align: 'left', fn: (r,u,p,c) => {
        const arr = r.hcaStorico || []
        return arr.slice(0,12).map(h => h.data ? `${h.data}→${h.value}` : h.value).join(' | ') || '—'
      }, muted: true },
      data_errore:     { label: 'DATA ERRORE',  align: 'left',   fn: (r,u,p,c) => r.errordate || '—' },
      errorflags:      { label: 'STATO',        align: 'center', fn: (r,u,p,c) => r.errorflags && r.errorflags !== '0' ? 'ERR' : 'OK', badge: true },
      status:          { label: 'STATUS',       align: 'left',   fn: (r,u,p,c) => r.status && r.status !== '0' ? r.status : 'OK' },
      powerstatus:     { label: 'BATTERIA',     align: 'left',   fn: (r,u,p,c) => r.powerstatus || '—' },
      locale:          { label: 'LOCALE',       align: 'left',   fn: (r,u,p,c) => r.dbInfo?.locale || '—' },
      proprietario:    { label: 'PROPRIETARIO', align: 'left',   fn: (r,u,p,c) => u.proprietario || '—' },
      interno:         { label: 'INT.',         align: 'center', fn: (r,u,p,c) => u.interno || '—' },
      piano:           { label: 'PIANO',        align: 'left',   fn: (r,u,p,c) => p.nome || '—' },
      condominio:      { label: 'CONDOMINIO',   align: 'left',   fn: (r,u,p,c) => c.nome || '—' },
      accessnr:        { label: 'N.ACCESSO',    align: 'left',   fn: (r,u,p,c) => r.accessnr || '—' },
      manufact:        { label: 'PRODUTTORE',   align: 'left',   fn: (r,u,p,c) => r.manufact || '—' },
      version:         { label: 'FIRMWARE',     align: 'left',   fn: (r,u,p,c) => r.devversion || '—' },
      subnet:          { label: 'SUBNET',       align: 'left',   fn: (r,u,p,c) => r.subnet || '—' },
      receiver:        { label: 'RECEIVER',     align: 'left',   fn: (r,u,p,c) => r.receiver || '—' },
      signature:       { label: 'FIRMA',        align: 'left',   fn: (r,u,p,c) => r.signature || '—' },
    }

    const dataStr = new Date().toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' })

    const CSS_BASE = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Inter',sans-serif; background:white; color:#1a1a2e; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .badge-ok  { background:linear-gradient(135deg,#dcfce7,#bbf7d0); color:#15803d; font-size:7px; font-weight:700; padding:2px 8px; border-radius:20px; letter-spacing:0.5px; display:inline-block; }
      .badge-err { background:linear-gradient(135deg,#fff7ed,#fed7aa); color:#c2410c; font-size:7px; font-weight:700; padding:2px 8px; border-radius:20px; letter-spacing:0.5px; display:inline-block; }
      .hca { font-weight:800; font-size:11px; color:#4f46e5; }
      .mono { font-family:'Courier New',monospace; font-size:8px; font-weight:600; }
      .muted { color:#9999bb; font-size:7.5px; }
      table { width:100%; border-collapse:collapse; font-size:8.5px; }
      thead tr { border-bottom:2px solid #4f46e5; }
      th { padding:5px 8px 7px; color:#4f46e5; font-weight:700; font-size:7.5px; letter-spacing:0.8px; text-transform:uppercase; }
      td { padding:7px 8px; color:#444466; }
      tr:nth-child(even) td { background:#fafaff; }
      .footer { padding:8px 24px; border-top:1px solid #ebebf8; display:flex; justify-content:space-between; align-items:center; background:#fafaff; }
      .footer span { font-size:7.5px; color:#aaaacc; }
      .dot { width:4px; height:4px; border-radius:50%; background:#4f46e5; opacity:0.4; display:inline-block; margin-right:5px; }
      .info-bar { padding:11px 24px; background:#f8f8ff; border-bottom:1px solid #ebebf8; display:flex; align-items:center; justify-content:space-between; }
      .info-icon { width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#eef2ff,#e0e7ff);display:flex;align-items:center;justify-content:center;flex-shrink:0; }
      .info-cond { font-size:11px;font-weight:700;color:#1a1a2e; }
      .info-addr { font-size:7.5px;color:#8888aa;margin-top:2px; }
      .divider { width:1px;background:#e8e8f5;align-self:stretch; }
      .label-group { text-align:center;padding:0 16px; }
      .label-title { font-size:7px;color:#aaaacc;text-transform:uppercase;letter-spacing:1px; }
      .label-value { font-size:10px;font-weight:600;color:#1a1a2e;margin-top:2px; }
      .label-value.primary { color:#4f46e5;font-weight:700; }
      .cards-grid { padding:16px 20px; display:grid; grid-template-columns:repeat(3,1fr); gap:12px; background:#ffffff; }
      .card { background:#ffffff; border:1px solid #f1f5f9; border-radius:12px; padding:12px; display:flex; flex-direction:column; box-shadow:0 1px 3px rgba(0,0,0,0.02); break-inside:avoid; }
      .card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
      .card-matricola { font-size:10px; font-weight:500; color:#94a3b8; font-family:monospace; }
      .card-status { width:14px; height:14px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:bold; }
      .card-status.status-ok { background:#f0fdf4; color:#22c55e; border:1px solid #bbf7d0; }
      .card-status.status-err { background:#fef2f2; color:#ef4444; border:1px solid #fecaca; }
      .card-locale { font-size:9px; font-weight:700; color:#64748b; letter-spacing:0.5px; margin-bottom:4px; }
      .card-value-container { display:flex; align-items:baseline; margin-bottom:2px; }
      .card-value { font-size:24px; font-weight:800; color:#4f46e5; margin-right:4px; }
      .card-unit { font-size:10px; font-weight:700; color:#4f46e5; }
      .card-datetime { font-size:8px; color:#94a3b8; margin-bottom:6px; }
      .card-badges { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:6px; }
      .card-badge-status { font-size:7px; font-weight:700; padding:2px 6px; border-radius:10px; }
      .card-badge-ok { background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; }
      .card-badge-err { background:#fef2f2; color:#dc2626; border:1px solid #fecaca; }
      .card-badge-batt { background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; }
      .card-errordate { font-size:8px; color:#dc2626; margin-bottom:4px; }
      .card-storico-section { border-top:1px dashed #f1f5f9; padding-top:6px; margin-top:4px; }
      .card-storico-title { font-size:7.5px; color:#94a3b8; margin-bottom:4px; font-weight:600; letter-spacing:0.5px; }
      .storico-row { display:flex; justify-content:space-between; align-items:center; padding:2px 0; border-bottom:1px solid #f8fafc; }
      .storico-row:last-child { border-bottom:none; }
      .storico-data { font-size:7.5px; color:#94a3b8; }
      .storico-label { font-size:6.5px; color:#b0b8cc; margin-left:4px; }
      .storico-val { font-size:8px; font-weight:700; color:#6366f1; }
      .page-block { page-break-after:always; break-after:page; }
      .page-block:last-child { page-break-after:avoid; break-after:avoid; }
    `

    function htmlHeader(pag) {
      return `
      <div style="background:linear-gradient(135deg,#312e81 0%,#4f46e5 60%,#6366f1 100%);padding:18px 24px 14px;position:relative;overflow:hidden;">
        <div style="position:absolute;top:-20px;right:50px;width:90px;height:90px;border-radius:50%;background:rgba(255,255,255,0.06);"></div>
        <div style="position:absolute;top:8px;right:16px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.08);"></div>
        <div style="position:absolute;bottom:-18px;right:110px;width:65px;height:65px;border-radius:50%;background:rgba(255,255,255,0.05);"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;position:relative;">
          <div style="display:flex;align-items:center;gap:14px;">
            ${logoHtml}
            <div>
              <div style="color:rgba(255,255,255,0.55);font-size:8px;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px;">${intestazione}</div>
              <div style="color:white;font-size:13px;font-weight:700;letter-spacing:-0.3px;">Lettura Ripartitori di Calore</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="color:rgba(255,255,255,0.45);font-size:7px;text-transform:uppercase;letter-spacing:1px;">Generato il</div>
            <div style="color:white;font-size:10px;font-weight:600;margin-top:2px;">${dataStr}</div>
            <div style="color:rgba(255,255,255,0.4);font-size:7.5px;margin-top:2px;">Pag. ${pag}</div>
          </div>
        </div>
      </div>`
    }

    function htmlFooter() {
      return `
      <div class="footer">
        <span>${pieDiPagina || ''}</span>
        <span><span class="dot"></span>QUNDIS Ripartitori App</span>
      </div>`
    }

    function htmlTabella(colonne, righe) {
      const ths = colonne.map(col => `<th style="text-align:${col.align}">${col.label}</th>`).join('')
      const trs = righe.map(riga => {
        const tds = riga.map((val, i) => {
          const col = colonne[i]
          let inner = String(val || '—')
          if (col.badge) {
            inner = val === 'ERR' ? `<span class="badge-err">ERR</span>` : `<span class="badge-ok">OK</span>`
          }
          let cls = ''
          if (col.hca)   cls = 'hca'
          if (col.mono)  cls = 'mono'
          if (col.muted) cls = 'muted'
          return `<td style="text-align:${col.align}" ${cls ? `class="${cls}"` : ''}>${inner}</td>`
        }).join('')
        return `<tr>${tds}</tr>`
      }).join('')
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
    }

    // ─── Genera HTML card singolo utente con storico completo ─
    function buildCard(rip) {
      const matricola = rip.identnr || '—'
      const locale = (rip.dbInfo?.locale || 'NON SPECIFICATO').toUpperCase()
      const valore = rip.hca?.value !== undefined ? rip.hca.value : '—'
      const isErr = rip.errorflags && rip.errorflags !== '0'
      const hasStatusErr = rip.status && rip.status !== '0'

      let dataOra = rip.date || '—'
      if (rip.time) dataOra += ` ${rip.time}`

      // Badges status e batteria
      let badgesHtml = ''
      if (isErr) badgesHtml += `<span class="card-badge-status card-badge-err">ERR: ${rip.errorflags}</span>`
      if (hasStatusErr) {
        const statusDesc = {'40':'Guasto sensore temperatura (Sostituire)','80':'Valore fuori range - temperatura anomala (Sostituire)','120':'Guasto sensore + fuori range (Sostituire)','160':'Dispositivo manomesso o rimosso (Verificare/Sostituire)'}
        badgesHtml += `<span class="card-badge-status card-badge-err">⚠ ${rip.status} — ${statusDesc[rip.status] || 'Errore codice ' + rip.status}</span>`
      }
      if (rip.powerstatus) badgesHtml += `<span class="card-badge-status card-badge-batt">🔋 ${rip.powerstatus}</span>`

      // Data errore
      const errDateHtml = (rip.errordate && rip.errordate !== '--.--.--' && rip.errordate !== '')
        ? `<div class="card-errordate">Errore dal: ${rip.errordate}</div>` : ''

      // Storico completo con date calcolate e label mese (max 12)
      const storicoArr = rip.hcaStorico || []
      let storicoHtml = ''
      if (storicoArr.length > 0) {
        const rows = storicoArr.slice(0, 12).map(h => `
          <div class="storico-row">
            <span class="storico-data">${h.dataCalcolata || h.data || '—'}<span class="storico-label">${h.labelMese || ''}</span></span>
            <span class="storico-val">${h.value} H.C.A.</span>
          </div>`).join('')
        storicoHtml = `
          <div class="card-storico-section">
            <div class="card-storico-title">STORICO ULTIMI 12 MESI</div>
            ${rows}
          </div>`
      }

      return `
        <div class="card">
          <div class="card-header">
            <div style="display:flex;align-items:center;gap:4px;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.5">
                <path d="M12 2c0 0-3.5 4.5-3.5 8.5c0 2.2 1.8 4 4 4s4-1.8 4-4C16.5 6.5 12 2 12 2z"/>
              </svg>
              <span class="card-matricola">${matricola}</span>
            </div>
            <div class="card-status ${isErr ? 'status-err' : 'status-ok'}">${isErr ? '✕' : '✓'}</div>
          </div>
          <div class="card-locale">${locale}</div>
          <div class="card-value-container">
            <span class="card-value">${valore}</span>
            <span class="card-unit">H.C.A.</span>
          </div>
          <div class="card-datetime">${dataOra}</div>
          ${badgesHtml ? `<div class="card-badges">${badgesHtml}</div>` : ''}
          ${errDateHtml}
          ${storicoHtml}
        </div>`
    }

    let bodyHtml = ''

    // ─── MODALITÀ TUTTI: tabella compatta ─────────────────────
    if (modalita === 'tutti') {
      const colonne = campiVisibili.map(k => CAMPI[k]).filter(Boolean)
      let blocchi = ''
      condominiData.forEach(cond => {
        const righe = []
        Object.values(cond.piani).forEach(piano => {
          Object.values(piano.unita).forEach(unita => {
            unita.ripartitori.forEach(rip => {
              righe.push(colonne.map(col => col.fn(rip, unita, piano, cond)))
            })
          })
        })
        blocchi += `
          <div style="margin-bottom:20px;">
            <div style="background:linear-gradient(135deg,#312e81,#4f46e5);border-radius:8px 8px 0 0;padding:8px 14px;display:flex;align-items:center;gap:8px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2.2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
              <span style="color:white;font-size:8.5px;font-weight:700;">${cond.nome}</span>
              <span style="color:rgba(255,255,255,0.5);font-size:7.5px;">— ${cond.indirizzo || ''}, ${cond.citta || ''}</span>
            </div>
            <div style="border:1px solid #e8e8f5;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;">
              ${htmlTabella(colonne, righe)}
            </div>
          </div>`
      })
      bodyHtml = `${htmlHeader('1')}<div style="padding:14px 24px 8px;">${blocchi}</div>${htmlFooter()}`

    // ─── MODALITÀ SINGOLO/MULTIPLO: card per appartamento ─────
    } else {
      const selezionate = unitaSelezionate || (unitaSelezionata ? [unitaSelezionata] : [])
      let pIndex = 1

      condominiData.forEach(cond => {
        Object.values(cond.piani).forEach(piano => {
          Object.values(piano.unita).forEach(unita => {
            if (selezionate.length === 0 || selezionate.includes(unita.proprietario)) {
              const cardsHtml = unita.ripartitori.map(rip => buildCard(rip)).join('')
              bodyHtml += `
              <div class="page-block">
                ${htmlHeader(pIndex++)}
                <div class="info-bar">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div class="info-icon">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2.2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
                    </div>
                    <div>
                      <div class="info-cond">${cond.nome}</div>
                      <div class="info-addr">${cond.indirizzo || ''} — ${cond.citta || ''}</div>
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;">
                    <div class="label-group">
                      <div class="label-title">Piano</div>
                      <div class="label-value">${piano.nome}</div>
                    </div>
                    <div class="divider"></div>
                    <div class="label-group">
                      <div class="label-title">Proprietario</div>
                      <div class="label-value primary">${unita.proprietario || '—'}</div>
                    </div>
                    <div class="divider"></div>
                    <div class="label-group">
                      <div class="label-title">Interno</div>
                      <div class="label-value">${unita.interno || '—'}</div>
                    </div>
                  </div>
                </div>
                <div class="cards-grid">${cardsHtml}</div>
                ${htmlFooter()}
              </div>`
            }
          })
        })
      })
    }

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS_BASE}</style></head><body>${bodyHtml}</body></html>`

    // ─── Generazione PDF nativa tramite Electron ──────────────
    const { BrowserWindow: ElectronBW } = require('electron')
    const workerWindow = new ElectronBW({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })

    const tmpHtmlPath = path.join(app.getPath('userData'), `print_tmp_${Date.now()}.html`)
    fs.writeFileSync(tmpHtmlPath, fullHtml, 'utf8')
    await workerWindow.loadFile(tmpHtmlPath)

    const pdfBuffer = await workerWindow.webContents.printToPDF({
      printBackground: true,
      landscape: true,
      pageSize: 'A4',
      margins: { marginType: 'none' }
    })

    fs.writeFileSync(savePath.filePath, pdfBuffer)
    workerWindow.destroy()
    try { fs.unlinkSync(tmpHtmlPath) } catch(e) {}

    return { success: true, filePath: savePath.filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: Gestione percorso DB condiviso ─────────────────────
ipcMain.handle('get-db-path', () => {
  return getDbPath()
})

ipcMain.handle('set-db-path', async (_, nuovoPercorso) => {
  try {
    const dir = path.dirname(nuovoPercorso)
    if (!fs.existsSync(dir)) return { success: false, error: 'Cartella non trovata: ' + dir }
    if (!fs.existsSync(nuovoPercorso)) {
      const data = db.export()
      fs.writeFileSync(nuovoPercorso, Buffer.from(data))
    }
    setDbPath(nuovoPercorso)
    const fileBuffer = fs.readFileSync(nuovoPercorso)
    db = new SQL.Database(fileBuffer)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Seleziona cartella per il database condiviso'
  })
  return result.filePaths[0] || null
})

ipcMain.handle('reload-db', async () => {
  try {
    const dbPath = getDbPath()
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath)
      db = new SQL.Database(fileBuffer)
      return { success: true }
    }
    return { success: false, error: 'File DB non trovato: ' + dbPath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: Invia PDF per Email via Outlook ────────────────────
ipcMain.handle('invia-email', async (_, { pdfPath }) => {
  try {
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return { success: false, error: 'File PDF non trovato: ' + pdfPath }
    }
    const { execSync } = require('child_process')
    const psScript = `
$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.CreateItem(0)
$mail.Attachments.Add("${pdfPath.replace(/\\/g, '\\\\')}")
$mail.Display($true)
`
    const psEncoded = Buffer.from(psScript, 'utf16le').toString('base64')
    execSync('powershell -EncodedCommand ' + psEncoded, { windowsHide: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})