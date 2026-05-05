import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

const STRIPE_TABLE_ID = process.env.REACT_APP_STRIPE_PRICING_TABLE_ID
const STRIPE_PK = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY
const TC = { 'Babes Who Fight Bears': 'track-bears', 'Strong & Savage': 'track-strength', 'Olympic Weightlifting': 'track-open' }
const MEMBERSHIP_CLASS = { 'Class Access': 'membership-class', 'Personal Training': 'membership-pt', 'Both': 'membership-both', 'None': 'membership-none' }

function epley(w, r) { return r === 1 ? w : Math.round(w * (1 + r / 30)) }
function xWeight(s) { const m = (s || '').match(/(\d+\.?\d*)/); return m ? parseFloat(m[1]) : null }
function xReps(s) { const m = (s || '').match(/^(\d+)/); return m ? parseInt(m[1]) : 1 }
function initials(name) { return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

export default function Profile({ user, profile, onProfileUpdate }) {
  const [results, setResults] = useState([])
  const [prs, setPrs] = useState([])
  const [attendance, setAttendance] = useState([])
  const [uploading, setUploading] = useState(false)
  const [editName, setEditName] = useState(false)
  const [newName, setNewName] = useState(profile?.name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [editPhone, setEditPhone] = useState(false)
  const [toast, setToast] = useState(null)
  const fileRef = useRef()

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  useEffect(() => {
    fetchResults()
    fetchAttendance()
  }, [user])

  const fetchResults = async () => {
    // Pull from set_logs — filter to Strength sections only for 1RM estimation
    const { data: setLogData } = await supabase
      .from('set_logs')
      .select(`
        value,
        sets(reps, load, set_number),
        movements(name, section_id, workout_sections(type)),
        workouts(title, date, track)
      `)
      .eq('athlete_id', user.id)
      .order('created_at', { ascending: false })

    // Pull from legacy results table as fallback
    const { data: legacyData } = await supabase
      .from('results')
      .select('*, workouts(title, date, track, workout_sections(type, movements(*)))')
      .eq('athlete_id', user.id)
      .neq('score', 'logged')
      .order('created_at', { ascending: false })

    const validLegacy = (legacyData || []).filter(r => xWeight(r.score) !== null)
    setResults(validLegacy)
    buildPRs(setLogData || [], validLegacy)
  }

  const fetchAttendance = async () => {
    const { data } = await supabase
      .from('class_signups')
      .select('*, classes(title, start_time, is_247)')
      .eq('athlete_id', user.id)
      .order('signed_up_at', { ascending: false })
    setAttendance(data || [])
  }

  const buildPRs = (setLogs, legacyResults) => {
    const map = {}

    // Process new set_logs — Strength sections only
    setLogs.forEach(sl => {
      const w = xWeight(sl.value)
      if (!w) return
      const movName = sl.movements?.name
      if (!movName) return
      // Only use Strength sections for 1RM estimation
      const sectionType = sl.movements?.workout_sections?.type
      if (sectionType && sectionType !== 'Strength') return
      const r = xReps(sl.sets?.reps)
      if (r > 10) return // ignore high rep sets — unreliable for 1RM estimation
      const est = epley(w, r)
      if (!map[movName] || est > map[movName].est) {
        map[movName] = { raw: sl.value, est, date: sl.workouts?.date, reps: sl.sets?.reps }
      }
    })

    // Fill in from legacy results — Strength sections only
    legacyResults.forEach(r => {
      const wt = xWeight(r.score)
      if (!wt) return
      const movements = r.workouts?.workout_sections
        ?.filter(s => s.type === 'Strength')
        ?.flatMap(s => s.movements || []) || []
      movements.forEach(m => {
        if (!m.name) return
        const reps = xReps(r.note)
        if (reps > 10) return
        const est = epley(wt, reps)
        if (!map[m.name] || est > map[m.name].est) {
          map[m.name] = { raw: r.score, est, date: r.workouts?.date }
        }
      })
    })

    setPrs(Object.entries(map).sort((a, b) => b[1].est - a[1].est))
  }

  const uploadAvatar = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `avatars/${user.id}.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) { showToast('Upload failed: ' + upErr.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
    onProfileUpdate()
    showToast('Photo updated')
    setUploading(false)
  }

  const saveName = async () => {
    await supabase.from('profiles').update({ name: newName }).eq('id', user.id)
    onProfileUpdate(); setEditName(false); showToast('Name updated')
  }

  const savePhone = async () => {
    await supabase.from('profiles').update({ phone }).eq('id', user.id)
    onProfileUpdate(); setEditPhone(false); showToast('Phone updated')
  }

  const totalClasses = attendance.filter(a => !a.classes?.is_247).length
  const total247 = attendance.filter(a => a.classes?.is_247).length
  const thisMonth = attendance.filter(a => {
    const d = new Date(a.signed_up_at); const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const prCount = results.filter(r => r.note?.toLowerCase().includes('pr')).length

  return (
    <div>
      <div className="panel">
        <div className="profile-hero">
          <div className="profile-avatar-wrap" onClick={() => fileRef.current.click()}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} className="profile-avatar" alt="" />
              : <div className="profile-avatar-placeholder">{initials(profile?.name)}</div>
            }
            <div className="profile-avatar-overlay">{uploading ? 'Uploading...' : 'Change Photo'}</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar} />
          </div>

          <div style={{ flex: 1 }}>
            {editName
              ? <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <input className="ws-notes" style={{ maxWidth: '220px' }} value={newName} onChange={e => setNewName(e.target.value)} />
                  <button className="btn-sm" onClick={saveName}>Save</button>
                  <button className="btn-ghost" onClick={() => setEditName(false)}>Cancel</button>
                </div>
              : <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <div className="profile-name">{profile?.name || user.email}</div>
                  <button className="btn-ghost" onClick={() => setEditName(true)}>Edit</button>
                </div>
            }

            <div className="profile-role">{profile?.role === 'coach' ? 'Head Coach' : 'Athlete'}</div>

            {profile?.membership_type && (
              <div style={{ marginTop: '6px' }}>
                <span className={`membership-badge ${MEMBERSHIP_CLASS[profile.membership_type] || 'membership-none'}`}>{profile.membership_type}</span>
              </div>
            )}

            <div style={{ marginTop: '10px' }}>
              {editPhone
                ? <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input className="ws-notes" style={{ maxWidth: '200px' }} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" />
                    <button className="btn-sm" onClick={savePhone}>Save</button>
                    <button className="btn-ghost" onClick={() => setEditPhone(false)}>Cancel</button>
                  </div>
                : <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '14px', color: profile?.phone ? 'var(--bone)' : 'var(--charcoal-light)' }}>{profile?.phone || 'No phone number'}</span>
                    <button className="btn-ghost" onClick={() => { setPhone(profile?.phone || ''); setEditPhone(true) }}>{profile?.phone ? 'Edit' : 'Add Phone'}</button>
                  </div>
              }
            </div>

            <div className="stat-row">
              <div><div className="stat-val">{results.length}</div><div className="stat-label">Workouts</div></div>
              <div><div className="stat-val">{totalClasses}</div><div className="stat-label">Classes</div></div>
              <div><div className="stat-val">{prCount}</div><div className="stat-label">PRs</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="pc" style={{ marginBottom: '1.5rem' }}>
        <div className="pc-title">Attendance</div>
        <div className="attendance-grid">
          <div className="att-stat"><div className="att-val">{totalClasses + total247}</div><div className="att-label">Total</div></div>
          <div className="att-stat"><div className="att-val">{thisMonth}</div><div className="att-label">This Month</div></div>
          <div className="att-stat"><div className="att-val">{total247}</div><div className="att-label">24/7 Check-ins</div></div>
        </div>
        {attendance.slice(0, 8).map((a, i) => (
          <div key={i} className="att-row">
            <span className="att-class">{a.classes?.is_247 ? '24/7 Access' : a.classes?.title}</span>
            {a.checkin_time && <span className="att-time">{a.checkin_time}</span>}
            <span className="att-date">{a.classes?.start_time ? new Date(a.classes.start_time).toLocaleDateString() : new Date(a.signed_up_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>

      <div className="profile-grid">
        <div className="pc">
          <div className="pc-title">Estimated 1RMs</div>
          {prs.length === 0
            ? <p className="no-data">Log weighted sets to see estimates.</p>
            : prs.map(([name, d]) => (
              <div key={name} className="pr-row">
                <span className="pr-mv">{name}</span>
                <div style={{ textAlign: 'right' }}>
                  <div className="pr-val">~{d.est} lbs</div>
                  {d.reps && <div style={{ fontSize: '11px', color: 'var(--moss-light)' }}>{d.reps} reps @ {d.raw}</div>}
                  <div className="pr-date">{d.date}</div>
                </div>
              </div>
            ))
          }
        </div>
        <div className="pc">
          <div className="pc-title">Result History</div>
          {results.length === 0
            ? <p className="no-data">No results logged yet.</p>
            : results.map((r, i) => (
              <div key={i} className="hist-row">
                <div className="hist-title">{r.workouts?.title}</div>
                <div className="hist-meta">
                  <span className={`track-badge ${TC[r.workouts?.track] || 'track-open'}`} style={{ fontSize: '9px', padding: '2px 7px' }}>{r.workouts?.track}</span>
                  <span className="hist-date">{r.workouts?.date}</span>
                  <span className="hist-score">{r.score}</span>
                  {r.note && <span className="hist-note">{r.note}</span>}
                </div>
              </div>
            ))
          }
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-title">Membership</div>
        <p style={{ fontSize: '14px', color: 'var(--charcoal-light)', marginBottom: '1.5rem' }}>Manage your Sacred Rebellion membership below.</p>
        <div className="stripe-wrap">
          <stripe-pricing-table pricing-table-id={STRIPE_TABLE_ID} publishable-key={STRIPE_PK} customer-email={user.email} />
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
