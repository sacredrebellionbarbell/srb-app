import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import MemberAgreement from './MemberAgreement'
import AdHocLog from './AdHocLog'
import CoopBylaws from './CoopBylaws'

const STRIPE_TABLE_ID = process.env.REACT_APP_STRIPE_PRICING_TABLE_ID
const STRIPE_TABLE_ID_2 = process.env.REACT_APP_STRIPE_PRICING_TABLE_ID_2
const STRIPE_PK = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY
const TC = { 'Babes Who Fight Bears': 'track-bears', 'Strong & Savage': 'track-strength', 'Olympic Weightlifting': 'track-open' }
const MEMBERSHIP_CLASS = { 'Class Access': 'membership-class', 'Personal Training': 'membership-pt', 'Both': 'membership-both', 'None': 'membership-none' }

function epley(w, r) { return r === 1 ? w : Math.round(w * (1 + r / 30)) }
function xWeight(s) { const m = (s || '').match(/(\d+\.?\d*)/); return m ? parseFloat(m[1]) : null }
function xReps(s) { const m = (s || '').match(/^(\d+)/); return m ? parseInt(m[1]) : 1 }
function initials(name) { return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

function toDateKey(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

function calcStreaks(attendance) {
  const uniqueDates = [...new Set(
    (attendance || [])
      .map(a => toDateKey(a.classes?.start_time || a.signed_up_at))
      .filter(Boolean)
  )].sort()

  if (!uniqueDates.length) return { current: 0, best: 0 }

  let best = 1
  let run = 1

  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1] + 'T12:00:00')
    const curr = new Date(uniqueDates[i] + 'T12:00:00')
    const diff = Math.round((curr - prev) / (1000 * 60 * 60 * 24))

    if (diff <= 7) run += 1
    else run = 1

    if (run > best) best = run
  }

  const last = new Date(uniqueDates[uniqueDates.length - 1] + 'T12:00:00')
  const today = new Date()
  const daysSinceLast = Math.round((new Date(today.toISOString().split('T')[0] + 'T12:00:00') - last) / (1000 * 60 * 60 * 24))
  const current = daysSinceLast <= 7 ? run : 0

  return { current, best }
}

export default function Profile({ user, profile, onProfileUpdate }) {
  const [results, setResults] = useState([])
  const [prs, setPrs] = useState([])
  const [showDoc, setShowDoc] = useState(null)
  const [showAdHoc, setShowAdHoc] = useState(false)
  const [attendance, setAttendance] = useState([])
  const [uploading, setUploading] = useState(false)
  const [editName, setEditName] = useState(false)
  const [newName, setNewName] = useState(profile?.name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [editPhone, setEditPhone] = useState(false)
  const [editRack, setEditRack] = useState(false)
  const [rackSettings, setRackSettings] = useState({
    rack_squat_jcups: profile?.rack_squat_jcups || '',
    rack_squat_safeties: profile?.rack_squat_safeties || '',
    rack_bench_jcups: profile?.rack_bench_jcups || '',
    rack_bench_safeties: profile?.rack_bench_safeties || '',
    rack_notes: profile?.rack_notes || ''
  })
  const [toast, setToast] = useState(null)
  const fileRef = useRef()

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  useEffect(() => {
    fetchResults()
    fetchAttendance()
  }, [user])

  useEffect(() => {
    setRackSettings({
      rack_squat_jcups: profile?.rack_squat_jcups || '',
      rack_squat_safeties: profile?.rack_squat_safeties || '',
      rack_bench_jcups: profile?.rack_bench_jcups || '',
      rack_bench_safeties: profile?.rack_bench_safeties || '',
      rack_notes: profile?.rack_notes || ''
    })
  }, [profile])

  const fetchResults = async () => {
    const { data: setLogData } = await supabase
      .from('set_logs')
      .select(`
        value,
        created_at,
        sets(reps, load, set_number),
        movements(name, section_id, workout_sections(type)),
        workouts(title, date, track)
      `)
      .eq('athlete_id', user.id)
      .order('created_at', { ascending: false })

    const { data: legacyData } = await supabase
      .from('results')
      .select('*, workouts(title, date, track, workout_sections(type, movements(*)))')
      .eq('athlete_id', user.id)
      .neq('score', 'logged')
      .order('created_at', { ascending: false })

    const setHistory = (setLogData || [])
      .filter(sl => sl.value)
      .map(sl => ({
        source: 'set_log',
        movement: sl.movements?.name || 'Movement',
        workoutTitle: sl.workouts?.title || 'Workout',
        date: sl.workouts?.date || toDateKey(sl.created_at),
        track: sl.workouts?.track || 'Training',
        score: sl.value,
        reps: sl.sets?.reps,
        load: sl.sets?.load,
        setNumber: sl.sets?.set_number,
        sectionType: sl.movements?.workout_sections?.type,
        created_at: sl.created_at
      }))

    const validLegacy = (legacyData || [])
      .filter(r => xWeight(r.score) !== null)
      .map(r => ({
        source: 'legacy',
        movement: r.workouts?.title || 'Result',
        workoutTitle: r.workouts?.title || 'Workout',
        date: r.workouts?.date,
        track: r.workouts?.track || 'Training',
        score: r.score,
        note: r.note,
        created_at: r.created_at
      }))

    const combined = [...setHistory, ...validLegacy].sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date))

    setResults(combined)
    buildPRs(setLogData || [], legacyData || [])
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

    setLogs.forEach(sl => {
      const w = xWeight(sl.value)
      if (!w) return

      const movName = sl.movements?.name
      if (!movName) return

      const sectionType = sl.movements?.workout_sections?.type
      if (sectionType && sectionType !== 'Strength') return

      const r = xReps(sl.sets?.reps)
      if (r > 10) return

      const est = epley(w, r)
      if (!map[movName] || est > map[movName].est) {
        map[movName] = { raw: sl.value, est, date: sl.workouts?.date, reps: sl.sets?.reps }
      }
    })

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
    if (upErr) {
      showToast('Upload failed: ' + upErr.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
    onProfileUpdate()
    showToast('Photo updated')
    setUploading(false)
  }

  const saveName = async () => {
    await supabase.from('profiles').update({ name: newName }).eq('id', user.id)
    onProfileUpdate()
    setEditName(false)
    showToast('Name updated')
  }

  const savePhone = async () => {
    await supabase.from('profiles').update({ phone }).eq('id', user.id)
    onProfileUpdate()
    setEditPhone(false)
    showToast('Phone updated')
  }

  const saveRackSettings = async () => {
    await supabase.from('profiles').update({
      rack_squat_jcups: rackSettings.rack_squat_jcups,
      rack_squat_safeties: rackSettings.rack_squat_safeties,
      rack_bench_jcups: rackSettings.rack_bench_jcups,
      rack_bench_safeties: rackSettings.rack_bench_safeties,
      rack_notes: rackSettings.rack_notes
    }).eq('id', user.id)

    onProfileUpdate()
    setEditRack(false)
    showToast('Rack settings saved')
  }

  const totalClasses = attendance.filter(a => !a.classes?.is_247).length
  const total247 = attendance.filter(a => a.classes?.is_247).length
  const thisMonth = attendance.filter(a => {
    const d = new Date(a.signed_up_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  const streaks = calcStreaks(attendance)
  const prCount = prs.length

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
              ? <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <input className="ws-notes" style={{ maxWidth: '220px' }} value={newName} onChange={e => setNewName(e.target.value)} />
                  <button className="btn-sm" onClick={saveName}>Save</button>
                  <button className="btn-ghost" onClick={() => setEditName(false)}>Cancel</button>
                </div>
              : <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
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
                ? <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input className="ws-notes" style={{ maxWidth: '200px' }} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" />
                    <button className="btn-sm" onClick={savePhone}>Save</button>
                    <button className="btn-ghost" onClick={() => setEditPhone(false)}>Cancel</button>
                  </div>
                : <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', color: profile?.phone ? 'var(--bone)' : 'var(--charcoal-light)' }}>{profile?.phone || 'No phone number'}</span>
                    <button className="btn-ghost" onClick={() => { setPhone(profile?.phone || ''); setEditPhone(true) }}>{profile?.phone ? 'Edit' : 'Add Phone'}</button>
                  </div>
              }
            </div>

            <div className="stat-row">
              <div><div className="stat-val">{results.length}</div><div className="stat-label">Logs</div></div>
              <div><div className="stat-val">{totalClasses}</div><div className="stat-label">Classes</div></div>
              <div><div className="stat-val">{prCount}</div><div className="stat-label">Est. PRs</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="pc" style={{ marginBottom: '1.5rem' }}>
        <div className="pc-title">Rack Settings</div>

        {!editRack ? (
          <div>
            <div className="attendance-grid" style={{ marginBottom: '1rem' }}>
              <div className="att-stat">
                <div className="att-val">{profile?.rack_squat_jcups || '—'}</div>
                <div className="att-label">Squat J-Cups</div>
              </div>
              <div className="att-stat">
                <div className="att-val">{profile?.rack_squat_safeties || '—'}</div>
                <div className="att-label">Squat Safeties</div>
              </div>
              <div className="att-stat">
                <div className="att-val">{profile?.rack_bench_jcups || '—'}</div>
                <div className="att-label">Bench J-Cups</div>
              </div>
              <div className="att-stat">
                <div className="att-val">{profile?.rack_bench_safeties || '—'}</div>
                <div className="att-label">Bench Safeties</div>
              </div>
            </div>

            {profile?.rack_notes && (
              <div style={{ fontSize: '13px', color: 'var(--moss-light)', lineHeight: 1.6, marginBottom: '1rem' }}>
                📝 {profile.rack_notes}
              </div>
            )}

            <button
              className="btn-ghost"
              style={{ fontSize: '12px', width: '100%' }}
              onClick={() => {
                setRackSettings({
                  rack_squat_jcups: profile?.rack_squat_jcups || '',
                  rack_squat_safeties: profile?.rack_squat_safeties || '',
                  rack_bench_jcups: profile?.rack_bench_jcups || '',
                  rack_bench_safeties: profile?.rack_bench_safeties || '',
                  rack_notes: profile?.rack_notes || ''
                })
                setEditRack(true)
              }}
            >
              {profile?.rack_squat_jcups || profile?.rack_bench_jcups ? 'Edit Rack Settings' : '+ Add Rack Settings'}
            </button>
          </div>
        ) : (
          <div>
            <div className="two-col">
              <div className="field">
                <label>Squat J-Cups</label>
                <input value={rackSettings.rack_squat_jcups} onChange={e => setRackSettings(s => ({ ...s, rack_squat_jcups: e.target.value }))} placeholder="e.g. 17" />
              </div>
              <div className="field">
                <label>Squat Safeties</label>
                <input value={rackSettings.rack_squat_safeties} onChange={e => setRackSettings(s => ({ ...s, rack_squat_safeties: e.target.value }))} placeholder="e.g. 11" />
              </div>
            </div>

            <div className="two-col">
              <div className="field">
                <label>Bench J-Cups</label>
                <input value={rackSettings.rack_bench_jcups} onChange={e => setRackSettings(s => ({ ...s, rack_bench_jcups: e.target.value }))} placeholder="e.g. 9" />
              </div>
              <div className="field">
                <label>Bench Safeties</label>
                <input value={rackSettings.rack_bench_safeties} onChange={e => setRackSettings(s => ({ ...s, rack_bench_safeties: e.target.value }))} placeholder="e.g. 6" />
              </div>
            </div>

            <div className="field">
              <label>Rack Notes</label>
              <textarea
                value={rackSettings.rack_notes}
                onChange={e => setRackSettings(s => ({ ...s, rack_notes: e.target.value }))}
                placeholder="Example: use lower J-cup for close grip bench, safeties one hole higher for pin squats..."
                style={{ minHeight: '70px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn-sm" onClick={saveRackSettings}>Save Rack Settings</button>
              <button className="btn-ghost" onClick={() => setEditRack(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="pc" style={{ marginBottom: '1.5rem' }}>
        <div className="pc-title">Attendance</div>
        <div className="attendance-grid">
          <div className="att-stat"><div className="att-val">{totalClasses + total247}</div><div className="att-label">Total</div></div>
          <div className="att-stat"><div className="att-val">{thisMonth}</div><div className="att-label">This Month</div></div>
          <div className="att-stat"><div className="att-val">{total247}</div><div className="att-label">24/7 Check-ins</div></div>
          <div className="att-stat"><div className="att-val">{streaks.current}</div><div className="att-label">Current Streak</div></div>
          <div className="att-stat"><div className="att-val">{streaks.best}</div><div className="att-label">Best Streak</div></div>
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
          <div className="pc-title">Training History</div>
          {results.length === 0
            ? <p className="no-data">No results logged yet.</p>
            : results.slice(0, 30).map((r, i) => (
              <div key={i} className="hist-row">
                <div className="hist-title">{r.movement || r.workoutTitle}</div>
                <div className="hist-meta">
                  <span className={`track-badge ${TC[r.track] || 'track-open'}`} style={{ fontSize: '9px', padding: '2px 7px' }}>{r.track}</span>
                  <span className="hist-date">{r.date}</span>
                  <span className="hist-score">{r.score}</span>
                  {r.reps && <span className="hist-note">{r.reps} reps</span>}
                  {r.load && <span className="hist-note">@ {r.load}</span>}
                  {r.setNumber && <span className="hist-note">Set {r.setNumber}</span>}
                  {r.note && <span className="hist-note">{r.note}</span>}
                </div>
                {r.workoutTitle && r.workoutTitle !== r.movement && (
                  <div style={{ fontSize: '12px', color: 'var(--charcoal-light)', marginTop: '4px' }}>{r.workoutTitle}</div>
                )}
              </div>
            ))
          }
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-title">Membership</div>
        <p style={{ fontSize: '14px', color: 'var(--charcoal-light)', marginBottom: '1.5rem' }}>Manage your Sacred Rebellion membership below.</p>

        <div style={{ marginBottom: '1.5rem' }}>
          <button className="btn-ghost" style={{ fontSize: '13px', width: '100%' }} onClick={() => setShowAdHoc(true)}>
            + Log a Movement
          </button>
        </div>

        {showAdHoc && (
          <div className="modal-wrap" onClick={e => { if (e.target.className === 'modal-wrap') setShowAdHoc(false) }}>
            <div className="modal">
              <AdHocLog user={user} onClose={() => setShowAdHoc(false)} defaultDate={new Date().toISOString().split('T')[0]} />
            </div>
          </div>
        )}

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '13px', letterSpacing: '3px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '1rem', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>Documents</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className={profile?.member_agreement_signed ? 'btn-ghost' : 'btn-sm'} onClick={() => setShowDoc(showDoc === 'agreement' ? null : 'agreement')} style={{ fontSize: '12px' }}>
              {profile?.member_agreement_signed ? '✓ ' : '⚠ '}Member Agreement
            </button>
            <button className="btn-ghost" onClick={() => setShowDoc(showDoc === 'bylaws' ? null : 'bylaws')} style={{ fontSize: '12px' }}>
              Co-op Bylaws
            </button>
          </div>

          {showDoc === 'agreement' && (
            <div style={{ marginTop: '1.5rem' }}>
              <MemberAgreement
                user={user}
                profile={profile}
                readOnly={profile?.member_agreement_signed}
                onSigned={() => { setShowDoc(null); window.location.reload() }}
              />
            </div>
          )}

          {showDoc === 'bylaws' && (
            <div style={{ marginTop: '1.5rem' }}>
              <CoopBylaws />
            </div>
          )}
        </div>

        <div className="stripe-wrap">
          <stripe-pricing-table pricing-table-id={STRIPE_TABLE_ID} publishable-key={STRIPE_PK} customer-email={user.email} />
        </div>

        {STRIPE_TABLE_ID_2 && (
          <div className="stripe-wrap" style={{ marginTop: '1rem' }}>
            <stripe-pricing-table pricing-table-id={STRIPE_TABLE_ID_2} publishable-key={STRIPE_PK} customer-email={user.email} />
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
