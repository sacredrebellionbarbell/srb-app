import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export default function Schedule({ user, profile }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState(null)
  const isCoach = profile?.role === 'coach'

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const fetchClasses = useCallback(async () => {
    setLoading(true)
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('classes')
      .select('*, class_signups(athlete_id, profiles(name, avatar_url))')
      .or(`start_time.gte.${now},is_247.eq.true`)
      .order('start_time', { ascending: true })
    setClasses(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchClasses() }, [fetchClasses])

  const signup = async (classId) => {
    const { error } = await supabase.from('class_signups').insert({ class_id: classId, athlete_id: user.id })
    if (error) showToast('Already signed up')
    else { showToast('Signed up!'); fetchClasses() }
  }

  const unsignup = async (classId) => {
    await supabase.from('class_signups').delete().match({ class_id: classId, athlete_id: user.id })
    showToast('Removed from class'); fetchClasses()
  }

  const checkin247 = async () => {
    const cls = classes.find(c => c.is_247)
    if (!cls) return
    const { error } = await supabase.from('class_signups').insert({ class_id: cls.id, athlete_id: user.id })
    if (error) showToast('Check-in recorded — already logged today')
    else { showToast('Check-in recorded! Coach has been notified.'); fetchClasses() }
  }

  const upcoming = classes.filter(c => !c.is_247)
  const has247 = classes.find(c => c.is_247)

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Schedule</h2>
        {isCoach && <button className="btn-sm" onClick={() => setShowForm(!showForm)}>+ Add Class</button>}
      </div>

      {has247 && (
        <div className="class-247">
          <div className="class-247-title">24/7 Access</div>
          <div className="class-247-note">Coming in outside of class time? Let Sarah know you're heading in.</div>
          <button className="btn-sm" onClick={checkin247}>Check In for 24/7 Access</button>
        </div>
      )}

      {isCoach && showForm && <ClassForm onSaved={() => { setShowForm(false); fetchClasses() }} />}

      {loading && <div className="loading">Loading...</div>}

      {!loading && upcoming.length === 0 && !showForm && (
        <div className="empty">
          <h3>No classes scheduled</h3>
          <p>{isCoach ? 'Add a class above to get started.' : 'Check back soon.'}</p>
        </div>
      )}

      {upcoming.map(cls => {
        const isSignedUp = cls.class_signups?.some(s => s.athlete_id === user.id)
        const spots = cls.capacity - (cls.class_signups?.length || 0)
        const full = spots <= 0
        const dt = new Date(cls.start_time)

        return (
          <div key={cls.id} className="class-card">
            <div className="class-card-header">
              <div className="class-title">{cls.title}</div>
              {isSignedUp
                ? <button className="btn-ghost" onClick={() => unsignup(cls.id)}>Cancel</button>
                : <button className="btn-sm" onClick={() => signup(cls.id)} disabled={full}>{full ? 'Full' : 'Sign Up'}</button>
              }
            </div>
            <div className="class-meta">
              <span>{dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <span>{dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
              <span>{cls.duration_minutes} min</span>
              {cls.is_recurring && <span style={{ color: 'var(--gold)', fontSize: '10px', letterSpacing: '1px' }}>Recurring</span>}
            </div>
            {cls.description && <p style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginBottom: '10px' }}>{cls.description}</p>}
            <div className="class-spots">
              {isSignedUp && <span style={{ color: 'var(--moss-light)', marginRight: '12px' }}>✓ You're in</span>}
              {spots > 0 ? `${spots} spot${spots !== 1 ? 's' : ''} remaining` : 'Class full'}
              {cls.class_signups?.length > 0 && (
                <span style={{ marginLeft: '12px', color: 'var(--charcoal-light)' }}>
                  {cls.class_signups.map(s => s.profiles?.name).filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          </div>
        )
      })}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function ClassForm({ onSaved }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('06:00')
  const [duration, setDuration] = useState(60)
  const [capacity, setCapacity] = useState(12)
  const [recurring, setRecurring] = useState(false)
  const [is247, setIs247] = useState(false)
  const [loading, setLoading] = useState(false)

  const save = async () => {
    setLoading(true)
    const startTime = is247 ? null : new Date(`${date}T${time}`).toISOString()
    await supabase.from('classes').insert({
      title, description: desc,
      start_time: startTime,
      duration_minutes: parseInt(duration),
      capacity: parseInt(capacity),
      is_recurring: recurring,
      is_247: is247
    })
    setLoading(false)
    onSaved()
  }

  return (
    <div className="panel" style={{ marginBottom: '1.5rem' }}>
      <div className="panel-title">Add Class</div>
      <div className="field"><label>Class Name</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 6AM Strength" /></div>
      <div className="field"><label>Description</label><input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional notes for members" /></div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', fontSize: '13px', color: 'var(--bone)', cursor: 'pointer' }}>
        <input type="checkbox" checked={is247} onChange={e => setIs247(e.target.checked)} />
        This is a 24/7 access slot (no scheduled time)
      </label>

      {!is247 && (
        <>
          <div className="two-col">
            <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div className="field"><label>Time</label><input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
          </div>
          <div className="two-col">
            <div className="field"><label>Duration (min)</label><input type="number" value={duration} onChange={e => setDuration(e.target.value)} /></div>
            <div className="field"><label>Capacity</label><input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} /></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', fontSize: '13px', color: 'var(--bone)', cursor: 'pointer' }}>
            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
            Recurring weekly class
          </label>
        </>
      )}

      <button className="btn-primary" onClick={save} disabled={loading}>{loading ? 'Saving...' : 'Save Class'}</button>
    </div>
  )
}
