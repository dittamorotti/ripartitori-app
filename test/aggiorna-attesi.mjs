// Rigenera i risultati attesi dei test dai file in test/fixtures.
// Da usare SOLO dopo aver verificato che le nuove letture sono corrette.
import fs from 'fs'
import path from 'path'
import { caricaParser, riassunto, CARTELLA_FIXTURES, CARTELLA_ATTESI } from './comune.mjs'

const P = await caricaParser()
fs.mkdirSync(CARTELLA_ATTESI, { recursive: true })
for (const f of fs.readdirSync(CARTELLA_FIXTURES).filter(f => f.endsWith('.xml'))) {
  const r = riassunto(P, fs.readFileSync(path.join(CARTELLA_FIXTURES, f), 'utf8'))
  fs.writeFileSync(path.join(CARTELLA_ATTESI, f.replace(/\.xml$/, '.json')), JSON.stringify(r, null, 1))
  console.log(`✓ ${f}: ${Object.keys(r.dispositivi).length} dispositivi`)
}
