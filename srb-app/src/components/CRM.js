import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

function initials(name) { return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

export default function CRM({ user }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [msgText, setMsgText] = useState('')
  const [toast, setToast] = useState(null)

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*, results(count), class_signups(count)')
        .order('created_at', { ascending: false })
      setMembers(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  const promoteToCoach = async (id) => {
    await supabase.from('profiles').update({ role: 'coach' }).eq('id', id)
    setMembers(members.map(m => m.id === id ? { ...m, role: 'coach' } : m))
    showToast('Role updated')
  }

  const sendEmail = (member) => {
    const subject = encodeURIComponent('Sacred Rebellion Barbell')
    const body = encodeURIComponent(msgText || '')
    window.open(`mailto:${member.email || ''}?subject=${subject}&body=${body}`)
    showToast('Email client opened')
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Members</h2>
        <span style={{ fontSize: '12px', color: 'var(--charcoal-light)' }}>{members.length} registered</span>
      </div>

      <div className="panel" style={{ marginBottom: '1.5rem' }}>
        <div className="panel-title">Broadcast Message</div>
        <p style={{ fontSize: '12px', color: 'var(--charcoal-light)', marginBottom: '1rem' }}>
          Opens your email client with all members. Use for cancellations, announcements, etc.
        </p>
        <div className="field">
          <label>Message</label>
          <textarea value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="Class cancelled tonight due to weather..." />
        </div>
        <button className="btn-sm" onClick={() => {
          const emails = members.map(m => m.email).filter(Boolean).join(',')
          const subject = encodeURIComponent('Sacred Rebellion Barbell Update')
          const body = encodeURIComponent(msgText)
          window.open(`mailto:${emails}?subject=${subject}&body=${body}`)
          showToast('Email client opened')
        }}>Email All Members</button>
      </div>

      {loading && <div className="loading">Loading...</div>}

      {members.map(m => (
        <div key={m.id} className="class-card">
          <div className="class-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {m.avatar_url
                ? <img src={m.avatar_url} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--rose)' }} alt="" />
                : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(162,92,107,0.2)', border: '1px solid var(--rose)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '14px', color: 'var(--rose-light)', flexShrink: 0 }}>{initials(m.name)}</div>
              }
              <div>
                <div style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold-light)', fontSize: '14px' }}>{m.name || 'Unnamed'}</div>
                <div style={{ fontSize: '11px', color: 'var(--charcoal-light)', marginTop: '2px' }}>{m.email}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: m.role === 'coach' ? 'var(--gold)' : 'var(--charcoal-light)' }}>{m.role}</span>
              {selected === m.id
                ? <button className="btn-ghost" onClick={() => setSelected(null)}>Close</button>
                : <button className="btn-ghost" onClick={() => setSelected(m.id)}>Actions</button>
              }
            </div>
          </div>

          {selected === m.id && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="btn-moss" onClick={() => sendEmail(m)}>Email Member</button>
              {m.role !== 'coach' && (
                <button className="btn-ghost" onClick={() => promoteToCoach(m.id)}>Make Coach</button>
              )}
            </div>
          )}
        </div>
      ))}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
