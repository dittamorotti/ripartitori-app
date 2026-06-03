import React, { useState } from 'react'
import { Upload, FileText, Users, User, Building2, Layers, Flame, AlertTriangle, CheckCircle, Mail, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import Fuse from 'fuse.js'

function WelcomeScreen() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '16px',
    }}>
      <Building2 size={48} color="#3d3d6e" />
      <div style={{ fontSize: '18px', fontWeight: '600', color: '#4a4a6a' }}>
        Seleziona un elemento dalla sidebar
      </div>
      <div style={{ fontSize: '13px', color: '#6b6b8a', textAlign: 'center', maxWidth: '300px' }}>
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
  const [proprietariList, setProprietariList] = useState([])
  const [selezionati, setSelezionati] = useState([])
  const [ultimoPdfTutti, setUltimoPdfTutti] = useState(null)
  const [ultimoPdfSingolo, setUltimoPdfSingolo] = useState(null)
  const [tabAttivo, setTabAttivo] = useState('tutti')
  const [xmlCaricato, setXmlCaricato] = useState(false)
  const [storicoXml, setStoricoXml] = useState([])
  const [confirmSovrascrittura, setConfirmSovrascrittura] = useState(null)
  const [cercaTesto, setCercaTesto] = useState('') // { resolve, destName }
  const prevNodeId = React.useRef(null)
  // Cache per condominio: { [condominioId]: { condominiData, xmlCaricato, log, tabAttivo } }
  const cacheCondomini = React.useRef({})

  function addLog(msg, type = 'info') {
    setLog(l => [...l, { msg, type, time: new Date().toLocaleTimeString() }])
  }

  const logColors = { info: '#a0a0c0', success: '#4ade80', error: '#f87171', warn: '#fbbf24' }

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

    // FIX 2: se il condominio è già in cache, ripristina senza ricaricare
    if (cacheCondomini.current[condominioId]) {
      const cached = cacheCondomini.current[condominioId]
      setCondominiData(cached.condominiData)
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
                unita_id: unita.id, proprietario: unita.proprietario,
                interno: unita.interno, locale: rip.locale,
                note_unita: unita.note, note_rip: rip.note,
              },
              date: '', time: '', errorflags: '0', errordate: '',
              status: '', powerstatus: '', accessnr: '', manufact: '',
              devversion: '', subnet: '', receiver: '', signature: '',
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
      setCondominiData(result)
      // Carica storico XML
      const storicoResult = await window.api.getStoricoXml({ nomeCondominio: cond.nome })
      const storico = storicoResult.files || []
      setStoricoXml(storico)
      // Salva in cache
      cacheCondomini.current[condominioId] = { condominiData: result, xmlCaricato: false, log: logIniziale, tabAttivo: 'tutti', storicoXml: storico }
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
  async function importXml() {
    const filePath = await window.api.openFileDialog([{ name: 'XML Files', extensions: ['xml'] }])
    if (!filePath) return
    setLoading(true)
    setLog([])
    addLog(`File selezionato: ${filePath.split('\\').pop()}`)
    try {
      addLog('Lettura file in corso...')
      const fileResult = await window.api.readFile(filePath)
      if (!fileResult.success) throw new Error(fileResult.error)
      const text = fileResult.content
      addLog(`File letto: ${text.length} caratteri`)
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'text/xml')
      const version = doc.querySelector('siemeca-xml-version')?.textContent || '1.0'
      addLog(`Versione XML: ${version}`)
      const measuredevs = doc.querySelectorAll('measuredev')
      addLog(`Dispositivi nell'XML: ${measuredevs.length}`)

      const oggi = new Date()
      const annoReset = oggi.getMonth() >= 9 ? oggi.getFullYear() : oggi.getFullYear() - 1
      const dataReset = new Date(annoReset, 9, 1)

      // Costruisce mappa matricola → dati lettura
      const lettureMap = {}
      for (const dev of measuredevs) {
        const identnr = dev.querySelector('identnr')?.textContent?.trim() || ''
        if (!identnr) continue
        const date = dev.querySelector('date')?.textContent || ''
        const time = dev.querySelector('time')?.textContent || ''
        const errorflags = dev.querySelector('errorflags')?.textContent || '0'
        const errordate = dev.querySelector('errordate')?.textContent || ''
        const status = dev.querySelector('status')?.textContent || ''
        const powerstatus = dev.querySelector('powerstatus')?.textContent || ''
        const accessnr = dev.querySelector('accessnr')?.textContent || ''
        const manufact = dev.querySelector('manufact')?.textContent || ''
        const devversion = dev.querySelector('version')?.textContent || ''
        const subnet = dev.querySelector('subnet')?.textContent || ''
        const receiver = dev.querySelector('receiver')?.textContent || ''
        const signature = dev.querySelector('signature')?.textContent || ''

        const datapoints = []
        dev.querySelectorAll('datapoint').forEach(dp => {
          datapoints.push({
            storagenr: dp.querySelector('storagenr')?.textContent || '',
            value: dp.querySelector('value')?.textContent || '',
            dimension: dp.querySelector('dimension')?.textContent || '',
          })
        })

        const hca = datapoints.find(d => d.dimension === 'H.C.A.' && d.storagenr === '0')
        const hcaValori = datapoints.filter(d => d.dimension === 'H.C.A.' && d.storagenr !== '0')
        const dateStoriche = datapoints.filter(d => d.dimension === 'date' && d.storagenr !== '0')
        const dateMap = {}
        dateStoriche.forEach(d => { dateMap[d.storagenr] = d.value })

        const dataLettura = parseData(date) || oggi
        const tuttiStorici = hcaValori
          .map(h => ({ storagenr: parseInt(h.storagenr), value: h.value, data: dateMap[h.storagenr] || '' }))
          .sort((a, b) => b.storagenr - a.storagenr)

        tuttiStorici.forEach((h, i) => {
          const fineMese = new Date(dataLettura.getFullYear(), dataLettura.getMonth() - i, 0)
          h.dataCalcolata = formatData(fineMese)
          h.labelMese = `-${i + 1} ${i === 0 ? 'mese' : 'mesi'}`
        })

        const storiciFiltrati = tuttiStorici.filter(h => {
          const d = parseData(h.dataCalcolata)
          return d && d >= dataReset
        })
        const hcaStorico = storiciFiltrati.slice(0, 12)

        const meseLetturaCorrente = dataLettura.getMonth()
        const annoAnnoPrec = dataLettura.getFullYear() - 1
        const hcaAgostoPrecedente = tuttiStorici.find(h => {
          const d = parseData(h.dataCalcolata)
          return d && d.getMonth() === meseLetturaCorrente && d.getFullYear() === annoAnnoPrec
        }) || null

        lettureMap[identnr] = {
          identnr, date, time, errorflags, errordate, status, powerstatus,
          accessnr, manufact, devversion, subnet, receiver, signature,
          hca, hcaStorico, hcaAgostoPrecedente,
          nessuna_lettura: false,
        }
      }

      // Merge: per ogni ripartitore dell'anagrafica cerca la lettura nell'XML
      let abbinati = 0
      let mancanti = 0

      const nuoviCondomini = condominiData.map(cond => ({
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
              } else {
                mancanti++
                return { ...rip, nessuna_lettura: true }
              }
            })
          }]))
        }]))
      }))

      addLog(`Abbinati: ${abbinati} su ${abbinati + mancanti} ripartitori`, 'success')
      if (mancanti > 0) addLog(`⚠ Senza lettura XML: ${mancanti} ripartitori`, 'warn')
      addLog('✓ Import XML completato', 'success')
      setCondominiData(nuoviCondomini)
      setXmlCaricato(true)

      // Archivia il file XML
      const nomeCondArchivio = nuoviCondomini[0]?.nome || ''
      if (nomeCondArchivio && filePath) {
        // Converti data da DD.MM.AA a YYYY-MM-DD
        const rawDate = lettureMap && Object.values(lettureMap)[0]?.date
        let dataLetturaStr = new Date().toISOString().slice(0, 10)
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
        // Prima prova senza sovrascrittura
        let archResult = await window.api.archiviaXml({
          nomeCondominio: nomeCondArchivio,
          filePath,
          dataLettura: dataLetturaStr,
          sovrascrivi: false,
        })
        // Se il file esiste già, chiedi conferma tramite modal React
        if (archResult.esistente) {
          const conferma = await new Promise(resolve => setConfirmSovrascrittura({ resolve, destName: archResult.destName }))
          if (conferma) {
            archResult = await window.api.archiviaXml({
              nomeCondominio: nomeCondArchivio,
              filePath,
              dataLettura: dataLetturaStr,
              sovrascrivi: true,
            })
          } else {
            addLog('📁 Archiviazione saltata — file già presente', 'info')
            toast.info('Archiviazione saltata — file già presente')
            archResult = { success: false, saltato: true }
          }
        }
        if (archResult.success) {
          addLog('📁 Archiviato: ' + archResult.destName, 'success')
          toast.success('Archiviato: ' + archResult.destName)
          const nuovoStorico = await window.api.getStoricoXml({ nomeCondominio: nomeCondArchivio })
          setStoricoXml(nuovoStorico.files || [])
        } else if (!archResult.saltato) {
          addLog('⚠ Archivio: ' + (archResult.error || 'non configurato'), 'warn')
          toast.warning('Archivio: ' + (archResult.error || 'percorso non configurato nelle Impostazioni'))
        }
      }

      // FIX 2: aggiorna cache con dati XML inclusi
      const condominioId = getCondominioId(selectedNode)
      if (condominioId) {
        cacheCondomini.current[condominioId] = {
          condominiData: nuoviCondomini,
          xmlCaricato: true,
          log: [...log, { msg: `Abbinati: ${abbinati} su ${abbinati + mancanti} ripartitori`, type: 'success', time: new Date().toLocaleTimeString() }],
          tabAttivo,
          storicoXml: storicoXml,
        }
      }
    } catch (err) {
      addLog(`Errore: ${err.message}`, 'error')
    }
    setLoading(false)
  }

  async function generaPdfTutti() {
    if (condominiData.length === 0) return
    setUltimoPdfTutti(null)
    const result = await window.api.generaPdf({ condominiData, modalita: 'tutti' })
    if (result?.success === false) toast.error('Errore PDF: ' + (result.error || ''))
    else if (result?.success) toast.success('PDF generato con successo!')
  }

  async function inviaEmailTutti() {
    if (!ultimoPdfTutti) return
    const result = await window.api.inviaEmail({ pdfPath: ultimoPdfTutti })
    if (result?.success === false) toast.error('Errore email: ' + (result.error || ''))
  }

  function aprireModaleSingolo() {
    if (condominiData.length === 0) return
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
    else if (result?.success) toast.success('PDF generato!')
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
    // Filtro tab
    if (tabAttivo === 'tutti') return true
    if (tabAttivo === 'con_lettura') return !rip.nessuna_lettura
    if (tabAttivo === 'senza_lettura') return rip.nessuna_lettura
    if (tabAttivo === 'con_errore') return !rip.nessuna_lettura && rip.status && rip.status !== '0'
    return true
  }

  // ─── Descrizione Status QUNDIS ──────────────────────────────
  function descrizioneStatus(status) {
    const map = {
      '0':   null,
      '40':  'Guasto sensore temperatura (Sostituire)',
      '80':  'Valore fuori range - temperatura anomala (Sostituire)',
      '120': 'Guasto sensore + fuori range (Sostituire)',
      '160': 'Dispositivo manomesso o rimosso (Verificare/Sostituire)',
    }
    return map[status] ?? `Errore codice ${status}`
  }

  // ─── Espone patchAnagrafica al padre tramite ref ────────────
  React.useImperativeHandle(ref, () => ({
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

  const TABS = [
    { key: 'tutti',         label: 'Tutti',           count: contatori.tutti,        color: '#4f46e5' },
    { key: 'con_lettura',   label: 'Con lettura',      count: contatori.conLettura,   color: '#16a34a' },
    { key: 'senza_lettura', label: 'Nessuna lettura',  count: contatori.senzaLettura, color: '#dc2626' },
    { key: 'con_errore',    label: 'Con errore',       count: contatori.conErrore,    color: '#d97706' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f0f2f5' }}>

      {/* Zona fissa */}
      <div style={{ flexShrink: 0, padding: '24px 24px 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#8888aa', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
              {selectedNode?.type === 'condominio' && 'Condominio'}
              {selectedNode?.type === 'piano' && 'Piano'}
              {selectedNode?.type === 'unita' && 'Unità abitativa'}
              {selectedNode?.type === 'ripartitore' && 'Ripartitore'}
            </div>
            <div style={{ fontSize: '20px', fontWeight: '600', color: '#1a1a2e', marginTop: '2px' }}>
              {selectedNode?.data?.nome || selectedNode?.data?.proprietario || selectedNode?.data?.interno || selectedNode?.data?.matricola}
            </div>
          </div>
          <button onClick={importXml} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', background: '#4f46e5', border: 'none',
            borderRadius: '10px', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '13px', fontWeight: '600', opacity: loading ? 0.7 : 1,
          }}>
            <Upload size={16} />
            {loading ? 'Caricamento...' : 'Importa XML'}
          </button>
        </div>

        <div style={{
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
            <button onClick={aprireModaleSingolo} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', background: '#fff', border: '1px solid #e0e0f0',
              borderRadius: '8px', color: '#4f46e5', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
            }}>
              <User size={14} /> PDF Selezione utenti
            </button>
            {ultimoPdfSingolo && (
              <button onClick={inviaEmailSingolo} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0',
                borderRadius: '8px', color: '#15803d', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
              }}>
                <Mail size={14} /> Invia per Email
              </button>
            )}
            <div style={{ width: '1px', background: '#e8e8f5', alignSelf: 'stretch' }} />
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
                padding: '8px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0',
                borderRadius: '8px', color: '#15803d', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
              }}>
                <Mail size={14} /> Invia per Email
              </button>
            )}
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
                background: '#fff', border: '1px solid #e0e0f0',
                borderRadius: '8px', fontSize: '12px', color: '#1a1a2e',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            {cercaTesto && (
              <button
                onClick={() => setCercaTesto('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#8888aa' }}
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
              <div style={{ fontSize: '11px', color: '#8888aa', padding: '8px 4px', alignSelf: 'center' }}>
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
                    color: isActive ? tab.color : '#8888aa',
                    cursor: 'pointer', fontSize: '12px', fontWeight: isActive ? '700' : '500',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                  <span style={{
                    background: isActive ? tab.color : '#e8e8f5',
                    color: isActive ? '#fff' : '#8888aa',
                    borderRadius: '10px', padding: '1px 7px',
                    fontSize: '11px', fontWeight: '700', minWidth: '20px', textAlign: 'center',
                  }}>
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Storico import XML ──────────────────────────────── */}
      {storicoXml.length > 0 && (
        <div style={{ flexShrink: 0, padding: '0 24px 12px 24px' }}>
          <div style={{
            background: '#fff', borderRadius: '10px', border: '1px solid #e8e8f5',
            padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#8888aa', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  📁 Storico import ({storicoXml.length})
                </span>
              </div>
              <button
                onClick={() => {
                  const nomeCond = condominiData[0]?.nome || ''
                  if (nomeCond) window.api.apriCartellaArchivio({ nomeCondominio: nomeCond })
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#4f46e5', fontWeight: '600' }}
              >
                Apri cartella ↗
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
              {storicoXml.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 8px', borderRadius: '6px',
                  background: i === 0 ? '#f0f0ff' : '#fafafa',
                  border: `1px solid ${i === 0 ? '#e0e0ff' : '#f0f0f0'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px' }}>📄</span>
                    <span style={{ fontSize: '11px', color: '#3a3a5a', fontFamily: 'monospace' }}>{f.nome}</span>
                    {i === 0 && <span style={{ fontSize: '9px', background: '#4f46e5', color: '#fff', padding: '1px 5px', borderRadius: '4px' }}>ultimo</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: '#8888aa' }}>
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      onClick={async () => {
                        const fileResult = await window.api.readFile(f.path)
                        if (fileResult.success) {
                          // Ricarica come se fosse un nuovo import (senza riarchivare)
                          toast.info('Seleziona il file dallo storico tramite "Importa XML" per ricaricare una lettura precedente.')
                        }
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#4f46e5' }}
                    >
                      ↺
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
                background: '#fff', borderRadius: '14px',
                border: '1px solid #e8e8f5', overflow: 'hidden',
                boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
              }}>
                <div style={{ background: '#1a1a2e', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Building2 size={18} color="#4ade80" />
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff' }}>{cond.nome}</div>
                    <div style={{ fontSize: '11px', color: '#6b6b8a' }}>{cond.indirizzo} — {cond.citta}</div>
                  </div>
                </div>
                {pianiVisible.map((piano, pi) => (
                  <div key={pi} style={{ borderTop: pi > 0 ? '1px solid #f0f0f8' : 'none' }}>
                    <div style={{ background: '#f8f8ff', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #ededf8' }}>
                      <Layers size={14} color="#f59e0b" />
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#3a3a5a' }}>{piano.nome}</span>
                    </div>
                    {piano.unitaVisible.map((unita, ui) => (
                      <div key={ui} style={{ padding: '16px 20px', borderBottom: '1px solid #f5f5fc' }}>
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <User size={14} color="#60a5fa" />
                            <span style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>{unita.proprietario}</span>
                            {unita.interno && (
                              <span style={{ fontSize: '11px', color: '#8888aa', background: '#f0f0ff', padding: '2px 8px', borderRadius: '10px' }}>
                                {unita.interno}
                              </span>
                            )}
                          </div>
                          {unita.note && (
                            <div style={{ fontSize: '11px', color: '#7c7c9a', marginTop: '4px', marginLeft: '22px', fontStyle: 'italic' }}>
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
                                  background: '#fff5f5',
                                  borderRadius: '10px', padding: '12px',
                                  border: '1px solid #fecaca',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <Flame size={12} color="#fb923c" />
                                      <span style={{ fontSize: '11px', color: '#8888aa', fontFamily: 'monospace' }}>{rip.identnr}</span>
                                    </div>
                                    <AlertTriangle size={13} color="#dc2626" />
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#8888aa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                                    {rip.dbInfo?.locale || 'Locale n.d.'}
                                  </div>
                                  <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    background: '#fef2f2', border: '1px solid #fecaca',
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
                                background: hasError ? '#fef2f2' : '#f8f8ff',
                                borderRadius: '10px', padding: '12px',
                                border: `1px solid ${hasError ? '#fecaca' : '#ededf8'}`,
                              }}>
                                {/* Header matricola */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <Flame size={12} color="#fb923c" />
                                    <span style={{ fontSize: '11px', color: '#8888aa', fontFamily: 'monospace' }}>{rip.identnr}</span>
                                  </div>
                                  {hasError ? <AlertTriangle size={12} color="#ef4444" /> : <CheckCircle size={12} color="#4ade80" />}
                                </div>

                                {/* Locale */}
                                <div style={{ fontSize: '10px', color: '#8888aa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>
                                  {rip.dbInfo?.locale || 'Locale n.d.'}
                                </div>

                                {/* Valore corrente + Anno precedente */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                    <span style={{ fontSize: '22px', fontWeight: '700', color: '#4f46e5' }}>{rip.hca?.value || '—'}</span>
                                    <span style={{ fontSize: '11px', color: '#8888aa' }}>H.C.A.</span>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                    {rip.hcaAgostoPrecedente && (
                                      <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '9px', color: '#8888aa' }}>{meseLabel} {annoAgostoLabel}</div>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#a78bfa' }}>
                                          {rip.hcaAgostoPrecedente.value} <span style={{ fontSize: '9px', color: '#8888aa' }}>H.C.A.</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Data lettura */}
                                <div style={{ fontSize: '10px', color: '#8888aa', marginTop: '2px' }}>{rip.date} {rip.time}</div>

                                {/* Status e batteria */}
                                {(hasStatus || rip.powerstatus) && (
                                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                                    {hasStatus && (
                                      <span style={{ fontSize: '10px', background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ fontWeight: '700' }}>⚠ {rip.status}</span>
                                        <span style={{ color: '#ef4444' }}>— {descrizioneStatus(rip.status)}</span>
                                      </span>
                                    )}
                                    {rip.powerstatus && (
                                      <span style={{ fontSize: '10px', background: '#f0fdf4', color: '#16a34a', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
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

                                {/* Note ripartitore */}
                                {rip.note_rip && (
                                  <div style={{ fontSize: '10px', color: '#7c7c9a', marginTop: '6px', fontStyle: 'italic', borderTop: '1px solid #ededf8', paddingTop: '6px' }}>
                                    📝 {rip.note_rip}
                                  </div>
                                )}

                                {/* Storico */}
                                {rip.hcaStorico.length > 0 && (
                                  <div style={{ marginTop: '8px', borderTop: '1px solid #ededf8', paddingTop: '8px' }}>
                                    <div style={{ fontSize: '10px', color: '#8888aa', marginBottom: '4px' }}>
                                      Storico ultimi 12 mesi
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      {rip.hcaStorico.map((h, hi) => (
                                        <div key={hi} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: '10px', color: '#8888aa' }}>
                                            {h.dataCalcolata}
                                            <span style={{ fontSize: '9px', color: '#c0c0d8', marginLeft: '4px' }}>
                                              {h.labelMese}
                                            </span>
                                          </span>
                                          <span style={{ fontSize: '11px', color: '#6366f1', fontWeight: '600' }}>
                                            {h.value} H.C.A.
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
            color: '#8888aa', minHeight: '200px', marginTop: '20px',
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
            background: '#fff', borderRadius: '14px', padding: '24px',
            width: '460px', maxHeight: '75vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a2e' }}>Seleziona utenti per PDF</div>
              <div style={{ fontSize: '12px', color: '#8888aa' }}>{selezionati.length} selezionati</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button onClick={() => setSelezionati(proprietariList.map(p => p.proprietario))} style={{
                flex: 1, padding: '6px', background: '#f0f0ff', border: '1px solid #e0e0ff',
                borderRadius: '6px', color: '#4f46e5', cursor: 'pointer', fontSize: '12px',
              }}>Seleziona tutti</button>
              <button onClick={() => setSelezionati([])} style={{
                flex: 1, padding: '6px', background: '#f8f8f8', border: '1px solid #e0e0e0',
                borderRadius: '6px', color: '#8888aa', cursor: 'pointer', fontSize: '12px',
              }}>Deseleziona tutti</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {proprietariList.map((p, i) => {
                const isSelected = selezionati.includes(p.proprietario)
                return (
                  <button key={i} onClick={() => toggleSelezionato(p.proprietario)} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                    background: isSelected ? '#ededff' : '#f8f8ff',
                    border: `1px solid ${isSelected ? '#4f46e5' : '#ededf8'}`,
                    borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                      background: isSelected ? '#4f46e5' : '#fff',
                      border: `2px solid ${isSelected ? '#4f46e5' : '#c0c0d8'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && <span style={{ color: '#fff', fontSize: '11px', fontWeight: '700' }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.proprietario}
                      </div>
                      <div style={{ fontSize: '11px', color: '#8888aa' }}>{p.piano} — {p.condominio}</div>
                    </div>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={() => { setModalePdf(false); setSelezionati([]) }} style={{
                flex: 1, padding: '9px', background: 'transparent',
                border: '1px solid #e0e0f0', borderRadius: '8px',
                color: '#8888aa', cursor: 'pointer', fontSize: '13px',
              }}>Annulla</button>
              <button onClick={generaPdfSingolo} disabled={selezionati.length === 0} style={{
                flex: 1, padding: '9px',
                background: selezionati.length > 0 ? '#4f46e5' : '#c0c0d8',
                border: 'none', borderRadius: '8px', color: '#fff',
                cursor: selezionati.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: '13px', fontWeight: '600',
              }}>Genera PDF ({selezionati.length})</button>
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
            background: '#fff', borderRadius: '14px', padding: '24px', width: '400px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>
              📁 File già presente
            </div>
            <div style={{ fontSize: '13px', color: '#6b6b8a', marginBottom: '20px', lineHeight: '1.5' }}>
              Il file <strong style={{ color: '#1a1a2e', fontFamily: 'monospace' }}>{confirmSovrascrittura.destName}</strong> esiste già nell'archivio.<br />Vuoi sovrascriverlo?
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setConfirmSovrascrittura(null); confirmSovrascrittura.resolve(false) }} style={{
                flex: 1, padding: '9px', background: 'transparent', border: '1px solid #e0e0f0',
                borderRadius: '8px', color: '#8888aa', cursor: 'pointer', fontSize: '13px',
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