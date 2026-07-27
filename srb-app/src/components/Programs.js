import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import VideoModal from './VideoModal'
import { canSeeWorkouts } from '../utils/access'
import { PRESCRIPTION_TYPES, getPrescriptionMeta, formatPrescriptionValue } from '../utils/prescriptionTypes'

const STYPES = ['Warm-Up', 'Strength', 'Accessory', 'Conditioning', 'Core', 'Cooldown', 'Skills', 'Custom']
const SCORE_TYPES = ['No Score', 'Heaviest Set', 'For Time', 'AMRAP', 'Max Reps / Calories', 'Max Distance']

function newSec() { return { id: Date.now() + Math.random(), type: 'Strength', score_type: 'No Score', notes: '', movements: [newMov()] } }
function newMov() { return { id: Date.now() + Math.random(), name: '', notes: '', demo_url: '', scheme: 'reps', sets: [newSet(1)] } }
function newSet(n) { return { id: Date.now() + Math.random(), set_number: n, reps: '', load: '', rpe: '' } }
function quickSets(count) { return Array.from({ length: count }, (_, i) => newSet(i + 1)) }
function cycleStorageKey(programId) { return `srb_program_collapsed_cycles_${programId}` }
function workoutStorageKey(programId) { return `srb_program_collapsed_workouts_${programId}` }

function parseWorkoutNotes(notes = '') {
  const lines = String(notes || '').split('\n')
  const first = lines[0] || ''
  if (!first.toLowerCase().startsWith('cycle:')) return { cycle: '', notes: notes || '' }
  return {
    cycle: first.replace(/^cycle:\s*/i, '').trim(),
    notes: lines.slice(1).join('\n').replace(/^\n+/, '')
  }
}

function composeWorkoutNotes(cycle, notes) {
  const cleanCycle = String(cycle || '').trim()
  const cleanNotes = String(notes || '').trim()
  if (!cleanCycle) return cleanNotes
  return `Cycle: ${cleanCycle}${cleanNotes ? `\n\n${cleanNotes}` : ''}`
}

function workoutCycle(pw, fallback = 'Current Cycle') {
  return parseWorkoutNotes(pw?.workouts?.notes).cycle || fallback
}

export default function Programs({ user, profile }) {
  const isCoach = profile?.role === 'coach'
  const hasProgramAccess = canSeeWorkouts(profile)
  // Always treat as coach if role hasn't loaded yet and user created the program
  const canSeeAll = isCoach
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
  const [existingCycle, setExistingCycle] = useState('')
  const [wTitle, setWTitle] = useState('')
  const [wCycle, setWCycle] = useState('')
  const [wNotes, setWNotes] = useState('')
  const [wSecs, setWSecs] = useState([newSec()])
  const [imagePreview, setImagePreview] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeErr, setTranscribeErr] = useState('')
  const [loggingPw, setLoggingPw] = useState(null)
  const [editingPw, setEditingPw] = useState(null)
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0])
  const [logNote, setLogNote] = useState('')
  const [demoVideo, setDemoVideo] = useState(null)
  const [sectionLogs, setSectionLogs] = useState({})
  const [completedOpen, setCompletedOpen] = useState(false)
  const [collapsedCycles, setCollapsedCycles] = useState({})
  const [collapsedWorkouts, setCollapsedWorkouts] = useState({})
  const fileRef = useRef()

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const fetchPrograms = useCallback(async () => {
    setLoading(true)
    if (!hasProgramAccess) {
      setPrograms([])
      setLoading(false)
      return
    }
    const { data, error } = await supabase.from('programs').select('*, profiles!programs_athlete_id_fkey(name, avatar_url)').order('created_at', { ascending: false })

    setPrograms(data || [])
    setLoading(false)
  }, [hasProgramAccess])

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
      .select('*, workouts(id, title, notes, track, workout_sections(*, section_logs(*), movements(*, sets(*, set_logs(*)))))')
      .eq('program_id', programId)
      .order('order_index')
    setProgramWorkouts(data || [])
  }, [])

  useEffect(() => { if (selectedProgram) fetchProgramWorkouts(selectedProgram.id) }, [selectedProgram, fetchProgramWorkouts])

  useEffect(() => {
    if (!selectedProgram) return
    try {
      setCollapsedCycles(JSON.parse(window.localStorage.getItem(cycleStorageKey(selectedProgram.id)) || '{}'))
      setCollapsedWorkouts(JSON.parse(window.localStorage.getItem(workoutStorageKey(selectedProgram.id)) || '{}'))
    } catch {
      setCollapsedCycles({})
      setCollapsedWorkouts({})
    }
    setCompletedOpen(false)
  }, [selectedProgram])

  const updateCollapsedCycles = updater => {
    setCollapsedCycles(current => {
      const next = typeof updater === 'function' ? updater(current) : updater
      try {
        if (selectedProgram && typeof window !== 'undefined') window.localStorage.setItem(cycleStorageKey(selectedProgram.id), JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const updateCollapsedWorkouts = updater => {
    setCollapsedWorkouts(current => {
      const next = typeof updater === 'function' ? updater(current) : updater
      try {
        if (selectedProgram && typeof window !== 'undefined') window.localStorage.setItem(workoutStorageKey(selectedProgram.id), JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const toggleCycle = cycle => updateCollapsedCycles(current => ({ ...current, [cycle]: !current[cycle] }))
  const toggleWorkout = pwId => updateCollapsedWorkouts(current => ({ ...current, [pwId]: !current[pwId] }))

  const logSetValue = async (setId, movementId, workoutId, value) => {
    const { error } = await supabase.from('set_logs').upsert(
      { set_id: setId, movement_id: movementId, workout_id: workoutId, athlete_id: user.id, value },
      { onConflict: 'set_id,athlete_id' }
    )
    if (!error) { showToast('Logged!'); fetchProgramWorkouts(selectedProgram.id) }
    else showToast('Error: ' + error.message)
  }

  const logSectionScore = async (sectionId, workoutId, payload) => {
    const { error } = await supabase.from('section_logs').upsert(
      { section_id: sectionId, workout_id: workoutId, athlete_id: user.id, ...payload },
      { onConflict: 'section_id,athlete_id' }
    )
    if (!error) { showToast('Logged!'); fetchProgramWorkouts(selectedProgram.id) }
    else showToast('Error: ' + error.message)
  }

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
      .insert({ title: wTitle.trim(), notes: composeWorkoutNotes(wCycle || selectedProgram.name, wNotes), track: 'Private', assigned_athlete_id: selectedProgram.athlete_id })
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
        const { data: movement } = await supabase.from('movements').insert({ section_id: section.id, name: mov.name, notes: mov.notes, demo_url: mov.demo_url || null, scheme: mov.scheme || 'reps', order_index: mi }).select().single()
        if (!movement) continue
        const validSets = mov.sets.filter(st => st.reps || st.load)
        if (validSets.length > 0) await supabase.from('sets').insert(validSets.map((st, idx) => ({ movement_id: movement.id, set_number: st.set_number, reps: st.reps, load: st.load, rpe: st.rpe, order_index: idx })))
      }
    }
    const nextOrder = programWorkouts.length + 1
    await supabase.from('program_workouts').insert({ program_id: selectedProgram.id, workout_id: workout.id, order_index: nextOrder })
    fetchProgramWorkouts(selectedProgram.id)
    setAddMode(null); setWTitle(''); setWCycle(''); setWNotes(''); setWSecs([newSec()]); setImagePreview(null)
    showToast('Workout added!')
  }

  const addExistingWorkout = async () => {
    if (!selectedExisting) return
    const sourceId = parseInt(selectedExisting)
    const { data: source, error: sourceErr } = await supabase
      .from('workouts')
      .select('id, title, notes, workout_sections(*, movements(*, sets(*)))')
      .eq('id', sourceId)
      .single()

    if (sourceErr || !source) { showToast('Could not copy workout'); return }

    const parsedNotes = parseWorkoutNotes(source.notes)
    const { data: workout, error: wErr } = await supabase.from('workouts')
      .insert({
        title: source.title,
        notes: composeWorkoutNotes(existingCycle || parsedNotes.cycle || selectedProgram.name, parsedNotes.notes),
        track: 'Private',
        assigned_athlete_id: selectedProgram.athlete_id
      })
      .select()
      .single()
    if (wErr || !workout) { showToast('Error: ' + (wErr?.message || 'Could not create copy')); return }

    const sections = (source.workout_sections || []).sort((a, b) => a.order_index - b.order_index)
    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si]
      const { data: section } = await supabase
        .from('workout_sections')
        .insert({ workout_id: workout.id, type: sec.type, score_type: sec.score_type, notes: sec.notes, order_index: si })
        .select()
        .single()
      if (!section) continue

      const movements = (sec.movements || []).sort((a, b) => a.order_index - b.order_index)
      for (let mi = 0; mi < movements.length; mi++) {
        const mov = movements[mi]
        const { data: movement } = await supabase
          .from('movements')
          .insert({ section_id: section.id, name: mov.name, notes: mov.notes, demo_url: mov.demo_url || null, scheme: mov.scheme || 'reps', order_index: mi })
          .select()
          .single()
        if (!movement) continue

        const sets = (mov.sets || []).sort((a, b) => a.order_index - b.order_index)
        if (sets.length > 0) {
          await supabase.from('sets').insert(sets.map((st, idx) => ({
            movement_id: movement.id,
            set_number: st.set_number || idx + 1,
            reps: st.reps || '',
            load: st.load || '',
            rpe: st.rpe || '',
            order_index: idx
          })))
        }
      }
    }

    const nextOrder = programWorkouts.length + 1
    const { error } = await supabase.from('program_workouts').insert({ program_id: selectedProgram.id, workout_id: workout.id, order_index: nextOrder })
    if (!error) {
      fetchProgramWorkouts(selectedProgram.id)
      setSelectedExisting('')
      setExistingCycle('')
      setAddMode(null)
      showToast('Copied into program')
    } else {
      showToast('Error: ' + error.message)
    }
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
      setWSecs((parsed.sections || [newSec()]).map(sec => ({ id: Date.now() + Math.random(), type: STYPES.includes(sec.type) ? sec.type : 'Strength', score_type: SCORE_TYPES.includes(sec.score_type) ? sec.score_type : 'No Score', notes: sec.notes || '', movements: (sec.movements || []).map(mov => ({ id: Date.now() + Math.random(), name: mov.name || '', notes: mov.notes || '', scheme: mov.scheme || 'reps', sets: (mov.sets || []).map((st, idx) => ({ id: Date.now() + Math.random(), set_number: st.set_number || idx + 1, reps: String(st.reps || ''), load: String(st.load || ''), rpe: String(st.rpe || '') })) })) })))
    } catch (e) { setTranscribeErr('Could not read photo. Edit manually.'); setWSecs([newSec()]) }
    setTranscribing(false)
  }

  const updSec = (i, f, v) => setWSecs(s => s.map((x, j) => j === i ? { ...x, [f]: v } : x))
  const addSec = () => setWSecs(s => [...s, newSec()])

  const moveSec = (i, dir) => {
    const next = i + dir
    if (next < 0 || next >= wSecs.length) return
    const arr = [...wSecs]
    const tmp = arr[i]; arr[i] = arr[next]; arr[next] = tmp
    setWSecs(arr)
  }
  const rmSec = i => setWSecs(s => s.filter((_, j) => j !== i))
  const addMov = i => setWSecs(s => s.map((x, j) => j === i ? { ...x, movements: [...x.movements, newMov()] } : x))
  const rmMov = (si, mi) => setWSecs(s => s.map((x, j) => j === si ? { ...x, movements: x.movements.filter((_, k) => k !== mi) } : x))
  const updMov = (si, mi, f, v) => setWSecs(s => s.map((x, j) => j === si ? { ...x, movements: x.movements.map((m, k) => k === mi ? { ...m, [f]: v } : m) } : x))
  const addSet = (si, mi) => setWSecs(s => s.map((x, j) => j === si ? { ...x, movements: x.movements.map((m, k) => k === mi ? { ...m, sets: [...m.sets, newSet(m.sets.length + 1)] } : m) } : x))
  const rmSet = (si, mi, sti) => setWSecs(s => s.map((x, j) => j === si ? { ...x, movements: x.movements.map((m, k) => k === mi ? { ...m, sets: m.sets.filter((_, l) => l !== sti).map((st, l) => ({ ...st, set_number: l + 1 })) } : m) } : x))
  const copyDown = (si, mi, sti, f) => setWSecs(s => s.map((x, j) => j !== si ? x : { ...x, movements: x.movements.map((m, k) => k !== mi ? m : { ...m, sets: m.sets.map((st, l) => l <= sti ? st : { ...st, [f]: m.sets[sti][f] }) }) }))
  const updSet = (si, mi, sti, f, v) => setWSecs(s => s.map((x, j) => j === si ? { ...x, movements: x.movements.map((m, k) => k === mi ? { ...m, sets: m.sets.map((st, l) => l === sti ? { ...st, [f]: v } : st) } : m) } : x))
  const setSetCount = (si, mi, count) => setWSecs(s => s.map((x, j) => j === si ? { ...x, movements: x.movements.map((m, k) => {
    if (k !== mi) return m
    const next = quickSets(count).map((st, idx) => ({ ...st, ...(m.sets[idx] || {}), id: m.sets[idx]?.id || st.id, set_number: idx + 1 }))
    return { ...m, sets: next }
  }) } : x))
  const completedCount = programWorkouts.filter(pw => pw.completed_at).length
  const activeProgramWorkouts = programWorkouts.filter(pw => !pw.completed_at)
  const completedProgramWorkouts = programWorkouts.filter(pw => pw.completed_at)
  const cycleGroups = activeProgramWorkouts.reduce((groups, pw) => {
    const cycle = workoutCycle(pw, selectedProgram?.name || 'Current Cycle')
    if (!groups[cycle]) groups[cycle] = []
    groups[cycle].push(pw)
    return groups
  }, {})

  const renderProgramWorkout = (pw, idx, options = {}) => {
    const parsedNotes = parseWorkoutNotes(pw.workouts?.notes)
    const isCollapsed = collapsedWorkouts[pw.id]

    return (
      <div key={pw.id} className="workout-card" style={{ marginBottom: '10px', opacity: pw.completed_at ? 0.75 : 1 }}>
        <div style={{ padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', color: 'var(--charcoal-light)', minWidth: '28px', paddingTop: '2px' }}>{options.completed ? '✓' : idx + 1}</div>
            <div style={{ flex: 1 }}>
              <button
                onClick={() => toggleWorkout(pw.id)}
                style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', width: '100%' }}
              >
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: pw.completed_at ? 'var(--moss-light)' : 'var(--gold-light)', marginBottom: '4px' }}>
                  {isCollapsed ? '▸ ' : '▾ '}{pw.completed_at && '✓ '}{pw.workouts?.title}
                </div>
              </button>
              {pw.completed_at && (
                <div style={{ fontSize: '12px', color: 'var(--moss-light)', marginBottom: '6px' }}>
                  Completed {new Date(pw.completed_at).toLocaleDateString()}{pw.completion_note && ` · ${pw.completion_note}`}
                </div>
              )}
              {!isCollapsed && (
                <>
                  {parsedNotes.notes && <div style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginBottom: '8px', whiteSpace: 'pre-line' }}>{parsedNotes.notes}</div>}
                  {(pw.workouts?.workout_sections || []).sort((a, b) => a.order_index - b.order_index).map((sec, si) => {
                    const mySecLog = (sec.section_logs || []).find(sl => sl.athlete_id === user.id)
                    const scoreType = sec.score_type || 'No Score'
                    return (
                      <div key={si} style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '10px', letterSpacing: '2px', color: 'var(--gold-dark)', textTransform: 'uppercase', marginBottom: '6px' }}>{sec.type}{scoreType !== 'No Score' && ` · ${scoreType}`}</div>
                        {sec.notes && <div style={{ fontSize: '12px', color: 'var(--charcoal-light)', marginBottom: '6px', fontStyle: 'italic' }}>{sec.notes}</div>}
                        {(sec.movements || []).map((m, mi) => (
                          <div key={mi} style={{ paddingLeft: '8px', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '13px', color: 'var(--bone)', fontWeight: '500' }}>{m.name}</span>
                              {m.demo_url && (
                                <button onClick={e => { e.stopPropagation(); setDemoVideo({ url: m.demo_url, title: m.name }) }}
                                  style={{ background: 'rgba(162,92,107,0.2)', border: '1px solid var(--rose)', borderRadius: '2px', color: 'var(--rose-light)', fontSize: '11px', padding: '2px 8px', cursor: 'pointer', letterSpacing: '1px', whiteSpace: 'nowrap' }}>
                                  ▶ Demo
                                </button>
                              )}
                            </div>
                            {m.notes && <div style={{ fontSize: '12px', color: 'var(--charcoal-light)', marginBottom: '4px', fontStyle: 'italic' }}>{m.notes}</div>}
                            {(m.sets || []).map((st, sti) => {
                              const myLog = (st.set_logs || []).find(sl => sl.athlete_id === user.id)
                              const isAccessoryPrescription = sec.type === 'Accessory' && (m.sets || []).length === 1 && st.reps && !st.load && !st.rpe
                              return (
                                <div key={sti} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', fontSize: '13px' }}>
                                  {isAccessoryPrescription ? (
                                    <span style={{ color: 'var(--bone)' }}>{st.reps}</span>
                                  ) : (
                                    <>
                                      <span style={{ color: 'var(--charcoal-light)', fontFamily: 'Cinzel, serif', fontSize: '11px', minWidth: '40px' }}>Set {st.set_number}</span>
                                      {st.reps && <span style={{ color: 'var(--bone)' }}>{formatPrescriptionValue(st.reps, m.scheme)}</span>}
                                      {st.load && <span style={{ color: 'var(--charcoal-light)', fontSize: '12px' }}>@ {st.load}</span>}
                                      {st.rpe && <span style={{ color: 'var(--charcoal-light)', fontSize: '12px' }}>RPE {st.rpe}</span>}
                                    </>
                                  )}
                                  <SetLogInput value={myLog?.value || ''} onSave={val => logSetValue(st.id, m.id, pw.workouts.id, val)} />
                                </div>
                              )
                            })}
                          </div>
                        ))}
                        <ProgramSectionNotesInput myLog={mySecLog} onSave={notes => logSectionScore(sec.id, pw.workouts.id, { score: mySecLog?.score || null, rounds: mySecLog?.rounds || null, reps: mySecLog?.reps || null, notes })} />
                      </div>
                    )
                  })}
                </>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', flexShrink: 0 }}>
              <button className="btn-ghost" style={{ fontSize: '10px' }} onClick={() => toggleWorkout(pw.id)}>{isCollapsed ? 'Open' : 'Collapse'}</button>
              {pw.completed_at
                ? <button className="btn-ghost" style={{ fontSize: '10px' }} onClick={() => uncomplete(pw.id)}>Undo</button>
                : <button className="btn-sm" style={{ fontSize: '11px' }} onClick={() => { setLoggingPw(pw); setLogDate(new Date().toISOString().split('T')[0]); setLogNote('') }}>Log & Done</button>
              }
              {isCoach && <button className="btn-ghost" style={{ fontSize: '10px' }} onClick={() => {
                const w = pw.workouts
                const parsedWorkoutNotes = parseWorkoutNotes(w?.notes)
                setWTitle(w?.title || '')
                setWCycle(parsedWorkoutNotes.cycle || selectedProgram.name)
                setWNotes(parsedWorkoutNotes.notes || '')
                setWSecs((w?.workout_sections || []).sort((a,b) => a.order_index - b.order_index).map(sec => ({
                  id: Date.now() + Math.random(), type: sec.type, score_type: sec.score_type || 'No Score', notes: sec.notes || '',
                  movements: (sec.movements || []).sort((a,b) => a.order_index - b.order_index).map(mov => ({
                    id: Date.now() + Math.random(), name: mov.name, notes: mov.notes || '', scheme: mov.scheme || 'reps',
                    sets: (mov.sets || []).sort((a,b) => a.order_index - b.order_index).map(st => ({ id: Date.now() + Math.random(), set_number: st.set_number, reps: st.reps || '', load: st.load || '', rpe: st.rpe || '' }))
                  }))
                })) || [newSec()])
                setEditingPw(pw)
                setAddMode('edit')
              }}>Edit</button>}
              {isCoach && <button className="btn-ghost" style={{ fontSize: '10px', color: 'var(--rose)' }} onClick={() => removeFromProgram(pw.id)}>Remove</button>}
            </div>
          </div>
        </div>
      </div>
    )
  }

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
            <button className="btn-sm" onClick={() => { setAddMode('scratch'); setWTitle(''); setWCycle(selectedProgram.name); setWNotes(''); setWSecs([newSec()]) }}>+ Build Workout</button>
            <button className="btn-moss" onClick={() => { setAddMode('photo'); setImagePreview(null); setWTitle(''); setWCycle(selectedProgram.name); setWNotes(''); setWSecs([newSec()]) }}>📷 Upload Photo</button>
            <button className="btn-ghost" onClick={() => { setAddMode('existing'); setExistingCycle(selectedProgram.name) }}>+ Copy Existing</button>
          </div>
        )}

        {isCoach && addMode === 'existing' && (
          <div className="panel" style={{ marginBottom: '1.5rem' }}>
            <div className="panel-title">Copy Existing Workout</div>
            <div className="field">
              <label>Cycle</label>
              <input type="text" value={existingCycle} onChange={e => setExistingCycle(e.target.value)} placeholder="e.g. Babes Who Fight Bears" />
            </div>
            <div className="field">
              <label>Select Workout To Copy</label>
              <select value={selectedExisting} onChange={e => setSelectedExisting(e.target.value)}>
                <option value="">Choose...</option>
                {availableWorkouts.map(w => <option key={w.id} value={w.id}>{w.title}{w.date ? ` (${w.date})` : ''}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-sm" onClick={addExistingWorkout} disabled={!selectedExisting}>Copy Into Program</button>
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
              <WorkoutBuilder imagePreview={imagePreview} title={wTitle} setTitle={setWTitle} cycle={wCycle} setCycle={setWCycle} notes={wNotes} setNotes={setWNotes} secs={wSecs} updSec={updSec} addSec={addSec} rmSec={rmSec} moveSec={moveSec} addMov={addMov} rmMov={rmMov} updMov={updMov} addSet={addSet} rmSet={rmSet} updSet={updSet} copyDown={copyDown} setSetCount={setSetCount} onSave={saveWorkoutToProgram} onCancel={() => setAddMode(null)} />
            )}
          </div>
        )}

        {isCoach && addMode === 'edit' && editingPw && (
          <div className="panel" style={{ marginBottom: '1.5rem' }}>
            <div className="panel-title">Edit Workout</div>
            <WorkoutBuilder title={wTitle} setTitle={setWTitle} cycle={wCycle} setCycle={setWCycle} notes={wNotes} setNotes={setWNotes} secs={wSecs} updSec={updSec} addSec={addSec} rmSec={rmSec} moveSec={moveSec} addMov={addMov} rmMov={rmMov} updMov={updMov} addSet={addSet} rmSet={rmSet} updSet={updSet} copyDown={copyDown} setSetCount={setSetCount}
              onSave={async () => {
                if (!wTitle.trim()) { return }
                const wid = editingPw.workouts?.id
                await supabase.from('workouts').update({ title: wTitle.trim(), notes: composeWorkoutNotes(wCycle || selectedProgram.name, wNotes) }).eq('id', wid)
                await supabase.from('workout_sections').delete().eq('workout_id', wid)
                for (let si = 0; si < wSecs.length; si++) {
                  const sec = wSecs[si]
                  const validMovs = sec.movements.filter(m => m.name.trim())
                  if (!validMovs.length) continue
                  const { data: section } = await supabase.from('workout_sections').insert({ workout_id: wid, type: sec.type, score_type: sec.score_type, notes: sec.notes, order_index: si }).select().single()
                  if (!section) continue
                  for (let mi = 0; mi < validMovs.length; mi++) {
                    const mov = validMovs[mi]
                    const { data: movement } = await supabase.from('movements').insert({ section_id: section.id, name: mov.name, notes: mov.notes, demo_url: mov.demo_url || null, scheme: mov.scheme || 'reps', order_index: mi }).select().single()
                    if (!movement) continue
                    const validSets = mov.sets.filter(st => st.reps || st.load)
                    if (validSets.length > 0) await supabase.from('sets').insert(validSets.map((st, idx) => ({ movement_id: movement.id, set_number: st.set_number, reps: st.reps, load: st.load, rpe: st.rpe, order_index: idx })))
                  }
                }
                setAddMode(null); setEditingPw(null); setWTitle(''); setWCycle(''); setWNotes(''); setWSecs([newSec()])
                fetchProgramWorkouts(selectedProgram.id)
              }}
              onCancel={() => { setAddMode(null); setEditingPw(null) }} />
          </div>
        )}

        {isCoach && addMode === 'scratch' && (
          <div className="panel" style={{ marginBottom: '1.5rem' }}>
            <div className="panel-title">Build Workout</div>
            <WorkoutBuilder title={wTitle} setTitle={setWTitle} cycle={wCycle} setCycle={setWCycle} notes={wNotes} setNotes={setWNotes} secs={wSecs} updSec={updSec} addSec={addSec} rmSec={rmSec} moveSec={moveSec} addMov={addMov} rmMov={rmMov} updMov={updMov} addSet={addSet} rmSet={rmSet} updSet={updSet} copyDown={copyDown} setSetCount={setSetCount} onSave={saveWorkoutToProgram} onCancel={() => setAddMode(null)} />
          </div>
        )}

        {programWorkouts.length === 0 && addMode === null && (
          <div className="empty">
            <h3>No workouts yet</h3>
            <p>{isCoach ? 'Add workouts above.' : 'Your coach is building your program.'}</p>
          </div>
        )}

        {Object.entries(cycleGroups).map(([cycle, workouts]) => {
          const collapsed = collapsedCycles[cycle]
          return (
            <div key={cycle} className="panel" style={{ marginBottom: '1rem' }}>
              <button
                onClick={() => toggleCycle(cycle)}
                style={{ width: '100%', background: 'transparent', border: 'none', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', cursor: 'pointer', textAlign: 'left' }}
              >
                <div>
                  <div className="panel-title" style={{ marginBottom: '4px' }}>{collapsed ? '▸' : '▾'} {cycle}</div>
                  <div style={{ fontSize: '12px', color: 'var(--charcoal-light)' }}>
                    {workouts.length} active workout{workouts.length === 1 ? '' : 's'}
                  </div>
                </div>
                <span style={{ color: 'var(--gold-dark)', fontSize: '18px' }}>{collapsed ? '+' : '−'}</span>
              </button>
              {!collapsed && (
                <div style={{ marginTop: '1rem' }}>
                  {workouts.map((pw, idx) => renderProgramWorkout(pw, idx))}
                </div>
              )}
            </div>
          )
        })}

        {completedProgramWorkouts.length > 0 && (
          <div className="panel" style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => setCompletedOpen(open => !open)}
              style={{ width: '100%', background: 'transparent', border: 'none', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', cursor: 'pointer', textAlign: 'left' }}
            >
              <div>
                <div className="panel-title" style={{ marginBottom: '4px' }}>{completedOpen ? '▾' : '▸'} Completed</div>
                <div style={{ fontSize: '12px', color: 'var(--charcoal-light)' }}>
                  {completedProgramWorkouts.length} finished workout{completedProgramWorkouts.length === 1 ? '' : 's'}
                </div>
              </div>
              <span style={{ color: 'var(--moss-light)', fontSize: '18px' }}>{completedOpen ? '−' : '+'}</span>
            </button>
            {completedOpen && (
              <div style={{ marginTop: '1rem' }}>
                {completedProgramWorkouts.map((pw, idx) => renderProgramWorkout(pw, idx, { completed: true }))}
              </div>
            )}
          </div>
        )}

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

        {demoVideo && <VideoModal url={demoVideo.url} title={demoVideo.title} onClose={() => setDemoVideo(null)} />}
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

      {!hasProgramAccess && (
        <div className="empty">
          <h3>Membership Required</h3>
          <p>Programs are reserved for active paid members. Upgrade in Profile when you're ready for full training access.</p>
        </div>
      )}

      {hasProgramAccess && isCoach && showNewProgram && (
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

      {hasProgramAccess && loading && <div className="loading">Loading...</div>}

      {hasProgramAccess && !loading && programs.length === 0 && (
        <div className="empty">
          <h3>No programs yet</h3>
          <p>{isCoach ? 'Create a program above.' : 'Your coach hasn\'t assigned a program yet.'}</p>
        </div>
      )}

      {hasProgramAccess && programs.filter(p => canSeeAll || p.athlete_id === user.id || !p.athlete_id || p.created_by === user.id).map(p => (
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


function SetLogInput({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value || '')
  useEffect(() => { setVal(value || '') }, [value])
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)}
        style={{ marginLeft: 'auto', background: val ? 'rgba(200,169,106,0.1)' : 'transparent', border: '1px solid', borderColor: val ? 'var(--gold-dark)' : 'var(--border)', borderRadius: '2px', color: val ? 'var(--gold-light)' : 'var(--charcoal-light)', padding: '3px 10px', cursor: 'pointer', fontSize: '13px', fontFamily: val ? 'Cinzel, serif' : 'Lato, sans-serif', whiteSpace: 'nowrap', minWidth: '60px', textAlign: 'center' }}>
        {val || 'Log'}
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', alignItems: 'center' }}>
      <input autoFocus type="text" value={val} onChange={e => setVal(e.target.value)} placeholder="lbs/kg"
        onKeyDown={e => { if (e.key === 'Enter') { onSave(val); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        style={{ width: '80px', background: 'rgba(245,240,232,0.06)', border: '1px solid var(--gold)', borderRadius: '2px', padding: '4px 8px', color: 'var(--bone)', fontFamily: 'Lato, sans-serif', fontSize: '13px', outline: 'none' }} />
      <button onClick={() => { onSave(val); setEditing(false) }} className="btn-sm" style={{ padding: '4px 8px', fontSize: '11px' }}>✓</button>
    </div>
  )
}

function ProgramSectionNotesInput({ myLog, onSave }) {
  const [editing, setEditing] = useState(false)
  const [notes, setNotes] = useState(myLog?.notes || '')
  useEffect(() => { setNotes(myLog?.notes || '') }, [myLog])
  if (!editing) {
    return (
      <div style={{ marginTop: '8px' }}>
        <button onClick={() => setEditing(true)}
          style={{ background: 'transparent', border: 'none', color: myLog?.notes ? 'var(--moss-light)' : 'var(--charcoal-light)', cursor: 'pointer', fontSize: '12px', letterSpacing: '1px', padding: '2px 0', textAlign: 'left' }}>
          {myLog?.notes ? `📝 ${myLog.notes}` : '+ Add scaling / notes'}
        </button>
      </div>
    )
  }
  return (
    <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
      <input autoFocus type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Scaling, notes..."
        onKeyDown={e => { if (e.key === 'Enter') { onSave(notes); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        style={{ flex: 1, background: 'rgba(245,240,232,0.06)', border: '1px solid var(--gold)', borderRadius: '2px', padding: '6px 10px', color: 'var(--bone)', fontFamily: 'Lato, sans-serif', fontSize: '13px', outline: 'none' }} />
      <button onClick={() => { onSave(notes); setEditing(false) }} className="btn-sm" style={{ padding: '6px 10px', fontSize: '11px' }}>✓</button>
      <button onClick={() => setEditing(false)} className="btn-ghost" style={{ padding: '6px 10px', fontSize: '11px' }}>✕</button>
    </div>
  )
}

function WorkoutBuilder({ title, setTitle, cycle, setCycle, notes, setNotes, secs, updSec, addSec, rmSec, moveSec, addMov, rmMov, updMov, addSet, rmSet, updSet, copyDown, setSetCount, onSave, onCancel, imagePreview }) {
  return (
    <div>
      {imagePreview && <img src={imagePreview} alt="Workout" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border)', marginBottom: '1rem' }} />}
      <div className="field"><label>Title</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Workout title" /></div>
      <div className="field"><label>Cycle</label><input type="text" value={cycle || ''} onChange={e => setCycle(e.target.value)} placeholder="e.g. Babes Who Fight Bears" /></div>
      <div className="field"><label>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Intent, coaching notes..." /></div>
      <span className="sb-label">Sections</span>
      {secs.map((sec, si) => (
        <div key={sec.id} className="ws-block">
          <div className="ws-head">
            <select value={sec.type} onChange={e => updSec(si, 'type', e.target.value)}>{STYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <select value={sec.score_type} onChange={e => updSec(si, 'score_type', e.target.value)} style={{ flex: 'none', width: 'auto' }}>{SCORE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            {secs.length > 1 && (
                <>
                  <button className="btn-rm" onClick={() => moveSec(si, -1)} disabled={si === 0} title="Move up" style={{ fontSize: '14px' }}>↑</button>
                  <button className="btn-rm" onClick={() => moveSec(si, 1)} disabled={si === secs.length - 1} title="Move down" style={{ fontSize: '14px' }}>↓</button>
                  <button className="btn-rm" onClick={() => rmSec(si)}>×</button>
                </>
              )}
          </div>
          <input className="ws-notes" type="text" value={sec.notes} onChange={e => updSec(si, 'notes', e.target.value)} placeholder="Section notes (optional)" />
          {sec.type === 'Accessory' && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <button className="btn-ghost" style={{ fontSize: '11px' }} onClick={() => updSec(si, 'notes', '3 Rounds')}>3 Rounds</button>
              <button className="btn-ghost" style={{ fontSize: '11px' }} onClick={() => updSec(si, 'notes', '4 Rounds')}>4 Rounds</button>
              <button className="btn-ghost" style={{ fontSize: '11px' }} onClick={() => updSec(si, 'notes', '5 Rounds')}>5 Rounds</button>
            </div>
          )}
          {sec.type !== 'Warm-Up' && sec.movements.map((mov, mi) => {
            const prescriptionMeta = getPrescriptionMeta(mov.scheme)
            return (
              <div key={mov.id} className="mv-block">
                <div className="mv-block-header">
                  <input type="text" value={mov.name} onChange={e => updMov(si, mi, 'name', e.target.value)} placeholder={sec.type === 'Accessory' ? "Movement name (e.g. Farmer's Carry)" : 'Movement name'} />
                  {sec.movements.length > 1 && <button className="btn-rm" onClick={() => rmMov(si, mi)}>×</button>}
                </div>
                <div className="field" style={{ marginBottom: '8px' }}>
                  <label>Prescription Type</label>
                  <select value={mov.scheme || 'reps'} onChange={e => updMov(si, mi, 'scheme', e.target.value)}>
                    {PRESCRIPTION_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>
                <input className="mv-block-notes" type="text" value={mov.notes} onChange={e => updMov(si, mi, 'notes', e.target.value)} placeholder="Movement notes (optional)" />
                <input className="mv-block-notes" type="text" value={mov.demo_url || ''} onChange={e => updMov(si, mi, 'demo_url', e.target.value)} placeholder="YouTube demo URL (optional)" />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {[3, 4, 5].map(count => (
                    <button key={count} className="btn-ghost" style={{ fontSize: '10px' }} onClick={() => setSetCount(si, mi, count)}>
                      {count} Sets
                    </button>
                  ))}
                </div>
                <div className="set-builder-header"><span>Set</span><span>{prescriptionMeta.label}</span><span>Load / %</span><span>RPE</span><span></span></div>
                {mov.sets.map((st, sti) => (
                  <div key={st.id} className="set-builder-row">
                    <span className="set-num-label">{st.set_number}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <input type="text" value={st.reps} onChange={e => updSet(si, mi, sti, 'reps', e.target.value)} placeholder={prescriptionMeta.placeholder} style={{ flex: 1 }} />
                      {sti < mov.sets.length - 1 && <button onClick={() => copyDown(si, mi, sti, 'reps')} title="Copy to all below" style={{ background: 'none', border: 'none', color: 'var(--charcoal-light)', cursor: 'pointer', fontSize: '12px', padding: '2px', flexShrink: 0 }}>↓</button>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <input type="text" value={st.load} onChange={e => updSet(si, mi, sti, 'load', e.target.value)} placeholder={sec.type === 'Accessory' ? 'optional' : '80%'} style={{ flex: 1 }} />
                      {sti < mov.sets.length - 1 && <button onClick={() => copyDown(si, mi, sti, 'load')} title="Copy to all below" style={{ background: 'none', border: 'none', color: 'var(--charcoal-light)', cursor: 'pointer', fontSize: '12px', padding: '2px', flexShrink: 0 }}>↓</button>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <input type="text" value={st.rpe} onChange={e => updSet(si, mi, sti, 'rpe', e.target.value)} placeholder={sec.type === 'Accessory' ? 'optional' : '8'} style={{ flex: 1 }} />
                      {sti < mov.sets.length - 1 && <button onClick={() => copyDown(si, mi, sti, 'rpe')} title="Copy to all below" style={{ background: 'none', border: 'none', color: 'var(--charcoal-light)', cursor: 'pointer', fontSize: '12px', padding: '2px', flexShrink: 0 }}>↓</button>}
                    </div>
                    {mov.sets.length > 1 && <button className="btn-rm" onClick={() => rmSet(si, mi, sti)}>×</button>}
                  </div>
                ))}
                <button className="btn-add" onClick={() => addSet(si, mi)}>+ Add Set</button>
              </div>
            )
          })}
          {sec.type !== 'Warm-Up' && <button className="btn-add" style={{ marginTop: '8px' }} onClick={() => addMov(si)}>+ Add Movement</button>}
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
