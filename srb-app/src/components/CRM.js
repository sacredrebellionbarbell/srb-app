import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import AthletePanel from './AthletePanel'
import { getAccessStatus, isFormerMember, isFreeTrial, isPaidMember, MEMBERSHIP_CLASS, MEMBERSHIP_TYPES } from '../utils/access'

function initials(name) { return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

export default function CRM({ user }) {
  const [members, setMembers] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [athletePanel, setAthletePanel] = useState(null)
  const [msgText, setMsgText] = useState('')
  const [activeTab, setActiveTab] = useState('current')
  const [toast, setToast] = useState(null)

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('name', { ascending: true })
    setMembers(data || [])
    setLoading(false)
  }, [])

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setNotifications(data || [])
  }, [])

  useEffect(() => {
    fetchMembers()
    fetchNotifications()
  }, [fetchMembers, fetchNotifications])

  const updateMembership = async (id, type) => {
    const { error } = await supabase
      .from('profiles')
      .update({ membership_type: type })
      .eq('id', id)
    if (!error) {
      await fetchMembers() // re-fetch from DB to confirm it stuck
      showToast('Membership updated')
    } else {
      showToast('Error: ' + error.message)
    }
  }

  const updateRole = async (id, role) => {
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', id)
    if (!error) {
      await fetchMembers()
      showToast('Role updated')
    } else {
      showToast('Error: ' + error.message)
    }
  }

  const broadcastEmail = () => {
    const emails = members.map(m => m.email).filter(Boolean).join(',')
    window.open(`mailto:${emails}?subject=${encodeURIComponent('Sacred Rebellion Barbell Update')}&body=${encodeURIComponent(msgText)}`)
    showToast('Email client opened')
  }

  const broadcastSMS = () => {
    const phones = members.map(m => m.phone).filter(Boolean)
    if (!phones.length) { showToast('No phone numbers on file yet'); return }
    window.open(`sms:${phones.join(',')}&body=${encodeURIComponent(msgText)}`)
    showToast('SMS app opened')
  }

  const visibleMembers = members.filter(m => !isFormerMember(m))
  const hiddenFormerMembers = members.filter(m => isFormerMember(m))
  const leads = visibleMembers.filter(m => m.role !== 'coach' && getAccessStatus(m) === 'Lead')
  const freeTrials = visibleMembers.filter(m => m.role !== 'coach' && isFreeTrial(m))
  const paidMembers = visibleMembers.filter(m => m.role === 'coach' || isPaidMember(m))

  const tabs = [
    { id: 'current', label: 'Current Members', count: paidMembers.length },
    { id: 'leads', label: 'Leads', count: leads.length + freeTrials.length },
    { id: 'former', label: 'Former Members', count: hiddenFormerMembers.length }
  ]

  const renderMemberCard = (m) => (
    <div key={m.id} className="class-card">
      <div className="class-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {m.avatar_url
            ? <img src={m.avatar_url} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--rose)' }} alt="" />
            : <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(162,92,107,0.2)', border: '1px solid var(--rose)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cinzel, serif', fontSize: '14px', color: 'var(--rose-light)', flexShrink: 0 }}>{initials(m.name)}</div>
          }
          <div>
            <div
              style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold-light)', fontSize: '15px', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border)' }}
              onClick={() => setAthletePanel(m.id)}
            >{m.name || 'Unnamed'}</div>
            <div style={{ fontSize: '12px', color: 'var(--charcoal-light)', marginTop: '2px' }}>{m.email}</div>
            {m.phone && <div style={{ fontSize: '12px', color: 'var(--charcoal-light)' }}>{m.phone}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`membership-badge ${MEMBERSHIP_CLASS[m.membership_type] || 'membership-none'}`}>{getAccessStatus(m)}</span>
          {m.membership_type && (
            <span className={`membership-badge ${MEMBERSHIP_CLASS[m.membership_type] || 'membership-none'}`}>{m.membership_type}</span>
          )}
          <span style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: m.role === 'coach' ? 'var(--gold)' : 'var(--charcoal-light)' }}>{m.role}</span>
          <button className="btn-ghost" onClick={() => setSelected(selected === m.id ? null : m.id)}>
            {selected === m.id ? 'Close' : 'Manage'}
          </button>
        </div>
      </div>

      {selected === m.id && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--charcoal-light)', marginBottom: '8px' }}>Membership Type</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {MEMBERSHIP_TYPES.map(t => (
                <button
                  key={t}
                  className={m.membership_type === t ? 'btn-sm' : 'btn-ghost'}
                  style={{ fontSize: '11px' }}
                  onClick={() => updateMembership(m.id, t)}
                >{t}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--charcoal-light)', marginBottom: '8px' }}>Role</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button className={m.role === 'athlete' ? 'btn-sm' : 'btn-ghost'} style={{ fontSize: '11px' }} onClick={() => updateRole(m.id, 'athlete')}>Athlete</button>
              <button className={m.role === 'coach' ? 'btn-sm' : 'btn-ghost'} style={{ fontSize: '11px' }} onClick={() => updateRole(m.id, 'coach')}>Coach</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn-moss" onClick={() => window.open(`mailto:${m.email}?body=${encodeURIComponent(msgText || '')}`)}>Email</button>
            {m.phone && <button className="btn-moss" onClick={() => window.open(`sms:${m.phone}&body=${encodeURIComponent(msgText || '')}`)}>Text</button>}
          </div>
        </div>
      )}
    </div>
  )

  const renderGroup = (title, list, empty, subtitle) => (
    <div className="panel" style={{ marginBottom: '1.5rem' }}>
      <div className="class-card-header" style={{ marginBottom: '1rem' }}>
        <div>
          <div className="panel-title" style={{ marginBottom: subtitle ? '6px' : 0 }}>{title}</div>
          {subtitle && <div style={{ color: 'var(--charcoal-light)', fontSize: '13px', lineHeight: 1.5 }}>{subtitle}</div>}
        </div>
        <span style={{ fontSize: '13px', color: 'var(--charcoal-light)' }}>{list.length}</span>
      </div>
      {list.length ? list.map(renderMemberCard) : <div className="no-data">{empty}</div>}
    </div>
  )

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Members</h2>
        <span style={{ fontSize: '13px', color: 'var(--charcoal-light)' }}>
          {paidMembers.length} current · {leads.length + freeTrials.length} leads · {hiddenFormerMembers.length} former
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 1.5rem' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'btn-sm' : 'btn-ghost'}
            onClick={() => {
              setActiveTab(tab.id)
              setSelected(null)
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {notifications.length > 0 && (
        <div className="panel" style={{ marginBottom: '1.5rem' }}>
          <div className="panel-title">24/7 Check-In Alerts</div>
          {notifications.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '14px' }}>
              <span style={{ color: 'var(--rose-light)', fontSize: '16px' }}>🔔</span>
              <span style={{ flex: 1, color: 'var(--bone)' }}>{n.message}</span>
              <span style={{ fontSize: '12px', color: 'var(--charcoal-light)' }}>{new Date(n.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="panel" style={{ marginBottom: '1.5rem' }}>
        <div className="panel-title">Broadcast Message</div>
        <div className="field">
          <label>Message</label>
          <textarea value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="Class cancelled tonight due to weather..." />
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn-sm" onClick={broadcastEmail}>Email All Members</button>
          <button className="btn-moss" onClick={broadcastSMS}>Text All Members</button>
        </div>
      </div>

      {loading && <div className="loading">Loading...</div>}

      {activeTab === 'current' && renderGroup('Current Members', paidMembers, 'No current members found yet.', 'Active members and coaches with normal app access.')}

      {activeTab === 'leads' && (
        <>
          {renderGroup('Leads', leads, 'No lead profiles yet.', 'People who have an account but are not on a free trial or paid membership.')}
          {renderGroup('Free Trials', freeTrials, 'No active free trials right now.', 'Trial athletes should stay here until they convert or finish their 3 classes.')}
        </>
      )}

      {activeTab === 'former' && renderGroup('Former Members', hiddenFormerMembers, 'No former members yet.', 'Archived members stay here so they do not count against current member or lead reporting.')}

      {toast && <div className="toast">{toast}</div>}

      {athletePanel && (
        <AthletePanel
          athleteId={athletePanel}
          onClose={() => setAthletePanel(null)}
          onUpdated={fetchMembers}
        />
      )}
    </div>
  )
}
