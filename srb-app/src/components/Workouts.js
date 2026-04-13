import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import PrepareModal from './PrepareModal'
import EditWorkout from './EditWorkout'

const TC = { 'Strength & Conditioning': 'track-strength', 'Babes Who Fight Bears': 'track-bears', 'Open Track': 'track-open' }
const RX = [{ e: '✋', k: 'highfive' }, { e: '🔥', k: 'fire' }, { e: '💪', k: 'strong' }]

function formatDate(d) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) }
function toISO(d) { return d.toISOString().split('T')[0] }

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
      .select(`*, workout_sections(*, movements(*, sets(*))), results(*, profiles(name, avatar_url), reactions(*))`)
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

  const logResult = async (workoutId, score, note) => {
    const { error } = await supabase.from('results').upsert(
      { workout_id: workoutId, athlete_id: user.id, score, note },
      { onConflict: 'workout_id,athlete_id' }
    )
    if (!error) { showToast('Result logged'); fetchWorkouts() }
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
          onLogResult={logResult}
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

function WorkoutCard({ workout, user, isCoach, isFuture, expanded, onToggle, onLogResult, onToggleReaction, onPrepare, onEdit }) {
  const [score, setScore] = useState('')
  const [note, setNote] = useState('')
  const myResult = workout.results?.find(r => r.athlete_id === user.id)
  const sections = (workout.workout_sections || []).sort((a, b) => a.order_index - b.order_index)
  const sorted = [...(workout.results || [])].sort((a, b) => {
    const av = parseFloat(a.score), bv = parseFloat(b.score)
    if (!isNaN(av) && !isNaN(bv)) return bv - av
    return (a.score || '').localeCompare(b.score || '')
  })
  const rankClass = i => ['gold', 'silver', 'bronze'][i] || 'other'
  const rankSym = i => ['1', '2', '3'][i] || String(i + 1)
  const submit = async () => {
    if (!score.trim()) return
    await onLogResult(workout.id, score.trim(), note.trim())
    setScore(''); setNote('')
  }

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
            {sections.map(sec => (
              <div key={sec.id} className="section-block">
                <div className="section-block-title">{sec.type}</div>
                {sec.notes && <p className="section-block-notes">{sec.notes}</p>}
                {(sec.movements || []).sort((a, b) => a.order_index - b.order_index).map((m, i) => {
                  const sets = (m.sets || []).sort((a, b) => a.order_index - b.order_index)
                  return (
                    <div key={i} className="movement-block">
                      <div className="movement-block-name">{m.name}</div>
                      {m.notes && <div className="movement-notes-text">{m.notes}</div>}
                      {sets.length > 0
                        ? sets.map((st, si) => (
                          <div key={si} className="set-row">
                            <span className="set-number">Set {st.set_number}</span>
                            {st.reps && <span className="set-reps">{st.reps} {parseInt(st.reps) === 1 ? 'rep' : 'reps'}</span>}
                            {st.load && <span className="set-load">@ {st.load}</span>}
                            {st.rpe && <span className="set-rpe">RPE {st.rpe}</span>}
                          </div>
                        ))
                        : m.scheme && <div className="set-row"><span className="set-load">{m.scheme}</span></div>
                      }
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="log-section">
            <div className="log-header">
              <h4>Log Your Result</h4>
              <button className="btn-moss" onClick={onPrepare}>Prepare</button>
            </div>

            {isFuture
              ? <p className="upcoming-note">Upcoming workout — use Prepare to review your numbers.</p>
              : (
                <div className="log-form">
                  <div className="field">
                    <label>Score / Weight</label>
                    <input type="text" value={score} onChange={e => setScore(e.target.value)}
                      placeholder={myResult ? `Current: ${myResult.score}` : 'e.g. 185 lbs, 12:34'} />
                  </div>
                  <div className="field">
                    <label>Note</label>
                    <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="PR, 5 reps, scaling..." />
                  </div>
                  <button className="btn-sm" onClick={submit}>Log It</button>
                </div>
              )
            }

            {sorted.length > 0 && (
              <div className="leaderboard">
                <div className="lb-title">Leaderboard · {sorted.length} {sorted.length === 1 ? 'athlete' : 'athletes'}</div>
                {sorted.map((r, i) => {
                  const ini = (r.profiles?.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                  return (
                    <div key={r.id} className="lb-row">
                      <span className={`lb-rank ${rankClass(i)}`}>{rankSym(i)}</span>
                      {r.profiles?.avatar_url ? <img src={r.profiles.avatar_url} className="lb-avatar" alt="" /> : <div className="lb-avatar-placeholder">{ini}</div>}
                      <span className="lb-name">{r.profiles?.name || 'Athlete'}{r.athlete_id === user.id && <span className="lb-you">you</span>}</span>
                      <span className="lb-score">{r.score}</span>
                      {r.note && <span className="lb-note">{r.note}</span>}
                      <div className="lb-reactions">
                        {RX.map(rx => {
                          const rxArr = (r.reactions || []).filter(x => x.type === rx.k)
                          const hasReacted = rxArr.some(x => x.athlete_id === user.id)
                          const canReact = r.athlete_id !== user.id
                          return (
                            <button key={rx.k} className={`reaction-btn ${hasReacted ? 'reacted' : ''}`}
                              onClick={canReact ? () => onToggleReaction(r.id, rx.k, hasReacted) : undefined}
                              style={!canReact ? { opacity: 0.3, cursor: 'default' } : {}}>
                              {rx.e}{rxArr.length > 0 && <span>{rxArr.length}</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
