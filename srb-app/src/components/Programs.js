import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

const STYPES = ['Warm-Up', 'Strength', 'Accessory', 'Conditioning', 'Core', 'Cooldown', 'Skills', 'Custom']
const SCORE_TYPES = ['No Score', 'Heaviest Set', 'For Time', 'AMRAP', 'Max Reps / Calories', 'Max Distance']

function newSec() { return { id: Date.now() + Math.random(), type: 'Strength', score_type: 'No Score', notes: '', movements: [newMov()] } }
function newMov() { return { id: Date.now() + Math.random(), name: '', notes: '', sets: [newSet(1)] } }
function newSet(n) { return { id: Date.now() + Math.random(), set_number: n, reps: '', load: '', rpe: '' } }

export default function Programs({ user, profile }) {
  const isCoach = profile?.role === 'coach'
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProgram, setSelectedProgram] = useState(null)
  const [programWorkouts, setProgramWorkouts] = useState([])
  const [members, setMembers] = useState([])
  const [toast, setToast] = useState(null)
  const [showNewProgram, setShowNewProgram] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newAthlete, setNewAthlete] = useState('')
  const [addMode, setAddMode] = useState(null)
  const [availableWorkouts, setAvailableWorkouts] = useState([])
  const [selectedExisting, setSelectedExisting] = useState('')
  const [wTitle, setWTitle] = useState('')
  const [wNotes, setWNotes] = useState('')
  const [wSecs, setWSecs] = useState([newSec()])
  const [imagePreview, setImagePreview] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeErr, setTranscribeErr] = useState('')
  const [loggingPw, setLoggingPw] = useState(null)
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0])
  const [logNote, setLogNote] = useState('')
  const fileRef = useRef()

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const fetchPrograms = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('programs').select('*, profiles(name, avatar_url)').order('created_at', { ascending: false })
    setPrograms(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPrograms()
    if (isCoach) {
      supabase.from('profiles').select('id, name').order('name').then(({ data }) => setMembers(data || []))
      supabase.from('workouts').select('id, title, date').order('created_at', { ascending: false }).limit(150).then(({ data }) => setAvailableWorkouts(data || []))
    }
  }, [fetchPrograms, isCoach])

  const fetchProgramWorkouts = useCallback(async (programId) => {
    const { data } = await supabase
      .from('program_workouts')
      .select('*, workouts(id, title, notes, track, workout_sections(*, movements(*, sets(*))))')
      .eq('program_id', programId)
      .order('order_index')
    setProgramWorkouts(data || [])
  }, [])

  useEffect(() => { if (selectedProgram) fetchProgramWorkouts(selectedProgram.id) }, [selectedProgram, fetchProgramWorkouts])

  const createProgram = async () => {
    if (!newName.trim()) return
    const { error } = await supabase.from('programs').insert({ name: newName.trim(), description: newDesc.trim(), athlete_id: newAthlete || null, created_by: user.id })
    if (error) { showToast('Error: ' + error.message); return }
    setNewName(''); setNewDesc(''); setNewAthlete(''); setShowNewProgram(false)
    showToast('Program created'); fetchPrograms()
  }

  const deleteProgram = async (id) => {
    await supabase.from('programs').delete().eq('id', id)
    fetchPrograms(); showToast('Deleted')
  }

  const saveWorkoutToProgram = async () => {
    if (!wTitle.trim()) { showToast('Title is required'); return }
    const { data: workout, error: wErr } = await supabase.from('workouts')
      .insert({ title: wTitle.trim(), notes: wNotes.trim(), track: 'Private', assigned_athlete_id: selectedProgram.athlete_id })
      .select().single()
    if (wErr) { showToast('Error: ' + wErr.message); return }
    for (let si = 0; si < wSecs.length; si++) {
      const sec = wSecs[si]
      const validMovs = sec.movements.filter(m => m.name.trim())
      if (!validMovs.length) continue
      const { data: section } = await supabase.from('workout_sections').insert({ workout_id: workout.id, type: sec.type, score_type: sec.score_type, notes: sec.notes, order_index: si }).select().single()
      if (!section) continue
      for (let mi = 0; mi < validMovs.length; mi++) {
        const mov = validMovs[mi]
        const { data: movement } = await supabase.from('movements').insert({ section_id: section.id, name: mov.name, notes: mov.notes, scheme: '', order_index: mi }).select().single()
        if (!movement) continue
        const validSets = mov.sets.filter(st => st.reps || st.load)
        if (validSets.length > 0) await supabase.from('sets').insert(validSets.map((st, idx) => ({ movement_id: movement.id, set_number: st.set_number, reps: st.reps, load: st.load, rpe: st.rpe, order_index: idx })))
      }
    }
    const nextOrder = programWorkouts.length + 1
    await supabase.from('program_workouts').insert({ program_id: selectedProgram.id, workout_id: workout.id, order_index: nextOrder })
    fetchProgramWorkouts(selectedProgram.id)
    setAddMode(null); setWTitle(''); setWNotes(''); setWSecs([newSec()]); setImagePreview(null)
    showToast('Workout added!')
  }

  const addExistingWorkout = async () => {
    if (!selectedExisting) return
    const nextOrder = programWorkouts.length + 1
    const { error } = await supabase.from('program_workouts').insert({ program_id: selectedProgram.id, workout_id: parseInt(selectedExisting), order_index: nextOrder })
    if (!error) { fetchProgramWorkouts(selectedProgram.id); setSelectedExisting(''); setAddMode(null); showToast('Added') }
  }

  const removeFromProgram = async (pwId) => {
    await supabase.from('program_workouts').delete().eq('id', pwId)
    fetchProgramWorkouts(selectedProgram.id); showToast('Removed')
  }

  const logComplete = async () => {
    if (!loggingPw) return
    await supabase.from('program_workouts').update({ completed_at: new Date(logDate).toISOString(), completed_by: user.id, completion_note: logNote }).eq('id', loggingPw.id)
    setLoggingPw(null); setLogNote('')
    fetchProgramWorkouts(selectedProgram.id); showToast('Logged!')
  }

  const uncomplete = async (pwId) => {
    await supabase.from('program_workouts').update({ completed_at: null, completed_by: null, completion_note: null }).eq('id', pwId)
    fetchProgramWorkouts(selectedProgram.id)
  }

  const handlePhoto = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setTranscribeErr('')
    const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file) })
    setImagePreview(URL.createObjectURL(file))
    setTranscribing(true)
    try {
      const response = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageData: base64, mediaType: file.type || 'image/jpeg' }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed')
      const text = data.text || ''
      let parsed
      try { parsed = JSON.parse(text.trim()) } catch { const match = text.match(/\{[\s\S]*\}/); if (match) parsed = JSON.parse(match[0]); else throw new Error('Parse failed') }
      setWTitle(parsed.title || 'Workout')
      setWNotes(parsed.notes || '')
      setWSecs((parsed.sections || [newSec()]).map(sec => ({ id: Date.now() + Math.random(), type: STYPES.includes(sec.type) ? sec.type : 'Strength', score_type: SCORE_TYPES.includes(sec.score_type) ? sec.score_type : 'No Score', notes: sec.notes || '', movements: (sec.movements || []).map(mov => ({ id: Date.now() + Math.random(), name: mov.name || '', notes: mov.notes || '', sets: (mov.sets || []).map((st, idx) => ({ id: Date.now() + Math.random(), set_number: st.set_number || idx + 1, reps: String(st.reps || ''), load: String(st.load || ''), rpe: String(st.rpe || '') })) })) })))
    } catch (e) { setTranscribeErr('Could not read photo. Edit manually.'); setWSecs([newSec()]) }
    setTranscribing(false)
  }

  const updSec = (i, f, v) => setWSecs(s => s.map((x, j) => j === i ? { ...x, [f]: v } : x))
  const addSec = () => setWSecs(s => [...s, newSec()])
  const rmSec = i => setWSecs(s => s.filter((_, j) => j !== i))
  const addMov = i => setWSecs(s => s.map((x, j) => j === i ? { ...x, movements: [...x.movements, newMov()] } : x))
  const rmMov = (si, mi) => setWSecs(s => s.map((x, j) => j === si ? { ...x, movements: x.movements.filter((_, k) => k !== mi) } : x))
  const updMov = (si, mi, f, v) => setWSecs(s => s.map((x, j) => j === si ? { ...x, movements: x.movements.map((m, k) => k === mi ? { ...m, [f]: v } : m) } : x))
  const addSet = (si, mi) => setWSecs(s => s.map((x, j) => j === si ? { ...x, movements: x.movements.map((m, k) => k === mi ? { ...m, sets: [...m.sets, newSet(m.sets.length + 1)] } : m) } : x))
  const rmSet = (si, mi, sti) => setWSecs(s => s.map((x, j) => j === si ? { ...x, movements: x.movements.map((m, k) => k === mi ? { ...m, sets: m.sets.filter((_, l) => l !== sti).map((st, l) => ({ ...st, set_number: l + 1 })) } : m) } : x))
  const updSet = (si, mi, sti, f, v) => setWSecs(s => s.map((x, j) => j === si ? { ...x, movements: x.movements.map((m, k) => k === mi ? { ...m, sets: m.sets.map((st, l) => l === sti ? { ...st, [f]: v } : st) } : m) } : x))

  const completedCount = programWorkouts.filter(pw => pw.completed_at).length

  if (selectedProgram) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '1.5rem' }}>
          <button className="btn-ghost" onClick={() => { setSelectedProgram(null); setProgramWorkouts([]); setAddMode(null) }}>← Back</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: 'var(--gold-light)' }}>{selectedProgram.name}</div>
            {selectedProgram.profiles?.name && <div style={{ fontSize: '13px', color: 'var(--rose-light)', marginTop: '2px' }}>👤 {selectedProgram.profiles.name}</div>}
            {selectedProgram.description && <div style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginTop: '4px' }}>{selectedProgram.description}</div>}
          </div>
          {programWorkouts.length > 0 && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: 'var(--gold-light)' }}>{completedCount}/{programWorkouts.length}</div>
              <div style={{ fontSize: '10px', letterSpacing: '2px', color: 'var(--charcoal-light)', textTransform: 'uppercase' }}>Done</div>
            </div>
          )}
        </div>

        {programWorkouts.length > 0 && (
          <div style={{ height: '3px', background: 'rgba(245,240,232,0.08)', borderRadius: '2px', marginBottom: '1.5rem', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(completedCount / programWorkouts.length) * 100}%`, background: 'var(--gold)', borderRadius: '2px', transition: 'width 0.3s' }} />
          </div>
        )}

        {isCoach && addMode === null && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <button className="btn-sm" onClick={() => { setAddMode('scratch'); setWTitle(''); setWNotes(''); setWSecs([newSec()]) }}>+ Build Workout</button>
            <button className="btn-moss" onClick={() => { setAddMode('photo'); setImagePreview(null); setWTitle(''); setWNotes(''); setWSecs([newSec()]) }}>📷 Upload Photo</button>
            <button className="btn-ghost" onClick={() => setAddMode('existing')}>+ Add Existing</button>
          </div>
        )}

        {isCoach && addMode === 'existing' && (
          <div className="panel" style={{ marginBottom: '1.5rem' }}>
            <div className="panel-title">Add Existing Workout</div>
            <div className="field">
              <label>Select Workout</label>
              <select value={selectedExisting} onChange={e => setSelectedExisting(e.target.value)}>
                <option value="">Choose...</option>
                {availableWorkouts.map(w => <option key={w.id} value={w.id}>{w.title}{w.date ? ` (${w.date})` : ''}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-sm" onClick={addExistingWorkout} disabled={!selectedExisting}>Add</button>
              <button className="btn-ghost" onClick={() => setAddMode(null)}>Cancel</button>
            </div>
          </div>
        )}

        {isCoach && addMode === 'photo' && (
          <div className="panel" style={{ marginBottom: '1.5rem' }}>
            <div className="panel-title">Upload Workout Photo</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
            {!imagePreview && !transcribing && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button className="btn-sm" onClick={() => { fileRef.current.setAttribute('capture', 'environment'); fileRef.current.click() }}>📷 Take Photo</button>
                <button className="btn-ghost" onClick={() => { fileRef.current.removeAttribute('capture'); fileRef.current.click() }}>📁 Choose File</button>
                <button className="btn-ghost" onClick={() => setAddMode(null)}>Cancel</button>
              </div>
            )}
            {transcribing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem', background: 'rgba(200,169,106,0.06)', border: '1px solid var(--gold-dark)', borderRadius: '4px', marginBottom: '1rem' }}>
                <span style={{ fontSize: '20px' }}>🤖</span>
                <div>
                  <div style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold-light)', fontSize: '14px' }}>Reading workout...</div>
                  <div style={{ fontSize: '12px', color: 'var(--charcoal-light)' }}>AI is transcribing your photo</div>
                </div>
              </div>
            )}
            {transcribeErr && <p className="auth-error">{transcribeErr}</p>}
            {imagePreview && !transcribing && (
              <WorkoutBuilder imagePreview={imagePreview} title={wTitle} setTitle={setWTitle} notes={wNotes} setNotes={setWNotes} secs={wSecs} updSec={updSec} addSec={addSec} rmSec={rmSec} addMov={addMov} rmMov={rmMov} updMov={updMov} addSet={addSet} rmSet={rmSet} updSet={updSet} onSave={saveWorkoutToProgram} onCancel={() => setAddMode(null)} />
            )}
          </div>
        )}

        {isCoach && addMode === 'scratch' && (
          <div className="panel" style={{ marginBottom: '1.5rem' }}>
            <div className="panel-title">Build Workout</div>
            <WorkoutBuilder title={wTitle} setTitle={setWTitle} notes={wNotes} setNotes={setWNotes} secs={wSecs} updSec={updSec} addSec={addSec} rmSec={rmSec} addMov={addMov} rmMov={rmMov} updMov={updMov} addSet={addSet} rmSet={rmSet} updSet={updSet} onSave={saveWorkoutToProgram} onCancel={() => setAddMode(null)} />
          </div>
        )}

        {programWorkouts.length === 0 && addMode === null && (
          <div className="empty">
            <h3>No workouts yet</h3>
            <p>{isCoach ? 'Add workouts above.' : 'Your coach is building your program.'}</p>
          </div>
        )}

        {programWorkouts.map((pw, idx) => (
          <div key={pw.id} className="workout-card" style={{ marginBottom: '10px', opacity: pw.completed_at ? 0.75 : 1 }}>
            <div style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', color: 'var(--charcoal-light)', minWidth: '28px', paddingTop: '2px' }}>{idx + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: pw.completed_at ? 'var(--moss-light)' : 'var(--gold-light)', marginBottom: '4px' }}>
                    {pw.completed_at && '✓ '}{pw.workouts?.title}
                  </div>
                  {pw.completed_at && (
                    <div style={{ fontSize: '12px', color: 'var(--moss-light)', marginBottom: '6px' }}>
                      Completed {new Date(pw.completed_at).toLocaleDateString()}{pw.completion_note && ` · ${pw.completion_note}`}
                    </div>
                  )}
                  {pw.workouts?.notes && <div style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginBottom: '8px' }}>{pw.workouts.notes}</div>}
                  {(pw.workouts?.workout_sections || []).sort((a, b) => a.order_index - b.order_index).map((sec, si) => (
                    <div key={si} style={{ marginBottom: '6px' }}>
                      <div style={{ fontSize: '10px', letterSpacing: '2px', color: 'var(--gold-dark)', textTransform: 'uppercase', marginBottom: '2px' }}>{sec.type}</div>
                      {(sec.movements || []).map((m, mi) => (
                        <div key={mi} style={{ fontSize: '13px', color: 'var(--bone)', paddingLeft: '8px' }}>
                          {m.name}
                          {(m.sets || []).length > 0 && (
                            <span style={{ color: 'var(--charcoal-light)', marginLeft: '8px', fontSize: '12px' }}>
                              {m.sets.length}×{m.sets[0]?.reps && ` ${m.sets[0].reps}`}{m.sets[0]?.load && ` @ ${m.sets[0].load}`}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', flexShrink: 0 }}>
                  {pw.completed_at
                    ? <button className="btn-ghost" style={{ fontSize: '10px' }} onClick={() => uncomplete(pw.id)}>Undo</button>
                    : <button className="btn-sm" style={{ fontSize: '11px' }} onClick={() => { setLoggingPw(pw); setLogDate(new Date().toISOString().split('T')[0]); setLogNote('') }}>Log & Done</button>
                  }
                  {isCoach && <button className="btn-ghost" style={{ fontSize: '10px', color: 'var(--rose)' }} onClick={() => removeFromProgram(pw.id)}>Remove</button>}
                </div>
              </div>
            </div>
          </div>
        ))}

        {loggingPw && (
          <div className="modal-wrap" onClick={e => { if (e.target.className === 'modal-wrap') setLoggingPw(null) }}>
            <div className="modal">
              <div className="modal-head">
                <div><div className="modal-title">Log Completion</div><div className="modal-sub">{loggingPw.workouts?.title}</div></div>
                <button className="modal-close" onClick={() => setLoggingPw(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="field"><label>Date Completed</label><input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} /></div>
                <div className="field"><label>Notes / Results</label><textarea value={logNote} onChange={e => setLogNote(e.target.value)} placeholder="How did it go? PRs, scaling, how you felt..." /></div>
                <button className="btn-primary" onClick={logComplete}>Mark Complete</button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Programs</h2>
        {isCoach && <button className="btn-sm" onClick={() => setShowNewProgram(!showNewProgram)}>+ New Program</button>}
      </div>

      {isCoach && showNewProgram && (
        <div className="panel" style={{ marginBottom: '1.5rem' }}>
          <div className="panel-title">New Program</div>
          <div className="field"><label>Program Name</label><input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. 12-Week Strength Block" /></div>
          <div className="field"><label>Description</label><textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Goals, overview..." /></div>
          <div className="field">
            <label>Assign to Client</label>
            <select value={newAthlete} onChange={e => setNewAthlete(e.target.value)}>
              <option value="">No specific client</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={createProgram} disabled={!newName.trim()}>Create Program</button>
            <button className="btn-ghost" onClick={() => setShowNewProgram(false)} style={{ flex: 'none', width: 'auto', padding: '10px 20px' }}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <div className="loading">Loading...</div>}

      {!loading && programs.length === 0 && (
        <div className="empty">
          <h3>No programs yet</h3>
          <p>{isCoach ? 'Create a program above.' : 'Your coach hasn\'t assigned a program yet.'}</p>
        </div>
      )}

      {programs.filter(p => isCoach || p.athlete_id === user.id || !p.athlete_id).map(p => (
        <div key={p.id} className="class-card" style={{ cursor: 'pointer' }} onClick={() => setSelectedProgram(p)}>
          <div className="class-card-header">
            <div>
              <div className="class-title">{p.name}</div>
              {p.profiles?.name && <div style={{ fontSize: '12px', color: 'var(--rose-light)', marginTop: '4px' }}>👤 {p.profiles.name}</div>}
              {p.description && <div style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginTop: '6px' }}>{p.description}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isCoach && (
                <button className="btn-ghost" style={{ fontSize: '10px', color: 'var(--rose)' }}
                  onClick={e => { e.stopPropagation(); if (window.confirm('Delete this program?')) deleteProgram(p.id) }}>
                  Delete
                </button>
              )}
              <span style={{ color: 'var(--charcoal-light)', fontSize: '18px' }}>›</span>
            </div>
          </div>
        </div>
      ))}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function WorkoutBuilder({ title, setTitle, notes, setNotes, secs, updSec, addSec, rmSec, addMov, rmMov, updMov, addSet, rmSet, updSet, onSave, onCancel, imagePreview }) {
  return (
    <div>
      {imagePreview && <img src={imagePreview} alt="Workout" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border)', marginBottom: '1rem' }} />}
      <div className="field"><label>Title</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Workout title" /></div>
      <div className="field"><label>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Intent, coaching notes..." /></div>
      <span className="sb-label">Sections</span>
      {secs.map((sec, si) => (
        <div key={sec.id} className="ws-block">
          <div className="ws-head">
            <select value={sec.type} onChange={e => updSec(si, 'type', e.target.value)}>{STYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <select value={sec.score_type} onChange={e => updSec(si, 'score_type', e.target.value)} style={{ flex: 'none', width: 'auto' }}>{SCORE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            {secs.length > 1 && <button className="btn-rm" onClick={() => rmSec(si)}>×</button>}
          </div>
          <input className="ws-notes" type="text" value={sec.notes} onChange={e => updSec(si, 'notes', e.target.value)} placeholder="Section notes (optional)" />
          {sec.movements.map((mov, mi) => (
            <div key={mov.id} className="mv-block">
              <div className="mv-block-header">
                <input type="text" value={mov.name} onChange={e => updMov(si, mi, 'name', e.target.value)} placeholder="Movement name" />
                {sec.movements.length > 1 && <button className="btn-rm" onClick={() => rmMov(si, mi)}>×</button>}
              </div>
              <input className="mv-block-notes" type="text" value={mov.notes} onChange={e => updMov(si, mi, 'notes', e.target.value)} placeholder="Movement notes (optional)" />
              <div className="set-builder-header"><span>Set</span><span>Reps</span><span>Load / %</span><span>RPE</span><span></span></div>
              {mov.sets.map((st, sti) => (
                <div key={st.id} className="set-builder-row">
                  <span className="set-num-label">{st.set_number}</span>
                  <input type="text" value={st.reps} onChange={e => updSet(si, mi, sti, 'reps', e.target.value)} placeholder="3" />
                  <input type="text" value={st.load} onChange={e => updSet(si, mi, sti, 'load', e.target.value)} placeholder="80%" />
                  <input type="text" value={st.rpe} onChange={e => updSet(si, mi, sti, 'rpe', e.target.value)} placeholder="8" />
                  {mov.sets.length > 1 && <button className="btn-rm" onClick={() => rmSet(si, mi, sti)}>×</button>}
                </div>
              ))}
              <button className="btn-add" onClick={() => addSet(si, mi)}>+ Add Set</button>
            </div>
          ))}
          <button className="btn-add" style={{ marginTop: '8px' }} onClick={() => addMov(si)}>+ Add Movement</button>
        </div>
      ))}
      <button className="btn-add-sec" onClick={addSec}>+ Add Section</button>
      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '10px' }}>
        <button className="btn-primary" onClick={onSave} disabled={!title.trim()}>Save to Program</button>
        <button className="btn-ghost" onClick={onCancel} style={{ flex: 'none', width: 'auto', padding: '10px 20px' }}>Cancel</button>
      </div>
    </div>
  )
}
