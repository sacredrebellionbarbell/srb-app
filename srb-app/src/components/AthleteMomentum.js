import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const MILESTONES = [1, 10, 25, 50, 100, 250, 500, 1000]

function xWeight(s) {
  if (/\bmiss\b/i.test(s || '')) return null
  const m = (s || '').match(/(\d+\.?\d*)/)
  return m ? parseFloat(m[1]) : null
}

function xReps(s) {
  const m = (s || '').match(/^(\d+)/)
  return m ? parseInt(m[1]) : 1
}

function epley(w, r) {
  return r === 1 ? w : Math.round(w * (1 + r / 30))
}

function toDateKey(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

function daysAgo(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 9999
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
}

function weekStartKey() {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().split('T')[0]
}

function isThisWeek(value) {
  if (!value) return false
  const key = weekStartKey()
  const d = new Date(value)
  const start = new Date(key + 'T00:00:00')
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return d >= start && d < end
}

function athleteName(row) {
  return row?.profiles?.name || 'An athlete'
}

function movementName(row) {
  return row?.movements?.name || 'a movement'
}

function buildPrWins(setLogs) {
  const grouped = {}

  ;(setLogs || []).forEach(row => {
    const weight = xWeight(row.value)
    if (!weight) return

    const reps = xReps(row.sets?.reps)
    if (reps > 10) return

    const name = movementName(row)
    if (!name) return

    const key = `${row.athlete_id}-${name}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push({
      athleteId: row.athlete_id,
      athlete: athleteName(row),
      movement: name,
      value: row.value,
      reps,
      est: epley(weight, reps),
      created_at: row.created_at,
      date: row.workouts?.date || toDateKey(row.created_at)
    })
  })

  const wins = []

  Object.values(grouped).forEach(entries => {
    const sorted = entries.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    let best = -Infinity

    sorted.forEach(entry => {
      if (entry.est > best) {
        const isNew = best > -Infinity
        best = entry.est

        if (isNew && daysAgo(entry.created_at) <= 14) {
          wins.push({
            type: 'pr',
            athleteId: entry.athleteId,
            date: entry.created_at,
            text: `${entry.athlete} hit a new ${entry.movement} PR: ${entry.value}${entry.reps ? ` x ${entry.reps}` : ''}.`
          })
        }
      }
    })
  })

  return wins
}

function buildAttendanceWins(signups) {
  const byAthlete = {}

  ;(signups || []).forEach(row => {
    if (!row.athlete_id) return
    if (!byAthlete[row.athlete_id]) byAthlete[row.athlete_id] = []
    byAthlete[row.athlete_id].push(row)
  })

  const wins = []

  Object.entries(byAthlete).forEach(([athleteId, rows]) => {
    const sorted = rows.sort((a, b) => new Date(a.signed_up_at) - new Date(b.signed_up_at))
    const total = sorted.length
    const latest = sorted[sorted.length - 1]

    if (MILESTONES.includes(total) && latest && daysAgo(latest.signed_up_at) <= 14) {
      wins.push({
        type: 'attendance',
        athleteId,
        date: latest.signed_up_at,
        text: `${athleteName(latest)} reached ${total} ${total === 1 ? 'class/check-in' : 'classes/check-ins'}.`
      })
    }
  })

  return wins
}

function buildFirstLogWins(setLogs) {
  const byAthlete = {}

  ;(setLogs || []).forEach(row => {
    if (!row.athlete_id) return
    if (!byAthlete[row.athlete_id]) byAthlete[row.athlete_id] = []
    byAthlete[row.athlete_id].push(row)
  })

  const wins = []

  Object.entries(byAthlete).forEach(([athleteId, rows]) => {
    const sorted = rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const first = sorted[0]

    if (first && daysAgo(first.created_at) <= 14) {
      wins.push({
        type: 'first_log',
        athleteId,
        date: first.created_at,
        text: `${athleteName(first)} logged their first training result.`
      })
    }
  })

  return wins
}

export default function AthleteMomentum({ user, profile }) {
  const [setLogs, setSetLogs] = useState([])
  const [signups, setSignups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showWeekly, setShowWeekly] = useState(false)
  const [showWins, setShowWins] = useState(false)

  const weekKey = weekStartKey()
  const dismissKey = user?.id ? `srb_weekly_review_${user.id}_${weekKey}` : null
  const winsDismissKey = user?.id ? `srb_athlete_wins_${user.id}_${weekKey}` : null

  useEffect(() => {
    fetchMomentum()
  }, [user?.id])

  useEffect(() => {
    if (!user?.id || profile?.role === 'coach' || loading) return
    const dismissed = dismissKey ? localStorage.getItem(dismissKey) : 'yes'
    if (!dismissed) setShowWeekly(true)
  }, [user?.id, profile?.role, loading, dismissKey])

  const fetchMomentum = async () => {
    if (!user?.id) return

    setLoading(true)

    const { data: logs } = await supabase
      .from('set_logs')
      .select(`
        id,
        athlete_id,
        value,
        created_at,
        profiles(name),
        sets(reps, load, set_number),
        movements(name),
        workouts(title, date, track)
      `)
      .order('created_at', { ascending: false })
      .limit(600)

    const { data: attendance } = await supabase
      .from('class_signups')
      .select(`
        id,
        athlete_id,
        signed_up_at,
        checkin_time,
        profiles(name),
        classes(title, start_time, is_247)
      `)
      .order('signed_up_at', { ascending: false })
      .limit(800)

    setSetLogs(logs || [])
    setSignups(attendance || [])
    setLoading(false)
  }

  const wins = useMemo(() => {
    const allWins = [
      ...buildPrWins(setLogs),
      ...buildAttendanceWins(signups),
      ...buildFirstLogWins(setLogs)
    ]

    const seen = new Set()

    return allWins
      .filter(w => {
        const key = `${w.type}-${w.athleteId}-${w.text}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
  }, [setLogs, signups])

  const review = useMemo(() => {
    const myLogs = setLogs.filter(row => row.athlete_id === user?.id)
    const mySignups = signups.filter(row => row.athlete_id === user?.id)

    const weeklyLogs = myLogs.filter(row => isThisWeek(row.created_at))
    const weeklySignups = mySignups.filter(row => isThisWeek(row.classes?.start_time || row.signed_up_at))
    const weeklyPrs = buildPrWins(myLogs).filter(w => isThisWeek(w.date))

    const weightedLogs = weeklyLogs
      .map(row => ({ ...row, weight: xWeight(row.value) || 0 }))
      .sort((a, b) => b.weight - a.weight)

    const biggest = weightedLogs[0]

    return {
      classes: weeklySignups.filter(s => !s.classes?.is_247).length,
      checkins: weeklySignups.filter(s => s.classes?.is_247).length,
      logs: weeklyLogs.length,
      prs: weeklyPrs.length,
      biggest: biggest ? `${movementName(biggest)}: ${biggest.value}` : null
    }
  }, [setLogs, signups, user?.id])

  const dismissWeekly = () => {
    if (dismissKey) localStorage.setItem(dismissKey, 'yes')
    setShowWeekly(false)
  }

  const dismissWins = () => {
    if (winsDismissKey) localStorage.setItem(winsDismissKey, 'yes')
    setShowWins(false)
  }

  useEffect(() => {
    if (!user?.id || loading || !wins.length) {
      setShowWins(false)
      return
    }
    const dismissed = winsDismissKey ? localStorage.getItem(winsDismissKey) : 'yes'
    setShowWins(!dismissed)
  }, [user?.id, loading, wins.length, winsDismissKey])

  if (loading || (!wins.length && profile?.role === 'coach')) return null

  return (
    <>
      {wins.length > 0 && showWins && (
        <div style={{
          background: 'rgba(162,92,107,0.10)',
          border: '1px solid rgba(162,92,107,0.55)',
          borderRadius: '4px',
          padding: '12px 14px',
          marginBottom: '1rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
            <div style={{
              fontFamily: 'Cinzel, serif',
              color: 'var(--gold-light)',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              fontSize: '12px'
            }}>
              🔥 Athlete Wins
            </div>
            <button
              type="button"
              onClick={dismissWins}
              aria-label="Dismiss athlete wins"
              style={{ background: 'transparent', border: 'none', color: 'var(--charcoal-light)', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '0 2px' }}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {wins.map((win, i) => (
              <div key={i} style={{ fontSize: '14px', color: 'var(--bone)', lineHeight: 1.5 }}>
                {win.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {showWeekly && (
        <div className="modal-wrap" onClick={e => { if (e.target.className === 'modal-wrap') dismissWeekly() }}>
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div style={{
              fontFamily: 'Cinzel, serif',
              color: 'var(--gold-light)',
              letterSpacing: '3px',
              textTransform: 'uppercase',
              fontSize: '18px',
              marginBottom: '8px'
            }}>
              Weekly Wins Review
            </div>

            <p style={{ color: 'var(--charcoal-light)', fontSize: '14px', lineHeight: 1.7, marginBottom: '1.25rem' }}>
              The work is stacking. Here is what you carried into this week.
            </p>

            <div className="attendance-grid" style={{ marginBottom: '1rem' }}>
              <div className="att-stat"><div className="att-val">{review.classes}</div><div className="att-label">Classes</div></div>
              <div className="att-stat"><div className="att-val">{review.checkins}</div><div className="att-label">Check-ins</div></div>
              <div className="att-stat"><div className="att-val">{review.logs}</div><div className="att-label">Logs</div></div>
              <div className="att-stat"><div className="att-val">{review.prs}</div><div className="att-label">PRs</div></div>
            </div>

            {review.biggest && (
              <div style={{
                background: 'rgba(200,169,106,0.08)',
                border: '1px solid var(--gold-dark)',
                borderRadius: '4px',
                padding: '10px 12px',
                marginBottom: '1rem'
              }}>
                <div style={{ fontSize: '11px', letterSpacing: '2px', color: 'var(--charcoal-light)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Biggest Lift Logged
                </div>
                <div style={{ color: 'var(--gold-light)', fontFamily: 'Cinzel, serif' }}>{review.biggest}</div>
              </div>
            )}

            <button className="btn-sm" style={{ width: '100%' }} onClick={dismissWeekly}>
              Back To The Altar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
