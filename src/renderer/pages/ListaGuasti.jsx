import React, { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Printer, FileSpreadsheet, Search, X, Flame, Droplet, Snowflake, Wrench } from 'lucide-react'
import { rigaDbToLettura, problemiDispositivo, gravitaMassima, GRAVITA, descrizioneTipo, dataItaliana } from '../utils/letture'

// ─── Stili (stessa grafica della pagina Analisi) ──────────────
const S = {
  wrap:      { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'transparent' },
  topBar:    { flexShrink: 0, padding: '20px 24px 0 24px' },
  topRow:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' },
  eyebrow:   { fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1.5px' },
  title:     { fontSize: '18px', fontWeight: '600', color: '#fff', marginTop: '2px' },
  scroll:    { flex: 1, overflowY: 'auto', padding: '16px 24px 24px' },
  select:    { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '8px', padding: '7px 12px', color: 'rgba(255,255,255,0.8)', fontSize: '12px', outline: 'none', cursor: 'pointer' },
  btn:       { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '9px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' },
  btnPrim:   { background: '#4f46e5', border: 'none', borderRadius: '9px', color: '#fff', cursor: 'pointer', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600' },
  statGrid:  { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' },
  stat:      { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px 14px', cursor: 'pointer', textAlign: 'left' },
  statLabel: { fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' },
  statValue: { fontSize: '22px', fontWeight: '700', letterSpacing: '-0.5px' },
  banda:     { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', padding: '10px 14px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '10px', marginTop: '14px', marginBottom: '6px' },
  th:        { padding: '8px 10px', fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'left', fontWeight: '500', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  td:        { padding: '9px 10px', fontSize: '12px', color: 'rgba(255,255,255,0.75)', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'top' },
  empty:     { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', minHeight: '220px', color: 'rgba(255,255,255,0.25)', fontSize: '13px' },
}

function IconaTipo({ tipo }) {
  if (tipo === 'ACS') return <Droplet size={12} color="#ef4444" />
  if (tipo === 'AFS') return <Droplet size={12} color="#3b82f6" />
  if (tipo === 'FREDDO') return <Snowflake size={12} color="#38bdf8" />
  return <Flame size={12} color="#fb923c" />
}

const FILTRI = [
  { key: 'tutti', label: 'Tutti i guasti', colore: '#a5b4fc' },
  { key: 'sostituire', label: GRAVITA.sostituire.label, colore: GRAVITA.sostituire.colore },
  { key: 'verificare', label: GRAVITA.verificare.label, colore: GRAVITA.verificare.colore },
  { key: 'mancante', label: GRAVITA.mancante.label, colore: GRAVITA.mancante.colore },
]

export default function ListaGuasti({ selectedNode }) {
  const [loading, setLoading] = useState(false)
  const [gruppi, setGruppi] = useState([])          // [{ condominio, ultimaData, righe }]
  const [senzaImport, setSenzaImport] = useState(0)
  const [condFiltro, setCondFiltro] = useState('tutti')
  const [gravFiltro, setGravFiltro] = useState('tutti')
  const [cerca, setCerca] = useState('')

  useEffect(() => {
    // Se è selezionato un condominio parte da quello, altrimenti da tutti
    const id = selectedNode?.type === 'condominio' ? selectedNode.data.id
      : selectedNode?.type === 'piano' ? selectedNode.data.condominio_id : null
    setCondFiltro(id ? String(id) : 'tutti')
    caricaDati()
  }, [])

  async function caricaDati() {
    setLoading(true)
    try {
      const res = await window.api.getDispositiviUltimaLettura({ condominioId: null })
      if (!res.success) throw new Error(res.error)
      const nuovi = res.condomini.map(g => {
        const righe = []
        g.rows.forEach(row => {
          const tipoAnag = row.rip_tipo || 'HCA'
          const lettura = row.lettura_id
            ? rigaDbToLettura(row, g.ultimaData)
            : { tipo: tipoAnag, nessuna_lettura: true }
          const rip = { identnr: row.matricola, ...lettura }
          const problemi = problemiDispositivo(rip)
          if (problemi.length === 0) return
          righe.push({
            piano: row.piano || '', interno: row.interno || '', utente: row.proprietario || '',
            locale: row.locale || '', matricola: row.matricola, tipo: rip.tipo || tipoAnag,
            dispositivo: descrizioneTipo(rip.tipo || tipoAnag), problemi, gravita: gravitaMassima(problemi),
          })
        })
        return { condominio: g.condominio, ultimaData: g.ultimaData, righe }
      })
      setGruppi(nuovi)
      setSenzaImport(res.senzaImport || 0)
    } catch (err) {
      toast.error('Errore caricamento guasti: ' + err.message)
    }
    setLoading(false)
  }

  // ─── Filtri ──────────────────────────────────────────────────
  const gruppiCond = useMemo(() =>
    gruppi.filter(g => condFiltro === 'tutti' || String(g.condominio.id) === condFiltro), [gruppi, condFiltro])

  const conteggi = useMemo(() => {
    const c = { tutti: 0, sostituire: 0, verificare: 0, mancante: 0 }
    gruppiCond.forEach(g => g.righe.forEach(r => {
      c.tutti++
      const gravRiga = new Set(r.problemi.map(p => p.gravita))
      gravRiga.forEach(x => { c[x]++ })
    }))
    return c
  }, [gruppiCond])

  const gruppiVisibili = useMemo(() => {
    const t = cerca.trim().toLowerCase()
    return gruppiCond.map(g => ({
      ...g,
      righe: g.righe.filter(r => {
        if (gravFiltro !== 'tutti' && !r.problemi.some(p => p.gravita === gravFiltro)) return false
        if (!t) return true
        return [r.piano, r.interno, r.utente, r.locale, r.matricola, r.dispositivo, ...r.problemi.map(p => p.testo)]
          .some(v => String(v).toLowerCase().includes(t))
      }).sort((a, b) => GRAVITA[a.gravita].ordine - GRAVITA[b.gravita].ordine),
    })).filter(g => g.righe.length > 0)
  }, [gruppiCond, gravFiltro, cerca])

  const totaleVisibili = gruppiVisibili.reduce((a, g) => a + g.righe.length, 0)

  function descrizioneFiltro() {
    const parti = []
    if (condFiltro !== 'tutti') parti.push(gruppi.find(g => String(g.condominio.id) === condFiltro)?.condominio.nome || '')
    else parti.push('Tutti i condomini')
    if (gravFiltro !== 'tutti') parti.push(GRAVITA[gravFiltro].label)
    if (cerca.trim()) parti.push(`ricerca "${cerca.trim()}"`)
    return parti.filter(Boolean).join(' · ')
  }

  // ─── Stampa PDF ──────────────────────────────────────────────
  async function stampaPdf() {
    if (totaleVisibili === 0) { toast.info('Nessun guasto da stampare'); return }
    const res = await window.api.generaPdfGuasti({
      filtroDescr: descrizioneFiltro(),
      gruppi: gruppiVisibili.map(g => ({
        condominio: g.condominio.nome, indirizzo: g.condominio.indirizzo || '', citta: g.condominio.citta || '',
        ultimaData: dataItaliana(g.ultimaData),
        righe: g.righe.map(r => ({ piano: r.piano, interno: r.interno, utente: r.utente, locale: r.locale, matricola: r.matricola, dispositivo: r.dispositivo, problemi: r.problemi })),
      })),
    })
    if (res?.success) { toast.success('Lista Guasti salvata'); window.api.apriFile({ filePath: res.filePath }) }
    else if (res?.error) toast.error('Errore PDF: ' + res.error)
  }

  // ─── Esporta Excel ───────────────────────────────────────────
  async function esportaExcel() {
    if (totaleVisibili === 0) { toast.info('Nessun guasto da esportare'); return }
    const righe = []
    gruppiVisibili.forEach(g => g.righe.forEach(r => r.problemi.forEach(p => righe.push([
      g.condominio.nome, [g.condominio.indirizzo, g.condominio.citta].filter(Boolean).join(', '),
      r.piano, r.interno, r.utente, r.locale, r.matricola, r.dispositivo,
      GRAVITA[p.gravita].label, p.testo, p.azione, dataItaliana(g.ultimaData),
    ]))))
    const res = await window.api.esportaExcel({
      nomeFile: `Lista_Guasti_${new Date().toLocaleDateString('it-IT').replace(/\//g, '-')}`,
      fogli: [{
        nome: 'Lista Guasti',
        colonne: [
          { titolo: 'Condominio', larghezza: 26 }, { titolo: 'Indirizzo', larghezza: 28 }, { titolo: 'Piano', larghezza: 12 },
          { titolo: 'Interno', larghezza: 9 }, { titolo: 'Utente', larghezza: 22 }, { titolo: 'Locale', larghezza: 16 },
          { titolo: 'Matricola', larghezza: 12 }, { titolo: 'Dispositivo', larghezza: 18 }, { titolo: 'Gravità', larghezza: 14 },
          { titolo: 'Problema', larghezza: 48 }, { titolo: 'Azione', larghezza: 26 }, { titolo: 'Ultima lettura', larghezza: 14 },
        ],
        righe,
      }],
    })
    if (res?.success) { toast.success('File Excel salvato'); window.api.apriFile({ filePath: res.filePath }) }
    else if (res?.error) toast.error('Errore Excel: ' + res.error)
  }

  return (
    <div style={S.wrap}>
      <div style={S.topBar}>
        <div style={S.topRow}>
          <div>
            <div style={S.eyebrow}>Lista Guasti</div>
            <div style={S.title}>{condFiltro === 'tutti' ? 'Tutti i condomini' : (gruppi.find(g => String(g.condominio.id) === condFiltro)?.condominio.nome || 'Condominio')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select value={condFiltro} onChange={e => setCondFiltro(e.target.value)} style={S.select}>
              <option value="tutti">Tutti i condomini</option>
              {gruppi.map(g => <option key={g.condominio.id} value={String(g.condominio.id)}>{g.condominio.nome}</option>)}
            </select>
            <button onClick={caricaDati} style={S.btn}><RefreshCw size={13} /> Aggiorna</button>
            <button onClick={esportaExcel} style={S.btn}><FileSpreadsheet size={13} /> Excel</button>
            <button onClick={stampaPdf} style={S.btnPrim}><Printer size={13} /> Stampa PDF</button>
          </div>
        </div>
      </div>

      <div style={S.scroll}>
        {/* Riepilogo per gravità (cliccabile come filtro) */}
        <div style={S.statGrid}>
          {FILTRI.map(f => {
            const attivo = gravFiltro === f.key
            return (
              <button key={f.key} onClick={() => setGravFiltro(f.key)} style={{
                ...S.stat,
                border: attivo ? `1px solid ${f.colore}` : S.stat.border,
                background: attivo ? 'rgba(255,255,255,0.06)' : S.stat.background,
              }}>
                <div style={S.statLabel}>{f.label}</div>
                <div style={{ ...S.statValue, color: f.colore }}>{conteggi[f.key]}</div>
              </button>
            )
          })}
        </div>

        {/* Ricerca */}
        <div style={{ position: 'relative', marginBottom: '6px' }}>
          <Search size={14} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Cerca per utente, interno, matricola, problema..."
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 34px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '9px', color: 'rgba(255,255,255,0.8)', fontSize: '12px', outline: 'none' }} />
          {cerca && (
            <button onClick={() => setCerca('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>

        {loading && <div style={S.empty}><RefreshCw size={22} /> Caricamento...</div>}

        {!loading && totaleVisibili === 0 && (
          <div style={S.empty}>
            <Wrench size={36} color="rgba(74,222,128,0.5)" />
            <div>{gruppi.length === 0 ? 'Nessun condominio con letture importate' : 'Nessun guasto con i filtri selezionati'}</div>
          </div>
        )}

        {!loading && gruppiVisibili.map(g => (
          <div key={g.condominio.id}>
            <div style={S.banda}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>{g.condominio.nome}</span>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginLeft: '10px' }}>{[g.condominio.indirizzo, g.condominio.citta].filter(Boolean).join(', ')}</span>
              </div>
              <span style={{ fontSize: '11px', color: '#a5b4fc', whiteSpace: 'nowrap' }}>{g.righe.length} dispositivi · ultima lettura {dataItaliana(g.ultimaData)}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={S.th}>Piano</th><th style={S.th}>Interno</th><th style={S.th}>Utente</th>
                  <th style={S.th}>Locale</th><th style={S.th}>Matricola</th><th style={{ ...S.th, width: '45%' }}>Problema e azione</th>
                </tr>
              </thead>
              <tbody>
                {g.righe.map((r, i) => (
                  <tr key={i}>
                    <td style={S.td}>{r.piano || '—'}</td>
                    <td style={S.td}>{r.interno || '—'}</td>
                    <td style={S.td}>{r.utente || '—'}</td>
                    <td style={S.td}>{r.locale || '—'}</td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontFamily: 'monospace' }}>
                        <IconaTipo tipo={r.tipo} /> {r.matricola}
                      </span>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>{r.dispositivo}</div>
                    </td>
                    <td style={S.td}>
                      {r.problemi.map((p, k) => (
                        <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '3px' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: '700', padding: '1px 7px', borderRadius: '9px', whiteSpace: 'nowrap',
                            color: GRAVITA[p.gravita].colore, border: `1px solid ${GRAVITA[p.gravita].colore}55`, background: `${GRAVITA[p.gravita].colore}14`,
                          }}>{p.azione}</span>
                          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>{p.testo}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {!loading && senzaImport > 0 && condFiltro === 'tutti' && (
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '16px' }}>
            {senzaImport} condomini non ancora importati non sono inclusi.
          </div>
        )}
      </div>
    </div>
  )
}
