import React, { useState } from 'react'
import { supabase } from '../supabaseClient'

const TRACKS = ['Strength & Conditioning', 'Babes Who Fight Bears', 'Open Track']
const STYPES = ['Warm-Up', 'Strength', 'Accessory', 'Conditioning', 'Core', 'Cooldown', 'Skills', 'Custom']

function newSec() { return { id: Date.now() + Math.random(), type: 'Strength', notes: '', movements: [{ name: '', scheme: '' }] } }

export default function PostWorkout({ onPosted }) {
  const today = new Date().toISOString().split('T')[0]
  const [title, setTitle] = useState('')
  const [track, setTrack] = useState(TRACKS[0])
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [secs, setSecs] = useState([newSec()])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const addSec = () => setSecs([...secs, newSec()])
  const rmSec = i => setSecs(secs.filter((_, j) => j !== i))
  const updSec = (i, f, v) => setSecs(secs.map((s, j) => j === i ? { ...s, [f]: v } : s))
  const addMv = i => setSecs(secs.map((s, j) => j === i ? { ...s, movements: [...s.movements, { name: '', scheme: '' }] } : s))
  const rmMv = (si, mi) => setSecs(secs.map((s, j) => j === si ? { ...s, movements: s.movements.filter((_, k) => k !== mi) } : s))
  const updMv = (si, mi, f, v) => setSecs(secs.map((s, j) => j === si ? { ...s, movements: s.movements.map((m, k) => k === mi ? { ...m, [f]: v } : m) } : s))

  const submit = async () => {
    if (!title.trim()) { setErr('Title is required'); return }
    setLoading(true); setErr('')

    const { data: workout, error: wErr } = await supabase
      .from('workouts').insert({ title: title.trim(), track, date, notes: notes.trim() }).select().single()

    if (wErr) { setErr(wErr.message); setLoading(false); return }

    for (let si = 0; si < secs.length; si++) {
      const sec = secs[si]
      const validMvs = sec.movements.filter(m => m.name.trim())
      if (!validMvs.length) continue

      const { data: section, error: sErr } = await supabase
        .from('workout_sections').insert({ workout_id: workout.id, type: sec.type, notes: sec.notes, order_index: si }).select().single()

      if (sErr) continue

      await supabase.from('movements').insert(
        validMvs.map((m, mi) => ({ section_id: section.id, name: m.name, scheme: m.scheme, order_index: mi }))
      )
    }

    setTitle(''); setNotes(''); setSecs([newSec()])
    setLoading(false)
    onPosted()
  }

  return (
    <div className="panel">
      <div className="panel-title">Post New Workout</div>
      {err && <p className="auth-error">{err}</p>}

      <div className="two-col">
        <div className="field">
          <label>Title</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Heavy Squat Day" />
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
      {secs.map((sec, si) => (
        <div key={sec.id} className="ws-block">
          <div className="ws-head">
            <select value={sec.type} onChange={e => updSec(si, 'type', e.target.value)}>
              {STYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {secs.length > 1 && <button className="btn-rm" onClick={() => rmSec(si)}>×</button>}
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

      <div style={{ marginTop: '1.5rem' }}>
        <button className="btn-primary" onClick={submit} disabled={loading}>
          {loading ? 'Posting...' : 'Post Workout'}
        </button>
      </div>
    </div>
  )
}
