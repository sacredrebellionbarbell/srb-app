import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

const STRIPE_TABLE_ID = process.env.REACT_APP_STRIPE_PRICING_TABLE_ID
const STRIPE_PK = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY
const TC = { 'Strength & Conditioning': 'track-strength', 'Babes Who Fight Bears': 'track-bears', 'Open Track': 'track-open' }

function epley(w, r) { return r === 1 ? w : Math.round(w * (1 + r / 30)) }
function xWeight(s) { const m = (s || '').match(/(\d+\.?\d*)/); return m ? parseFloat(m[1]) : null }
function xReps(n) { const m = (n || '').match(/(\d+)\s*rep/i); return m ? parseInt(m[1]) : 1 }
function initials(name) { return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

export default function Profile({ user, profile, onProfileUpdate }) {
  const [results, setResults] = useState([])
  const [prs, setPrs] = useState([])
  const [uploading, setUploading] = useState(false)
  const [editName, setEditName] = useState(false)
  const [newName, setNewName] = useState(profile?.name || '')
  const [toast, setToast] = useState(null)
  const fileRef = useRef()

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  useEffect(() => {
    fetchResults()
  }, [user])

  const fetchResults = async () => {
    const { data } = await supabase
      .from('results')
      .select('*, workouts(title, date, track, workout_sections(movements(*)))')
      .eq('athlete_id', user.id)
      .order('created_at', { ascending: false })
    if (data) {
      setResults(data)
      buildPRs(data)
    }
  }

  const buildPRs = (data) => {
    const map = {}
    data.forEach(r => {
      const wt = xWeight(r.score)
      if (!wt) return
      const movements = r.workouts?.workout_sections?.flatMap(s => s.movements || []) || []
      movements.forEach(m => {
        if (!m.name) return
        const est = epley(wt, xReps(r.note))
        if (!map[m.name] || est > map[m.name].est) map[m.name] = { raw: r.score, est, date: r.workouts?.date }
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
    if (upErr) { showToast('Upload failed'); setUploading(false); return }
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
              ? <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                  <input className="ws-notes" style={{ maxWidth: '220px' }} value={newName} onChange={e => setNewName(e.target.value)} />
                  <button className="btn-sm" onClick={saveName}>Save</button>
                  <button className="btn-ghost" onClick={() => setEditName(false)}>Cancel</button>
                </div>
              : <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="profile-name">{profile?.name || user.email}</div>
                  <button className="btn-ghost" style={{ fontSize: '10px' }} onClick={() => setEditName(true)}>Edit</button>
                </div>
            }
            <div className="profile-role">{profile?.role === 'coach' ? 'Head Coach' : 'Athlete'}</div>
            <div className="stat-row">
              <div><div className="stat-val">{results.length}</div><div className="stat-label">Logged</div></div>
              <div><div className="stat-val">{prs.length}</div><div className="stat-label">Movements</div></div>
              <div><div className="stat-val">{prCount}</div><div className="stat-label">PRs</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-grid">
        <div className="pc">
          <div className="pc-title">Estimated 1RMs</div>
          {prs.length === 0
            ? <p className="no-data">Log weight-based results to see estimates.</p>
            : prs.map(([name, d]) => (
              <div key={name} className="pr-row">
                <span className="pr-mv">{name}</span>
                <div style={{ textAlign: 'right' }}>
                  <div className="pr-val">~{d.est} lbs</div>
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
        <p style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginBottom: '1.5rem' }}>
          Manage your Sacred Rebellion membership below.
        </p>
        <div className="stripe-wrap">
          <stripe-pricing-table
            pricing-table-id={STRIPE_TABLE_ID}
            publishable-key={STRIPE_PK}
            customer-email={user.email}
          />
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
