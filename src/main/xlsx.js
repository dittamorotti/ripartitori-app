// ─── Scrittura file Excel (.xlsx) senza librerie esterne ────────────────────
// Un .xlsx è un archivio ZIP di file XML (Office Open XML).
// Supporta: più fogli, intestazione in grassetto, larghezza colonne,
// riga bloccata in alto, filtro automatico, numeri e testi.

const zlib = require('zlib')

// ─── CRC32 (richiesto dal formato ZIP) ──────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// ─── Archivio ZIP (deflate) ─────────────────────────────────
function creaZip(files) {
  const locali = []
  const centrali = []
  let offset = 0
  const ora = new Date()
  const dosTime = ((ora.getHours() << 11) | (ora.getMinutes() << 5) | (ora.getSeconds() >> 1)) & 0xFFFF
  const dosDate = (((ora.getFullYear() - 1980) << 9) | ((ora.getMonth() + 1) << 5) | ora.getDate()) & 0xFFFF
  for (const f of files) {
    const nome = Buffer.from(f.nome, 'utf8')
    const dati = Buffer.isBuffer(f.dati) ? f.dati : Buffer.from(f.dati, 'utf8')
    const compressi = zlib.deflateRawSync(dati)
    const crc = crc32(dati)
    const loc = Buffer.alloc(30)
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6)
    loc.writeUInt16LE(8, 8); loc.writeUInt16LE(dosTime, 10); loc.writeUInt16LE(dosDate, 12)
    loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(compressi.length, 18); loc.writeUInt32LE(dati.length, 22)
    loc.writeUInt16LE(nome.length, 26); loc.writeUInt16LE(0, 28)
    locali.push(loc, nome, compressi)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8)
    cen.writeUInt16LE(8, 10); cen.writeUInt16LE(dosTime, 12); cen.writeUInt16LE(dosDate, 14)
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(compressi.length, 20); cen.writeUInt32LE(dati.length, 24)
    cen.writeUInt16LE(nome.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32)
    cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36); cen.writeUInt32LE(0, 38); cen.writeUInt32LE(offset, 42)
    centrali.push(cen, nome)
    offset += loc.length + nome.length + compressi.length
  }
  const centrale = Buffer.concat(centrali)
  const fine = Buffer.alloc(22)
  fine.writeUInt32LE(0x06054b50, 0); fine.writeUInt16LE(0, 4); fine.writeUInt16LE(0, 6)
  fine.writeUInt16LE(files.length, 8); fine.writeUInt16LE(files.length, 10)
  fine.writeUInt32LE(centrale.length, 12); fine.writeUInt32LE(offset, 16); fine.writeUInt16LE(0, 20)
  return Buffer.concat([...locali, centrale, fine])
}

// ─── XML del foglio ─────────────────────────────────────────
function esc(v) {
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // caratteri di controllo non ammessi in XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}
function colonnaLettera(i) {
  let s = ''
  i++
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) }
  return s
}
function cella(ref, v, stile) {
  const s = stile ? ` s="${stile}"` : ''
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(v)}</t></is></c>`
}
function xmlFoglio(foglio) {
  const colonne = foglio.colonne || []
  const righe = foglio.righe || []
  const ultimaCol = colonnaLettera(Math.max(colonne.length, 1) - 1)
  const cols = colonne.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.larghezza || 14}" customWidth="1"/>`).join('')
  const intest = `<row r="1">${colonne.map((c, i) => cella(`${colonnaLettera(i)}1`, c.titolo, 1)).join('')}</row>`
  const corpo = righe.map((riga, r) =>
    `<row r="${r + 2}">${riga.map((v, i) => cella(`${colonnaLettera(i)}${r + 2}`, v, (typeof v === 'number' && colonne[i]?.decimali !== undefined) ? (colonne[i].decimali === 0 ? 2 : 3) : 0)).join('')}</row>`
  ).join('')
  const filtro = righe.length > 0 ? `<autoFilter ref="A1:${ultimaCol}${righe.length + 1}"/>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols ? `<cols>${cols}</cols>` : ''}
<sheetData>${intest}${corpo}</sheetData>
${filtro}
</worksheet>`
}

// Stili: 0 normale, 1 intestazione (grassetto, sfondo), 2 numero intero, 3 numero con 3 decimali
const STILI = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.000"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

// Nome foglio valido per Excel (max 31 caratteri, senza : \ / ? * [ ])
function nomeFoglio(n, usati) {
  let base = String(n || 'Foglio').replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Foglio'
  let nome = base, k = 2
  while (usati.has(nome.toLowerCase())) { nome = `${base.slice(0, 28)} ${k++}` }
  usati.add(nome.toLowerCase())
  return nome
}

// fogli: [{ nome, colonne: [{ titolo, larghezza, decimali }], righe: [[...]] }]
function creaXlsx(fogli) {
  const usati = new Set()
  const nomi = fogli.map(f => nomeFoglio(f.nome, usati))
  const files = [
    { nome: '[Content_Types].xml', dati: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>` },
    { nome: '_rels/.rels', dati: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
    { nome: 'xl/workbook.xml', dati: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nomi.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
${fogli.some(f => (f.righe || []).length) ? `<definedNames>${fogli.map((f, i) => (f.righe || []).length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(nomi[i]).replace(/'/g, "''")}'!$A$1:$${colonnaLettera(Math.max((f.colonne || []).length, 1) - 1)}$${f.righe.length + 1}</definedName>` : '').join('')}</definedNames>` : ''}
</workbook>` },
    { nome: 'xl/_rels/workbook.xml.rels', dati: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
    { nome: 'xl/styles.xml', dati: STILI },
    ...fogli.map((f, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dati: xmlFoglio(f) })),
  ]
  return creaZip(files)
}

module.exports = { creaXlsx }
