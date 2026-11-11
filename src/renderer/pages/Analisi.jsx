import React, { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, RefreshCw, BarChart2, ArrowLeftRight, Wrench, Thermometer } from 'lucide-react'
import { toast } from 'sonner'
import { TIPI, isContatore } from '../utils/parserQundis'

// ─── Stili costanti ────────────────────────────────────────────
const S = {
  wrap:       { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'transparent' },
  topBar:     { flexShrink: 0, padding: '20px 24px 0 24px' },
  topRow:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' },
  eyebrow:    { fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1.5px' },
  title:      { fontSize: '18px', fontWeight: '600', color: '#fff', marginTop: '2px' },
  tabs:       { display: 'flex', gap: '2px', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: '0' },
  tab:        { padding: '9px 16px', background: 'transparent', border: 'none', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s' },
  scroll:     { flex: 1, overflowY: 'auto', padding: '20px 24px 24px' },
  card:       { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '16px', marginBottom: '16px' },
  cardTitle:  { fontSize: '13px', fontWeight: '500', color: 'rgba(255,255,255,0.7)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' },
  grid2:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' },
  grid3:      { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' },
  statBox:    { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px' },
  statLabel:  { fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' },
  statValue:  { fontSize: '24px', fontWeight: '700', color: '#a5b4fc', letterSpacing: '-0.5px' },
  statSub:    { fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '4px' },
  alertOk:    { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: '10px', marginBottom: '8px' },
  alertWarn:  { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: '10px', marginBottom: '8px' },
  alertErr:   { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: '10px', marginBottom: '8px' },
  alertTxt:   { fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.5' },
  alertSub:   { fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' },
  select:     { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '8px', padding: '7px 12px', color: 'rgba(255,255,255,0.8)', fontSize: '12px', outline: 'none', cursor: 'pointer' },
  empty:      { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', minHeight: '200px', color: 'rgba(255,255,255,0.2)', fontSize: '13px' },
  sostRow:    { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', marginBottom: '8px' },
  sostMat:    { fontSize: '12px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)' },
  sostSub:    { fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' },
  sostDate:   { fontSize: '10px', color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap' },
  loading:    { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'rgba(255,255,255,0.3)', fontSize: '13px', gap: '10px' },
}

const TOOLTIP_STYLE = {
  contentStyle: { background: 'rgba(15,15,35,0.97)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '10px', fontSize: '12px', color: '#fff' },
  itemStyle: { color: '#a5b4fc' },
  labelStyle: { color: 'rgba(255,255,255,0.5)', fontSize: '11px' },
}

export default function Analisi({ selectedNode }) {
  const [tabAttivo, setTabAttivo] = useState('panoramica')
  const [storico, setStorico]     = useState([])
  const [sostituzioni, setSostituzioni] = useState([])
  const [loading, setLoading]     = useState(false)
  const [ripSelezionato, setRipSelezionato] = useState('')
  const [climaData, setClimaData]     = useState(null)   // risultati analisi climatica
  const [climaLoading, setClimaLoading] = useState(false)
  const [climaError, setClimaError]   = useState(null)
  const [climaCerca, setClimaCerca]   = useState('')
  const [tipoAnalisi, setTipoAnalisi] = useState('HCA')
  const geocacheRef = React.useRef({})   // { citta: {lat, lon} }
  const gddCacheRef = React.useRef({})   // { 'lat,lon,start,end': gdd }

  const condominioId = useMemo(() => {
    if (!selectedNode) return null
    if (selectedNode.type === 'condominio') return selectedNode.data.id
    if (selectedNode.type === 'piano') return selectedNode.data.condominio_id
    return null
  }, [selectedNode])

  useEffect(() => {
    if (!condominioId) return
    caricaDati()
  }, [condominioId])

  async function caricaDati() {
    setLoading(true)
    try {
      const [storicoRes, sostRes] = await Promise.all([
        window.api.getStoricoCondominio({ condominioId }),
        window.api.getSostituzioniCondominio({ condominioId }),
      ])
      if (storicoRes.success) setStorico(storicoRes.rows)
      if (sostRes.success) setSostituzioni(sostRes.rows)
    } catch(e) {
      toast.error('Errore caricamento analisi: ' + e.message)
    }
    setLoading(false)
  }

  // ─── Geocoding e GDD (Open-Meteo) ────────────────────────────────────────
  async function geocodeCity(citta) {
    if (!citta) return null
    const key = citta.toLowerCase().trim()
    if (geocacheRef.current[key]) return geocacheRef.current[key]
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(citta)}&count=1&language=it&format=json`
      const res = await fetch(url)
      const data = await res.json()
      if (!data.results?.length) return null
      const { latitude: lat, longitude: lon } = data.results[0]
      geocacheRef.current[key] = { lat, lon }
      return { lat, lon }
    } catch { return null }
  }

  async function fetchGDD(lat, lon, startDate, endDate) {
    const cacheKey = `${lat},${lon},${startDate},${endDate}`
    if (gddCacheRef.current[cacheKey] !== undefined) return gddCacheRef.current[cacheKey]
    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_mean&timezone=Europe%2FRome`
      const res = await fetch(url)
      const data = await res.json()
      const temps = data.daily?.temperature_2m_mean || []
      const gdd = temps.reduce((sum, t) => sum + Math.max(0, 20 - t), 0)
      const tempMedia = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null
      const result = {
        gdd: Math.round(gdd * 10) / 10,
        tempMedia: tempMedia !== null ? Math.round(tempMedia * 10) / 10 : null,
      }
      gddCacheRef.current[cacheKey] = result
      return gddCacheRef.current[cacheKey]
    } catch { return null }
  }

  function stagionePeriodo(dataLetturaYmd, meseAcc, meseSpe) {
    // Data lettura: YYYY-MM-DD
    // Stagione: da (anno-1 se mese lettura <= meseSpe) accensione a spegnimento
    const [anno] = dataLetturaYmd.split('-').map(Number)
    const meseL = parseInt(dataLetturaYmd.split('-')[1])
    // Se siamo nel periodo post-accensione (es. nov-dic), la stagione finisce l'anno prossimo
    const annoFine = meseL >= meseAcc ? anno + 1 : anno
    const annoInizio = annoFine - 1
    const start = `${annoInizio}-${String(meseAcc).padStart(2,'0')}-01`
    // Ultimo giorno del mese di spegnimento
    const ultimoGiorno = new Date(annoFine, meseSpe, 0).getDate()
    const end = `${annoFine}-${String(meseSpe).padStart(2,'0')}-${ultimoGiorno}`
    return { start, end }
  }

  async function caricaClima() {
    if (!storico.length || !stats) return
    setClimaLoading(true)
    setClimaError(null)
    try {
      // Leggi impostazioni stagione
      const imp = await window.api.getImpostazioni()
      const meseAcc = parseInt(imp.mese_accensione) || 10
      const meseSpe = parseInt(imp.mese_spegnimento) || 4
      const coeffDisp = parseFloat(imp.coeff_dispersione) || 2.0
      const sogliaVerde = parseFloat((1.0 - (0.05 + 0.05 * coeffDisp)).toFixed(2))
      const sogliaRossa = parseFloat((1.0 + 0.10 * coeffDisp).toFixed(2))

      // Città del condominio (da prima riga storico)
      const citta = storico[0]?.citta || storico[0]?.proprietario || null
      // Recupera citta dal DB tramite nome condominio
      const tuttiCond = await window.api.getCondomini()
      const cond = tuttiCond.find(c => c.id === condominioId)
      const cittaCond = cond?.citta || ''
      if (!cittaCond) { setClimaError('Città non configurata nell\'anagrafica del condominio'); setClimaLoading(false); return }

      const coords = await geocodeCity(cittaCond)
      if (!coords) { setClimaError(`Città "${cittaCond}" non trovata — verifica il nome in anagrafica`); setClimaLoading(false); return }

      // Data ultima lettura in DB
      const ultimaData = stats.ultimaData  // YYYY-MM-DD
      if (!ultimaData) { setClimaError('Nessuna lettura nel DB'); setClimaLoading(false); return }

      // Stagione corrente e precedente
      const stagCorrente  = stagionePeriodo(ultimaData, meseAcc, meseSpe)
      // Anno precedente: stessa logica ma un anno prima
      const [ac, mc, gc] = stagCorrente.start.split('-').map(Number)
      const stagPrecedente = {
        start: `${ac - 1}-${String(mc).padStart(2,'0')}-${String(gc).padStart(2,'0')}`,
        end:   (() => {
          const [ae, me] = stagCorrente.end.split('-').map(Number)
          const ult = new Date(ae - 1, me, 0).getDate()
          return `${ae - 1}-${String(me).padStart(2,'0')}-${String(ult).padStart(2,'0')}`
        })()
      }

      // Fetch GDD paralleli
      const [resCorr, resPrec] = await Promise.all([
        fetchGDD(coords.lat, coords.lon, stagCorrente.start, stagCorrente.end),
        fetchGDD(coords.lat, coords.lon, stagPrecedente.start, stagPrecedente.end),
      ])
      if (resCorr === null || resPrec === null) { setClimaError('Errore nel recupero dati climatici (connessione richiesta)'); setClimaLoading(false); return }
      const gddCorr = resCorr.gdd
      const gddPrec = resPrec.gdd
      const tempMediaCorr = resCorr.tempMedia
      const tempMediaPrec = resPrec.tempMedia

      // Calcola indici per ogni ripartitore con dato anno precedente
      const righe = []
      Object.entries(stats.perMatricola).forEach(([matricola, letture]) => {
        const ultima = letture[letture.length - 1]
        const hcaCorr = ultima.hca_valore
        // Usa hca_ago_prec_json salvato nell'XML — stesso mese anno precedente
        let hcaPrec = null
        if (ultima.hca_ago_prec_json) {
          try {
            const agoPrev = JSON.parse(ultima.hca_ago_prec_json)
            hcaPrec = agoPrev?.value ? parseFloat(agoPrev.value) : null
          } catch { hcaPrec = null }
        }
        if (!hcaCorr || !hcaPrec || gddCorr === 0 || gddPrec === 0) return
        const normCorr = hcaCorr / gddCorr
        const normPrec = hcaPrec / gddPrec
        const indice   = normPrec > 0 ? Math.round((normCorr / normPrec) * 100) / 100 : null
        if (indice === null) return
        righe.push({
          matricola,
          proprietario: ultima.proprietario,
          piano: ultima.piano,
          locale: ultima.locale,
          hcaCorr: Math.round(hcaCorr * 10) / 10,
          hcaPrec: Math.round(hcaPrec * 10) / 10,
          gddCorr,
          gddPrec,
          normCorr: Math.round(normCorr * 1000) / 1000,
          normPrec: Math.round(normPrec * 1000) / 1000,
          indice,
        })
      })

      righe.sort((a, b) => b.indice - a.indice)
      setClimaData({ righe, cittaCond, coords, stagCorrente, stagPrecedente, gddCorr, gddPrec, tempMediaCorr, tempMediaPrec, sogliaVerde, sogliaRossa, coeffDisp })
    } catch (e) {
      setClimaError('Errore: ' + e.message)
    }
    setClimaLoading(false)
  }

  // ─── Tipi dispositivo presenti (ripartitori / contabilizzatori) ────────────
  const tipoRiga = (r) => r.tipo || r.rip_tipo || 'HCA'
  const tipiPresenti = useMemo(() => {
    const set = new Set(storico.map(tipoRiga))
    return Object.keys(TIPI).filter(t => set.has(t))
  }, [storico])

  useEffect(() => {
    if (tipiPresenti.length > 0 && !tipiPresenti.includes(tipoAnalisi)) {
      setTipoAnalisi(tipiPresenti[0])
      setClimaData(null)
    }
  }, [tipiPresenti])

  const contatore = isContatore(tipoAnalisi)
  const unitaAnalisi = TIPI[tipoAnalisi]?.unita || 'H.C.A.'
  const nomeDispositivi = contatore ? 'Contatori' : 'Ripartitori'

  // Righe del solo tipo selezionato. Per i contatori il valore analizzato
  // è il consumo calcolato (anno solare / dal montaggio), non la lettura progressiva.
  const storicoTipo = useMemo(() => {
    return storico
      .filter(r => tipoRiga(r) === tipoAnalisi)
      .map(r => {
        if (!isContatore(tipoAnalisi)) return r
        let consumo = null
        try { consumo = r.consumo_json ? JSON.parse(r.consumo_json) : null } catch { consumo = null }
        return { ...r, hca_valore: consumo ? consumo.valore : null }
      })
  }, [storico, tipoAnalisi])

  // ─── Calcoli statistiche ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const storico = storicoTipo
    if (storico.length === 0) return null

    // Raggruppa per matricola (tutte le letture, ordinate per data ASC)
    const perMatricola = {}
    storico.forEach(r => {
      if (!perMatricola[r.matricola]) perMatricola[r.matricola] = []
      perMatricola[r.matricola].push(r)
    })

    // Data dell'ultimo import (più recente nel DB)
    const ultimaData = [...new Set(storico.map(r => r.data_lettura))].sort().slice(-1)[0]

    // Valori HCA solo dell'ultimo import, escludendo gli zero
    const valoriUltimoImport = storico
      .filter(r => r.data_lettura === ultimaData && r.hca_valore > 0)
      .map(r => r.hca_valore)

    // Media con IQR solo sul lato basso: esclude valori anomalmente bassi (antigelo, guasti)
    // ma NON esclude i valori alti — un consumo elevato è legittimo
    function mediaIqr(valori) {
      if (valori.length === 0) return 0
      if (valori.length <= 3) return valori.reduce((a, b) => a + b, 0) / valori.length
      const sorted = [...valori].sort((a, b) => a - b)
      const q1 = sorted[Math.floor(sorted.length * 0.25)]
      const q3 = sorted[Math.floor(sorted.length * 0.75)]
      const iqr = q3 - q1
      const lowerBound = q1 - 1.5 * iqr   // solo limite inferiore
      const filtrati = sorted.filter(v => v >= lowerBound)
      if (filtrati.length === 0) return valori.reduce((a, b) => a + b, 0) / valori.length
      return filtrati.reduce((a, b) => a + b, 0) / filtrati.length
    }

    const media = mediaIqr(valoriUltimoImport)

    const conErrore = storico.filter(r =>
      r.data_lettura === ultimaData && r.status && r.status !== '0'
    ).length

    const totImport = [...new Set(storico.map(r => r.data_lettura))].length

    return {
      totRipartitori: Object.keys(perMatricola).length,
      totLetture: storico.length,
      mediaHca: Math.round(media * 10) / 10,
      ultimaData,
      conErrore,
      totImport,
      perMatricola,
    }
  }, [storicoTipo])

  // ─── Alert automatici ─────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    if (!stats) return []
    const risultati = []
    const media = stats.mediaHca

    Object.entries(stats.perMatricola).forEach(([matricola, letture]) => {
      const ultima = letture[letture.length - 1]
      const valore = ultima.hca_valore || 0
      const sub = `${ultima.proprietario} — ${ultima.locale} (${ultima.piano})`

      // Errore status dispositivo
      if (ultima.status && ultima.status !== '0') {
        risultati.push({
          tipo: 'error', matricola,
          msg: `Errore status: ${ultima.status}`,
          sub,
        })
      }

      // Errore errorflags
      if (ultima.errorflags && ultima.errorflags !== '0') {
        risultati.push({
          tipo: 'error', matricola,
          msg: `Errorflags: ${ultima.errorflags}${ultima.errordate ? ` (${ultima.errordate})` : ''}`,
          sub,
        })
      }

      // Batteria scarica
      if (ultima.powerstatus && ultima.powerstatus.toLowerCase().includes('low')) {
        risultati.push({
          tipo: 'warn', matricola,
          msg: `Batteria scarica: ${ultima.powerstatus}`,
          sub,
        })
      }

      // Consumo anomalo — confronto con la lettura precedente dello stesso ripartitore
      // (non per i contatori: il consumo annuo cresce naturalmente tra un import e l'altro)
      if (!contatore && letture.length >= 2) {
        const precedente = letture[letture.length - 2].hca_valore
        if (precedente > 0 && valore > precedente * 2) {
          risultati.push({
            tipo: 'warn', matricola,
            msg: `Consumo raddoppiato rispetto all'import precedente: ${valore} ${unitaAnalisi} (prima: ${precedente})`,
            sub: `${sub} — +${Math.round(((valore - precedente) / precedente) * 100)}% rispetto all'import precedente`,
          })
        }
      }

      // Consumo zero sospetto — solo se c'è almeno una lettura precedente con valore > 0
      if (!contatore && letture.length >= 2 && valore === 0 && letture[letture.length - 2].hca_valore > 0) {
        risultati.push({
          tipo: 'warn', matricola,
          msg: `Consumo zero sospetto`,
          sub: `${sub} — era ${letture[letture.length - 2].hca_valore} al precedente import`,
        })
      }
    })

    return risultati
  }, [stats, contatore, unitaAnalisi])

  // ─── Dati grafico confronto ultimo import ─────────────────────────────────
  const datiConfronto = useMemo(() => {
    if (!stats) return []
    const ultimaData = [...new Set(storicoTipo.map(r => r.data_lettura))].sort().slice(-1)[0]
    if (!ultimaData) return []
    return storicoTipo
      .filter(r => r.data_lettura === ultimaData && r.hca_valore > 0)
      .map(r => ({
        name: `${r.proprietario?.split(' ')[0] || ''} (${r.locale || ''})`,
        hca: r.hca_valore,
        media: stats.mediaHca,
      }))
      .sort((a, b) => b.hca - a.hca)
      .slice(0, 20)
  }, [storicoTipo, stats])

  // ─── Dati grafico trend ripartitore selezionato ───────────────────────────
  const datiTrend = useMemo(() => {
    if (!ripSelezionato || !stats) return []
    const letture = stats.perMatricola[ripSelezionato] || []
    return letture.map(r => ({
      data: r.data_lettura,
      hca: r.hca_valore || 0,
    }))
  }, [ripSelezionato, stats])

  const matricoleDisponibili = useMemo(() => {
    if (!stats) return []
    return Object.entries(stats.perMatricola)
      .filter(([, arr]) => arr.length > 1)
      .map(([matricola, arr]) => ({
        matricola,
        label: `${arr[0].proprietario || ''} — ${arr[0].locale || ''} (${matricola})`,
      }))
  }, [stats])

  const TABS = [
    { key: 'panoramica',  label: 'Panoramica',   icon: BarChart2 },
    { key: 'trend',       label: contatore ? 'Trend consumo' : 'Trend H.C.A.', icon: TrendingUp },
    { key: 'alert',       label: `Alert${alerts.length > 0 ? ` (${alerts.length})` : ''}`, icon: AlertTriangle },
    { key: 'clima',       label: 'Clima GDD',    icon: Thermometer },
    { key: 'sostituzioni',label: 'Sostituzioni', icon: Wrench },
  ]

  if (!condominioId) {
    return (
      <div style={S.wrap}>
        <div style={S.topBar}>
          <div style={S.eyebrow}>Sezione</div>
          <div style={S.title}>Analisi</div>
        </div>
        <div style={S.scroll}>
          <div style={S.empty}>
            <BarChart2 size={36} color="rgba(99,102,241,0.4)" />
            Seleziona un condominio dalla sidebar per vedere l'analisi
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={S.wrap}>
      <div style={S.topBar}>
        <div style={S.topRow}>
          <div>
            <div style={S.eyebrow}>Analisi</div>
            <div style={S.title}>{selectedNode?.data?.nome || 'Condominio'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {tipiPresenti.length > 1 && (
              <select value={tipoAnalisi} onChange={e => { setTipoAnalisi(e.target.value); setRipSelezionato(''); setClimaData(null); setClimaError(null) }} style={S.select}>
                {tipiPresenti.map(t => (
                  <option key={t} value={t}>{TIPI[t].labelPlurale} ({TIPI[t].unita})</option>
                ))}
              </select>
            )}
            <button onClick={caricaDati} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '9px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
              <RefreshCw size={13} /> Aggiorna
            </button>
          </div>
        </div>
        <div style={S.tabs}>
          {TABS.map(tab => {
            const isActive = tabAttivo === tab.key
            const hasAlert = tab.key === 'alert' && alerts.length > 0
            return (
              <button key={tab.key} onClick={() => setTabAttivo(tab.key)} style={{
                ...S.tab,
                color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.35)',
                borderBottom: isActive ? '2px solid #6366f1' : '2px solid transparent',
                marginBottom: '-1px',
                fontWeight: isActive ? '500' : '400',
                ...(hasAlert && !isActive ? { color: '#fbbf24' } : {}),
              }}>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={S.scroll}>
        {loading && (
          <div style={S.loading}>
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Caricamento dati...
          </div>
        )}

        {!loading && storico.length === 0 && (
          <div style={S.empty}>
            <BarChart2 size={36} color="rgba(99,102,241,0.3)" />
            <div>Nessuna lettura salvata nel DB</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.15)', textAlign: 'center' }}>
              Importa un file XML per iniziare a raccogliere dati
            </div>
          </div>
        )}

        {!loading && storico.length > 0 && tabAttivo === 'panoramica' && stats && (
          <>
            <div style={S.grid3}>
              <div style={S.statBox}>
                <div style={S.statLabel}>{nomeDispositivi} tracciati</div>
                <div style={S.statValue}>{stats.totRipartitori}</div>
                <div style={S.statSub}>{stats.totImport} import nel DB</div>
              </div>
              <div style={S.statBox}>
                <div style={S.statLabel}>{contatore ? `Media consumo ${unitaAnalisi} (IQR)` : 'Media H.C.A. (IQR)'}</div>
                <div style={S.statValue}>{stats.mediaHca}</div>
                <div style={S.statSub}>Ultimo import: {stats.ultimaData} — outlier esclusi</div>
              </div>
              <div style={{ ...S.statBox, borderColor: stats.conErrore > 0 ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.06)' }}>
                <div style={S.statLabel}>Con errore (ultimo import)</div>
                <div style={{ ...S.statValue, color: stats.conErrore > 0 ? '#f87171' : '#4ade80' }}>{stats.conErrore}</div>
                <div style={S.statSub}>{stats.conErrore === 0 ? 'Tutti OK' : 'Verificare dispositivi'}</div>
              </div>
            </div>

            <div style={S.card}>
              <div style={S.cardTitle}>
                <BarChart2 size={14} color="#818cf8" />
                {contatore ? `Confronto consumi (${unitaAnalisi})` : 'Confronto H.C.A.'} — Ultimo import
              </div>
              {datiConfronto.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={datiConfronto} margin={{ top: 5, right: 10, left: -20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <ReferenceLine y={stats.mediaHca} stroke="rgba(251,191,36,0.5)" strokeDasharray="4 4" label={{ value: 'Media', fill: 'rgba(251,191,36,0.5)', fontSize: 10 }} />
                    <Bar dataKey="hca" fill="rgba(99,102,241,0.7)" radius={[4, 4, 0, 0]} name={unitaAnalisi} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={S.empty}>Nessun dato disponibile</div>
              )}
            </div>

            {sostituzioni.length > 0 && (
              <div style={S.card}>
                <div style={S.cardTitle}>
                  <Wrench size={14} color="#818cf8" />
                  Ultime sostituzioni
                </div>
                {sostituzioni.slice(0, 3).map((s, i) => (
                  <div key={i} style={S.sostRow}>
                    <ArrowLeftRight size={16} color="#fbbf24" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.sostMat}>{s.vecchia_matricola} → {s.nuova_matricola}</div>
                      <div style={S.sostSub}>{s.proprietario} — {s.locale} ({s.piano}){s.motivo ? ` — ${s.motivo}` : ''}</div>
                    </div>
                    <div style={S.sostDate}>{s.data_sostituzione}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!loading && storico.length > 0 && tabAttivo === 'trend' && (
          <div style={S.card}>
            <div style={S.cardTitle}>
              <TrendingUp size={14} color="#818cf8" />
              {contatore ? `Trend consumo (${unitaAnalisi}) nel tempo` : 'Trend H.C.A. nel tempo'}
            </div>
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{contatore ? 'Contatore:' : 'Ripartitore:'}</label>
              <select value={ripSelezionato} onChange={e => setRipSelezionato(e.target.value)} style={S.select}>
                <option value="">{contatore ? '— Seleziona un contatore —' : '— Seleziona un ripartitore —'}</option>
                {matricoleDisponibili.map(m => (
                  <option key={m.matricola} value={m.matricola}>{m.label}</option>
                ))}
              </select>
            </div>
            {matricoleDisponibili.length === 0 && (
              <div style={S.empty}>
                Servono almeno 2 import per visualizzare il trend
              </div>
            )}
            {ripSelezionato && datiTrend.length > 1 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={datiTrend} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="data" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="hca" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 4 }} activeDot={{ r: 6, fill: '#a5b4fc' }} name={unitaAnalisi} />
                </LineChart>
              </ResponsiveContainer>
            ) : ripSelezionato ? (
              <div style={S.empty}>Dati insufficienti per questo dispositivo</div>
            ) : null}
          </div>
        )}

        {!loading && tabAttivo === 'alert' && (
          <div>
            {alerts.length === 0 ? (
              <div style={{ ...S.alertOk, marginBottom: '0' }}>
                <CheckCircle size={16} color="#4ade80" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <div style={{ ...S.alertTxt, color: '#4ade80' }}>Nessun alert rilevato</div>
                  <div style={S.alertSub}>Tutti i {nomeDispositivi.toLowerCase()} nell'ultimo import risultano nella norma</div>
                </div>
              </div>
            ) : (
              alerts.map((a, i) => (
                <div key={i} style={a.tipo === 'error' ? S.alertErr : S.alertWarn}>
                  {a.tipo === 'error'
                    ? <AlertTriangle size={15} color="#f87171" style={{ flexShrink: 0, marginTop: '1px' }} />
                    : <AlertTriangle size={15} color="#fbbf24" style={{ flexShrink: 0, marginTop: '1px' }} />
                  }
                  <div>
                    <div style={S.alertTxt}>{a.msg}</div>
                    <div style={S.alertSub}>{a.sub}</div>
                    <div style={{ ...S.alertSub, fontFamily: 'monospace', marginTop: '4px', color: 'rgba(255,255,255,0.2)' }}>{a.matricola}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!loading && tabAttivo === 'clima' && (tipoAnalisi === 'ACS' || tipoAnalisi === 'AFS' || tipoAnalisi === 'FREDDO') && (
          <div style={{ ...S.empty, minHeight: '160px' }}>
            <Thermometer size={36} color="rgba(99,102,241,0.4)" />
            <div>L'analisi climatica (Gradi Giorno di riscaldamento) non si applica a questo tipo di contatore</div>
          </div>
        )}

        {!loading && tabAttivo === 'clima' && tipoAnalisi !== 'ACS' && tipoAnalisi !== 'AFS' && tipoAnalisi !== 'FREDDO' && (
          <div>
            {/* Pulsante calcola */}
            {!climaData && !climaLoading && !climaError && (
              <div style={{ ...S.empty, minHeight: '160px' }}>
                <Thermometer size={36} color="rgba(99,102,241,0.4)" />
                <div>Calcola l'efficienza termica normalizzata per i Gradi Giorno</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
                  Richiede connessione internet (Open-Meteo) e almeno 2 stagioni nel DB
                </div>
                <button onClick={caricaClima} style={{ marginTop: '8px', padding: '10px 24px', background: 'linear-gradient(135deg, #6366f1, #7c3aed)', border: 'none', borderRadius: '10px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                  Calcola analisi climatica
                </button>
              </div>
            )}

            {climaLoading && (
              <div style={S.loading}>
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Recupero dati climatici da Open-Meteo...
              </div>
            )}

            {climaError && (
              <div style={{ ...S.alertErr, marginBottom: '12px' }}>
                <AlertTriangle size={15} color="#f87171" style={{ flexShrink: 0 }} />
                <div>
                  <div style={S.alertTxt}>{climaError}</div>
                  <button onClick={() => { setClimaError(null); setClimaData(null) }}
                    style={{ marginTop: '8px', padding: '5px 14px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '7px', color: '#f87171', cursor: 'pointer', fontSize: '11px' }}>
                    Riprova
                  </button>
                </div>
              </div>
            )}

            {climaData && (
              <>
                {/* Intestazione con dati stagione */}
                <div style={S.card}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={S.cardTitle}>
                      <span style={{ marginRight: '8px' }}>🌡️</span>
                      Analisi climatica — {climaData.cittaCond}
                    </div>
                    <button onClick={() => { setClimaData(null); setClimaError(null) }}
                      style={{ padding: '5px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '8px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '11px' }}>
                      Ricalcola
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={S.statBox}>
                      <div style={S.statLabel}>Stagione corrente</div>
                      <div style={{ fontSize: '13px', color: '#a5b4fc', fontWeight: '600' }}>{climaData.stagCorrente.start} → {climaData.stagCorrente.end}</div>
                      {climaData.tempMediaCorr !== null && (
                        <div style={S.statSub}>T° media: <strong style={{ color: '#fff' }}>{climaData.tempMediaCorr}°C</strong></div>
                      )}
                      <div style={S.statSub}>GDD: <strong style={{ color: '#fff' }}>{climaData.gddCorr}</strong> gradi·giorno</div>
                    </div>
                    <div style={S.statBox}>
                      <div style={S.statLabel}>Stagione precedente</div>
                      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', fontWeight: '600' }}>{climaData.stagPrecedente.start} → {climaData.stagPrecedente.end}</div>
                      {climaData.tempMediaPrec !== null && (
                        <div style={S.statSub}>T° media: <strong style={{ color: '#fff' }}>{climaData.tempMediaPrec}°C</strong></div>
                      )}
                      <div style={S.statSub}>GDD: <strong style={{ color: '#fff' }}>{climaData.gddPrec}</strong> gradi·giorno</div>
                    </div>
                  </div>
                  <div style={{ marginTop: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
                    Coordinate: {climaData.coords.lat.toFixed(3)}°N, {climaData.coords.lon.toFixed(3)}°E — fonte: Open-Meteo archive — base GDD 20°C (DPR 412/93)
                  </div>
                </div>

                {/* Legenda + contatori */}
                {(() => {
                  const { sogliaVerde, sogliaRossa } = climaData
                  const migliorati = climaData.righe.filter(r => r.indice < sogliaVerde).length
                  const inLinea    = climaData.righe.filter(r => r.indice >= sogliaVerde && r.indice <= sogliaRossa).length
                  const elevati    = climaData.righe.filter(r => r.indice > sogliaRossa).length
                  return (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                      {[
                        { color: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.2)', label: `Consumo migliorato (< ${sogliaVerde})`, count: migliorati },
                        { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.2)',  label: `In linea col clima (${sogliaVerde}–${sogliaRossa})`,  count: inLinea },
                        { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', label: `Consumo elevato (> ${sogliaRossa})`, count: elevati },
                      ].map(({ color, bg, border, label, count }) => (
                        <div key={label} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          background: bg, border: `1px solid ${border}`,
                          borderRadius: '10px', padding: '7px 14px', flex: 1, minWidth: '140px',
                        }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>{label}</div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color, letterSpacing: '-0.5px' }}>{count}</div>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Cerca */}
                {climaData.righe.length > 0 && (
                  <div style={{ position: 'relative', marginBottom: '12px' }}>
                    <input
                      type="text"
                      placeholder="Cerca matricola, proprietario, locale..."
                      value={climaCerca}
                      onChange={e => setClimaCerca(e.target.value)}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        borderRadius: '10px', padding: '9px 36px 9px 14px',
                        color: 'rgba(255,255,255,0.8)', fontSize: '12px', outline: 'none',
                      }}
                    />
                    {climaCerca && (
                      <button onClick={() => setClimaCerca('')} style={{
                        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                        cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0,
                      }}>✕</button>
                    )}
                  </div>
                )}

                {/* Tabella ripartitori */}
                {(() => {
                  const q = climaCerca.trim().toLowerCase()
                  const righe = q
                    ? climaData.righe.filter(r =>
                        r.matricola?.toLowerCase().includes(q) ||
                        r.proprietario?.toLowerCase().includes(q) ||
                        r.locale?.toLowerCase().includes(q) ||
                        r.piano?.toLowerCase().includes(q)
                      )
                    : climaData.righe
                  if (climaData.righe.length === 0) return <div style={S.empty}>Nessun dispositivo con dati per entrambe le stagioni</div>
                  if (righe.length === 0) return <div style={S.empty}>Nessun risultato per "{climaCerca}"</div>
                  const { sogliaVerde: sv, sogliaRossa: sr } = climaData
                  return righe.map((r, i) => {
                    const color = r.indice < sv ? '#4ade80' : r.indice <= sr ? '#fbbf24' : '#f87171'
                    const bg    = r.indice < sv ? 'rgba(74,222,128,0.05)' : r.indice <= sr ? 'rgba(251,191,36,0.05)' : 'rgba(248,113,113,0.05)'
                    const border= r.indice < sv ? 'rgba(74,222,128,0.15)' : r.indice <= sr ? 'rgba(251,191,36,0.15)' : 'rgba(248,113,113,0.2)'
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', background: bg, border: `1px solid ${border}`, borderRadius: '11px', marginBottom: '8px' }}>
                        {/* Indice */}
                        <div style={{ width: '52px', flexShrink: 0, textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', fontWeight: '700', color, letterSpacing: '-0.5px' }}>{r.indice.toFixed(2)}</div>
                          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>indice</div>
                        </div>
                        {/* Info ripartitore */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', fontWeight: '500' }}>
                            {r.proprietario} <span style={{ color: 'rgba(255,255,255,0.3)' }}>— {r.locale} ({r.piano})</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '3px', fontFamily: 'monospace' }}>{r.matricola}</div>
                        </div>
                        {/* Valori */}
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                            <span style={{ color: '#a5b4fc', fontWeight: '600' }}>{r.hcaCorr}</span>
                            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4px' }}>→</span>
                            <span style={{ color: 'rgba(255,255,255,0.35)' }}>{r.hcaPrec}</span>
                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginLeft: '4px' }}>{unitaAnalisi}</span>
                          </div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '2px' }}>
                            norm: {r.normCorr} / {r.normPrec}
                          </div>
                        </div>
                      </div>
                    )
                  })
                })()}
              </>
            )}
          </div>
        )}

        {!loading && tabAttivo === 'sostituzioni' && (
          <div>
            {sostituzioni.length === 0 ? (
              <div style={S.empty}>
                <Wrench size={36} color="rgba(99,102,241,0.3)" />
                Nessuna sostituzione registrata
              </div>
            ) : (
              sostituzioni.map((s, i) => (
                <div key={i} style={S.sostRow}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ArrowLeftRight size={14} color="#fbbf24" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.sostMat}>{s.vecchia_matricola} → {s.nuova_matricola}</div>
                    <div style={S.sostSub}>
                      {s.proprietario} — {s.locale} ({s.piano})
                      {s.motivo ? <span style={{ color: 'rgba(255,255,255,0.4)' }}> — {s.motivo}</span> : ''}
                    </div>
                    {s.note && <div style={{ ...S.sostSub, fontStyle: 'italic', color: 'rgba(255,255,255,0.2)' }}>📝 {s.note}</div>}
                  </div>
                  <div style={S.sostDate}>{s.data_sostituzione}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
