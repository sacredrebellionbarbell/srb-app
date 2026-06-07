import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import PrepareModal from './PrepareModal'
import EditWorkout from './EditWorkout'
import AthletePanel from './AthletePanel'
import VideoModal from './VideoModal'

const TC = { 'Babes Who Fight Bears': 'track-bears', 'Strong & Savage': 'track-strength', 'Olympic Weightlifting': 'track-open' }
const RX = [{ e: '✋', k: 'highfive' }, { e: '🔥', k: 'fire' }, { e: '💪', k: 'strong' }]

function formatDate(d) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) }
function toISO(d) { return d.toISOString().split('T')[0] }

function parseScore(val, scoreType) {
  if (!val) return -Infinity
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
  const [announcement, setAnnouncement] = useState(null)
  const [editingAnnouncement, setEditingAnnouncement] = useState(false)
  const [announcementText, setAnnouncementText] = useState('')
  const [athletePanel, setAthletePanel] = useState(null)
  const isCoach = profile?.role === 'coach'

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const deleteWorkout = async (workoutId) => {
    await supabase.from('workouts').delete().eq('id', workoutId)
    fetchWorkouts()
  }

  const fetchWorkouts = useCallback(async () => {
    setLoading(true)
    const membershipType = profile?.membership_type
    const PUBLIC_TRACKS = ['Babes Who Fight Bears', 'Strong & Savage', 'Olympic Weightlifting']

    let query = supabase
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
      .not('date', 'is', null)
      .order('id', { ascending: false })

    if (!isCoach) {
      if (membershipType === 'Class Access') {
        query = query.in('track', PUBLIC_TRACKS)
      } else if (membershipType === 'Personal Training' || membershipType === 'Online Training' || membershipType === 'Nutrition') {
        query = query.eq('assigned_athlete_id', user.id)
      } else if (membershipType === 'Both') {
        query = query.or(`track.in.(${PUBLIC_TRACKS.map(t => `"${t}"`).join(',')}),assigned_athlete_id.eq.${user.id}`)
      } else {
        setWorkouts([])
        setLoading(false)
        return
      }
    }

    const { data } = await query
    setWorkouts(data || [])
    if (data?.length > 0) setExpandedId(data[0].id)
    setLoading(false)
  }, [currentDate, isCoach, profile?.membership_type, user.id])

  useEffect(() => { fetchWorkouts() }, [fetchWorkouts])

  useEffect(() => {
    supabase.from('announcements').select('*').eq('active', true).order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]) setAnnouncement(data[0]) })
  }, [])

  const saveAnnouncement = async () => {
    if (!announcementText.trim()) return
    await supabase.from('announcements').update({ active: false }).eq('active', true)
    const { data } = await supabase.from('announcements')
      .insert({ message: announcementText.trim(), created_by: user.id, active: true })
      .select().single()
    if (data) { setAnnouncement(data); setEditingAnnouncement(false); setAnnouncementText('') }
  }

  const deleteAnnouncement = async () => {
    if (!announcement) return
    await supabase.from('announcements').update({ active: false }).eq('id', announcement.id)
    setAnnouncement(null)
  }

  const prevDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); setCurrentDate(d) }
  const nextDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); setCurrentDate(d) }
  const goToday = () => setCurrentDate(new Date())
  const isToday = toISO(currentDate) === toISO(new Date())
  const isFuture = toISO(currentDate) > toISO(new Date())

  const ensureResultRow = async (workoutId) => {
    await supabase.from('results').upsert(
      { workout_id: workoutId, athlete_id: user.id, score: 'logged' },
      { onConflict: 'workout_id,athlete_id' }
    )
  }

  const logSetValue = async (setId, movementId, workoutId, value) => {
    const { error } = await supabase.from('set_logs').upsert(
      { set_id: setId, movement_id: movementId, workout_id: workoutId, athlete_id: user.id, value },
      { onConflict: 'set_id,athlete_id' }
    )
    if (!error) { await ensureResultRow(workoutId); showToast('Logged!'); fetchWorkouts() }
    else showToast('Error: ' + error.message)
  }

  const logSectionScore = async (sectionId, workoutId, payload) => {
    const { error } = await supabase.from('section_logs').upsert(
      { section_id: sectionId, workout_id: workoutId, athlete_id: user.id, ...payload },
      { onConflict: 'section_id,athlete_id' }
    )
    if (!error) { await ensureResultRow(workoutId); showToast('Logged!'); fetchWorkouts() }
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
      {announcement && (
        <div style={{ background: 'rgba(200,169,106,0.08)', border: '1px solid var(--gold-dark)', borderRadius: '4px', padding: '10px 14px', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <span style={{ fontSize: '16px', flexShrink: 0 }}>📣</span>
          <div style={{ flex: 1, fontSize: '14px', color: 'var(--bone)', lineHeight: 1.6 }}>{announcement.message}</div>
          {isCoach && <button onClick={deleteAnnouncement} style={{ background: 'none', border: 'none', color: 'var(--charcoal-light)', cursor: 'pointer', fontSize: '16px', flexShrink: 0 }}>×</button>}
        </div>
      )}

      {isCoach && (
        <div style={{ marginBottom: '1rem' }}>
          {editingAnnouncement
            ? <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <textarea value={announcementText} onChange={e => setAnnouncementText(e.target.value)}
                  placeholder="Write an announcement for all athletes..."
                  style={{ flex: 1, minHeight: '60px', background: 'rgba(245,240,232,0.06)', border: '1px solid var(--gold-dark)', borderRadius: '2px', padding: '8px 10px', color: 'var(--bone)', fontFamily: 'Lato, sans-serif', fontSize: '14px', outline: 'none', resize: 'vertical' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button className="btn-sm" onClick={saveAnnouncement} disabled={!announcementText.trim()}>Post</button>
                  <button className="btn-ghost" onClick={() => setEditingAnnouncement(false)} style={{ fontSize: '11px' }}>Cancel</button>
                </div>
              </div>
            : <button className="btn-ghost" style={{ fontSize: '11px', width: '100%' }}
                onClick={() => { setEditingAnnouncement(true); setAnnouncementText(announcement?.message || '') }}>
                {announcement ? '✏️ Edit Announcement' : '📣 Post Announcement'}
              </button>
          }
        </div>
      )}

      <div className="date-nav">
        <button className="date-nav-btn" onClick={prevDay}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div className="date-nav-label">{formatDate(currentDate)}</div>
          {!isToday && <div className="date-nav-today" onClick={goToday}>Back to today</div>}
        </div>
        <button className="date-nav-btn" onClick={nextDay}>›</button>
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '1rem', alignItems: 'center' }}>
        <input type="date" value={toISO(currentDate)}
          onChange={e => { if (e.target.value) setCurrentDate(new Date(e.target.value + 'T12:00:00')) }}
          style={{ background: 'rgba(245,240,232,0.06)', border: '1px solid var(--border)', borderRadius: '2px', padding: '6px 10px', color: 'var(--bone)', fontFamily: 'Lato, sans-serif', fontSize: '14px', outline: 'none', cursor: 'pointer' }} />
        {!isToday && <button className="btn-ghost" style={{ fontSize: '12px' }} onClick={goToday}>Today</button>}
      </div>

      {loading && <div className="loading">Loading...</div>}

      {!loading && workouts.length === 0 && (
        <div className="empty">
          {(!profile?.membership_type || profile?.membership_type === 'None') && !isCoach
            ? <>
                <h3>No Active Membership</h3>
                <p>Set up your membership in the Profile tab to access programming.</p>
              </>
            : <>
                <h3>{isFuture ? 'Nothing posted yet' : 'Rest day'}</h3>
                <p>{isFuture ? 'Check back when programming is posted.' : 'No workout posted for this day.'}</p>
              </>
          }
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
          onDelete={() => deleteWorkout(w.id)}
          onAthleteClick={isCoach ? (id) => setAthletePanel(id) : null}
        />
      ))}

      {prepare
