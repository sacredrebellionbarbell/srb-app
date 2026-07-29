import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { notifyCoach } from '../utils/notifyCoach'
import {
  FREE_TRIAL_CLASS_LIMIT,
  canSeeWorkouts,
  hasClassAccess,
  hasPrivateTrainingAccess,
  isCoach as profileIsCoach,
  isFreeTrial
} from '../utils/access'

const PUBLIC_TRACKS = ['Babes Who Fight Bears', 'Strong & Savage', 'Olympic Weightlifting']
const TRACK_CLASS = {
  'Babes Who Fight Bears': 'track-bears',
  'Strong & Savage': 'track-strength',
  'Olympic Weightlifting': 'track-open',
  'All Tracks': 'track-open'
}
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function toISO(d) { return d.toISOString().split('T')[0] }
function formatDate(d) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
function getDayOfWeek(dateStr) { return DAYS[new Date(dateStr + 'T12:00:00').getDay()] }
function initials(name) { return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

function timeLabel(cls) {
  if (cls.recurrence_time) return cls.recurrence_time
  if (cls.start_time) return new Date(cls.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return 'Class time'
}

function classTrackMatches(classTrack, workoutTrack) {
  if (!workoutTrack) return true
  if (!classTrack || classTrack === 'All Tracks') return true
  return classTrack === workoutTrack
}

function summarizeWorkout(workout, userId) {
  const sections = (workout.workout_sections || []).sort((a, b) => a.order_index - b.order_index)
  const movements = sections.flatMap(section => (section.movements || []).map(movement => ({ ...movement, section })))
  const setMovements = movements.filter(movement => (movement.sets || []).length > 0)
  const loggedMovements = setMovements.filter(movement =>
    (movement.sets || []).some(set => (set.set_logs || []).some(log => log.athlete_id === userId && log.value))
  )
  const scoredSections = sections.filter(section => section.score_type && section.score_type !== 'No Score')
  const loggedSections = scoredSections.filter(section =>
    (section.section_logs || []).some(log => log.athlete_id === userId && (log.score || log.rounds != null || log.reps != null || log.notes))
  )

  return {
    sections,
    movementCount: movements.length,
    setMovementCount: setMovements.length,
    loggedMovementCount: loggedMovements.length,
    scoredSectionCount: scoredSections.length,
    loggedSectionCount: loggedSections.length
  }
}

export default function Today({ user, profile, setTab }) {
  const today = useMemo(() => new Date(), [])
  const iso = toISO(today)
  const dayOfWeek = getDayOfWeek(iso)
  const isCoach = profileIsCoach(profile)
  const isTrial = isFreeTrial(profile)
  const workoutAccess = canSeeWorkouts(profile)
  const classAccess = hasClassAccess(profile)
  const [workouts, setWorkouts] = useState([])
  const [classes, setClasses] = useState([])
  const [trialUses, setTrialUses] = useState(0)
  const [openGymBookings, setOpenGymBookings] = useState([])
  const [selectedTrack, setSelectedTrack] = useState('')
  const [signupTrack, setSignupTrack] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2800) }

  const fetchWorkouts = useCallback(async () => {
    if (!workoutAccess) {
      setWorkouts([])
      return
    }

    let query = supabase
      .from('workouts')
      .select(`
        *,
        workout_sections(
          *,
          section_logs(*),
          movements(*, sets(*, set_logs(*)))
        )
      `)
      .eq('date', iso)
      .not('date', 'is', null)
      .order('id', { ascending: false })

    if (!isCoach) {
      if (profile?.membership_type === 'Both') {
        query = query.or(`track.in.(${PUBLIC_TRACKS.map(t => `"${t}"`).join(',')}),assigned_athlete_id.eq.${user.id}`)
      } else if (classAccess) {
        query = query.in('track', PUBLIC_TRACKS)
      } else if (hasPrivateTrainingAccess(profile)) {
        query = query.eq('assigned_athlete_id', user.id)
      } else {
        setWorkouts([])
        return
      }
    }

    const { data } = await query
    setWorkouts(data || [])
  }, [classAccess, isCoach, iso, profile, user.id, workoutAccess])

  const fetchClasses = useCallback(async () => {
    const { data: oneTime } = await supabase
      .from('classes')
      .select('*, class_signups(athlete_id, checkin_time, profiles(name, avatar_url))')
      .eq('is_247', false)
      .is('recurrence_days', null)
      .gte('start_time', `${iso}T00:00:00.000Z`)
      .lte('start_time', `${iso}T23:59:59.999Z`)
      .order('start_time', { ascending: true })

    const { data: recurring } = await supabase
      .from('classes')
      .select('*')
      .eq('is_247', false)
      .not('recurrence_days', 'is', null)

    const todayRecurring = (recurring || []).filter(cls =>
      (cls.recurrence_days || '').split(',').map(d => d.trim()).includes(dayOfWeek)
    )

    const recurringWithInstances = await Promise.all(todayRecurring.map(async cls => {
      let { data: instance } = await supabase
        .from('class_instances')
        .select('*, instance_signups(athlete_id, checkin_time, profiles(name, avatar_url))')
        .eq('class_id', cls.id)
        .eq('instance_date', iso)
        .single()

      if (!instance) {
        const { data: newInstance } = await supabase
          .from('class_instances')
          .insert({ class_id: cls.id, instance_date: iso })
          .select('*, instance_signups(athlete_id, checkin_time, profiles(name, avatar_url))')
          .single()
        instance = newInstance
      }

      return { ...cls, instance, recurring: true }
    }))

    setClasses([...(oneTime || []).map(cls => ({ ...cls, recurring: false })), ...recurringWithInstances.filter(Boolean)])
  }, [dayOfWeek, iso])

  const fetchTrialUses = useCallback(async () => {
    if (!isTrial || !user?.id) {
      setTrialUses(0)
      return
    }

    const { data: oneTimeUses } = await supabase
      .from('class_signups')
      .select('id, classes(is_247)')
      .eq('athlete_id', user.id)

    const { data: recurringUses } = await supabase
      .from('instance_signups')
      .select('id')
      .eq('athlete_id', user.id)

    const classUses = (oneTimeUses || []).filter(s => !s.classes?.is_247).length
    setTrialUses(classUses + (recurringUses || []).length)
  }, [isTrial, user.id])

  const fetchOpenGymBookings = useCallback(async () => {
    const { data } = await supabase
      .from('open_gym_bookings')
      .select('*')
      .eq('athlete_id', user.id)
      .eq('booking_date', iso)

    setOpenGymBookings(data || [])
  }, [iso, user.id])

  const refresh = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchWorkouts(), fetchClasses(), fetchTrialUses(), fetchOpenGymBookings()])
    setLoading(false)
  }, [fetchClasses, fetchOpenGymBookings, fetchTrialUses, fetchWorkouts])

  useEffect(() => { refresh() }, [refresh])

  const trackOptions = useMemo(() => {
    const tracks = []
    workouts.forEach(workout => {
      if (workout.track && !tracks.includes(workout.track)) tracks.push(workout.track)
    })
    return tracks
  }, [workouts])

  useEffect(() => {
    if (!trackOptions.length) {
      setSelectedTrack('')
      return
    }
    if (!selectedTrack || !trackOptions.includes(selectedTrack)) setSelectedTrack(trackOptions[0])
  }, [selectedTrack, trackOptions])

  const activeWorkout = workouts.find(workout => workout.track === selectedTrack) || workouts[0]
  const matchingClasses = classes.filter(cls => classTrackMatches(cls.track, activeWorkout?.track || signupTrack))
  const signedClass = classes.find(cls => {
    const signups = cls.recurring ? cls.instance?.instance_signups || [] : cls.class_signups || []
    return signups.some(signup => signup.athlete_id === user.id)
  })
  const canSignUp = classAccess || (isTrial && trialUses < FREE_TRIAL_CLASS_LIMIT)
  const trialRemaining = Math.max(FREE_TRIAL_CLASS_LIMIT - trialUses, 0)
  const summary = activeWorkout ? summarizeWorkout(activeWorkout, user.id) : null

  const signupsForClass = cls => cls.recurring ? cls.instance?.instance_signups || [] : cls.class_signups || []
  const spotsForClass = cls => Math.max((cls.capacity || 0) - signupsForClass(cls).length, 0)

  const signup = async cls => {
    if (isTrial && trialUses >= FREE_TRIAL_CLASS_LIMIT) { showToast('Your trial classes are complete.'); return }
    if (!canSignUp) { showToast('Your membership does not include class access.'); return }
    if (!profile?.waiver_signed) { showToast('Please sign the waiver first.'); return }

    const table = cls.recurring ? 'instance_signups' : 'class_signups'
    const payload = cls.recurring ? { instance_id: cls.instance?.id, athlete_id: user.id } : { class_id: cls.id, athlete_id: user.id }
    const { error } = await supabase.from(table).insert(payload)

    if (error) {
      showToast('Already signed up')
      return
    }

    await notifyCoach(
      'New Class Signup',
      `${profile?.name || 'An athlete'} signed up for ${cls.title} at ${timeLabel(cls)}.`
    )
    setSignupTrack(null)
    showToast('Signed up!')
    refresh()
  }

  const cancelSignup = async cls => {
    if (cls.recurring) await supabase.from('instance_signups').delete().match({ instance_id: cls.instance?.id, athlete_id: user.id })
    else await supabase.from('class_signups').delete().match({ class_id: cls.id, athlete_id: user.id })
    showToast('Class signup removed')
    refresh()
  }

  const cancelOpenGym = async bookingId => {
    await supabase.from('open_gym_bookings').delete().eq('id', bookingId)
    showToast('Open Gym booking removed')
    fetchOpenGymBookings()
  }

  return (
    <div>
      <TodayStyles />
      <div className="today-hero">
        <div>
          <div className="today-kicker">Today</div>
          <h2>{formatDate(today)}</h2>
          <p>{signedClass ? `You're signed up for ${timeLabel(signedClass)} ${signedClass.title}.` : 'Your training day, class signups, and Open Gym status in one place.'}</p>
        </div>
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" className="today-avatar" />
          : <div className="today-avatar-placeholder">{initials(profile?.name || user.email)}</div>
        }
      </div>

      {isTrial && (
        <div className="today-status-row">
          <div className="today-status-card">
            <span>{trialRemaining}</span>
            <div>
              <strong>{trialRemaining === 1 ? 'trial class left' : 'trial classes left'}</strong>
              <small>{Math.min(trialUses, FREE_TRIAL_CLASS_LIMIT)} of {FREE_TRIAL_CLASS_LIMIT} used</small>
            </div>
          </div>
        </div>
      )}

      {!loading && !workoutAccess && !isTrial && (
        <div className="panel">
          <div className="panel-title">Start With A Free Trial</div>
          <p style={{ color: 'var(--charcoal-light)', lineHeight: 1.6 }}>
            Create your training profile and start your 3-class trial to book classes. Workout programming unlocks with an active membership.
          </p>
          <button className="btn-sm" onClick={() => setTab('profile')}>Go To Profile</button>
        </div>
      )}

      {!loading && isTrial && (
        <ClassSignupPanel
          title="Book A Trial Class"
          classes={classes}
          userId={user.id}
          canSignUp={canSignUp}
          onSignup={signup}
          onCancel={cancelSignup}
        />
      )}

      {loading && <div className="loading">Loading today...</div>}

      {!loading && workoutAccess && (
        <div className="today-grid">
          <div className="today-main">
            <div className="section-header" style={{ marginBottom: '1rem' }}>
              <h2 className="section-title">Today's Workout</h2>
              {trackOptions.length > 1 && (
                <select className="today-track-select" value={activeWorkout?.track || ''} onChange={e => setSelectedTrack(e.target.value)}>
                  {trackOptions.map(track => <option key={track} value={track}>{track}</option>)}
                </select>
              )}
            </div>

            {activeWorkout ? (
              <div className="workout-card today-workout-card">
                <div className="workout-header" style={{ cursor: 'default' }}>
                  <div>
                    <div className="workout-title">{activeWorkout.title}</div>
                    <div className="workout-meta" style={{ marginTop: '6px' }}>
                      <span className={`track-badge ${TRACK_CLASS[activeWorkout.track] || 'track-open'}`}>{activeWorkout.track}</span>
                      {summary && summary.setMovementCount > 0 && (
                        <span className="future-badge">{summary.loggedMovementCount} of {summary.setMovementCount} movements logged</span>
                      )}
                    </div>
                  </div>
                  <button className="btn-sm" onClick={() => setSignupTrack(activeWorkout.track)}>Sign Up</button>
                </div>

                <div className="workout-body">
                  {activeWorkout.notes && <p className="workout-notes">{activeWorkout.notes}</p>}
                  {summary?.sections.map(section => (
                    <div key={section.id} className="section-block">
                      <div className="section-block-title">{section.type}</div>
                      {section.notes && <p className="section-block-notes">{section.notes}</p>}
                      {(section.movements || []).sort((a, b) => a.order_index - b.order_index).slice(0, 5).map(movement => {
                        const hasLog = (movement.sets || []).some(set => (set.set_logs || []).some(log => log.athlete_id === user.id && log.value))
                        return (
                          <div key={movement.id} className="today-movement-row">
                            <span>{hasLog ? '✓' : '○'}</span>
                            <div>
                              <strong>{movement.name}</strong>
                              {movement.notes && <small>{movement.notes}</small>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                  <button className="btn-primary" onClick={() => setTab('workouts')}>Open Workout Logging</button>
                </div>
              </div>
            ) : (
              <div className="empty" style={{ padding: '2.5rem 1rem' }}>
                <h3>No workout posted today</h3>
                <p>Check the full Workouts tab if you need another date.</p>
              </div>
            )}
          </div>

          <div className="today-side">
            <ClassSignupPanel
              title={activeWorkout ? `${activeWorkout.track} Classes` : 'Classes Today'}
              classes={matchingClasses}
              userId={user.id}
              canSignUp={canSignUp}
              onSignup={signup}
              onCancel={cancelSignup}
            />

            <div className="pc">
              <div className="pc-title">Open Gym</div>
              {openGymBookings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {openGymBookings.map(booking => (
                    <button key={booking.id} className="btn-ghost" onClick={() => cancelOpenGym(booking.id)}>
                      Booked {booking.slot_start_time || 'today'} - cancel
                    </button>
                  ))}
                </div>
              ) : (
                <p className="no-data" style={{ paddingTop: 0 }}>No Open Gym booking today.</p>
              )}
              <button className="btn-sm" style={{ width: '100%', marginTop: '10px' }} onClick={() => setTab('schedule')}>Open Gym Times</button>
            </div>
          </div>
        </div>
      )}

      {signupTrack && (
        <div className="modal-wrap" onClick={e => { if (e.target.className === 'modal-wrap') setSignupTrack(null) }}>
          <div className="modal" style={{ maxWidth: '520px' }}>
            <div className="modal-head">
              <div>
                <div className="modal-title">Sign Up</div>
                <div className="modal-sub">{signupTrack} classes for today</div>
              </div>
              <button className="modal-close" onClick={() => setSignupTrack(null)}>x</button>
            </div>
            <div className="modal-body">
              <ClassSignupPanel
                title="Available Times"
                classes={classes.filter(cls => classTrackMatches(cls.track, signupTrack))}
                userId={user.id}
                canSignUp={canSignUp}
                onSignup={signup}
                onCancel={cancelSignup}
              />
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function TodayStyles() {
  return (
    <style>{`
      .today-hero{display:flex;justify-content:space-between;align-items:center;gap:1.5rem;background:linear-gradient(135deg,rgba(245,240,232,0.07),rgba(162,92,107,0.08));border:1px solid var(--border-strong);border-radius:4px;padding:1.5rem;margin-bottom:1.25rem}
      .today-kicker{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--rose-light);font-family:'Cinzel',serif;margin-bottom:6px}
      .today-hero h2{font-family:'Cinzel',serif;color:var(--gold-light);font-size:28px;letter-spacing:2px;margin:0 0 6px}
      .today-hero p{color:var(--charcoal-light);font-size:15px;line-height:1.6;max-width:620px;margin:0}
      .today-avatar,.today-avatar-placeholder{width:64px;height:64px;border-radius:50%;border:1px solid var(--gold-dark);flex-shrink:0}
      .today-avatar{object-fit:cover}
      .today-avatar-placeholder{display:flex;align-items:center;justify-content:center;background:rgba(200,169,106,0.15);font-family:'Cinzel',serif;color:var(--gold-light);font-size:20px}
      .today-status-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:1.25rem}
      .today-status-card{display:flex;align-items:center;gap:12px;background:rgba(200,169,106,0.08);border:1px solid var(--gold-dark);border-radius:4px;padding:12px 14px}
      .today-status-card span{font-family:'Cinzel',serif;color:var(--gold-light);font-size:32px;min-width:34px;text-align:center}
      .today-status-card strong{display:block;color:var(--bone);font-family:'Cinzel',serif;font-weight:400;letter-spacing:1px}
      .today-status-card small{display:block;color:var(--charcoal-light);font-size:12px;margin-top:2px}
      .today-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:1.25rem;align-items:start}
      .today-main,.today-side{min-width:0}
      .today-track-select{background:rgba(245,240,232,0.06);border:1px solid var(--border);border-radius:2px;padding:9px 12px;color:var(--bone);font-family:'Lato',sans-serif;font-size:15px;outline:none;max-width:260px}
      .today-track-select option{background:var(--charcoal);color:var(--bone)}
      .today-workout-card .workout-header{align-items:center}
      .today-movement-row{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid rgba(200,169,106,0.08);font-size:15px}
      .today-movement-row:last-child{border-bottom:none}
      .today-movement-row>span{color:var(--moss-light);font-family:'Cinzel',serif;width:20px;flex-shrink:0}
      .today-movement-row strong{display:block;color:var(--bone);font-weight:400}
      .today-movement-row small{display:block;color:var(--charcoal-light);font-size:13px;line-height:1.45;margin-top:3px}
      .today-class-panel{margin-bottom:1rem}
      .today-class-row{display:flex;justify-content:space-between;align-items:center;gap:12px;background:rgba(245,240,232,0.035);border:1px solid rgba(200,169,106,0.14);border-radius:4px;padding:11px 12px}
      .today-class-time{font-family:'Cinzel',serif;color:var(--gold-light);font-size:17px;letter-spacing:1px}
      .today-class-meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--charcoal-light);font-size:12px;margin-top:3px}
      @media(max-width:820px){.today-grid{grid-template-columns:1fr}.today-hero{align-items:flex-start}.today-hero h2{font-size:23px}.today-avatar,.today-avatar-placeholder{width:52px;height:52px}}
    `}</style>
  )
}

function ClassSignupPanel({ title, classes, userId, canSignUp, onSignup, onCancel }) {
  const sorted = [...classes].sort((a, b) => timeLabel(a).localeCompare(timeLabel(b)))

  return (
    <div className="pc today-class-panel">
      <div className="pc-title">{title}</div>
      {sorted.length === 0 ? (
        <p className="no-data">No matching class times today.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sorted.map(cls => {
            const signups = cls.recurring ? cls.instance?.instance_signups || [] : cls.class_signups || []
            const isSignedUp = signups.some(signup => signup.athlete_id === userId)
            const spots = Math.max((cls.capacity || 0) - signups.length, 0)
            return (
              <div key={`${cls.recurring ? 'r' : 'o'}-${cls.id}`} className="today-class-row">
                <div>
                  <div className="today-class-time">{timeLabel(cls)}</div>
                  <div className="today-class-meta">
                    <span>{cls.title}</span>
                    <span>{spots} spot{spots === 1 ? '' : 's'} open</span>
                  </div>
                </div>
                {isSignedUp
                  ? <button className="btn-ghost" onClick={() => onCancel(cls)}>Cancel</button>
                  : <button className="btn-sm" onClick={() => onSignup(cls)} disabled={!canSignUp || spots <= 0}>{spots <= 0 ? 'Full' : 'Sign Up'}</button>
                }
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
