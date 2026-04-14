import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import AthletePanel from './AthletePanel'

function toISO(d) { return d.toISOString().split('T')[0] }
function formatDate(d) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) }

// Day of week helpers
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function getDayOfWeek(dateStr) {
  // Use UTC to avoid timezone shifting the date
  const d = new Date(dateStr + 'T12:00:00')
  return DAYS[d.getDay()]
}

const CHECKIN_TIMES = [
  '5:00 AM','5:30 AM','6:00 AM','6:30 AM','7:00 AM','7:30 AM','8:00 AM','8:30 AM',
  '9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM',
  '12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM',
  '4:00 PM','4:30 PM','5:00 PM','5:30 PM','6:00 PM','6:30 PM','7:00 PM',
  '7:30 PM','8:00 PM','8:30 PM','9:00 PM'
]

export default function Schedule({ user, profile }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [oneTimeClasses, setOneTimeClasses] = useState([])
  const [recurringClasses, setRecurringClasses] = useState([])
  const [has247, setHas247] = useState(null)
  const [allMembers, setAllMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [show247, setShow247] = useState(false)
  const [checkinTime, setCheckinTime] = useState('6:00 AM')
  const [toast, setToast] = useState(null)
  const [athletePanel, setAthletePanel] = useState(null)
  const isCoach = profile?.role === 'coach'
  const canSignUp = ['Class Access', 'Both'].includes(profile?.membership_type) || isCoach

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
        .select('*, instance_signups(athlete_id, profiles(name, avatar_url))')
        .eq('class_id', cls.id)
        .eq('instance_date', iso)
        .single()

      // Create instance if it doesn't exist yet
      if (!instance) {
        const { data: newInstance } = await supabase
          .from('class_instances')
          .insert({ class_id: cls.id, instance_date: iso })
          .select('*, instance_signups(athlete_id, profiles(name, avatar_url))')
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

  useEffect(() => { fetchClasses() }, [fetchClasses])

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
    if (!canSignUp) { showToast('Your membership does not include class access.'); return }
    const { error } = await supabase.from('class_signups').insert({ class_id: classId, athlete_id: user.id })
    if (error) showToast('Already signed up')
    else { showToast('Signed up!'); fetchClasses() }
  }

  const unsignup = async (classId) => {
    await supabase.from('class_signups').delete().match({ class_id: classId, athlete_id: user.id })
    showToast('Removed'); fetchClasses()
  }

  // Sign up for a recurring class instance
  const signupInstance = async (instanceId) => {
    if (!canSignUp) { showToast('Your membership does not include class access.'); return }
    const { error } = await supabase.from('instance_signups').insert({ instance_id: instanceId, athlete_id: user.id })
    if (error) showToast('Already signed up')
    else { showToast('Signed up!'); fetchClasses() }
  }

  const unsignupInstance = async (instanceId) => {
    await supabase.from('instance_signups').delete().match({ instance_id: instanceId, athlete_id: user.id })
    showToast('Removed'); fetchClasses()
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

  const checkin247 = async () => {
    if (!has247) return
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
      showToast(`Checked in for ${checkinTime} — Sarah has been notified!`)
      setShow247(false); fetchClasses()
    }
  }

  const allClasses = [...oneTimeClasses, ...recurringClasses]

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

      {/* 24/7 Access */}
      {has247 && (
        <div className="class-247">
          <div className="class-247-title">24/7 Access</div>
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

      {/* Coach controls */}
      <div className="section-header">
        <h2 className="section-title">Classes — {dayOfWeek}</h2>
        {isCoach && <button className="btn-sm" onClick={() => setShowForm(!showForm)}>+ Add Class</button>}
      </div>

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
          onAthleteClick={isCoach ? (id) => setAthletePanel(id) : null}
        />
      ))}

      {/* Recurring class instances */
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

function OneTimeClassCard({ cls, user, isCoach, allMembers, onSignup, onUnsignup, onManualAdd, onAthleteClick }) {
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
      <ClassFooter signups={cls.class_signups || []} spots={spots} isSignedUp={isSignedUp} isCoach={isCoach} allMembers={allMembers} onManualAdd={onManualAdd} onAthleteClick={onAthleteClick} />
    </div>
  )
}

function RecurringClassCard({ cls, user, isCoach, allMembers, onSignup, onUnsignup, onManualAdd, onAthleteClick }) {
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
      <ClassFooter signups={signups} spots={spots} isSignedUp={isSignedUp} isCoach={isCoach} allMembers={allMembers} onManualAdd={onManualAdd} onAthleteClick={onAthleteClick} />
    </div>
  )
}

function ClassFooter({ signups, spots, isSignedUp, isCoach, allMembers, onManualAdd, onAthleteClick }) {
  return (
    <>
      <div className="class-spots">
        {isSignedUp && <span style={{ color: 'var(--moss-light)', marginRight: '12px' }}>✓ You're in</span>}
        {spots > 0 ? `${spots} spot${spots !== 1 ? 's' : ''} remaining` : 'Class full'}
      </div>
      {signups.length > 0 && (
        <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {signups.map((s, i) => (
            <span key={i}
              onClick={() => { if (onAthleteClick && s.athlete_id) onAthleteClick(s.athlete_id) }}
              style={{ fontSize: '12px', color: onAthleteClick ? 'var(--gold-light)' : 'var(--charcoal-light)', background: 'rgba(245,240,232,0.04)', border: '1px solid var(--border)', borderRadius: '2px', padding: '2px 8px', cursor: onAthleteClick ? 'pointer' : 'default' }}>
              {s.profiles?.name || 'Athlete'}
            </span>
          ))}
        </div>
      )}
      {isCoach && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--charcoal-light)', marginBottom: '8px' }}>Manually Add Athlete</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {allMembers
              .filter(m => !signups.some(s => s.athlete_id === m.id))
              .map(m => (
                <button key={m.id} className="btn-ghost" style={{ fontSize: '11px' }} onClick={() => onManualAdd(m.id)}>+ {m.name}</button>
              ))
            }
          </div>
        </div>
      )}
    </>
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
