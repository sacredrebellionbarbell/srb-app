import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import PrepareModal from './PrepareModal'
import EditWorkout from './EditWorkout'

const TC = { 'Babes Who Fight Bears': 'track-bears', 'Strong & Savage': 'track-strength', 'Olympic Weightlifting': 'track-open' }
const RX = [{ e: '✋', k: 'highfive' }, { e: '🔥', k: 'fire' }, { e: '💪', k: 'strong' }]

function formatDate(d) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) }
function toISO(d) { return d.toISOString().split('T')[0] }

function parseScore(val, scoreType) {
  if (!val) return -Infinity
  const num = parseFloat((val || '').replace(/[^\d.]/g, ''))
  if (isNaN(num)) return -Infinity
  if (scoreType === 'Shortest Time') return -num
  return num
}

function getBestScore(values, scoreType) {
  if (!values || values.length === 0) return null
  const valid = values.filter(Boolean)
  if (!valid.length) return null
  return valid.reduce((best, v) => parseScore(v, scoreType) > parseScore(best, scoreType) ? v : best, valid[0])
}

export default function Workouts({ user, profile }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [workouts, setWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [prepare, setPrepare] = useState(null)
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState(null)
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
    if (!error) { showToast('Logged'); fetchWorkouts() }
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
    const strengthSecs = sections.filter(s => ['Strength', 'Skills'].includes(s.type))
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
          onToggleReaction={toggleReaction}
          onPrepare={() => setPrepare({ workout: w, movements: getStrengthMovements(w) })}
          onEdit={() => setEditing(w)}
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
    </div>
  )
}

function WorkoutCard({ workout, user, isCoach, isFuture, expanded, onToggle, onLogSetValue, onToggleReaction, onPrepare, onEdit }) {
  const [expandedAthlete, setExpandedAthlete] = useState(null)
  const sections = (workout.workout_sections || []).sort((a, b) => a.order_index - b.order_index)

  // Legacy results from old system
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

                  {(sec.movements || []).sort((a, b) => a.order_index - b.order_index).map((m, mi) => {
                    const sets = (m.sets || []).sort((a, b) => a.order_index - b.order_index)
                    return (
                      <div key={mi} className="movement-block">
                        <div className="movement-block-name">{m.name}</div>
                        {m.notes && <div className="movement-notes-text">{m.notes}</div>}
                        {sets.map((st, si) => {
                          const myLog = (st.set_logs || []).find(sl => sl.athlete_id === user.id)
                          return (
                            <div key={si} className="set-log-row">
                              <span className="set-number">Set {st.set_number}</span>
                              {st.reps && <span className="set-reps">{st.reps} {parseInt(st.reps) === 1 ? 'rep' : 'reps'}</span>}
                              {st.load && <span className="set-load">@ {st.load}</span>}
                              {st.rpe && <span className="set-rpe">RPE {st.rpe}</span>}
                              {!isFuture && (
                                <SetLogInput
                                  value={myLog?.value || ''}
                                  scoreType={scoreType}
                                  onSave={val => onLogSetValue(st.id, m.id, workout.id, val)}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}

                  {/* Per-section leaderboard */}
                  {!isFuture && scoreType !== 'No Score' && sectionLeaderboard.length > 0 && (
                    <SectionLeaderboard
                      entries={sectionLeaderboard}
                      scoreType={scoreType}
                      userId={user.id}
                      reactions={RX}
                      legacyResults={legacyResults}
                      onToggleReaction={onToggleReaction}
                      expandedAthlete={expandedAthlete}
                      setExpandedAthlete={setExpandedAthlete}
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
              <h4>Log your sets above</h4>
              <button className="btn-moss" onClick={onPrepare}>Prepare</button>
            </div>
            {isFuture && <p className="upcoming-note">Upcoming — use Prepare to review your numbers.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function SectionLeaderboard({ entries, scoreType, userId, reactions, legacyResults, onToggleReaction, expandedAthlete, setExpandedAthlete }) {
  return (
    <div className="leaderboard" style={{ marginTop: '12px' }}>
      <div className="lb-title">{scoreType}</div>
      {entries.map((entry, i) => {
        const rankClass = ['gold', 'silver', 'bronze'][i] || 'other'
        const rankSym = ['1', '2', '3'][i] || String(i + 1)
        const isMe = entry.athleteId === userId
        const isExpanded = expandedAthlete === entry.athleteId + entry.sectionId
        const result = legacyResults.find(r => r.athlete_id === entry.athleteId)

        return (
          <div key={entry.athleteId}>
            <div className="lb-row" style={{ cursor: 'pointer' }} onClick={() => setExpandedAthlete(isExpanded ? null : entry.athleteId + entry.sectionId)}>
              <span className={`lb-rank ${rankClass}`}>{rankSym}</span>
              {entry.avatarUrl ? <img src={entry.avatarUrl} className="lb-avatar" alt="" /> : <div className="lb-avatar-placeholder">{(entry.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>}
              <span className="lb-name">{entry.name}{isMe && <span className="lb-you">you</span>}</span>
              <span className="lb-score">{entry.bestScore}</span>
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
            {isExpanded && entry.sets.length > 0 && (
              <div style={{ paddingLeft: '56px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                {entry.sets.map((s, si) => (
                  <div key={si} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '4px 0', fontSize: '13px' }}>
                    <span style={{ color: 'var(--charcoal-light)', fontFamily: 'Cinzel, serif', fontSize: '11px', minWidth: '44px' }}>{s.movName} S{s.setNumber}</span>
                    {s.reps && <span style={{ color: 'var(--bone)' }}>{s.reps} {parseInt(s.reps) === 1 ? 'rep' : 'reps'}</span>}
                    {s.load && <span style={{ color: 'var(--charcoal-light)', fontSize: '12px' }}>@ {s.load}</span>}
                    <span style={{ color: 'var(--gold-light)', fontFamily: 'Cinzel, serif', marginLeft: 'auto' }}>{s.logged || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SetLogInput({ value, scoreType, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)

  useEffect(() => { setVal(value) }, [value])

  const placeholder = scoreType === 'Shortest Time' || scoreType === 'Longest Time' ? 'e.g. 3:45' :
    scoreType === 'Max Reps / Calories' ? 'reps/cals' :
    scoreType === 'Max Distance' ? 'e.g. 500m' : 'lbs/kg'

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
      <input autoFocus type="text" value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder}
        onKeyDown={e => { if (e.key === 'Enter') { onSave(val); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        style={{ width: '90px', background: 'rgba(245,240,232,0.06)', border: '1px solid var(--gold)', borderRadius: '2px', padding: '4px 8px', color: 'var(--bone)', fontFamily: 'Lato, sans-serif', fontSize: '13px', outline: 'none' }} />
      <button onClick={() => { onSave(val); setEditing(false) }} className="btn-sm" style={{ padding: '4px 10px', fontSize: '11px' }}>✓</button>
    </div>
  )
}

function buildSectionLeaderboard(section, scoreType) {
  const athleteMap = {}
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
            sets: []
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
    .map(a => ({ ...a, bestScore: getBestScore(a.allValues, scoreType) }))
    .filter(a => a.bestScore !== null)
    .sort((a, b) => parseScore(b.bestScore, scoreType) - parseScore(a.bestScore, scoreType))
}
