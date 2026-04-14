import React, { useState } from 'react'
import { supabase } from '../supabaseClient'

const TRACKS = ['Babes Who Fight Bears', 'Strong & Savage', 'Olympic Weightlifting']
const STYPES = ['Warm-Up', 'Strength', 'Accessory', 'Conditioning', 'Core', 'Cooldown', 'Skills', 'Custom']
const SCORE_TYPES = ['No Score', 'Heaviest Set', 'For Time', 'AMRAP', 'Max Reps / Calories', 'Max Distance']

function newSec() { return { id: Date.now() + Math.random(), type: 'Strength', score_type: 'No Score', notes: '', movements: [newMov()] } }
function newMov() { return { id: Date.now() + Math.random(), name: '', notes: '', sets: [newSet(1)] } }
function newSet(n) { return { id: Date.now() + Math.random(), set_number: n, reps: '', load: '', rpe: '' } }

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
  const addMov = i => setSecs(secs.map((s, j) => j === i ? { ...s, movements: [...s.movements, newMov()] } : s))
  const rmMov = (si, mi) => setSecs(secs.map((s, j) => j === si ? { ...s, movements: s.movements.filter((_, k) => k !== mi) } : s))
  const updMov = (si, mi, f, v) => setSecs(secs.map((s, j) => j === si ? { ...s, movements: s.movements.map((m, k) => k === mi ? { ...m, [f]: v } : m) } : s))
  const addSet = (si, mi) => setSecs(secs.map((s, j) => j === si ? { ...s, movements: s.movements.map((m, k) => k === mi ? { ...m, sets: [...m.sets, newSet(m.sets.length + 1)] } : m) } : s))
  const rmSet = (si, mi, sti) => setSecs(secs.map((s, j) => j === si ? { ...s, movements: s.movements.map((m, k) => k === mi ? { ...m, sets: m.sets.filter((_, l) => l !== sti).map((st, l) => ({ ...st, set_number: l + 1 })) } : m) } : s))
  const updSet = (si, mi, sti, f, v) => setSecs(secs.map((s, j) => j === si ? { ...s, movements: s.movements.map((m, k) => k === mi ? { ...m, sets: m.sets.map((st, l) => l === sti ? { ...st, [f]: v } : st) } : m) } : s))

  const submit = async () => {
    if (!title.trim()) { setErr('Title is required'); return }
    setLoading(true); setErr('')

    const { data: workout, error: wErr } = await supabase
      .from('workouts').insert({ title: title.trim(), track, date, notes: notes.trim() }).select().single()
    if (wErr) { setErr(wErr.message); setLoading(false); return }

    for (let si = 0; si < secs.length; si++) {
      const sec = secs[si]
      const validMovs = sec.movements.filter(m => m.name.trim())
      if (!validMovs.length) continue
      const { data: section } = await supabase
        .from('workout_sections')
        .insert({ workout_id: workout.id, type: sec.type, score_type: sec.score_type, notes: sec.notes, order_index: si })
        .select().single()
      if (!section) continue
      for (let mi = 0; mi < validMovs.length; mi++) {
        const mov = validMovs[mi]
        const { data: movement } = await supabase
          .from('movements').insert({ section_id: section.id, name: mov.name, notes: mov.notes, scheme: '', order_index: mi }).select().single()
        if (!movement) continue
        const validSets = mov.sets.filter(st => st.reps || st.load)
        if (validSets.length > 0) {
          await supabase.from('sets').insert(
            validSets.map((st, idx) => ({ movement_id: movement.id, set_number: st.set_number, reps: st.reps, load: st.load, rpe: st.rpe, order_index: idx }))
          )
        }
      }
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
        <div className="field"><label>Title</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Heavy Squat Day" /></div>
        <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      </div>
      <div className="field">
        <label>Track</label>
        <select value={track} onChange={e => setTrack(e.target.value)}>{TRACKS.map(t => <option key={t} value={t}>{t}</option>)}</select>
      </div>
      <div className="field">
        <label>General Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Intent, scaling, cues..." />
      </div>

      <span className="sb-label">Workout Sections</span>
      {secs.map((sec, si) => (
        <div key={sec.id} className="ws-block">
          <div className="ws-head">
            <select value={sec.type} onChange={e => updSec(si, 'type', e.target.value)}>{STYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <select value={sec.score_type} onChange={e => updSec(si, 'score_type', e.target.value)} style={{ flex: 'none', width: 'auto' }}>{SCORE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            {secs.length > 1 && <button className="btn-rm" onClick={() => rmSec(si)}>×</button>}
          </div>
          <input className="ws-notes" type="text" value={sec.notes} onChange={e => updSec(si, 'notes', e.target.value)} placeholder="Section notes / workout description (optional)" />

          {sec.movements.map((mov, mi) => (
            <div key={mov.id} className="mv-block">
              <div className="mv-block-header">
                <input type="text" value={mov.name} onChange={e => updMov(si, mi, 'name', e.target.value)} placeholder="Movement name (e.g. Back Squat)" />
                {sec.movements.length > 1 && <button className="btn-rm" onClick={() => rmMov(si, mi)}>×</button>}
              </div>
              <input className="mv-block-notes" type="text" value={mov.notes} onChange={e => updMov(si, mi, 'notes', e.target.value)} placeholder="Movement notes (optional)" />

              {/* Only show set builder for Heaviest Set sections */}
              {sec.score_type === 'Heaviest Set' && (
                <>
                  <div className="set-builder-header">
                    <span>Set</span><span>Reps</span><span>Load / %</span><span>RPE</span><span></span>
                  </div>
                  {mov.sets.map((st, sti) => (
                    <div key={st.id} className="set-builder-row">
                      <span className="set-num-label">{st.set_number}</span>
                      <input type="text" value={st.reps} onChange={e => updSet(si, mi, sti, 'reps', e.target.value)} placeholder="3" />
                      <input type="text" value={st.load} onChange={e => updSet(si, mi, sti, 'load', e.target.value)} placeholder="90% or 185 lbs" />
                      <input type="text" value={st.rpe} onChange={e => updSet(si, mi, sti, 'rpe', e.target.value)} placeholder="8" />
                      {mov.sets.length > 1 && <button className="btn-rm" onClick={() => rmSet(si, mi, sti)}>×</button>}
                    </div>
                  ))}
                  <button className="btn-add" onClick={() => addSet(si, mi)}>+ Add Set</button>
                </>
              )}
            </div>
          ))}
          <button className="btn-add" style={{ marginTop: '8px' }} onClick={() => addMov(si)}>+ Add Movement</button>
        </div>
      ))}
      <button className="btn-add-sec" onClick={addSec}>+ Add Section</button>
      <div style={{ marginTop: '1.5rem' }}>
        <button className="btn-primary" onClick={submit} disabled={loading}>{loading ? 'Posting...' : 'Post Workout'}</button>
      </div>
    </div>
  )
}
