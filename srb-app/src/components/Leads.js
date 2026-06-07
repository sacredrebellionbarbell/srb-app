import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

export default function Leads({ user, profile }) {
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)

  const showToast = msg => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const fetchRegistrations = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('event_registrations')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading event registrations:', error)
      showToast('Error loading registrations')
    }

    setRegistrations(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchRegistrations() }, [fetchRegistrations])

  const updateRegistration = async (id, updates, successMessage) => {
    setSaving(true)
    const { data, error } = await supabase
      .from('event_registrations')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    setSaving(false)

    if (error) {
      console.error('Error updating registration:', error)
      showToast('Error: ' + error.message)
      return
    }

    setRegistrations(prev => prev.map(r => r.id === id ? data : r))
    setSelected(prev => prev?.id === id ? data : prev)
    showToast(successMessage || 'Updated')
  }

  const markPaid = (id) => updateRegistration(id, { payment_status: 'paid' }, 'Marked paid')

  const markPending = (id) => updateRegistration(id, { payment_status: 'pending' }, 'Marked pending')

  const toggleShirtOrdered = (registration) => {
    const next = !registration.shirt_ordered
    updateRegistration(
      registration.id,
      {
        shirt_ordered: next,
        shirt_ordered_at: next ? new Date().toISOString() : null,
        shirt_ordered_by: next ? user?.id : null
      },
      next ? 'Shirt marked ordered' : 'Shirt marked not ordered'
    )
  }

  const filtered = registrations.filter(r => {
    if (filter === 'paid') return r.payment_status === 'paid'
    if (filter === 'pending') return r.payment_status === 'pending'
    if (filter === 'shirt') return r.include_shirt
    if (filter === 'shirt_unordered') return r.include_shirt && !r.shirt_ordered
    if (filter === 'shirt_ordered') return r.include_shirt && r.shirt_ordered
    return true
  })

  const stats = {
    total: registrations.length,
    paid: registrations.filter(r => r.payment_status === 'paid').length,
    pending: registrations.filter(r => r.payment_status === 'pending').length,
    shirts: registrations.filter(r => r.include_shirt).length,
    shirtsOrdered: registrations.filter(r => r.include_shirt && r.shirt_ordered).length,
    shirtsUnordered: registrations.filter(r => r.include_shirt && !r.shirt_ordered).length,
    revenue: registrations
      .filter(r => r.payment_status === 'paid')
      .reduce((sum, r) => sum + (r.include_shirt ? 75 : 45), 0)
  }

  const shirtCounts = registrations
    .filter(r => r.include_shirt && r.shirt_size)
    .reduce((acc, r) => {
      if (!acc[r.shirt_size]) acc[r.shirt_size] = { total: 0, ordered: 0, unordered: 0 }
      acc[r.shirt_size].total += 1
      if (r.shirt_ordered) acc[r.shirt_size].ordered += 1
      else acc[r.shirt_size].unordered += 1
      return acc
    }, {})

  if (selected) {
    return (
      <div>
        <button className="btn-ghost" onClick={() => setSelected(null)} style={{ marginBottom: '1.5rem' }}>
          ← Back to Events
        </button>

        <div className="panel">
          <div className="panel-title">{selected.first_name} {selected.last_name}</div>

          <InfoRow label="Email" value={selected.email} />
          <InfoRow label="Phone" value={selected.phone} />
          <InfoRow label="Bodyweight" value={`${selected.bodyweight_lbs || '—'} lbs`} />
          <InfoRow label="Payment" value={`${selected.payment_status === 'paid' ? '✓ Paid' : '⚠ Pending'} — ${selected.include_shirt ? '$75' : '$45'}`} />

          <div style={{ display: 'flex', gap: '8px', margin: '0.75rem 0 1.25rem', flexWrap: 'wrap' }}>
            {selected.payment_status === 'paid'
              ? <button className="btn-ghost" disabled={saving} onClick={() => markPending(selected.id)}>Mark Pending</button>
              : <button className="btn-sm" disabled={saving} onClick={() => markPaid(selected.id)}>Mark Paid</button>
            }
          </div>

          {selected.include_shirt && (
            <div style={{ background: 'rgba(200,169,106,0.06)', border: '1px solid var(--gold-dark)', borderRadius: '4px', padding: '12px', marginBottom: '1rem' }}>
              <InfoRow label="Shirt Size" value={selected.shirt_size || '—'} />
              <InfoRow label="Shirt Status" value={selected.shirt_ordered ? '✓ Ordered' : 'Needs ordered'} />
              {selected.shirt_ordered_at && (
                <InfoRow label="Ordered On" value={new Date(selected.shirt_ordered_at).toLocaleString()} />
              )}
              <button className={selected.shirt_ordered ? 'btn-ghost' : 'btn-sm'} disabled={saving} onClick={() => toggleShirtOrdered(selected)}>
                {selected.shirt_ordered ? 'Mark Shirt Not Ordered' : 'Mark Shirt Ordered'}
              </button>
            </div>
          )}

          <InfoRow label="Registered" value={selected.created_at ? new Date(selected.created_at).toLocaleDateString() : '—'} />

          <div className="panel-title" style={{ marginTop: '1.5rem' }}>Opening Attempts</div>
          <InfoRow label="Snatch" value={`${selected.snatch_opener_lbs || '—'} lbs`} />
          <InfoRow label="Clean & Jerk" value={`${selected.clean_jerk_opener_lbs || '—'} lbs`} />
          <InfoRow label="Back Squat" value={`${selected.squat_opener_lbs || '—'} lbs`} />
          <InfoRow label="Bench Press" value={`${selected.bench_opener_lbs || '—'} lbs`} />
          <InfoRow label="Deadlift" value={`${selected.deadlift_opener_lbs || '—'} lbs`} />

          <div style={{ marginTop: '1rem', fontSize: '13px', color: selected.waiver_signed ? 'var(--moss-light)' : 'var(--rose-light)' }}>
            {selected.waiver_signed
              ? `✓ Waiver signed ${selected.waiver_signed_at ? new Date(selected.waiver_signed_at).toLocaleDateString() : ''}`
              : '⚠ Waiver not signed'}
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Events</h2>
        <button className="btn-ghost" style={{ fontSize: '11px' }} onClick={fetchRegistrations}>Refresh</button>
      </div>

      <p style={{ color: 'var(--charcoal-light)', fontSize: '14px', lineHeight: 1.6, marginTop: '-0.5rem', marginBottom: '1rem' }}>
        Supertotal registrations, payment status, and shirt order tracking.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', marginBottom: '1rem' }}>
        {[
          { label: 'Registered', value: stats.total },
          { label: 'Paid', value: stats.paid },
          { label: 'Pending', value: stats.pending },
          { label: 'Shirts', value: stats.shirts },
          { label: 'Ordered', value: stats.shirtsOrdered },
          { label: 'Need Order', value: stats.shirtsUnordered }
        ].map(s => (
          <div key={s.label} className="panel" style={{ padding: '12px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold-light)', fontSize: '22px' }}>{s.value}</div>
            <div style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--charcoal-light)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: '1rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold-light)', fontSize: '24px' }}>${stats.revenue}</div>
        <div style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--charcoal-light)' }}>Revenue Collected</div>
      </div>

      {Object.keys(shirtCounts).length > 0 && (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-title">Shirt Orders</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {Object.entries(shirtCounts).sort(([a], [b]) => shirtSort(a) - shirtSort(b)).map(([size, count]) => (
              <div key={size} style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '8px 10px', minWidth: '82px' }}>
                <div style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold-light)' }}>{size}: {count.total}</div>
                <div style={{ fontSize: '11px', color: 'var(--moss-light)' }}>✓ {count.ordered}</div>
                <div style={{ fontSize: '11px', color: count.unordered ? 'var(--rose-light)' : 'var(--charcoal-light)' }}>Need {count.unordered}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[
          ['all', 'All'],
          ['paid', 'Paid'],
          ['pending', 'Pending'],
          ['shirt', 'All Shirts'],
          ['shirt_unordered', 'Need Shirt Order'],
          ['shirt_ordered', 'Shirts Ordered']
        ].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} className={filter === val ? 'btn-sm' : 'btn-ghost'} style={{ fontSize: '11px' }}>
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="loading">Loading...</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty">
          <h3>No registrations here</h3>
          <p>{filter === 'all' ? 'Share the registration link to start collecting signups.' : 'Nothing matches this filter.'}</p>
          <p>sacredrebellion.fit/supertotal</p>
        </div>
      )}

      {!loading && filtered.map(r => (
        <div key={r.id} className="class-card" onClick={() => setSelected(r)} style={{ cursor: 'pointer' }}>
          <div className="class-card-header">
            <div>
              <div className="class-title">{r.first_name} {r.last_name}</div>
              <div style={{ fontSize: '12px', color: 'var(--charcoal-light)', marginTop: '4px' }}>{r.email}</div>
            </div>
            <div style={{ color: 'var(--charcoal-light)', fontSize: '20px' }}>›</div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px', color: 'var(--charcoal-light)' }}>
            <StatusPill good={r.payment_status === 'paid'} text={r.payment_status === 'paid' ? '✓ Paid' : '⚠ Pending'} />
            {r.include_shirt && <StatusPill good={r.shirt_ordered} text={`${r.shirt_size || 'Shirt'} ${r.shirt_ordered ? 'ordered' : 'needs order'}`} />}
            <span>{r.bodyweight_lbs} lbs BW</span>
          </div>
        </div>
      ))}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '14px' }}>
      <span style={{ color: 'var(--charcoal-light)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '11px' }}>{label}</span>
      <span style={{ color: 'var(--bone)', textAlign: 'right' }}>{value || '—'}</span>
    </div>
  )
}

function StatusPill({ good, text }) {
  return (
    <span style={{
      border: '1px solid',
      borderColor: good ? 'var(--moss)' : 'var(--gold-dark)',
      color: good ? 'var(--moss-light)' : 'var(--gold-light)',
      background: good ? 'rgba(107,115,85,0.12)' : 'rgba(200,169,106,0.08)',
      borderRadius: '999px',
      padding: '3px 8px',
      fontSize: '11px'
    }}>
      {text}
    </span>
  )
}

function shirtSort(size) {
  const order = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']
  const idx = order.indexOf(size)
  return idx === -1 ? 999 : idx
}
