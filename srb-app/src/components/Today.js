import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { notifyCoach } from '../utils/notifyCoach'
import {
  FREE_TRIAL_CLASS_LIMIT,
  canSeeWorkouts,
  hasClassAccess,
  hasOpenGymAccess,
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
const CHECKIN_TIMES = [
  '12:00 AM','1:00 AM','2:00 AM','3:00 AM','4:00 AM','5:00 AM',
  '6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM',
  '12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM',
  '6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM','11:00 PM'
]
const DEFAULT_OPEN_GYM_DURATION = 60
const DEFAULT_OPEN_GYM_CAPACITY = 1

function toISO(d) { return d.toISOString().split('T')[0] }
function parseISO(dateStr) { return new Date(dateStr + 'T12:00:00') }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d }
function formatDate(d) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
function shortDate(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
function getDayOfWeek(dateStr) { return DAYS[parseISO(dateStr).getDay()] }
function initials(name) { return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

function timeInputToLabel(value) {
  if (!value) return ''
  const [h, m] = value.split(':')
  const hr = parseInt(h, 10)
  return `${hr > 12 ? hr - 12 : hr === 0 ? 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

function labelToMinutes(value) {
  if (!value) return null
  const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null
  let hour = parseInt(match[1], 10)
  const minute = parseInt(match[2], 10)
  const period = match[3].toUpperCase()
  if (period === 'PM' && hour !== 12) hour += 12
  if (period === 'AM' && hour === 12) hour = 0
  return hour * 60 + minute
}

function inputTimeToMinutes(value) {
  if (!value) return null
  const [h, m] = value.split(':')
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

function minutesToInputTime(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440
  const hour = Math.floor(normalized / 60)
  const minute = normalized % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function defaultOpenGymSlots() {
  return CHECKIN_TIMES.map(label => {
    const startMinutes = labelToMinutes(label)
    const startTime = minutesToInputTime(startMinutes)
    return {
      id: `default-${startTime}`,
      slot_key: `default-${startTime}`,
      start_time: startTime,
      duration_minutes: DEFAULT_OPEN_GYM_DURATION,
      capacity: DEFAULT_OPEN_GYM_CAPACITY,
      recurrence_days: DAYS.join(','),
      notes: '',
      active: true,
      defaultSlot: true
    }
  })
}

function classWindow(cls) {
  if (cls.start_time) {
    const start = new Date(cls.start_time)
    return { start: start.getHours() * 60 + start.getMinutes(), end: start.getHours() * 60 + start.getMinutes() + (cls.duration_minutes || 60) }
  }
  const start = labelToMinutes(cls.recurrence_time)
  if (start == null) return null
  return { start, end: start + (cls.duration_minutes || 60) }
}

function slotWindow(row) {
  const start = inputTimeToMinutes(row.start_time)
  if (start == null) return null
  return { start, end: start + (row.duration_minutes || 60) }
}

function windowsOverlap(a, b) {
  if (!a || !b) return false
  return a.start < b.end && b.start < a.end
}

function rowRepeatsToday(row, dayOfWeek, isoDate) {
  if (!row.active && row.active !== undefined) return false
  if (row.slot_date || row.block_date) return (row.slot_date || row.block_date) === isoDate
  const days = (row.recurrence_days || '').split(',').map(d => d.trim()).filter(Boolean)
  return days.includes(dayOfWeek)
}

function timeLabel(cls) {
  if (cls.recurrence_time) return cls.recurrence_time
  if (cls.start_time) return new Date(cls.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return 'Class time'
}

function timeSortValue(cls) {
  const label = timeLabel(cls)
  const match = label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return 9999
  let hour = parseInt(match[1], 10)
  const minute = parseInt(match[2], 10)
  const period = match[3].toUpperCase()
  if (period === 'PM' && hour !== 12) hour += 12
  if (period === 'AM' && hour === 12) hour = 0
  return hour * 60 + minute
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
  const [currentDate, setCurrentDate] = useState(new Date())
  const iso = toISO(currentDate)
  const dayOfWeek = getDayOfWeek(iso)
  const isCoach = profileIsCoach(profile)
  const isTrial = isFreeTrial(profile)
  const workoutAccess = canSeeWorkouts(profile)
  const classAccess = hasClassAccess(profile)
  const openGymAccess = hasOpenGymAccess(profile)
  const [workouts, setWorkouts] = useState([])
  const [classes, setClasses] = useState([])
  const [trialUses, setTrialUses] = useState(0)
  const [openGymBookings, setOpenGymBookings] = useState([])
  const [openGymSlots, setOpenGymSlots] = useState([])
  const [openGymBlocks, setOpenGymBlocks] = useState([])
  const [openGymAvailable, setOpenGymAvailable] = useState(true)
  const [showOpenGymPicker, setShowOpenGymPicker] = useState(false)
  const [signupTrack, setSignupTrack] = useState(null)
  const [signupClasses, setSignupClasses] = useState([])
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

  const classesForDate = useCallback(async (dateObj) => {
    const dateIso = toISO(dateObj)
    const dateDay = getDayOfWeek(dateIso)

    const { data: oneTime } = await supabase
      .from('classes')
      .select('*, class_signups(athlete_id, checkin_time, profiles(name, avatar_url))')
      .eq('is_247', false)
      .is('recurrence_days', null)
      .gte('start_time', `${dateIso}T00:00:00.000Z`)
      .lte('start_time', `${dateIso}T23:59:59.999Z`)
      .order('start_time', { ascending: true })

    const { data: recurring } = await supabase
      .from('classes')
      .select('*')
      .eq('is_247', false)
      .not('recurrence_days', 'is', null)

    const matchingRecurring = (recurring || []).filter(cls =>
      (cls.recurrence_days || '').split(',').map(d => d.trim()).includes(dateDay)
    )

    const recurringWithInstances = await Promise.all(matchingRecurring.map(async cls => {
      let { data: instance } = await supabase
        .from('class_instances')
        .select('*, instance_signups(athlete_id, checkin_time, profiles(name, avatar_url))')
        .eq('class_id', cls.id)
        .eq('instance_date', dateIso)
        .single()

      if (!instance) {
        const { data: newInstance } = await supabase
          .from('class_instances')
          .insert({ class_id: cls.id, instance_date: dateIso })
          .select('*, instance_signups(athlete_id, checkin_time, profiles(name, avatar_url))')
          .single()
        instance = newInstance
      }

      return { ...cls, instance, date: dateIso, dateObj, recurring: true }
    }))

    return [
      ...(oneTime || []).map(cls => ({ ...cls, date: dateIso, dateObj, recurring: false })),
      ...recurringWithInstances.filter(Boolean)
    ]
  }, [])

  const fetchClasses = useCallback(async () => {
    const dayClasses = await classesForDate(currentDate)
    setClasses(dayClasses)
  }, [classesForDate, currentDate])

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
      .select('*, profiles(name, avatar_url)')
      .eq('booking_date', iso)

    setOpenGymBookings(data || [])
  }, [iso, user.id])

  const fetchOpenGymRules = useCallback(async () => {
    const { data: slots, error: slotsError } = await supabase
      .from('open_gym_slots')
      .select('*')
      .eq('active', true)
      .order('start_time', { ascending: true })

    const { data: blocks, error: blocksError } = await supabase
      .from('open_gym_blocks')
      .select('*')
      .eq('active', true)

    if (slotsError || blocksError) {
      setOpenGymAvailable(false)
      setOpenGymSlots([])
      setOpenGymBlocks([])
      return
    }

    setOpenGymAvailable(true)
    setOpenGymSlots(slots || [])
    setOpenGymBlocks(blocks || [])
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchWorkouts(), fetchClasses(), fetchTrialUses(), fetchOpenGymBookings(), fetchOpenGymRules()])
    setLoading(false)
  }, [fetchClasses, fetchOpenGymBookings, fetchOpenGymRules, fetchTrialUses, fetchWorkouts])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!signupTrack) {
      setSignupClasses([])
      return
    }

    setSignupClasses(classes.filter(cls => classTrackMatches(cls.track, signupTrack)))
  }, [classes, signupTrack])

  const sortedWorkouts = useMemo(() => {
    return [...workouts].sort((a, b) => {
      const aTrack = PUBLIC_TRACKS.indexOf(a.track)
      const bTrack = PUBLIC_TRACKS.indexOf(b.track)
      if (aTrack !== bTrack) return (aTrack === -1 ? 99 : aTrack) - (bTrack === -1 ? 99 : bTrack)
      return (a.title || '').localeCompare(b.title || '')
    })
  }, [workouts])

  const signedClass = classes.find(cls => {
    const signups = signupsForClass(cls)
    return signups.some(signup => signup.athlete_id === user.id)
  })
  const canSignUp = classAccess || (isTrial && trialUses < FREE_TRIAL_CLASS_LIMIT)
  const trialRemaining = Math.max(FREE_TRIAL_CLASS_LIMIT - trialUses, 0)
  const todaysClassWindows = classes.map(cls => classWindow(cls)).filter(Boolean)
  const todaysBlocks = openGymBlocks.filter(block => rowRepeatsToday(block, dayOfWeek, iso))
  const openGymSlotsToday = [...defaultOpenGymSlots(), ...openGymSlots]
    .filter(slot => rowRepeatsToday(slot, dayOfWeek, iso))
    .map(slot => {
      const window = slotWindow(slot)
      const bookings = openGymBookings.filter(booking =>
        slot.defaultSlot ? booking.slot_key === slot.slot_key : booking.slot_id === slot.id
      )
      const conflictingClass = todaysClassWindows.some(classTime => windowsOverlap(window, classTime))
      const conflictingBlock = todaysBlocks.some(block => windowsOverlap(window, slotWindow(block)))
      const unavailableReason = conflictingClass ? 'Class/private coaching time' : conflictingBlock ? 'Blocked by coach' : ''
      return { ...slot, window, bookings, unavailable: conflictingClass || conflictingBlock, unavailableReason }
    })
  const availableOpenGymSlots = openGymSlotsToday.filter(slot => {
    const spots = Math.max((slot.capacity || 1) - (slot.bookings?.length || 0), 0)
    const myBooking = slot.bookings?.find(booking => booking.athlete_id === user.id)
    return myBooking || (!slot.unavailable && spots > 0)
  })
  const myOpenGymBookings = openGymSlotsToday.flatMap(slot =>
    (slot.bookings || [])
      .filter(booking => booking.athlete_id === user.id)
      .map(booking => ({ ...booking, slot }))
  )

  const prevDay = () => setCurrentDate(d => addDays(d, -1))
  const nextDay = () => setCurrentDate(d => addDays(d, 1))
  const goToday = () => setCurrentDate(new Date())
  const isToday = iso === toISO(new Date())

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
      `${profile?.name || 'An athlete'} signed up for ${cls.title} at ${timeLabel(cls)} on ${shortDate(parseISO(cls.date || iso))}.`
    )
    showToast('Signed up!')
    await refresh()
    if (signupTrack) {
      const rows = await classesForDate(currentDate)
      setSignupClasses(rows.filter(row => classTrackMatches(row.track, signupTrack)))
    }
  }

  const cancelSignup = async cls => {
    if (cls.recurring) await supabase.from('instance_signups').delete().match({ instance_id: cls.instance?.id, athlete_id: user.id })
    else await supabase.from('class_signups').delete().match({ class_id: cls.id, athlete_id: user.id })
    showToast('Class signup removed')
    await refresh()
  }

  const cancelOpenGym = async bookingId => {
    await supabase.from('open_gym_bookings').delete().eq('id', bookingId)
    showToast('Open Gym booking removed')
    fetchOpenGymBookings()
  }

  const bookOpenGymSlot = async slot => {
    if (!openGymAccess) { showToast('Open Gym access is for active Open Gym or Class Access members only.'); return }
    if (!profile?.waiver_signed) { showToast('Please sign the waiver first.'); return }
    if (slot.unavailable) { showToast('That Open Gym time is not available.'); return }
    if ((slot.bookings?.length || 0) >= (slot.capacity || 1)) { showToast('That Open Gym time is full.'); return }

    const bookingPayload = {
      athlete_id: user.id,
      booking_date: iso
    }

    if (slot.defaultSlot) {
      bookingPayload.slot_key = slot.slot_key
      bookingPayload.slot_start_time = slot.start_time
      bookingPayload.slot_duration_minutes = slot.duration_minutes
    } else {
      bookingPayload.slot_id = slot.id
    }

    const { error } = await supabase.from('open_gym_bookings').insert(bookingPayload)

    if (error) {
      showToast('Already booked')
      return
    }

    await supabase.from('notifications').insert({
      message: `${profile?.name || 'An athlete'} booked Open Gym for ${timeInputToLabel(slot.start_time)} on ${formatDate(currentDate)}`,
      type: 'open_gym_booking',
      athlete_id: user.id
    })

    await notifyCoach(
      'Open Gym Booked',
      `${profile?.name || 'An athlete'} booked Open Gym for ${timeInputToLabel(slot.start_time)} on ${formatDate(currentDate)}.`
    )

    showToast('Open Gym booked!')
    setShowOpenGymPicker(false)
    fetchOpenGymBookings()
  }

  return (
    <div>
      <TodayStyles />
      <div className="today-hero">
        <div>
          <div className="today-kicker">Training Hub</div>
          <h2>{formatDate(currentDate)}</h2>
          <p>{signedClass ? `You're signed up for ${timeLabel(signedClass)} ${signedClass.title}.` : 'Browse the day, see the workouts, and book the class that matches your track.'}</p>
        </div>
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" className="today-avatar" />
          : <div className="today-avatar-placeholder">{initials(profile?.name || user.email)}</div>
        }
      </div>

      <div className="today-date-strip">
        <button className="date-nav-btn" onClick={prevDay}>‹</button>
        <button className={!isToday ? 'btn-ghost' : 'btn-sm'} onClick={goToday}>{isToday ? 'Today' : 'Back To Today'}</button>
        <button className="date-nav-btn" onClick={nextDay}>›</button>
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

      {loading && <div className="loading">Loading training day...</div>}

      {!loading && (
        <div className="today-grid">
          <div className="today-main">
            <div className="section-header" style={{ marginBottom: '1rem' }}>
              <h2 className="section-title">Workouts</h2>
              <span className="date-nav-today">{dayOfWeek}</span>
            </div>

            {workoutAccess && sortedWorkouts.length > 0 ? (
              <div className="today-workout-stack">
                {sortedWorkouts.map(workout => (
                  <WorkoutPreview
                    key={workout.id}
                    workout={workout}
                    userId={user.id}
                    onSignup={() => setSignupTrack(workout.track || 'All Tracks')}
                    onOpenLogging={() => setTab('workouts')}
                  />
                ))}
              </div>
            ) : workoutAccess ? (
              <div className="empty" style={{ padding: '2.5rem 1rem' }}>
                <h3>No workout posted for this day</h3>
                <p>Use the arrows above to move through the training week.</p>
              </div>
            ) : isTrial ? (
              <div className="panel">
                <div className="panel-title">Trial Class Booking</div>
                <p style={{ color: 'var(--charcoal-light)', lineHeight: 1.6 }}>
                  Free trials can book classes, but workout programming unlocks after activating a membership.
                </p>
              </div>
            ) : null}
          </div>

          <div className="today-side">
            <ClassSignupPanel
              title="Classes This Day"
              classes={classes}
              userId={user.id}
              canSignUp={canSignUp}
              isCoach={isCoach}
              onSignup={signup}
              onCancel={cancelSignup}
              showRosters
            />

            <div className="pc">
              <div className="pc-title">Open Gym</div>
              {!openGymAvailable && (
                <p className="no-data" style={{ paddingTop: 0 }}>Open Gym scheduling needs setup before it can show available windows here.</p>
              )}
              {openGymAvailable && myOpenGymBookings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {myOpenGymBookings.map(booking => (
                    <button key={booking.id} className="btn-ghost" onClick={() => cancelOpenGym(booking.id)}>
                      Booked {timeInputToLabel(booking.slot.start_time)} - cancel
                    </button>
                  ))}
                </div>
              ) : openGymAvailable ? (
                <p className="no-data" style={{ paddingTop: 0 }}>No Open Gym booking for this day.</p>
              ) : null}
              <button className="btn-sm" style={{ width: '100%', marginTop: '10px' }} onClick={() => setShowOpenGymPicker(true)} disabled={!openGymAccess || availableOpenGymSlots.length === 0}>
                Check In for Open Gym
              </button>
              {isCoach && <button className="btn-ghost" style={{ width: '100%', marginTop: '8px' }} onClick={() => setTab('schedule')}>Manage Open Gym</button>}
            </div>
          </div>
        </div>
      )}

      {signupTrack && (
        <div className="modal-wrap" onClick={e => { if (e.target.className === 'modal-wrap') setSignupTrack(null) }}>
          <div className="modal" style={{ maxWidth: '620px' }}>
            <div className="modal-head">
              <div>
                <div className="modal-title">Sign Up</div>
                <div className="modal-sub">{signupTrack} classes on {shortDate(currentDate)}</div>
              </div>
              <button className="modal-close" onClick={() => setSignupTrack(null)}>x</button>
            </div>
            <div className="modal-body">
              <ClassSignupPanel
                title="Available Times"
                classes={signupClasses}
                userId={user.id}
                canSignUp={canSignUp}
                isCoach={isCoach}
                onSignup={signup}
                onCancel={cancelSignup}
                showRosters
              />
            </div>
          </div>
        </div>
      )}

      {showOpenGymPicker && (
        <OpenGymPickerModal
          slots={availableOpenGymSlots}
          user={user}
          openGymAccess={openGymAccess}
          onBook={bookOpenGymSlot}
          onCancelBooking={cancelOpenGym}
          onClose={() => setShowOpenGymPicker(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function WorkoutPreview({ workout, userId, onSignup, onOpenLogging }) {
  const summary = summarizeWorkout(workout, userId)

  return (
    <div className="workout-card today-workout-card">
      <div className="workout-header" style={{ cursor: 'default' }}>
        <div>
          <div className="workout-title">{workout.title}</div>
          <div className="workout-meta" style={{ marginTop: '6px' }}>
            <span className={`track-badge ${TRACK_CLASS[workout.track] || 'track-open'}`}>{workout.track || 'All Tracks'}</span>
            {summary.setMovementCount > 0 && (
              <span className="future-badge">{summary.loggedMovementCount} of {summary.setMovementCount} movements logged</span>
            )}
          </div>
        </div>
        <button className="btn-sm" onClick={onSignup}>Sign Up</button>
      </div>

      <div className="workout-body">
        {workout.notes && <p className="workout-notes">{workout.notes}</p>}
        {summary.sections.map(section => (
          <div key={section.id} className="section-block">
            <div className="section-block-title">{section.type}</div>
            {section.notes && <p className="section-block-notes">{section.notes}</p>}
            {(section.movements || []).sort((a, b) => a.order_index - b.order_index).slice(0, 6).map(movement => {
              const hasLog = (movement.sets || []).some(set => (set.set_logs || []).some(log => log.athlete_id === userId && log.value))
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
        <button className="btn-primary" onClick={onOpenLogging}>Open Workout Logging</button>
      </div>
    </div>
  )
}

function TodayStyles() {
  return (
    <style>{`
      .today-hero{display:flex;justify-content:space-between;align-items:center;gap:1.5rem;background:linear-gradient(135deg,rgba(245,240,232,0.07),rgba(162,92,107,0.08));border:1px solid var(--border-strong);border-radius:4px;padding:1.5rem;margin-bottom:1rem}
      .today-kicker{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--rose-light);font-family:'Cinzel',serif;margin-bottom:6px}
      .today-hero h2{font-family:'Cinzel',serif;color:var(--gold-light);font-size:28px;letter-spacing:2px;margin:0 0 6px}
      .today-hero p{color:var(--charcoal-light);font-size:15px;line-height:1.6;max-width:680px;margin:0}
      .today-avatar,.today-avatar-placeholder{width:64px;height:64px;border-radius:50%;border:1px solid var(--gold-dark);flex-shrink:0}
      .today-avatar{object-fit:cover}
      .today-avatar-placeholder{display:flex;align-items:center;justify-content:center;background:rgba(200,169,106,0.15);font-family:'Cinzel',serif;color:var(--gold-light);font-size:20px}
      .today-date-strip{display:flex;justify-content:center;align-items:center;gap:10px;margin:0 0 1.25rem}
      .today-status-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:1.25rem}
      .today-status-card{display:flex;align-items:center;gap:12px;background:rgba(200,169,106,0.08);border:1px solid var(--gold-dark);border-radius:4px;padding:12px 14px}
      .today-status-card span{font-family:'Cinzel',serif;color:var(--gold-light);font-size:32px;min-width:34px;text-align:center}
      .today-status-card strong{display:block;color:var(--bone);font-family:'Cinzel',serif;font-weight:400;letter-spacing:1px}
      .today-status-card small{display:block;color:var(--charcoal-light);font-size:12px;margin-top:2px}
      .today-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:1.25rem;align-items:start}
      .today-main,.today-side{min-width:0}
      .today-workout-stack{display:flex;flex-direction:column;gap:1rem}
      .today-workout-card .workout-header{align-items:center}
      .today-movement-row{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid rgba(200,169,106,0.08);font-size:15px}
      .today-movement-row:last-child{border-bottom:none}
      .today-movement-row>span{color:var(--moss-light);font-family:'Cinzel',serif;width:20px;flex-shrink:0}
      .today-movement-row strong{display:block;color:var(--bone);font-weight:400}
      .today-movement-row small{display:block;color:var(--charcoal-light);font-size:13px;line-height:1.45;margin-top:3px}
      .today-class-panel{margin-bottom:1rem}
      .today-class-row{display:flex;justify-content:space-between;align-items:center;gap:12px;background:rgba(245,240,232,0.035);border:1px solid rgba(200,169,106,0.14);border-radius:4px;padding:11px 12px}
      .today-class-time{font-family:'Cinzel',serif;color:var(--gold-light);font-size:17px;letter-spacing:1px}
      .today-class-date{color:var(--rose-light);font-size:12px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:2px}
      .today-class-meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--charcoal-light);font-size:12px;margin-top:3px}
      .today-roster{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
      .today-roster span{border:1px solid rgba(200,169,106,0.16);background:rgba(245,240,232,0.04);color:var(--charcoal-light);border-radius:2px;padding:2px 6px;font-size:11px}
      .today-roster .checked{border-color:var(--moss);color:var(--moss-light)}
      .today-open-gym-list{display:flex;flex-direction:column;gap:10px}
      .today-open-gym-slot{display:flex;justify-content:space-between;align-items:center;gap:12px;background:rgba(245,240,232,0.035);border:1px solid rgba(200,169,106,0.14);border-radius:4px;padding:11px 12px}
      .today-open-gym-time{font-family:'Cinzel',serif;color:var(--gold-light);font-size:17px;letter-spacing:1px}
      .today-open-gym-meta{color:var(--charcoal-light);font-size:12px;margin-top:3px}
      .today-open-gym-notes{color:var(--rose-light);font-size:12px;margin-top:4px;font-style:italic}
      @media(max-width:820px){.today-grid{grid-template-columns:1fr}.today-hero{align-items:flex-start}.today-hero h2{font-size:23px}.today-avatar,.today-avatar-placeholder{width:52px;height:52px}.today-class-row{align-items:flex-start;flex-direction:column}.today-class-row button{width:100%}}
    `}</style>
  )
}

function signupsForClass(cls) {
  return cls.recurring ? cls.instance?.instance_signups || [] : cls.class_signups || []
}

function OpenGymPickerModal({ slots, user, openGymAccess, onBook, onCancelBooking, onClose }) {
  return (
    <div className="modal-wrap" onClick={e => { if (e.target.className === 'modal-wrap') onClose() }}>
      <div className="modal" style={{ maxWidth: '560px' }}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Open Gym</div>
            <div className="modal-sub">Choose an available one-hour window.</div>
          </div>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          {slots.length === 0 && <p className="no-data">No Open Gym times are available for this day.</p>}
          <div className="today-open-gym-list">
            {slots.map(slot => {
              const myBooking = slot.bookings?.find(booking => booking.athlete_id === user.id)
              const spots = Math.max((slot.capacity || 1) - (slot.bookings?.length || 0), 0)
              const endMinutes = inputTimeToMinutes(slot.start_time) + (slot.duration_minutes || 60)
              return (
                <div key={slot.id} className="today-open-gym-slot">
                  <div>
                    <div className="today-open-gym-time">{timeInputToLabel(slot.start_time)} - {timeInputToLabel(minutesToInputTime(endMinutes))}</div>
                    <div className="today-open-gym-meta">{spots} spot{spots !== 1 ? 's' : ''} open</div>
                    {slot.notes && <div className="today-open-gym-notes">{slot.notes}</div>}
                  </div>
                  {myBooking
                    ? <button className="btn-ghost" onClick={() => onCancelBooking(myBooking.id)}>Cancel</button>
                    : <button className="btn-sm" onClick={() => onBook(slot)} disabled={!openGymAccess}>Check In</button>
                  }
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function ClassSignupPanel({ title, classes, userId, canSignUp, isCoach, onSignup, onCancel, showDates = false, showRosters = false }) {
  const sorted = [...classes].sort((a, b) => {
    const dateCompare = (a.date || '').localeCompare(b.date || '')
    if (dateCompare !== 0) return dateCompare
    return timeSortValue(a) - timeSortValue(b)
  })

  return (
    <div className="pc today-class-panel">
      <div className="pc-title">{title}</div>
      {sorted.length === 0 ? (
        <p className="no-data">No matching class times.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sorted.map(cls => {
            const signups = signupsForClass(cls)
            const isSignedUp = signups.some(signup => signup.athlete_id === userId)
            const spots = Math.max((cls.capacity || 0) - signups.length, 0)
            const key = `${cls.recurring ? 'r' : 'o'}-${cls.date || 'today'}-${cls.id}`
            return (
              <div key={key} className="today-class-row">
                <div style={{ flex: 1 }}>
                  {showDates && <div className="today-class-date">{shortDate(parseISO(cls.date))}</div>}
                  <div className="today-class-time">{timeLabel(cls)}</div>
                  <div className="today-class-meta">
                    <span>{cls.title}</span>
                    <span>{spots} spot{spots === 1 ? '' : 's'} open</span>
                    {cls.track && <span>{cls.track}</span>}
                  </div>
                  {showRosters && isCoach && (
                    <div className="today-roster">
                      {signups.length === 0
                        ? <span>No one signed up</span>
                        : signups.map((signup, i) => (
                          <span key={`${signup.athlete_id}-${i}`} className={signup.checkin_time ? 'checked' : ''}>
                            {signup.profiles?.name || 'Athlete'}{signup.checkin_time ? ' ✓' : ''}
                          </span>
                        ))
                      }
                    </div>
                  )}
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
