import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import AthletePanel from './AthletePanel'
import { attendanceDate, classAttendanceRows, milestoneReachedForTotal, normalizeAttendance } from '../utils/achievements'
import { FREE_TRIAL_CLASS_LIMIT, getAccessStatus, isFreeTrial, isPaidMember } from '../utils/access'

function todayKey() {
  return new Date().toISOString().split('T')[0]
}

function startOfTodayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function endOfTodayISO() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

function daysAgo(value) {
  if (!value) return 9999
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 9999
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function personName(row) {
  return row?.profiles?.name || 'Athlete'
}

function AthleteMini({ athlete, onOpen, detail, badge }) {
  return (
    <button
      onClick={() => onOpen?.(athlete.id)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        textAlign: 'left',
        background: 'rgba(245,240,232,0.035)',
        border: '1px solid rgba(200,169,106,0.14)',
        borderRadius: '4px',
        padding: '10px 12px',
        cursor: 'pointer',
        color: 'var(--bone)'
      }}
    >
      {athlete.avatar_url
        ? <img src={athlete.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--gold-dark)', flexShrink: 0 }} />
        : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(200,169,106,0.12)', border: '1px solid var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold-light)', fontFamily: 'Cinzel, serif', fontSize: '13px', flexShrink: 0 }}>{initials(athlete.name)}</div>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--gold-light)', fontFamily: 'Cinzel, serif', fontSize: '14px', letterSpacing: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{athlete.name || 'Unnamed'}</div>
        {detail && <div style={{ color: 'var(--charcoal-light)', fontSize: '13px', marginTop: '2px' }}>{detail}</div>}
      </div>
      {badge && <span className="membership-badge membership-trial">{badge}</span>}
    </button>
  )
}

function Stat({ label, value, tone = 'gold' }) {
  const color = tone === 'rose' ? 'var(--rose-light)' : tone === 'moss' ? 'var(--moss-light)' : 'var(--gold-light)'
  return (
    <div className="att-stat" style={{ textAlign: 'left' }}>
      <div className="att-val" style={{ color }}>{value}</div>
      <div className="att-label">{label}</div>
    </div>
  )
}

function PanelList({ title, empty, children }) {
  const count = React.Children.count(children)
  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <div style={{ display: 'grid', gap: '10px' }}>
        {count ? children : <div className="no-data">{empty}</div>}
      </div>
    </div>
  )
}

export default function CommandCenter({ user }) {
  const [profiles, setProfiles] = useState([])
  const [oneTimeClasses, setOneTimeClasses] = useState([])
  const [todayInstances, setTodayInstances] = useState([])
  const [attendance, setAttendance] = useState([])
  const [openGymBookings, setOpenGymBookings] = useState([])
  const [notifications, setNotifications] = useState([])
  const [setLogs, setSetLogs] = useState([])
  const [selectedAthlete, setSelectedAthlete] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchCommandCenter = useCallback(async () => {
    setLoading(true)
    const today = todayKey()

    const [
      profilesRes,
      oneTimeRes,
      instanceRes,
      classAttendanceRes,
      instanceAttendanceRes,
      openGymRes,
      notificationRes,
      setLogsRes
    ] = await Promise.all([
      supabase.from('profiles').select('*').order('name', { ascending: true }),
      supabase
        .from('classes')
        .select('*, class_signups(athlete_id, checkin_time, profiles(name, avatar_url))')
        .eq('is_recurring', false)
        .gte('start_time', startOfTodayISO())
        .lte('start_time', endOfTodayISO())
        .order('start_time', { ascending: true }),
      supabase
        .from('class_instances')
        .select('*, classes(title, recurrence_time, capacity, is_247), instance_signups(athlete_id, checkin_time, profiles(name, avatar_url))')
        .eq('instance_date', today)
        .order('instance_date', { ascending: true }),
      supabase
        .from('class_signups')
        .select('id, athlete_id, signed_up_at, checkin_time, profiles(name, avatar_url), classes(title, start_time, is_247)')
        .order('signed_up_at', { ascending: false })
        .limit(900),
      supabase
        .from('instance_signups')
        .select('id, athlete_id, signed_up_at, checkin_time, profiles(name, avatar_url), class_instances(instance_date, classes(title, is_247))')
        .limit(900),
      supabase
        .from('open_gym_bookings')
        .select('*, profiles(name, avatar_url)')
        .eq('booking_date', today)
        .order('slot_start_time', { ascending: true }),
      supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('set_logs')
        .select('id, athlete_id, value, created_at, profiles(name, avatar_url), movements(name), workouts(title, date)')
        .order('created_at', { ascending: false })
        .limit(300)
    ])

    setProfiles(profilesRes.data || [])
    setOneTimeClasses(oneTimeRes.data || [])
    setTodayInstances(instanceRes.data || [])
    setAttendance(normalizeAttendance(classAttendanceRes.data || [], instanceAttendanceRes.data || []))
    setOpenGymBookings(openGymRes.data || [])
    setNotifications(notificationRes.data || [])
    setSetLogs(setLogsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchCommandCenter() }, [fetchCommandCenter])

  const profileById = useMemo(() => {
    const map = {}
    profiles.forEach(profile => { map[profile.id] = profile })
    return map
  }, [profiles])

  const classAttendance = useMemo(() => classAttendanceRows(attendance), [attendance])

  const attendanceByAthlete = useMemo(() => {
    const grouped = {}
    classAttendance.forEach(row => {
      if (!row.athlete_id) return
      if (!grouped[row.athlete_id]) grouped[row.athlete_id] = []
      grouped[row.athlete_id].push(row)
    })
    return grouped
  }, [classAttendance])

  const todayClasses = useMemo(() => {
    const oneTime = oneTimeClasses
      .filter(cls => !cls.is_247)
      .map(cls => ({
        id: `class-${cls.id}`,
        title: cls.title,
        time: cls.start_time ? new Date(cls.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Today',
        capacity: cls.capacity,
        signups: cls.class_signups || []
      }))

    const recurring = todayInstances
      .filter(instance => !instance.classes?.is_247)
      .map(instance => ({
        id: `instance-${instance.id}`,
        title: instance.classes?.title || 'Class',
        time: instance.classes?.recurrence_time || 'Today',
        capacity: instance.classes?.capacity,
        signups: instance.instance_signups || []
      }))

    return [...oneTime, ...recurring]
  }, [oneTimeClasses, todayInstances])

  const trialRows = useMemo(() => {
    return profiles
      .filter(isFreeTrial)
      .map(profile => {
        const uses = (attendanceByAthlete[profile.id] || []).length
        return { profile, uses, remaining: Math.max(FREE_TRIAL_CLASS_LIMIT - uses, 0) }
      })
      .sort((a, b) => b.uses - a.uses || (a.profile.name || '').localeCompare(b.profile.name || ''))
  }, [attendanceByAthlete, profiles])

  const leads = useMemo(() => {
    return profiles
      .filter(profile => profile.role !== 'coach' && getAccessStatus(profile) === 'Lead')
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  }, [profiles])

  const inactiveMembers = useMemo(() => {
    return profiles
      .filter(profile => profile.role !== 'coach' && isPaidMember(profile))
      .map(profile => {
        const rows = attendanceByAthlete[profile.id] || []
        const latest = rows.sort((a, b) => new Date(attendanceDate(b) || 0) - new Date(attendanceDate(a) || 0))[0]
        const lastSeen = attendanceDate(latest)
        return { profile, lastSeen, days: daysAgo(lastSeen) }
      })
      .filter(row => row.days >= 7)
      .sort((a, b) => b.days - a.days)
      .slice(0, 8)
  }, [attendanceByAthlete, profiles])

  const recentWins = useMemo(() => {
    const wins = []
    const seen = new Set()

    Object.entries(attendanceByAthlete).forEach(([athleteId, rows]) => {
      const sorted = [...rows].sort((a, b) => new Date(attendanceDate(a) || 0) - new Date(attendanceDate(b) || 0))
      const milestone = milestoneReachedForTotal(sorted.length)
      const latest = sorted[sorted.length - 1]
      if (milestone && latest && daysAgo(attendanceDate(latest)) <= 14) {
        wins.push({
          key: `attendance-${athleteId}-${milestone.count}`,
          athleteId,
          text: `${milestone.icon} ${personName(latest)} reached ${milestone.count} classes.`,
          date: attendanceDate(latest)
        })
      }
    })

    setLogs.forEach(log => {
      if (!log.athlete_id || seen.has(log.athlete_id)) return
      seen.add(log.athlete_id)
      if (daysAgo(log.created_at) <= 7) {
        wins.push({
          key: `log-${log.id}`,
          athleteId: log.athlete_id,
          text: `${personName(log)} logged ${log.movements?.name || 'training'}${log.value ? `: ${log.value}` : ''}.`,
          date: log.created_at
        })
      }
    })

    return wins.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8)
  }, [attendanceByAthlete, setLogs])

  const newTrialNotifications = notifications.filter(n => n.type === 'free_trial_signup')
  const checkInAlerts = notifications.filter(n => n.type === '247_checkin')

  const stats = {
    todaySignups: todayClasses.reduce((sum, cls) => sum + (cls.signups?.length || 0), 0),
    todayCheckedIn: todayClasses.reduce((sum, cls) => sum + (cls.signups || []).filter(s => s.checkin_time).length, 0),
    trials: trialRows.length,
    leads: leads.length,
    inactive: inactiveMembers.length,
    openGym: openGymBookings.length
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Command Center</h2>
          <p style={{ color: 'var(--charcoal-light)', fontSize: '14px', lineHeight: 1.5, marginTop: '6px' }}>
            Today, trials, retention, alerts, and wins in one coach-only view.
          </p>
        </div>
        <button className="btn-ghost" onClick={fetchCommandCenter}>Refresh</button>
      </div>

      {loading && <div className="loading">Loading...</div>}

      <div className="attendance-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))' }}>
        <Stat label="Today Signups" value={stats.todaySignups} />
        <Stat label="Checked In" value={stats.todayCheckedIn} tone="moss" />
        <Stat label="Open Gym" value={stats.openGym} tone="moss" />
        <Stat label="Trials" value={stats.trials} tone="rose" />
        <Stat label="Leads" value={stats.leads} tone="rose" />
        <Stat label="7+ Days Out" value={stats.inactive} />
      </div>

      <div className="profile-grid">
        <PanelList title="Today" empty="No classes or open gym bookings today.">
          {todayClasses.map(cls => (
            <div key={cls.id} className="hist-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div className="hist-title">{cls.title}</div>
                  <div className="hist-date">{cls.time} · {(cls.signups || []).filter(s => s.checkin_time).length}/{cls.signups?.length || 0} checked in</div>
                </div>
                <span className="class-spots">{cls.signups?.length || 0}/{cls.capacity || '∞'}</span>
              </div>
              {!!cls.signups?.length && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                  {cls.signups.map((signup, i) => (
                    <span key={`${signup.athlete_id}-${i}`} className={`membership-badge ${signup.checkin_time ? 'membership-class' : 'membership-none'}`}>
                      {signup.profiles?.name || 'Athlete'}{signup.checkin_time ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {openGymBookings.map(booking => (
            <div key={booking.id} className="hist-row">
              <div className="hist-title">Open Gym · {booking.slot_start_time || booking.checkin_time || 'Booked'}</div>
              <div className="hist-date">{booking.profiles?.name || 'Athlete'}{booking.checkin_time ? ` · checked in ${booking.checkin_time}` : ''}</div>
            </div>
          ))}
        </PanelList>

        <PanelList title="Trial Pipeline" empty="No free trials currently active.">
          {trialRows.map(({ profile, uses, remaining }) => (
            <AthleteMini
              key={profile.id}
              athlete={profile}
              onOpen={setSelectedAthlete}
              badge={`${uses}/${FREE_TRIAL_CLASS_LIMIT}`}
              detail={remaining > 0 ? `${remaining} class${remaining === 1 ? '' : 'es'} remaining` : 'Trial complete. Follow up.'}
            />
          ))}
        </PanelList>

        <PanelList title="Retention Radar" empty="No paid members are 7+ days out.">
          {inactiveMembers.map(({ profile, days, lastSeen }) => (
            <AthleteMini
              key={profile.id}
              athlete={profile}
              onOpen={setSelectedAthlete}
              badge={`${days}d`}
              detail={lastSeen ? `Last class ${new Date(lastSeen).toLocaleDateString()}` : 'No class attendance yet'}
            />
          ))}
        </PanelList>

        <PanelList title="Wins To Notice" empty="No fresh wins found yet.">
          {recentWins.map(win => (
            <button
              key={win.key}
              onClick={() => setSelectedAthlete(win.athleteId)}
              className="hist-row"
              style={{ textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(200,169,106,0.08)', cursor: 'pointer', color: 'var(--bone)' }}
            >
              <div className="hist-title">{win.text}</div>
              <div className="hist-date">{win.date ? new Date(win.date).toLocaleDateString() : ''}</div>
            </button>
          ))}
        </PanelList>

        <PanelList title="Leads" empty="No lead profiles waiting right now.">
          {leads.slice(0, 8).map(profile => (
            <AthleteMini
              key={profile.id}
              athlete={profile}
              onOpen={setSelectedAthlete}
              detail={profile.created_at ? `Joined ${new Date(profile.created_at).toLocaleDateString()}` : 'Lead'}
            />
          ))}
        </PanelList>

        <PanelList title="Alerts" empty="No recent alerts.">
          {[...newTrialNotifications, ...checkInAlerts].slice(0, 8).map(alert => (
            <div key={alert.id} className="hist-row">
              <div className="hist-title">{alert.message}</div>
              <div className="hist-date">{alert.created_at ? new Date(alert.created_at).toLocaleString() : ''}</div>
            </div>
          ))}
        </PanelList>
      </div>

      {selectedAthlete && profileById[selectedAthlete] && (
        <AthletePanel
          athleteId={selectedAthlete}
          onClose={() => setSelectedAthlete(null)}
          onUpdated={fetchCommandCenter}
        />
      )}
    </div>
  )
}
