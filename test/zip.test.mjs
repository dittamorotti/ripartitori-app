// Test dell'apertura degli zip cifrati inviati dal gateway QUNDIS via email.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const { estraiZip } = require('../src/main/zipcrypto.js')
const QUI = path.dirname(fileURLToPath(import.meta.url))
const ZIP = fs.readFileSync(path.join(QUI, 'fixtures', 'email_11350128.zip'))

test('zip del gateway: estrae XML e report con la password giusta', () => {
  const files = estraiZip(ZIP, '123456789')
  assert.deepEqual(files.map(f => f.nome.split('.').pop()).sort(), ['html', 'xml'])
  const xml = files.find(f => f.nome.endsWith('.xml')).dati.toString('utf8')
  assert.match(xml, /<serialnr>11350128<\/serialnr>/)
  assert.equal((xml.match(/<measuredev /g) || []).length, 42)
})

test('zip del gateway: password errata o mancante', () => {
  assert.throws(() => estraiZip(ZIP, 'sbagliata'), /Password dello ZIP errata/)
  assert.throws(() => estraiZip(ZIP, ''), /manca la password/)
})
