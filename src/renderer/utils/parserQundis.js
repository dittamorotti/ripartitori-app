// ─── Parser XML QUNDIS (siemeca) ─────────────────────────────────────────────
// Fonti: "XML-Specification Q AMR & Q walk-by V1.2.4" e schede datapoint
// Q caloric 5.5 / Q heat 5.5 R / Q water 5.5 (QUNDIS, 2025).
//
// Riconosce in automatico il tipo di ogni dispositivo (measuredev):
//   HCA    → ripartitore di calore              (unità H.C.A.)
//   CALORE → contabilizzatore di calore         (Wh/kWh/MWh/J/MJ/GJ → kWh)
//   FREDDO → contabilizzatore di raffrescamento (→ kWh)
//   ACS    → contatore acqua calda              (m³)
//   AFS    → contatore acqua fredda             (m³)
// Ripartitori: il conteggio riparte dopo il giorno di riferimento (storagenr 1).
// Contatori: valori progressivi, consumo sull'anno solare.

export const TIPI = {
  HCA:    { key: 'HCA',    label: 'Ripartitore',                 labelPlurale: 'Ripartitori',    unita: 'H.C.A.' },
  CALORE: { key: 'CALORE', label: 'Contatore di calore',         labelPlurale: 'Calore',         unita: 'kWh' },
  FREDDO: { key: 'FREDDO', label: 'Contatore di raffrescamento', labelPlurale: 'Raffrescamento', unita: 'kWh' },
  ACS:    { key: 'ACS',    label: 'Acqua calda',                 labelPlurale: 'Acqua calda',    unita: 'm³' },
  AFS:    { key: 'AFS',    label: 'Acqua fredda',                labelPlurale: 'Acqua fredda',   unita: 'm³' },
}

export const MESI_LABEL = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

export function isContatore(tipo) {
  return tipo === 'CALORE' || tipo === 'FREDDO' || tipo === 'ACS' || tipo === 'AFS'
}

export function isAcqua(tipo) {
  return tipo === 'ACS' || tipo === 'AFS'
}

export function unitaTipo(tipo) {
  return (TIPI[tipo] || TIPI.HCA).unita
}

// Formatta un valore per la visualizzazione (HCA invariato, contatori in formato italiano)
export function formatValore(valore, tipo) {
  if (valore === null || valore === undefined || valore === '') return '—'
  if (!isContatore(tipo)) return valore
  const n = typeof valore === 'number' ? valore : parseFloat(String(valore).replace(',', '.'))
  if (isNaN(n)) return '—'
  const decimali = (tipo === 'CALORE' || tipo === 'FREDDO') ? 0 : 3
  return n.toLocaleString('it-IT', { minimumFractionDigits: decimali, maximumFractionDigits: decimali })
}

// ─── Status (specifica XML, Tabella 2 — byte di stato M-Bus EN 13757-3) ──────
// Valore decimale da leggere bit per bit; più errori possono essere attivi insieme.
//   bit 0-1: 1 occupato, 2 errore applicativo, 3 condizione anomala (es. perdita acqua)
//   bit 2  : batteria scarica
//   bit 3  : errore permanente   bit 4: errore temporaneo
//   bit 5-7: qualificano bit 3/4 → 40 guasto, 80 fuori range, 136/144 comunicazione interrotta
export function decodificaStatus(status, tipo) {
  const n = parseInt(status)
  if (!n || isNaN(n)) return []
  const voci = []
  const acqua = isAcqua(tipo)
  const perm = (n & 0x08) !== 0
  const temp = (n & 0x10) !== 0
  const basso = n & 0x03

  if (basso === 1) voci.push({ testo: 'Applicazione occupata', azione: 'Nessuna' })
  if (basso === 2) voci.push({ testo: 'Errore applicativo', azione: 'Verificare' })
  if (basso === 3) voci.push(acqua
    ? { testo: 'Condizione anomala: possibile perdita (flusso continuo)', azione: 'Verificare perdita' }
    : { testo: 'Condizione anomala', azione: 'Verificare' })
  if (n & 0x04) voci.push({ testo: 'Batteria scarica', azione: 'Sostituire' })
  if (perm && (n & 0x20)) voci.push({ testo: 'Guasto dispositivo', azione: 'Sostituire' })
  if (temp && (n & 0x40)) voci.push({ testo: 'Condizioni fuori range', azione: isContatore(tipo) ? 'Verificare' : 'Sostituire' })
  if (perm && (n & 0x80)) voci.push({ testo: 'Comunicazione interrotta (permanente)', azione: 'Verificare/Sostituire' })
  if (temp && (n & 0x80)) voci.push({ testo: 'Comunicazione interrotta (temporanea)', azione: 'Verificare ricezione radio' })
  if (perm && !(n & 0xA0)) voci.push({ testo: 'Errore permanente', azione: 'Verificare' })
  if (temp && !(n & 0xC0)) voci.push({ testo: 'Errore temporaneo', azione: 'Verificare' })
  if (voci.length === 0) voci.push({ testo: `Codice stato ${n} non documentato`, azione: 'Verificare' })
  return voci
}

export function descrizioneStatusTipo(status, tipo) {
  const voci = decodificaStatus(status, tipo)
  if (voci.length === 0) return null
  return voci.map(v => `${v.testo} (${v.azione})`).join(' + ')
}

// ─── Error flags del file XML (specifica XML, cap. 4.6) ──────────────────────
// Codice (non bit) sulla conversione del telegramma, quasi sempre legato alla cifratura.
const ERRORFLAGS = {
  '1':  'Chiave di cifratura mancante',
  '2':  'Modalità di sicurezza non supportata',
  '3':  'Autenticazione fallita',
  '4':  'Decifratura fallita',
  '7':  'Tipo di messaggio non supportato (C-field)',
  '8':  'Protocollo non supportato (CI-field)',
  '9':  'Errore imprevisto',
  '10': 'Servizio di cifratura non attivo',
}
export function descrizioneErrorFlags(code) {
  if (!code || code === '0') return null
  return ERRORFLAGS[String(code)] || `Codice ${code} riservato`
}

// ─── Signature: modalità di sicurezza nei bit 8-12 ──────────────────────────
export function decodificaSignature(sig) {
  const n = parseInt(sig)
  if (isNaN(n)) return ''
  const modo = (n >> 8) & 0x1F
  if (modo === 0) return 'Nessuna cifratura'
  if (modo === 5) return 'AES-128'
  if (modo === 7) return 'AES-128 + CMAC'
  return `Modalità ${modo}`
}

export function parseData(dataStr) {
  if (!dataStr || dataStr.includes('--')) return null
  const parts = dataStr.split(' ')[0].split('.')
  if (parts.length !== 3) return null
  const giorno = parseInt(parts[0])
  const mese = parseInt(parts[1])
  let anno = parseInt(parts[2])
  if (isNaN(giorno) || isNaN(mese) || isNaN(anno)) return null
  if (anno < 100) anno += 2000
  return new Date(anno, mese - 1, giorno)
}

export function formatData(d) {
  const gg = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const aa = String(d.getFullYear()).slice(2)
  return `${gg}.${mm}.${aa}`
}

// Data plausibile di un registro: anno ≥ 2001 e non successiva alla lettura
function dataValida(dataStr, dataLettura) {
  const d = parseData(dataStr)
  if (!d || d.getFullYear() < 2001) return null
  if (dataLettura && d > dataLettura) return null
  return d
}

// Numero da XML: "3,271" → 3.271 | "x x x" / "" → null
function numeroXml(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (s === '' || s.toLowerCase().includes('x')) return null
  const n = s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s)
  return isNaN(n) ? null : n
}

// Fattore di conversione verso l'unità di visualizzazione (kWh / m³)
const DIMENSIONI_ENERGIA = { 'Wh': 0.001, 'kWh': 1, 'MWh': 1000, 'J': 1 / 3600000, 'kJ': 1 / 3600, 'MJ': 1 / 3.6, 'GJ': 1000 / 3.6 }
const DIMENSIONI_VOLUME = { 'm3': 1, 'm^3': 1, 'l': 0.001 }

// Tipo dal devtype M-Bus (specifica XML, Tabella 1), con ripiego sulle dimensioni
function riconosciTipo(devtype, datapoints) {
  const dt = parseInt(devtype)
  if (dt === 8) return 'HCA'
  if (dt === 4 || dt === 12 || dt === 13) return 'CALORE'
  if (dt === 10 || dt === 11) return 'FREDDO'
  if (dt === 6 || dt === 21) return 'ACS'
  if (dt === 7 || dt === 22) return 'AFS'
  const dims = new Set(datapoints.map(d => d.dimension))
  if (dims.has('H.C.A.')) return 'HCA'
  if ([...dims].some(d => d in DIMENSIONI_ENERGIA)) return 'CALORE'
  if ([...dims].some(d => d in DIMENSIONI_VOLUME)) return 'AFS'
  return 'HCA'
}

// ─── Registri mensili (specifica XML, cap. 5.6) ─────────────────────────────
// V1.1 (tutti) e V1.2 non-QDS: storico mensile da 8 (più vecchio) in su → più alto = più recente.
// V1.2 QDS (17555): 8-15 = dati giornalieri (ignorati), 17-40 mensili con 17 = più recente.
// Restituisce i registri ordinati dal più recente, ciascuno con la data reale se presente.
function registriMensili(datapoints, dim, versioneXml, manufact) {
  const v12qds = parseFloat(versioneXml) >= 1.2 && String(manufact) === '17555'
  const dateMap = {}
  datapoints.filter(d => d.dimension === 'date').forEach(d => { dateMap[d.storagenr] = d.value })
  return datapoints
    .filter(d => d.dimension === dim)
    .map(d => ({ storagenr: parseInt(d.storagenr), value: d.value, data: dateMap[d.storagenr] || '' }))
    .filter(d => v12qds ? (d.storagenr >= 17 && d.storagenr <= 40) : (d.storagenr >= 2 && d.storagenr <= 40))
    .sort((a, b) => v12qds ? a.storagenr - b.storagenr : b.storagenr - a.storagenr)
}

// Data di fine mese di ogni registro: data reale se valida, altrimenti calcolata a ritroso
function assegnaDate(registri, dataLettura) {
  let ancora = new Date(dataLettura.getFullYear(), dataLettura.getMonth(), 0)
  const dataRecente = registri.length ? dataValida(registri[0].data, dataLettura) : null
  if (dataRecente) ancora = new Date(dataRecente.getFullYear(), dataRecente.getMonth() + 1, 0)
  registri.forEach((h, i) => {
    const reale = dataValida(h.data, dataLettura)
    const fineMese = reale || new Date(ancora.getFullYear(), ancora.getMonth() - i + 1, 0)
    h.dataCalcolata = formatData(fineMese)
  })
}

// Giorno di riferimento (storagenr 1): data e valore memorizzati dal dispositivo
function leggiRiferimento(datapoints, dim, dataLettura) {
  const dataStr = datapoints.find(d => d.storagenr === '1' && d.dimension === 'date')?.value || ''
  const data = dataValida(dataStr, dataLettura)
  if (!data) return null
  const valore = datapoints.find(d => d.storagenr === '1' && d.dimension === dim)?.value
  return { data: formatData(data), valore: valore ?? null }
}

// ─── Ripartitori ────────────────────────────────────────────────────────────
function parseHca(datapoints, date, versioneXml, manufact) {
  const oggi = new Date()
  const dataLettura = parseData(date) || oggi

  // Inizio periodo: giorno dopo il giorno di riferimento; se assente, 1 ottobre (come prima)
  const riferimento = leggiRiferimento(datapoints, 'H.C.A.', dataLettura)
  let dataReset
  if (riferimento) {
    const r = parseData(riferimento.data)
    dataReset = new Date(r.getFullYear(), r.getMonth(), r.getDate() + 1)
  } else {
    const annoReset = oggi.getMonth() >= 9 ? oggi.getFullYear() : oggi.getFullYear() - 1
    dataReset = new Date(annoReset, 9, 1)
  }

  const hca = datapoints.find(d => d.dimension === 'H.C.A.' && d.storagenr === '0')
  const tuttiStorici = registriMensili(datapoints, 'H.C.A.', versioneXml, manufact)
  assegnaDate(tuttiStorici, dataLettura)
  tuttiStorici.forEach((h, i) => { h.labelMese = `-${i + 1} ${i === 0 ? 'mese' : 'mesi'}` })

  const hcaStorico = tuttiStorici.filter(h => {
    const d = parseData(h.dataCalcolata)
    return d && d >= dataReset
  }).slice(0, 12)

  const meseLetturaCorrente = dataLettura.getMonth()
  const annoAnnoPrec = dataLettura.getFullYear() - 1
  const hcaAgostoPrecedente = tuttiStorici.find(h => {
    const d = parseData(h.dataCalcolata)
    return d && d.getMonth() === meseLetturaCorrente && d.getFullYear() === annoAnnoPrec
  }) || null

  return {
    hca: hca || null, hcaStorico, hcaAgostoPrecedente, consumo: null,
    riferimento, inizioPeriodo: formatData(dataReset), anomalie: [],
  }
}

// ─── Contatori (calore / raffrescamento / acqua): valori progressivi ───────
function parseContatore(tipo, datapoints, date, versioneXml, manufact) {
  const anomalie = []
  const tabella = (tipo === 'CALORE' || tipo === 'FREDDO') ? DIMENSIONI_ENERGIA : DIMENSIONI_VOLUME
  const dimPrincipale = datapoints.find(d => d.storagenr === '0' && d.dimension in tabella)?.dimension
  if (!dimPrincipale) {
    anomalie.push('Nessun valore di consumo nel telegramma')
    return { hca: null, hcaStorico: [], hcaAgostoPrecedente: null, consumo: null, riferimento: null, anomalie }
  }
  const fattore = tabella[dimPrincipale]
  const conv = v => {
    const n = numeroXml(v)
    return n === null ? null : Math.round(n * fattore * 1000) / 1000
  }

  const dataLettura = parseData(date) || new Date()
  const valoreAttuale = conv(datapoints.find(d => d.storagenr === '0' && d.dimension === dimPrincipale)?.value)

  // Giorno di riferimento (storagenr 1)
  const rifGrezzo = leggiRiferimento(datapoints, dimPrincipale, dataLettura)
  const riferimento = rifGrezzo ? { data: rifGrezzo.data, valore: conv(rifGrezzo.valore) } : null

  // Storico mensile: se la data del registro più recente è impossibile, lo storico non è configurato
  const registri = registriMensili(datapoints, dimPrincipale, versioneXml, manufact)
  let storicoValido = true
  if (registri.length > 0) {
    const dataRecente = parseData(registri[0].data)
    if (dataRecente && !dataValida(registri[0].data, dataLettura)) storicoValido = false
  }
  if (!storicoValido) anomalie.push('Storico mensile non configurato (date del dispositivo non impostate)')

  const tuttiStorici = storicoValido ? registri : []
  assegnaDate(tuttiStorici, dataLettura)
  tuttiStorici.forEach(h => {
    const d = parseData(h.dataCalcolata)
    const mesi = (dataLettura.getFullYear() - d.getFullYear()) * 12 + dataLettura.getMonth() - d.getMonth()
    h.value = conv(h.value)
    h.labelMese = `-${mesi} ${mesi === 1 ? 'mese' : 'mesi'}`
    h.consumoMese = null
  })
  // Consumo di ogni mese = lettura fine mese − lettura fine mese precedente
  tuttiStorici.forEach((h, i) => {
    const prec = tuttiStorici[i + 1]
    if (h.value !== null && prec && prec.value !== null) {
      h.consumoMese = Math.round((h.value - prec.value) * 1000) / 1000
    }
  })

  // Consumo anno solare: attuale − lettura al 31/12 dell'anno precedente.
  // Fonte preferita: giorno di riferimento del contatore (se è il 31/12), poi lo storico mensile.
  let consumo = null
  if (valoreAttuale !== null) {
    const annoCorrente = dataLettura.getFullYear()
    const isFineAnnoPrec = (dataStr) => {
      const d = parseData(dataStr)
      return d && d.getFullYear() === annoCorrente - 1 && d.getMonth() === 11 && d.getDate() === 31
    }
    let base = null
    if (riferimento && riferimento.valore !== null && isFineAnnoPrec(riferimento.data)) {
      base = { valore: riferimento.valore, data: riferimento.data, fonte: 'giorno di riferimento' }
    } else {
      const h = tuttiStorici.find(x => isFineAnnoPrec(x.dataCalcolata) && x.value !== null)
      if (h) base = { valore: h.value, data: h.dataCalcolata, fonte: 'storico mensile' }
    }
    consumo = base
      ? { valore: Math.round((valoreAttuale - base.valore) * 1000) / 1000, base: base.valore, dataBase: base.data,
          fonte: base.fonte, periodo: `Anno ${annoCorrente}`, dalMontaggio: false }
      : { valore: valoreAttuale, base: 0, dataBase: '', fonte: '', periodo: 'Dal montaggio', dalMontaggio: true }
    if (consumo.valore < 0) anomalie.push('Consumo negativo: verificare sostituzione o reset del contatore')
  }

  if (valoreAttuale === 0 && tuttiStorici.every(h => h.value === null || h.value === 0)) {
    anomalie.push('Contatore fermo a zero')
  }

  const hcaStorico = tuttiStorici.filter(h => h.value !== null).slice(0, 12)

  return {
    hca: valoreAttuale !== null ? { value: valoreAttuale } : null,
    hcaStorico,
    hcaAgostoPrecedente: null,
    consumo,
    riferimento,
    anomalie,
  }
}

// ─── Parsing completo del file ──────────────────────────────────────────────
export function parseQundisXml(text) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/xml')
  if (doc.querySelector('parsererror')) throw new Error('File XML non valido')
  const version = doc.querySelector('siemeca-xml-version')?.textContent || '1.0'
  const concentratore = doc.querySelector('communicator > serialnr')?.textContent?.trim() || ''
  const measuredevs = doc.querySelectorAll('measuredev')

  const lettureMap = {}
  const conteggioTipi = { HCA: 0, CALORE: 0, FREDDO: 0, ACS: 0, AFS: 0 }

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
    const devtype = dev.querySelector('devtype')?.textContent || ''
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

    const tipo = riconosciTipo(devtype, datapoints)
    conteggioTipi[tipo]++

    // Flag di errore interni del dispositivo (specifici del produttore, distinti da errorflags)
    const flagsDp = datapoints.find(d => d.dimension === 'Error Flags (binary)' && d.storagenr === '0')
    const flagDispositivo = flagsDp && flagsDp.value && flagsDp.value !== '0' ? flagsDp.value : ''

    // Ore di perdita (Q water): ore di flusso continuo, azzerate quando il flusso si ferma
    const perditaDp = datapoints.find(d => /leakage/i.test(d.dimension) && d.storagenr === '0')
    const perditaOre = perditaDp ? numeroXml(perditaDp.value) : null

    const dati = tipo === 'HCA'
      ? parseHca(datapoints, date, version, manufact)
      : parseContatore(tipo, datapoints, date, version, manufact)

    if (flagDispositivo) dati.anomalie.push(`Flag errore dispositivo: ${flagDispositivo}`)
    if (perditaOre) dati.anomalie.push(`Perdita in corso da ${perditaOre} ore`)

    lettureMap[identnr] = {
      identnr, date, time, errorflags, errordate, status, powerstatus,
      accessnr, manufact, devversion, devtype, subnet, receiver, signature,
      tipo, unita: unitaTipo(tipo),
      flagDispositivo, perditaOre,
      statusDescr: descrizioneStatusTipo(status, tipo),
      errorflagsDescr: descrizioneErrorFlags(errorflags),
      signatureDescr: decodificaSignature(signature),
      ...dati,
      nessuna_lettura: false,
    }
  }

  return { version, concentratore, totaleDispositivi: measuredevs.length, lettureMap, conteggioTipi }
}
