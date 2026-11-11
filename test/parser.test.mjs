// Test del parser XML QUNDIS sui file reali in test/fixtures.
// Confronta ogni lettura con i risultati attesi salvati in test/attesi.
// Se una modifica cambia una lettura, il test lo segnala.
// Dopo un cambiamento VOLUTO: npm run test:aggiorna
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { caricaParser, riassunto, CARTELLA_FIXTURES, CARTELLA_ATTESI } from './comune.mjs'

const P = await caricaParser()
const files = fs.readdirSync(CARTELLA_FIXTURES).filter(f => f.endsWith('.xml'))

for (const f of files) {
  test(`letture invariate: ${f}`, () => {
    const atteso = JSON.parse(fs.readFileSync(path.join(CARTELLA_ATTESI, f.replace(/\.xml$/, '.json')), 'utf8'))
    const ottenuto = riassunto(P, fs.readFileSync(path.join(CARTELLA_FIXTURES, f), 'utf8'))
    assert.deepEqual(ottenuto.tipi, atteso.tipi, 'numero di dispositivi per tipo')
    for (const [matricola, disp] of Object.entries(atteso.dispositivi)) {
      assert.deepEqual(ottenuto.dispositivi[matricola], disp, `dispositivo ${matricola}`)
    }
    assert.deepEqual(Object.keys(ottenuto.dispositivi), Object.keys(atteso.dispositivi), 'elenco matricole')
  })
}

test('status letto bit per bit (specifica XML, Tabella 2)', () => {
  assert.equal(P.descrizioneStatusTipo('0', 'HCA'), null)
  assert.equal(P.descrizioneStatusTipo('40', 'HCA'), 'Guasto dispositivo (Sostituire)')
  assert.equal(P.descrizioneStatusTipo('80', 'HCA'), 'Condizioni fuori range (Sostituire)')
  assert.equal(P.descrizioneStatusTipo('80', 'ACS'), 'Condizioni fuori range (Verificare)')
  assert.equal(P.descrizioneStatusTipo('120', 'CALORE'), 'Guasto dispositivo (Sostituire) + Condizioni fuori range (Verificare)')
  assert.equal(P.descrizioneStatusTipo('148', 'HCA'), 'Batteria scarica (Sostituire) + Comunicazione interrotta (temporanea) (Verificare ricezione radio)')
  assert.match(P.descrizioneStatusTipo('3', 'AFS'), /perdita/)
})

test('errorflags e signature', () => {
  assert.equal(P.descrizioneErrorFlags('0'), null)
  assert.equal(P.descrizioneErrorFlags('1'), 'Chiave di cifratura mancante')
  assert.equal(P.decodificaSignature('8192'), 'Nessuna cifratura')
  assert.equal(P.decodificaSignature('9536'), 'AES-128')
})

test('XML V1.2: storico dal registro 17, giornalieri ignorati', () => {
  const dp = (s, v, d) => `<datapoint><storagenr>${s}</storagenr><value>${v}</value><dimension>${d}</dimension></datapoint>`
  const xml = `<siemeca><siemeca-xml-version>1.2</siemeca-xml-version><communicator><serialnr>1</serialnr></communicator><network><measuredev><errorflags/><date>03.04.19</date><fixeddataheader><identnr>91031587</identnr><manufact>17555</manufact><version>53</version><devtype>8</devtype><status>0</status><signature>8192</signature></fixeddataheader>${dp(0, 700, 'H.C.A.')}${dp(1, '31.12.18', 'date')}${dp(1, 1234, 'H.C.A.')}${dp(9, '02.04.19', 'date')}${dp(9, 699, 'H.C.A.')}${dp(17, '31.03.19', 'date')}${dp(17, 654, 'H.C.A.')}${dp(18, '28.02.19', 'date')}${dp(18, 'x x x', 'H.C.A.')}${dp(19, '31.01.19', 'date')}${dp(19, 321, 'H.C.A.')}</measuredev></network></siemeca>`
  const l = P.parseQundisXml(xml).lettureMap['91031587']
  assert.deepEqual(l.riferimento, { data: '31.12.18', valore: '1234' })
  assert.deepEqual(l.hcaStorico.map(h => [h.storagenr, h.dataCalcolata]), [[17, '31.03.19'], [18, '28.02.19'], [19, '31.01.19']])
})
