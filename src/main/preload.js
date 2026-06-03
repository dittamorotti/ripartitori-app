const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Condomini
  getCondomini: () => ipcRenderer.invoke('get-condomini'),
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

  // Database condiviso
  getDbPath: () => ipcRenderer.invoke('get-db-path'),
  setDbPath: (percorso) => ipcRenderer.invoke('set-db-path', percorso),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  reloadDb: () => ipcRenderer.invoke('reload-db'),

  // Email
  inviaEmail: (data) => ipcRenderer.invoke('invia-email', data),

  // Archivio Import XML
  archiviaXml: (data) => ipcRenderer.invoke('archivia-xml', data),
  getStoricoXml: (data) => ipcRenderer.invoke('get-storico-xml', data),
  apriCartellaArchivio: (data) => ipcRenderer.invoke('apri-cartella-archivio', data),
  getArchivioPath: () => ipcRenderer.invoke('get-archivio-path'),
  setArchivioPath: (percorso) => ipcRenderer.invoke('set-archivio-path', percorso),
})