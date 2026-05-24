import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const CATEGORIES = ['All', 'Strength', 'Olympic', 'Accessory', 'Conditioning']

function newSet(n) { return { id: Date.now() + Math.random(), set_number: n, reps: '', load: '', rpe: '' } }

export default function AdHocLog({ user, onClose, defaultDate }) {
  const [movements, setMovements] = useState([])
  const [filtered, setFiltered] = useState([])
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [sets, setSets] = useState([newSet(1)])
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(defaultDate || new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newMoveName, setNewMoveName] = useState('')
  const [showAddNew, setShowAddNew] = useState(false)

  useEffect(() => {
    supabase.from('movement_library').select('*').order('category').order('name')
      .then(({ data }) => { setMovements(data || []); setFiltered(data || []) })
  }, [])

  useEffect(() => {
    let list = movements
    if (category !== 'All') list = list.filter(m => m.category === category)
    if (search.trim()) list = list.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    setFiltered(list)
  }, [category, search, movements])

  const addSet = () => setSets(s => [...s, newSet(s.length + 1)])
  const rmSet = i => setSets(s => s.filter((_, j) => j !== i).map((st, j) => ({ ...st, set_number: j + 1 })))
  const updSet = (i, f, v) => setSets(s => s.map((st, j) => j === i ? { ...st, [f]: v } : st))

  const addNewMovement = async () => {
    if (!newMoveName.trim()) return
    const { data, error } = await supabase.from('movement_library')
      .insert({ name: newMoveName.trim(), category: 'Strength', created_by: user.id })
      .select().single()
    if (!error && data) {
      setMovements(m => [...m, data])
      setSelected(data)
      setShowAddNew(false)
      setNewMoveName('')
    }
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)

    // Create a standalone workout for this log
    const { data: workout, error: wErr } = await supabase.from('workouts').insert({
      title: `${selected.name} — Ad Hoc`,
      date, track: 'Ad Hoc', notes: notes.trim(),
      assigned_athlete_id: user.id
    }).select().single()

    if (wErr) { setSaving(false); return }

    // Create section
    const { data: section } = await supabase.from('workout_sections').insert({
      workout_id: workout.id, type: 'Strength', score_type: 'Heaviest Set', order_index: 0
    }).select().single()

    if (!section) { setSaving(false); return }

    // Create movement
    const { data: movement } = await supabase.from('movements').insert({
      section_id: section.id, name: selected.name, scheme: '', order_index: 0
    }).select().single()

    if (!movement) { setSaving(false); return }

    // Create sets
    const validSets = sets.filter(st => st.reps || st.load)
    if (validSets.length > 0) {
      await supabase.from('sets').insert(
        validSets.map((st, idx) => ({
          movement_id: movement.id, set_number: st.set_number,
          reps: st.reps, load: st.load, rpe: st.rpe, order_index: idx
        }))
      )

      // Log the sets for 1RM tracking
      await supabase.from('set_logs').insert(
        validSets.map(st => ({
          set_id: null, movement_id: movement.id, workout_id: workout.id,
          athlete_id: user.id, value: st.load
        })).filter(sl => sl.value)
      )
    }

    setSaving(false)
    setSaved(true)
    setTimeout(onClose, 1500)
  }

  if (saved) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '36px', marginBottom: '1rem' }}>✓</div>
        <div style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold-light)', fontSize: '16px' }}>Logged!</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: 'var(--gold-light)', letterSpacing: '2px' }}>Log a Movement</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--charcoal-light)', fontSize: '22px', cursor: 'pointer', padding: '4px' }}>×</button>
      </div>

      {!selected ? (
        <div>
          {/* Search */}
          <div className="field">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search movements..." style={{ marginBottom: '8px' }} />
          </div>

          {/* Category filter */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={category === c ? 'btn-sm' : 'btn-ghost'}
                style={{ fontSize: '11px', padding: '4px 10px' }}>{c}</button>
            ))}
          </div>

          {/* Movement list */}
          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px' }}>
            {filtered.map(m => (
              <div key={m.id} onClick={() => setSelected(m)}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: '14px', color: 'var(--bone)' }}>{m.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--charcoal-light)', letterSpacing: '1px', textTransform: 'uppercase' }}>{m.category}</span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--charcoal-light)', fontSize: '13px' }}>
                No movements found
              </div>
            )}
          </div>

          {/* Add custom movement */}
          <div style={{ marginTop: '1rem' }}>
            {showAddNew
              ? <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" value={newMoveName} onChange={e => setNewMoveName(e.target.value)}
                    placeholder="Movement name..." style={{ flex: 1 }} />
                  <button className="btn-sm" onClick={addNewMovement} disabled={!newMoveName.trim()}>Add</button>
                  <button className="btn-ghost" onClick={() => setShowAddNew(false)}>Cancel</button>
                </div>
              : <button className="btn-ghost" style={{ fontSize: '12px' }} onClick={() => setShowAddNew(true)}>
                  + Add custom movement
                </button>
            }
          </div>
        </div>
      ) : (
        <div>
          {/* Selected movement header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', padding: '10px 14px', background: 'rgba(200,169,106,0.08)', border: '1px solid var(--gold-dark)', borderRadius: '4px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: 'var(--gold-light)' }}>{selected.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--charcoal-light)', textTransform: 'uppercase', letterSpacing: '1px' }}>{selected.category}</div>
            </div>
            <button onClick={() => setSelected(null)} className="btn-ghost" style={{ fontSize: '11px' }}>Change</button>
          </div>

          {/* Date */}
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {/* Sets */}
          <div style={{ marginBottom: '1rem' }}>
            <div className="set-builder-header" style={{ marginBottom: '6px' }}>
              <span>Set</span><span>Reps</span><span>Load</span><span>RPE</span><span></span>
            </div>
            {sets.map((st, i) => (
              <div key={st.id} className="set-builder-row">
                <span className="set-num-label">{st.set_number}</span>
                <input type="text" value={st.reps} onChange={e => updSet(i, 'reps', e.target.value)} placeholder="5" />
                <input type="text" value={st.load} onChange={e => updSet(i, 'load', e.target.value)} placeholder="135 lbs" />
                <input type="text" value={st.rpe} onChange={e => updSet(i, 'rpe', e.target.value)} placeholder="8" />
                {sets.length > 1 && <button className="btn-rm" onClick={() => rmSet(i)}>×</button>}
              </div>
            ))}
            <button className="btn-add" onClick={addSet}>+ Add Set</button>
          </div>

          {/* Notes */}
          <div className="field">
            <label>Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="How did it feel? Any scaling or context..." />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-primary" onClick={save} disabled={saving || sets.every(st => !st.reps && !st.load)}>
              {saving ? 'Saving...' : 'Save Log'}
            </button>
            <button className="btn-ghost" onClick={() => setSelected(null)} style={{ flex: 'none', width: 'auto', padding: '10px 20px' }}>← Back</button>
          </div>
        </div>
      )}
    </div>
  )
}
