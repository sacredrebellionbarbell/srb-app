import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import PrepareModal from './PrepareModal'
import EditWorkout from './EditWorkout'
import AthletePanel from './AthletePanel'

const TC = { 'Babes Who Fight Bears': 'track-bears', 'Strong & Savage': 'track-strength', 'Olympic Weightlifting': 'track-open' }
const RX = [{ e: '✋', k: 'highfive' }, { e: '🔥', k: 'fire' }, { e: '💪', k: 'strong' }]

function formatDate(d) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) }
function toISO(d) { return d.toISOString().split('T')[0] }

function parseScore(val, scoreType) {
  if (!val) return -Infinity
  // For time: parse mm:ss into seconds
  if (scoreType === 'For Time') {
    const parts = (val || '').split(':')
    if (parts.length === 2) return -(parseInt(parts[0]) * 60 + parseInt(parts[1]))
    return -(parseFloat(val) || Infinity)
  }
  const num = parseFloat((val || '').replace(/[^\d.]/g, ''))
  return isNaN(num) ? -Infinity : num
}

function getBestScore(values, scoreType) {
  if (!values || values.length === 0) return null
  const valid = values.filter(Boolean)
  if (!valid.length) return null
  return valid.reduce((best, v) => parseScore(v, scoreType) > parseScore(best, scoreType) ? v : best, valid[0])
}

function formatSectionScore(log, scoreType) {
  if (!log) return null
  if (scoreType === 'AMRAP') {
    const parts = []
    if (log.rounds != null) parts.push(`${log.rounds} rounds`)
    if (log.reps != null) parts.push(`+ ${log.reps} reps`)
    return parts.join(' ') || null
  }
  return log.score || null
}

function sectionScoreForSort(log, scoreType) {
  if (!log) return null
  if (scoreType === 'AMRAP') {
    return `${String(log.rounds || 0).padStart(4, '0')}${String(log.reps || 0).padStart(4, '0')}`
  }
  return log.score || null
}

export default function Workouts({ user, profile }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [workouts, setWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [prepare, setPrepare] = useState(null)
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState(null)
  const [athletePanel, setAthletePanel] = useState(null)
  const isCoach = profile?.role === 'coach'

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const fetchWorkouts = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('workouts')
      .select(`
        *,
        workout_sections(
          *,
          section_logs(*, profiles(name, avatar_url)),
          movements(
            *,
            sets(*,
              set_logs(*, profiles(name, avatar_url))
            )
          )
        ),
        results(*, profiles(name, avatar_url), reactions(*))
      `)
      .eq('date', toISO(currentDate))
      .order('id', { ascending: false })
    setWorkouts(data || [])
    if (data?.length > 0) setExpandedId(data[0].id)
    setLoading(false)
  }, [currentDate])

  useEffect(() => { fetchWorkouts() }, [fetchWorkouts])

  const prevDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); setCurrentDate(d) }
  const nextDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); setCurrentDate(d) }
  const goToday = () => setCurrentDate(new Date())
  const isToday = toISO(currentDate) === toISO(new Date())
  const isFuture = toISO(currentDate) > toISO(new Date())

  const logSetValue = async (setId, movementId, workoutId, value) => {
    const { error } = await supabase.from('set_logs').upsert(
      { set_id: setId, movement_id: movementId, workout_id: workoutId, athlete_id: user.id, value },
      { onConflict: 'set_id,athlete_id' }
    )
    if (!error) { showToast('Logged!'); fetchWorkouts() }
    else showToast('Error: ' + error.message)
  }

  const logSectionScore = async (sectionId, workoutId, payload) => {
    const { error } = await supabase.from('section_logs').upsert(
      { section_id: sectionId, workout_id: workoutId, athlete_id: user.id, ...payload },
      { onConflict: 'section_id,athlete_id' }
    )
    if (!error) { showToast('Logged!'); fetchWorkouts() }
    else showToast('Error: ' + error.message)
  }

  const toggleReaction = async (resultId, type, hasReacted) => {
    if (hasReacted) {
      await supabase.from('reactions').delete().match({ result_id: resultId, athlete_id: user.id, type })
    } else {
      await supabase.from('reactions').insert({ result_id: resultId, athlete_id: user.id, type })
    }
    fetchWorkouts()
  }

  const getStrengthMovements = (workout) => {
    const sections = workout.workout_sections || []
    const strengthSecs = sections.filter(s => s.score_type === 'Heaviest Set')
    const target = strengthSecs.length > 0 ? strengthSecs : sections
    return target.flatMap(s => (s.movements || []).map(m => ({ name: m.name, sets: m.sets || [] }))).filter(m => m.name)
  }

  return (
    <div>
      <div className="date-nav">
        <button className="date-nav-btn" onClick={prevDay}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div className="date-nav-label">{formatDate(currentDate)}</div>
          {!isToday && <div className="date-nav-today" onClick={goToday}>Back to today</div>}
        </div>
        <button className="date-nav-btn" onClick={nextDay}>›</button>
      </div>

      {loading && <div className="loading">Loading...</div>}

      {!loading && workouts.length === 0 && (
        <div className="empty">
          <h3>{isFuture ? 'Nothing posted yet' : 'Rest day'}</h3>
          <p>{isFuture ? 'Check back when programming is posted.' : 'No workout posted for this day.'}</p>
        </div>
      )}

      {!loading && workouts.map(w => (
        <WorkoutCard
          key={w.id}
          workout={w}
          user={user}
          isCoach={isCoach}
          isFuture={isFuture}
          expanded={expandedId === w.id}
          onToggle={() => setExpandedId(expandedId === w.id ? null : w.id)}
          onLogSetValue={logSetValue}
          onLogSectionScore={logSectionScore}
          onToggleReaction={toggleReaction}
          onPrepare={() => setPrepare({ workout: w, movements: getStrengthMovements(w) })}
          onEdit={() => setEditing(w)}
          onAthleteClick={isCoach ? (id) => setAthletePanel(id) : null}
        />
      ))}

      {prepare && (
        <PrepareModal
          workout={prepare.workout}
          movements={prepare.movements}
          user={user}
          onClose={() => setPrepare(null)}
        />
      )}

      {editing && (
        <EditWorkout
          workout={editing}
          onSaved={() => { setEditing(null); fetchWorkouts(); showToast('Workout updated') }}
          onClose={() => setEditing(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      {athletePanel && (
        <AthletePanel
          athleteId={athletePanel}
          onClose={() => setAthletePanel(null)}
          onUpdated={fetchWorkouts}
        />
      )}
    </div>
  )
}

function WorkoutCard({ workout, user, isCoach, isFuture, expanded, onToggle, onLogSetValue, onLogSectionScore, onToggleReaction, onPrepare, onEdit, onAthleteClick }) {
  const [expandedAthlete, setExpandedAthlete] = useState(null)
  const sections = (workout.workout_sections || []).sort((a, b) => a.order_index - b.order_index)
  const legacyResults = workout.results || []

  return (
    <div className="workout-card">
      <div className="workout-header" onClick={onToggle}>
        <div>
          <div className="workout-title">{workout.title}</div>
          <div className="workout-meta" style={{ marginTop: '6px' }}>
            <span className={`track-badge ${TC[workout.track] || 'track-open'}`}>{workout.track}</span>
            {isFuture && <span className="future-badge">Upcoming</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isCoach && (
            <button className="btn-ghost" style={{ fontSize: '10px' }} onClick={e => { e.stopPropagation(); onEdit() }}>Edit</button>
          )}
          <span style={{ color: 'var(--charcoal-light)', fontSize: '18px' }}>{expanded ? '−' : '+'}</span>
        </div>
      </div>

      {expanded && (
        <div>
          <div className="workout-body">
            {workout.notes && <p className="workout-notes">{workout.notes}</p>}
            {sections.map(sec => {
              const scoreType = sec.score_type || 'No Score'
              const mySecLog = (sec.section_logs || []).find(sl => sl.athlete_id === user.id)
              const sectionLeaderboard = scoreType !== 'No Score' ? buildSectionLeaderboard(sec, scoreType) : []

              return (
                <div key={sec.id} className="section-block">
                  <div className="section-block-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{sec.type}</span>
                    {scoreType !== 'No Score' && (
                      <span style={{ fontSize: '10px', letterSpacing: '1px', color: 'var(--charcoal-light)', textTransform: 'uppercase', fontFamily: 'Lato, sans-serif' }}>{scoreType}</span>
                    )}
                  </div>
                  {sec.notes && <p className="section-block-notes">{sec.notes}</p>}

                  {/* Movements list */}
                  {(sec.movements || []).sort((a, b) => a.order_index - b.order_index).map((m, mi) => {
                    const sets = (m.sets || []).sort((a, b) => a.order_index - b.order_index)
                    return (
                      <div key={mi} className="movement-block">
                        <div className="movement-block-name">{m.name}</div>
                        {m.notes && <div className="movement-notes-text">{m.notes}</div>}
                        {/* Per-set logging for Heaviest Set only */}
                        {scoreType === 'Heaviest Set' && sets.map((st, si) => {
                          const myLog = (st.set_logs || []).find(sl => sl.athlete_id === user.id)
                          return (
                            <div key={si} className="set-log-row">
                              <span className="set-number">Set {st.set_number}</span>
                              {st.reps && <span className="set-reps">{st.reps} {parseInt(st.reps) === 1 ? 'rep' : 'reps'}</span>}
                              {st.load && <span className="set-load">@ {st.load}</span>}
                              {st.rpe && <span className="set-rpe">RPE {st.rpe}</span>}
                              <SetLogInput
                                value={myLog?.value || ''}
                                scoreType={scoreType}
                                onSave={val => onLogSetValue(st.id, m.id, workout.id, val)}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}

                  {/* Section-level log for non-Heaviest-Set scored sections */}
                  {scoreType !== 'No Score' && scoreType !== 'Heaviest Set' && (
                    <SectionLogInput
                      scoreType={scoreType}
                      myLog={mySecLog}
                      onSave={payload => onLogSectionScore(sec.id, workout.id, payload)}
                    />
                  )}

                  {/* Notes/scaling box — always visible */}
                  <SectionNotesInput
                    myLog={mySecLog}
                    onSave={notes => onLogSectionScore(sec.id, workout.id, {
                      score: mySecLog?.score || null,
                      rounds: mySecLog?.rounds || null,
                      reps: mySecLog?.reps || null,
                      notes
                    })}
                  />

                  {/* Per-section leaderboard */}
                  {scoreType !== 'No Score' && sectionLeaderboard.length > 0 && (
                    <SectionLeaderboard
                      entries={sectionLeaderboard}
                      scoreType={scoreType}
                      userId={user.id}
                      reactions={RX}
                      legacyResults={legacyResults}
                      onToggleReaction={onToggleReaction}
                      expandedAthlete={expandedAthlete}
                      setExpandedAthlete={setExpandedAthlete}
                      onAthleteClick={onAthleteClick}
                    />
                  )}
                </div>
              )
            })}

            {/* Legacy results from old system */}
            {legacyResults.length > 0 && sections.every(s => !s.score_type || s.score_type === 'No Score') && (
              <div style={{ marginTop: '1rem' }}>
                <div className="lb-title">Previous Results</div>
                {[...legacyResults].sort((a, b) => {
                  const av = parseFloat(a.score), bv = parseFloat(b.score)
                  if (!isNaN(av) && !isNaN(bv)) return bv - av
                  return 0
                }).map((r, i) => {
                  const ini = (r.profiles?.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                  const rankClass = ['gold', 'silver', 'bronze'][i] || 'other'
                  const rankSym = ['1', '2', '3'][i] || String(i + 1)
                  return (
                    <div key={r.id} className="lb-row">
                      <span className={`lb-rank ${rankClass}`}>{rankSym}</span>
                      {r.profiles?.avatar_url ? <img src={r.profiles.avatar_url} className="lb-avatar" alt="" /> : <div className="lb-avatar-placeholder">{ini}</div>}
                      <span className="lb-name">{r.profiles?.name || 'Athlete'}{r.athlete_id === user.id && <span className="lb-you">you</span>}</span>
                      <span className="lb-score">{r.score}</span>
                      {r.note && <span className="lb-note">{r.note}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="log-section">
            <div className="log-header">
              <h4>Log your results above</h4>
              <button className="btn-moss" onClick={onPrepare}>Prepare</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Section-level score input (For Time, AMRAP, Max Reps, Max Distance)
function SectionLogInput({ scoreType, myLog, onSave }) {
  const [editing, setEditing] = useState(false)
  const [score, setScore] = useState(myLog?.score || '')
  const [rounds, setRounds] = useState(myLog?.rounds != null ? String(myLog.rounds) : '')
  const [reps, setReps] = useState(myLog?.reps != null ? String(myLog.reps) : '')

  useEffect(() => {
    setScore(myLog?.score || '')
    setRounds(myLog?.rounds != null ? String(myLog.rounds) : '')
    setReps(myLog?.reps != null ? String(myLog.reps) : '')
  }, [myLog])

  const displayValue = () => {
    if (scoreType === 'AMRAP') {
      const parts = []
      if (myLog?.rounds != null) parts.push(`${myLog.rounds} rounds`)
      if (myLog?.reps != null) parts.push(`+ ${myLog.reps} reps`)
      return parts.join(' ') || null
    }
    return myLog?.score || null
  }

  const handleSave = () => {
    if (scoreType === 'AMRAP') {
      onSave({ rounds: rounds ? parseInt(rounds) : null, reps: reps ? parseInt(reps) : null, score: null })
    } else {
      onSave({ score, rounds: null, reps: null })
    }
    setEditing(false)
  }

  const placeholder = scoreType === 'For Time' ? 'e.g. 12:34' :
    scoreType === 'Max Reps / Calories' ? 'e.g. 45 reps' :
    scoreType === 'Max Distance' ? 'e.g. 500m' : 'Score'

  const current = displayValue()

  if (!editing) {
    return (
      <div style={{ marginTop: '10px' }}>
        <button
          onClick={() => setEditing(true)}
          style={{ background: current ? 'rgba(200,169,106,0.1)' : 'transparent', border: '1px solid', borderColor: current ? 'var(--gold-dark)' : 'var(--border)', borderRadius: '2px', color: current ? 'var(--gold-light)' : 'var(--charcoal-light)', padding: '6px 14px', cursor: 'pointer', fontSize: current ? '14px' : '12px', fontFamily: current ? 'Cinzel, serif' : 'Lato, sans-serif', letterSpacing: current ? '1px' : '2px', textTransform: current ? 'none' : 'uppercase' }}
        >
          {current || `Log ${scoreType}`}
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '10px', background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '2px', padding: '12px' }}>
      {scoreType === 'AMRAP'
        ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--charcoal-light)' }}>Rounds</label>
              <input autoFocus type="number" min="0" value={rounds} onChange={e => setRounds(e.target.value)} placeholder="0"
                style={{ width: '70px', background: 'rgba(245,240,232,0.06)', border: '1px solid var(--gold)', borderRadius: '2px', padding: '6px 8px', color: 'var(--bone)', fontFamily: 'Lato, sans-serif', fontSize: '15px', outline: 'none' }} />
            </div>
            <div style={{ fontSize: '16px', color: 'var(--charcoal-light)', marginTop: '18px' }}>+</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--charcoal-light)' }}>Reps</label>
              <input type="number" min="0" value={reps} onChange={e => setReps(e.target.value)} placeholder="0"
                style={{ width: '70px', background: 'rgba(245,240,232,0.06)', border: '1px solid var(--gold)', borderRadius: '2px', padding: '6px 8px', color: 'var(--bone)', fontFamily: 'Lato, sans-serif', fontSize: '15px', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '18px' }}>
              <button onClick={handleSave} className="btn-sm" style={{ padding: '6px 14px' }}>Save</button>
              <button onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        )
        : (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input autoFocus type="text" value={score} onChange={e => setScore(e.target.value)} placeholder={placeholder}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
              style={{ flex: 1, background: 'rgba(245,240,232,0.06)', border: '1px solid var(--gold)', borderRadius: '2px', padding: '6px 10px', color: 'var(--bone)', fontFamily: 'Lato, sans-serif', fontSize: '15px', outline: 'none' }} />
            <button onClick={handleSave} className="btn-sm" style={{ padding: '6px 14px' }}>Save</button>
            <button onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
          </div>
        )
      }
    </div>
  )
}

// Notes/scaling field - always visible on every section
function SectionNotesInput({ myLog, onSave }) {
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
    <div style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
      <input autoFocus type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Scaling, notes, how it felt..."
        onKeyDown={e => { if (e.key === 'Enter') { onSave(notes); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        style={{ flex: 1, background: 'rgba(245,240,232,0.06)', border: '1px solid var(--border)', borderRadius: '2px', padding: '5px 8px', color: 'var(--bone)', fontFamily: 'Lato, sans-serif', fontSize: '13px', outline: 'none' }} />
      <button onClick={() => { onSave(notes); setEditing(false) }} className="btn-sm" style={{ padding: '4px 10px', fontSize: '11px' }}>Save</button>
      <button onClick={() => setEditing(false)} className="btn-ghost" style={{ padding: '4px 10px', fontSize: '11px' }}>✕</button>
    </div>
  )
}

// Per-set log input for Heaviest Set
function SetLogInput({ value, scoreType, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)

  useEffect(() => { setVal(value) }, [value])

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

function SectionLeaderboard({ entries, scoreType, userId, reactions, legacyResults, onToggleReaction, expandedAthlete, setExpandedAthlete, onAthleteClick }) {
  return (
    <div className="leaderboard" style={{ marginTop: '12px' }}>
      <div className="lb-title">{scoreType}</div>
      {entries.map((entry, i) => {
        const rankClass = ['gold', 'silver', 'bronze'][i] || 'other'
        const rankSym = ['1', '2', '3'][i] || String(i + 1)
        const isMe = entry.athleteId === userId
        const isExpanded = expandedAthlete === entry.athleteId + String(entry.sectionId)
        const result = legacyResults.find(r => r.athlete_id === entry.athleteId)

        return (
          <div key={entry.athleteId}>
            <div className="lb-row" style={{ cursor: 'pointer' }} onClick={() => setExpandedAthlete(isExpanded ? null : entry.athleteId + String(entry.sectionId))}>
              <span className={`lb-rank ${rankClass}`}>{rankSym}</span>
              {entry.avatarUrl ? <img src={entry.avatarUrl} className="lb-avatar" alt="" /> : <div className="lb-avatar-placeholder">{(entry.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>}
              <span className="lb-name"
                onClick={e => { e.stopPropagation(); if (onAthleteClick) onAthleteClick(entry.athleteId) }}
                style={onAthleteClick ? { cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border)' } : {}}
              >{entry.name}{isMe && <span className="lb-you">you</span>}</span>
              <span className="lb-score">{entry.displayScore}</span>
              {entry.notes && <span className="lb-note" title={entry.notes}>📝</span>}
              <span style={{ fontSize: '11px', color: 'var(--charcoal-light)' }}>{isExpanded ? '▲' : '▼'}</span>
              {result && (
                <div className="lb-reactions">
                  {reactions.map(rx => {
                    const rxArr = (result.reactions || []).filter(x => x.type === rx.k)
                    const hasReacted = rxArr.some(x => x.athlete_id === userId)
                    const canReact = entry.athleteId !== userId
                    return (
                      <button key={rx.k} className={`reaction-btn ${hasReacted ? 'reacted' : ''}`}
                        onClick={e => { e.stopPropagation(); if (canReact) onToggleReaction(result.id, rx.k, hasReacted) }}
                        style={!canReact ? { opacity: 0.3, cursor: 'default' } : {}}>
                        {rx.e}{rxArr.length > 0 && <span>{rxArr.length}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {isExpanded && (
              <div style={{ paddingLeft: '56px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                {entry.sets.map((s, si) => (
                  <div key={si} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '3px 0', fontSize: '13px' }}>
                    <span style={{ color: 'var(--charcoal-light)', fontFamily: 'Cinzel, serif', fontSize: '11px', minWidth: '44px' }}>{s.movName} S{s.setNumber}</span>
                    {s.reps && <span style={{ color: 'var(--bone)' }}>{s.reps} reps</span>}
                    {s.load && <span style={{ color: 'var(--charcoal-light)', fontSize: '12px' }}>@ {s.load}</span>}
                    <span style={{ color: 'var(--gold-light)', fontFamily: 'Cinzel, serif', marginLeft: 'auto' }}>{s.logged}</span>
                  </div>
                ))}
                {entry.notes && (
                  <div style={{ fontSize: '12px', color: 'var(--moss-light)', marginTop: '6px', fontStyle: 'italic' }}>📝 {entry.notes}</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function buildSectionLeaderboard(section, scoreType) {
  const athleteMap = {}

  if (scoreType === 'Heaviest Set') {
    // Build from set_logs
    ;(section.movements || []).forEach(mov => {
      (mov.sets || []).forEach(st => {
        (st.set_logs || []).forEach(sl => {
          if (!sl.value) return
          if (!athleteMap[sl.athlete_id]) {
            athleteMap[sl.athlete_id] = {
              athleteId: sl.athlete_id,
              sectionId: section.id,
              name: sl.profiles?.name || 'Athlete',
              avatarUrl: sl.profiles?.avatar_url || null,
              allValues: [],
              sets: [],
              notes: null
            }
          }
          athleteMap[sl.athlete_id].allValues.push(sl.value)
          athleteMap[sl.athlete_id].sets.push({
            movName: mov.name,
            setNumber: st.set_number,
            reps: st.reps,
            load: st.load,
            logged: sl.value
          })
        })
      })
    })

    return Object.values(athleteMap)
      .map(a => ({
        ...a,
        displayScore: getBestScore(a.allValues, scoreType),
        sortScore: parseScore(getBestScore(a.allValues, scoreType), scoreType)
      }))
      .filter(a => a.displayScore !== null)
      .sort((a, b) => b.sortScore - a.sortScore)
  }

  // Build from section_logs for all other score types
  ;(section.section_logs || []).forEach(sl => {
    if (!athleteMap[sl.athlete_id]) {
      athleteMap[sl.athlete_id] = {
        athleteId: sl.athlete_id,
        sectionId: section.id,
        name: sl.profiles?.name || 'Athlete',
        avatarUrl: sl.profiles?.avatar_url || null,
        log: sl,
        sets: [],
        notes: sl.notes || null
      }
    }
  })

  return Object.values(athleteMap)
    .map(a => {
      const display = formatSectionScore(a.log, scoreType)
      const sortVal = sectionScoreForSort(a.log, scoreType)
      return { ...a, displayScore: display, sortScore: sortVal }
    })
    .filter(a => a.displayScore !== null)
    .sort((a, b) => {
      if (scoreType === 'For Time') {
        return parseScore(a.displayScore, scoreType) - parseScore(b.displayScore, scoreType)
      }
      if (scoreType === 'AMRAP') {
        return (b.sortScore || '').localeCompare(a.sortScore || '')
      }
      return parseScore(b.displayScore, scoreType) - parseScore(a.displayScore, scoreType)
    })
}
