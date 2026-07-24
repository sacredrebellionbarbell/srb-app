import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import usePushNotifications from '../hooks/usePushNotifications'
import AthletePanel from './AthletePanel'
import { notifyCoach } from '../utils/notifyCoach'
import {
  FREE_TRIAL_CLASS_LIMIT,
  hasClassAccess,
  isCoach as profileIsCoach,
  isFreeTrial
} from '../utils/access'

function toISO(d) { return d.toISOString().split('T')[0] }
function formatDate(d) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) }
function currentTimeLabel() { return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }

// Day of week helpers
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function getDayOfWeek(dateStr) {
  // Use UTC to avoid timezone shifting the date
  const d = new Date(dateStr + 'T12:00:00')
  return DAYS[d.getDay()]
}

const CHECKIN_TIMES = [
  '12:00 AM','1:00 AM','2:00 AM','3:00 AM','4:00 AM','5:00 AM',
  '6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM',
  '12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM',
  '6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM','11:00 PM'
]
const DEFAULT_OPEN_GYM_DURATION = 60
const DEFAULT_OPEN_GYM_CAPACITY = 1

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
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
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

function classWindow(cls, isoDate) {
  if (cls.start_time) {
    const start = new Date(cls.start_time)
    return { start: start.getHours() * 60 + start.getMinutes(), end: start.getHours() * 60 + start.getMinutes() + (cls.duration_minutes || 60) }
  }
  const start = labelToMinutes(cls.recurrence_time)
  if (start == null) return null
  return { start, end: start + (cls.duration_minutes || 60), label: cls.recurrence_time, date: isoDate }
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

export default function Schedule({ user, profile }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [oneTimeClasses, setOneTimeClasses] = useState([])
  const [recurringClasses, setRecurringClasses] = useState([])
  const [has247, setHas247] = useState(null)
  const [allMembers, setAllMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [show247, setShow247] = useState(false)
  const [showCoachCheckin, setShowCoachCheckin] = useState(false)
  const [checkinTime, setCheckinTime] = useState('6:00 AM')
  const [toast, setToast] = useState(null)
  const [athletePanel, setAthletePanel] = useState(null)
  const [trialUses, setTrialUses] = useState(0)
  const [openGymSlots, setOpenGymSlots] = useState([])
  const [openGymBookings, setOpenGymBookings] = useState([])
  const [openGymBlocks, setOpenGymBlocks] = useState([])
  const [showOpenGymSlotForm, setShowOpenGymSlotForm] = useState(false)
  const [showOpenGymBlockForm, setShowOpenGymBlockForm] = useState(false)
  const [openGymAvailable, setOpenGymAvailable] = useState(true)
  const isCoach = profileIsCoach(profile)
  const isTrial = isFreeTrial(profile)
  const { permission, subscribed, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications(user)
  const canUsePaidClassAccess = hasClassAccess(profile)
  const canSignUp = canUsePaidClassAccess || (isTrial && trialUses < FREE_TRIAL_CLASS_LIMIT)

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const iso = toISO(currentDate)
  const dayOfWeek = getDayOfWeek(iso)

  const fetchClasses = useCallback(async () => {
    setLoading(true)

    // Fetch one-time classes for this exact date
    const { data: oneTime } = await supabase
      .from('classes')
      .select('*, class_signups(athlete_id, checkin_time, profiles(name, avatar_url))')
      .eq('is_247', false)
      .is('recurrence_days', null)
      .gte('start_time', `${iso}T00:00:00.000Z`)
      .lte('start_time', `${iso}T23:59:59.999Z`)
      .order('start_time', { ascending: true })

    // Fetch recurring classes that include today's day of week
    const { data: recurring } = await supabase
      .from('classes')
      .select('*')
      .eq('is_247', false)
      .not('recurrence_days', 'is', null)

    // Fetch 24/7 class
    const { data: c247 } = await supabase
      .from('classes')
      .select('*, class_signups(athlete_id, checkin_time, profiles(name, avatar_url))')
      .eq('is_247', true)
      .limit(1)
      .single()

    // Filter recurring classes to only those that match today's day
    const todayRecurring = (recurring || []).filter(cls => {
      const days = (cls.recurrence_days || '').split(',').map(d => d.trim())
      return days.includes(dayOfWeek)
    })

    // For each matching recurring class, get or create an instance for today
    const recurringWithInstances = await Promise.all(todayRecurring.map(async cls => {
      // Try to get existing instance for today
      let { data: instance } = await supabase
        .from('class_instances')
        .select('*, instance_signups(athlete_id, checkin_time, profiles(name, avatar_url))')
        .eq('class_id', cls.id)
        .eq('instance_date', iso)
        .single()

      // Create instance if it doesn't exist yet
      if (!instance) {
        const { data: newInstance } = await supabase
          .from('class_instances')
          .insert({ class_id: cls.id, instance_date: iso })
          .select('*, instance_signups(athlete_id, checkin_time, profiles(name, avatar_url))')
          .single()
        instance = newInstance
      }

      return { ...cls, instance }
    }))

    setOneTimeClasses(oneTime || [])
    setRecurringClasses(recurringWithInstances.filter(Boolean))
    setHas247(c247 || null)
    setLoading(false)
  }, [currentDate, iso, dayOfWeek])

  const fetchOpenGym = useCallback(async () => {
    const { data: slots, error: slotsError } = await supabase
      .from('open_gym_slots')
      .select('*')
      .eq('active', true)
      .order('start_time', { ascending: true })

    const { data: bookings, error: bookingsError } = await supabase
      .from('open_gym_bookings')
      .select('*, profiles(name, avatar_url)')
      .eq('booking_date', iso)

    const { data: blocks, error: blocksError } = await supabase
      .from('open_gym_blocks')
      .select('*')
      .eq('active', true)

    if (slotsError || bookingsError || blocksError) {
      setOpenGymAvailable(false)
      setOpenGymSlots([])
      setOpenGymBookings([])
      setOpenGymBlocks([])
      return
    }

    setOpenGymAvailable(true)
    setOpenGymSlots(slots || [])
    setOpenGymBookings(bookings || [])
    setOpenGymBlocks(blocks || [])
  }, [iso])

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
  }, [isTrial, user?.id])

  useEffect(() => { fetchClasses() }, [fetchClasses])
  useEffect(() => { fetchOpenGym() }, [fetchOpenGym])
  useEffect(() => { fetchTrialUses() }, [fetchTrialUses])

  useEffect(() => {
    if (isCoach) {
      supabase.from('profiles').select('id, name, avatar_url, membership_type').order('name')
        .then(({ data }) => setAllMembers(data || []))
    }
  }, [isCoach])

  const prevDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); setCurrentDate(d) }
  const nextDay = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); setCurrentDate(d) }
  const goToday = () => setCurrentDate(new Date())
  const isToday = toISO(currentDate) === toISO(new Date())

  // Sign up for a one-time class
  const signup = async (classId) => {
    if (isTrial && trialUses >= FREE_TRIAL_CLASS_LIMIT) { showToast('Your free trial classes are used. Upgrade to keep training.'); return }
    if (!canSignUp) { showToast('Your membership does not include class access.'); return }
    if (!profile?.waiver_signed) { showToast('Please sign the liability waiver in your Profile tab first.'); return }

    const { error } = await supabase.from('class_signups').insert({ class_id: classId, athlete_id: user.id })

    if (error) {
      showToast('Already signed up')
    } else {
      const cls = oneTimeClasses.find(c => c.id === classId)
      const className = cls?.title || 'a class'
      const classTime = cls?.start_time
        ? new Date(cls.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : ''

      await notifyCoach(
        'New Class Signup',
        `${profile?.name || 'An athlete'} signed up for ${className}${classTime ? ` at ${classTime}` : ''}.`
      )

      showToast('Signed up!')
      fetchTrialUses()
      fetchClasses()
    }
  }

  const unsignup = async (classId) => {
    await supabase.from('class_signups').delete().match({ class_id: classId, athlete_id: user.id })
    showToast('Removed'); fetchTrialUses(); fetchClasses()
  }

  // Sign up for a recurring class instance
  const signupInstance = async (instanceId) => {
    if (isTrial && trialUses >= FREE_TRIAL_CLASS_LIMIT) { showToast('Your free trial classes are used. Upgrade to keep training.'); return }
    if (!canSignUp) { showToast('Your membership does not include class access.'); return }
    if (!profile?.waiver_signed) { showToast('Please sign the liability waiver in your Profile tab first.'); return }

    const { error } = await supabase.from('instance_signups').insert({ instance_id: instanceId, athlete_id: user.id })

    if (error) {
      showToast('Already signed up')
    } else {
      const cls = recurringClasses.find(c => c.instance?.id === instanceId)
      const className = cls?.title || 'a recurring class'
      const classTime = cls?.recurrence_time || ''

      await notifyCoach(
        'New Class Signup',
        `${profile?.name || 'An athlete'} signed up for ${className}${classTime ? ` at ${classTime}` : ''}.`
      )

      showToast('Signed up!')
      fetchTrialUses()
      fetchClasses()
    }
  }

  const unsignupInstance = async (instanceId) => {
    await supabase.from('instance_signups').delete().match({ instance_id: instanceId, athlete_id: user.id })
    showToast('Removed'); fetchTrialUses(); fetchClasses()
  }

  const removeFromClass = async (classId, athleteId) => {
    if (!isCoach || !athleteId) return
    await supabase.from('class_signups').delete().match({ class_id: classId, athlete_id: athleteId })
    showToast('Athlete removed')
    fetchClasses()
  }

  const removeFromInstance = async (instanceId, athleteId) => {
    if (!isCoach || !instanceId || !athleteId) return
    await supabase.from('instance_signups').delete().match({ instance_id: instanceId, athlete_id: athleteId })
    showToast('Athlete removed')
    fetchClasses()
  }

  const markClassAttendance = async (classId, athleteId, attended) => {
    if (!isCoach || !classId || !athleteId) return
    const checkin_time = attended ? currentTimeLabel() : null
    const { data, error } = await supabase
      .from('class_signups')
      .update({ checkin_time })
      .match({ class_id: classId, athlete_id: athleteId })
      .select('id')

    if (error) showToast('Could not update attendance: ' + error.message)
    else {
      if (attended && (!data || data.length === 0)) {
        const { error: insertError } = await supabase
          .from('class_signups')
          .insert({ class_id: classId, athlete_id: athleteId, checkin_time })

        if (insertError) {
          showToast('Could not attach attendance to athlete: ' + insertError.message)
          return
        }
      }
      showToast(attended ? 'Marked attended' : 'Attendance removed')
      fetchClasses()
    }
  }

  const markInstanceAttendance = async (instanceId, athleteId, attended) => {
    if (!isCoach || !instanceId || !athleteId) return
    const checkin_time = attended ? currentTimeLabel() : null
    const { data, error } = await supabase
      .from('instance_signups')
      .update({ checkin_time })
      .match({ instance_id: instanceId, athlete_id: athleteId })
      .select('id')

    if (error) showToast('Could not update attendance: ' + error.message)
    else {
      if (attended && (!data || data.length === 0)) {
        const { error: insertError } = await supabase
          .from('instance_signups')
          .insert({ instance_id: instanceId, athlete_id: athleteId, checkin_time })

        if (insertError) {
          showToast('Could not attach attendance to athlete: ' + insertError.message)
          return
        }
      }
      showToast(attended ? 'Marked attended' : 'Attendance removed')
      fetchClasses()
    }
  }

  // Coach manually adds to one-time class
  const manualAdd = async (classId, athleteId) => {
    const { error } = await supabase.from('class_signups').insert({ class_id: classId, athlete_id: athleteId })
    if (error) showToast('Already in class')
    else { showToast('Athlete added'); fetchClasses() }
  }

  // Coach manually adds to recurring instance
  const manualAddInstance = async (instanceId, athleteId) => {
    const { error } = await supabase.from('instance_signups').insert({ instance_id: instanceId, athlete_id: athleteId })
    if (error) showToast('Already in class')
    else { showToast('Athlete added'); fetchClasses() }
  }

  // Coach checks in an athlete manually
  const coachCheckinAthlete = async (athleteId, athleteName) => {
    if (!has247) return
    const { error } = await supabase.from('class_signups').insert({
      class_id: has247.id, athlete_id: athleteId,
      checkin_time: checkinTime, is_247_checkin: true
    })
    if (error) { showToast(athleteName + ' already checked in today') }
    else {
      await supabase.from('notifications').insert({
        message: `${athleteName} was checked in by coach at ${checkinTime}`,
        type: '247_checkin', athlete_id: athleteId
      })
      fetch('/api/push-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🏋️ Open Gym Check-In',
          body: `${athleteName} was checked in by coach at ${checkinTime}`,
          badgeCount: 1,
          tag: 'srb-open-gym'
        })
      }).catch(err => console.error('Push notify error:', err))
      showToast(athleteName + ' checked in!')
      fetchClasses()
    }
  }

  const checkin247 = async () => {
    if (!has247) return
    if (!canUsePaidClassAccess) { showToast('Open gym access is for active members only.'); return }
    const { error } = await supabase.from('class_signups').insert({
      class_id: has247.id, athlete_id: user.id,
      checkin_time: checkinTime, is_247_checkin: true
    })
    if (error) { showToast('Already checked in today') }
    else {
      await supabase.from('notifications').insert({
        message: `${profile?.name || 'An athlete'} checked in for 24/7 access at ${checkinTime}`,
        type: '247_checkin', athlete_id: user.id
      })
      fetch('/api/push-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🏋️ Open Gym Check-In',
          body: `${profile?.name || 'An athlete'} checked in at ${checkinTime}`,
          badgeCount: 1,
          tag: 'srb-open-gym'
        })
      }).catch(err => console.error('Push notify error:', err))
      showToast(`Checked in for ${checkinTime} — Sarah has been notified!`)
      setShow247(false); fetchClasses()
    }
  }

  const allClasses = [...oneTimeClasses, ...recurringClasses]
  const todaysClassWindows = allClasses.map(cls => classWindow(cls, iso)).filter(Boolean)
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

  const bookOpenGymSlot = async (slot) => {
    if (!canUsePaidClassAccess) { showToast('Open gym access is for active members only.'); return }
    if (!profile?.waiver_signed) { showToast('Please sign the liability waiver in your Profile tab first.'); return }
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

    await notifyCoach(
      'Open Gym Booked',
      `${profile?.name || 'An athlete'} booked Open Gym for ${timeInputToLabel(slot.start_time)} on ${formatDate(currentDate)}.`
    )

    showToast('Open Gym booked!')
    fetchOpenGym()
  }

  const cancelOpenGymBooking = async (bookingId) => {
    await supabase.from('open_gym_bookings').delete().eq('id', bookingId)
    showToast('Open Gym booking removed')
    fetchOpenGym()
  }

  const removeOpenGymSlot = async (slotId) => {
    if (!isCoach) return
    if (String(slotId).startsWith('default-')) {
      showToast('Default Open Gym times are removed by blocking time.')
      return
    }
    await supabase.from('open_gym_slots').update({ active: false }).eq('id', slotId)
    showToast('Open Gym slot removed')
    fetchOpenGym()
  }

  return (
    <div>
      {/* Date navigation */}
      <div className="date-nav">
        <button className="date-nav-btn" onClick={prevDay}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div className="date-nav-label">{formatDate(currentDate)}</div>
          {!isToday && <div className="date-nav-today" onClick={goToday}>Back to today</div>}
        </div>
        <button className="date-nav-btn" onClick={nextDay}>›</button>
      </div>

      {/* Coach-only 24/7 manual check-in tools */}
      {has247 && isCoach && (
        <div className="class-247">
          <div className="class-247-title">24/7 Access</div>
          {isCoach ? (
            <div>
              <div className="class-247-note">Check in an athlete for 24/7 access.</div>
              {showCoachCheckin
                ? <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' }}>
                    <select value={checkinTime} onChange={e => setCheckinTime(e.target.value)}
                      style={{ background: 'rgba(245,240,232,0.06)', border: '1px solid var(--border)', borderRadius: '2px', padding: '8px 12px', color: 'var(--bone)', fontFamily: 'Lato, sans-serif', fontSize: '15px', outline: 'none' }}>
                      {CHECKIN_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {allMembers.map(m => (
                        <button key={m.id} className="btn-ghost" style={{ fontSize: '11px' }}
                          onClick={() => { coachCheckinAthlete(m.id, m.name); setShowCoachCheckin(false) }}>
                          {m.name}
                        </button>
                      ))}
                    </div>
                    <button className="btn-ghost" onClick={() => setShowCoachCheckin(false)}>Cancel</button>
                  </div>
                : <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                  <button className="btn-sm" onClick={() => setShowCoachCheckin(true)}>Check In Athlete</button>
                  {!subscribed
                    ? <button className="btn-ghost" style={{ fontSize: '11px' }} onClick={subscribe} disabled={pushLoading}>
                        {pushLoading ? 'Enabling...' : '🔔 Enable Check-In Alerts'}
                      </button>
                    : <button className="btn-ghost" style={{ fontSize: '11px', color: 'var(--moss-light)' }} onClick={unsubscribe}>
                        🔔 Alerts On
                      </button>
                  }
                </div>
              }
            </div>
          ) : (
            <div>
              <div className="class-247-note">Coming in outside of class time? Let Sarah know you're heading in.</div>
              {show247
                ? <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={checkinTime} onChange={e => setCheckinTime(e.target.value)}
                      style={{ background: 'rgba(245,240,232,0.06)', border: '1px solid var(--border)', borderRadius: '2px', padding: '8px 12px', color: 'var(--bone)', fontFamily: 'Lato, sans-serif', fontSize: '15px', outline: 'none' }}>
                      {CHECKIN_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button className="btn-sm" onClick={checkin247}>Confirm Check-In</button>
                    <button className="btn-ghost" onClick={() => setShow247(false)}>Cancel</button>
                  </div>
                : <button className="btn-sm" onClick={() => setShow247(true)}>Check In for 24/7 Access</button>
              }
            </div>
          )}
        </div>
      )}

      <OpenGymModule
        isCoach={isCoach}
        user={user}
        canUsePaidClassAccess={canUsePaidClassAccess}
        openGymAvailable={openGymAvailable}
        slots={openGymSlotsToday}
        showSlotForm={showOpenGymSlotForm}
        setShowSlotForm={setShowOpenGymSlotForm}
        showBlockForm={showOpenGymBlockForm}
        setShowBlockForm={setShowOpenGymBlockForm}
        onBook={bookOpenGymSlot}
        onCancelBooking={cancelOpenGymBooking}
        onRemoveSlot={removeOpenGymSlot}
        onSaved={fetchOpenGym}
      />

      {/* Coach controls */}
      <div className="section-header">
        <h2 className="section-title">Classes — {dayOfWeek}</h2>
        {isCoach && <button className="btn-sm" onClick={() => setShowForm(!showForm)}>+ Add Class</button>}
      </div>

      {isTrial && (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-title">Free Trial</div>
          <p style={{ fontSize: '14px', color: 'var(--charcoal-light)', lineHeight: 1.6, margin: 0 }}>
            {Math.min(trialUses, FREE_TRIAL_CLASS_LIMIT)} of {FREE_TRIAL_CLASS_LIMIT} trial classes used. Free trials include classes only; programming and open gym unlock with membership.
          </p>
          {trialUses >= FREE_TRIAL_CLASS_LIMIT && (
            <p style={{ fontSize: '14px', color: 'var(--gold-light)', lineHeight: 1.6, margin: '10px 0 0' }}>
              Your trial classes are complete. Upgrade in Profile to keep signing up.
            </p>
          )}
        </div>
      )}

      {isCoach && showForm && <ClassForm onSaved={() => { setShowForm(false); fetchClasses() }} />}

      {loading && <div className="loading">Loading...</div>}

      {!loading && allClasses.length === 0 && !showForm && (
        <div className="empty">
          <h3>No classes today</h3>
          <p>{isCoach ? 'Add a class above, or set up recurring classes for this day.' : 'No classes scheduled for today.'}</p>
        </div>
      )}

      {/* One-time classes */}
      {oneTimeClasses.map(cls => (
        <OneTimeClassCard
          key={cls.id}
          cls={cls}
          user={user}
          isCoach={isCoach}
          allMembers={allMembers}
          onSignup={() => signup(cls.id)}
          onUnsignup={() => unsignup(cls.id)}
          onManualAdd={(athleteId) => manualAdd(cls.id, athleteId)}
          onRemoveAthlete={(athleteId) => removeFromClass(cls.id, athleteId)}
          onToggleAttendance={(athleteId, attended) => markClassAttendance(cls.id, athleteId, attended)}
          onAthleteClick={isCoach ? (id) => setAthletePanel(id) : null}
        />
      ))}

      {/* Recurring class instances */}
      {recurringClasses.map(cls => (
        <RecurringClassCard
          key={cls.id}
          cls={cls}
          user={user}
          isCoach={isCoach}
          allMembers={allMembers}
          onSignup={() => signupInstance(cls.instance?.id)}
          onUnsignup={() => unsignupInstance(cls.instance?.id)}
          onManualAdd={(athleteId) => manualAddInstance(cls.instance?.id, athleteId)}
          onRemoveAthlete={(athleteId) => removeFromInstance(cls.instance?.id, athleteId)}
          onToggleAttendance={(athleteId, attended) => markInstanceAttendance(cls.instance?.id, athleteId, attended)}
          onAthleteClick={isCoach ? (id) => setAthletePanel(id) : null}
        />
      ))}

      {toast && <div className="toast">{toast}</div>}

      {athletePanel && (
        <AthletePanel
          athleteId={athletePanel}
          onClose={() => setAthletePanel(null)}
        />
      )}
    </div>
  )
}

function OneTimeClassCard({ cls, user, isCoach, allMembers, onSignup, onUnsignup, onManualAdd, onRemoveAthlete, onToggleAttendance, onAthleteClick }) {
  const isSignedUp = cls.class_signups?.some(s => s.athlete_id === user.id)
  const spots = cls.capacity - (cls.class_signups?.length || 0)
  const full = spots <= 0
  const dt = new Date(cls.start_time)

  return (
    <div className="class-card">
      <div className="class-card-header">
        <div className="class-title">{cls.title}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isSignedUp
            ? <button className="btn-ghost" onClick={onUnsignup}>Cancel</button>
            : <button className="btn-sm" onClick={onSignup} disabled={full}>{full ? 'Full' : 'Sign Up'}</button>
          }
        </div>
      </div>
      <div className="class-meta">
        <span>{dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
        <span>{cls.duration_minutes} min</span>
      </div>
      {cls.description && <p style={{ fontSize: '14px', color: 'var(--charcoal-light)', marginBottom: '10px' }}>{cls.description}</p>}
      <ClassFooter signups={cls.class_signups || []} spots={spots} isSignedUp={isSignedUp} isCoach={isCoach} allMembers={allMembers} onManualAdd={onManualAdd} onRemoveAthlete={onRemoveAthlete} onToggleAttendance={onToggleAttendance} onAthleteClick={onAthleteClick} />
    </div>
  )
}

function RecurringClassCard({ cls, user, isCoach, allMembers, onSignup, onUnsignup, onManualAdd, onRemoveAthlete, onToggleAttendance, onAthleteClick }) {
  const instance = cls.instance
  const signups = instance?.instance_signups || []
  const isSignedUp = signups.some(s => s.athlete_id === user.id)
  const spots = cls.capacity - signups.length
  const full = spots <= 0

  return (
    <div className="class-card">
      <div className="class-card-header">
        <div>
          <div className="class-title">{cls.title}</div>
          <div style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--gold-dark)', marginTop: '4px' }}>
            Recurring · {(cls.recurrence_days || '').split(',').join(' · ')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isSignedUp
            ? <button className="btn-ghost" onClick={onUnsignup}>Cancel</button>
            : <button className="btn-sm" onClick={onSignup} disabled={full || !instance}>{full ? 'Full' : 'Sign Up'}</button>
          }
        </div>
      </div>
      <div className="class-meta">
        <span>{cls.recurrence_time || '—'}</span>
        <span>{cls.duration_minutes} min</span>
        <span style={{ color: 'var(--gold)', fontSize: '11px' }}>Recurring</span>
      </div>
      {cls.description && <p style={{ fontSize: '14px', color: 'var(--charcoal-light)', marginBottom: '10px' }}>{cls.description}</p>}
      <ClassFooter signups={signups} spots={spots} isSignedUp={isSignedUp} isCoach={isCoach} allMembers={allMembers} onManualAdd={onManualAdd} onRemoveAthlete={onRemoveAthlete} onToggleAttendance={onToggleAttendance} onAthleteClick={onAthleteClick} />
    </div>
  )
}

function ClassFooter({ signups, spots, isSignedUp, isCoach, allMembers, onManualAdd, onRemoveAthlete, onToggleAttendance, onAthleteClick }) {
  return (
    <>
      <div className="class-spots">
        {isSignedUp && <span style={{ color: 'var(--moss-light)', marginRight: '12px' }}>✓ You're in</span>}
        {spots > 0 ? `${spots} spot${spots !== 1 ? 's' : ''} remaining` : 'Class full'}
      </div>
      {signups.length > 0 && isCoach && (
        <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {signups.map((s, i) => {
            const attended = Boolean(s.checkin_time)
            return (
              <span key={i}
                onClick={() => { if (onAthleteClick && s.athlete_id) onAthleteClick(s.athlete_id) }}
                style={{ fontSize: '12px', color: onAthleteClick ? 'var(--gold-light)' : 'var(--charcoal-light)', background: attended ? 'rgba(107,115,85,0.18)' : 'rgba(245,240,232,0.04)', border: attended ? '1px solid var(--moss)' : '1px solid var(--border)', borderRadius: '2px', padding: '3px 8px', cursor: onAthleteClick ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span>{s.profiles?.name || 'Athlete'}</span>
                {attended && <span style={{ color: 'var(--moss-light)', fontSize: '11px' }}>✓ {s.checkin_time}</span>}
                <button
                  type="button"
                  aria-label={attended ? `Remove attendance for ${s.profiles?.name || 'athlete'}` : `Mark ${s.profiles?.name || 'athlete'} attended`}
                  onClick={(e) => { e.stopPropagation(); onToggleAttendance?.(s.athlete_id, !attended) }}
                  style={{ background: 'transparent', border: 'none', color: attended ? 'var(--moss-light)' : 'var(--gold-light)', cursor: 'pointer', fontSize: '12px', lineHeight: 1, padding: '0 2px' }}
                >
                  {attended ? 'Undo' : 'Check in'}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${s.profiles?.name || 'athlete'} from class`}
                  onClick={(e) => { e.stopPropagation(); onRemoveAthlete?.(s.athlete_id) }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--rose-light)', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '0 0 1px' }}
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
      {signups.length > 0 && !isCoach && isSignedUp && (
        <div style={{ fontSize: '12px', color: 'var(--charcoal-light)', marginTop: '6px' }}>
          {signups.length} athlete{signups.length !== 1 ? 's' : ''} signed up
        </div>
      )}
      {isCoach && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <ManualAddSearch allMembers={allMembers} signups={signups} onManualAdd={onManualAdd} />
        </div>
      )}
    </>
  )
}

function OpenGymModule({ isCoach, user, canUsePaidClassAccess, openGymAvailable, slots, showSlotForm, setShowSlotForm, showBlockForm, setShowBlockForm, onBook, onCancelBooking, onRemoveSlot, onSaved }) {
  const [showPicker, setShowPicker] = useState(false)
  const availableSlots = slots.filter(slot => {
    const spots = Math.max((slot.capacity || 1) - (slot.bookings?.length || 0), 0)
    const myBooking = slot.bookings?.find(booking => booking.athlete_id === user.id)
    return myBooking || (!slot.unavailable && spots > 0)
  })
  const myBookings = slots.flatMap(slot =>
    (slot.bookings || [])
      .filter(booking => booking.athlete_id === user.id)
      .map(booking => ({ ...booking, slot }))
  )

  if (!openGymAvailable) {
    return (
      <div className="class-247">
        <div className="class-247-title">Open Gym</div>
          <div className="class-247-note">
          Open Gym scheduling needs the new database tables installed. Until then, the older check-in flow above still works.
        </div>
      </div>
    )
  }

  return (
    <div className="class-247">
      <div className="class-card-header">
        <div>
          <div className="class-247-title">Open Gym</div>
          <div className="class-247-note">Open Gym is available 24/7 unless it overlaps class time or a coach block.</div>
        </div>
        {isCoach && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn-sm" onClick={() => setShowBlockForm(!showBlockForm)}>Block Time</button>
            <button className="btn-ghost" onClick={() => setShowSlotForm(!showSlotForm)}>Extra Slot</button>
          </div>
        )}
      </div>

      {isCoach && showSlotForm && (
        <OpenGymSlotForm
          onSaved={() => { setShowSlotForm(false); onSaved() }}
          onCancel={() => setShowSlotForm(false)}
        />
      )}

      {isCoach && showBlockForm && (
        <OpenGymBlockForm
          onSaved={() => { setShowBlockForm(false); onSaved() }}
          onCancel={() => setShowBlockForm(false)}
        />
      )}

      {slots.length === 0 && (
        <div className="empty" style={{ margin: '0.75rem 0 0', padding: '1rem' }}>
          <h3>No Open Gym windows today</h3>
          <p>{isCoach ? 'All default Open Gym windows are blocked by classes or coach blocks.' : 'No Open Gym times are available today.'}</p>
        </div>
      )}

      {!isCoach && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn-sm" onClick={() => setShowPicker(true)} disabled={!canUsePaidClassAccess || availableSlots.length === 0}>
            Check In for Open Gym
          </button>
          {myBookings.map(booking => (
            <button key={booking.id} className="btn-ghost" onClick={() => onCancelBooking(booking.id)}>
              Cancel {timeInputToLabel(booking.slot.start_time)}
            </button>
          ))}
        </div>
      )}

      {isCoach && (
        <div className="open-gym-coach-summary">
          {slots.filter(slot => !slot.unavailable && (slot.bookings || []).length > 0).length === 0 && (
            <div className="open-gym-meta">No Open Gym bookings yet today.</div>
          )}
          {slots.filter(slot => !slot.unavailable && (slot.bookings || []).length > 0).map(slot => (
            <div key={slot.id} className="open-gym-slot">
              <div>
                <div className="open-gym-time">{timeInputToLabel(slot.start_time)} · {slot.duration_minutes} min</div>
                <div className="open-gym-bookings">
                  {slot.bookings.map(booking => (
                    <span key={booking.id}>
                      {booking.profiles?.name || 'Athlete'}
                      <button type="button" onClick={() => onCancelBooking(booking.id)}>×</button>
                    </span>
                  ))}
                </div>
              </div>
              {!slot.defaultSlot && <button className="btn-ghost" style={{ fontSize: '11px', color: 'var(--rose-light)' }} onClick={() => onRemoveSlot(slot.id)}>Remove</button>}
            </div>
          ))}
        </div>
      )}

      {showPicker && (
        <OpenGymPickerModal
          slots={availableSlots}
          user={user}
          canUsePaidClassAccess={canUsePaidClassAccess}
          onBook={async (slot) => {
            await onBook(slot)
            setShowPicker(false)
          }}
          onCancelBooking={onCancelBooking}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}

function OpenGymPickerModal({ slots, user, canUsePaidClassAccess, onBook, onCancelBooking, onClose }) {
  return (
    <div className="modal-wrap" onClick={e => { if (e.target.className === 'modal-wrap') onClose() }}>
      <div className="modal" style={{ maxWidth: '560px' }}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Open Gym</div>
            <div className="modal-sub">Choose an available one-hour window.</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {slots.length === 0 && <p className="no-data">No Open Gym times are available today.</p>}
          <div className="open-gym-slot-list">
            {slots.map(slot => {
              const myBooking = slot.bookings?.find(booking => booking.athlete_id === user.id)
              const spots = Math.max((slot.capacity || 1) - (slot.bookings?.length || 0), 0)
              const endMinutes = inputTimeToMinutes(slot.start_time) + (slot.duration_minutes || 60)
              return (
                <div key={slot.id} className="open-gym-slot">
                  <div>
                    <div className="open-gym-time">{timeInputToLabel(slot.start_time)} - {timeInputToLabel(minutesToInputTime(endMinutes % 1440))}</div>
                    <div className="open-gym-meta">{spots} spot{spots !== 1 ? 's' : ''} open</div>
                    {slot.notes && <div className="open-gym-notes">{slot.notes}</div>}
                  </div>
                  {myBooking
                    ? <button className="btn-ghost" onClick={() => onCancelBooking(myBooking.id)}>Cancel</button>
                    : <button className="btn-sm" onClick={() => onBook(slot)} disabled={!canUsePaidClassAccess}>Check In</button>
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

function OpenGymSlotForm({ onSaved, onCancel }) {
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState(60)
  const [capacity, setCapacity] = useState(1)
  const [notes, setNotes] = useState('')
  const [recurDays, setRecurDays] = useState([])
  const [loading, setLoading] = useState(false)

  const toggleDay = (day) => setRecurDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  const sortedDays = [...recurDays].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))

  const save = async () => {
    if (sortedDays.length === 0) return
    setLoading(true)
    await supabase.from('open_gym_slots').insert({
      start_time: time,
      duration_minutes: parseInt(duration, 10),
      capacity: parseInt(capacity, 10),
      recurrence_days: sortedDays.join(','),
      notes: notes.trim(),
      active: true
    })
    setLoading(false)
    onSaved()
  }

  return (
    <div className="open-gym-form">
      <div className="two-col">
        <div className="field"><label>Start Time</label><input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
        <div className="field"><label>Duration</label><input type="number" value={duration} onChange={e => setDuration(e.target.value)} /></div>
      </div>
      <div className="field"><label>Capacity</label><input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} /></div>
      <div className="field"><label>Repeats On</label><DayPicker selected={recurDays} onToggle={toggleDay} /></div>
      <div className="field"><label>Notes</label><input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional: Open platform only, no dropping, etc." /></div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn-sm" onClick={save} disabled={loading || sortedDays.length === 0}>{loading ? 'Saving...' : 'Save Open Gym Slot'}</button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function OpenGymBlockForm({ onSaved, onCancel }) {
  const today = new Date().toISOString().split('T')[0]
  const [isRecurring, setIsRecurring] = useState(false)
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState(60)
  const [reason, setReason] = useState('Private coaching')
  const [recurDays, setRecurDays] = useState([])
  const [loading, setLoading] = useState(false)

  const toggleDay = (day) => setRecurDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  const sortedDays = [...recurDays].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))

  const save = async () => {
    if (isRecurring && sortedDays.length === 0) return
    setLoading(true)
    await supabase.from('open_gym_blocks').insert({
      block_date: isRecurring ? null : date,
      start_time: time,
      duration_minutes: parseInt(duration, 10),
      recurrence_days: isRecurring ? sortedDays.join(',') : null,
      reason: reason.trim() || 'Blocked',
      active: true
    })
    setLoading(false)
    onSaved()
  }

  return (
    <div className="open-gym-form">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button className={!isRecurring ? 'btn-sm' : 'btn-ghost'} onClick={() => setIsRecurring(false)}>One-Time Block</button>
        <button className={isRecurring ? 'btn-sm' : 'btn-ghost'} onClick={() => setIsRecurring(true)}>Recurring Block</button>
      </div>
      {!isRecurring && <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>}
      {isRecurring && <div className="field"><label>Repeats On</label><DayPicker selected={recurDays} onToggle={toggleDay} /></div>}
      <div className="two-col">
        <div className="field"><label>Start Time</label><input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
        <div className="field"><label>Duration</label><input type="number" value={duration} onChange={e => setDuration(e.target.value)} /></div>
      </div>
      <div className="field"><label>Reason</label><input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Private coaching, client session, cleaning..." /></div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn-sm" onClick={save} disabled={loading || (isRecurring && sortedDays.length === 0)}>{loading ? 'Saving...' : 'Save Block'}</button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function DayPicker({ selected, onToggle }) {
  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
      {DAYS.map((day, i) => (
        <button
          key={day}
          onClick={() => onToggle(day)}
          style={{
            width: '40px', height: '40px', borderRadius: '50%', border: '1px solid',
            borderColor: selected.includes(day) ? 'var(--rose)' : 'var(--border)',
            background: selected.includes(day) ? 'rgba(162,92,107,0.3)' : 'transparent',
            color: selected.includes(day) ? 'var(--rose-light)' : 'var(--charcoal-light)',
            cursor: 'pointer', fontSize: '12px', fontFamily: 'Lato, sans-serif',
            transition: 'all 0.15s'
          }}
        >
          {DAY_LABELS[i]}
        </button>
      ))}
    </div>
  )
}

function ClassForm({ onSaved }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('07:00')
  const [duration, setDuration] = useState(60)
  const [capacity, setCapacity] = useState(12)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurDays, setRecurDays] = useState([])
  const [is247, setIs247] = useState(false)
  const [loading, setLoading] = useState(false)

  const toggleDay = (day) => {
    setRecurDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  // Sort days in week order
  const sortedDays = [...recurDays].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))

  const save = async () => {
    setLoading(true)

    if (is247) {
      await supabase.from('classes').insert({ title, description: desc, is_247: true, duration_minutes: parseInt(duration), capacity: parseInt(capacity) })
    } else if (isRecurring) {
      if (recurDays.length === 0) { setLoading(false); return }
      // Format time for display e.g. "7:00 AM"
      const [h, m] = time.split(':')
      const hr = parseInt(h)
      const displayTime = `${hr > 12 ? hr - 12 : hr === 0 ? 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
      await supabase.from('classes').insert({
        title, description: desc,
        is_recurring: true,
        recurrence_days: sortedDays.join(','),
        recurrence_time: displayTime,
        duration_minutes: parseInt(duration),
        capacity: parseInt(capacity),
        is_247: false
      })
    } else {
      const startTime = new Date(`${date}T${time}`).toISOString()
      await supabase.from('classes').insert({ title, description: desc, start_time: startTime, duration_minutes: parseInt(duration), capacity: parseInt(capacity), is_recurring: false, is_247: false })
    }

    setLoading(false)
    onSaved()
  }

  return (
    <div className="panel" style={{ marginBottom: '1.5rem' }}>
      <div className="panel-title">Add Class</div>

      <div className="field"><label>Class Name</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Babes Who Fight Bears" /></div>
      <div className="field"><label>Description</label><input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional notes for members" /></div>

      {/* Type selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button className={!isRecurring && !is247 ? 'btn-sm' : 'btn-ghost'} onClick={() => { setIsRecurring(false); setIs247(false) }}>One-Time</button>
        <button className={isRecurring ? 'btn-sm' : 'btn-ghost'} onClick={() => { setIsRecurring(true); setIs247(false) }}>Recurring</button>
        <button className={is247 ? 'btn-sm' : 'btn-ghost'} onClick={() => { setIs247(true); setIsRecurring(false) }}>24/7 Access</button>
      </div>

      {/* One-time fields */}
      {!isRecurring && !is247 && (
        <div className="two-col">
          <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="field"><label>Time</label><input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
        </div>
      )}

      {/* Recurring fields */}
      {isRecurring && (
        <>
          <div className="field">
            <label>Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
          <div className="field">
            <label>Repeats On</label>
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
              {DAYS.map((day, i) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  style={{
                    width: '40px', height: '40px', borderRadius: '50%', border: '1px solid',
                    borderColor: recurDays.includes(day) ? 'var(--rose)' : 'var(--border)',
                    background: recurDays.includes(day) ? 'rgba(162,92,107,0.3)' : 'transparent',
                    color: recurDays.includes(day) ? 'var(--rose-light)' : 'var(--charcoal-light)',
                    cursor: 'pointer', fontSize: '12px', fontFamily: 'Lato, sans-serif',
                    transition: 'all 0.15s'
                  }}
                >
                  {DAY_LABELS[i]}
                </button>
              ))}
            </div>
            {recurDays.length > 0 && (
              <p style={{ fontSize: '12px', color: 'var(--moss-light)', marginTop: '8px' }}>
                Repeats every {sortedDays.join(', ')}
              </p>
            )}
          </div>
        </>
      )}

      {/* Capacity and duration */}
      {!is247 && (
        <div className="two-col">
          <div className="field"><label>Duration (min)</label><input type="number" value={duration} onChange={e => setDuration(e.target.value)} /></div>
          <div className="field"><label>Capacity</label><input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} /></div>
        </div>
      )}

      <button className="btn-primary" onClick={save} disabled={loading || (isRecurring && recurDays.length === 0)}>
        {loading ? 'Saving...' : 'Save Class'}
      </button>
    </div>
  )
}

function ManualAddSearch({ allMembers, signups, onManualAdd }) {
  const [search, setSearch] = React.useState('')
  const [open, setOpen] = React.useState(false)

  const available = allMembers.filter(m =>
    !signups.some(s => s.athlete_id === m.id) &&
    (!search.trim() || m.name?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <div style={{ fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--charcoal-light)', marginBottom: '8px' }}>Manually Add Athlete</div>
      {!open
        ? <button className="btn-ghost" style={{ fontSize: '11px' }} onClick={() => setOpen(true)}>+ Add Athlete</button>
        : <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search athletes..."
                autoFocus
                style={{ flex: 1, background: 'rgba(245,240,232,0.06)', border: '1px solid var(--border)', borderRadius: '2px', padding: '6px 10px', color: 'var(--bone)', fontFamily: 'Lato, sans-serif', fontSize: '13px', outline: 'none' }}
              />
              <button className="btn-ghost" style={{ fontSize: '11px' }} onClick={() => { setOpen(false); setSearch('') }}>Cancel</button>
            </div>
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '2px' }}>
              {available.length === 0 && (
                <div style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--charcoal-light)' }}>
                  {search ? 'No athletes found' : 'All athletes already signed up'}
                </div>
              )}
              {available.map(m => (
                <div key={m.id}
                  onClick={() => { onManualAdd(m.id); setOpen(false); setSearch('') }}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '13px', color: 'var(--bone)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: 'var(--gold-dark)' }}>+</span> {m.name}
                </div>
              ))}
            </div>
          </div>
      }
    </div>
  )
}
