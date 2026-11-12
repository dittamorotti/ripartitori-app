const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // GESTIONE AGGIORNAMENTI (Nuovi Metodi)
  // Registra listener aggiornamenti
  onUpdateChecking:    (cb) => ipcRenderer.on('update-checking',    ()       => cb()),
  onUpdateAvailable:   (cb) => ipcRenderer.on('update-available',   (_, i)   => cb(i)),
  onUpdateNotAvailable:(cb) => ipcRenderer.on('update-not-available',()      => cb()),
  onUpdateProgress:    (cb) => ipcRenderer.on('update-progress',    (_, p)   => cb(p)),
  onUpdateError:       (cb) => ipcRenderer.on('update-error',       (_, e)   => cb(e)),
  onUpdateDownloaded:  (cb) => ipcRenderer.on('update-downloaded',  (_, i)   => cb(i)),

  // Rimuove listener (cleanup React useEffect)
  offUpdateChecking:    () => ipcRenderer.removeAllListeners('update-checking'),
  offUpdateAvailable:   () => ipcRenderer.removeAllListeners('update-available'),
  offUpdateNotAvailable:() => ipcRenderer.removeAllListeners('update-not-available'),
  offUpdateProgress:    () => ipcRenderer.removeAllListeners('update-progress'),
  offUpdateError:       () => ipcRenderer.removeAllListeners('update-error'),
  offUpdateDownloaded:  () => ipcRenderer.removeAllListeners('update-downloaded'),

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  startDownloadUpdate: () => ipcRenderer.invoke('start-download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Condomini
  getCondomini: () => ipcRenderer.invoke('get-condomini'),

  // LETTURE DA EMAIL (Outlook sul PC o Microsoft 365)
  getEmailStato: () => ipcRenderer.invoke('email-stato'),
  provaOutlook: (dati) => ipcRenderer.invoke('email-outlook-prova', dati),
  ignoraEmail: (dati) => ipcRenderer.invoke('email-ignora', dati),
  onEmailProgresso: (cb) => ipcRenderer.on('email-progresso', (_, p) => cb(p)),
  offEmailProgresso: () => ipcRenderer.removeAllListeners('email-progresso'),
  m365Stato: () => ipcRenderer.invoke('m365-stato'),
  m365Collega: () => ipcRenderer.invoke('m365-collega'),
  m365Scollega: () => ipcRenderer.invoke('m365-scollega'),
  getEmailConfig: () => ipcRenderer.invoke('email-config-get'),
  setEmailConfig: (dati) => ipcRenderer.invoke('email-config-set', dati),
  controllaEmail: () => ipcRenderer.invoke('email-controlla'),
  segnaEmailImportate: (dati) => ipcRenderer.invoke('email-segna-importate', dati),

  addCondominio: (data) => ipcRenderer.invoke('add-condominio', data),
  updateCondominio: (data) => ipcRenderer.invoke('update-condominio', data),
  deleteCondominio: (id) => ipcRenderer.invoke('delete-condominio', id),

  // Piani
  getPiani: (condominioId) => ipcRenderer.invoke('get-piani', condominioId),
  addPiano: (data) => ipcRenderer.invoke('add-piano', data),
  updatePiano: (data) => ipcRenderer.invoke('update-piano', data),
  deletePiano: (id) => ipcRenderer.invoke('delete-piano', id),

  // Unità
  getUnita: (pianoId) => ipcRenderer.invoke('get-unita', pianoId),
  addUnita: (data) => ipcRenderer.invoke('add-unita', data),
  updateUnita: (data) => ipcRenderer.invoke('update-unita', data),
  deleteUnita: (id) => ipcRenderer.invoke('delete-unita', id),

  // Ripartitori
  getRipartitori: (unitaId) => ipcRenderer.invoke('get-ripartitori', unitaId),
  addRipartitore: (data) => ipcRenderer.invoke('add-ripartitore', data),
  updateRipartitore: (data) => ipcRenderer.invoke('update-ripartitore', data),
  deleteRipartitore: (id) => ipcRenderer.invoke('delete-ripartitore', id),

  // Anagrafica batch (performance)
  getAnagraficaCondominio: (id) => ipcRenderer.invoke('get-anagrafica-condominio', id),

  // Import CSV
  importCsv: (data) => ipcRenderer.invoke('import-csv', data),
  generaPdf: (data) => ipcRenderer.invoke('genera-pdf', data),
  cercaMatricola: (matricola) => ipcRenderer.invoke('cerca-matricola', matricola),

  // Leggi file
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),

  // Impostazioni
  getImpostazioni: () => ipcRenderer.invoke('get-impostazioni'),
  setImpostazione: (chiave, valore) => ipcRenderer.invoke('set-impostazione', chiave, valore),

  // File dialog
  openFileDialog: (filters) => ipcRenderer.invoke('open-file-dialog', filters),
  openFilesDialog: (filters) => ipcRenderer.invoke('open-files-dialog', filters),

  // Database condiviso
  getDbPath: () => ipcRenderer.invoke('get-db-path'),
  setDbPath: (percorso) => ipcRenderer.invoke('set-db-path', percorso),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  reloadDb: () => ipcRenderer.invoke('reload-db'),

  // Blocco database condiviso e backup
  getStatoDb: () => ipcRenderer.invoke('get-stato-db'),
  riprovaScritturaDb: () => ipcRenderer.invoke('riprova-scrittura-db'),
  forzaScritturaDb: () => ipcRenderer.invoke('forza-scrittura-db'),
  onDbStato: (cb) => ipcRenderer.on('db-stato', (_, s) => cb(s)),
  offDbStato: () => ipcRenderer.removeAllListeners('db-stato'),
  getBackupInfo: () => ipcRenderer.invoke('get-backup-info'),
  backupOra: () => ipcRenderer.invoke('backup-ora'),
  apriCartellaBackup: () => ipcRenderer.invoke('apri-cartella-backup'),

  // Lista Guasti ed esportazione Excel
  getDispositiviUltimaLettura: (data) => ipcRenderer.invoke('get-dispositivi-ultima-lettura', data),
  generaPdfGuasti: (data) => ipcRenderer.invoke('genera-pdf-guasti', data),
  esportaExcel: (data) => ipcRenderer.invoke('esporta-excel', data),
  apriFile: (data) => ipcRenderer.invoke('apri-file', data),

  // Email
  inviaEmail: (data) => ipcRenderer.invoke('invia-email', data),

  // Storico letture XML nel DB
  salvaLetture: (data) => ipcRenderer.invoke('salva-letture', data),
  getStoricoLettureRipartitore: (data) => ipcRenderer.invoke('get-storico-letture-ripartitore', data),
  getStoricoCondominio: (data) => ipcRenderer.invoke('get-storico-condominio', data),
  getMatricoleDb: (data) => ipcRenderer.invoke('get-matricole-db', data),
  registraSostituzione: (data) => ipcRenderer.invoke('registra-sostituzione', data),
  getSostituzioniCondominio: (data) => ipcRenderer.invoke('get-sostituzioni-condominio', data),

  // Archivio Import XML
  archiviaXml: (data) => ipcRenderer.invoke('archivia-xml', data),
  getStoricoXml: (data) => ipcRenderer.invoke('get-storico-xml', data),
  apriCartellaArchivio: (data) => ipcRenderer.invoke('apri-cartella-archivio', data),
  getArchivioPath: () => ipcRenderer.invoke('get-archivio-path'),
  setArchivioPath: (percorso) => ipcRenderer.invoke('set-archivio-path', percorso),
})