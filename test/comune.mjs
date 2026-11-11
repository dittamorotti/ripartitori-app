// Carica il parser dell'app (file ESM con estensione .js) e un DOMParser per Node
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { JSDOM } from 'jsdom'

const qui = path.dirname(fileURLToPath(import.meta.url))
export const CARTELLA_FIXTURES = path.join(qui, 'fixtures')
export const CARTELLA_ATTESI = path.join(qui, 'attesi')

globalThis.DOMParser = new JSDOM('').window.DOMParser

export async function caricaParser() {
  const sorgente = fs.readFileSync(path.join(qui, '..', 'src', 'renderer', 'utils', 'parserQundis.js'), 'utf8')
  const tmp = path.join(os.tmpdir(), `parserQundis_test_${process.pid}.mjs`)
  fs.writeFileSync(tmp, sorgente)
  const modulo = await import(pathToFileURL(tmp).href)
  return modulo
}

// Riassunto stabile di ogni dispositivo: è quello che il test confronta
export function riassunto(P, xml) {
  const r = P.parseQundisXml(xml)
  const dispositivi = {}
  for (const l of Object.values(r.lettureMap).sort((a, b) => a.identnr.localeCompare(b.identnr))) {
    dispositivi[l.identnr] = {
      tipo: l.tipo, unita: l.unita, data: l.date,
      valore: l.hca ? l.hca.value : null,
      consumo: l.consumo ? { valore: l.consumo.valore, periodo: l.consumo.periodo } : null,
      storico: (l.hcaStorico || []).map(h => [h.dataCalcolata, h.value, h.consumoMese ?? null]),
      annoPrecedente: l.hcaAgostoPrecedente ? [l.hcaAgostoPrecedente.dataCalcolata, l.hcaAgostoPrecedente.value] : null,
      riferimento: l.riferimento || null,
      status: l.status, statusDescr: l.statusDescr || null,
      anomalie: l.anomalie || [],
    }
  }
  return { versione: r.version, concentratore: r.concentratore, tipi: r.conteggioTipi, dispositivi }
}
