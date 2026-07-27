import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import AthletePanel from './AthletePanel'
import { attendanceDate, classAttendanceRows, milestoneReachedForTotal, normalizeAttendance } from '../utils/achievements'
import { FREE_TRIAL_CLASS_LIMIT, isFreeTrial } from '../utils/access'

const COMMAND_CENTER_TYPES = ['Class Access', 'Free Trial']
const FOLLOW_UP_KEY = 'srb_command_center_followups_v1'

function isTestProfile(profile) {
  const label = `${profile?.name || ''} ${profile?.email || ''}`.toLowerCase()
  return /\btest\b/.test(label)
}

function isCommandCenterAthlete(profile) {
  return profile?.role !== 'coach' && COMMAND_CENTER_TYPES.includes(profile?.membership_type) && !isTestProfile(profile)
}

function followUpId(athleteId, reason) {
  return `${athleteId}:${reason}`
}

function followUpLabel(value) {
  if (value === 'contacted') return 'Followed up'
  if (value === 'dismissed') return 'Dismissed'
  return 'Needs follow-up'
}

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

function FollowUpSelect({ value, onChange }) {
  return (
    <select
      value={value || 'needs'}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      style={{
        background: 'rgba(255,248,236,0.12)',
        border: '1px solid var(--border-strong)',
        borderRadius: '3px',
        color: 'var(--bone)',
        fontSize: '12px',
        padding: '7px 8px',
        minWidth: '128px'
      }}
      aria-label="Follow-up status"
    >
      <option value="needs">Needs follow-up</option>
      <option value="contacted">Followed up</option>
      <option value="dismissed">Dismissed</option>
    </select>
  )
}

function AthleteMini({ athlete, onOpen, detail, badge, followUpValue, onFollowUpChange }) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {badge && <span className="membership-badge membership-trial">{badge}</span>}
        {onFollowUpChange && (
          <FollowUpSelect
            value={followUpValue}
            onChange={onFollowUpChange}
          />
        )}
      </div>
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
  const [followUps, setFollowUps] = useState(() => {
    try {
      if (typeof window === 'undefined') return {}
      return JSON.parse(window.localStorage.getItem(FOLLOW_UP_KEY) || '{}')
    } catch {
      return {}
    }
  })
  const [loading, setLoading] = useState(true)

  const setFollowUp = useCallback((athleteId, reason, value) => {
    const key = followUpId(athleteId, reason)
    setFollowUps(current => {
      const next = { ...current, [key]: { status: value, updated_at: new Date().toISOString() } }
      try {
        if (typeof window !== 'undefined') window.localStorage.setItem(FOLLOW_UP_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

  const getFollowUp = useCallback((athleteId, reason) => {
    return followUps[followUpId(athleteId, reason)]?.status || 'needs'
  }, [followUps])

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
        .select('*, class_signups(athlete_id, checkin_time, profiles(name, email, avatar_url, membership_type))')
        .eq('is_recurring', false)
        .gte('start_time', startOfTodayISO())
        .lte('start_time', endOfTodayISO())
        .order('start_time', { ascending: true }),
      supabase
        .from('class_instances')
        .select('*, classes(title, recurrence_time, capacity, is_247), instance_signups(athlete_id, checkin_time, profiles(name, email, avatar_url, membership_type))')
        .eq('instance_date', today)
        .order('instance_date', { ascending: true }),
      supabase
        .from('class_signups')
        .select('id, athlete_id, signed_up_at, checkin_time, profiles(name, email, avatar_url, membership_type), classes(title, start_time, is_247)')
        .order('signed_up_at', { ascending: false })
        .limit(900),
      supabase
        .from('instance_signups')
        .select('id, athlete_id, signed_up_at, checkin_time, profiles(name, email, avatar_url, membership_type), class_instances(instance_date, classes(title, is_247))')
        .limit(900),
      supabase
        .from('open_gym_bookings')
        .select('*, profiles(name, email, avatar_url, membership_type)')
        .eq('booking_date', today)
        .order('slot_start_time', { ascending: true }),
      supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('set_logs')
        .select('id, athlete_id, value, created_at, profiles(name, email, avatar_url, membership_type), movements(name), workouts(title, date)')
        .order('created_at', { ascending: false })
        .limit(300)
    ])

    setProfiles((profilesRes.data || []).filter(isCommandCenterAthlete))
    setOneTimeClasses(oneTimeRes.data || [])
    setTodayInstances(instanceRes.data || [])
    setAttendance(normalizeAttendance(classAttendanceRes.data || [], instanceAttendanceRes.data || []).filter(row => isCommandCenterAthlete(row.profiles)))
    setOpenGymBookings((openGymRes.data || []).filter(row => isCommandCenterAthlete(row.profiles)))
    setNotifications(notificationRes.data || [])
    setSetLogs((setLogsRes.data || []).filter(row => isCommandCenterAthlete(row.profiles)))
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
        signups: (cls.class_signups || []).filter(signup => isCommandCenterAthlete(signup.profiles))
      }))

    const recurring = todayInstances
      .filter(instance => !instance.classes?.is_247)
      .map(instance => ({
        id: `instance-${instance.id}`,
        title: instance.classes?.title || 'Class',
        time: instance.classes?.recurrence_time || 'Today',
        capacity: instance.classes?.capacity,
        signups: (instance.instance_signups || []).filter(signup => isCommandCenterAthlete(signup.profiles))
      }))

    return [...oneTime, ...recurring].filter(cls => cls.signups.length)
  }, [oneTimeClasses, todayInstances])

  const trialRows = useMemo(() => {
    return profiles
      .filter(isFreeTrial)
      .filter(profile => followUps[followUpId(profile.id, 'trial')]?.status !== 'dismissed')
      .map(profile => {
        const uses = (attendanceByAthlete[profile.id] || []).length
        return { profile, uses, remaining: Math.max(FREE_TRIAL_CLASS_LIMIT - uses, 0) }
      })
      .sort((a, b) => b.uses - a.uses || (a.profile.name || '').localeCompare(b.profile.name || ''))
  }, [attendanceByAthlete, followUps, profiles])

  const inactiveMembers = useMemo(() => {
    return profiles
      .filter(profile => profile.membership_type === 'Class Access')
      .filter(profile => followUps[followUpId(profile.id, 'inactive')]?.status !== 'dismissed')
      .map(profile => {
        const rows = attendanceByAthlete[profile.id] || []
        const latest = rows.sort((a, b) => new Date(attendanceDate(b) || 0) - new Date(attendanceDate(a) || 0))[0]
        const lastSeen = attendanceDate(latest)
        return { profile, lastSeen, days: daysAgo(lastSeen) }
      })
      .filter(row => row.days >= 7)
      .sort((a, b) => b.days - a.days)
      .slice(0, 8)
  }, [attendanceByAthlete, followUps, profiles])

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

  const visibleNotifications = notifications.filter(n => {
    if (!n.athlete_id) return true
    return isCommandCenterAthlete(profileById[n.athlete_id])
  })
  const newTrialNotifications = visibleNotifications.filter(n => n.type === 'free_trial_signup')
  const checkInAlerts = visibleNotifications.filter(n => n.type === '247_checkin')

  const stats = {
    todaySignups: todayClasses.reduce((sum, cls) => sum + (cls.signups?.length || 0), 0),
    todayCheckedIn: todayClasses.reduce((sum, cls) => sum + (cls.signups || []).filter(s => s.checkin_time).length, 0),
    trials: trialRows.length,
    classAccess: profiles.filter(profile => profile.membership_type === 'Class Access').length,
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
        <Stat label="Class Access" value={stats.classAccess} tone="rose" />
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
              detail={`${remaining > 0 ? `${remaining} class${remaining === 1 ? '' : 'es'} remaining` : 'Trial complete. Follow up.'} · ${followUpLabel(getFollowUp(profile.id, 'trial'))}`}
              followUpValue={getFollowUp(profile.id, 'trial')}
              onFollowUpChange={value => setFollowUp(profile.id, 'trial', value)}
            />
          ))}
        </PanelList>

        <PanelList title="Class Access Retention" empty="No class-access members are 7+ days out.">
          {inactiveMembers.map(({ profile, days, lastSeen }) => (
            <AthleteMini
              key={profile.id}
              athlete={profile}
              onOpen={setSelectedAthlete}
              badge={`${days}d`}
              detail={`${lastSeen ? `Last class ${new Date(lastSeen).toLocaleDateString()}` : 'No class attendance yet'} · ${followUpLabel(getFollowUp(profile.id, 'inactive'))}`}
              followUpValue={getFollowUp(profile.id, 'inactive')}
              onFollowUpChange={value => setFollowUp(profile.id, 'inactive', value)}
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
