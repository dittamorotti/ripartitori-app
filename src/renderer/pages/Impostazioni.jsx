import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { X, Settings, FileText, Eye, EyeOff, GripVertical, Image, FolderOpen, Database, CheckCircle, AlertCircle } from 'lucide-react'

const CAMPI_DISPONIBILI = [
  { key: 'matricola', label: 'Matricola (identnr)', default: true },
  { key: 'data_lettura', label: 'Data lettura', default: true },
  { key: 'ora_lettura', label: 'Ora lettura', default: true },
  { key: 'valore_corrente', label: 'Valore corrente H.C.A.', default: true },
  { key: 'storico_mensile', label: 'Valori storici mensili (ultimi 12)', default: true },
  { key: 'data_errore', label: 'Data errore', default: true },
  { key: 'errorflags', label: 'Codice errore', default: true },
  { key: 'status', label: 'Stato dispositivo', default: true },
  { key: 'powerstatus', label: 'Stato batteria', default: true },
  { key: 'locale', label: 'Locale installazione', default: true },
  { key: 'proprietario', label: 'Proprietario unità', default: true },
  { key: 'interno', label: 'Interno', default: true },
  { key: 'piano', label: 'Piano', default: true },
  { key: 'condominio', label: 'Nome condominio', default: true },
  { key: 'manufact', label: 'Codice produttore', default: false },
  { key: 'version', label: 'Versione firmware', default: false },
  { key: 'accessnr', label: 'Numero accesso', default: false },
  { key: 'subnet', label: 'Subnet', default: false },
  { key: 'receiver', label: 'Receiver', default: false },
  { key: 'signature', label: 'Firma/Encryption', default: false },
]

export default function Impostazioni({ onClose }) {
  const [campi, setCampi] = useState([])
  const [intestazione, setIntestazione] = useState('')
  const [pieDiPagina, setPieDiPagina] = useState('')
  const [logoPath, setLogoPath] = useState('')
  const [dbPath, setDbPath] = useState('')
  const [dbStatus, setDbStatus] = useState(null)
  const [archivioPath, setArchivioPath] = useState('')
  const [archivioStatus, setArchivioStatus] = useState(null)

  useEffect(() => {
    loadImpostazioni()
  }, [])

  async function loadImpostazioni() {
    const imp = await window.api.getImpostazioni()
    
    if (imp.campi_pdf) {
      const saved = JSON.parse(imp.campi_pdf)
      setCampi(saved)
    } else {
      setCampi(CAMPI_DISPONIBILI.map(c => ({ ...c, visible: c.default })))
    }
    setIntestazione(imp.intestazione || '')
    setPieDiPagina(imp.pie_di_pagina || '')
    setLogoPath(imp.logo_aziendale || '')
    const currentDbPath = await window.api.getDbPath()
    setDbPath(currentDbPath || '')
    const currentArchivioPath = await window.api.getArchivioPath()
    setArchivioPath(currentArchivioPath || '')
  }

  async function sfogliaCartella() {
    const cartella = await window.api.openFolderDialog()
    if (cartella) setDbPath(cartella + '\\ripartitori.db')
  }

  async function applicaPercorsoDb() {
    if (!dbPath) return
    setDbStatus(null)
    const result = await window.api.setDbPath(dbPath)
    if (result.success) { setDbStatus({ ok: true, msg: 'Database collegato con successo!' }); toast.success('Database collegato con successo!') }
    else { setDbStatus({ ok: false, msg: 'Errore: ' + result.error }); toast.error('Errore DB: ' + result.error) }
  }

  async function sfogliaArchivio() {
    const cartella = await window.api.openFolderDialog()
    if (cartella) setArchivioPath(cartella)
  }

  async function applicaArchivio() {
    if (!archivioPath) return
    setArchivioStatus(null)
    const result = await window.api.setArchivioPath(archivioPath)
    if (result.success) { setArchivioStatus({ ok: true, msg: 'Cartella archivio configurata!' }); toast.success('Cartella archivio configurata!') }
    else { setArchivioStatus({ ok: false, msg: 'Errore: ' + result.error }); toast.error('Errore archivio: ' + result.error) }
  }

  async function sfogliaLogo() {
    const filePath = await window.api.openFileDialog([
      { name: 'Immagini', extensions: ['png', 'jpg', 'jpeg'] }
    ])
    if (filePath) setLogoPath(filePath)
  }

  async function salva() {
    await window.api.setImpostazione('campi_pdf', JSON.stringify(campi))
    await window.api.setImpostazione('intestazione', intestazione)
    await window.api.setImpostazione('pie_di_pagina', pieDiPagina)
    await window.api.setImpostazione('logo_aziendale', logoPath)
    toast.success('Impostazioni salvate')
  }

  function toggleCampo(key) {
    setCampi(c => c.map(f => f.key === key ? { ...f, visible: !f.visible } : f))
  }

  const campiVisibili = campi.filter(c => c.visible)
  const campiNascondi = campi.filter(c => !c.visible)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#f0f2f5', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 28px', background: '#fff',
        borderBottom: '1px solid #e8e8f5',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Settings size={20} color="#4f46e5" />
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a2e' }}>Impostazioni</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>

          <button onClick={salva} style={{
            padding: '8px 20px', background: '#4f46e5', border: 'none',
            borderRadius: '8px', color: '#fff', cursor: 'pointer',
            fontSize: '13px', fontWeight: '600',
          }}>
            Salva
          </button>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#8888aa', padding: '4px',
          }}>
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Contenuto */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Sezione Database condiviso */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e8e8f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Database size={16} color="#4f46e5" />
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>Database condiviso</div>
          </div>
          <div style={{ fontSize: '12px', color: '#8888aa', marginBottom: '16px' }}>
            Collega il database a una cartella di rete (NAS) per condividerlo con altri PC.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '11px', color: '#8888aa', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Percorso file database
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={dbPath}
                onChange={e => setDbPath(e.target.value)}
                placeholder={'Es: \\\\NAS\\condivisa\\ripartitori.db'}
                style={{
                  flex: 1, padding: '9px 12px', border: '1px solid #e0e0f0',
                  borderRadius: '8px', fontSize: '12px', color: '#1a1a2e',
                  outline: 'none', background: '#fafafa', fontFamily: 'monospace',
                }}
              />
              <button onClick={sfogliaCartella} style={{
                padding: '9px 14px', background: '#f0f0ff', border: '1px solid #e0e0f0',
                borderRadius: '8px', cursor: 'pointer', color: '#4f46e5',
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap',
              }}>
                <FolderOpen size={14} /> Sfoglia
              </button>
            </div>
            <button onClick={applicaPercorsoDb} style={{
              padding: '9px 14px', background: '#4f46e5', border: 'none',
              borderRadius: '8px', cursor: 'pointer', color: '#fff',
              fontSize: '13px', fontWeight: '600',
            }}>
              Applica percorso
            </button>
            {dbStatus && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                background: dbStatus.ok ? '#f0fdf4' : '#fff1f1',
                border: `1px solid ${dbStatus.ok ? '#bbf7d0' : '#fecaca'}`,
                borderRadius: '8px', fontSize: '12px',
                color: dbStatus.ok ? '#166534' : '#991b1b',
              }}>
                {dbStatus.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {dbStatus.msg}
              </div>
            )}
            <div style={{ fontSize: '11px', color: '#a0a0b8', lineHeight: '1.6', borderTop: '1px solid #f0f0f8', paddingTop: '10px' }}>
              💡 <strong>Come funziona:</strong> ogni PC deve puntare allo stesso file sulla cartella di rete.
              Al primo utilizzo il database locale viene copiato automaticamente sul percorso indicato.
              Ad ogni avvio l'app carica il database dal percorso configurato automaticamente.
            </div>
          </div>
        </div>

        {/* Sezione Archivio Import */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e8e8f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <FolderOpen size={16} color="#4f46e5" />
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>Archivio Import XML</div>
          </div>
          <div style={{ fontSize: '12px', color: '#8888aa', marginBottom: '16px' }}>
            Cartella radice dove verranno create automaticamente le sottocartelle per ogni condominio con i file XML importati.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '11px', color: '#8888aa', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Cartella radice archivio
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={archivioPath}
                onChange={e => setArchivioPath(e.target.value)}
                placeholder={'Es: C:\Archivio Qundis  oppure  \\NAS\archivio'}
                style={{
                  flex: 1, padding: '9px 12px', border: '1px solid #e0e0f0',
                  borderRadius: '8px', fontSize: '12px', color: '#1a1a2e',
                  outline: 'none', background: '#fafafa', fontFamily: 'monospace',
                }}
              />
              <button onClick={sfogliaArchivio} style={{
                padding: '9px 14px', background: '#f0f0ff', border: '1px solid #e0e0f0',
                borderRadius: '8px', cursor: 'pointer', color: '#4f46e5',
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap',
              }}>
                <FolderOpen size={14} /> Sfoglia
              </button>
            </div>
            <button onClick={applicaArchivio} style={{
              padding: '9px 14px', background: '#4f46e5', border: 'none',
              borderRadius: '8px', cursor: 'pointer', color: '#fff',
              fontSize: '13px', fontWeight: '600', alignSelf: 'flex-start',
            }}>
              Applica
            </button>
            {archivioStatus && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
                color: archivioStatus.ok ? '#4ade80' : '#f87171' }}>
                {archivioStatus.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {archivioStatus.msg}
              </div>
            )}
            <div style={{ fontSize: '11px', color: '#a0a0b8', lineHeight: '1.6' }}>
              💡 <strong>Struttura creata automaticamente:</strong><br />
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#8888aa' }}>
                Cartella radice\<br />
                &nbsp;&nbsp;Helvetia - Domodossola\<br />
                &nbsp;&nbsp;&nbsp;&nbsp;lettura_2026-06-01.xml<br />
                &nbsp;&nbsp;&nbsp;&nbsp;lettura_2026-01-15.xml<br />
                &nbsp;&nbsp;Altro Condominio\<br />
                &nbsp;&nbsp;&nbsp;&nbsp;lettura_2026-06-01.xml
              </span>
            </div>
          </div>
        </div>

        {/* Sezione Logo aziendale */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e8e8f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Image size={16} color="#4f46e5" />
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>Logo aziendale</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '11px', color: '#8888aa', textTransform: 'uppercase', letterSpacing: '1px' }}>
              File immagine (PNG o JPG)
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={logoPath}
                onChange={e => setLogoPath(e.target.value)}
                placeholder="Nessun logo selezionato"
                style={{
                  flex: 1, padding: '9px 12px', border: '1px solid #e0e0f0',
                  borderRadius: '8px', fontSize: '12px', color: '#1a1a2e',
                  outline: 'none', background: '#fafafa', fontFamily: 'monospace',
                }}
              />
              <button onClick={sfogliaLogo} style={{
                padding: '9px 14px', background: '#f0f0ff', border: '1px solid #e0e0f0',
                borderRadius: '8px', cursor: 'pointer', color: '#4f46e5',
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap',
              }}>
                <FolderOpen size={14} /> Sfoglia
              </button>
              {logoPath && (
                <button onClick={() => setLogoPath('')} style={{
                  padding: '9px 12px', background: '#fff1f1', border: '1px solid #fecaca',
                  borderRadius: '8px', cursor: 'pointer', color: '#991b1b',
                  fontSize: '12px', fontWeight: '500',
                }}>
                  Rimuovi
                </button>
              )}
            </div>
            {logoPath && (
              <div style={{ fontSize: '11px', color: '#4ade80' }}>
                ✓ Logo impostato — apparira in alto a sinistra nel PDF
              </div>
            )}
            <div style={{ fontSize: '11px', color: '#a0a0b8' }}>
              Consigliato: PNG trasparente, dimensioni minime 100x100px
            </div>
          </div>
        </div>

        {/* Sezione intestazione PDF */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e8e8f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <FileText size={16} color="#4f46e5" />
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>Intestazione PDF</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#8888aa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                Testo intestazione
              </label>
              <input
                type="text"
                value={intestazione}
                onChange={e => setIntestazione(e.target.value)}
                placeholder="Es. Lettura annuale ripartitori calore 2024"
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid #e0e0f0',
                  borderRadius: '8px', fontSize: '13px', color: '#1a1a2e', outline: 'none',
                  background: '#fafafa',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#8888aa', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                Piè di pagina
              </label>
              <input
                type="text"
                value={pieDiPagina}
                onChange={e => setPieDiPagina(e.target.value)}
                placeholder="Es. Per informazioni contattare l'amministratore"
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid #e0e0f0',
                  borderRadius: '8px', fontSize: '13px', color: '#1a1a2e', outline: 'none',
                  background: '#fafafa',
                }}
              />
            </div>
          </div>
        </div>

        {/* Sezione campi PDF */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e8e8f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Eye size={16} color="#4f46e5" />
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>Campi visibili nel PDF</div>
          </div>
          <div style={{ fontSize: '12px', color: '#8888aa', marginBottom: '16px' }}>
            Seleziona quali informazioni mostrare nel documento PDF generato.
          </div>

          {/* Campi attivi */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              ● Visibili ({campiVisibili.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {campiVisibili.map(campo => (
                <div key={campo.key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', background: '#f0fdf4',
                  border: '1px solid #bbf7d0', borderRadius: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <GripVertical size={14} color="#86efac" />
                    <span style={{ fontSize: '13px', color: '#1a1a2e' }}>{campo.label}</span>
                  </div>
                  <button onClick={() => toggleCampo(campo.key)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: '#4ade80',
                  }}>
                    <Eye size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Campi nascosti */}
          {campiNascondi.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: '#8888aa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                ○ Nascosti ({campiNascondi.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {campiNascondi.map(campo => (
                  <div key={campo.key} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: '#fafafa',
                    border: '1px solid #e8e8f5', borderRadius: '8px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <GripVertical size={14} color="#c0c0d8" />
                      <span style={{ fontSize: '13px', color: '#8888aa' }}>{campo.label}</span>
                    </div>
                    <button onClick={() => toggleCampo(campo.key)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#c0c0d8',
                    }}>
                      <EyeOff size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}