const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { autoUpdater } = require('electron-updater')

let mainWindow
let db
let SQL

// ─── Percorso DB configurabile ───────────────────────────────
function getDbPath() {
  const configPath = path.join(app.getPath('userData'), 'db_config.json')
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      if (cfg.dbPath && fs.existsSync(path.dirname(cfg.dbPath))) {
        return cfg.dbPath
      }
    } catch(e) {
      console.error("Errore lettura db_config.json:", e)
    }
  }
  return path.join(app.getPath('userData'), 'ripartitori.db')
}

function setDbPath(newPath) {
  const configPath = path.join(app.getPath('userData'), 'db_config.json')
  fs.writeFileSync(configPath, JSON.stringify({ dbPath: newPath }, null, 2))
}

// ─── Percorso archivio import ────────────────────────────────
function getArchivioPath() {
  const imp = queryAllSafe('SELECT valore FROM impostazioni WHERE chiave = ?', ['archivio_path'])
  return imp[0]?.valore || ''
}

function queryAllSafe(sql, params = []) {
  try {
    if (!db) return []
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const rows = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows
  } catch(e) {
    console.error("Errore in queryAllSafe:", e)
    return []
  }
}

function nomeCartellaCondominio(nome) {
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
  if (!fs.existsSync(cartella)) {
    fs.mkdirSync(cartella, { recursive: true })
  }
  return cartella
}

// ─── Data locale (non UTC) in formato YYYY-MM-DD ─────────────
function oggiLocale(d = new Date()) {
  const aa = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const gg = String(d.getDate()).padStart(2, '0')
  return `${aa}-${mm}-${gg}`
}

// ─── Blocco database condiviso (un solo PC alla volta in scrittura) ──
// Un file <db>.lock indica chi sta usando il database; viene aggiornato ogni minuto.
// Se il blocco è di un altro PC ed è recente, l'app si apre in SOLA LETTURA.
const LOCK_SCADENZA_MS = 3 * 60 * 1000
let dbSolaLettura = false
let lockAltrui = null
let lockTimer = null
let dbMtimeNoto = 0

function lockPath() { return getDbPath() + '.lock' }
function leggiLock() {
  try { return JSON.parse(fs.readFileSync(lockPath(), 'utf8')) } catch(e) { return null }
}
function lockMio(l) { return l && l.pc === os.hostname() && l.pid === process.pid }
function processoAttivo(pid) {
  try { process.kill(pid, 0); return true } catch(e) { return e.code === 'EPERM' }
}
function lockAttivoAltrui(l) {
  if (!l || lockMio(l)) return false
  // Stesso PC ma app non più in esecuzione (es. chiusura anomala): il blocco non vale
  if (l.pc === os.hostname() && l.pid && !processoAttivo(l.pid)) return false
  return (Date.now() - (l.aggiornato || 0)) < LOCK_SCADENZA_MS
}
function scriviLock() {
  try {
    let utente = ''
    try { utente = os.userInfo().username } catch(e) {}
    fs.writeFileSync(lockPath(), JSON.stringify({ pc: os.hostname(), utente, pid: process.pid, aggiornato: Date.now() }))
  } catch(e) { console.error('Impossibile scrivere il blocco DB:', e.message) }
}
function notificaStatoDb() {
  if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('db-stato', statoDb())
}
function statoDb() {
  return {
    solaLettura: dbSolaLettura,
    bloccatoDa: lockAltrui ? { pc: lockAltrui.pc, utente: lockAltrui.utente, aggiornato: lockAltrui.aggiornato } : null,
    dbPath: getDbPath(),
  }
}
function acquisisciLock(forza = false) {
  const l = leggiLock()
  if (!forza && lockAttivoAltrui(l)) {
    dbSolaLettura = true
    lockAltrui = l
  } else {
    dbSolaLettura = false
    lockAltrui = null
    scriviLock()
  }
  if (!lockTimer) {
    lockTimer = setInterval(() => {
      if (dbSolaLettura) return
      const corrente = leggiLock()
      if (lockAttivoAltrui(corrente)) {
        // Un altro PC ha preso il controllo: questo passa in sola lettura
        dbSolaLettura = true
        lockAltrui = corrente
        notificaStatoDb()
      } else {
        scriviLock()
      }
    }, 60 * 1000)
  }
  return !dbSolaLettura
}
function rilasciaLock() {
  if (lockTimer) { clearInterval(lockTimer); lockTimer = null }
  const l = leggiLock()
  if (lockMio(l)) { try { fs.unlinkSync(lockPath()) } catch(e) {} }
}
function mtimeDb() {
  try { return fs.statSync(getDbPath()).mtimeMs } catch(e) { return 0 }
}
function ricaricaDbDaDisco() {
  const dbPath = getDbPath()
  if (!fs.existsSync(dbPath)) return false
  db = new SQL.Database(fs.readFileSync(dbPath))
  dbMtimeNoto = mtimeDb()
  return true
}

// ─── Backup automatico giornaliero (ultimi 30 giorni) ────────
const BACKUP_GIORNI = 30
function cartellaBackup() {
  const dir = path.join(app.getPath('userData'), 'backup')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}
function eseguiBackup(forza = false) {
  try {
    const dbPath = getDbPath()
    if (!fs.existsSync(dbPath)) return null
    const dir = cartellaBackup()
    const oggi = oggiLocale()
    if (!forza && fs.readdirSync(dir).some(f => f.startsWith(`ripartitori_${oggi}`))) return null
    const ora = new Date()
    const hhmm = String(ora.getHours()).padStart(2, '0') + String(ora.getMinutes()).padStart(2, '0')
    const nome = `ripartitori_${oggi}_${hhmm}.db`
    fs.copyFileSync(dbPath, path.join(dir, nome))
    // Elimina i backup più vecchi di 30 giorni
    const limite = Date.now() - BACKUP_GIORNI * 24 * 60 * 60 * 1000
    fs.readdirSync(dir).forEach(f => {
      const m = f.match(/^ripartitori_(\d{4})-(\d{2})-(\d{2})/)
      if (!m) return
      const data = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])).getTime()
      if (data < limite) { try { fs.unlinkSync(path.join(dir, f)) } catch(e) {} }
    })
    return nome
  } catch(e) {
    console.error('Errore backup DB:', e.message)
    return null
  }
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
    if (isCustomPath) {
      fs.writeFileSync(localFallback, fileBuffer)
    }
  } else if (isCustomPath && fs.existsSync(localFallback)) {
    const fileBuffer = fs.readFileSync(localFallback)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }
  dbMtimeNoto = mtimeDb()
  acquisisciLock()
  eseguiBackup()

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

  // ─── Tabelle storico letture XML ──────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS letture (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ripartitore_id INTEGER NOT NULL,
    data_lettura TEXT NOT NULL,
    data_importazione TEXT NOT NULL,
    hca_valore REAL,
    hca_storico_json TEXT,
    errorflags TEXT DEFAULT '0',
    status TEXT DEFAULT '0',
    powerstatus TEXT,
    errordate TEXT,
    note TEXT,
    FOREIGN KEY (ripartitore_id) REFERENCES ripartitori(id)
  );`)

  // Migrazioni: aggiunge colonne se non esistono (sicuro su DB già creati)
  try { db.run('ALTER TABLE letture ADD COLUMN hca_ago_prec_json TEXT') } catch(e) {}
  try { db.run('ALTER TABLE letture ADD COLUMN tech_json TEXT') } catch(e) {}
  // Contabilizzatori diretti: tipo dispositivo (NULL = ripartitore HCA), unità e consumo calcolato
  try { db.run('ALTER TABLE letture ADD COLUMN tipo TEXT') } catch(e) {}
  try { db.run('ALTER TABLE letture ADD COLUMN unita TEXT') } catch(e) {}
  try { db.run('ALTER TABLE letture ADD COLUMN consumo_json TEXT') } catch(e) {}
  try { db.run('ALTER TABLE ripartitori ADD COLUMN tipo TEXT') } catch(e) {}

  db.run(`CREATE TABLE IF NOT EXISTS sostituzioni (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ripartitore_id INTEGER NOT NULL,
    data_sostituzione TEXT NOT NULL,
    vecchia_matricola TEXT NOT NULL,
    nuova_matricola TEXT NOT NULL,
    motivo TEXT,
    note TEXT,
    FOREIGN KEY (ripartitore_id) REFERENCES ripartitori(id)
  );`)

  if (!dbSolaLettura) saveDatabase()
}

function saveDatabase() {
  if (dbSolaLettura) {
    notificaStatoDb()
    throw new Error('Database in sola lettura: è in uso su un altro PC, le modifiche non sono state salvate')
  }
  const dbPath = getDbPath()
  // Protezione: se il file è stato modificato da altri dopo l'ultima lettura/scrittura, ne salva una copia
  const mtimeAttuale = mtimeDb()
  if (dbMtimeNoto && mtimeAttuale && Math.abs(mtimeAttuale - dbMtimeNoto) > 1000) {
    try {
      const ora = new Date()
      const nome = `conflitto_${oggiLocale()}_${String(ora.getHours()).padStart(2, '0')}${String(ora.getMinutes()).padStart(2, '0')}${String(ora.getSeconds()).padStart(2, '0')}.db`
      fs.copyFileSync(dbPath, path.join(cartellaBackup(), nome))
      console.warn('DB modificato da un altro PC: copia salvata in', nome)
    } catch(e) {}
  }
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
  dbMtimeNoto = mtimeDb()
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
  if (dbSolaLettura) {
    notificaStatoDb()
    throw new Error('Database in sola lettura: è in uso su un altro PC, le modifiche non sono state salvate')
  }
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

  function createGuidaWindow() {
    const guidaWin = new BrowserWindow({
      width: 900,
      height: 700,
      title: 'Guida XML QUNDIS',
      webPreferences: { 
        nodeIntegration: false, 
        contextIsolation: true 
      },
      parent: mainWindow,
      modal: false,
    })
    guidaWin.loadFile(path.join(__dirname, 'guida-xml.html'))
    guidaWin.setMenu(null)
  }

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
  setTimeout(() => setupAutoUpdater(), 3000)
})

// ─── GESTIONE AGGIORMANENTI SICURA E MANUALE ─────────────────
function setupAutoUpdater() {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'dittamorotti',
    repo: 'ripartitori-app',
    updaterCacheDirName: 'ripartitori-app-updater',
  })

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.forceDevUpdateConfig = false

  autoUpdater.on('checking-for-update', () => {
    console.log('Controllo aggiornamenti...')
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('update-checking')
    }
  })

  autoUpdater.on('update-available', (info) => {
    console.log('Aggiornamento disponibile:', info.version)
    if (mainWindow && mainWindow.webContents) {
      // Notifichiamo ad App.jsx che c'è un aggiornamento pronto per essere scaricato
      mainWindow.webContents.send('update-available', info)
      
      // Avviamo automaticamente il download sicuro per allinearci a quanto si aspetta App.jsx
      autoUpdater.downloadUpdate()
    }
  })

  autoUpdater.on('update-not-available', () => {
    console.log('App aggiornata alla versione più recente.')
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('update-not-available')
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('update-progress', Math.round(progress.percent))
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Download completato. Pronto per l\'installazione.')
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('update-downloaded', info)
    }
  })

  autoUpdater.on('error', (err) => {
    console.error('Errore aggiornamento:', err.message)
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('update-error', err.message)
    }
  })

  autoUpdater.checkForUpdates()
}

// Handler IPC invocati da App.jsx
ipcMain.handle('start-download-update', () => {
  autoUpdater.downloadUpdate()
  return true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  rilasciaLock()
})

// ─── IPC: stato database condiviso e backup ───────────────────
ipcMain.handle('get-stato-db', () => statoDb())

// Riprova ad aprire in scrittura (se l'altro PC ha chiuso l'app)
ipcMain.handle('riprova-scrittura-db', () => {
  try {
    ricaricaDbDaDisco()
    acquisisciLock(false)
    notificaStatoDb()
    return { success: true, ...statoDb() }
  } catch (err) { return { success: false, error: err.message } }
})

// Prende il controllo anche se il blocco risulta di un altro PC (da usare se quel PC è spento o bloccato)
ipcMain.handle('forza-scrittura-db', () => {
  try {
    ricaricaDbDaDisco()
    acquisisciLock(true)
    notificaStatoDb()
    return { success: true, ...statoDb() }
  } catch (err) { return { success: false, error: err.message } }
})

ipcMain.handle('get-backup-info', () => {
  try {
    const dir = cartellaBackup()
    const elenco = fs.readdirSync(dir)
      .filter(f => f.endsWith('.db'))
      .map(f => { const st = fs.statSync(path.join(dir, f)); return { nome: f, dimensione: st.size, data: st.mtime.getTime() } })
      .sort((a, b) => b.data - a.data)
    return { success: true, cartella: dir, elenco, giorni: BACKUP_GIORNI }
  } catch (err) { return { success: false, error: err.message } }
})

ipcMain.handle('backup-ora', () => {
  const nome = eseguiBackup(true)
  return nome ? { success: true, nome } : { success: false, error: 'Backup non riuscito' }
})

ipcMain.handle('apri-cartella-backup', () => {
  const { shell } = require('electron')
  shell.openPath(cartellaBackup())
  return true
})

// ─── INTERFACCIA IPC COMPLETA ANAGRAFICA ─────────────────────
// ─── IPC: Carica anagrafica completa in batch (una sola chiamata) ─────────────
ipcMain.handle('get-anagrafica-condominio', (_, condominioId) => {
  try {
    const cond = queryAll('SELECT * FROM condomini WHERE id = ?', [condominioId])[0]
    if (!cond) return null
    const piani = queryAll(`SELECT * FROM piani WHERE condominio_id = ? ORDER BY
      CASE WHEN nome LIKE '%Terra%' THEN 0 WHEN nome LIKE '%Primo%' THEN 1
           WHEN nome LIKE '%Secondo%' THEN 2 WHEN nome LIKE '%Terzo%' THEN 3
           WHEN nome LIKE '%Quarto%' THEN 4 WHEN nome LIKE '%Quinto%' THEN 5
           WHEN nome LIKE '%Sesto%' THEN 6 WHEN nome LIKE '%Settimo%' THEN 7
           WHEN nome LIKE '%Ottavo%' THEN 8 WHEN nome LIKE '%Nono%' THEN 9
           WHEN nome LIKE '%Decimo%' THEN 10 ELSE 99 END, nome`, [condominioId])
    const pianiIds = piani.map(p => p.id)
    if (pianiIds.length === 0) return { cond, piani: [], unita: [], ripartitori: [] }
    const unita = queryAll(`SELECT * FROM unita WHERE piano_id IN (${pianiIds.join(',')}) ORDER BY interno`)
    const unitaIds = unita.map(u => u.id)
    const ripartitori = unitaIds.length > 0
      ? queryAll(`SELECT * FROM ripartitori WHERE unita_id IN (${unitaIds.join(',')}) ORDER BY locale`)
      : []
    return { cond, piani, unita, ripartitori }
  } catch(err) { return null }
})

ipcMain.handle('get-condomini', () => { 
  return queryAll('SELECT * FROM condomini ORDER BY nome') 
})

ipcMain.handle('add-condominio', (_, data) => { 
  return queryRun('INSERT INTO condomini (nome, indirizzo, citta, note) VALUES (?, ?, ?, ?)', [
    data.nome || '', 
    data.indirizzo || '', 
    data.citta || '', 
    data.note || ''
  ]) 
})

ipcMain.handle('update-condominio', (_, data) => { 
  db.run('UPDATE condomini SET nome=?, indirizzo=?, citta=?, note=? WHERE id=?', [
    data.nome || '', 
    data.indirizzo || '', 
    data.citta || '', 
    data.note || '', 
    data.id
  ])
  saveDatabase()
  return true 
})

ipcMain.handle('delete-condominio', async (_, { id, eliminaArchivio }) => { 
  const cond = queryAll('SELECT nome FROM condomini WHERE id = ?', [id])
  const nomeCondominio = cond[0]?.nome || ''
  const piani = queryAll('SELECT id FROM piani WHERE condominio_id = ?', [id])

  db.run('BEGIN')
  try {
    piani.forEach(p => {
      const unita = queryAll('SELECT id FROM unita WHERE piano_id = ?', [p.id])
      unita.forEach(u => {
        db.run('DELETE FROM ripartitori WHERE unita_id = ?', [u.id])
      })
      db.run('DELETE FROM unita WHERE piano_id = ?', [p.id])
    })
    db.run('DELETE FROM piani WHERE condominio_id = ?', [id])
    db.run('DELETE FROM condomini WHERE id = ?', [id])
    db.run('COMMIT')
  } catch(txErr) {
    db.run('ROLLBACK')
    throw txErr
  }
  saveDatabase()
  
  if (eliminaArchivio && nomeCondominio) { 
    const cartella = getCartellaCond(nomeCondominio)
    if (cartella && fs.existsSync(cartella)) { 
      fs.rmSync(cartella, { recursive: true, force: true }) 
    } 
  }
  return true 
})

ipcMain.handle('get-piani', (_, condominioId) => { 
  return queryAll(`SELECT * FROM piani WHERE condominio_id = ? ORDER BY 
    CASE 
      WHEN nome LIKE '%Terra%' THEN 0 
      WHEN nome LIKE '%Primo%' THEN 1 
      WHEN nome LIKE '%Secondo%' THEN 2 
      WHEN nome LIKE '%Terzo%' THEN 3 
      WHEN nome LIKE '%Quarto%' THEN 4 
      WHEN nome LIKE '%Quinto%' THEN 5 
      WHEN nome LIKE '%Sesto%' THEN 6 
      WHEN nome LIKE '%Settimo%' THEN 7 
      WHEN nome LIKE '%Ottavo%' THEN 8 
      WHEN nome LIKE '%Nono%' THEN 9 
      WHEN nome LIKE '%Decimo%' THEN 10 
      ELSE 99 
    END, nome`, [condominioId]) 
})

ipcMain.handle('add-piano', (_, data) => { 
  return queryRun('INSERT INTO piani (condominio_id, nome) VALUES (?, ?)', [
    data.condominio_id || 0, 
    data.nome || ''
  ]) 
})

ipcMain.handle('update-piano', (_, data) => { 
  db.run('UPDATE piani SET nome=? WHERE id=?', [data.nome || '', data.id])
  saveDatabase()
  return true 
})

ipcMain.handle('delete-piano', (_, id) => {
  const unita = queryAll('SELECT id FROM unita WHERE piano_id = ?', [id])
  db.run('BEGIN')
  try {
    unita.forEach(u => {
      db.run('DELETE FROM ripartitori WHERE unita_id = ?', [u.id])
    })
    db.run('DELETE FROM unita WHERE piano_id = ?', [id])
    db.run('DELETE FROM piani WHERE id = ?', [id])
    db.run('COMMIT')
  } catch(txErr) {
    db.run('ROLLBACK')
    throw txErr
  }
  saveDatabase()
  return true
})

ipcMain.handle('get-unita', (_, pianoId) => { 
  return queryAll('SELECT * FROM unita WHERE piano_id = ? ORDER BY interno', [pianoId]) 
})

ipcMain.handle('add-unita', (_, data) => { 
  return queryRun('INSERT INTO unita (piano_id, proprietario, interno, note) VALUES (?, ?, ?, ?)', [
    data.piano_id || 0, 
    data.proprietario || '', 
    data.interno || '', 
    data.note || ''
  ]) 
})

ipcMain.handle('update-unita', (_, data) => { 
  db.run('UPDATE unita SET proprietario=?, interno=?, note=? WHERE id=?', [
    data.proprietario || '', 
    data.interno || '', 
    data.note || '', 
    data.id
  ])
  saveDatabase()
  return true 
})

ipcMain.handle('delete-unita', (_, id) => { 
  db.run('DELETE FROM ripartitori WHERE unita_id = ?', [id])
  db.run('DELETE FROM unita WHERE id = ?', [id])
  saveDatabase()
  return true 
})

ipcMain.handle('get-ripartitori', (_, unitaId) => { 
  return queryAll('SELECT * FROM ripartitori WHERE unita_id = ? ORDER BY locale', [unitaId]) 
})

ipcMain.handle('add-ripartitore', (_, data) => { 
  return queryRun('INSERT INTO ripartitori (unita_id, matricola, locale, note) VALUES (?, ?, ?, ?)', [
    data.unita_id || 0, 
    data.matricola || '', 
    data.locale || '', 
    data.note || ''
  ]) 
})

ipcMain.handle('update-ripartitore', (_, data) => { 
  db.run('UPDATE ripartitori SET matricola=?, locale=?, note=? WHERE id=?', [
    data.matricola || '', 
    data.locale || '', 
    data.note || '', 
    data.id
  ])
  saveDatabase()
  return true 
})

ipcMain.handle('delete-ripartitore', (_, id) => { 
  db.run('DELETE FROM ripartitori WHERE id = ?', [id])
  saveDatabase()
  return true 
})

ipcMain.handle('get-impostazioni', () => { 
  const rows = queryAll('SELECT chiave, valore FROM impostazioni')
  const result = {}
  rows.forEach(row => { result[row.chiave] = row.valore })
  return result 
})

ipcMain.handle('set-impostazione', (_, chiave, valore) => { 
  db.run('INSERT OR REPLACE INTO impostazioni (chiave, valore) VALUES (?, ?)', [
    chiave || '', 
    valore || ''
  ])
  saveDatabase()
  return true 
})

ipcMain.handle('open-file-dialog', async (_, filters) => { 
  const result = await dialog.showOpenDialog(mainWindow, { 
    properties: ['openFile'], 
    filters: filters || [{ name: 'XML Files', extensions: ['xml'] }] 
  })
  return result.filePaths[0] || null 
})

// Selezione di più file (import XML da più concentratori in una volta)
ipcMain.handle('open-files-dialog', async (_, filters) => { 
  const result = await dialog.showOpenDialog(mainWindow, { 
    properties: ['openFile', 'multiSelections'], 
    filters: filters || [{ name: 'XML Files', extensions: ['xml'] }] 
  })
  return result.filePaths || [] 
})

ipcMain.handle('read-file', (_, filePath) => { 
  try { 
    const content = fs.readFileSync(filePath, 'utf8')
    return { success: true, content } 
  } catch (err) { 
    return { success: false, error: err.message } 
  } 
})

// ─── IMPORTAZIONE CSV COMPLETA ED ESTESA ─────────────────────
ipcMain.handle('import-csv', (_, { nomeCondominio, righe }) => { 
  try { 
    if (!righe || righe.length === 0) {
      throw new Error("Nessuna riga fornita per l'importazione.")
    }
    const primaRiga = righe[0]
    const indirizzo = primaRiga.indirizzo || '' 
    const citta = primaRiga.citta || ''
    
    const ordinePiani = { 
      'terra': 0, 'primo': 1, 'secondo': 2, 'terzo': 3, 'quarto': 4, 
      'quinto': 5, 'sesto': 6, 'settimo': 7, 'ottavo': 8, 'nono': 9, 'decimo': 10 
    }
    
    function ordinePiano(nome) { 
      const n = (nome || '').toLowerCase()
      for (const [k, v] of Object.entries(ordinePiani)) {
        if (n.includes(k)) return v
      }
      return 99 
    }
    
    const pianosMap = {}
    righe.forEach(r => { 
      const piano = r.piano || 'Piano Non Specificato'
      if (!pianosMap[piano]) pianosMap[piano] = []
      pianosMap[piano].push(r) 
    })
    
    const pianiOrdinati = Object.entries(pianosMap).sort((a, b) => ordinePiano(a[0]) - ordinePiano(b[0]))
    
    db.run('BEGIN')
    let condominioId
    try { 
      db.run('INSERT INTO condomini (nome, indirizzo, citta, note) VALUES (?, ?, ?, ?)', [nomeCondominio, indirizzo, citta, ''])
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
          
          db.run('INSERT INTO unita (piano_id, proprietario, interno, note) VALUES (?, ?, ?, ?)', [
            pianoId, 
            nomeUnita, 
            righeU[0].interno || '', 
            inquilino
          ])
          const unitaId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
          
          righeU.forEach(r => { 
            db.run('INSERT INTO ripartitori (unita_id, matricola, locale, note) VALUES (?, ?, ?, ?)', [
              unitaId, 
              r.matricola || '', 
              r.locale || '', 
              ''
            ])
          })
        })
      })
      db.run('COMMIT')
    } catch (err) { 
      db.run('ROLLBACK')
      throw err 
    }
    
    saveDatabase()
    try { 
      creaCartellaCond(nomeCondominio) 
    } catch(e) {
      console.error("Impossibile creare la cartella d'archivio:", e)
    }
    return { success: true, condominioId } 
  } catch (err) { 
    return { success: false, error: err.message } 
  } 
})

ipcMain.handle('archivia-xml', async (_, { nomeCondominio, filePath, dataLettura, concentratore, sovrascrivi }) => { 
  try { 
    const cartella = creaCartellaCond(nomeCondominio)
    if (!cartella) {
      return { success: false, error: 'Percorso archivio non configurato nelle Impostazioni.' }
    }
    
    const dataStr = dataLettura || oggiLocale()
    // Con più concentratori nello stesso condominio il numero evita di sovrascrivere l'altro file
    const suffisso = concentratore ? `_${String(concentratore).replace(/[^0-9A-Za-z]/g, '')}` : ''
    const destName = `lettura_${dataStr}${suffisso}.xml`
    const destPath = path.join(cartella, destName)
    
    if (fs.existsSync(destPath) && !sovrascrivi) { 
      return { success: false, esistente: true, destPath, destName } 
    }
    
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    let lastErr
    
    for (let i = 0; i < 5; i++) { 
      try { 
        fs.copyFileSync(filePath, destPath)
        return { success: true, destPath, destName } 
      } catch (err) { 
        if (err.code === 'EBUSY' || err.code === 'EPERM') { 
          lastErr = err
          await sleep(300 * (i + 1)) 
        } else { 
          throw err 
        } 
      } 
    }
    return { success: false, error: `File occupato da un altro programma. Chiudi il file XML e riprova. (${lastErr?.message})` } 
  } catch (err) { 
    return { success: false, error: err.message } 
  } 
})

ipcMain.handle('get-storico-xml', (_, { nomeCondominio }) => { 
  try { 
    const cartella = getCartellaCond(nomeCondominio)
    if (!cartella || !fs.existsSync(cartella)) {
      return { success: true, files: [] }
    }
    
    const files = fs.readdirSync(cartella)
      .filter(f => f.endsWith('.xml'))
      .map(f => { 
        const fullPath = path.join(cartella, f)
        const stat = fs.statSync(fullPath)
        return { 
          nome: f, 
          path: fullPath, 
          size: stat.size, 
          modified: stat.mtime.toISOString() 
        } 
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
    if (!fs.existsSync(cartella)) {
      fs.mkdirSync(cartella, { recursive: true })
    }
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
    if (!fs.existsSync(percorso)) {
      return { success: false, error: 'Cartella non trovata: ' + percorso }
    }
    db.run('INSERT OR REPLACE INTO impostazioni (chiave, valore) VALUES (?, ?)', ['archivio_path', percorso])
    saveDatabase()
    return { success: true } 
  } catch (err) { 
    return { success: false, error: err.message } 
  } 
})

// ─── IPC: Gestione Auto-Updater ──────────────────────────────
ipcMain.handle('install-update', async () => {
  autoUpdater.quitAndInstall();
  return true;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

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
    WHERE r.matricola = ?`, [matricola])
  return rows[0] || null 
})

// ─── GENERAZIONE PDF ORIGINALE ESTESA E DETTAGLIATA ──────────
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
    const pieDiPagina = impostazioni.pie_di_pagina || ''
    const logoPath = impostazioni.logo_aziendale || ''
    
    let campiVisibili = []
    try { 
      const campiJson = impostazioni.campi_pdf
      if (campiJson) { 
        const tutti = JSON.parse(campiJson)
        campiVisibili = tutti.filter(c => c.visible).map(c => c.key) 
        // Campo nuovo: visibile finché non viene nascosto nelle Impostazioni
        if (!tutti.some(c => c.key === 'consumo_periodo')) campiVisibili.push('consumo_periodo')
        if (!tutti.some(c => c.key === 'perdita')) campiVisibili.push('perdita')
        // 'flag_dispositivo' è spento di default: compare solo se attivato nelle Impostazioni
      } 
    } catch(e) {
      console.error("Errore parsing campi_pdf:", e)
    }
    
    if (campiVisibili.length === 0) { 
      campiVisibili = [
        'matricola','data_lettura','ora_lettura','valore_corrente','storico_mensile',
        'data_errore','errorflags','status','powerstatus','locale','proprietario','interno','piano','condominio','consumo_periodo','perdita'
      ] 
    }
    
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
        } catch(e) { 
          logoW = 100; logoH = 100 
        } 
      } catch(e) { 
        logoDataUri = '' 
      } 
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
      : `<div style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg></div>`
      
    // ─── Tipi dispositivo: ripartitori (HCA) e contabilizzatori diretti ─────
    const TIPO_UNITA = { HCA: 'H.C.A.', CALORE: 'kWh', FREDDO: 'kWh', ACS: 'm³', AFS: 'm³' }
    const isContatore = (t) => t === 'CALORE' || t === 'FREDDO' || t === 'ACS' || t === 'AFS'
    const tipoRip = (r) => r.tipo || 'HCA'
    const unitaRip = (r) => r.unita || TIPO_UNITA[tipoRip(r)] || 'H.C.A.'
    function fmtValore(v, tipo) {
      if (v === null || v === undefined || v === '') return '—'
      if (!isContatore(tipo)) return v
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
      if (isNaN(n)) return '—'
      const dec = (tipo === 'CALORE' || tipo === 'FREDDO') ? 0 : 3
      return n.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    }
    function iconaTipoSvg(tipo) {
      if (tipo === 'FREDDO') {
        return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5"><path d="M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7"/></svg>`
      }
      if (tipo === 'ACS' || tipo === 'AFS') {
        const col = tipo === 'ACS' ? '#ef4444' : '#3b82f6'
        return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2.5"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`
      }
      return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2.5"><path d="M12 2c0 0-3.5 4.5-3.5 8.5c0 2.2 1.8 4 4 4s4-1.8 4-4C16.5 6.5 12 2 12 2z"/></svg>`
    }
    const tipiPresenti = new Set()
    condominiData.forEach(c => Object.values(c.piani).forEach(p => Object.values(p.unita).forEach(u => u.ripartitori.forEach(r => tipiPresenti.add(tipoRip(r))))))
    const soloHca = [...tipiPresenti].every(t => t === 'HCA')
    const soloContatori = tipiPresenti.size > 0 && [...tipiPresenti].every(t => isContatore(t))
    const titoloDocumento = soloHca ? 'Lettura Ripartitori di Calore'
      : soloContatori ? 'Lettura Contabilizzatori' : 'Lettura Ripartitori e Contabilizzatori'

    const CAMPI = {
      matricola: { label: 'MATRICOLA', align: 'left', fn: (r) => r.identnr || '—', mono: true },
      data_lettura: { label: 'DATA', align: 'left', fn: (r) => r.date || '—' },
      ora_lettura: { label: 'ORA', align: 'left', fn: (r) => r.time || '—' },
      valore_corrente: { label: soloHca ? 'H.C.A.' : 'VALORE', align: 'right', fn: (r) => {
        const t = tipoRip(r)
        if (!isContatore(t)) return r.hca?.value || '—'
        const v = fmtValore(r.hca?.value, t)
        if (v === '—') return v
        return `${v} ${unitaRip(r)}`
      }, hca: true },
      consumo_periodo: { label: 'CONSUMO', align: 'right', fn: (r) => {
        const t = tipoRip(r)
        if (!isContatore(t) || !r.consumo) return '—'
        return `${fmtValore(r.consumo.valore, t)} ${unitaRip(r)} (${r.consumo.dalMontaggio ? 'dal montaggio' : r.consumo.periodo})`
      } },
      perdita: { label: 'PERDITA', align: 'left', fn: (r) => r.perditaOre ? `In corso da ${r.perditaOre} ore` : '—' },
      flag_dispositivo: { label: 'FLAG DISP.', align: 'left', fn: (r) => r.flagDispositivo || '—' },
      storico_mensile: { label: 'STORICO (12 MESI)', align: 'left', fn: (r) => { const t = tipoRip(r); const arr = r.hcaStorico || []; return arr.slice(0,12).map(h => h.data ? `${h.data}→${fmtValore(h.value, t)}` : fmtValore(h.value, t)).join(' | ') || '—' }, muted: true },
      data_errore: { label: 'DATA ERRORE', align: 'left', fn: (r) => r.errordate || '—' }, 
      errorflags: { label: 'STATO', align: 'center', fn: (r) => r.errorflags && r.errorflags !== '0' ? 'ERR' : 'OK', badge: true }, 
      status: { label: 'STATUS', align: 'left', fn: (r) => r.status && r.status !== '0' ? `${r.status}${r.statusDescr ? ' — ' + r.statusDescr : ''}` : 'OK' }, 
      powerstatus: { label: 'BATTERIA', align: 'left', fn: (r) => r.powerstatus || '—' }, 
      locale: { label: 'LOCALE', align: 'left', fn: (r) => r.dbInfo?.locale || '—' }, 
      proprietario: { label: 'PROPRIETARIO', align: 'left', fn: (r,u) => u.proprietario || '—' }, 
      interno: { label: 'INT.', align: 'center', fn: (r,u) => u.interno || '—' }, 
      piano: { label: 'PIANO', align: 'left', fn: (r,u,p) => p.nome || '—' }, 
      condominio: { label: 'CONDOMINIO', align: 'left', fn: (r,u,p,c) => c.nome || '—' }, 
      accessnr: { label: 'N.ACCESSO', align: 'left', fn: (r) => r.accessnr || '—' }, 
      manufact: { label: 'PRODUTTORE', align: 'left', fn: (r) => r.manufact || '—' }, 
      version: { label: 'FIRMWARE', align: 'left', fn: (r) => r.devversion || '—' }, 
      subnet: { label: 'SUBNET', align: 'left', fn: (r) => r.subnet || '—' }, 
      receiver: { label: 'RECEIVER', align: 'left', fn: (r) => r.receiver || '—' }, 
      signature: { label: 'FIRMA', align: 'left', fn: (r) => r.signatureDescr || r.signature || '—' } 
    }
    
    const dataStr = new Date().toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' })
    
    const CSS_BASE = `
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Segoe UI','Inter',system-ui,-apple-system,sans-serif; background:white; color:#1a1a2e; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .badge-ok { background:linear-gradient(135deg,#dcfce7,#bbf7d0); color:#15803d; font-size:7px; font-weight:700; padding:2px 8px; border-radius:20px; letter-spacing:0.5px; display:inline-block; }
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
      .page-block:last-child { page-break-after:avoid; break-after:avoid; }`
      
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
              <div style="color:white;font-size:13px;font-weight:700;letter-spacing:-0.3px;">${titoloDocumento}</div>
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
      return `<div class="footer"><span>${pieDiPagina || ''}</span><span><span class="dot"></span>QUNDIS Ripartitori App</span></div>` 
    }
    
    function htmlTabella(colonne, righe, rowMeta = []) {
      const ths = colonne.map(col => `<th style="text-align:${col.align}">${col.label}</th>`).join('')
      const trs = righe.map((riga, rowIdx) => {
        const meta = rowMeta[rowIdx] || {}
        const tds = riga.map((val, i) => {
          const col = colonne[i]
          // Riga mancanza segnale: '__MANCANZA__' nella colonna avviso, valori normali altrove
          if (meta.mancanza && val === '__MANCANZA__') {
            return `<td style="text-align:left"><span style="background:#fef2f2;color:#dc2626;font-weight:700;font-size:7.5px;padding:2px 8px;border-radius:10px;border:1px solid #fecaca;">⚠ Mancanza segnale</span></td>`
          }
          let inner = String(val || '—')
          if (col.badge) {
            inner = val === 'ERR' ? `<span class="badge-err">ERR</span>` : `<span class="badge-ok">OK</span>`
          }
          let cls = ''
          if (col.hca) cls = 'hca'
          if (col.mono) cls = 'mono'
          if (col.muted) cls = 'muted'
          return `<td style="text-align:${col.align}" ${cls ? `class="${cls}"` : ''}>${inner}</td>`
        }).join('')
        const trStyle = meta.mancanza ? 'background:#fff5f5;' : ''
        return `<tr style="${trStyle}">${tds}</tr>`
      }).join('')
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`
    }
    
    const MESI_LABEL = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

    function buildCard(rip, unitaInfo) {
      // Ripartitore senza lettura XML
      if (rip.nessuna_lettura) {
        return `
          <div class="card" style="border-color:#fecaca;background:#fff5f5;">
            <div class="card-header">
              <div style="display:flex;align-items:center;gap:4px;">
                ${iconaTipoSvg(tipoRip(rip))}
                <span class="card-matricola">${rip.identnr || '—'}</span>
              </div>
              <div class="card-status status-err">!</div>
            </div>
            <div class="card-locale">${(rip.dbInfo?.locale || 'NON SPECIFICATO').toUpperCase()}</div>
            <div style="margin-top:6px;padding:6px 8px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:8px;color:#dc2626;font-weight:600;">
              ⚠ Mancanza segnale — nessuna lettura registrata
            </div>
          </div>`
      }

      const matricola    = rip.identnr || '—'
      const locale       = (rip.dbInfo?.locale || 'NON SPECIFICATO').toUpperCase()
      const tipo         = tipoRip(rip)
      const unita        = unitaRip(rip)
      const valore       = rip.hca?.value !== undefined ? fmtValore(rip.hca.value, tipo) : '—'
      const isErr        = rip.errorflags && rip.errorflags !== '0'
      const hasStatusErr = rip.status && rip.status !== '0'
      let dataOra        = rip.date || '—'
      if (rip.time) dataOra += ` ${rip.time}`

      const mostra = (key) => campiVisibili.includes(key)

      let badgesHtml = ''
      if (mostra('errorflags') && isErr) badgesHtml += `<span class="card-badge-status card-badge-err">ERR: ${rip.errorflags}${rip.errorflagsDescr ? ' — ' + rip.errorflagsDescr : ''}</span>`
      if (mostra('status') && hasStatusErr) badgesHtml += `<span class="card-badge-status card-badge-err">⚠ ${rip.status} — ${rip.statusDescr || 'Errore codice ' + rip.status}</span>`
      if (mostra('perdita') && rip.perditaOre) badgesHtml += `<span class="card-badge-status card-badge-err">💧 Perdita in corso da ${rip.perditaOre} ore</span>`
      if (mostra('flag_dispositivo') && rip.flagDispositivo) badgesHtml += `<span class="card-badge-status card-badge-err">Flag dispositivo: ${rip.flagDispositivo}</span>`
      if (mostra('powerstatus') && rip.powerstatus) badgesHtml += `<span class="card-badge-status card-badge-batt">🔋 ${rip.powerstatus}</span>`

      const errDateHtml = (mostra('data_errore') && rip.errordate && rip.errordate !== '--.--.--' && rip.errordate !== '')
        ? `<div class="card-errordate">Errore dal: ${rip.errordate}</div>` : ''

      // Valore anno precedente (stesso mese anno-1)
      let annoPrec = ''
      if (rip.hcaAgostoPrecedente && rip.date) {
        const partiData = rip.date.split('.')
        if (partiData.length === 3) {
          const mese = parseInt(partiData[1]) - 1
          let anno = parseInt(partiData[2]); if (anno < 100) anno += 2000
          annoPrec = `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;padding-top:4px;border-top:1px dashed #f1f5f9;">
            <span style="font-size:7px;color:#94a3b8;">${MESI_LABEL[mese]} ${anno - 1}</span>
            <span style="font-size:9px;color:#a78bfa;font-weight:600;">${rip.hcaAgostoPrecedente.value} H.C.A.</span>
          </div>`
        }
      }

      // Contabilizzatori: consumo dell'anno solare (o dal montaggio)
      let consumoHtml = ''
      if (mostra('consumo_periodo') && isContatore(tipo) && rip.consumo) {
        consumoHtml = `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;padding-top:4px;border-top:1px dashed #f1f5f9;">
            <span style="font-size:7px;color:#94a3b8;">Consumo ${rip.consumo.dalMontaggio ? 'dal montaggio' : (rip.consumo.periodo || '').toLowerCase()}</span>
            <span style="font-size:9px;color:#a78bfa;font-weight:600;">${fmtValore(rip.consumo.valore, tipo)} ${unita}</span>
          </div>`
      }

      const noteRip = rip.note_rip
        ? `<div style="font-size:7.5px;color:#6b7280;font-style:italic;margin-top:4px;border-top:1px solid #f1f5f9;padding-top:4px;">📝 ${rip.note_rip}</div>` : ''

      // Campi tecnici opzionali
      const techRows = [
        mostra('manufact')  && rip.manufact   ? `<div style="display:flex;justify-content:space-between;font-size:7.5px;padding:1px 0;"><span style="color:#94a3b8;">Produttore</span><span style="color:#475569;font-weight:600;">${rip.manufact}</span></div>` : '',
        mostra('version')   && rip.devversion ? `<div style="display:flex;justify-content:space-between;font-size:7.5px;padding:1px 0;"><span style="color:#94a3b8;">Firmware</span><span style="color:#475569;font-family:monospace;">${rip.devversion}</span></div>` : '',
        mostra('accessnr')  && rip.accessnr   ? `<div style="display:flex;justify-content:space-between;font-size:7.5px;padding:1px 0;"><span style="color:#94a3b8;">N. Accesso</span><span style="color:#475569;font-family:monospace;">${rip.accessnr}</span></div>` : '',
        mostra('subnet')    && rip.subnet     ? `<div style="display:flex;justify-content:space-between;font-size:7.5px;padding:1px 0;"><span style="color:#94a3b8;">Subnet</span><span style="color:#475569;font-family:monospace;">${rip.subnet}</span></div>` : '',
        mostra('receiver')  && rip.receiver   ? `<div style="display:flex;justify-content:space-between;font-size:7.5px;padding:1px 0;"><span style="color:#94a3b8;">Receiver</span><span style="color:#475569;font-family:monospace;">${rip.receiver}</span></div>` : '',
        mostra('signature') && rip.signature  ? `<div style="display:flex;justify-content:space-between;font-size:7.5px;padding:1px 0;"><span style="color:#94a3b8;">Firma</span><span style="color:#475569;font-family:monospace;font-size:6.5px;">${rip.signatureDescr || rip.signature}</span></div>` : '',
      ].filter(Boolean).join('')
      const techHtml = techRows ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #f1f5f9;">${techRows}</div>` : ''

      const storicoArr = mostra('storico_mensile') ? (rip.hcaStorico || []) : []
      let storicoHtml = ''
      if (storicoArr.length > 0) {
        const rows = storicoArr.slice(0, 12).map(h => `
          <div class="storico-row">
            <span class="storico-data">${h.dataCalcolata || h.data || '—'}<span class="storico-label">${h.labelMese || ''}${isContatore(tipo) && h.consumoMese !== null && h.consumoMese !== undefined ? ` · ${h.consumoMese >= 0 ? '+' : ''}${fmtValore(h.consumoMese, tipo)}` : ''}</span></span>
            <span class="storico-val">${fmtValore(h.value, tipo)} ${unita}</span>
          </div>`).join('')
        storicoHtml = `<div class="card-storico-section"><div class="card-storico-title">${isContatore(tipo) ? 'LETTURE FINE MESE (ULTIMI 12)' : 'STORICO ULTIMI 12 MESI'}</div>${rows}</div>`
      }

      return `
        <div class="card">
          <div class="card-header">
            <div style="display:flex;align-items:center;gap:4px;">
              ${iconaTipoSvg(tipo)}
              <span class="card-matricola">${matricola}</span>
            </div>
            <div class="card-status ${isErr ? 'status-err' : 'status-ok'}">${isErr ? '✕' : '✓'}</div>
          </div>
          <div class="card-locale">${locale}</div>
          ${mostra('valore_corrente') ? `<div class="card-value-container"><span class="card-value">${valore}</span><span class="card-unit">${unita}</span></div>${annoPrec}${consumoHtml}` : ''}
          ${mostra('data_lettura') || mostra('ora_lettura') ? `<div class="card-datetime">${mostra('data_lettura') ? rip.date || '' : ''}${mostra('ora_lettura') && rip.time ? ' ' + rip.time : ''}</div>` : ''}
          ${badgesHtml ? `<div class="card-badges">${badgesHtml}</div>` : ''}
          ${errDateHtml}
          ${noteRip}
          ${storicoHtml}
          ${techHtml}
        </div>`
    }
    
    let bodyHtml = ''
    if (modalita === 'tutti') { 
      const colonne = campiVisibili.map(k => CAMPI[k]).filter(Boolean)
      let blocchi = ''
      condominiData.forEach(cond => {
        const righe = []
        const rowMeta = []
        // Indice della colonna data_lettura per il badge avviso (fallback: seconda colonna)
        const _foundAvviso = colonne.findIndex(col => col === CAMPI['data_lettura'])
        const idxAvviso = _foundAvviso >= 0 ? _foundAvviso : Math.min(1, colonne.length - 1)
        Object.values(cond.piani).forEach(piano => {
          Object.values(piano.unita).forEach(unita => {
            unita.ripartitori.forEach(rip => {
              if (rip.nessuna_lettura) {
                // Tutte le colonne usano fn() normalmente → matricola, locale ecc. visibili
                // Solo la colonna data_lettura viene sostituita con il badge avviso
                righe.push(colonne.map((col, i) => i === idxAvviso ? '__MANCANZA__' : (col.fn ? col.fn(rip, unita, piano, cond) : '—')))
                rowMeta.push({ mancanza: true })
              } else {
                righe.push(colonne.map(col => col.fn(rip, unita, piano, cond)))
                rowMeta.push({})
              }
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
              ${htmlTabella(colonne, righe, rowMeta)}
            </div>
          </div>` 
      })
      bodyHtml = `${htmlHeader('1')}<div style="padding:14px 24px 8px;">${blocchi}</div>${htmlFooter()}` 
    } else { 
      const selezionate = unitaSelezionate || (unitaSelezionata ? [unitaSelezionata] : [])
      let pIndex = 1
      condominiData.forEach(cond => { 
        Object.values(cond.piani).forEach(piano => { 
          Object.values(piano.unita).forEach(unita => { 
            if (selezionate.length === 0 || selezionate.includes(unita.proprietario)) { 
              const cardsHtml = unita.ripartitori.map(rip => buildCard(rip, unita)).join('')
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
                      <div class="label-group"><div class="label-title">Piano</div><div class="label-value">${piano.nome}</div></div>
                      <div class="divider"></div>
                      <div class="label-group"><div class="label-title">Proprietario</div><div class="label-value primary">${unita.proprietario || '—'}</div></div>
                      <div class="divider"></div>
                      <div class="label-group"><div class="label-title">Interno</div><div class="label-value">${unita.interno || '—'}</div></div>
                    </div>
                  </div>
                  ${unita.note ? `<div style="padding:6px 24px;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:8px;color:#92400e;">📝 ${unita.note}</div>` : ''}
                  <div class="cards-grid">${cardsHtml}</div>
                  ${htmlFooter()}
                </div>` 
            } 
          }) 
        }) 
      }) 
    }
    
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS_BASE}</style></head><body>${bodyHtml}</body></html>`
    const { BrowserWindow: ElectronBW } = require('electron')
    const workerWindow = new ElectronBW({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } })
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
    try { 
      fs.unlinkSync(tmpHtmlPath) 
    } catch(e) {}
    
    return { success: true, filePath: savePath.filePath } 
  } catch (err) { 
    return { success: false, error: err.message } 
  } 
})

// ─── IPC: Storico letture XML ────────────────────────────────────────────────

// Salva lettura XML nel DB — chiamato dopo ogni import XML riuscito
// ─── Funzioni comuni per i PDF aggiuntivi (Lista Guasti) ─────
function leggiImpostazioniMap() {
  const imp = {}
  queryAll('SELECT chiave, valore FROM impostazioni').forEach(r => { imp[r.chiave] = r.valore })
  return imp
}

function costruisciLogoHtml(logoPath) {
  let logoDataUri = ''
  let logoW = 0, logoH = 0
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      const buf = fs.readFileSync(logoPath)
      const ext = logoPath.toLowerCase().endsWith('.jpg') || logoPath.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png'
      logoDataUri = `data:image/${ext};base64,${buf.toString('base64')}`
      try { const sizeOf = require('image-size'); const dims = sizeOf(buf); logoW = dims.width; logoH = dims.height } catch(e) { logoW = 100; logoH = 100 }
    } catch(e) { logoDataUri = '' }
  }
  const logoMaxH = 36, logoMaxW = 120
  const logoStyle = (logoW > 0 && logoH > 0)
    ? `height:${logoMaxH}px;width:${Math.min(Math.round(logoMaxH * (logoW / logoH)), logoMaxW)}px;object-fit:contain;`
    : `height:${logoMaxH}px;max-width:${logoMaxW}px;object-fit:contain;`
  return logoDataUri
    ? `<img src="${logoDataUri}" style="${logoStyle}" />`
    : `<div style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg></div>`
}

async function stampaHtmlInPdf(html, filePath, landscape = true) {
  const { BrowserWindow: ElectronBW } = require('electron')
  const workerWindow = new ElectronBW({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } })
  const tmpHtmlPath = path.join(app.getPath('userData'), `print_tmp_${Date.now()}.html`)
  try {
    fs.writeFileSync(tmpHtmlPath, html, 'utf8')
    await workerWindow.loadFile(tmpHtmlPath)
    const pdfBuffer = await workerWindow.webContents.printToPDF({
      printBackground: true, landscape, pageSize: 'A4',
      margins: { marginType: 'custom', top: 0.3, bottom: 0.3, left: 0, right: 0 },
    })
    fs.writeFileSync(filePath, pdfBuffer)
  } finally {
    workerWindow.destroy()
    try { fs.unlinkSync(tmpHtmlPath) } catch(e) {}
  }
}

function escHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── IPC: dispositivi con la lettura dell'ultimo import di ogni condominio ──
// condominioId = null → tutti i condomini. Esclusi i condomini mai importati.
ipcMain.handle('get-dispositivi-ultima-lettura', (_, { condominioId } = {}) => {
  try {
    const ultime = queryAll(`
      SELECT p.condominio_id AS cid, MAX(l.data_lettura) AS ultima
      FROM letture l
      JOIN ripartitori r ON l.ripartitore_id = r.id
      JOIN unita u ON r.unita_id = u.id
      JOIN piani p ON u.piano_id = p.id
      GROUP BY p.condominio_id
    `)
    const ultimaPer = {}
    ultime.forEach(u => { ultimaPer[u.cid] = u.ultima })
    const condomini = queryAll('SELECT * FROM condomini ORDER BY nome COLLATE NOCASE')
      .filter(c => (condominioId ? c.id === condominioId : true))
    const risultato = []
    let senzaImport = 0
    for (const c of condomini) {
      const ultima = ultimaPer[c.id]
      if (!ultima) { senzaImport++; continue }
      const rows = queryAll(`
        SELECT
          r.id AS ripartitore_id, r.matricola, r.locale, r.tipo AS rip_tipo, r.note AS note_rip,
          u.id AS unita_id, u.proprietario, u.interno, u.note AS note_unita,
          p.id AS piano_id, p.nome AS piano,
          l.id AS lettura_id, l.data_lettura, l.hca_valore, l.hca_storico_json, l.hca_ago_prec_json, l.tech_json,
          l.errorflags, l.status, l.powerstatus, l.errordate, l.tipo, l.unita, l.consumo_json
        FROM ripartitori r
        JOIN unita u ON r.unita_id = u.id
        JOIN piani p ON u.piano_id = p.id
        LEFT JOIN letture l ON l.ripartitore_id = r.id AND l.data_lettura = ?
        WHERE p.condominio_id = ?
        ORDER BY p.id, u.id, r.id
      `, [ultima, c.id])
      risultato.push({ condominio: { id: c.id, nome: c.nome, indirizzo: c.indirizzo, citta: c.citta }, ultimaData: ultima, rows })
    }
    return { success: true, condomini: risultato, senzaImport }
  } catch (err) {
    return { success: false, error: err.message, condomini: [] }
  }
})

// ─── IPC: PDF stampabile della Lista Guasti ─────────────────
// gruppi: [{ condominio, indirizzo, ultimaData, righe: [{ piano, interno, utente, locale, matricola, dispositivo, problemi: [{testo, azione, gravita}] }] }]
ipcMain.handle('genera-pdf-guasti', async (_, { gruppi, filtroDescr }) => {
  try {
    const oggi = new Date().toLocaleDateString('it-IT').replace(/\//g, '-')
    const savePath = await dialog.showSaveDialog(mainWindow, {
      title: 'Salva Lista Guasti',
      defaultPath: `Lista_Guasti_${oggi}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    })
    if (savePath.canceled || !savePath.filePath) return { success: false }

    const imp = leggiImpostazioniMap()
    const intestazione = escHtml(imp.intestazione || 'Ripartitori e contabilizzatori')
    const pieDiPagina = escHtml(imp.pie_di_pagina || '')
    const logoHtml = costruisciLogoHtml(imp.logo_aziendale || '')
    const dataStr = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
    const totale = gruppi.reduce((a, g) => a + g.righe.length, 0)
    const COLORI = { sostituire: ['#fef2f2', '#dc2626', '#fecaca'], verificare: ['#fffbeb', '#b45309', '#fde68a'], mancante: ['#f8fafc', '#475569', '#e2e8f0'] }

    const badge = (p) => {
      const [bg, fg, bd] = COLORI[p.gravita] || COLORI.verificare
      return `<div style="margin:1px 0;"><span style="background:${bg};color:${fg};border:1px solid ${bd};font-weight:700;font-size:7px;padding:1px 6px;border-radius:9px;">${escHtml(p.azione)}</span> <span style="color:#334155;">${escHtml(p.testo)}</span></div>`
    }

    const corpo = gruppi.map(g => `
      <tr class="banda"><td colspan="9">
        <span style="font-weight:700;font-size:10px;color:#1e1b4b;">${escHtml(g.condominio)}</span>
        <span style="color:#64748b;font-size:8px;margin-left:8px;">${escHtml([g.indirizzo, g.citta].filter(Boolean).join(', '))}</span>
        <span style="float:right;color:#4f46e5;font-size:8px;font-weight:600;">${g.righe.length} dispositivi · ultima lettura ${escHtml(g.ultimaData || '—')}</span>
      </td></tr>
      ${g.righe.map(r => `<tr>
        <td class="check">☐</td>
        <td>${escHtml(r.piano)}</td>
        <td>${escHtml(r.interno)}</td>
        <td>${escHtml(r.utente)}</td>
        <td>${escHtml(r.locale)}</td>
        <td class="mono">${escHtml(r.matricola)}</td>
        <td>${escHtml(r.dispositivo)}</td>
        <td>${r.problemi.map(badge).join('')}</td>
        <td class="note"></td>
      </tr>`).join('')}
    `).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Segoe UI','Inter',system-ui,sans-serif; color:#1a1a2e; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      table { width:100%; border-collapse:collapse; font-size:8px; }
      thead { display:table-header-group; }
      th { padding:6px 6px; color:#4f46e5; font-weight:700; font-size:7px; letter-spacing:0.8px; text-transform:uppercase; text-align:left; border-bottom:2px solid #4f46e5; background:#fff; }
      td { padding:5px 6px; color:#444466; vertical-align:top; border-bottom:1px solid #eef0f6; }
      tr { page-break-inside:avoid; break-inside:avoid; }
      tr.banda td { background:#eef2ff; border-bottom:1px solid #c7d2fe; padding:7px 8px; }
      .mono { font-family:'Courier New',monospace; font-weight:600; }
      .check { font-size:11px; color:#94a3b8; width:18px; text-align:center; }
      .note { width:130px; }
      .wrap { padding:12px 20px; }
      .footer { padding:8px 20px; border-top:1px solid #ebebf8; display:flex; justify-content:space-between; font-size:7.5px; color:#aaaacc; }
    </style></head><body>
      <div style="background:linear-gradient(135deg,#312e81 0%,#4f46e5 60%,#6366f1 100%);padding:18px 24px 14px;position:relative;overflow:hidden;">
        <div style="position:absolute;top:-20px;right:50px;width:90px;height:90px;border-radius:50%;background:rgba(255,255,255,0.06);"></div>
        <div style="position:absolute;top:8px;right:16px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.08);"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;position:relative;">
          <div style="display:flex;align-items:center;gap:14px;">
            ${logoHtml}
            <div>
              <div style="color:rgba(255,255,255,0.55);font-size:8px;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px;">${intestazione}</div>
              <div style="color:white;font-size:13px;font-weight:700;">Lista Guasti</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="color:rgba(255,255,255,0.45);font-size:7px;text-transform:uppercase;letter-spacing:1px;">Generato il</div>
            <div style="color:white;font-size:10px;font-weight:600;margin-top:2px;">${dataStr}</div>
            <div style="color:rgba(255,255,255,0.6);font-size:7.5px;margin-top:2px;">${totale} dispositivi${filtroDescr ? ' · ' + escHtml(filtroDescr) : ''}</div>
          </div>
        </div>
      </div>
      <div class="wrap">
        <table>
          <thead><tr><th>Fatto</th><th>Piano</th><th>Interno</th><th>Utente</th><th>Locale</th><th>Matricola</th><th>Dispositivo</th><th>Problema e azione</th><th>Note intervento</th></tr></thead>
          <tbody>${corpo || '<tr><td colspan="9" style="text-align:center;padding:20px;">Nessun guasto</td></tr>'}</tbody>
        </table>
      </div>
      <div class="footer"><span>${pieDiPagina}</span><span>QUNDIS Ripartitori App</span></div>
    </body></html>`

    await stampaHtmlInPdf(html, savePath.filePath, true)
    return { success: true, filePath: savePath.filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: esportazione Excel (.xlsx) ─────────────────────────
// fogli: [{ nome, colonne: [{ titolo, larghezza, decimali }], righe: [[...]] }]
ipcMain.handle('esporta-excel', async (_, { fogli, nomeFile }) => {
  try {
    const savePath = await dialog.showSaveDialog(mainWindow, {
      title: 'Salva file Excel',
      defaultPath: (nomeFile || 'Letture') + '.xlsx',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })
    if (savePath.canceled || !savePath.filePath) return { success: false }
    const { creaXlsx } = require('./xlsx')
    fs.writeFileSync(savePath.filePath, creaXlsx(fogli))
    return { success: true, filePath: savePath.filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── IPC: apre un file con il programma predefinito ─────────
ipcMain.handle('apri-file', (_, { filePath }) => {
  const { shell } = require('electron')
  if (filePath && fs.existsSync(filePath)) shell.openPath(filePath)
  return true
})

ipcMain.handle('salva-letture', (_, { lettureArray }) => {
  if (dbSolaLettura) return { success: false, error: 'Database in sola lettura (in uso su un altro PC)' }
  eseguiBackup()
  try {
    db.run('BEGIN')
    let salvate = 0
    for (const l of lettureArray) {
      // Cerca il ripartitore per matricola
      const rip = queryAll('SELECT id FROM ripartitori WHERE matricola = ?', [l.matricola])[0]
      if (!rip) continue
      // Tipo dispositivo riconosciuto dall'XML (HCA / CALORE / ACS / AFS)
      if (l.tipo) db.run('UPDATE ripartitori SET tipo = ? WHERE id = ?', [l.tipo, rip.id])
      // Controlla se esiste già: stessa matricola + stessa data lettura
      const esistente = queryAll(
        'SELECT id FROM letture WHERE ripartitore_id = ? AND data_lettura = ?',
        [rip.id, l.data_lettura]
      )
      if (esistente.length > 0) {
        // Aggiorna il record esistente (es. re-import per popolare hca_ago_prec_json)
        db.run(`UPDATE letture SET
          hca_valore = ?, hca_storico_json = ?, errorflags = ?, status = ?,
          powerstatus = ?, errordate = ?, hca_ago_prec_json = ?, tech_json = ?,
          tipo = ?, unita = ?, consumo_json = ?
          WHERE id = ?`,
          [
            l.hca_valore !== undefined ? l.hca_valore : null,
            l.hca_storico_json || '[]',
            l.errorflags || '0',
            l.status || '0',
            l.powerstatus || '',
            l.errordate || '',
            l.hca_ago_prec_json || null,
            l.tech_json || null,
            l.tipo || 'HCA',
            l.unita || 'H.C.A.',
            l.consumo_json || null,
            esistente[0].id,
          ]
        )
        salvate++
        continue
      }
      db.run(`INSERT INTO letture
        (ripartitore_id, data_lettura, data_importazione, hca_valore, hca_storico_json, errorflags, status, powerstatus, errordate, note, hca_ago_prec_json, tech_json, tipo, unita, consumo_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rip.id,
          l.data_lettura || '',
          oggiLocale(),
          l.hca_valore !== undefined ? l.hca_valore : null,
          l.hca_storico_json || '[]',
          l.errorflags || '0',
          l.status || '0',
          l.powerstatus || '',
          l.errordate || '',
          l.note || '',
          l.hca_ago_prec_json || null,
          l.tech_json || null,
          l.tipo || 'HCA',
          l.unita || 'H.C.A.',
          l.consumo_json || null,
        ]
      )
      salvate++
    }
    db.run('COMMIT')
    saveDatabase()
    return { success: true, salvate }
  } catch(err) {
    db.run('ROLLBACK')
    return { success: false, error: err.message }
  }
})

// Storico letture per un ripartitore specifico (per i grafici)
ipcMain.handle('get-storico-letture-ripartitore', (_, { matricola }) => {
  try {
    const rip = queryAll('SELECT id FROM ripartitori WHERE matricola = ?', [matricola])[0]
    if (!rip) return { success: true, letture: [] }
    const letture = queryAll(
      `SELECT * FROM letture WHERE ripartitore_id = ? ORDER BY data_lettura ASC`,
      [rip.id]
    )
    return { success: true, letture }
  } catch(err) {
    return { success: false, error: err.message, letture: [] }
  }
})

// Storico letture per tutti i ripartitori di un condominio (per la sezione analisi)
ipcMain.handle('get-storico-condominio', (_, { condominioId }) => {
  try {
    const rows = queryAll(`
      SELECT
        l.id, l.data_lettura, l.data_importazione,
        l.hca_valore, l.hca_storico_json, l.hca_ago_prec_json, l.tech_json,
        l.errorflags, l.status, l.powerstatus, l.errordate,
        l.tipo, l.unita, l.consumo_json,
        r.matricola, r.locale, r.id as ripartitore_id, r.tipo as rip_tipo,
        u.proprietario, u.interno, u.id as unita_id,
        p.nome as piano, p.id as piano_id
      FROM letture l
      JOIN ripartitori r ON l.ripartitore_id = r.id
      JOIN unita u ON r.unita_id = u.id
      JOIN piani p ON u.piano_id = p.id
      WHERE p.condominio_id = ?
      ORDER BY r.matricola, l.data_lettura ASC
    `, [condominioId])
    return { success: true, rows }
  } catch(err) {
    return { success: false, error: err.message, rows: [] }
  }
})

// Matricole nell'XML senza corrispondenza nel DB (per rilevamento sostituzioni)
ipcMain.handle('get-matricole-db', (_, { condominioId }) => {
  try {
    const rows = queryAll(`
      SELECT r.matricola, r.locale, r.id,
             u.proprietario, u.interno, u.id as unita_id,
             p.nome as piano
      FROM ripartitori r
      JOIN unita u ON r.unita_id = u.id
      JOIN piani p ON u.piano_id = p.id
      WHERE p.condominio_id = ?
      ORDER BY p.nome, u.proprietario, r.locale
    `, [condominioId])
    return { success: true, rows }
  } catch(err) {
    return { success: false, error: err.message, rows: [] }
  }
})

// Registra sostituzione e aggiorna matricola nel DB
ipcMain.handle('registra-sostituzione', (_, { ripartitoreId, vecchiaMatricola, nuovaMatricola, dataSostituzione, motivo, note }) => {
  try {
    db.run('BEGIN')
    // Registra la sostituzione
    db.run(`INSERT INTO sostituzioni
      (ripartitore_id, data_sostituzione, vecchia_matricola, nuova_matricola, motivo, note)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [ripartitoreId, dataSostituzione, vecchiaMatricola, nuovaMatricola, motivo || '', note || '']
    )
    // Aggiorna la matricola nel DB
    db.run('UPDATE ripartitori SET matricola = ? WHERE id = ?', [nuovaMatricola, ripartitoreId])
    db.run('COMMIT')
    saveDatabase()
    return { success: true }
  } catch(err) {
    db.run('ROLLBACK')
    return { success: false, error: err.message }
  }
})

// Storico sostituzioni per un condominio
ipcMain.handle('get-sostituzioni-condominio', (_, { condominioId }) => {
  try {
    const rows = queryAll(`
      SELECT s.*, r.locale, u.proprietario, u.interno, p.nome as piano
      FROM sostituzioni s
      JOIN ripartitori r ON s.ripartitore_id = r.id
      JOIN unita u ON r.unita_id = u.id
      JOIN piani p ON u.piano_id = p.id
      WHERE p.condominio_id = ?
      ORDER BY s.data_sostituzione DESC
    `, [condominioId])
    return { success: true, rows }
  } catch(err) {
    return { success: false, error: err.message, rows: [] }
  }
})

ipcMain.handle('get-db-path', () => { 
  return getDbPath() 
})

ipcMain.handle('set-db-path', async (_, nuovoPercorso) => { 
  try { 
    const dir = path.dirname(nuovoPercorso)
    if (!fs.existsSync(dir)) {
      return { success: false, error: 'Cartella non trovata: ' + dir }
    }
    if (!fs.existsSync(nuovoPercorso)) { 
      const data = db.export()
      fs.writeFileSync(nuovoPercorso, Buffer.from(data)) 
    }
 
    rilasciaLock()
    setDbPath(nuovoPercorso)
    ricaricaDbDaDisco()
    acquisisciLock()
    eseguiBackup()
    notificaStatoDb()
    return { success: true, ...statoDb() } 
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
      ricaricaDbDaDisco()
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
    const { exec } = require('child_process')
    const psScript = `
      $outlook = New-Object -ComObject Outlook.Application
      $mail = $outlook.CreateItem(0)
      $mail.Attachments.Add("${pdfPath.replace(/\\/g, '\\\\')}")
      $mail.Display($true)`

    const psEncoded = Buffer.from(psScript, 'utf16le').toString('base64')
    await new Promise((resolve, reject) => {
      exec('powershell -EncodedCommand ' + psEncoded, { windowsHide: true }, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    return { success: true } 
  } catch (err) { 
    return { success: false, error: err.message } 
  } 
})

// ─── Letture da email (Outlook sul PC o Microsoft 365 + zip QUNDIS) ───
const m365 = require('./m365')
const outlook = require('./outlook')
const { estraiZip } = require('./zipcrypto')
const { safeStorage } = require('electron')

// fonte: '' = disattivato, 'outlook' = Outlook classico sul PC, 'm365' = Microsoft 365 (richiede consenso)
const EMAIL_DEFAULT = { mittente: 'donotreply@q-smp.com', cartella: 'Letture importate', fonte: '' }

function fileConfigEmail() {
  return path.join(app.getPath('userData'), 'email-config.json')
}

// Configurazione per PC: mittente, cartella di destinazione e password degli zip (cifrata)
function leggiConfigEmail() {
  let cfg = {}
  try { cfg = JSON.parse(fs.readFileSync(fileConfigEmail(), 'utf8')) } catch {}
  let passwordZip = ''
  if (cfg.passwordZip) {
    try { passwordZip = safeStorage.decryptString(Buffer.from(cfg.passwordZip, 'base64')) } catch {}
  }
  return {
    fonte: cfg.fonte || EMAIL_DEFAULT.fonte,
    mittente: cfg.mittente || EMAIL_DEFAULT.mittente,
    cartella: cfg.cartella || EMAIL_DEFAULT.cartella,
    passwordZip,
    ignorati: Array.isArray(cfg.ignorati) ? cfg.ignorati : [],
  }
}

function scriviConfigEmail({ fonte, mittente, cartella, passwordZip }) {
  let cfg = {}
  try { cfg = JSON.parse(fs.readFileSync(fileConfigEmail(), 'utf8')) } catch {}
  if (fonte !== undefined) cfg.fonte = ['outlook', 'm365'].includes(fonte) ? fonte : ''
  if (mittente !== undefined) cfg.mittente = String(mittente).trim()
  if (cartella !== undefined) cfg.cartella = String(cartella).trim()
  if (passwordZip !== undefined) {
    if (!passwordZip) delete cfg.passwordZip
    else {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Cifratura di Windows non disponibile')
      cfg.passwordZip = safeStorage.encryptString(String(passwordZip)).toString('base64')
    }
  }
  fs.writeFileSync(fileConfigEmail(), JSON.stringify(cfg, null, 2))
}

function nomeFileSicuro(nome) {
  return String(nome).replace(/[\\/:*?"<>|]/g, '_')
}

// Dati essenziali di un XML siemeca senza parser DOM (nel processo principale)
function analizzaXmlEmail(testo) {
  const concentratore = (testo.match(/<communicator>[\s\S]*?<serialnr>\s*(\d+)\s*<\/serialnr>/) || [])[1] || ''
  const matricole = []
  let dataLettura = ''
  const blocchi = testo.match(/<measuredev\b[\s\S]*?<\/measuredev>/g) || []
  for (const b of blocchi) {
    const m = b.match(/<identnr>\s*(\d+)\s*<\/identnr>/)
    if (m) matricole.push(m[1])
    if (!dataLettura) {
      const d = b.match(/<date>\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*<\/date>/)
      if (d) {
        let aa = parseInt(d[3], 10)
        if (aa < 100) aa += 2000
        dataLettura = `${aa}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`
      }
    }
  }
  return { concentratore, matricole, dataLettura }
}

// Report HTML del gateway: elenco dei dispositivi non ricevuti
function analizzaReportGateway(html) {
  const trovati = (html.match(/meters found:\s*<b>(\d+)<\/b>/i) || [])[1]
  const mancanti = []
  const re = /<tr>\s*<td>\d+<\/td>\s*<td>[^<]*<\/td>\s*<td>(\d+)<\/td>/g
  let m
  while ((m = re.exec(html))) mancanti.push(m[1])
  return { trovati: trovati ? parseInt(trovati, 10) : null, mancanti }
}

ipcMain.handle('m365-stato', () => {
  try { return { success: true, ...m365.stato() } }
  catch (err) { return { success: false, error: err.message } }
})

ipcMain.handle('m365-collega', async () => {
  try { return { success: true, ...(await m365.collega(mainWindow)) } }
  catch (err) { return { success: false, error: err.message } }
})

ipcMain.handle('m365-scollega', () => {
  try { return { success: true, ...m365.scollega() } }
  catch (err) { return { success: false, error: err.message } }
})

ipcMain.handle('email-config-get', () => {
  const cfg = leggiConfigEmail()
  return { success: true, fonte: cfg.fonte, mittente: cfg.mittente, cartella: cfg.cartella, passwordImpostata: !!cfg.passwordZip }
})

// La lettura email è attiva su questo PC?
ipcMain.handle('email-stato', () => {
  try {
    const cfg = leggiConfigEmail()
    if (cfg.fonte === 'outlook') return { success: true, attiva: true, fonte: 'outlook' }
    if (cfg.fonte === 'm365') {
      const st = m365.stato()
      return { success: true, attiva: st.collegato, fonte: 'm365', account: st.account || '' }
    }
    return { success: true, attiva: false, fonte: '' }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Email da non proporre più (es. zip con password diversa)
ipcMain.handle('email-ignora', (_, { ids = [] } = {}) => {
  try {
    let cfg = {}
    try { cfg = JSON.parse(fs.readFileSync(fileConfigEmail(), 'utf8')) } catch {}
    const elenco = new Set(Array.isArray(cfg.ignorati) ? cfg.ignorati : [])
    ids.forEach(id => elenco.add(String(id)))
    cfg.ignorati = [...elenco].slice(-500)
    fs.writeFileSync(fileConfigEmail(), JSON.stringify(cfg, null, 2))
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('email-outlook-prova', async (_, { mittente } = {}) => {
  try {
    const r = await outlook.prova(mittente || leggiConfigEmail().mittente)
    return { success: true, ...r }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('email-config-set', (_, dati = {}) => {
  try { scriviConfigEmail(dati); return { success: true } }
  catch (err) { return { success: false, error: err.message } }
})

// Cerca le mail del gateway, estrae gli XML e propone il condominio di ciascuno
ipcMain.handle('email-controlla', async (event) => {
  // Messaggi di avanzamento per la finestra "Controllo email"
  const avanza = (testo, tipo = 'info') => {
    try { if (!event.sender.isDestroyed()) event.sender.send('email-progresso', { testo, tipo }) } catch {}
  }
  try {
    const cfg = leggiConfigEmail()
    if (!cfg.fonte) return { success: false, error: 'Lettura email non attiva: configurala in Impostazioni' }
    if (cfg.fonte === 'm365' && !m365.stato().collegato) return { success: false, error: 'Microsoft 365 non collegato' }

    // Cartella temporanea pulita a ogni controllo
    const cartellaTmp = path.join(app.getPath('userData'), 'email-in')
    try { fs.rmSync(cartellaTmp, { recursive: true, force: true }) } catch {}
    fs.mkdirSync(cartellaTmp, { recursive: true })

    // Elenco mail con i loro zip: [{ id, oggetto, ricevuta, zips: [{ nome, dati }], errori }]
    let messaggiMail = []
    if (cfg.fonte === 'outlook') {
      messaggiMail = (await outlook.messaggiConZip(cfg.mittente, path.join(cartellaTmp, 'zip'), t => avanza(t))).map(m => ({ ...m, errori: [] }))
    } else {
      avanza('Collegamento a Microsoft 365…')
      for (const msg of await m365.messaggiDaMittente(cfg.mittente)) {
        const voce = { id: msg.id, oggetto: msg.subject || '', ricevuta: msg.receivedDateTime || '', zips: [], errori: [] }
        try { voce.zips = await m365.allegatiZip(msg.id) }
        catch (err) { voce.errori.push(`Allegati non scaricati: ${err.message}`) }
        messaggiMail.push(voce)
      }
    }

    // Matricola → condominio, per riconoscere a chi appartiene ogni XML
    const perMatricola = {}
    queryAll(`
      SELECT r.matricola, p.condominio_id AS cid
      FROM ripartitori r
      JOIN unita u ON r.unita_id = u.id
      JOIN piani p ON u.piano_id = p.id
    `).forEach(r => { perMatricola[String(r.matricola).trim()] = r.cid })
    const condomini = queryAll('SELECT id, nome FROM condomini ORDER BY nome COLLATE NOCASE')
    const nomeCond = {}
    condomini.forEach(c => { nomeCond[c.id] = c.nome })
    const imp = leggiImpostazioniMap()

    const messaggi = []
    let n = 0
    const ignorati = new Set(cfg.ignorati)
    const daIgnorare = messaggiMail.filter(m => ignorati.has(String(m.id))).length
    if (daIgnorare > 0) avanza(`${daIgnorare} email ignorate in precedenza: saltate`)
    for (const msg of messaggiMail) {
      if (ignorati.has(String(msg.id))) continue
      const voce = { id: msg.id, oggetto: msg.oggetto, ricevuta: msg.ricevuta, files: [], errori: [...msg.errori] }
      const zips = msg.zips

      for (const zip of zips) {
        let contenuti
        try { contenuti = estraiZip(zip.dati, cfg.passwordZip) }
        catch (err) { voce.errori.push(`${zip.nome}: ${err.message}`); avanza(`✕ ${zip.nome}: ${err.message}`, 'error'); continue }
        avanza(`Zip aperto: ${zip.nome}`)

        const report = {}
        contenuti.filter(f => /\.html?$/i.test(f.nome)).forEach(f => {
          report[f.nome.replace(/\.html?$/i, '')] = analizzaReportGateway(f.dati.toString('utf8'))
        })

        for (const f of contenuti.filter(f => /\.xml$/i.test(f.nome))) {
          n++
          const percorso = path.join(cartellaTmp, `${String(n).padStart(3, '0')}_${nomeFileSicuro(f.nome)}`)
          fs.writeFileSync(percorso, f.dati)
          const { concentratore, matricole, dataLettura } = analizzaXmlEmail(f.dati.toString('utf8'))

          // Condominio con più matricole in comune; se nessuna, quello già associato al concentratore
          const conteggio = {}
          matricole.forEach(m => {
            const cid = perMatricola[m]
            if (cid) conteggio[cid] = (conteggio[cid] || 0) + 1
          })
          let condominioId = null
          let abbinati = 0
          Object.entries(conteggio).forEach(([cid, c]) => {
            if (c > abbinati) { abbinati = c; condominioId = Number(cid) }
          })
          let fonte = condominioId ? 'matricole' : ''
          if (!condominioId && concentratore && imp[`concentratore_${concentratore}`]) {
            const cid = Number(imp[`concentratore_${concentratore}`])
            if (nomeCond[cid]) { condominioId = cid; fonte = 'concentratore' }
          }

          avanza(condominioId
            ? `✓ Concentratore ${concentratore || '?'} (${matricole.length} dispositivi) → ${nomeCond[condominioId]}${fonte === 'matricole' ? ` (${abbinati} matricole riconosciute)` : ' (dal concentratore)'}`
            : `⚠ Concentratore ${concentratore || '?'} (${matricole.length} dispositivi): nessuna matricola in anagrafica`,
          condominioId ? 'success' : 'warn')
          voce.files.push({
            percorso,
            nome: f.nome,
            concentratore,
            dataLettura,
            dispositivi: matricole.length,
            condominioId,
            condominioNome: condominioId ? nomeCond[condominioId] : '',
            abbinati,
            fonte,
            report: report[f.nome.replace(/\.xml$/i, '')] || null,
          })
        }
      }
      // Mail dello stesso mittente senza zip (avvisi, newsletter…): ignorate
      if (zips.length === 0 && voce.errori.length === 0) continue
      messaggi.push(voce)
    }
    const nFile = messaggi.reduce((a, m) => a + m.files.length, 0)
    avanza(`Controllo completato: ${messaggi.length} email da esaminare, ${nFile} file XML`, 'success')
    return { success: true, messaggi, condomini }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Dopo l'import: ricorda concentratore → condominio e sposta le mail nella cartella
ipcMain.handle('email-segna-importate', async (_, { messageIds = [], associazioni = [] } = {}) => {
  try {
    if (!dbSolaLettura && associazioni.length > 0) {
      associazioni.forEach(a => {
        if (a.concentratore && a.condominioId) {
          db.run('INSERT OR REPLACE INTO impostazioni (chiave, valore) VALUES (?, ?)', [`concentratore_${a.concentratore}`, String(a.condominioId)])
        }
      })
      saveDatabase()
    }
    const cfg = leggiConfigEmail()
    const sorgente = cfg.fonte === 'outlook' ? outlook : m365
    const esito = messageIds.length > 0 ? await sorgente.spostaInCartella(messageIds, cfg.cartella) : { spostati: 0, errori: [] }
    return { success: true, ...esito, cartella: cfg.cartella }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
