import React, { useState, useMemo, useCallback, useRef } from 'react'
import { Upload, FileText, Users, User, Building2, Layers, Flame, Droplet, Snowflake, AlertTriangle, CheckCircle, Mail, Search, X, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import Fuse from 'fuse.js'
import { parseQundisXml, isContatore, formatValore, unitaTipo, descrizioneStatusTipo, descrizioneErrorFlags, TIPI } from '../utils/parserQundis'
import { oggiLocale, trovaMatricolaSimile, rigaDbToLettura, applicaLetture, elencaDispositivi, campiVisibiliDaImpostazioni, costruisciFogliExcel } from '../utils/letture'

// Icona per tipo dispositivo: fiamma (ripartitori e calore), goccia rossa (ACS), goccia blu (AFS)
function IconaTipo({ tipo }) {
  if (tipo === 'ACS') return <Droplet size={12} color="#ef4444" />
  if (tipo === 'AFS') return <Droplet size={12} color="#3b82f6" />
  if (tipo === 'FREDDO') return <Snowflake size={12} color="#38bdf8" />
  return <Flame size={12} color="#fb923c" />
}

const COLORI_TIPO = { HCA: '#fb923c', CALORE: '#fb923c', FREDDO: '#38bdf8', ACS: '#ef4444', AFS: '#3b82f6' }

function WelcomeScreen() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '16px',
    }}>
      <Building2 size={48} color="rgba(99,102,241,0.4)" />
      <div style={{ fontSize: '18px', fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>
        Seleziona un elemento dalla sidebar
      </div>
      <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', textAlign: 'center', maxWidth: '300px' }}>
        Clicca su un condominio, piano, unità o ripartitore per visualizzare i dettagli e importare le letture XML.
      </div>
    </div>
  )
}

function parseData(dataStr) {
  if (!dataStr || dataStr.includes('--')) return null
  const parts = dataStr.split('.')
  if (parts.length !== 3) return null
  const giorno = parseInt(parts[0])
  const mese = parseInt(parts[1])
  let anno = parseInt(parts[2])
  if (anno < 100) anno += 2000
  return new Date(anno, mese - 1, giorno)
}

function formatData(d) {
  const gg = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const aa = String(d.getFullYear()).slice(2)
  return `${gg}.${mm}.${aa}`
}


const MainPanel = React.forwardRef(function MainPanel({ selectedNode }, ref) {
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(false)
  const [condominiData, setCondominiData] = useState([])
  const [modalePdf, setModalePdf] = useState(false)
  const [modaleScopo, setModaleScopo] = useState('pdf')   // 'pdf' | 'excel'
  const [proprietariList, setProprietariList] = useState([])
  const [selezionati, setSelezionati] = useState([])
  const [ultimoPdfTutti, setUltimoPdfTutti] = useState(null)
  const [ultimoPdfSingolo, setUltimoPdfSingolo] = useState(null)
  const [tabAttivo, setTabAttivo] = useState('tutti')
  const [xmlCaricato, setXmlCaricato] = useState(false)
  const [storicoXml, setStoricoXml] = useState([])
  const [dateDisponibili, setDateDisponibili] = useState([])
  const [dataSelezionata, setDataSelezionata] = useState('')
  const condominiDataRef = useRef([])
  const [confirmSovrascrittura, setConfirmSovrascrittura] = useState(null) // { resolve, destName }
  const [cercaTesto, setCercaTesto] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('TUTTI')
  const [importProgress, setImportProgress] = useState(null)   // { corrente, totale, nome }
  const [riepilogoImport, setRiepilogoImport] = useState(null) // esito dell'ultimo import
  const logBoxRef = useRef(null)
  const importDaEmailRef = useRef(false)   // durante l'import da email non si chiedono conferme
  const prevNodeId = React.useRef(null)
  // Cache per condominio: { [condominioId]: { condominiData, xmlCaricato, log, tabAttivo } }
  const cacheCondomini = React.useRef({})

  function addLog(msg, type = 'info') {
    setLog(l => [...l, { msg, type, time: new Date().toLocaleTimeString() }])
  }

  const logColors = { info: '#a0a0c0', success: '#4ade80', error: '#f87171', warn: '#fbbf24' }

  // Il log scorre da solo fino all'ultima riga
  React.useEffect(() => {
    if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
  }, [log])

  // ─── Carica anagrafica completa dal DB ────────────────────────
  // ─── Ricava condominio_id dal nodo selezionato ───────────────
  function getCondominioId(node) {
    if (!node) return null
    if (node.type === 'condominio') return node.data.id
    if (node.type === 'piano')     return node.data.condominio_id
    return null
  }

  // ─── Carica anagrafica del solo condominio selezionato ───────
  async function caricaAnagrafica(node) {
    const condominioId = getCondominioId(node)
    if (!condominioId) return
    setTipoFiltro('TUTTI')
    setRiepilogoImport(null)

    // FIX 2: se il condominio è già in cache, ripristina senza ricaricare
    if (cacheCondomini.current[condominioId]) {
      const cached = cacheCondomini.current[condominioId]
      setCondominiData(cached.condominiData)
      condominiDataRef.current = cached.condominiData
      setDateDisponibili(cached.dateDisponibili || [])
      setDataSelezionata(cached.dataSelezionata || '')
      setXmlCaricato(cached.xmlCaricato)
      setLog(cached.log)
      setTabAttivo(cached.tabAttivo)
      setStoricoXml(cached.storicoXml || [])
      return
    }

    setLoading(true)
    setLog([])
    setXmlCaricato(false)
    setCondominiData([])
    setTabAttivo('tutti')
    setCercaTesto('')
    try {
      addLog('Caricamento anagrafica dal DB...')
      const tuttiCondomini = await window.api.getCondomini()
      const cond = tuttiCondomini.find(c => c.id === condominioId)
      if (!cond) { addLog('Condominio non trovato', 'error'); setLoading(false); return }

      const condMap = {}
      const piani = await window.api.getPiani(cond.id)
      for (const piano of piani) {
        const unitaList = await window.api.getUnita(piano.id)
        for (const unita of unitaList) {
          const ripartitori = await window.api.getRipartitori(unita.id)
          if (ripartitori.length === 0) continue
          const cKey = cond.id
          if (!condMap[cKey]) condMap[cKey] = { nome: cond.nome, indirizzo: cond.indirizzo, citta: cond.citta, piani: {} }
          const pKey = piano.id
          if (!condMap[cKey].piani[pKey]) condMap[cKey].piani[pKey] = { nome: piano.nome, unita: {} }
          const uKey = unita.id
          if (!condMap[cKey].piani[pKey].unita[uKey]) condMap[cKey].piani[pKey].unita[uKey] = {
            // FIX 1: aggiungo note unità
            proprietario: unita.proprietario, interno: unita.interno, note: unita.note, ripartitori: []
          }
          for (const rip of ripartitori) {
            condMap[cKey].piani[pKey].unita[uKey].ripartitori.push({
              identnr: rip.matricola,
              // FIX 1: aggiungo note ripartitore
              note_rip: rip.note,
              dbInfo: {
                condominio_id: cond.id, condominio: cond.nome,
                indirizzo: cond.indirizzo, citta: cond.citta,
                piano_id: piano.id, piano: piano.nome,
                unita_id: unita.id, ripartitore_id: rip.id, proprietario: unita.proprietario,
                interno: unita.interno, locale: rip.locale,
                note_unita: unita.note, note_rip: rip.note,
              },
              date: '', time: '', errorflags: '0', errordate: '',
              status: '', powerstatus: '', accessnr: '', manufact: '',
              devversion: '', subnet: '', receiver: '', signature: '',
              tipo: rip.tipo || 'HCA', unita: unitaTipo(rip.tipo || 'HCA'), consumo: null, anomalie: [],
              hca: null, hcaStorico: [], hcaAgostoPrecedente: null,
              // FIX 3: nessuna_lettura false finché non arriva XML
              nessuna_lettura: false,
            })
          }
        }
      }

      const result = Object.values(condMap)
      const totRip = result.reduce((a, c) =>
        a + Object.values(c.piani).reduce((b, p) =>
          b + Object.values(p.unita).reduce((d, u) => d + u.ripartitori.length, 0), 0), 0)
      const logIniziale = [
        { msg: `Anagrafica: ${totRip} ripartitori`, type: 'success', time: new Date().toLocaleTimeString() },
        { msg: 'Importa un file XML per aggiungere le letture.', type: 'info', time: new Date().toLocaleTimeString() },
      ]
      setLog(logIniziale)
      // Carica storico XML
      const storicoResult = await window.api.getStoricoXml({ nomeCondominio: cond.nome })
      const storico = storicoResult.files || []
      setStoricoXml(storico)

      // Carica date dal DB e applica ultima lettura inline
      const dbStorico = await window.api.getStoricoCondominio({ condominioId })
      const dateUniche = [...new Set((dbStorico.rows || []).map(r => r.data_lettura))].sort().reverse()
      setDateDisponibili(dateUniche)
      let resultFinale = result
      if (dateUniche.length > 0) {
        setDataSelezionata(dateUniche[0])
        const righeUltima = (dbStorico.rows || []).filter(r => r.data_lettura === dateUniche[0])
        if (righeUltima.length > 0) {
          const lm = {}
          righeUltima.forEach(r => {
            lm[r.matricola] = rigaDbToLettura(r, dateUniche[0])
          })
          resultFinale = applicaLetture(result, lm).dati
          setXmlCaricato(true)
          logIniziale.push({ msg: `📅 Letture del ${dateUniche[0]} caricate dal DB`, type: 'success', time: new Date().toLocaleTimeString() })
          setLog([...logIniziale])
        }
      }
      condominiDataRef.current = resultFinale
      setCondominiData(resultFinale)
      cacheCondomini.current[condominioId] = { condominiData: resultFinale, xmlCaricato: dateUniche.length > 0, log: logIniziale, tabAttivo: 'tutti', storicoXml: storico, dateDisponibili: dateUniche, dataSelezionata: dateUniche[0] || '' }
    } catch (err) {
      addLog(`Errore: ${err.message}`, 'error')
    }
    setLoading(false)
  }

  // Carica anagrafica al cambio nodo (solo condominio/piano)
  React.useEffect(() => {
    if (!selectedNode) return
    const nodeKey = `${selectedNode.type}_${selectedNode.data?.id}`
    if (prevNodeId.current === nodeKey) return
    prevNodeId.current = nodeKey
    caricaAnagrafica(selectedNode)
  }, [selectedNode?.type, selectedNode?.data?.id])



  // ─── Import XML: merge sopra l'anagrafica ────────────────────
  // ─── Carica letture da DB per data selezionata ─────────────────────────
  async function caricaLettureDaDb(dataLettura) {
    const datiAttuali = condominiDataRef.current
    if (!dataLettura || datiAttuali.length === 0) return
    const condominioId = getCondominioId(selectedNode)
    if (!condominioId) return
    setLoading(true)
    addLog(`📅 Letture del ${dataLettura}...`)
    try {
      const res = await window.api.getStoricoCondominio({ condominioId })
      if (!res.success) throw new Error(res.error)
      const righe = res.rows.filter(r => r.data_lettura === dataLettura)
      if (righe.length === 0) { addLog(`⚠ Nessuna lettura per ${dataLettura}`, 'warn'); setLoading(false); return }
      const lm = {}
      righe.forEach(r => {
        lm[r.matricola] = rigaDbToLettura(r, dataLettura)
      })
      const { dati: nuovi, abbinati, mancanti } = applicaLetture(datiAttuali, lm)
      condominiDataRef.current = nuovi
      setCondominiData(nuovi)
      setXmlCaricato(true)
      addLog(`✓ ${abbinati} ripartitori caricati dal DB`, 'success')
      if (mancanti > 0) addLog(`⚠ ${mancanti} senza lettura per questa data`, 'warn')
      // Aggiorna cache
      if (condominioId) {
        const cached = cacheCondomini.current[condominioId] || {}
        cacheCondomini.current[condominioId] = { ...cached, condominiData: nuovi, xmlCaricato: true, dataSelezionata: dataLettura }
      }
    } catch(err) { addLog(`Errore: ${err.message}`, 'error') }
    setLoading(false)
  }

  // ─── Import XML: uno o più file (es. più concentratori dello stesso condominio) ───
  // percorsiForzati / condominioIdForzato: usati dall'import da email (senza finestra di scelta file)
  async function importXml(percorsiForzati, condominioIdForzato) {
    let filePaths = Array.isArray(percorsiForzati) ? percorsiForzati : (window.api.openFilesDialog
      ? await window.api.openFilesDialog([{ name: 'XML Files', extensions: ['xml'] }])
      : [await window.api.openFileDialog([{ name: 'XML Files', extensions: ['xml'] }])].filter(Boolean))
    if (!filePaths || filePaths.length === 0) return { file: 0, fileOk: 0 }

    const condominioId = condominioIdForzato || getCondominioId(selectedNode)
    const logImport = []
    const L = (msg, type = 'info') => {
      const e = { msg, type, time: new Date().toLocaleTimeString() }
      logImport.push(e)
      setLog(l => [...l, e])
    }

    setLoading(true)
    setLog([])
    setRiepilogoImport(null)
    setImportProgress({ corrente: 0, totale: filePaths.length, nome: '' })

    let dati = condominiDataRef.current
    const esiti = []
    const matricoleXml = new Set()
    let ultimaData = ''

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i]
      const nomeFile = filePath.split(/[\\/]/).pop().replace(/^\d{3}_/, Array.isArray(percorsiForzati) ? '' : '$&')
      setImportProgress({ corrente: i + 1, totale: filePaths.length, nome: nomeFile })
      if (filePaths.length > 1) L(`━━ File ${i + 1} di ${filePaths.length}: ${nomeFile}`)
      else L(`File selezionato: ${nomeFile}`)
      try {
        const r = await importaFileXml(filePath, dati, L, condominioId)
        dati = r.nuoviCondomini
        Object.keys(r.lettureMap).forEach(m => matricoleXml.add(m))
        ultimaData = r.dataLetturaStr
        esiti.push({ nome: nomeFile, ok: true, concentratore: r.concentratore, dispositivi: r.totaleDispositivi, abbinati: r.abbinati })
      } catch (err) {
        L(`Errore nel file ${nomeFile}: ${err.message}`, 'error')
        esiti.push({ nome: nomeFile, ok: false, errore: err.message })
      }
    }

    // ─── Riepilogo complessivo e controllo matricole ───
    const tuttiRip = elencaDispositivi(dati)
    const conLettura = tuttiRip.filter(x => !x.rip.nessuna_lettura).length
    const senzaLettura = tuttiRip.filter(x => x.rip.nessuna_lettura)
    const matricoleAnagrafica = new Set(tuttiRip.map(x => x.rip.identnr))
    const nonInAnagrafica = [...matricoleXml].filter(m => !matricoleAnagrafica.has(m))

    L('━━ Riepilogo', 'info')
    const fileOk = esiti.filter(e => e.ok).length
    esiti.forEach(e => {
      if (e.ok) L(`✓ ${e.nome}${e.concentratore ? ` (concentratore ${e.concentratore})` : ''}: ${e.dispositivi} dispositivi, ${e.abbinati} abbinati`, 'success')
      else L(`✕ ${e.nome}: ${e.errore}`, 'error')
    })
    L(`${conLettura} su ${tuttiRip.length} dispositivi con lettura`, senzaLettura.length === 0 ? 'success' : 'warn')

    if (senzaLettura.length > 0) {
      L(`⚠ Senza lettura (${senzaLettura.length}):`, 'warn')
      senzaLettura.slice(0, 40).forEach(({ rip, piano, unita }) => {
        const simile = trovaMatricolaSimile(rip.identnr, nonInAnagrafica)
        const dove = [piano.nome, unita.interno ? `int. ${unita.interno}` : '', unita.proprietario, rip.dbInfo?.locale].filter(Boolean).join(' · ')
        L(`   ${rip.identnr} — ${dove}${simile ? `  → nell'XML c'è ${simile}: possibile errore di battitura?` : ''}`, 'warn')
      })
      if (senzaLettura.length > 40) L(`   … e altri ${senzaLettura.length - 40}`, 'warn')
    }
    if (nonInAnagrafica.length > 0) {
      L(`⚠ Nell'XML ma non in anagrafica (${nonInAnagrafica.length}):`, 'warn')
      nonInAnagrafica.slice(0, 40).forEach(m => {
        const simile = trovaMatricolaSimile(m, senzaLettura.map(x => x.rip.identnr))
        L(`   ${m}${simile ? `  → in anagrafica c'è ${simile}: possibile errore di battitura?` : ''}`, 'warn')
      })
      if (nonInAnagrafica.length > 40) L(`   … e altre ${nonInAnagrafica.length - 40}`, 'warn')
    }

    setRiepilogoImport({
      file: filePaths.length, fileOk, conLettura, totale: tuttiRip.length,
      senzaLettura: senzaLettura.length, nonInAnagrafica: nonInAnagrafica.length,
    })
    setImportProgress(null)
    if (fileOk > 0) {
      toast.success(`${fileOk} file importati — ${conLettura}/${tuttiRip.length} dispositivi con lettura`)
    }

    // Aggiorna date disponibili e cache
    if (condominioId) {
      const dbAgg = await window.api.getStoricoCondominio({ condominioId })
      const dateAgg = [...new Set((dbAgg.rows || []).map(r => r.data_lettura))].sort().reverse()
      setDateDisponibili(dateAgg)
      const dataSel = ultimaData && dateAgg.includes(ultimaData) ? ultimaData : (dateAgg[0] || '')
      if (dataSel) setDataSelezionata(dataSel)
      const nomeCond = dati[0]?.nome || ''
      let storicoAgg = storicoXml
      if (nomeCond) {
        const st = await window.api.getStoricoXml({ nomeCondominio: nomeCond })
        storicoAgg = st.files || []
      }
      cacheCondomini.current[condominioId] = { condominiData: dati, xmlCaricato: true, log: logImport, tabAttivo, storicoXml: storicoAgg, dateDisponibili: dateAgg, dataSelezionata: dataSel }
    }
    setLoading(false)
    return { file: filePaths.length, fileOk, esiti }
  }

  // ─── Import di un singolo file XML sopra i dati attuali ─────
  async function importaFileXml(filePath, datiAttuali, L, condominioIdForzato) {
    const fileResult = await window.api.readFile(filePath)
    if (!fileResult.success) throw new Error(fileResult.error)
    const text = fileResult.content
    const { version, totaleDispositivi, lettureMap, conteggioTipi, concentratore } = parseQundisXml(text)
    L(`Versione XML: ${version}${concentratore ? ` — concentratore ${concentratore}` : ''} — ${totaleDispositivi} dispositivi`)
    const riepilogoTipi = Object.entries(conteggioTipi)
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `${TIPI[t].labelPlurale}: ${n}`)
      .join(' · ')
    if (riepilogoTipi) L(`Tipi riconosciuti — ${riepilogoTipi}`)
    Object.values(lettureMap).forEach(l => {
      (l.anomalie || []).forEach(a => L(`⚠ ${l.identnr}: ${a}`, 'warn'))
    })

    // Data lettura da XML (formato DD.MM.AA → YYYY-MM-DD), altrimenti oggi (data locale)
    const rawDate = lettureMap && Object.values(lettureMap)[0]?.date
    let dataLetturaStr = oggiLocale()
    if (rawDate) {
      const parts = rawDate.split('.')
      if (parts.length === 3) {
        const gg = parts[0].padStart(2, '0')
        const mm = parts[1].padStart(2, '0')
        let aa = parseInt(parts[2])
        if (aa < 100) aa += 2000
        dataLetturaStr = `${aa}-${mm}-${gg}`
      }
    }

    // Letture già salvate nel DB per la stessa data (es. altro concentratore dello stesso condominio):
    // i dispositivi assenti in questo XML le mantengono, quelli presenti vengono aggiornati
    const lettureStessaData = {}
    const condominioIdImport = condominioIdForzato || getCondominioId(selectedNode)
    if (condominioIdImport) {
      const dbPrima = await window.api.getStoricoCondominio({ condominioId: condominioIdImport })
      ;(dbPrima.rows || [])
        .filter(r => r.data_lettura === dataLetturaStr)
        .forEach(r => { lettureStessaData[r.matricola] = rigaDbToLettura(r, dataLetturaStr) })
    }

    // Merge: per ogni dispositivo dell'anagrafica cerca la lettura nell'XML
    let abbinati = 0
    let mancanti = 0
    let mantenuti = 0

    const nuoviCondomini = datiAttuali.map(cond => ({
      ...cond,
      piani: Object.fromEntries(Object.entries(cond.piani).map(([pKey, piano]) => [pKey, {
        ...piano,
        unita: Object.fromEntries(Object.entries(piano.unita).map(([uKey, unita]) => [uKey, {
          ...unita,
          ripartitori: unita.ripartitori.map(rip => {
            const lettura = lettureMap[rip.identnr]
            if (lettura) {
              abbinati++
              return { ...rip, ...lettura, dbInfo: rip.dbInfo }
            } else if (lettureStessaData[rip.identnr]) {
              mantenuti++
              return { ...rip, ...lettureStessaData[rip.identnr], dbInfo: rip.dbInfo }
            } else {
              mancanti++
              return { ...rip, nessuna_lettura: true }
            }
          })
        }]))
      }]))
    }))

    L(`Abbinati da questo file: ${abbinati} su ${abbinati + mantenuti + mancanti} dispositivi`, 'success')
    if (mantenuti > 0) L(`↺ Mantenute ${mantenuti} letture del ${dataLetturaStr} già nel DB (altro file)`, 'info')
    condominiDataRef.current = nuoviCondomini
    setCondominiData(nuoviCondomini)
    setXmlCaricato(true)

    // Salva letture nel DB
    const lettureArray = []
    for (const cond of nuoviCondomini) {
      for (const piano of Object.values(cond.piani)) {
        for (const unita of Object.values(piano.unita)) {
          for (const rip of unita.ripartitori) {
            const l = lettureMap[rip.identnr]
            if (l) {
              lettureArray.push({
                matricola: rip.identnr,
                data_lettura: dataLetturaStr,
                data_importazione: oggiLocale(),
                hca_valore: l.hca ? parseFloat(l.hca.value) : null,
                hca_storico_json: JSON.stringify(l.hcaStorico || []),
                errorflags: l.errorflags || '0',
                status: l.status || '0',
                powerstatus: l.powerstatus || '',
                errordate: l.errordate || '',
                hca_ago_prec_json: l.hcaAgostoPrecedente ? JSON.stringify(l.hcaAgostoPrecedente) : null,
                tech_json: JSON.stringify({ manufact: l.manufact || '', devversion: l.devversion || '', accessnr: l.accessnr || '', subnet: l.subnet || '', receiver: l.receiver || '', signature: l.signature || '', devtype: l.devtype || '', anomalie: l.anomalie || [], flagDispositivo: l.flagDispositivo || '', perditaOre: l.perditaOre ?? null, riferimento: l.riferimento || null, inizioPeriodo: l.inizioPeriodo || '' }),
                tipo: l.tipo || 'HCA',
                unita: l.unita || 'H.C.A.',
                consumo_json: l.consumo ? JSON.stringify(l.consumo) : null,
              })
            }
          }
        }
      }
    }
    if (lettureArray.length > 0) {
      const saveRes = await window.api.salvaLetture({ lettureArray })
      if (saveRes.success) L(`💾 ${saveRes.salvate} letture salvate nel DB`, 'success')
      else L(`⚠ Salvataggio DB: ${saveRes.error}`, 'warn')
    }

    // Archivia il file XML
    const nomeCondArchivio = nuoviCondomini[0]?.nome || ''
    if (nomeCondArchivio && filePath) {
      // Prima prova senza sovrascrittura
      let archResult = await window.api.archiviaXml({
        nomeCondominio: nomeCondArchivio,
        filePath,
        dataLettura: dataLetturaStr,
        concentratore,
        sovrascrivi: false,
      })
      // Se il file esiste già, chiedi conferma tramite modal React
      if (archResult.esistente) {
        // Import da email: la finestra di conferma resterebbe coperta, si sovrascrive (è la stessa lettura)
        const conferma = importDaEmailRef.current
          ? true
          : await new Promise(resolve => setConfirmSovrascrittura({ resolve, destName: archResult.destName }))
        if (conferma) {
          archResult = await window.api.archiviaXml({
            nomeCondominio: nomeCondArchivio,
            filePath,
            dataLettura: dataLetturaStr,
            concentratore,
            sovrascrivi: true,
          })
        } else {
          L('📁 Archiviazione saltata — file già presente', 'info')
          archResult = { success: false, saltato: true }
        }
      }
      if (archResult.success) {
        L('📁 Archiviato: ' + archResult.destName, 'success')
        const nuovoStorico = await window.api.getStoricoXml({ nomeCondominio: nomeCondArchivio })
        setStoricoXml(nuovoStorico.files || [])
      } else if (!archResult.saltato) {
        L('⚠ Archivio: ' + (archResult.error || 'non configurato'), 'warn')
        toast.warning('Archivio: ' + (archResult.error || 'percorso non configurato nelle Impostazioni'))
      }
    }

    return { nuoviCondomini, lettureMap, dataLetturaStr, concentratore, totaleDispositivi, abbinati }
  }

  async function generaPdfTutti() {
    if (condominiData.length === 0) return
    setUltimoPdfTutti(null)
    const result = await window.api.generaPdf({ condominiData, modalita: 'tutti' })
    if (result?.success === false) toast.error('Errore PDF: ' + (result.error || ''))
    else if (result?.success) { toast.success('PDF generato con successo!'); setUltimoPdfTutti(result.filePath) }
  }

  async function inviaEmailTutti() {
    if (!ultimoPdfTutti) return
    const result = await window.api.inviaEmail({ pdfPath: ultimoPdfTutti })
    if (result?.success === false) toast.error('Errore email: ' + (result.error || ''))
  }

  function aprireModaleSingolo(scopo = 'pdf') {
    if (condominiData.length === 0) return
    setModaleScopo(scopo)
    const lista = []
    condominiData.forEach(cond => {
      Object.values(cond.piani).forEach(piano => {
        Object.values(piano.unita).forEach(unita => {
          lista.push({ proprietario: unita.proprietario, piano: piano.nome, condominio: cond.nome })
        })
      })
    })
    setProprietariList(lista)
    setSelezionati([])
    setModalePdf(true)
  }

  function toggleSelezionato(proprietario) {
    setSelezionati(prev =>
      prev.includes(proprietario) ? prev.filter(p => p !== proprietario) : [...prev, proprietario]
    )
  }

  async function generaPdfSingolo() {
    if (selezionati.length === 0) return
    setModalePdf(false)
    setUltimoPdfSingolo(null)
    const result = await window.api.generaPdf({ condominiData, modalita: 'multiplo', unitaSelezionate: selezionati })
    if (result?.success === false) toast.error('Errore PDF: ' + (result.error || ''))
    else if (result?.success) { toast.success('PDF generato!'); setUltimoPdfSingolo(result.filePath) }
    setSelezionati([])
  }

  // ─── Esportazione Excel (stessa scelta utenti dei PDF) ─────
  async function esportaExcel(proprietariSelezionati = null) {
    if (condominiData.length === 0) return
    const imp = await window.api.getImpostazioni()
    const campi = campiVisibiliDaImpostazioni(imp)
    const { fogli, dispositivi } = costruisciFogliExcel(condominiData, campi, proprietariSelezionati)
    if (dispositivi === 0) { toast.info('Nessun dispositivo da esportare'); return }
    const nomeCond = (condominiData[0]?.nome || 'Letture').replace(/[\\/:*?"<>|]/g, '_')
    const res = await window.api.esportaExcel({ fogli, nomeFile: `${nomeCond}_${dataSelezionata || oggiLocale()}` })
    if (res?.success) { toast.success(`Excel salvato (${dispositivi} dispositivi)`); window.api.apriFile({ filePath: res.filePath }) }
    else if (res?.error) toast.error('Errore Excel: ' + res.error)
  }

  async function esportaExcelSelezione() {
    if (selezionati.length === 0) return
    setModalePdf(false)
    await esportaExcel(selezionati)
    setSelezionati([])
  }

  async function inviaEmailSingolo() {
    if (!ultimoPdfSingolo) return
    const result = await window.api.inviaEmail({ pdfPath: ultimoPdfSingolo })
    if (result?.success === false) toast.error('Errore email: ' + (result.error || ''))
  }

  // ─── Contatori per i tab ──────────────────────────────────────
  function calcolaContatori() {
    let tutti = 0, conLettura = 0, senzaLettura = 0, conErrore = 0
    condominiData.forEach(cond => {
      Object.values(cond.piani).forEach(piano => {
        Object.values(piano.unita).forEach(unita => {
          unita.ripartitori.forEach(rip => {
            if (tipoFiltro !== 'TUTTI' && (rip.tipo || 'HCA') !== tipoFiltro) return
            tutti++
            if (rip.nessuna_lettura) senzaLettura++
            else conLettura++
            if (!rip.nessuna_lettura && rip.status && rip.status !== '0') conErrore++
          })
        })
      })
    })
    return { tutti, conLettura, senzaLettura, conErrore }
  }

  // ─── Filtra ripartitori in base al tab ───────────────────────
  // ─── Fuse.js: indice di ricerca su tutti i ripartitori ─────
  const fuseIndex = React.useMemo(() => {
    const items = []
    condominiData.forEach(cond => {
      Object.values(cond.piani).forEach(piano => {
        Object.values(piano.unita).forEach(unita => {
          unita.ripartitori.forEach(rip => {
            items.push({
              _ripId: rip.identnr,
              _unitaId: rip.dbInfo?.unita_id,
              proprietario: unita.proprietario || '',
              interno: unita.interno || '',
              note: unita.note || '',
              piano: piano.nome || '',
              matricola: rip.identnr || '',
              locale: rip.dbInfo?.locale || '',
              note_rip: rip.note_rip || '',
            })
          })
        })
      })
    })
    return new Fuse(items, {
      keys: [
        { name: 'matricola', weight: 3 },
        { name: 'proprietario', weight: 2 },
        { name: 'interno', weight: 1.5 },
        { name: 'locale', weight: 1 },
        { name: 'piano', weight: 1 },
        { name: 'note', weight: 0.5 },
        { name: 'note_rip', weight: 0.5 },
      ],
      threshold: 0.2,
      ignoreLocation: true,
      useExtendedSearch: true,
    })
  }, [condominiData])

  // Set di identnr che matchano la ricerca (null = nessuna ricerca attiva)
  const matchSet = React.useMemo(() => {
    const q = cercaTesto.trim()
    if (!q) return null
    // Se la query contiene solo cifre → ricerca esatta per prefisso matricola
    // useExtendedSearch: '^' = starts-with, '=' = exact
    const isNumeric = /^\d+$/.test(q)
    const query = isNumeric ? `^${q}` : q
    const results = fuseIndex.search(query)
    return new Set(results.map(r => r.item._ripId))
  }, [cercaTesto, fuseIndex])

  function filtraRipartitore(rip) {
    // Filtro ricerca
    if (matchSet !== null && !matchSet.has(rip.identnr)) return false
    // Filtro tipo dispositivo
    if (tipoFiltro !== 'TUTTI' && (rip.tipo || 'HCA') !== tipoFiltro) return false
    // Filtro tab
    if (tabAttivo === 'tutti') return true
    if (tabAttivo === 'con_lettura') return !rip.nessuna_lettura
    if (tabAttivo === 'senza_lettura') return rip.nessuna_lettura
    if (tabAttivo === 'con_errore') return !rip.nessuna_lettura && rip.status && rip.status !== '0'
    return true
  }

  // ─── Descrizione Status QUNDIS ──────────────────────────────
  function descrizioneStatus(status, tipo) {
    return descrizioneStatusTipo(status, tipo)
  }

  // ─── Tipi dispositivo presenti nel condominio (per il filtro) ─
  function calcolaTipiPresenti() {
    const conteggio = {}
    condominiData.forEach(cond => {
      Object.values(cond.piani).forEach(piano => {
        Object.values(piano.unita).forEach(unita => {
          unita.ripartitori.forEach(rip => {
            const t = rip.tipo || 'HCA'
            conteggio[t] = (conteggio[t] || 0) + 1
          })
        })
      })
    })
    return Object.keys(TIPI).filter(t => conteggio[t]).map(t => ({ tipo: t, count: conteggio[t] }))
  }

  // ─── Espone patchAnagrafica al padre tramite ref ────────────
  React.useImperativeHandle(ref, () => ({
    // Import da email: apre il condominio indicato e importa i file già estratti
    async importaDaEmail(node, percorsi) {
      prevNodeId.current = `${node.type}_${node.data?.id}`
      await caricaAnagrafica(node)
      if (!condominiDataRef.current || condominiDataRef.current.length === 0) {
        return { file: percorsi.length, fileOk: 0, esiti: [], errore: 'Condominio senza ripartitori in anagrafica' }
      }
      importDaEmailRef.current = true
      try { return await importXml(percorsi, node.data.id) }
      finally { importDaEmailRef.current = false }
    },
    patchAnagrafica(tipo, id, nuoviValori) {
      if (tipo === 'reload') {
        // Per add/delete: ricarica completa del condominio
        const condominioId = id
        delete cacheCondomini.current[condominioId]
        prevNodeId.current = null
        caricaAnagrafica(selectedNode)
        return
      }
      // Per edit: patch chirurgica diretta sullo stato
      setCondominiData(prev => prev.map(cond => {
        if (tipo === 'condominio' && cond.piani) {
          // Aggiorna nome/indirizzo/citta del condominio
          return { ...cond, ...nuoviValori }
        }
        return {
          ...cond,
          piani: Object.fromEntries(Object.entries(cond.piani).map(([pKey, piano]) => {
            if (tipo === 'piano' && piano.nome !== undefined) {
              // Controlla se questo piano ha l'id giusto — lo troviamo dal nome nel pKey
              // pKey è piano_id, lo confrontiamo via dbInfo dei ripartitori
              const hasPianoId = Object.values(piano.unita).some(u =>
                u.ripartitori.some(r => r.dbInfo?.piano_id === id))
              if (hasPianoId) return [pKey, { ...piano, nome: nuoviValori.nome || piano.nome }]
            }
            return [pKey, {
              ...piano,
              unita: Object.fromEntries(Object.entries(piano.unita).map(([uKey, unita]) => {
                if (tipo === 'unita') {
                  const hasUnitaId = unita.ripartitori.some(r => r.dbInfo?.unita_id === id)
                  if (hasUnitaId) {
                    return [uKey, {
                      ...unita,
                      proprietario: nuoviValori.proprietario ?? unita.proprietario,
                      interno: nuoviValori.interno ?? unita.interno,
                      note: nuoviValori.note ?? unita.note,
                    }]
                  }
                }
                return [uKey, {
                  ...unita,
                  ripartitori: unita.ripartitori.map(rip => {
                    if (tipo === 'ripartitore' && rip.identnr === nuoviValori.matricola) {
                      return {
                        ...rip,
                        dbInfo: { ...rip.dbInfo, locale: nuoviValori.locale ?? rip.dbInfo?.locale },
                        note_rip: nuoviValori.note ?? rip.note_rip,
                      }
                    }
                    return rip
                  })
                }]
              }))
            }]
          }))
        }
      }))
    }
  }))

  if (!selectedNode) return <WelcomeScreen />

  const contatori = calcolaContatori()
  const tipiPresenti = calcolaTipiPresenti()

  const TABS = [
    { key: 'tutti',         label: 'Tutti',           count: contatori.tutti,        color: '#4f46e5' },
    { key: 'con_lettura',   label: 'Con lettura',      count: contatori.conLettura,   color: '#4ade80' },
    { key: 'senza_lettura', label: 'Nessuna lettura',  count: contatori.senzaLettura, color: '#dc2626' },
    { key: 'con_errore',    label: 'Con errore',       count: contatori.conErrore,    color: '#d97706' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'transparent' }}>

      {/* Zona fissa */}
      <div style={{ flexShrink: 0, padding: '24px 24px 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
              {selectedNode?.type === 'condominio' && 'Condominio'}
              {selectedNode?.type === 'piano' && 'Piano'}
              {selectedNode?.type === 'unita' && 'Unità abitativa'}
              {selectedNode?.type === 'ripartitore' && 'Ripartitore'}
            </div>
            <div style={{ fontSize: '20px', fontWeight: '600', color: '#fff', marginTop: '2px', letterSpacing: '-0.3px' }}>
              {selectedNode?.data?.nome || selectedNode?.data?.proprietario || selectedNode?.data?.interno || selectedNode?.data?.matricola}
            </div>
          </div>
          <button onClick={() => importXml()} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', background: '#4f46e5', border: 'none',
            borderRadius: '10px', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '13px', fontWeight: '600', opacity: loading ? 0.7 : 1,
          }}>
            <Upload size={16} />
            {loading ? 'Caricamento...' : 'Importa XML'}
          </button>
        </div>

        {/* Avanzamento import e riepilogo finale */}
        {importProgress && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a5b4fc', marginBottom: '5px' }}>
              <span>Importazione file {importProgress.corrente} di {importProgress.totale}{importProgress.nome ? `: ${importProgress.nome}` : ''}</span>
              <span>{Math.round(((importProgress.corrente - 0.5) / importProgress.totale) * 100)}%</span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${Math.round(((importProgress.corrente - 0.5) / importProgress.totale) * 100)}%`,
                background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: '3px', transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}
        {!importProgress && riepilogoImport && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
            padding: '8px 12px', marginBottom: '10px', borderRadius: '9px', fontSize: '12px',
            background: riepilogoImport.senzaLettura === 0 && riepilogoImport.fileOk === riepilogoImport.file ? 'rgba(74,222,128,0.08)' : 'rgba(251,191,36,0.08)',
            border: `1px solid ${riepilogoImport.senzaLettura === 0 && riepilogoImport.fileOk === riepilogoImport.file ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.25)'}`,
            color: riepilogoImport.senzaLettura === 0 && riepilogoImport.fileOk === riepilogoImport.file ? '#4ade80' : '#fbbf24',
          }}>
            {riepilogoImport.senzaLettura === 0 && riepilogoImport.fileOk === riepilogoImport.file ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
            <span><strong>{riepilogoImport.fileOk} di {riepilogoImport.file}</strong> file importati</span>
            <span>· <strong>{riepilogoImport.conLettura} su {riepilogoImport.totale}</strong> dispositivi con lettura</span>
            {riepilogoImport.senzaLettura > 0 && <span>· {riepilogoImport.senzaLettura} senza lettura</span>}
            {riepilogoImport.nonInAnagrafica > 0 && <span>· {riepilogoImport.nonInAnagrafica} matricole dell'XML non in anagrafica</span>}
          </div>
        )}

        <div ref={logBoxRef} style={{
          background: '#0d0d1a', borderRadius: '10px', padding: '14px',
          fontFamily: 'monospace', fontSize: '12px', height: '120px',
          overflowY: 'auto', border: '1px solid #2d2d4e', marginBottom: '16px',
        }}>
          {log.length === 0
            ? <div style={{ color: '#3d3d6e' }}>// Log importazione XML...</div>
            : log.map((l, i) => (
              <div key={i} style={{ color: logColors[l.type], marginBottom: '3px' }}>
                <span style={{ color: '#3d3d6e' }}>[{l.time}]</span> {l.msg}
              </div>
            ))
          }
        </div>

        {condominiData.length > 0 && (
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginBottom: '12px', flexWrap: 'wrap' }}>
            <button onClick={() => aprireModaleSingolo('pdf')} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px', color: '#a5b4fc', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
            }}>
              <User size={14} /> PDF Selezione utenti
            </button>
            {ultimoPdfSingolo && (
              <button onClick={inviaEmailSingolo} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
                borderRadius: '8px', color: '#4ade80', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
              }}>
                <Mail size={14} /> Invia per Email
              </button>
            )}
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch' }} />
            <button onClick={generaPdfTutti} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', background: '#4f46e5', border: 'none',
              borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
            }}>
              <Users size={14} /> PDF Tutti gli utenti
            </button>
            {ultimoPdfTutti && (
              <button onClick={inviaEmailTutti} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
                borderRadius: '8px', color: '#4ade80', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
              }}>
                <Mail size={14} /> Invia per Email
              </button>
            )}
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch' }} />
            <button onClick={() => aprireModaleSingolo('excel')} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px', color: '#4ade80', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
            }}>
              <FileSpreadsheet size={14} /> Excel Selezione utenti
            </button>
            <button onClick={() => esportaExcel(null)} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', background: '#15803d', border: 'none',
              borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
            }}>
              <FileSpreadsheet size={14} /> Excel Tutti gli utenti
            </button>
          </div>
        )}

        {/* ─── BARRA DI RICERCA ─────────────────────────────────── */}
        {condominiData.length > 0 && (
          <div style={{ marginBottom: '10px', position: 'relative' }}>
            <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <Search size={13} color="#8888aa" />
            </div>
            <input
              type="text"
              value={cercaTesto}
              onChange={e => setCercaTesto(e.target.value)}
              placeholder="Cerca proprietario, matricola, locale..."
              style={{
                width: '100%', padding: '8px 32px 8px 30px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.85)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            {cercaTesto && (
              <button
                onClick={() => setCercaTesto('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'rgba(255,255,255,0.35)' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {/* ─── TAB FILTRO ─────────────────────────────────────── */}
        {condominiData.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', borderBottom: '2px solid #e8e8f5', paddingBottom: '0' }}>
            {matchSet !== null && (
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', padding: '8px 4px', alignSelf: 'center' }}>
                {matchSet.size === 0 ? 'Nessun risultato' : `${matchSet.size} risultat${matchSet.size === 1 ? 'o' : 'i'}`}
              </div>
            )}
            {TABS.map(tab => {
              const isActive = tabAttivo === tab.key
              // Nascondi tab "con_errore" e "con_lettura" se XML non ancora caricato
              if (!xmlCaricato && (tab.key === 'con_errore' || tab.key === 'con_lettura')) return null
              return (
                <button
                  key={tab.key}
                  onClick={() => setTabAttivo(tab.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px',
                    background: 'transparent', border: 'none',
                    borderBottom: isActive ? `2px solid ${tab.color}` : '2px solid transparent',
                    marginBottom: '-2px',
                    color: isActive ? tab.color : 'rgba(255,255,255,0.35)',
                    cursor: 'pointer', fontSize: '12px', fontWeight: isActive ? '700' : '500',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                  <span style={{
                    background: isActive ? tab.color : 'rgba(255,255,255,0.07)',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.35)',
                    borderRadius: '10px', padding: '1px 7px',
                    fontSize: '11px', fontWeight: '700', minWidth: '20px', textAlign: 'center',
                  }}>
                    {tab.count}
                  </span>
                </button>
              )
            })}
            {/* Filtro per tipo dispositivo (solo se nel condominio ci sono tipi diversi) */}
            {tipiPresenti.length > 1 && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                {[{ tipo: 'TUTTI', count: tipiPresenti.reduce((a, t) => a + t.count, 0) }, ...tipiPresenti].map(({ tipo, count }) => {
                  const isActive = tipoFiltro === tipo
                  const color = tipo === 'TUTTI' ? '#4f46e5' : COLORI_TIPO[tipo]
                  return (
                    <button
                      key={tipo}
                      onClick={() => setTipoFiltro(tipo)}
                      title={tipo === 'TUTTI' ? 'Tutti i dispositivi' : TIPI[tipo].label}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 10px',
                        background: 'transparent', border: 'none',
                        borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
                        marginBottom: '-2px',
                        color: isActive ? color : 'rgba(255,255,255,0.35)',
                        cursor: 'pointer', fontSize: '12px', fontWeight: isActive ? '700' : '500',
                        transition: 'all 0.15s',
                      }}
                    >
                      {tipo === 'TUTTI' ? 'Tutti i tipi' : <IconaTipo tipo={tipo} />}
                      {tipo !== 'TUTTI' && TIPI[tipo].labelPlurale}
                      <span style={{
                        background: isActive ? color : 'rgba(255,255,255,0.07)',
                        color: isActive ? '#fff' : 'rgba(255,255,255,0.35)',
                        borderRadius: '10px', padding: '1px 7px',
                        fontSize: '11px', fontWeight: '700', minWidth: '20px', textAlign: 'center',
                      }}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selettore data lettura dal DB */}
      {dateDisponibili.length > 0 && (
        <div style={{ flexShrink: 0, padding: '0 24px 12px 24px' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.07)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1.2px', whiteSpace: 'nowrap' }}>📅 Lettura del</span>
            <select
              value={dataSelezionata}
              onChange={e => { setDataSelezionata(e.target.value); caricaLettureDaDb(e.target.value) }}
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '8px', padding: '6px 10px', color: 'rgba(255,255,255,0.8)', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
            >
              {dateDisponibili.map((d, i) => (
                <option key={d} value={d}>{d}{i === 0 ? ' — ultima' : ''}</option>
              ))}
            </select>
            <button onClick={() => { const n = condominiData[0]?.nome || ''; if (n) window.api.apriCartellaArchivio({ nomeCondominio: n }) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#818cf8', fontWeight: '500', whiteSpace: 'nowrap' }}
            >Apri cartella ↗</button>
          </div>
        </div>
      )}

      {/* Zona scrollabile */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px 24px' }}>
        {condominiData.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {condominiData.map((cond, ci) => {
              // Filtra piani/unita/ripartitori in base al tab
              const pianiVisible = Object.values(cond.piani).map(piano => ({
                ...piano,
                unitaVisible: Object.values(piano.unita).map(unita => ({
                  ...unita,
                  ripVisible: unita.ripartitori.filter(filtraRipartitore)
                })).filter(u => u.ripVisible.length > 0)
              })).filter(p => p.unitaVisible.length > 0)

              if (pianiVisible.length === 0) return null

              return (
              <div key={ci} style={{
                background: 'rgba(255,255,255,0.03)', borderRadius: '14px',
                border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              }}>
                <div style={{ background: '#1a1a2e', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Building2 size={18} color="#4ade80" />
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff' }}>{cond.nome}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>{cond.indirizzo} — {cond.citta}</div>
                  </div>
                </div>
                {pianiVisible.map((piano, pi) => (
                  <div key={pi} style={{ borderTop: pi > 0 ? '1px solid #f0f0f8' : 'none' }}>
                    <div style={{ background: 'rgba(255,255,255,0.04)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #ededf8' }}>
                      <Layers size={14} color="#f59e0b" />
                      <span style={{ fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>{piano.nome}</span>
                    </div>
                    {piano.unitaVisible.map((unita, ui) => (
                      <div key={ui} style={{ padding: '16px 20px', borderBottom: '1px solid #f5f5fc' }}>
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <User size={14} color="#60a5fa" />
                            <span style={{ fontSize: '14px', fontWeight: '600', color: '#fff' }}>{unita.proprietario}</span>
                            {unita.interno && (
                              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', background: 'rgba(99,102,241,0.15)', padding: '2px 8px', borderRadius: '10px' }}>
                                {unita.interno}
                              </span>
                            )}
                          </div>
                          {unita.note && (
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', marginLeft: '22px', fontStyle: 'italic' }}>
                              📝 {unita.note}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                          {unita.ripVisible.map((rip, ri) => {
                            // ─── Card senza lettura XML (solo dopo import XML) ────
                            if (rip.nessuna_lettura && xmlCaricato) {
                              return (
                                <div key={ri} style={{
                                  background: 'rgba(239,68,68,0.06)',
                                  borderRadius: '10px', padding: '12px',
                                  border: '1px solid rgba(239,68,68,0.25)',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <IconaTipo tipo={rip.tipo} />
                                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{rip.identnr}</span>
                                    </div>
                                    <AlertTriangle size={13} color="#dc2626" />
                                  </div>
                                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                                    {rip.dbInfo?.locale || 'Locale n.d.'}
                                  </div>
                                  <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    background: 'rgba(239,68,68,0.08)', border: '1px solid #fecaca',
                                    borderRadius: '6px', padding: '6px 10px', marginTop: '4px',
                                  }}>
                                    <AlertTriangle size={11} color="#dc2626" />
                                    <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: '600' }}>
                                      Nessuna Lettura Registrata
                                    </span>
                                  </div>
                                </div>
                              )
                            }

                            // ─── Card con lettura XML normale ─────────────────────
                            const hasError = rip.errorflags !== '0' && rip.errorflags !== ''
                            const hasStatus = rip.status && rip.status !== '0'
                            const meseLetturaLabel = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
                            const annoAgostoLabel = (parseData(rip.date) || new Date()).getFullYear() - 1
                            const meseLabel = meseLetturaLabel[(parseData(rip.date) || new Date()).getMonth()]

                            return (
                              <div key={ri} style={{
                                background: hasError ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',
                                borderRadius: '10px', padding: '12px',
                                border: `1px solid ${hasError ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.07)'}`,
                              }}>
                                {/* Header matricola */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <IconaTipo tipo={rip.tipo} />
                                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{rip.identnr}</span>
                                  </div>
                                  {hasError ? <AlertTriangle size={12} color="#ef4444" /> : <CheckCircle size={12} color="#4ade80" />}
                                </div>

                                {/* Locale */}
                                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>
                                  {rip.dbInfo?.locale || 'Locale n.d.'}
                                </div>

                                {/* Valore corrente + Anno precedente */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                    <span style={{ fontSize: '22px', fontWeight: '700', color: '#a5b4fc' }}>{isContatore(rip.tipo) ? formatValore(rip.hca?.value, rip.tipo) : (rip.hca?.value || '—')}</span>
                                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{rip.unita || 'H.C.A.'}</span>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                    {isContatore(rip.tipo) && rip.consumo && (
                                      <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)' }}>{rip.consumo.dalMontaggio ? 'Dal montaggio' : rip.consumo.periodo}</div>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#a78bfa' }}>
                                          {formatValore(rip.consumo.valore, rip.tipo)} <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)' }}>{rip.unita}</span>
                                        </div>
                                      </div>
                                    )}
                                    {rip.hcaAgostoPrecedente && (
                                      <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)' }}>{meseLabel} {annoAgostoLabel}</div>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#a78bfa' }}>
                                          {rip.hcaAgostoPrecedente.value} <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)' }}>H.C.A.</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Data lettura */}
                                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{rip.date} {rip.time}</div>

                                {/* Status e batteria */}
                                {(hasStatus || rip.powerstatus) && (
                                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                                    {hasStatus && (
                                      <span style={{ fontSize: '10px', background: 'rgba(239,68,68,0.08)', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ fontWeight: '700' }}>⚠ {rip.status}</span>
                                        <span style={{ color: '#ef4444' }}>— {descrizioneStatus(rip.status, rip.tipo)}</span>
                                      </span>
                                    )}
                                    {rip.powerstatus && (
                                      <span style={{ fontSize: '10px', background: 'rgba(74,222,128,0.08)', color: '#4ade80', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(74,222,128,0.2)' }}>
                                        🔋 {rip.powerstatus}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Data errore */}
                                {rip.errordate && rip.errordate !== '--.--.--' && rip.errordate !== '' && (
                                  <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '4px' }}>
                                    Errore dal: {rip.errordate}
                                  </div>
                                )}

                                {/* Codice errore XML (errorflags) */}
                                {hasError && descrizioneErrorFlags(rip.errorflags) && (
                                  <div style={{ fontSize: '10px', color: '#dc2626', marginTop: '4px' }}>
                                    Errore {rip.errorflags}: {descrizioneErrorFlags(rip.errorflags)}
                                  </div>
                                )}

                                {/* Anomalie rilevate dal parser (contatori) */}
                                {(rip.anomalie || []).map((a, ai) => (
                                  <div key={ai} style={{ fontSize: '10px', color: '#fbbf24', marginTop: '4px' }}>
                                    ⚠ {a}
                                  </div>
                                ))}

                                {/* Note ripartitore */}
                                {rip.note_rip && (
                                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '6px', fontStyle: 'italic', borderTop: '1px solid #ededf8', paddingTop: '6px' }}>
                                    📝 {rip.note_rip}
                                  </div>
                                )}

                                {/* Storico */}
                                {rip.hcaStorico.length > 0 && (
                                  <div style={{ marginTop: '8px', borderTop: '1px solid #ededf8', paddingTop: '8px' }}>
                                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>
                                      {isContatore(rip.tipo) ? 'Letture fine mese (ultimi 12)' : 'Storico ultimi 12 mesi'}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      {rip.hcaStorico.map((h, hi) => (
                                        <div key={hi} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>
                                            {h.dataCalcolata}
                                            <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginLeft: '4px' }}>
                                              {h.labelMese}
                                              {isContatore(rip.tipo) && h.consumoMese !== null && h.consumoMese !== undefined && ` · ${h.consumoMese >= 0 ? '+' : ''}${formatValore(h.consumoMese, rip.tipo)}`}
                                            </span>
                                          </span>
                                          <span style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: '600' }}>
                                            {isContatore(rip.tipo) ? `${formatValore(h.value, rip.tipo)} ${rip.unita}` : `${h.value} H.C.A.`}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              )
            })}
          </div>
        ) : !loading ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '12px',
            border: '2px dashed #e0e0f0', borderRadius: '12px',
            color: 'rgba(255,255,255,0.35)', minHeight: '200px', marginTop: '20px',
          }}>
            <FileText size={36} color="#c0c0d8" />
            <div style={{ fontSize: '14px' }}>Clicca "Importa XML" per caricare una lettura QUNDIS</div>
          </div>
        ) : null}
      </div>

      {/* Modal selezione utenti multipli */}
      {modalePdf && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'rgba(15,15,35,0.97)', backdropFilter: 'blur(20px)',
            borderRadius: '14px', padding: '24px', border: '1px solid rgba(255,255,255,0.1)',
            width: '460px', maxHeight: '75vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff' }}>Seleziona utenti per {modaleScopo === 'excel' ? 'Excel' : 'PDF'}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{selezionati.length} selezionati</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button onClick={() => setSelezionati(proprietariList.map(p => p.proprietario))} style={{
                flex: 1, padding: '6px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: '6px', color: '#a5b4fc', cursor: 'pointer', fontSize: '12px',
              }}>Seleziona tutti</button>
              <button onClick={() => setSelezionati([])} style={{
                flex: 1, padding: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '12px',
              }}>Deseleziona tutti</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {proprietariList.map((p, i) => {
                const isSelected = selezionati.includes(p.proprietario)
                return (
                  <button key={i} onClick={() => toggleSelezionato(p.proprietario)} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                    background: isSelected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isSelected ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                      background: isSelected ? '#4f46e5' : 'rgba(255,255,255,0.08)',
                      border: `2px solid ${isSelected ? '#4f46e5' : 'rgba(255,255,255,0.2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && <span style={{ color: '#fff', fontSize: '11px', fontWeight: '700' }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.proprietario}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{p.piano} — {p.condominio}</div>
                    </div>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={() => { setModalePdf(false); setSelezionati([]) }} style={{
                flex: 1, padding: '9px', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '13px',
              }}>Annulla</button>
              <button onClick={modaleScopo === 'excel' ? esportaExcelSelezione : generaPdfSingolo} disabled={selezionati.length === 0} style={{
                flex: 1, padding: '9px',
                background: selezionati.length > 0 ? '#4f46e5' : 'rgba(255,255,255,0.2)',
                border: 'none', borderRadius: '8px', color: '#fff',
                cursor: selezionati.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: '13px', fontWeight: '600',
              }}>{modaleScopo === 'excel' ? 'Esporta Excel' : 'Genera PDF'} ({selezionati.length})</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal conferma sovrascrittura archivio */}
      {confirmSovrascrittura && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
        }}>
          <div style={{
            background: 'rgba(15,15,35,0.97)', backdropFilter: 'blur(20px)',
            borderRadius: '14px', padding: '24px', width: '400px',
            border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>
              📁 File già presente
            </div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '20px', lineHeight: '1.5' }}>
              Il file <strong style={{ color: '#a5b4fc', fontFamily: 'monospace' }}>{confirmSovrascrittura.destName}</strong> esiste già nell'archivio.<br />Vuoi sovrascriverlo?
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setConfirmSovrascrittura(null); confirmSovrascrittura.resolve(false) }} style={{
                flex: 1, padding: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '13px',
              }}>Mantieni originale</button>
              <button onClick={() => { setConfirmSovrascrittura(null); confirmSovrascrittura.resolve(true) }} style={{
                flex: 1, padding: '9px', background: '#4f46e5', border: 'none',
                borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
              }}>Sovrascrivi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
export default MainPanel