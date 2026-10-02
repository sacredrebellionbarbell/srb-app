import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const TRACKS = ['All Tracks', 'Babes Who Fight Bears', 'Strong & Savage', 'Olympic Weightlifting']

function toISO(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function startOfWeek(date) {
  const start = new Date(date)
  const offset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - offset)
  start.setHours(12, 0, 0, 0)
  return start
}

function monthLabel(start, end) {
  const first = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const last = end.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return first === last ? first : `${first} / ${last}`
}

function workoutPreview(workout) {
  return (workout.workout_sections || [])
    .sort((a, b) => a.order_index - b.order_index)
    .flatMap(section => (section.movements || [])
      .sort((a, b) => a.order_index - b.order_index)
      .map(movement => movement.name))
    .filter(Boolean)
    .slice(0, 5)
}

export default function CoachPlanner({ setTab }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [track, setTrack] = useState('All Tracks')
  const [workouts, setWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [draggedId, setDraggedId] = useState(null)
  const [toast, setToast] = useState(null)

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])
  const weekEnd = days[6]

  const fetchWeek = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('workouts')
      .select('id, title, date, track, notes, workout_sections(id, type, order_index, movements(id, name, order_index))')
      .gte('date', toISO(weekStart))
      .lte('date', toISO(addDays(weekStart, 6)))
      .order('date', { ascending: true })

    if (track !== 'All Tracks') query = query.eq('track', track)
    const { data, error } = await query
    if (error) setToast(`Could not load programming: ${error.message}`)
    setWorkouts(data || [])
    setLoading(false)
  }, [track, weekStart])

  useEffect(() => { fetchWeek() }, [fetchWeek])

  const moveWorkout = async (workoutId, date) => {
    const original = workouts.find(workout => workout.id === workoutId)
    if (!original || original.date === date) return

    setWorkouts(current => current.map(workout => workout.id === workoutId ? { ...workout, date } : workout))
    const { error } = await supabase.from('workouts').update({ date }).eq('id', workoutId)
    if (error) {
      setWorkouts(current => current.map(workout => workout.id === workoutId ? { ...workout, date: original.date } : workout))
      setToast(`Could not move workout: ${error.message}`)
      return
    }
    setToast(`Workout moved to ${new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`)
  }

  return (
    <div className="planner-page">
      <div className="planner-toolbar">
        <div>
          <div className="planner-kicker">Coach Programming</div>
          <h2>{monthLabel(weekStart, weekEnd)}</h2>
        </div>
        <div className="planner-actions">
          <select value={track} onChange={event => setTrack(event.target.value)} aria-label="Programming track">
            {TRACKS.map(option => <option key={option}>{option}</option>)}
          </select>
          <button className="btn-ghost" onClick={() => setWeekStart(startOfWeek(addDays(weekStart, -7)))} aria-label="Previous week">‹</button>
          <button className="btn-sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>This Week</button>
          <button className="btn-ghost" onClick={() => setWeekStart(startOfWeek(addDays(weekStart, 7)))} aria-label="Next week">›</button>
        </div>
      </div>

      {loading ? <div className="loading">Loading programming...</div> : (
        <div className="planner-week">
          {days.map(day => {
            const iso = toISO(day)
            const dayWorkouts = workouts.filter(workout => workout.date === iso)
            const today = iso === toISO(new Date())
            return (
              <section
                key={iso}
                className={`planner-day ${today ? 'today' : ''}`}
                onDragOver={event => event.preventDefault()}
                onDrop={() => { if (draggedId) moveWorkout(draggedId, iso); setDraggedId(null) }}
              >
                <header>
                  <span>{day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                  <strong>{day.getDate()}</strong>
                </header>
                <div className="planner-day-body">
                  {dayWorkouts.map(workout => (
                    <article
                      key={workout.id}
                      className="planner-workout"
                      draggable
                      onDragStart={() => setDraggedId(workout.id)}
                      onDragEnd={() => setDraggedId(null)}
                    >
                      <div className="planner-track">{workout.track || 'All Tracks'}</div>
                      <h3>{workout.title}</h3>
                      {workoutPreview(workout).map((movement, index) => <p key={`${movement}-${index}`}>{movement}</p>)}
                    </article>
                  ))}
                  {dayWorkouts.length === 0 && <div className="planner-empty">Drop workout here</div>}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <button className="planner-add" onClick={() => setTab('post')} aria-label="Add workout" title="Add workout">+</button>
      {toast && <div className="toast" onAnimationEnd={() => setTimeout(() => setToast(null), 1800)}>{toast}</div>}

      <style>{`
        .planner-page{max-width:1500px;margin:0 auto;position:relative}
        .planner-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:18px}
        .planner-kicker{font-family:'Cinzel',serif;text-transform:uppercase;letter-spacing:3px;color:var(--rose-light);font-size:12px}
        .planner-toolbar h2{font-family:'Cinzel',serif;color:var(--gold-light);font-size:28px;letter-spacing:1px;margin:4px 0 0}
        .planner-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
        .planner-actions select{background:rgba(255,248,236,.12);border:1px solid var(--border-strong);color:var(--bone);font-size:15px;padding:10px 12px;border-radius:3px}
        .planner-actions option{background:var(--charcoal)}
        .planner-week{display:grid;grid-template-columns:repeat(7,minmax(170px,1fr));border:1px solid var(--border-strong);background:rgba(255,248,236,.035);overflow-x:auto}
        .planner-day{min-width:170px;min-height:500px;border-right:1px solid var(--border);background:rgba(255,248,236,.025)}
        .planner-day:last-child{border-right:0}.planner-day.today{background:rgba(200,169,106,.08)}
        .planner-day>header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border);font-family:'Cinzel',serif;color:var(--charcoal-light);font-size:12px;text-transform:uppercase;letter-spacing:1px}
        .planner-day>header strong{color:var(--gold-light);font-size:20px;font-weight:400}
        .planner-day-body{padding:7px;min-height:445px}
        .planner-workout{background:rgba(255,248,236,.12);border:1px solid var(--gold-dark);border-radius:4px;padding:10px;margin-bottom:8px;cursor:grab;box-shadow:0 5px 15px rgba(0,0,0,.12)}
        .planner-workout:active{cursor:grabbing}.planner-track{color:var(--rose-light);font-size:9px;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}
        .planner-workout h3{font-family:'Cinzel',serif;color:var(--gold-light);font-size:14px;line-height:1.3;margin:0 0 7px}
        .planner-workout p{color:var(--bone);font-size:12px;line-height:1.35;margin:2px 0}
        .planner-empty{border:1px dashed rgba(242,221,170,.25);color:var(--charcoal-light);font-size:11px;text-align:center;padding:16px 4px;margin-top:4px}
        .planner-add{position:fixed;right:24px;bottom:96px;width:58px;height:58px;border-radius:50%;border:1px solid var(--gold);background:var(--rose-dark);color:var(--bone);font-size:34px;line-height:1;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.35);z-index:80}
        @media(max-width:820px){.planner-toolbar{align-items:flex-start;flex-direction:column}.planner-actions{justify-content:flex-start}.planner-week{grid-template-columns:repeat(7,82vw);scroll-snap-type:x mandatory}.planner-day{min-width:82vw;scroll-snap-align:start}.planner-add{right:16px;bottom:92px}}
      `}</style>
    </div>
  )
}
