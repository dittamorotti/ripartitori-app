import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { X, Settings, FileText, Eye, EyeOff, GripVertical, Image, FolderOpen, Database, CheckCircle, AlertCircle } from 'lucide-react'

const CAMPI_DISPONIBILI = [
  { key: 'matricola', label: 'Matricola (identnr)', default: true },
  { key: 'data_lettura', label: 'Data lettura', default: true },
  { key: 'ora_lettura', label: 'Ora lettura', default: true },
  { key: 'valore_corrente', label: 'Valore corrente (H.C.A. / kWh / m³)', default: true },
  { key: 'consumo_periodo', label: 'Consumo periodo (solo contabilizzatori)', default: true },
  { key: 'perdita', label: 'Ore di perdita (solo acqua)', default: true },
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
  { key: 'flag_dispositivo', label: 'Flag errore dispositivo (contabilizzatori)', default: false },
]

// ─── Stili costanti dark glass ────────────────────────────────
const S = {
  wrap:      { display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent', overflow: 'hidden' },
  header:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  headerTitle: { fontSize: '17px', fontWeight: '600', color: '#fff' },
  btnSalva:  { padding: '8px 20px', background: 'linear-gradient(135deg, #6366f1, #7c3aed)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '9px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600', boxShadow: '0 4px 14px rgba(99,102,241,0.25)' },
  btnChiudi: { background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '4px', display: 'flex', alignItems: 'center' },
  scroll:    { flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px' },
  card:      { background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)', borderRadius: '14px', padding: '20px', border: '1px solid rgba(255,255,255,0.07)' },
  cardTitle: { fontSize: '14px', fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  cardDesc:  { fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginBottom: '16px', marginTop: '4px' },
  label:     { fontSize: '11px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px' },
  input:     { flex: 1, padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '9px', fontSize: '12px', color: 'rgba(255,255,255,0.8)', outline: 'none', fontFamily: 'monospace' },
  inputFull: { width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '9px', fontSize: '13px', color: 'rgba(255,255,255,0.8)', outline: 'none', boxSizing: 'border-box' },
  btnSfoglia:{ padding: '9px 14px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '9px', cursor: 'pointer', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap' },
  btnApplica:{ padding: '9px 20px', background: 'linear-gradient(135deg, #6366f1, #7c3aed)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '9px', cursor: 'pointer', color: '#fff', fontSize: '13px', fontWeight: '600', alignSelf: 'flex-start', boxShadow: '0 4px 14px rgba(99,102,241,0.2)' },
  btnRimuovi:{ padding: '9px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '9px', cursor: 'pointer', color: '#f87171', fontSize: '12px', fontWeight: '500' },
  hint:      { fontSize: '11px', color: 'rgba(255,255,255,0.2)', lineHeight: '1.6', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px', marginTop: '4px' },
  hintMono:  { fontFamily: 'monospace', fontSize: '10px', color: 'rgba(255,255,255,0.2)' },
  statusOk:  { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '9px', fontSize: '12px', color: '#4ade80' },
  statusErr: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '9px', fontSize: '12px', color: '#f87171' },
  campoOn:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: '9px' },
  campoOff:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '9px' },
  campoLblOn:  { fontSize: '13px', color: 'rgba(255,255,255,0.8)' },
  campoLblOff: { fontSize: '13px', color: 'rgba(255,255,255,0.3)' },
  btnToggleOn: { background: 'none', border: 'none', cursor: 'pointer', color: '#4ade80', display: 'flex', alignItems: 'center' },
  btnToggleOff:{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center' },
  sectionLblOn:  { fontSize: '11px', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' },
  sectionLblOff: { fontSize: '11px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' },
}

export default function Impostazioni({ onClose }) {
  const [campi, setCampi] = useState([])
  const [intestazione, setIntestazione] = useState('')
  const [pieDiPagina, setPieDiPagina] = useState('')
  const [logoPath, setLogoPath] = useState('')
  const [dbPath, setDbPath] = useState('')
  const [dbStatus, setDbStatus] = useState(null)
  const [archivioPath, setArchivioPath] = useState('')
  const [archivioStatus, setArchivioStatus] = useState(null)
  const [meseAccensione, setMeseAccensione] = useState(10)
  const [meseSpegnimento, setMeseSpegnimento] = useState(4)
  const [coeffDispersione, setCoeffDispersione] = useState(2.0)

  useEffect(() => { loadImpostazioni() }, [])

  async function loadImpostazioni() {
    const imp = await window.api.getImpostazioni()
    if (imp.campi_pdf) {
      // Aggiunge i campi nuovi non presenti nelle impostazioni già salvate
      const salvati = JSON.parse(imp.campi_pdf)
      const mancanti = CAMPI_DISPONIBILI
        .filter(c => !salvati.some(s => s.key === c.key))
        .map(c => ({ ...c, visible: c.default }))
      setCampi([...salvati, ...mancanti])
    } else {
      setCampi(CAMPI_DISPONIBILI.map(c => ({ ...c, visible: c.default })))
    }
    setIntestazione(imp.intestazione || '')
    setPieDiPagina(imp.pie_di_pagina || '')
    setLogoPath(imp.logo_aziendale || '')
    setDbPath((await window.api.getDbPath()) || '')
    setArchivioPath((await window.api.getArchivioPath()) || '')
    setMeseAccensione(parseInt(imp.mese_accensione) || 10)
    setMeseSpegnimento(parseInt(imp.mese_spegnimento) || 4)
    setCoeffDispersione(parseFloat(imp.coeff_dispersione) || 2.0)
  }

  async function sfogliaCartella() {
    const cartella = await window.api.openFolderDialog()
    if (cartella) setDbPath(cartella + '\\ripartitori.db')
  }

  async function applicaPercorsoDb() {
    if (!dbPath) return
    setDbStatus(null)
    const result = await window.api.setDbPath(dbPath)
    if (result.success) { setDbStatus({ ok: true, msg: 'Database collegato con successo!' }); toast.success('Database collegato!') }
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
    const filePath = await window.api.openFileDialog([{ name: 'Immagini', extensions: ['png', 'jpg', 'jpeg'] }])
    if (filePath) setLogoPath(filePath)
  }

  async function salva() {
    await window.api.setImpostazione('campi_pdf', JSON.stringify(campi))
    await window.api.setImpostazione('intestazione', intestazione)
    await window.api.setImpostazione('pie_di_pagina', pieDiPagina)
    await window.api.setImpostazione('logo_aziendale', logoPath)
    await window.api.setImpostazione('mese_accensione', String(meseAccensione))
    await window.api.setImpostazione('mese_spegnimento', String(meseSpegnimento))
    await window.api.setImpostazione('coeff_dispersione', String(coeffDispersione))
    toast.success('Impostazioni salvate')
  }

  function toggleCampo(key) {
    setCampi(c => c.map(f => f.key === key ? { ...f, visible: !f.visible } : f))
  }

  const campiVisibili = campi.filter(c => c.visible)
  const campiNascondi = campi.filter(c => !c.visible)

  return (
    <div style={S.wrap}>

      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Settings size={18} color="#a5b4fc" />
          <span style={S.headerTitle}>Impostazioni</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={salva} style={S.btnSalva}>Salva</button>
          <button onClick={onClose} style={S.btnChiudi}><X size={18} /></button>
        </div>
      </div>

      {/* Contenuto */}
      <div style={S.scroll}>

        {/* Database condiviso */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Database size={15} color="#a5b4fc" />
            <span style={S.cardTitle}>Database condiviso</span>
          </div>
          <div style={S.cardDesc}>Collega il database a una cartella di rete (NAS) per condividerlo con altri PC.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={S.label}>Percorso file database</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" value={dbPath} onChange={e => setDbPath(e.target.value)}
                placeholder={'Es: \\\\NAS\\condivisa\\ripartitori.db'} style={S.input} />
              <button onClick={sfogliaCartella} style={S.btnSfoglia}>
                <FolderOpen size={14} /> Sfoglia
              </button>
            </div>
            <button onClick={applicaPercorsoDb} style={S.btnApplica}>Applica percorso</button>
            {dbStatus && (
              <div style={dbStatus.ok ? S.statusOk : S.statusErr}>
                {dbStatus.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {dbStatus.msg}
              </div>
            )}
            <div style={S.hint}>
              💡 <strong style={{ color: 'rgba(255,255,255,0.4)' }}>Come funziona:</strong> ogni PC deve puntare allo stesso file sulla cartella di rete.
              Al primo utilizzo il database locale viene copiato automaticamente sul percorso indicato.
              Ad ogni avvio l'app carica il database dal percorso configurato automaticamente.
            </div>
            <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '8px', fontSize: '11px', color: 'rgba(165,180,252,0.7)', lineHeight: '1.6' }}>
              ℹ️ <strong style={{ color: 'rgba(165,180,252,0.9)' }}>Storico letture incluso:</strong> il database contiene anche tutte le letture XML importate (H.C.A., errori, storico mensile) e le sostituzioni dei ripartitori. Condividendo questo file condividi tutto — non serve un secondo database.
            </div>
          </div>
        </div>

        {/* Archivio Import XML */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <FolderOpen size={15} color="#a5b4fc" />
            <span style={S.cardTitle}>Archivio Import XML</span>
          </div>
          <div style={S.cardDesc}>Cartella radice dove verranno create automaticamente le sottocartelle per ogni condominio con i file XML importati.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={S.label}>Cartella radice archivio</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" value={archivioPath} onChange={e => setArchivioPath(e.target.value)}
                placeholder={'Es: C:\\Archivio Qundis  oppure  \\\\NAS\\archivio'} style={S.input} />
              <button onClick={sfogliaArchivio} style={S.btnSfoglia}>
                <FolderOpen size={14} /> Sfoglia
              </button>
            </div>
            <button onClick={applicaArchivio} style={S.btnApplica}>Applica</button>
            {archivioStatus && (
              <div style={archivioStatus.ok ? S.statusOk : S.statusErr}>
                {archivioStatus.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {archivioStatus.msg}
              </div>
            )}
            <div style={S.hint}>
              💡 <strong style={{ color: 'rgba(255,255,255,0.4)' }}>Struttura creata automaticamente:</strong><br />
              <span style={S.hintMono}>
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

        {/* Stagione di riscaldamento */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '15px' }}>🌡️</span>
            <span style={S.cardTitle}>Stagione di riscaldamento</span>
          </div>
          <div style={S.cardDesc}>Usato per il calcolo dei Gradi Giorno (GDD) nell'analisi climatica. Inserisci il mese di accensione e di spegnimento dell'impianto.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ ...S.label, display: 'block', marginBottom: '6px' }}>Mese accensione</label>
              <select value={meseAccensione} onChange={e => setMeseAccensione(parseInt(e.target.value))}
                style={{ ...S.inputFull, fontFamily: 'inherit' }}>
                {['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'].map((m, i) => (
                  <option key={i+1} value={i+1}>{m} ({i+1})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ ...S.label, display: 'block', marginBottom: '6px' }}>Mese spegnimento</label>
              <select value={meseSpegnimento} onChange={e => setMeseSpegnimento(parseInt(e.target.value))}
                style={{ ...S.inputFull, fontFamily: 'inherit' }}>
                {['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'].map((m, i) => (
                  <option key={i+1} value={i+1}>{m} ({i+1})</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ ...S.hint, marginTop: '12px' }}>
            💡 Default: accensione <strong style={{ color: 'rgba(255,255,255,0.4)' }}>Ottobre</strong>, spegnimento <strong style={{ color: 'rgba(255,255,255,0.4)' }}>Aprile</strong>. Il calcolo GDD usa base 20°C (standard DPR 412/93).
          </div>
        </div>

        {/* Coefficiente di dispersione termica */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '15px' }}>🏚️</span>
            <span style={S.cardTitle}>Coefficiente di dispersione termica</span>
          </div>
          <div style={S.cardDesc}>
            Rappresenta quanto il consumo segue la temperatura esterna. Edifici anni '60/'70 (alta dispersione) = 2.0. Edifici moderni = 1.0. Influenza le soglie verde/rosso nell'analisi Clima GDD.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="range" min="0.5" max="3.0" step="0.1"
                value={coeffDispersione}
                onChange={e => setCoeffDispersione(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: '#6366f1' }}
              />
              <div style={{ width: '48px', textAlign: 'center', fontSize: '18px', fontWeight: '700', color: '#a5b4fc' }}>
                {coeffDispersione.toFixed(1)}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {[
                { v: 0.5, label: 'Classe A/B' },
                { v: 1.0, label: 'Anni \'90' },
                { v: 1.5, label: 'Anni \'80' },
                { v: 2.0, label: 'Anni \'70/\'60' },
                { v: 2.5, label: 'Pre \'60' },
                { v: 3.0, label: 'Non isolato' },
              ].map(({ v, label }) => (
                <button key={v} onClick={() => setCoeffDispersione(v)} style={{
                  background: Math.abs(coeffDispersione - v) < 0.05 ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                  border: Math.abs(coeffDispersione - v) < 0.05 ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px', padding: '5px 8px', cursor: 'pointer',
                  fontSize: '10px', color: Math.abs(coeffDispersione - v) < 0.05 ? '#a5b4fc' : 'rgba(255,255,255,0.3)',
                  textAlign: 'center', lineHeight: '1.4',
                }}>
                  <div style={{ fontWeight: '700', fontSize: '11px' }}>{v.toFixed(1)}</div>
                  <div>{label}</div>
                </button>
              ))}
            </div>
            <div style={S.hint}>
              💡 Soglie analisi Clima GDD: verde &lt; <strong style={{ color: 'rgba(255,255,255,0.4)' }}>{(1.0 - (0.05 + 0.05 * coeffDispersione)).toFixed(2)}</strong> — rosso &gt; <strong style={{ color: 'rgba(255,255,255,0.4)' }}>{(1.0 + 0.10 * coeffDispersione).toFixed(2)}</strong>
            </div>
          </div>
        </div>

        {/* Logo aziendale */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Image size={15} color="#a5b4fc" />
            <span style={S.cardTitle}>Logo aziendale</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={S.label}>File immagine (PNG o JPG)</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="text" value={logoPath} onChange={e => setLogoPath(e.target.value)}
                placeholder="Nessun logo selezionato" style={S.input} />
              <button onClick={sfogliaLogo} style={S.btnSfoglia}>
                <FolderOpen size={14} /> Sfoglia
              </button>
              {logoPath && (
                <button onClick={() => setLogoPath('')} style={S.btnRimuovi}>Rimuovi</button>
              )}
            </div>
            {logoPath && (
              <div style={{ fontSize: '11px', color: '#4ade80' }}>✓ Logo impostato — apparirà in alto a sinistra nel PDF</div>
            )}
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
              Consigliato: PNG trasparente, dimensioni minime 100×100px
            </div>
          </div>
        </div>

        {/* Intestazione PDF */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <FileText size={15} color="#a5b4fc" />
            <span style={S.cardTitle}>Intestazione PDF</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ ...S.label, display: 'block', marginBottom: '6px' }}>Testo intestazione</label>
              <input type="text" value={intestazione} onChange={e => setIntestazione(e.target.value)}
                placeholder="Es. Lettura annuale ripartitori calore 2024" style={S.inputFull} />
            </div>
            <div>
              <label style={{ ...S.label, display: 'block', marginBottom: '6px' }}>Piè di pagina</label>
              <input type="text" value={pieDiPagina} onChange={e => setPieDiPagina(e.target.value)}
                placeholder="Es. Per informazioni contattare l'amministratore" style={S.inputFull} />
            </div>
          </div>
        </div>

        {/* Campi PDF */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Eye size={15} color="#a5b4fc" />
            <span style={S.cardTitle}>Campi visibili nel PDF</span>
          </div>
          <div style={S.cardDesc}>Seleziona quali informazioni mostrare nel documento PDF generato.</div>

          {/* Visibili */}
          <div style={{ marginBottom: '14px' }}>
            <div style={S.sectionLblOn}>● Visibili ({campiVisibili.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {campiVisibili.map(campo => (
                <div key={campo.key} style={S.campoOn}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <GripVertical size={13} color="rgba(74,222,128,0.4)" />
                    <span style={S.campoLblOn}>{campo.label}</span>
                  </div>
                  <button onClick={() => toggleCampo(campo.key)} style={S.btnToggleOn}>
                    <Eye size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Nascosti */}
          {campiNascondi.length > 0 && (
            <div>
              <div style={S.sectionLblOff}>○ Nascosti ({campiNascondi.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {campiNascondi.map(campo => (
                  <div key={campo.key} style={S.campoOff}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <GripVertical size={13} color="rgba(255,255,255,0.1)" />
                      <span style={S.campoLblOff}>{campo.label}</span>
                    </div>
                    <button onClick={() => toggleCampo(campo.key)} style={S.btnToggleOff}>
                      <EyeOff size={15} />
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