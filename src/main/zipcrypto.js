// ─── Lettura di archivi ZIP, anche protetti da password ───────
// Supporta la cifratura ZIP "classica" (PKWARE / ZipCrypto) usata dai
// gateway QUNDIS, compressione deflate o nessuna, ed estensioni ZIP64.
// Nessuna dipendenza esterna: solo zlib di Node.
'use strict'

const zlib = require('zlib')

// ─── CRC32 ───────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32Byte(crc, b) {
  return (CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8)) >>> 0
}

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = crc32Byte(c, buf[i])
  return (c ^ 0xFFFFFFFF) >>> 0
}

// ─── Decifratura ZipCrypto ───────────────────────────────────
function creaChiavi(password) {
  const k = { k0: 0x12345678, k1: 0x23456789, k2: 0x34567890 }
  for (const b of Buffer.from(password, 'utf8')) aggiornaChiavi(k, b)
  return k
}

function aggiornaChiavi(k, b) {
  k.k0 = crc32Byte(k.k0, b)
  k.k1 = (k.k1 + (k.k0 & 0xFF)) >>> 0
  k.k1 = (Math.imul(k.k1, 134775813) + 1) >>> 0
  k.k2 = crc32Byte(k.k2, k.k1 >>> 24)
}

function decifra(k, dati) {
  const out = Buffer.allocUnsafe(dati.length)
  for (let i = 0; i < dati.length; i++) {
    const t = (k.k2 | 2) & 0xFFFF
    const c = dati[i] ^ ((Math.imul(t, t ^ 1) >>> 8) & 0xFF)
    aggiornaChiavi(k, c)
    out[i] = c
  }
  return out
}

// ─── Struttura dell'archivio ─────────────────────────────────
function trovaFineDirectory(buf) {
  const min = Math.max(0, buf.length - 65557)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i
  }
  throw new Error('Archivio ZIP non valido o danneggiato')
}

function leggiVociCentrali(buf) {
  const eocd = trovaFineDirectory(buf)
  let totale = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)

  // ZIP64: il record di fine directory a 64 bit precede quello classico
  if (offset === 0xFFFFFFFF || totale === 0xFFFF) {
    const loc = eocd - 20
    if (loc >= 0 && buf.readUInt32LE(loc) === 0x07064b50) {
      const z64 = Number(buf.readBigUInt64LE(loc + 8))
      if (buf.readUInt32LE(z64) === 0x06064b50) {
        totale = Number(buf.readBigUInt64LE(z64 + 32))
        offset = Number(buf.readBigUInt64LE(z64 + 48))
      }
    }
  }

  const voci = []
  let p = offset
  for (let i = 0; i < totale; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Directory centrale ZIP non valida')
    const flags = buf.readUInt16LE(p + 8)
    const metodo = buf.readUInt16LE(p + 10)
    const oraMod = buf.readUInt16LE(p + 12)
    const crc = buf.readUInt32LE(p + 16)
    let dimCompressa = buf.readUInt32LE(p + 20)
    let dimOriginale = buf.readUInt32LE(p + 24)
    const lunNome = buf.readUInt16LE(p + 28)
    const lunExtra = buf.readUInt16LE(p + 30)
    const lunCommento = buf.readUInt16LE(p + 32)
    let offsetLocale = buf.readUInt32LE(p + 42)
    const nome = buf.slice(p + 46, p + 46 + lunNome).toString(flags & 0x800 ? 'utf8' : 'latin1')

    // Campo extra ZIP64 (id 0x0001): contiene solo i valori che nel record sono 0xFFFFFFFF
    let e = p + 46 + lunNome
    const fineExtra = e + lunExtra
    while (e + 4 <= fineExtra) {
      const id = buf.readUInt16LE(e)
      const len = buf.readUInt16LE(e + 2)
      if (id === 0x0001) {
        let q = e + 4
        if (dimOriginale === 0xFFFFFFFF) { dimOriginale = Number(buf.readBigUInt64LE(q)); q += 8 }
        if (dimCompressa === 0xFFFFFFFF) { dimCompressa = Number(buf.readBigUInt64LE(q)); q += 8 }
        if (offsetLocale === 0xFFFFFFFF) { offsetLocale = Number(buf.readBigUInt64LE(q)); q += 8 }
      }
      e += 4 + len
    }

    voci.push({ nome, flags, metodo, oraMod, crc, dimCompressa, dimOriginale, offsetLocale })
    p = fineExtra + lunCommento
  }
  return voci
}

function estraiVoce(buf, voce, password) {
  const h = voce.offsetLocale
  if (buf.readUInt32LE(h) !== 0x04034b50) throw new Error(`Intestazione non valida per ${voce.nome}`)
  const inizio = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28)
  let dati = buf.slice(inizio, inizio + voce.dimCompressa)

  if (voce.flags & 0x41) {
    // bit 6 = cifratura forte, oppure metodo 99 = AES: non supportati
    if (voce.flags & 0x40 || voce.metodo === 99) {
      throw new Error(`${voce.nome}: cifratura AES non supportata`)
    }
    if (!password) throw new Error(`${voce.nome}: archivio protetto, manca la password`)
    const k = creaChiavi(password)
    const testa = decifra(k, dati.slice(0, 12))
    // Byte di controllo: dall'ora di modifica se c'è il data descriptor, altrimenti dal CRC
    const atteso = voce.flags & 0x08 ? (voce.oraMod >>> 8) & 0xFF : (voce.crc >>> 24) & 0xFF
    if (testa[11] !== atteso) throw new Error('Password dello ZIP errata')
    dati = decifra(k, dati.slice(12))
  }

  let contenuto
  if (voce.metodo === 0) contenuto = dati
  else if (voce.metodo === 8) {
    try { contenuto = zlib.inflateRawSync(dati) }
    catch { throw new Error(`${voce.nome}: password errata o file danneggiato`) }
  } else throw new Error(`${voce.nome}: metodo di compressione ${voce.metodo} non supportato`)

  if (crc32(contenuto) !== voce.crc) throw new Error(`${voce.nome}: password errata o file danneggiato (CRC)`)
  return contenuto
}

/**
 * Estrae tutti i file di un archivio ZIP.
 * @param {Buffer} buf contenuto dello zip
 * @param {string} [password] password per gli archivi cifrati
 * @returns {{ nome: string, dati: Buffer }[]}
 */
function estraiZip(buf, password) {
  return leggiVociCentrali(buf)
    .filter(v => !v.nome.endsWith('/'))
    .map(v => ({ nome: v.nome.split('/').pop(), dati: estraiVoce(buf, v, password) }))
}

module.exports = { estraiZip, crc32 }
