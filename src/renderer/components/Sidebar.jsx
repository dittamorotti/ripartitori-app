import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Building2, ChevronRight, ChevronDown, Layers, User, Flame, Plus, Trash2, Pencil, Upload, FileUp, Search, X } from 'lucide-react'
import { toast } from 'sonner'

function ModalConferma({ messaggio, onConferma, onAnnulla }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }}>
      <div style={{
        background: 'rgba(14,14,30,0.97)', backdropFilter: 'blur(20px)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '16px',
        padding: '24px', width: '340px', boxShadow: '0 0 40px rgba(239,68,68,0.06), 0 20px 60px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontSize: '18px', marginBottom: '8px' }}>⚠️</div>
        <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '10px' }}>Conferma eliminazione</div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '24px' }}>{messaggio}</div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onAnnulla} style={{
            flex: 1, padding: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '13px',
          }}>Annulla</button>
          <button onClick={onConferma} style={{
            flex: 1, padding: '9px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '10px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
          }}>Elimina</button>
        </div>
      </div>
    </div>
  )
}

function ModalInput({ title, fields, initialValues = {}, onConfirm, onCancel }) {
  const { register, handleSubmit, formState: { errors, isValid } } = useForm({
    defaultValues: initialValues,
    mode: 'onChange',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'rgba(14,14,30,0.97)', backdropFilter: 'blur(20px)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '16px',
        padding: '24px', width: '360px', boxShadow: '0 0 40px rgba(99,102,241,0.06), 0 20px 60px rgba(0,0,0,0.8)',
      }}>
        <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '20px' }}>{title}</div>
        {fields.map(f => {
          const err = errors[f.key]
          return (
            <div key={f.key} style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', color: err ? '#f87171' : 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                {f.label}
                {f.required && <span style={{ color: '#f87171' }}>*</span>}
              </label>
              <input
                type="text"
                placeholder={f.placeholder || ''}
                {...register(f.key, {
                  required: f.required ? (f.requiredMsg || 'Campo obbligatorio') : false,
                  pattern: f.pattern ? { value: f.pattern, message: f.patternMsg || 'Formato non valido' } : undefined,
                  minLength: f.minLength ? { value: f.minLength, message: `Minimo ${f.minLength} caratteri` } : undefined,
                })}
                style={{
                  width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${err ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '10px', color: '#fff',
                  fontSize: '13px', outline: 'none',
                  transition: 'border-color 0.15s',
                }}
              />
              {err && (
                <div style={{ fontSize: '11px', color: '#f87171', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ⚠ {err.message}
                </div>
              )}
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button type="button" onClick={onCancel} style={{
            flex: 1, padding: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '13px',
          }}>Annulla</button>
          <button
            type="button"
            onClick={handleSubmit(onConfirm)}
            disabled={!isValid}
            style={{
              flex: 1, padding: '9px',
              background: isValid ? 'linear-gradient(135deg, #6366f1, #7c3aed)' : 'rgba(99,102,241,0.1)',
              border: isValid ? '1px solid rgba(139,92,246,0.35)' : '1px solid rgba(99,102,241,0.1)', borderRadius: '10px',
              color: isValid ? '#fff' : 'rgba(255,255,255,0.2)',
              cursor: isValid ? 'pointer' : 'not-allowed',
              fontSize: '13px', fontWeight: '600',
              transition: 'all 0.15s',
              boxShadow: isValid ? '0 4px 14px rgba(99,102,241,0.25)' : 'none',
            }}
          >Salva</button>
        </div>
      </div>
    </div>
  )
}

function TreeNode({ icon: Icon, iconColor, label, sublabel, depth = 0, children, onAdd, onEdit, onDelete, addLabel, onClick, selected }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const hasChildren = React.Children.count(children) > 0

  return (
    <div>
      <div
        onClick={() => { setOpen(o => !o); onClick && onClick() }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: `6px 10px 6px ${10 + depth * 12}px`,
          cursor: 'pointer',
          background: selected ? 'rgba(99,102,241,0.15)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
          borderRadius: '8px', margin: '1px 6px',
          borderLeft: 'none',
          transition: 'background 0.15s',
        }}
      >
        {hasChildren
          ? (open ? <ChevronDown size={12} color='rgba(255,255,255,0.25)' /> : <ChevronRight size={12} color='rgba(255,255,255,0.25)' />)
          : <span style={{ width: 12 }} />
        }
        <Icon size={14} color={selected ? '#818cf8' : (iconColor || '#6b6b8a')} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', color: selected ? '#c7d2fe' : 'rgba(255,255,255,0.65)', fontWeight: selected ? '500' : '400', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
          </div>
          {sublabel && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>{sublabel}</div>}
        </div>
        {hovered && (
          <div style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
            {onAdd && (
              <button onClick={onAdd} title={addLabel} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '3px 4px', color: '#818cf8', borderRadius: '4px', opacity: 0.8,
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(129,140,248,0.15)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              ><Plus size={12} /></button>
            )}
            {onEdit && (
              <button onClick={onEdit} title="Modifica" style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '3px 4px', color: '#a0a0c0', borderRadius: '4px', opacity: 0.8,
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(160,160,192,0.15)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              ><Pencil size={12} /></button>
            )}
            {onDelete && (
              <button onClick={onDelete} title="Elimina" style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '3px 4px', color: '#f87171', borderRadius: '4px', opacity: 0.8,
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.15)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              ><Trash2 size={12} /></button>
            )}
          </div>
        )}
      </div>
      {open && children}
    </div>
  )
}

export default function Sidebar({ selectedNode, onSelect, onPatchAnagrafica }) {
  const [condomini, setCondomini] = useState([])
  const [piani, setPiani] = useState({})
  const [unita, setUnita] = useState({})
  const [ripartitori, setRipartitori] = useState({})
  const [modal, setModal] = useState(null)
  const [conferma, setConferma] = useState(null)
  const [modalDeleteCond, setModalDeleteCond] = useState(null)
  const [cercaCond, setCercaCond] = useState('')

  useEffect(() => { loadCondomini() }, [])

  async function loadCondomini() {
    const data = await window.api.getCondomini()
    setCondomini(data)
  }

  async function loadPiani(condominioId) {
    const data = await window.api.getPiani(condominioId)
    setPiani(p => ({ ...p, [condominioId]: data }))
  }

  async function loadUnita(pianoId) {
    const data = await window.api.getUnita(pianoId)
    setUnita(u => ({ ...u, [pianoId]: data }))
  }

  async function loadRipartitori(unitaId) {
    const data = await window.api.getRipartitori(unitaId)
    setRipartitori(r => ({ ...r, [unitaId]: data }))
  }

  function openAdd(type, extra) {
    setModal({ mode: 'add', type, ...extra })
  }

  function openEdit(type, data, extra) {
    setModal({ mode: 'edit', type, data, ...extra })
  }

  function openDelete(messaggio, onConferma) {
    setConferma({ messaggio, onConferma })
  }

  // Ricava il condominioId corrente dal modal o dal nodo selezionato
  function getCondominioIdDaModal(type, data, extra) {
    if (type === 'condominio') return data?.id || extra?.condominioId
    if (type === 'piano') return data?.condominio_id || extra?.condominioId
    if (type === 'unita') return extra?.condominioId || selectedNode?.data?.condominio_id || selectedNode?.data?.id
    if (type === 'ripartitore') return extra?.condominioId || selectedNode?.data?.condominio_id || selectedNode?.data?.id
    return null
  }

  async function openDeleteCondominio(cond) {
    const archivioPath = await window.api.getArchivioPath()
    setModalDeleteCond({ cond, hasArchivio: !!archivioPath })
  }

  async function eseguiDeleteCondominio(cond, eliminaArchivio) {
    await window.api.deleteCondominio({ id: cond.id, eliminaArchivio })
    await loadCondomini()
    setModalDeleteCond(null)
    onPatchAnagrafica && onPatchAnagrafica('reload', cond.id, null)
    toast.success(`Condominio "${cond.nome}" eliminato`)
  }

  async function importCsv() {
    try {
      const selectedPath = await window.api.openFileDialog([{ name: 'CSV Files', extensions: ['csv'] }])
      if (!selectedPath) return

      const fileResult = await window.api.readFile(selectedPath)
      if (!fileResult.success) throw new Error(fileResult.error)

      const text = fileResult.content
      const nomeFile = selectedPath.split('\\').pop().split('/').pop()
      const nomeCondominio = nomeFile.replace('.csv', '').replace(/_/g, ' ')

      const righe = text.split('\n')
        .slice(1)
        .filter(r => r.trim() !== '')
        .map(r => {
          const col = r.split(';')
          return {
            matricola:    col[1]?.trim() || '',
            locale:       col[2]?.trim() || '',
            indirizzo:    col[3]?.trim() || '',
            piano:        col[4]?.trim() || '',
            proprietario: col[5]?.trim() || '',
            inquilino:    col[6]?.trim() || '',
            citta:        col[7]?.trim() || '',
          }
        })
        .filter(r => r.matricola !== '')

      const result = await window.api.importCsv({ nomeCondominio, righe })

      if (result.success) {
        await loadCondomini()
        toast.success(`Importazione completata! ${righe.length} ripartitori importati in ${nomeCondominio}`)
      } else {
        toast.error('Errore importazione: ' + result.error)
      }
    } catch (err) {
      toast.error('Errore: ' + err.message)
    }
  }

  async function importAhw() {
    try {
      const selectedPath = await window.api.openFileDialog([{ name: 'AHW Files', extensions: ['ahw', 'AHW'] }])
      if (!selectedPath) return

      const fileResult = await window.api.readFile(selectedPath)
      if (!fileResult.success) throw new Error(fileResult.error)

      const text = fileResult.content
      const nomeFile = selectedPath.split('\\').pop().split('/').pop()
      const nomeCondominio = nomeFile.replace(/\.ahw$/i, '').replace(/_/g, ' ')

      const mapPiano = {
        '1': 'Piano Primo',
        '2': 'Piano Secondo',
        '3': 'Piano Terzo',
        '4': 'Piano Quarto',
        '5': 'Piano Quinto',
        '6': 'Piano Sesto',
        '7': 'Piano Settimo',
        '8': 'Piano Ottavo',
        '9': 'Piano Nono',
      }

      function parseName(name) {
        if (!name) return { piano: 'Piano Non Specificato', interno: '', proprietario: '' }
        const trimmed = name.trim()

        // Pattern NX - Nome  oppure  NX Nome (con o senza trattino) → Piano Terra
        const matchN = trimmed.match(/^N(\d+)\s*(?:-\s*)?(.+)$/)
        if (matchN) {
          return {
            piano: 'Piano Terra',
            interno: matchN[1],
            proprietario: matchN[2].trim()
          }
        }

        // Pattern XAB - Nome  oppure  XAB Nome (con o senza trattino) → numero=piano, lettere=interno
        const matchNumLet = trimmed.match(/^(\d+)([A-Za-z]+)\s*(?:-\s*)?(.+)$/)
        if (matchNumLet) {
          return {
            piano: mapPiano[matchNumLet[1]] || `Piano ${matchNumLet[1]}`,
            interno: matchNumLet[2].toUpperCase(),
            proprietario: matchNumLet[3].trim()
          }
        }

        // Pattern X - Nome  oppure  X Nome (con o senza trattino) → solo numero=piano
        const matchSoloNum = trimmed.match(/^(\d+)\s*(?:-\s*)?(.+)$/)
        if (matchSoloNum) {
          return {
            piano: mapPiano[matchSoloNum[1]] || `Piano ${matchSoloNum[1]}`,
            interno: '',
            proprietario: matchSoloNum[2].trim()
          }
        }

        return { piano: 'Piano Non Specificato', interno: '', proprietario: trimmed }
      }

      const righe = text.split('\n')
        .slice(1)
        .filter(r => r.trim() !== '')
        .map(r => {
          const cleaned = r.replace(/^"|"$/g, '').replace(/\r$/, '')
          const col = cleaned.split(';')
          return {
            name:      col[2]?.trim() || '',
            citta:     col[4]?.trim() || '',
            locale:    col[7]?.trim() || '',
            matricola: col[23]?.trim() || '',
          }
        })
        .filter(r => r.matricola !== '')

      const righeConvertite = righe.map(r => {
        const parsed = parseName(r.name)
        return {
          matricola:    r.matricola,
          locale:       r.locale,
          indirizzo:    '',
          piano:        parsed.piano,
          proprietario: parsed.proprietario,
          inquilino:    '',
          citta:        r.citta,
          interno:      parsed.interno,
        }
      })

      if (righeConvertite.length === 0) {
        toast.warning('Nessun ripartitore trovato nel file AHW')
        return
      }

      const result = await window.api.importCsv({ nomeCondominio, righe: righeConvertite })

      if (result.success) {
        await loadCondomini()
        toast.success(`Importazione AHW completata! ${righeConvertite.length} ripartitori importati in ${nomeCondominio}`)
      } else {
        toast.error('Errore importazione: ' + result.error)
      }
    } catch (err) {
      toast.error('Errore: ' + err.message)
    }
  }

  async function handleConfirm(values) {
    const { mode, type, data, condominioId, pianoId, unitaId } = modal
    try {
      const labelTipo = { condominio: 'Condominio', piano: 'Piano', unita: 'Unità', ripartitore: 'Ripartitore' }[type] || type
      if (mode === 'add') {
        if (type === 'condominio') {
          await window.api.addCondominio(values)
          await loadCondomini()
        } else if (type === 'piano') {
          await window.api.addPiano({ condominio_id: condominioId, nome: values.nome })
          await loadPiani(condominioId)
          onPatchAnagrafica && onPatchAnagrafica('reload', condominioId, null)
        } else if (type === 'unita') {
          await window.api.addUnita({ piano_id: pianoId, ...values })
          await loadUnita(pianoId)
          onPatchAnagrafica && onPatchAnagrafica('reload', condominioId, null)
        } else if (type === 'ripartitore') {
          await window.api.addRipartitore({ unita_id: unitaId, ...values })
          await loadRipartitori(unitaId)
          onPatchAnagrafica && onPatchAnagrafica('reload', condominioId, null)
        }
        toast.success(`${labelTipo} aggiunto`)
      } else if (mode === 'edit') {
        if (type === 'condominio') {
          await window.api.updateCondominio({ ...data, ...values })
          await loadCondomini()
          onPatchAnagrafica && onPatchAnagrafica('condominio', data.id, values)
        } else if (type === 'piano') {
          await window.api.updatePiano({ ...data, ...values })
          await loadPiani(data.condominio_id)
          onPatchAnagrafica && onPatchAnagrafica('piano', data.id, values)
        } else if (type === 'unita') {
          await window.api.updateUnita({ ...data, ...values })
          await loadUnita(data.piano_id)
          onPatchAnagrafica && onPatchAnagrafica('unita', data.id, values)
        } else if (type === 'ripartitore') {
          await window.api.updateRipartitore({ ...data, ...values })
          await loadRipartitori(data.unita_id)
          onPatchAnagrafica && onPatchAnagrafica('ripartitore', data.id, values)
        }
        toast.success(`${labelTipo} aggiornato`)
      }
    } catch (err) {
      console.error('Errore:', err)
      toast.error('Errore: ' + err.message)
    }
    setModal(null)
  }

  const modalConfigs = {
    condominio: {
      addTitle: 'Nuovo condominio',
      editTitle: 'Modifica condominio',
      fields: [
        { key: 'nome', label: 'Nome', placeholder: 'Es. Condominio Miranda', required: true, requiredMsg: 'Il nome del condominio è obbligatorio' },
        { key: 'indirizzo', label: 'Indirizzo', placeholder: 'Via Roma 1' },
        { key: 'citta', label: 'Città', placeholder: 'Milano' },
        { key: 'note', label: 'Note', placeholder: 'Opzionale' },
      ]
    },
    piano: {
      addTitle: 'Nuovo piano',
      editTitle: 'Modifica piano',
      fields: [
        { key: 'nome', label: 'Nome piano', placeholder: 'Es. Piano Primo', required: true, requiredMsg: 'Il nome del piano è obbligatorio' },
      ]
    },
    unita: {
      addTitle: 'Nuova unità abitativa',
      editTitle: 'Modifica unità abitativa',
      fields: [
        { key: 'interno', label: 'Interno', placeholder: 'Es. Int. 3' },
        { key: 'proprietario', label: 'Proprietario', placeholder: 'Mario Rossi', required: true, requiredMsg: 'Il proprietario è obbligatorio' },
        { key: 'note', label: 'Note', placeholder: 'Opzionale' },
      ]
    },
    ripartitore: {
      addTitle: 'Nuovo ripartitore',
      editTitle: 'Modifica ripartitore',
      fields: [
        { key: 'matricola', label: 'Matricola (identnr)', placeholder: 'Es. 65943904', required: true, requiredMsg: 'La matricola è obbligatoria', minLength: 4 },
        { key: 'locale', label: 'Locale', placeholder: 'Es. Soggiorno', required: true, requiredMsg: 'Il locale è obbligatorio' },
        { key: 'note', label: 'Note', placeholder: 'Opzionale' },
      ]
    },
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 4px' }}>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Condomini</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => openAdd('condominio')}
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.18)', cursor: 'pointer', color: '#818cf8', padding: '4px 6px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
            title="Aggiungi condominio manualmente"
          ><Plus size={14} /></button>
          <button onClick={importCsv}
            style={{ background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.18)', cursor: 'pointer', color: '#4ade80', padding: '4px 6px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
            title="Importa da CSV (QUNDIS)"
          ><Upload size={14} /></button>
          <button onClick={importAhw}
            style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.18)', cursor: 'pointer', color: '#fbbf24', padding: '4px 6px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
            title="Importa da AHW"
          ><FileUp size={14} /></button>
        </div>
      </div>


      {/* Barra ricerca condomini */}
      <div style={{ position: 'relative', margin: '6px 10px 4px' }}>
        <div style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <Search size={12} color="rgba(255,255,255,0.25)" />
        </div>
        <input
          type="text"
          value={cercaCond}
          onChange={e => setCercaCond(e.target.value)}
          placeholder="Cerca condominio..."
          style={{
            width: '100%', padding: '7px 28px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.7)',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        {cercaCond && (
          <button onClick={() => setCercaCond('')} style={{
            position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
            color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center',
          }}>
            <X size={11} />
          </button>
        )}
      </div>

      {cercaCond.trim() !== '' && condomini.filter(c =>
        c.nome.toLowerCase().includes(cercaCond.toLowerCase()) ||
        (c.citta || '').toLowerCase().includes(cercaCond.toLowerCase()) ||
        (c.indirizzo || '').toLowerCase().includes(cercaCond.toLowerCase())
      ).length === 0 && (
        <div style={{ padding: '12px 16px', fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
          Nessun condominio trovato
        </div>
      )}

      {condomini.length === 0 && (
        <div style={{ padding: '20px 16px', fontSize: '12px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
          Nessun condominio.<br />Clicca + per aggiungerne uno.
        </div>
      )}

      {condomini.filter(c => {
        if (!cercaCond.trim()) return true
        const q = cercaCond.toLowerCase()
        return c.nome.toLowerCase().includes(q) ||
          (c.citta || '').toLowerCase().includes(q) ||
          (c.indirizzo || '').toLowerCase().includes(q)
      }).map(c => (
        <TreeNode key={c.id} icon={Building2} iconColor="#4ade80" label={c.nome} sublabel={c.citta}
          onAdd={() => openAdd('piano', { condominioId: c.id })}
          addLabel="Aggiungi piano"
          onEdit={() => openEdit('condominio', c)}
          onDelete={() => openDeleteCondominio(c)}
          onClick={() => { loadPiani(c.id); onSelect({ type: 'condominio', data: c }) }}
          selected={selectedNode?.type === 'condominio' && selectedNode?.data?.id === c.id}
        >
          {(piani[c.id] || []).map(p => (
            <TreeNode key={p.id} icon={Layers} iconColor="#f59e0b" label={p.nome} depth={1}
              onAdd={() => openAdd('unita', { pianoId: p.id, condominioId: c.id })}
              addLabel="Aggiungi unità"
              onEdit={() => openEdit('piano', p, { condominioId: c.id })}
              onDelete={() => openDelete(
                `Sei sicuro di voler eliminare il piano "${p.nome}"? Verranno eliminate anche tutte le unità e i ripartitori associati.`,
                async () => { await window.api.deletePiano(p.id); await loadPiani(c.id); setConferma(null); onPatchAnagrafica && onPatchAnagrafica('reload', c.id, null); toast.success('Piano eliminato') }
              )}
              onClick={() => { loadUnita(p.id); onSelect({ type: 'piano', data: p }) }}
              selected={selectedNode?.type === 'piano' && selectedNode?.data?.id === p.id}
            >
              {(unita[p.id] || []).map(u => (
                <TreeNode key={u.id} icon={User} iconColor="#60a5fa" label={u.proprietario || u.interno} sublabel={u.interno} depth={2}
                  onAdd={() => openAdd('ripartitore', { unitaId: u.id, condominioId: c.id })}
                  addLabel="Aggiungi ripartitore"
                  onEdit={() => openEdit('unita', u, { pianoId: p.id, condominioId: c.id })}
                  onDelete={() => openDelete(
                    `Sei sicuro di voler eliminare l'unità "${u.proprietario || u.interno}"? Verranno eliminati anche tutti i ripartitori associati.`,
                    async () => { await window.api.deleteUnita(u.id); await loadUnita(p.id); setConferma(null); onPatchAnagrafica && onPatchAnagrafica('reload', c.id, null); toast.success('Unità eliminata') }
                  )}
                  onClick={() => { loadRipartitori(u.id); onSelect({ type: 'unita', data: u }) }}
                  selected={selectedNode?.type === 'unita' && selectedNode?.data?.id === u.id}
                >
                  {(ripartitori[u.id] || []).map(r => (
                    <TreeNode key={r.id} icon={Flame} iconColor="#fb923c" label={r.matricola} sublabel={r.locale} depth={3}
                      onEdit={() => openEdit('ripartitore', r, { unitaId: u.id, condominioId: c.id })}
                      onDelete={() => openDelete(
                        `Sei sicuro di voler eliminare il ripartitore con matricola "${r.matricola}"?`,
                        async () => { await window.api.deleteRipartitore(r.id); await loadRipartitori(u.id); setConferma(null); onPatchAnagrafica && onPatchAnagrafica('reload', c.id, null); toast.success('Ripartitore eliminato') }
                      )}
                      onClick={() => onSelect({ type: 'ripartitore', data: r })}
                      selected={selectedNode?.type === 'ripartitore' && selectedNode?.data?.id === r.id}
                    />
                  ))}
                </TreeNode>
              ))}
            </TreeNode>
          ))}
        </TreeNode>
      ))}

      {modal && modalConfigs[modal.type] && (
        <ModalInput
          key={`${modal.type}_${modal.mode}_${modal.data?.id ?? 'new'}`}
          title={modal.mode === 'add' ? modalConfigs[modal.type].addTitle : modalConfigs[modal.type].editTitle}
          fields={modalConfigs[modal.type].fields}
          initialValues={modal.mode === 'edit' ? modal.data : {}}
          onConfirm={handleConfirm}
          onCancel={() => setModal(null)}
        />
      )}

      {conferma && (
        <ModalConferma
          messaggio={conferma.messaggio}
          onConferma={conferma.onConferma}
          onAnnulla={() => setConferma(null)}
        />
      )}

      {/* Modal eliminazione condominio con scelta archivio */}
      {modalDeleteCond && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
        }}>
          <div style={{
            background: 'rgba(14,14,30,0.97)', backdropFilter: 'blur(20px)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: '16px',
            padding: '24px', width: '380px', boxShadow: '0 0 40px rgba(239,68,68,0.06), 0 20px 60px rgba(0,0,0,0.8)',
          }}>
            <div style={{ fontSize: '18px', marginBottom: '8px' }}>⚠️</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff', marginBottom: '8px' }}>
              Elimina condominio
            </div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>
              Sei sicuro di voler eliminare <strong style={{ color: '#fff' }}>{modalDeleteCond.cond.nome}</strong>?
              Verranno eliminati tutti i piani, le unità e i ripartitori associati.
            </div>
            {modalDeleteCond.hasArchivio && (
              <div style={{
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px',
                padding: '14px', marginBottom: '20px',
              }}>
                <div style={{ fontSize: '12px', color: 'rgba(252,165,165,0.9)', marginBottom: '10px', fontWeight: '600' }}>
                  📁 Vuoi eliminare anche la cartella archivio?
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '12px' }}>
                  La cartella contiene tutti gli XML importati per questo condominio.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => eseguiDeleteCondominio(modalDeleteCond.cond, true)} style={{
                    flex: 1, padding: '8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: '8px', color: '#fca5a5', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                  }}>
                    Sì, elimina archivio
                  </button>
                  <button onClick={() => eseguiDeleteCondominio(modalDeleteCond.cond, false)} style={{
                    flex: 1, padding: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '12px',
                  }}>
                    No, mantieni archivio
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setModalDeleteCond(null)} style={{
                flex: 1, padding: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '13px',
              }}>Annulla</button>
              {!modalDeleteCond.hasArchivio && (
                <button onClick={() => eseguiDeleteCondominio(modalDeleteCond.cond, false)} style={{
                  flex: 1, padding: '9px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '10px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                }}>Elimina</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}