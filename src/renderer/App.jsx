import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import MainPanel from './components/MainPanel'
import Impostazioni from './pages/Impostazioni'
import { Settings } from 'lucide-react'

export default function App() {
  const [selectedNode, setSelectedNode] = useState(null)
  const [showImpostazioni, setShowImpostazioni] = useState(false)
  // Callback per patch diretta dei dati in MainPanel senza ricaricare dal DB
  const mainPanelRef = React.useRef(null)

  function onPatchAnagrafica(tipo, id, nuoviValori) {
    if (mainPanelRef.current) mainPanelRef.current.patchAnagrafica(tipo, id, nuoviValori)
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#f0f2f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      
      {/* Sidebar sinistra */}
      <div style={{
        width: '280px',
        minWidth: '220px',
        background: '#1a1a2e',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #2d2d4e',
      }}>
        {/* Logo / Titolo */}
        <div style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid #2d2d4e',
        }}>
          <div style={{ fontSize: '11px', color: '#6b6b8a', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>
            QUNDIS
          </div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff' }}>
            Ripartitori
          </div>
        </div>

        {/* Albero condomini */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          <Sidebar selectedNode={selectedNode} onSelect={setSelectedNode} onPatchAnagrafica={onPatchAnagrafica} />
        </div>

        {/* Bottone impostazioni */}
        <div style={{ borderTop: '1px solid #2d2d4e', padding: '12px 16px' }}>
          <button
            onClick={() => setShowImpostazioni(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '10px 12px',
              background: showImpostazioni ? '#2d2d4e' : 'transparent',
              border: '1px solid #2d2d4e',
              borderRadius: '8px',
              color: '#a0a0c0',
              cursor: 'pointer',
              fontSize: '13px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#2d2d4e'}
            onMouseLeave={e => e.currentTarget.style.background = showImpostazioni ? '#2d2d4e' : 'transparent'}
          >
            <Settings size={16} />
            Impostazioni
          </button>
        </div>
      </div>

      {/* Pannello principale */}
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {showImpostazioni ? (
          <Impostazioni onClose={() => setShowImpostazioni(false)} />
        ) : (
          <MainPanel ref={mainPanelRef} selectedNode={selectedNode} />
        )}
      </div>

    </div>
  )
}