// ─── Funzioni comuni sulle letture ──────────────────────────────────────────
// Usate da MainPanel (import e visualizzazione), Lista Guasti ed esportazione Excel.
// Nessuna dipendenza dall'interfaccia: ricevono dati e restituiscono dati.

import {
  isContatore, unitaTipo, formatValore, parseData, TIPI,
  decodificaStatus, descrizioneStatusTipo, descrizioneErrorFlags, decodificaSignature,
} from './parserQundis'

// Data locale (non UTC) in formato YYYY-MM-DD
export function oggiLocale(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// YYYY-MM-DD → GG/MM/AAAA
export function dataItaliana(ymd) {
  if (!ymd) return ''
  const p = String(ymd).split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(ymd)
}

// Cerca in un elenco una matricola che differisce di una sola cifra o per due cifre invertite
export function trovaMatricolaSimile(matricola, elenco) {
  for (const m of elenco) {
    if (m === matricola || m.length !== matricola.length) continue
    const diff = []
    for (let k = 0; k < m.length; k++) if (m[k] !== matricola[k]) diff.push(k)
    if (diff.length === 1) return m
    if (diff.length === 2 && diff[1] === diff[0] + 1 && m[diff[0]] === matricola[diff[1]] && m[diff[1]] === matricola[diff[0]]) return m
  }
  return null
}

// Ricava il valore dello stesso mese dell'anno precedente dallo storico salvato nel DB
// dataLetturaYmd: stringa YYYY-MM-DD (formato DB)
export function trovaAgostoPrecedente(hcaStorico, dataLetturaYmd) {
  if (!hcaStorico || !hcaStorico.length || !dataLetturaYmd) return null
  const parts = dataLetturaYmd.split('-')
  if (parts.length !== 3) return null
  const mese = parseInt(parts[1]) - 1
  const annoPrec = parseInt(parts[0]) - 1
  return hcaStorico.find(h => {
    const d = parseData(h.dataCalcolata)
    return d && d.getMonth() === mese && d.getFullYear() === annoPrec
  }) || null
}

// Converte una riga di lettura dal DB nell'oggetto usato dalle card
export function rigaDbToLettura(r, dataLettura) {
  let st = []
  try { st = JSON.parse(r.hca_storico_json || '[]') } catch(e) {}
  let tech = {}; try { tech = r.tech_json ? JSON.parse(r.tech_json) : {} } catch(e) {}
  let consumo = null; try { consumo = r.consumo_json ? JSON.parse(r.consumo_json) : null } catch(e) {}
  const tipo = r.tipo || r.rip_tipo || 'HCA'
  return { identnr: r.matricola, date: dataLettura, time: '',
    errorflags: r.errorflags || '0', errordate: r.errordate || '',
    status: r.status || '0', powerstatus: r.powerstatus || '',
    manufact: tech.manufact || '', devversion: tech.devversion || '',
    accessnr: tech.accessnr || '', subnet: tech.subnet || '',
    receiver: tech.receiver || '', signature: tech.signature || '',
    tipo, unita: r.unita || unitaTipo(tipo), consumo, anomalie: tech.anomalie || [],
    flagDispositivo: tech.flagDispositivo || '', perditaOre: tech.perditaOre ?? null,
    riferimento: tech.riferimento || null, inizioPeriodo: tech.inizioPeriodo || '',
    statusDescr: descrizioneStatusTipo(r.status || '0', tipo),
    errorflagsDescr: descrizioneErrorFlags(r.errorflags || '0'),
    signatureDescr: decodificaSignature(tech.signature || ''),
    hca: r.hca_valore !== null && r.hca_valore !== undefined ? { value: r.hca_valore } : null,
    hcaStorico: st,
    hcaAgostoPrecedente: r.hca_ago_prec_json ? JSON.parse(r.hca_ago_prec_json) : (isContatore(tipo) ? null : trovaAgostoPrecedente(st, dataLettura)),
    nessuna_lettura: false }
}

// Applica una mappa matricola → lettura all'anagrafica; chi non è nella mappa resta "senza lettura"
export function applicaLetture(condominiData, lettureMap) {
  let abbinati = 0, mancanti = 0
  const dati = condominiData.map(c => ({ ...c,
    piani: Object.fromEntries(Object.entries(c.piani).map(([pk, piano]) => [pk, { ...piano,
      unita: Object.fromEntries(Object.entries(piano.unita).map(([uk, u]) => [uk, { ...u,
        ripartitori: u.ripartitori.map(rip => {
          const l = lettureMap[rip.identnr]
          if (l) { abbinati++; return { ...rip, ...l, dbInfo: rip.dbInfo } }
          mancanti++; return { ...rip, nessuna_lettura: true }
        })
      }]))
    }]))
  }))
  return { dati, abbinati, mancanti }
}

// Elenco piatto dei dispositivi: [{ cond, piano, unita, rip }]
export function elencaDispositivi(condominiData) {
  const out = []
  condominiData.forEach(cond => Object.values(cond.piani).forEach(piano =>
    Object.values(piano.unita).forEach(unita =>
      unita.ripartitori.forEach(rip => out.push({ cond, piano, unita, rip })))))
  return out
}

// ─── Guasti e anomalie di un dispositivo ────────────────────────────────────
// gravita: 'sostituire' | 'verificare' | 'mancante'
export const GRAVITA = {
  sostituire: { label: 'Da sostituire', colore: '#f87171', ordine: 0 },
  verificare: { label: 'Da verificare', colore: '#fbbf24', ordine: 1 },
  mancante:   { label: 'Senza lettura', colore: '#94a3b8', ordine: 2 },
}

export function problemiDispositivo(rip) {
  if (rip.nessuna_lettura) {
    return [{ testo: 'Nessuna lettura all\'ultimo import', azione: 'Verificare ricezione radio / presenza', gravita: 'mancante' }]
  }
  const out = []
  const tipo = rip.tipo || 'HCA'
  decodificaStatus(rip.status, tipo).forEach(v => {
    out.push({ testo: `Stato ${rip.status}: ${v.testo}`, azione: v.azione, gravita: /sostituire/i.test(v.azione) && !/verificare/i.test(v.azione) ? 'sostituire' : 'verificare' })
  })
  const ef = descrizioneErrorFlags(rip.errorflags)
  if (ef) {
    const cifratura = ['1', '2', '3', '4', '10'].includes(String(rip.errorflags))
    out.push({ testo: `Errore XML ${rip.errorflags}: ${ef}`, azione: cifratura ? 'Verificare chiave di cifratura' : 'Verificare', gravita: 'verificare' })
  }
  if (rip.perditaOre) out.push({ testo: `Perdita in corso da ${rip.perditaOre} ore`, azione: 'Verificare perdita', gravita: 'verificare' })
  if (rip.flagDispositivo) out.push({ testo: `Flag errore dispositivo: ${rip.flagDispositivo}`, azione: 'Verificare', gravita: 'verificare' })
  ;(rip.anomalie || []).forEach(a => {
    if (/^Perdita in corso|^Flag errore dispositivo/.test(a)) return
    const azione = /storico mensile non configurato/i.test(a) ? 'Riparametrizzare' : 'Verificare'
    out.push({ testo: a, azione, gravita: 'verificare' })
  })
  return out
}

// Gravità più alta tra i problemi di un dispositivo
export function gravitaMassima(problemi) {
  if (!problemi.length) return null
  return problemi.reduce((g, p) => (GRAVITA[p.gravita].ordine < GRAVITA[g].ordine ? p.gravita : g), problemi[0].gravita)
}

// Descrizione breve del dispositivo
export function descrizioneTipo(tipo) {
  return (TIPI[tipo] || TIPI.HCA).label
}

export { formatValore, isContatore }

// ─── Esportazione Excel delle letture ───────────────────────────────────────
// Rispetta i "Campi PDF" delle Impostazioni: le colonne nascoste lì non vengono esportate.
const CAMPI_PREDEFINITI = ['matricola', 'data_lettura', 'ora_lettura', 'valore_corrente', 'consumo_periodo', 'perdita',
  'storico_mensile', 'data_errore', 'errorflags', 'status', 'powerstatus', 'locale', 'proprietario', 'interno', 'piano', 'condominio']

export function campiVisibiliDaImpostazioni(impostazioni) {
  try {
    if (impostazioni?.campi_pdf) {
      const tutti = JSON.parse(impostazioni.campi_pdf)
      const vis = tutti.filter(c => c.visible).map(c => c.key)
      if (!tutti.some(c => c.key === 'consumo_periodo')) vis.push('consumo_periodo')
      if (!tutti.some(c => c.key === 'perdita')) vis.push('perdita')
      if (vis.length) return new Set(vis)
    }
  } catch (e) {}
  return new Set(CAMPI_PREDEFINITI)
}

function numero(v) {
  if (v === null || v === undefined || v === '') return ''
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? String(v) : n
}

// proprietariSelezionati: null = tutti gli utenti
export function costruisciFogliExcel(condominiData, campi, proprietariSelezionati = null) {
  const sel = proprietariSelezionati ? new Set(proprietariSelezionati) : null
  const dispositivi = elencaDispositivi(condominiData).filter(d => !sel || sel.has(d.unita.proprietario))

  // Colonne comuni di identificazione (ognuna legata a un campo delle Impostazioni)
  const anagrafica = [
    { campo: 'condominio',   titolo: 'Condominio', larghezza: 24, fn: d => d.cond.nome || '' },
    { campo: 'piano',        titolo: 'Piano',      larghezza: 12, fn: d => d.piano.nome || '' },
    { campo: 'interno',      titolo: 'Interno',    larghezza: 9,  fn: d => d.unita.interno || '' },
    { campo: 'proprietario', titolo: 'Utente',     larghezza: 22, fn: d => d.unita.proprietario || '' },
    { campo: 'locale',       titolo: 'Locale',     larghezza: 16, fn: d => d.rip.dbInfo?.locale || '' },
    { campo: 'matricola',    titolo: 'Matricola',  larghezza: 12, fn: d => d.rip.identnr || '' },
    { campo: null,           titolo: 'Dispositivo', larghezza: 18, fn: d => descrizioneTipo(d.rip.tipo) },
    { campo: null,           titolo: 'Unità',      larghezza: 8,  fn: d => d.rip.unita || unitaTipo(d.rip.tipo || 'HCA') },
  ].filter(c => !c.campo || campi.has(c.campo))

  const letture = [
    ...anagrafica,
    campi.has('data_lettura') && { titolo: 'Data lettura', larghezza: 12, fn: d => d.rip.nessuna_lettura ? '' : (d.rip.date || '') },
    campi.has('ora_lettura') && { titolo: 'Ora', larghezza: 9, fn: d => d.rip.nessuna_lettura ? '' : (d.rip.time || '') },
    campi.has('valore_corrente') && { titolo: 'Valore', larghezza: 12, fn: d => d.rip.nessuna_lettura ? '' : numero(d.rip.hca?.value) },
    campi.has('consumo_periodo') && { titolo: 'Consumo', larghezza: 12, fn: d => isContatore(d.rip.tipo) && d.rip.consumo ? numero(d.rip.consumo.valore) : '' },
    campi.has('consumo_periodo') && { titolo: 'Periodo consumo', larghezza: 16, fn: d => isContatore(d.rip.tipo) && d.rip.consumo ? (d.rip.consumo.dalMontaggio ? 'Dal montaggio' : d.rip.consumo.periodo) : '' },
    campi.has('perdita') && { titolo: 'Ore perdita', larghezza: 11, decimali: 0, fn: d => d.rip.perditaOre ? numero(d.rip.perditaOre) : '' },
    campi.has('status') && { titolo: 'Stato', larghezza: 40, fn: d => d.rip.nessuna_lettura ? 'Nessuna lettura' : (d.rip.status && d.rip.status !== '0' ? `${d.rip.status} — ${d.rip.statusDescr || ''}` : 'OK') },
    campi.has('errorflags') && { titolo: 'Errore XML', larghezza: 30, fn: d => d.rip.errorflags && d.rip.errorflags !== '0' ? `${d.rip.errorflags} — ${d.rip.errorflagsDescr || ''}` : '' },
    campi.has('data_errore') && { titolo: 'Data errore', larghezza: 12, fn: d => d.rip.errordate && !String(d.rip.errordate).includes('--') ? d.rip.errordate : '' },
    campi.has('powerstatus') && { titolo: 'Batteria', larghezza: 10, fn: d => d.rip.powerstatus || '' },
  ].filter(Boolean)

  const fogli = [{
    nome: 'Letture',
    colonne: letture.map(c => ({ titolo: c.titolo, larghezza: c.larghezza, decimali: c.decimali })),
    righe: dispositivi.map(d => letture.map(c => c.fn(d))),
  }]

  if (campi.has('storico_mensile')) {
    const righe = []
    dispositivi.forEach(d => (d.rip.nessuna_lettura ? [] : (d.rip.hcaStorico || [])).forEach(h => righe.push([
      ...anagrafica.map(c => c.fn(d)),
      h.dataCalcolata || h.data || '',
      numero(h.value),
      isContatore(d.rip.tipo) && h.consumoMese !== null && h.consumoMese !== undefined ? numero(h.consumoMese) : '',
    ])))
    fogli.push({
      nome: 'Storico mensile',
      colonne: [
        ...anagrafica.map(c => ({ titolo: c.titolo, larghezza: c.larghezza })),
        { titolo: 'Fine mese', larghezza: 11 }, { titolo: 'Valore', larghezza: 12 }, { titolo: 'Consumo mese', larghezza: 13 },
      ],
      righe,
    })
  }
  return { fogli, dispositivi: dispositivi.length }
}
