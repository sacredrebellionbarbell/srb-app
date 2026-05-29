import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function Leads() {
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    supabase.from('event_registrations')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setRegistrations(data || []); setLoading(false) })
  }, [])

  const filtered = registrations.filter(r => {
    if (filter === 'paid') return r.payment_status === 'paid'
    if (filter === 'pending') return r.payment_status === 'pending'
    if (filter === 'shirt') return r.include_shirt
    return true
  })

  const stats = {
    total: registrations.length,
    paid: registrations.filter(r => r.payment_status === 'paid').length,
    pending: registrations.filter(r => r.payment_status === 'pending').length,
    shirts: registrations.filter(r => r.include_shirt).length,
    revenue: registrations.filter(r => r.payment_status === 'paid').reduce((sum, r) => sum + (r.include_shirt ? 75 : 45), 0)
  }

  const shirtCounts = registrations.filter(r => r.include_shirt && r.shirt_size).reduce((acc, r) => {
    acc[r.shirt_size] = (acc[r.shirt_size] || 0) + 1
    return acc
  }, {})

  if (selected) {
    return (
      <div>
        <button className="btn-ghost" onClick={() => setSelected(null)} style={{ marginBottom: '1.5rem' }}>← Back to Leads</button>
        <div className="panel">
          <div className="panel-title">{selected.first_name} {selected.last_name}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px', marginBottom: '1rem' }}>
            <div><span style={{ color: 'var(--charcoal-light)', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' }}>Email</span><br />{selected.email}</div>
            <div><span style={{ color: 'var(--charcoal-light)', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' }}>Phone</span><br />{selected.phone}</div>
            <div><span style={{ color: 'var(--charcoal-light)', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' }}>Bodyweight</span><br />{selected.bodyweight_lbs} lbs</div>
            <div><span style={{ color: 'var(--charcoal-light)', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' }}>Payment</span><br />
              <span style={{ color: selected.payment_status === 'paid' ? 'var(--moss-light)' : 'var(--rose)' }}>
                {selected.payment_status === 'paid' ? '✓ Paid' : '⚠ Pending'} — {selected.include_shirt ? '$75' : '$45'}
              </span>
            </div>
            {selected.include_shirt && (
              <div><span style={{ color: 'var(--charcoal-light)', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' }}>Shirt Size</span><br />{selected.shirt_size}</div>
            )}
            <div><span style={{ color: 'var(--charcoal-light)', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' }}>Registered</span><br />{new Date(selected.created_at).toLocaleDateString()}</div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1rem' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '12px', letterSpacing: '2px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '10px' }}>Opening Attempts</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px' }}>
              <div><span style={{ color: 'var(--charcoal-light)', fontSize: '11px' }}>Snatch</span><br />{selected.snatch_opener_lbs} lbs</div>
              <div><span style={{ color: 'var(--charcoal-light)', fontSize: '11px' }}>Clean & Jerk</span><br />{selected.clean_jerk_opener_lbs} lbs</div>
              <div><span style={{ color: 'var(--charcoal-light)', fontSize: '11px' }}>Back Squat</span><br />{selected.squat_opener_lbs} lbs</div>
              <div><span style={{ color: 'var(--charcoal-light)', fontSize: '11px' }}>Bench Press</span><br />{selected.bench_opener_lbs} lbs</div>
              <div><span style={{ color: 'var(--charcoal-light)', fontSize: '11px' }}>Deadlift</span><br />{selected.deadlift_opener_lbs} lbs</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1rem' }}>
            <div style={{ fontSize: '12px', color: selected.waiver_signed ? 'var(--moss-light)' : 'var(--rose)' }}>
              {selected.waiver_signed ? `✓ Waiver signed ${new Date(selected.waiver_signed_at).toLocaleDateString()}` : '⚠ Waiver not signed'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Leads</h2>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
        {[
          { label: 'Registered', value: stats.total },
          { label: 'Paid', value: stats.paid },
          { label: 'Shirts', value: stats.shirts },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Cinzel, serif', fontSize: '22px', color: 'var(--gold-light)' }}>{s.value}</div>
            <div style={{ fontSize: '10px', letterSpacing: '2px', color: 'var(--charcoal-light)', textTransform: 'uppercase', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px', marginBottom: '1.5rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '20px', color: 'var(--moss-light)' }}>${stats.revenue}</div>
        <div style={{ fontSize: '10px', letterSpacing: '2px', color: 'var(--charcoal-light)', textTransform: 'uppercase', marginTop: '4px' }}>Revenue Collected</div>
      </div>

      {/* Shirt breakdown */}
      {Object.keys(shirtCounts).length > 0 && (
        <div style={{ background: 'rgba(245,240,232,0.03)', border: '1px solid var(--border)', borderRadius: '4px', padding: '12px', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '11px', letterSpacing: '2px', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '10px' }}>Shirt Orders</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {Object.entries(shirtCounts).sort().map(([size, count]) => (
              <div key={size} style={{ background: 'rgba(200,169,106,0.1)', border: '1px solid var(--gold-dark)', borderRadius: '2px', padding: '4px 10px', fontSize: '13px', color: 'var(--bone)' }}>
                {size}: {count}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[['all', 'All'], ['paid', 'Paid'], ['pending', 'Pending'], ['shirt', 'Shirt Orders']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            className={filter === val ? 'btn-sm' : 'btn-ghost'}
            style={{ fontSize: '11px' }}>{label}</button>
        ))}
      </div>

      {loading && <div className="loading">Loading...</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty">
          <h3>No registrations yet</h3>
          <p>Share the registration link to start collecting signups.</p>
          <div style={{ marginTop: '1rem', background: 'rgba(245,240,232,0.04)', border: '1px solid var(--border)', borderRadius: '4px', padding: '10px 14px', fontSize: '13px', color: 'var(--gold-light)', wordBreak: 'break-all' }}>
            sacredrebellion.fit/supertotal
          </div>
        </div>
      )}

      {filtered.map(r => (
        <div key={r.id} className="class-card" style={{ cursor: 'pointer', marginBottom: '8px' }} onClick={() => setSelected(r)}>
          <div className="class-card-header">
            <div>
              <div className="class-title">{r.first_name} {r.last_name}</div>
              <div style={{ fontSize: '12px', color: 'var(--charcoal-light)', marginTop: '4px' }}>{r.email}</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: r.payment_status === 'paid' ? 'var(--moss-light)' : 'var(--rose)', letterSpacing: '1px' }}>
                  {r.payment_status === 'paid' ? '✓ Paid' : '⚠ Pending'}
                </span>
                {r.include_shirt && <span style={{ fontSize: '11px', color: 'var(--gold-dark)', letterSpacing: '1px' }}>👕 {r.shirt_size}</span>}
                <span style={{ fontSize: '11px', color: 'var(--charcoal-light)' }}>{r.bodyweight_lbs} lbs BW</span>
              </div>
            </div>
            <span style={{ color: 'var(--charcoal-light)', fontSize: '18px' }}>›</span>
          </div>
        </div>
      ))}
    </div>
  )
}
