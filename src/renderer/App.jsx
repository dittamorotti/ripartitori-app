import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import Sidebar from './components/Sidebar'
import MainPanel from './components/MainPanel'
import Impostazioni from './pages/Impostazioni'
import { Settings, BarChart2, Wrench } from 'lucide-react'
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
  const [appVersion, setAppVersion] = useState('')
  const [statoDb, setStatoDb] = useState(null)   // { solaLettura, bloccatoDa, dbPath }
  const mainPanelRef = React.useRef(null)

  useEffect(() => {
    if (window.api.getAppVersion) {
      window.api.getAppVersion().then(v => setAppVersion(v))
    }
    const handleUpdateAvailable = (info) => { setUpdateDownloading({ version: info.version }); setDownloadProgress(0) }
    const handleUpdateProgress = (pct) => setDownloadProgress(pct)
    const handleUpdateDownloaded = (info) => { setUpdateDownloading(null); setDownloadProgress(0); setUpdateDownloaded(info) }
    const handleUpdateError = (errMessage) => console.error('Errore updater:', errMessage)
    if (window.api.onUpdateAvailable) window.api.onUpdateAvailable(handleUpdateAvailable)
    if (window.api.onUpdateProgress) window.api.onUpdateProgress(handleUpdateProgress)
    if (window.api.onUpdateDownloaded) window.api.onUpdateDownloaded(handleUpdateDownloaded)
    if (window.api.onUpdateError) window.api.onUpdateError(handleUpdateError)
    return () => {
      if (window.api.offUpdateAvailable) window.api.offUpdateAvailable()
      if (window.api.offUpdateProgress) window.api.offUpdateProgress()
      if (window.api.offUpdateDownloaded) window.api.offUpdateDownloaded()
      if (window.api.offUpdateError) window.api.offUpdateError()
    }
  }, [])

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

          {/* Footer — Lista Guasti + Analisi + Impostazioni */}
          <div style={{ padding: '10px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
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