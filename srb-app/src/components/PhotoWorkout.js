import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

const TRACKS = ['Babes Who Fight Bears', 'Strong & Savage', 'Olympic Weightlifting']
const STYPES = ['Warm-Up', 'Strength', 'Accessory', 'Conditioning', 'Core', 'Cooldown', 'Skills', 'Custom']
const SCORE_TYPES = ['No Score', 'Heaviest Set', 'For Time', 'AMRAP', 'Max Reps / Calories', 'Max Distance']

function newMov(name = '') { return { id: Date.now() + Math.random(), name, notes: '', sets: [] } }
function newSet(n) { return { id: Date.now() + Math.random(), set_number: n, reps: '', load: '', rpe: '' } }
function newSec(type = 'Strength') { return { id: Date.now() + Math.random(), type, score_type: 'No Score', notes: '', movements: [newMov()] } }

export default function PhotoWorkout({ user, onPosted }) {
  const [step, setStep] = useState('upload') // upload | preview | posting
  const [imageData, setImageData] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const [err, setErr] = useState('')

  // Workout fields
  const today = new Date().toISOString().split('T')[0]
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [track, setTrack] = useState(TRACKS[0])
  const [notes, setNotes] = useState('')
  const [secs, setSecs] = useState([newSec()])
  const [usePrivateTrack, setUsePrivateTrack] = useState(false)
  const [privateTrackId, setPrivateTrackId] = useState(null)
  const [assignedAthleteId, setAssignedAthleteId] = useState(null)

  // Private tracks and members
  const [privateTracks, setPrivateTracks] = useState([])
  const [members, setMembers] = useState([])
  const [showNewTrack, setShowNewTrack] = useState(false)
  const [newTrackName, setNewTrackName] = useState('')
  const [newTrackAthlete, setNewTrackAthlete] = useState('')
  const [posting, setPosting] = useState(false)
  const [toast, setToast] = useState(null)

  const fileRef = useRef()
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    supabase.from('profiles').select('id, name').order('name').then(({ data }) => setMembers(data || []))
    supabase.from('private_tracks').select('*, profiles(name)').order('name').then(({ data }) => setPrivateTracks(data || []))
  }, [])

  const handlePhoto = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setErr('')

    // Convert to base64
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result.split(',')[1])
      r.onerror = rej
      r.readAsDataURL(file)
    })

    setImageData(base64)
    setImagePreview(URL.createObjectURL(file))
    setTranscribing(true)
    setStep('preview')

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: base64, mediaType: file.type || 'image/jpeg' })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Transcription failed')
      const text = data.text || ''

      // Parse the JSON response
      let parsed
      try {
        parsed = JSON.parse(text.trim())
      } catch {
        // Try to extract JSON if there's any extra text
        const match = text.match(/\{[\s\S]*\}/)
        if (match) parsed = JSON.parse(match[0])
        else throw new Error('Could not parse workout from photo')
      }

      // Apply parsed data to state
      setTitle(parsed.title || 'Workout')
      setNotes(parsed.notes || '')
      setSecs((parsed.sections || [newSec()]).map(sec => ({
        id: Date.now() + Math.random(),
        type: STYPES.includes(sec.type) ? sec.type : 'Strength',
        score_type: SCORE_TYPES.includes(sec.score_type) ? sec.score_type : 'No Score',
        notes: sec.notes || '',
        movements: (sec.movements || []).map(mov => ({
          id: Date.now() + Math.random(),
          name: mov.name || '',
          notes: mov.notes || '',
          sets: (mov.sets || []).map((st, idx) => ({
            id: Date.now() + Math.random(),
            set_number: st.set_number || idx + 1,
            reps: String(st.reps || ''),
            load: String(st.load || ''),
            rpe: String(st.rpe || '')
          }))
        }))
      })))

    } catch (e) {
      setErr('Could not read workout from photo. You can edit manually below.')
      setSecs([newSec()])
    }

    setTranscribing(false)
  }

  const createPrivateTrack = async () => {
    if (!newTrackName.trim() || !newTrackAthlete) return
    const { data } = await supabase.from('private_tracks')
      .insert({ name: newTrackName.trim(), athlete_id: newTrackAthlete, created_by: user.id })
      .select('*, profiles(name)').single()
    if (data) {
      setPrivateTracks(prev => [...prev, data])
      setPrivateTrackId(data.id)
      setAssignedAthleteId(newTrackAthlete)
      setShowNewTrack(false)
      setNewTrackName('')
      setNewTrackAthlete('')
      showToast('Private track created')
    }
  }

  // Section helpers
  const updSec = (i, f, v) => setSecs(secs.map((s, j) => j === i ? { ...s, [f]: v } : s))
  const addSec = () => setSecs([...secs, newSec()])
  const rmSec = i => setSecs(secs.filter((_, j) => j !== i))
  const addMov = i => setSecs(secs.map((s, j) => j === i ? { ...s, movements: [...s.movements, newMov()] } : s))
  const rmMov = (si, mi) => setSecs(secs.map((s, j) => j === si ? { ...s, movements: s.movements.filter((_, k) => k !== mi) } : s))
  const updMov = (si, mi, f, v) => setSecs(secs.map((s, j) => j === si ? { ...s, movements: s.movements.map((m, k) => k === mi ? { ...m, [f]: v } : m) } : s))
  const addSet = (si, mi) => setSecs(secs.map((s, j) => j === si ? { ...s, movements: s.movements.map((m, k) => k === mi ? { ...m, sets: [...m.sets, newSet(m.sets.length + 1)] } : m) } : s))
  const rmSet = (si, mi, sti) => setSecs(secs.map((s, j) => j === si ? { ...s, movements: s.movements.map((m, k) => k === mi ? { ...m, sets: m.sets.filter((_, l) => l !== sti).map((st, l) => ({ ...st, set_number: l + 1 })) } : m) } : s))
  const updSet = (si, mi, sti, f, v) => setSecs(secs.map((s, j) => j === si ? { ...s, movements: s.movements.map((m, k) => k === mi ? { ...m, sets: m.sets.map((st, l) => l === sti ? { ...st, [f]: v } : st) } : m) } : s))

  const post = async () => {
    if (!title.trim()) { setErr('Title is required'); return }
    setPosting(true)

    const workoutPayload = {
      title: title.trim(),
      date,
      notes: notes.trim(),
      track: usePrivateTrack ? 'Private' : track,
      private_track_id: usePrivateTrack ? privateTrackId : null,
      assigned_athlete_id: usePrivateTrack ? assignedAthleteId : null
    }

    const { data: workout, error: wErr } = await supabase
      .from('workouts').insert(workoutPayload).select().single()
    if (wErr) { setErr(wErr.message); setPosting(false); return }

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

    setPosting(false)
    setStep('upload')
    setTitle('')
    setNotes('')
    setSecs([newSec()])
    setImageData(null)
    setImagePreview(null)
    showToast('Workout posted!')
    if (onPosted) onPosted()
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Photo → Workout</h2>
      </div>

      {step === 'upload' && (
        <div className="panel">
          <div className="panel-title">Upload Workout Photo</div>
          <p style={{ fontSize: '14px', color: 'var(--charcoal-light)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Take a photo of a handwritten or printed workout. AI will read it and build the workout for you to review and edit before posting.
          </p>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhoto} />
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn-primary" style={{ width: 'auto', padding: '12px 24px' }} onClick={() => { fileRef.current.setAttribute('capture', 'environment'); fileRef.current.click() }}>📷 Take Photo</button>
            <button className="btn-ghost" onClick={() => { fileRef.current.removeAttribute('capture'); fileRef.current.click() }}>📁 Choose from Library</button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div>
          {err && <p className="auth-error" style={{ marginBottom: '1rem' }}>{err}</p>}

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {imagePreview && (
              <img src={imagePreview} alt="Workout" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border)', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1 }}>
              {transcribing
                ? <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem', background: 'rgba(200,169,106,0.06)', border: '1px solid var(--gold-dark)', borderRadius: '4px' }}>
                    <span style={{ fontSize: '20px' }}>🤖</span>
                    <div>
                      <div style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold-light)', fontSize: '14px', marginBottom: '4px' }}>Reading workout...</div>
                      <div style={{ fontSize: '13px', color: 'var(--charcoal-light)' }}>AI is transcribing your photo</div>
                    </div>
                  </div>
                : <div style={{ padding: '1rem', background: 'rgba(107,115,85,0.1)', border: '1px solid var(--moss)', borderRadius: '4px' }}>
                    <div style={{ fontFamily: 'Cinzel, serif', color: 'var(--moss-light)', fontSize: '14px', marginBottom: '4px' }}>✓ Transcription complete</div>
                    <div style={{ fontSize: '13px', color: 'var(--charcoal-light)' }}>Review and edit below, then post</div>
                  </div>
              }
            </div>
          </div>

          {!transcribing && (
            <div className="panel">
              <div className="panel-title">Review & Edit</div>

              <div className="two-col">
                <div className="field"><label>Title</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} /></div>
                <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              </div>

              {/* Track assignment */}
              <div className="field">
                <label>Assign To</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <button className={!usePrivateTrack ? 'btn-sm' : 'btn-ghost'} style={{ fontSize: '11px' }} onClick={() => setUsePrivateTrack(false)}>Public Track</button>
                  <button className={usePrivateTrack ? 'btn-sm' : 'btn-ghost'} style={{ fontSize: '11px' }} onClick={() => setUsePrivateTrack(true)}>Private Client Track</button>
                </div>

                {!usePrivateTrack && (
                  <select value={track} onChange={e => setTrack(e.target.value)}>
                    {TRACKS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}

                {usePrivateTrack && (
                  <div>
                    {privateTracks.length > 0 && (
                      <select value={privateTrackId || ''} onChange={e => {
                        const t = privateTracks.find(pt => String(pt.id) === e.target.value)
                        setPrivateTrackId(t?.id || null)
                        setAssignedAthleteId(t?.athlete_id || null)
                      }} style={{ marginBottom: '8px' }}>
                        <option value="">Select a client track...</option>
                        {privateTracks.map(pt => (
                          <option key={pt.id} value={pt.id}>{pt.name} — {pt.profiles?.name}</option>
                        ))}
                      </select>
                    )}
                    <button className="btn-ghost" style={{ fontSize: '11px', marginTop: '6px' }} onClick={() => setShowNewTrack(!showNewTrack)}>
                      {showNewTrack ? 'Cancel' : '+ Create New Client Track'}
                    </button>
                    {showNewTrack && (
                      <div style={{ marginTop: '10px', padding: '12px', background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '2px' }}>
                        <div className="field">
                          <label>Track Name</label>
                          <input type="text" value={newTrackName} onChange={e => setNewTrackName(e.target.value)} placeholder="e.g. Sarah's Programming" />
                        </div>
                        <div className="field">
                          <label>Assign to Athlete</label>
                          <select value={newTrackAthlete} onChange={e => setNewTrackAthlete(e.target.value)}>
                            <option value="">Select athlete...</option>
                            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </div>
                        <button className="btn-sm" onClick={createPrivateTrack} disabled={!newTrackName.trim() || !newTrackAthlete}>Create Track</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="field">
                <label>General Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Intent, scaling, cues..." />
              </div>

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
                      <div className="set-builder-header">
                        <span>Set</span><span>Reps</span><span>Load / %</span><span>RPE</span><span></span>
                      </div>
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
                <button className="btn-primary" onClick={post} disabled={posting || (usePrivateTrack && !privateTrackId)}>
                  {posting ? 'Posting...' : 'Post Workout'}
                </button>
                <button className="btn-ghost" onClick={() => { setStep('upload'); setImageData(null); setImagePreview(null); setSecs([newSec()]); setTitle(''); setNotes('') }} style={{ flex: 'none', width: 'auto', padding: '10px 20px' }}>
                  Start Over
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
