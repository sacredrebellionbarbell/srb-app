import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const MEMBERSHIP_TYPES = ['Class Access', 'Personal Training', 'Both', 'None']
const MEMBERSHIP_CLASS = { 'Class Access': 'membership-class', 'Personal Training': 'membership-pt', 'Both': 'membership-both', 'None': 'membership-none' }

function initials(name) { return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

export default function AthletePanel({ athleteId, onClose, onUpdated }) {
  const [athlete, setAthlete] = useState(null)
  const [results, setResults] = useState([])
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2000) }

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', athleteId)
        .single()
      setAthlete(profile)

      const { data: res } = await supabase
        .from('results')
        .select('*, workouts(title, date, track)')
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false })
        .limit(8)
      setResults(res || [])

      const { data: att } = await supabase
        .from('class_signups')
        .select('*, classes(title, start_time, is_247)')
        .eq('athlete_id', athleteId)
        .order('signed_up_at', { ascending: false })
        .limit(5)
      setAttendance(att || [])

      setLoading(false)
    }
    if (athleteId) fetch()
  }, [athleteId])

  const updateMembership = async (type) => {
    await supabase.from('profiles').update({ membership_type: type }).eq('id', athleteId)
    setAthlete(a => ({ ...a, membership_type: type }))
    showToast('Membership updated')
    if (onUpdated) onUpdated()
  }

  if (!athleteId) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(44,44,42,0.85)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#2C2C2A', border: '1px solid var(--border-strong)', borderRadius: '8px 8px 0 0', width: '100%', maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto', padding: '1.5rem' }}>

        {/* Handle bar */}
        <div style={{ width: '40px', height: '4px', background: 'var(--charcoal-light)', borderRadius: '2px', margin: '0 auto 1.5rem' }} />

        {loading && <div className="loading" style={{ minHeight: '200px' }}>Loading...</div>}

        {!loading && athlete && (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              {athlete.avatar_url
                ? <img src={athlete.avatar_url} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--rose)', flexShrink: 0 }} alt="" />
                : <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(162,92,107,0.2)', border: '2px solid var(--rose)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '22px', color: 'var(--rose-light)', flexShrink: 0 }}>{initials(athlete.name)}</div>
              }
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: 'var(--gold-light)', marginBottom: '4px' }}>{athlete.name || 'Unnamed'}</div>
                <div style={{ fontSize: '12px', color: 'var(--charcoal-light)', marginBottom: '6px' }}>{athlete.email}</div>
                {athlete.membership_type && (
                  <span className={`membership-badge ${MEMBERSHIP_CLASS[athlete.membership_type] || 'membership-none'}`}>{athlete.membership_type}</span>
                )}
              </div>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--charcoal-light)', fontSize: '24px', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>

            {/* Contact buttons */}
            {(athlete.phone || athlete.email) && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {athlete.phone && (
                  <>
                    <a href={`tel:${athlete.phone}`} className="btn-sm" style={{ textDecoration: 'none', display: 'inline-block' }}>📞 Call</a>
                    <a href={`sms:${athlete.phone}`} className="btn-moss" style={{ textDecoration: 'none', display: 'inline-block' }}>💬 Text</a>
                  </>
                )}
                {athlete.email && (
                  <a href={`mailto:${athlete.email}`} className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-block' }}>✉️ Email</a>
                )}
              </div>
            )}

            {/* Membership */}
            <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--charcoal-light)', marginBottom: '8px' }}>Membership</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {MEMBERSHIP_TYPES.map(t => (
                  <button key={t} className={athlete.membership_type === t ? 'btn-sm' : 'btn-ghost'} style={{ fontSize: '11px' }} onClick={() => updateMembership(t)}>{t}</button>
                ))}
              </div>
            </div>

            {/* Attendance */}
            <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--charcoal-light)', marginBottom: '10px' }}>Recent Attendance</div>
              {attendance.length === 0
                ? <p style={{ fontSize: '13px', color: 'var(--charcoal-light)' }}>No classes attended yet.</p>
                : attendance.map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(200,169,106,0.06)', fontSize: '13px' }}>
                    <span style={{ color: 'var(--bone)' }}>{a.classes?.is_247 ? '24/7 Access' : a.classes?.title}</span>
                    <span style={{ color: 'var(--charcoal-light)', fontSize: '12px' }}>{a.classes?.start_time ? new Date(a.classes.start_time).toLocaleDateString() : new Date(a.signed_up_at).toLocaleDateString()}</span>
                  </div>
                ))
              }
            </div>

            {/* Result history */}
            <div>
              <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--charcoal-light)', marginBottom: '10px' }}>Recent Results</div>
              {results.length === 0
                ? <p style={{ fontSize: '13px', color: 'var(--charcoal-light)' }}>No results logged yet.</p>
                : results.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(200,169,106,0.06)', fontSize: '13px' }}>
                    <span style={{ flex: 1, color: 'var(--bone)' }}>{r.workouts?.title}</span>
                    <span style={{ color: 'var(--gold-light)', fontFamily: 'Cinzel, serif', fontSize: '13px' }}>{r.score}</span>
                    {r.note && <span style={{ fontSize: '11px', color: 'var(--moss-light)' }}>{r.note}</span>}
                    <span style={{ fontSize: '11px', color: 'var(--charcoal-light)' }}>{r.workouts?.date}</span>
                  </div>
                ))
              }
            </div>
          </>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  )
}
