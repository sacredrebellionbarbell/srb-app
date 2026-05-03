import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export default function Programs({ user, profile }) {
  const isCoach = profile?.role === 'coach'
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProgram, setSelectedProgram] = useState(null)
  const [programWorkouts, setProgramWorkouts] = useState([])
  const [showNewProgram, setShowNewProgram] = useState(false)
  const [toast, setToast] = useState(null)

  // New program form
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newAthlete, setNewAthlete] = useState('')
  const [members, setMembers] = useState([])

  // Add workout to program
  const [showAddWorkout, setShowAddWorkout] = useState(false)
  const [availableWorkouts, setAvailableWorkouts] = useState([])
  const [selectedWorkout, setSelectedWorkout] = useState('')
  const [addWeek, setAddWeek] = useState(1)
  const [addDay, setAddDay] = useState(1)

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const fetchPrograms = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('programs')
      .select('*, profiles(name, avatar_url)')
      .order('created_at', { ascending: false })
    setPrograms(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPrograms()
    if (isCoach) {
      supabase.from('profiles').select('id, name').order('name').then(({ data }) => setMembers(data || []))
      supabase.from('workouts').select('id, title, date, track').order('date', { ascending: false }).limit(100)
        .then(({ data }) => setAvailableWorkouts(data || []))
    }
  }, [fetchPrograms, isCoach])

  const fetchProgramWorkouts = useCallback(async (programId) => {
    const { data } = await supabase
      .from('program_workouts')
      .select(`
        *,
        workouts(
          id, title, notes, track,
          workout_sections(*, movements(*, sets(*)))
        )
      `)
      .eq('program_id', programId)
      .order('week_number')
      .order('day_number')
    setProgramWorkouts(data || [])
  }, [])

  useEffect(() => {
    if (selectedProgram) fetchProgramWorkouts(selectedProgram.id)
  }, [selectedProgram, fetchProgramWorkouts])

  const createProgram = async () => {
    if (!newName.trim()) return
    const { data, error } = await supabase.from('programs').insert({
      name: newName.trim(),
      description: newDesc.trim(),
      athlete_id: newAthlete || null,
      created_by: user.id
    }).select('*, profiles(name)').single()
    if (!error && data) {
      setPrograms(prev => [data, ...prev])
      setNewName(''); setNewDesc(''); setNewAthlete('')
      setShowNewProgram(false)
      showToast('Program created')
    }
  }

  const addWorkoutToProgram = async () => {
    if (!selectedWorkout || !selectedProgram) return
    const { error } = await supabase.from('program_workouts').insert({
      program_id: selectedProgram.id,
      workout_id: parseInt(selectedWorkout),
      week_number: addWeek,
      day_number: addDay
    })
    if (!error) {
      fetchProgramWorkouts(selectedProgram.id)
      setSelectedWorkout(''); setShowAddWorkout(false)
      showToast('Workout added')
    } else {
      showToast('That week/day slot is already taken')
    }
  }

  const removeWorkoutFromProgram = async (pwId) => {
    await supabase.from('program_workouts').delete().eq('id', pwId)
    fetchProgramWorkouts(selectedProgram.id)
    showToast('Removed')
  }

  const markComplete = async (pw) => {
    if (pw.completed_at) {
      // Uncomplete
      await supabase.from('program_workouts').update({ completed_at: null, completed_by: null }).eq('id', pw.id)
    } else {
      await supabase.from('program_workouts').update({ completed_at: new Date().toISOString(), completed_by: user.id }).eq('id', pw.id)
    }
    fetchProgramWorkouts(selectedProgram.id)
  }

  // Group program workouts by week
  const byWeek = programWorkouts.reduce((acc, pw) => {
    if (!acc[pw.week_number]) acc[pw.week_number] = []
    acc[pw.week_number].push(pw)
    return acc
  }, {})

  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b)
  const completedCount = programWorkouts.filter(pw => pw.completed_at).length
  const totalCount = programWorkouts.length

  if (selectedProgram) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={() => { setSelectedProgram(null); setProgramWorkouts([]) }}>← Back</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: 'var(--gold-light)' }}>{selectedProgram.name}</div>
            {selectedProgram.profiles?.name && (
              <div style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginTop: '2px' }}>Assigned to {selectedProgram.profiles.name}</div>
            )}
          </div>
          {totalCount > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: 'var(--gold-light)' }}>{completedCount}/{totalCount}</div>
              <div style={{ fontSize: '11px', letterSpacing: '2px', color: 'var(--charcoal-light)', textTransform: 'uppercase' }}>Complete</div>
            </div>
          )}
        </div>

        {selectedProgram.description && (
          <div style={{ background: 'rgba(245,240,232,0.04)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1rem 1.25rem', marginBottom: '1.5rem', fontSize: '14px', color: 'var(--charcoal-light)', lineHeight: 1.6 }}>
            {selectedProgram.description}
          </div>
        )}

        {/* Progress bar */}
        {totalCount > 0 && (
          <div style={{ height: '4px', background: 'rgba(245,240,232,0.08)', borderRadius: '2px', marginBottom: '1.5rem', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(completedCount / totalCount) * 100}%`, background: 'var(--gold)', borderRadius: '2px', transition: 'width 0.3s' }} />
          </div>
        )}

        {isCoach && (
          <div style={{ marginBottom: '1.5rem' }}>
            <button className="btn-sm" onClick={() => setShowAddWorkout(!showAddWorkout)}>
              {showAddWorkout ? 'Cancel' : '+ Add Workout'}
            </button>
            {showAddWorkout && (
              <div style={{ marginTop: '12px', background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1rem' }}>
                <div className="field">
                  <label>Workout</label>
                  <select value={selectedWorkout} onChange={e => setSelectedWorkout(e.target.value)}>
                    <option value="">Select a workout...</option>
                    {availableWorkouts.map(w => (
                      <option key={w.id} value={w.id}>{w.title} {w.date ? `(${w.date})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="two-col">
                  <div className="field">
                    <label>Week</label>
                    <input type="number" min="1" value={addWeek} onChange={e => setAddWeek(parseInt(e.target.value) || 1)} />
                  </div>
                  <div className="field">
                    <label>Day</label>
                    <input type="number" min="1" max="7" value={addDay} onChange={e => setAddDay(parseInt(e.target.value) || 1)} />
                  </div>
                </div>
                <button className="btn-sm" onClick={addWorkoutToProgram} disabled={!selectedWorkout}>Add to Program</button>
              </div>
            )}
          </div>
        )}

        {weeks.length === 0 && (
          <div className="empty">
            <h3>No workouts yet</h3>
            <p>{isCoach ? 'Add workouts above to build this program.' : 'Your coach is building your program.'}</p>
          </div>
        )}

        {weeks.map(week => (
          <div key={week} style={{ marginBottom: '2rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '3px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
              Week {week}
            </div>
            {byWeek[week].sort((a, b) => a.day_number - b.day_number).map(pw => (
              <div key={pw.id} className="workout-card" style={{ marginBottom: '10px', opacity: pw.completed_at ? 0.7 : 1 }}>
                <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', letterSpacing: '2px', color: 'var(--charcoal-light)', textTransform: 'uppercase', marginBottom: '4px' }}>Day {pw.day_number}</div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', color: pw.completed_at ? 'var(--moss-light)' : 'var(--gold-light)' }}>
                      {pw.completed_at && '✓ '}{pw.workouts?.title}
                    </div>
                    {pw.workouts?.notes && (
                      <div style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginTop: '4px' }}>{pw.workouts.notes}</div>
                    )}
                    {/* Show sections summary */}
                    {(pw.workouts?.workout_sections || []).sort((a, b) => a.order_index - b.order_index).map((sec, si) => (
                      <div key={si} style={{ marginTop: '6px' }}>
                        <div style={{ fontSize: '11px', letterSpacing: '2px', color: 'var(--gold-dark)', textTransform: 'uppercase' }}>{sec.type}</div>
                        {(sec.movements || []).map((m, mi) => (
                          <div key={mi} style={{ fontSize: '13px', color: 'var(--bone)', paddingLeft: '8px' }}>
                            {m.name}
                            {(m.sets || []).length > 0 && (
                              <span style={{ color: 'var(--charcoal-light)', marginLeft: '8px' }}>
                                {m.sets.length} sets
                                {m.sets[0]?.reps && ` × ${m.sets[0].reps} reps`}
                                {m.sets[0]?.load && ` @ ${m.sets[0].load}`}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                    <button
                      className={pw.completed_at ? 'btn-ghost' : 'btn-sm'}
                      style={{ fontSize: '11px', whiteSpace: 'nowrap' }}
                      onClick={() => markComplete(pw)}
                    >
                      {pw.completed_at ? 'Completed ✓' : 'Mark Done'}
                    </button>
                    {isCoach && (
                      <button className="btn-ghost" style={{ fontSize: '10px' }} onClick={() => removeWorkoutFromProgram(pw.id)}>Remove</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

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
          <div className="field"><label>Description</label><textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Goals, notes, overview..." /></div>
          <div className="field">
            <label>Assign to Client (optional)</label>
            <select value={newAthlete} onChange={e => setNewAthlete(e.target.value)}>
              <option value="">No specific client (public program)</option>
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
          <p>{isCoach ? 'Create a program above to get started.' : 'Your coach hasn\'t assigned a program yet.'}</p>
        </div>
      )}

      {programs.map(p => {
        const isMyProgram = p.athlete_id === user.id || !p.athlete_id
        if (!isCoach && !isMyProgram) return null
        return (
          <div key={p.id} className="class-card" style={{ cursor: 'pointer' }} onClick={() => setSelectedProgram(p)}>
            <div className="class-card-header">
              <div>
                <div className="class-title">{p.name}</div>
                {p.profiles?.name && (
                  <div style={{ fontSize: '12px', color: 'var(--rose-light)', marginTop: '4px' }}>👤 {p.profiles.name}</div>
                )}
                {p.description && (
                  <div style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginTop: '6px' }}>{p.description}</div>
                )}
              </div>
              <span style={{ color: 'var(--charcoal-light)', fontSize: '18px' }}>›</span>
            </div>
          </div>
        )
      })}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
