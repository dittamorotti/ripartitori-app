import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import Sidebar from './components/Sidebar'
import MainPanel from './components/MainPanel'
import Impostazioni from './pages/Impostazioni'
import { Settings, BarChart2, Wrench, Mail } from 'lucide-react'
import Analisi from './pages/Analisi'
import ListaGuasti from './pages/ListaGuasti'

export default function App() {
  const [selectedNode, setSelectedNode] = useState(null)
  const [showImpostazioni, setShowImpostazioni] = useState(false)
  const [showAnalisi, setShowAnalisi] = useState(false)
  const [showGuasti, setShowGuasti] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(null)
  const [updateDownloading, setUpdateDownloading] = useState(null)  // { version }
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [verificaAggiornamento, setVerificaAggiornamento] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [statoDb, setStatoDb] = useState(null)   // { solaLettura, bloccatoDa, dbPath }
  const mainPanelRef = React.useRef(null)
  // ─── Letture da email ───
  const [emailCollegata, setEmailCollegata] = useState(false)
  const [emailInCorso, setEmailInCorso] = useState(false)       // 'controllo' | 'import' | false
  const [emailRisultato, setEmailRisultato] = useState(null)    // { messaggi, condomini }
  const [emailScelte, setEmailScelte] = useState({})            // { percorso: { incluso, condominioId } }
  const [emailFinestra, setEmailFinestra] = useState(false)     // finestra "Controllo email" aperta
  const [emailRighe, setEmailRighe] = useState([])              // avanzamento: [{ testo, tipo, ora }]
  const emailLogRef = React.useRef(null)

  useEffect(() => {
    if (window.api.getAppVersion) {
      window.api.getAppVersion().then(v => setAppVersion(v))
    }
    // Verifica aggiornamenti: blocca l'interfaccia finché GitHub non risponde (max 20 s)
    let timerVerifica = null
    const fineVerifica = () => { clearTimeout(timerVerifica); setVerificaAggiornamento(false) }
    const handleUpdateChecking = () => {
      setVerificaAggiornamento(true)
      clearTimeout(timerVerifica)
      timerVerifica = setTimeout(() => setVerificaAggiornamento(false), 20000)
    }
    const handleUpdateNotAvailable = () => fineVerifica()
    const handleUpdateAvailable = (info) => { fineVerifica(); setUpdateDownloading({ version: info.version }); setDownloadProgress(0) }
    const handleUpdateProgress = (pct) => setDownloadProgress(pct)
    const handleUpdateDownloaded = (info) => { setUpdateDownloading(null); setDownloadProgress(0); setUpdateDownloaded(info) }
    const handleUpdateError = (errMessage) => {
      console.error('Errore updater:', errMessage)
      fineVerifica()
      setUpdateDownloading(prev => {
        if (prev) toast.error('Download aggiornamento non riuscito. Riprova al prossimo avvio.')
        return null
      })
      setDownloadProgress(0)
    }
    if (window.api.onUpdateChecking) window.api.onUpdateChecking(handleUpdateChecking)
    if (window.api.onUpdateNotAvailable) window.api.onUpdateNotAvailable(handleUpdateNotAvailable)
    if (window.api.onUpdateAvailable) window.api.onUpdateAvailable(handleUpdateAvailable)
    if (window.api.onUpdateProgress) window.api.onUpdateProgress(handleUpdateProgress)
    if (window.api.onUpdateDownloaded) window.api.onUpdateDownloaded(handleUpdateDownloaded)
    if (window.api.onUpdateError) window.api.onUpdateError(handleUpdateError)
    return () => {
      clearTimeout(timerVerifica)
      if (window.api.offUpdateChecking) window.api.offUpdateChecking()
      if (window.api.offUpdateNotAvailable) window.api.offUpdateNotAvailable()
      if (window.api.offUpdateAvailable) window.api.offUpdateAvailable()
      if (window.api.offUpdateProgress) window.api.offUpdateProgress()
      if (window.api.offUpdateDownloaded) window.api.offUpdateDownloaded()
      if (window.api.offUpdateError) window.api.offUpdateError()
    }
  }, [])

  // ─── Letture da email: il controllo parte solo dal pulsante "Controlla email" ───
  async function aggiornaStatoEmail() {
    if (!window.api.getEmailStato) return false
    const st = await window.api.getEmailStato()
    const ok = !!(st.success && st.attiva)
    setEmailCollegata(ok)
    return ok
  }

  useEffect(() => { aggiornaStatoEmail() }, [showImpostazioni])

  // ─── Finestra "Controllo email": avanzamento passo per passo, poi scelta e import ───
  useEffect(() => {
    if (emailLogRef.current) emailLogRef.current.scrollTop = emailLogRef.current.scrollHeight
  }, [emailRighe])

  function rigaEmail(testo, tipo = 'info') {
    setEmailRighe(r => [...r, { testo, tipo, ora: new Date().toLocaleTimeString() }])
  }

  async function controllaEmail() {
    if (emailInCorso) return
    setEmailInCorso('controllo')
    setEmailRighe([])
    setEmailRisultato(null)
    setEmailFinestra(true)
    rigaEmail('Avvio controllo email…')
    if (window.api.onEmailProgresso) window.api.onEmailProgresso(p => rigaEmail(p.testo, p.tipo))
    let r
    try { r = await window.api.controllaEmail() }
    catch (err) { r = { success: false, error: err.message } }
    if (window.api.offEmailProgresso) window.api.offEmailProgresso()
    setEmailInCorso(false)
    if (!r.success) {
      rigaEmail('✕ ' + r.error, 'error')
      return
    }
    const conFile = r.messaggi.filter(m => m.files.length > 0 || m.errori.length > 0)
    if (conFile.length === 0) {
      rigaEmail('Nessuna nuova lettura nelle email', 'success')
      return
    }
    const scelte = {}
    r.messaggi.forEach(m => m.files.forEach(f => {
      scelte[f.percorso] = { incluso: !!f.condominioId, condominioId: f.condominioId || '' }
    }))
    setEmailScelte(scelte)
    setEmailRisultato({ messaggi: conFile, condomini: r.condomini })
  }

  async function importaDaEmail() {
    const { messaggi } = emailRisultato
    // Raggruppa i file scelti per condominio
    const gruppi = {}
    messaggi.forEach(m => m.files.forEach(f => {
      const sc = emailScelte[f.percorso]
      if (!sc?.incluso || !sc.condominioId) return
      const cid = Number(sc.condominioId)
      if (!gruppi[cid]) gruppi[cid] = []
      gruppi[cid].push(f.percorso)
    }))
    const ids = Object.keys(gruppi)
    if (ids.length === 0) { toast.warning('Nessun file selezionato'); return }

    setEmailRisultato(null)
    setEmailInCorso('import')
    rigaEmail('━━ Importazione')
    setShowImpostazioni(false); setShowAnalisi(false); setShowGuasti(false)
    const condominiDb = await window.api.getCondomini()
    const importatiOk = new Set()
    let fileOk = 0, fileTot = 0
    for (const cid of ids) {
      const cond = condominiDb.find(c => c.id === Number(cid))
      if (!cond) continue
      rigaEmail(`Importazione ${cond.nome} (${gruppi[cid].length} file)…`)
      const node = { type: 'condominio', data: cond }
      setSelectedNode(node)
      try {
        const esito = await mainPanelRef.current.importaDaEmail(node, gruppi[cid])
        fileTot += gruppi[cid].length
        fileOk += esito?.fileOk || 0
        ;(esito?.esiti || []).forEach((e, i) => { if (e.ok) importatiOk.add(gruppi[cid][i]) })
        if (esito?.errore) rigaEmail(`✕ ${cond.nome}: ${esito.errore}`, 'error')
        ;(esito?.esiti || []).forEach(e => {
          if (e.ok) rigaEmail(`✓ ${cond.nome}: concentratore ${e.concentratore || '?'} — ${e.abbinati} di ${e.dispositivi} dispositivi abbinati`, 'success')
          else rigaEmail(`✕ ${cond.nome}: ${e.errore}`, 'error')
        })
      } catch (err) {
        rigaEmail(`✕ ${cond.nome}: ${err.message}`, 'error')
      }
    }

    // Sposta solo le email i cui XML sono stati importati tutti
    const messageIds = messaggi
      .filter(m => m.files.length > 0 && m.files.every(f => importatiOk.has(f.percorso)))
      .map(m => m.id)
    const associazioni = []
    messaggi.forEach(m => m.files.forEach(f => {
      if (importatiOk.has(f.percorso) && f.concentratore) associazioni.push({ concentratore: f.concentratore, condominioId: Number(emailScelte[f.percorso].condominioId) })
    }))
    if (messageIds.length > 0) rigaEmail(`Spostamento di ${messageIds.length} email nella cartella delle letture importate…`)
    const sp = await window.api.segnaEmailImportate({ messageIds, associazioni })
    if (sp.success && sp.spostati) rigaEmail(`📁 ${sp.spostati} email spostate in "${sp.cartella}"`, 'success')
    if (sp.success && sp.errori?.length) rigaEmail(`⚠ ${sp.errori.length} email non spostate: ${sp.errori[0]}`, 'warn')
    else if (!sp.success) rigaEmail('⚠ Email non spostate: ' + sp.error, 'warn')
    rigaEmail(`━━ Fatto: ${fileOk} di ${fileTot} file importati`, fileOk === fileTot ? 'success' : 'warn')
    setEmailInCorso(false)
  }

  // ─── Stato database condiviso (sola lettura se in uso su un altro PC) ───
  useEffect(() => {
    if (window.api.getStatoDb) window.api.getStatoDb().then(setStatoDb)
    if (window.api.onDbStato) window.api.onDbStato(setStatoDb)
    return () => { if (window.api.offDbStato) window.api.offDbStato() }
  }, [])

  async function riprovaScrittura() {
    const r = await window.api.riprovaScritturaDb()
    if (r.success) setStatoDb(r)
    if (r.success && !r.solaLettura) toast.success('Database aperto in scrittura — dati ricaricati')
    else if (r.success) toast.warning('Il database è ancora in uso sull\'altro PC')
    else toast.error('Errore: ' + r.error)
  }

  async function forzaScrittura() {
    const chi = statoDb?.bloccatoDa?.pc || 'l\'altro PC'
    if (!window.confirm(`Prendere il controllo del database?\n\nFallo solo se l'app su ${chi} è chiusa o il PC è spento: se è ancora aperta, le modifiche fatte lì andranno perse.`)) return
    const r = await window.api.forzaScritturaDb()
    if (r.success) { setStatoDb(r); toast.success('Controllo del database acquisito — dati ricaricati') }
    else toast.error('Errore: ' + r.error)
  }

  function onPatchAnagrafica(tipo, id, nuoviValori) {
    if (mainPanelRef.current) mainPanelRef.current.patchAnagrafica(tipo, id, nuoviValori)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'linear-gradient(135deg, #0a0a1a 0%, #0d0d2b 50%, #0a1628 100%)' }}>

      {/* Banner database in sola lettura */}
      {statoDb?.solaLettura && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(217,119,6,0.92), rgba(220,38,38,0.88))',
          color: '#fff', padding: '9px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '13px', flexShrink: 0, zIndex: 100,
          borderBottom: '1px solid rgba(251,191,36,0.3)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px' }}>🔒</span>
            Sola lettura — il database è in uso su {statoDb.bloccatoDa?.pc || 'un altro PC'}
            {statoDb.bloccatoDa?.utente ? ` (${statoDb.bloccatoDa.utente})` : ''}: le modifiche non verranno salvate
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={riprovaScrittura} style={{
              padding: '5px 16px', background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
            }}>Riprova</button>
            <button onClick={forzaScrittura} style={{
              padding: '5px 12px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '8px', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: '12px',
            }}>Prendi il controllo</button>
          </div>
        </div>
      )}

      {/* Banner aggiornamento */}
      {updateDownloaded && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))',
          backdropFilter: 'blur(20px)',
          color: '#fff', padding: '9px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '13px', flexShrink: 0, zIndex: 100,
          borderBottom: '1px solid rgba(139,92,246,0.3)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px' }}>🔄</span>
            Aggiornamento v{updateDownloaded.version} pronto — riavvia per installare
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => window.api.installUpdate()} style={{
              padding: '5px 16px', background: 'rgba(255,255,255,0.15)',
              backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
            }}>Riavvia ora</button>
            <button onClick={() => setUpdateDownloaded(null)} style={{
              padding: '5px 12px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '12px',
            }}>Dopo</button>
          </div>
        </div>
      )}

      {/* Finestra "Controllo email": avanzamento, scelta dei file, import */}
      <style>{`@keyframes rotazioneEmail { to { transform: rotate(360deg); } }`}</style>
      {emailFinestra && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'rgba(15,15,35,0.97)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: '20px', padding: '26px 28px',
            width: '760px', maxWidth: '92vw', maxHeight: '84vh',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {emailInCorso ? (
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid rgba(165,180,252,0.25)', borderTopColor: '#a5b4fc', animation: 'rotazioneEmail 0.9s linear infinite' }} />
              ) : (
                <Mail size={18} color="#a5b4fc" />
              )}
              <div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>
                  {emailInCorso === 'controllo' ? 'Controllo email in corso…'
                    : emailInCorso === 'import' ? 'Importazione in corso…'
                    : emailRisultato ? 'Nuove letture dalle email'
                    : 'Controllo email'}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                  {emailRisultato
                    ? 'Controlla il condominio di ogni file, poi importa. Le email importate vengono spostate nella cartella delle letture importate.'
                    : emailInCorso ? 'Attendere: non chiudere l\'app' : 'Operazione terminata'}
                </div>
              </div>
            </div>

            {/* Avanzamento passo per passo */}
            <div ref={emailLogRef} style={{
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px',
              padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.7',
              maxHeight: emailRisultato ? '120px' : '320px', minHeight: '80px', overflowY: 'auto', flexShrink: 0,
            }}>
              {emailRighe.map((r, i) => (
                <div key={i} style={{ color: { info: '#a0a0c0', success: '#4ade80', error: '#f87171', warn: '#fbbf24' }[r.tipo] || '#a0a0c0' }}>
                  <span style={{ color: 'rgba(255,255,255,0.2)', marginRight: '8px' }}>{r.ora}</span>{r.testo}
                </div>
              ))}
            </div>

            {emailRisultato && (
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
              {emailRisultato.messaggi.map(m => (
                <div key={m.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '8px' }}>
                    ✉ {m.oggetto || '(senza oggetto)'} — {m.ricevuta ? new Date(m.ricevuta).toLocaleString('it-IT') : ''}
                  </div>
                  {m.errori.map((e, i) => (
                    <div key={i} style={{ fontSize: '12px', color: '#f87171', marginBottom: '6px' }}>✕ {e}</div>
                  ))}
                  {m.errori.length > 0 && m.files.length === 0 && (
                    <button onClick={async () => {
                      const r = await window.api.ignoraEmail({ ids: [m.id] })
                      if (!r.success) { toast.error('Errore: ' + r.error); return }
                      rigaEmail(`Email ignorata: ${m.oggetto || '(senza oggetto)'}`)
                      setEmailRisultato(prev => {
                        const resto = prev.messaggi.filter(x => x.id !== m.id)
                        return resto.length ? { ...prev, messaggi: resto } : null
                      })
                    }} style={{
                      padding: '4px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '7px', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: '11px',
                    }}>Ignora questa email (non proporla più)</button>
                  )}
                  {m.files.map(f => {
                    const sc = emailScelte[f.percorso] || {}
                    const aggiorna = (v) => setEmailScelte(prev => ({ ...prev, [f.percorso]: { ...prev[f.percorso], ...v } }))
                    return (
                      <div key={f.percorso} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '6px 0' }}>
                        <input type="checkbox" checked={!!sc.incluso} onChange={e => aggiorna({ incluso: e.target.checked })}
                          style={{ marginTop: '3px', accentColor: '#6366f1', cursor: 'pointer' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                            Concentratore {f.concentratore || '—'} · lettura del {f.dataLettura ? f.dataLettura.split('-').reverse().join('/') : '—'} · {f.dispositivi} dispositivi
                            {f.condominioId && f.fonte === 'matricole' ? ` · ${f.abbinati} matricole riconosciute` : ''}
                            {f.fonte === 'concentratore' ? ' · riconosciuto dal concentratore' : ''}
                          </div>
                          {f.report?.mancanti?.length > 0 && (
                            <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '2px' }}>
                              ⚠ Il gateway non ha ricevuto {f.report.mancanti.length} dispositiv{f.report.mancanti.length === 1 ? 'o' : 'i'}: {f.report.mancanti.slice(0, 8).join(', ')}{f.report.mancanti.length > 8 ? '…' : ''}
                            </div>
                          )}
                          {!f.condominioId && (
                            <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '2px' }}>⚠ Nessuna matricola trovata in anagrafica: scegli il condominio</div>
                          )}
                        </div>
                        <select value={sc.condominioId || ''} onChange={e => aggiorna({ condominioId: e.target.value, incluso: !!e.target.value })}
                          style={{ width: '220px', padding: '6px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'rgba(255,255,255,0.85)', fontSize: '12px', outline: 'none' }}>
                          <option value="" style={{ background: '#0f0f23' }}>— scegli condominio —</option>
                          {emailRisultato.condomini.map(c => (
                            <option key={c.id} value={c.id} style={{ background: '#0f0f23' }}>{c.nome}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              {emailInCorso ? (
                <button disabled style={{
                  padding: '8px 18px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '9px', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'default',
                }}>Attendere…</button>
              ) : (
              <button onClick={() => { setEmailRisultato(null); setEmailFinestra(false) }} style={{
                padding: '8px 18px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '9px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '13px',
              }}>{emailRisultato ? 'Non ora' : 'Chiudi'}</button>
              )}
              {emailRisultato && !emailInCorso && (
              <button onClick={importaDaEmail} disabled={!Object.values(emailScelte).some(s => s.incluso && s.condominioId)} style={{
                padding: '8px 20px', background: 'linear-gradient(135deg, #6366f1, #7c3aed)', border: '1px solid rgba(139,92,246,0.4)',
                borderRadius: '9px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                opacity: Object.values(emailScelte).some(s => s.incluso && s.condominioId) ? 1 : 0.5,
              }}>Importa selezionati ({Object.values(emailScelte).filter(s => s.incluso && s.condominioId).length})</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal verifica aggiornamenti */}
      {verificaAggiornamento && !updateDownloading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <style>{`@keyframes verificaAgg { 0% { left: -40%; } 100% { left: 100%; } }`}</style>
          <div style={{
            background: 'rgba(15,15,35,0.97)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: '20px',
            padding: '36px 40px',
            width: '380px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))',
              border: '1px solid rgba(99,102,241,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px',
            }}>🔍</div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '6px' }}>
                Verifica aggiornamenti
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                Controllo se è disponibile una nuova versione — attendere
              </div>
            </div>

            <div style={{ width: '100%' }}>
              <div style={{
                position: 'relative', height: '6px', borderRadius: '3px',
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 0, height: '100%', width: '40%',
                  borderRadius: '3px',
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                  animation: 'verificaAgg 1.2s ease-in-out infinite',
                }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal download aggiornamento */}
      {updateDownloading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'rgba(15,15,35,0.97)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: '20px',
            padding: '36px 40px',
            width: '380px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
          }}>
            {/* Icona animata */}
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))',
              border: '1px solid rgba(99,102,241,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px',
            }}>⬇️</div>

            {/* Testi */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '6px' }}>
                Download aggiornamento
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                Versione {updateDownloading.version} — attendere il completamento
              </div>
            </div>

            {/* Barra progresso */}
            <div style={{ width: '100%' }}>
              <div style={{
                height: '6px', borderRadius: '3px',
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${downloadProgress}%`,
                  borderRadius: '3px',
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <div style={{
                textAlign: 'right', fontSize: '11px',
                color: 'rgba(255,255,255,0.35)', marginTop: '6px',
              }}>
                {downloadProgress}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Layout principale */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', position: 'relative' }}>

        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 15% 50%, rgba(99,102,241,0.07) 0%, transparent 55%), radial-gradient(ellipse at 85% 20%, rgba(139,92,246,0.05) 0%, transparent 50%)' }} />

        {/* Sidebar */}
        <div style={{ width: '260px', minWidth: '220px', flexShrink: 0, background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10 }}>

          <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.1))', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '20px', padding: '4px 10px 4px 5px', marginBottom: '10px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#fff', fontWeight: '700' }}>Q</div>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>QUNDIS</span>
            </div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff' }}>Ripartitori</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            <Sidebar selectedNode={selectedNode} onSelect={node => { setSelectedNode(node); setShowAnalisi(false); setShowImpostazioni(false); setShowGuasti(false) }} onPatchAnagrafica={onPatchAnagrafica} />
          </div>

          {/* Footer — Controlla email + Lista Guasti + Analisi + Impostazioni */}
          <div style={{ padding: '10px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {emailCollegata && (
              <button
                onClick={() => controllaEmail()}
                disabled={!!emailInCorso}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  padding: '9px 10px', marginBottom: '6px',
                  background: emailInCorso ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                  border: emailInCorso ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '10px', color: emailInCorso ? '#a5b4fc' : 'rgba(255,255,255,0.4)',
                  cursor: emailInCorso ? 'default' : 'pointer', fontSize: '12px', transition: 'all 0.2s',
                }}
              >
                <Mail size={14} />
                {emailInCorso === 'controllo' ? 'Controllo email…' : emailInCorso === 'import' ? 'Importazione…' : 'Controlla email'}
              </button>
            )}
            <button
              onClick={() => { setShowGuasti(true); setShowAnalisi(false); setShowImpostazioni(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '9px 10px', marginBottom: '6px',
                background: showGuasti ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                border: showGuasti ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.07)',
                borderRadius: '10px', color: showGuasti ? '#a5b4fc' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer', fontSize: '12px', transition: 'all 0.2s',
              }}
            >
              <Wrench size={14} />
              Lista Guasti
            </button>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <button
                onClick={() => { setShowAnalisi(true); setShowImpostazioni(false); setShowGuasti(false) }}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  padding: '9px 10px',
                  background: showAnalisi ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                  border: showAnalisi ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '10px', color: showAnalisi ? '#a5b4fc' : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', fontSize: '12px', transition: 'all 0.2s',
                }}
              >
                <BarChart2 size={14} />
                Analisi
              </button>
              <button
                onClick={() => { setShowImpostazioni(true); setShowAnalisi(false); setShowGuasti(false) }}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  padding: '9px 10px',
                  background: showImpostazioni ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                  border: showImpostazioni ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '10px', color: showImpostazioni ? '#a5b4fc' : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', fontSize: '12px', transition: 'all 0.2s',
                }}
              >
                <Settings size={14} />
                Impostazioni
              </button>
            </div>
            {appVersion && (
              <div style={{ textAlign: 'center', fontSize: '10px', color: 'rgba(255,255,255,0.18)', fontFamily: 'monospace' }}>
                v{appVersion}
              </div>
            )}
          </div>
        </div>

        {/* Pannello principale — MainPanel sempre montato, nascosto via CSS per preservare lo stato */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
          <div style={{ display: (showImpostazioni || showAnalisi || showGuasti) ? 'none' : 'flex', flex: 1, overflow: 'hidden', flexDirection: 'column' }}>
            <MainPanel ref={mainPanelRef} selectedNode={selectedNode} />
          </div>
          {showImpostazioni && <Impostazioni onClose={() => setShowImpostazioni(false)} />}
          {showAnalisi && <Analisi selectedNode={selectedNode} onClose={() => setShowAnalisi(false)} />}
          {showGuasti && <ListaGuasti selectedNode={selectedNode} />}
        </div>

      </div>
    </div>
  )
}