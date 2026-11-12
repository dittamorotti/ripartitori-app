// ─── Modello email per l'invio delle letture agli amministratori ───
// I segnaposto tra graffe vengono sostituiti con i dati del condominio.

export const SEGNAPOSTI = [
  { chiave: 'amministratore', descr: 'Nome dell\'amministratore (o dei due)' },
  { chiave: 'condominio', descr: 'Nome del condominio' },
  { chiave: 'indirizzo', descr: 'Indirizzo del condominio' },
  { chiave: 'citta', descr: 'Città del condominio' },
  { chiave: 'data_lettura', descr: 'Data della lettura (gg/mm/aaaa)' },
  { chiave: 'anno', descr: 'Anno della lettura' },
  { chiave: 'tipo_letture', descr: 'Es. "ripartitori di calore e contatori acqua"' },
  { chiave: 'numero_dispositivi', descr: 'Quanti dispositivi ci sono nei file' },
  { chiave: 'numero_utenti', descr: 'Quante unità/utenti ci sono nei file' },
  { chiave: 'allegati', descr: 'Elenco dei file allegati' },
]

export const MODELLO_PREDEFINITO = {
  oggetto: 'Letture {condominio} del {data_lettura}',
  testo: 'Gentile {amministratore},\n\nin allegato le letture del condominio {condominio} rilevate il {data_lettura}.\n\nCordiali saluti',
  cc: '',
}

export function leggiModello(impostazioni = {}) {
  return {
    oggetto: impostazioni.email_amm_oggetto ?? MODELLO_PREDEFINITO.oggetto,
    testo: impostazioni.email_amm_testo ?? MODELLO_PREDEFINITO.testo,
    cc: impostazioni.email_amm_cc ?? MODELLO_PREDEFINITO.cc,
  }
}

export function dataItalianaDaIso(iso) {
  if (!iso) return ''
  const [a, m, g] = String(iso).slice(0, 10).split('-')
  return g && m && a ? `${g}/${m}/${a}` : String(iso)
}

const NOMI_TIPI = {
  HCA: 'ripartitori di calore',
  CALORE: 'contabilizzatori di calore',
  FREDDO: 'contabilizzatori di raffrescamento',
  ACS: 'contatori acqua calda',
  AFS: 'contatori acqua fredda',
}

export function descriviTipi(tipi) {
  const nomi = [...new Set(tipi.filter(Boolean))].map(t => NOMI_TIPI[t] || t)
  if (nomi.length <= 1) return nomi[0] || 'ripartitori di calore'
  return nomi.slice(0, -1).join(', ') + ' e ' + nomi[nomi.length - 1]
}

/** Elenco dei nomi in forma leggibile: "Rossi", "Rossi e Bianchi" */
export function elencoNomi(nomi) {
  const n = nomi.filter(Boolean)
  if (n.length <= 1) return n[0] || ''
  return n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1]
}

/** Sostituisce i segnaposto; quelli sconosciuti restano com'erano. */
export function compilaModello(testo, dati) {
  return String(testo || '').replace(/\{([a-z_]+)\}/g, (tutto, chiave) =>
    dati[chiave] !== undefined && dati[chiave] !== null ? String(dati[chiave]) : tutto)
}

/**
 * Dati per i segnaposto.
 * @param {object} p { condominio, amministratori, dataLettura, tipi, numeroDispositivi, numeroUtenti, allegati }
 */
export function datiSegnaposto({ condominio = {}, amministratori = [], dataLettura = '', tipi = [], numeroDispositivi = 0, numeroUtenti = 0, allegati = [] }) {
  return {
    amministratore: elencoNomi(amministratori.map(a => a.nome)),
    condominio: condominio.nome || '',
    indirizzo: condominio.indirizzo || '',
    citta: condominio.citta || '',
    data_lettura: dataItalianaDaIso(dataLettura),
    anno: String(dataLettura || '').slice(0, 4),
    tipo_letture: descriviTipi(tipi),
    numero_dispositivi: numeroDispositivi,
    numero_utenti: numeroUtenti,
    allegati: allegati.join(', '),
  }
}
