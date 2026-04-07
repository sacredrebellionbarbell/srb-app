import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const TRACKS = ['Strength & Conditioning', 'Babes Who Fight Bears', 'Open Track']
const STYPES = ['Warm-Up', 'Strength', 'Accessory', 'Conditioning', 'Core', 'Cooldown', 'Skills', 'Custom']

export default function EditWorkout({ workout, onSaved, onClose }) {
  const [title, setTitle] = useState(workout.title || '')
  const [track, setTrack] = useState(workout.track || TRACKS[0])
  const [date, setDate] = useState(workout.date || '')
  const [notes, setNotes] = useState(workout.notes || '')
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    // Build editable sections from existing workout data
    const secs = (workout.workout_sections || [])
      .sort((a, b) => a.order_index - b.order_index)
      .map(s => ({
        id: s.id,
        type: s.type,
        notes: s.notes || '',
        movements: (s.movements || [])
          .sort((a, b) => a.order_index - b.order_index)
          .map(m => ({ id: m.id, name: m.name, scheme: m.scheme }))
      }))
    setSections(secs.length > 0 ? secs : [newSec()])
  }, [workout])

  function newSec() { return { id: null, type: 'Strength', notes: '', movements: [{ id: null, name: '', scheme: '' }] } }

  const addSec = () => setSections([...sections, newSec()])
  const rmSec = i => setSections(sections.filter((_, j) => j !== i))
  const updSec = (i, f, v) => setSections(sections.map((s, j) => j === i ? { ...s, [f]: v } : s))
  const addMv = i => setSections(sections.map((s, j) => j === i ? { ...s, movements: [...s.movements, { id: null, name: '', scheme: '' }] } : s))
  const rmMv = (si, mi) => setSections(sections.map((s, j) => j === si ? { ...s, movements: s.movements.filter((_, k) => k !== mi) } : s))
  const updMv = (si, mi, f, v) => setSections(sections.map((s, j) => j === si ? { ...s, movements: s.movements.map((m, k) => k === mi ? { ...m, [f]: v } : m) } : s))

  const save = async () => {
    if (!title.trim()) { setErr('Title is required'); return }
    setLoading(true); setErr('')

    // Update workout header
    await supabase.from('workouts').update({ title: title.trim(), track, date, notes: notes.trim() }).eq('id', workout.id)

    // Delete all existing sections and movements, then re-insert fresh
    await supabase.from('workout_sections').delete().eq('workout_id', workout.id)

    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si]
      const validMvs = sec.movements.filter(m => m.name.trim())
      if (!validMvs.length) continue

      const { data: section } = await supabase
        .from('workout_sections')
        .insert({ workout_id: workout.id, type: sec.type, notes: sec.notes, order_index: si })
        .select().single()

      if (section) {
        await supabase.from('movements').insert(
          validMvs.map((m, mi) => ({ section_id: section.id, name: m.name, scheme: m.scheme, order_index: mi }))
        )
      }
    }

    setLoading(false)
    onSaved()
  }

  return (
    <div className="modal-wrap" onClick={e => { if (e.target.className === 'modal-wrap') onClose() }}>
      <div className="modal" style={{ maxWidth: '640px' }}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Edit Workout</div>
            <div className="modal-sub">{workout.title}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {err && <p className="auth-error">{err}</p>}

          <div className="two-col">
            <div className="field">
              <label>Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Track</label>
            <select value={track} onChange={e => setTrack(e.target.value)}>
              {TRACKS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="field">
            <label>General Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Intent, scaling, cues..." />
          </div>

          <span className="sb-label">Workout Sections</span>
          {sections.map((sec, si) => (
            <div key={si} className="ws-block">
              <div className="ws-head">
                <select value={sec.type} onChange={e => updSec(si, 'type', e.target.value)}>
                  {STYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {sections.length > 1 && <button className="btn-rm" onClick={() => rmSec(si)}>×</button>}
              </div>
              <input className="ws-notes" type="text" value={sec.notes}
                onChange={e => updSec(si, 'notes', e.target.value)} placeholder="Section notes (optional)" />
              {sec.movements.map((m, mi) => (
                <div key={mi} className="mv-entry">
                  <input type="text" value={m.name} onChange={e => updMv(si, mi, 'name', e.target.value)} placeholder="Movement name" />
                  <input type="text" value={m.scheme} onChange={e => updMv(si, mi, 'scheme', e.target.value)} placeholder="3x5, AMRAP..." />
                  {sec.movements.length > 1 && <button className="btn-rm" onClick={() => rmMv(si, mi)}>×</button>}
                </div>
              ))}
              <button className="btn-add" onClick={() => addMv(si)}>+ Add Movement</button>
            </div>
          ))}
          <button className="btn-add-sec" onClick={addSec}>+ Add Section</button>

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '10px' }}>
            <button className="btn-primary" onClick={save} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
            <button className="btn-ghost" onClick={onClose} style={{ flex: 'none', width: 'auto', padding: '10px 20px' }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
