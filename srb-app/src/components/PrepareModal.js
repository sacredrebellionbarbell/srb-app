import React, { useState, useMemo, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const PCTS = [50, 60, 70, 80, 85, 90, 95]

function epley(w, r) { return r === 1 ? w : Math.round(w * (1 + r / 30)) }
function xWeight(s) { const m = (s || '').match(/(\d+\.?\d*)/); return m ? parseFloat(m[1]) : null }
function xReps(n) { const m = (n || '').match(/(\d+)\s*rep/i); return m ? parseInt(m[1]) : 1 }

export default function PrepareModal({ workout, movementNames, user, onClose }) {
  const [allResults, setAllResults] = useState([])
  const [mw, setMw] = useState('')
  const [mr, setMr] = useState('1')
  const [selectedMovement, setSelectedMovement] = useState(movementNames?.[0] || '')

  useEffect(() => {
    const fetch = async () => {
      // Get all athlete results with their workout's movement data
      const { data } = await supabase
        .from('results')
        .select(`
          score, note, created_at,
          workouts(title, date, workout_sections(type, movements(name)))
        `)
        .eq('athlete_id', user.id)
        .order('created_at', { ascending: false })
      setAllResults(data || [])
    }
    fetch()
  }, [user])

  // Filter results to only those where the workout contained the selected movement
  const matchingResults = useMemo(() => {
    if (!selectedMovement) return []
    return allResults.filter(r => {
      const movements = (r.workouts?.workout_sections || [])
        .flatMap(s => s.movements || [])
        .map(m => m.name?.toLowerCase())
      return movements.includes(selectedMovement.toLowerCase())
    }).filter(r => xWeight(r.score) !== null)
  }, [allResults, selectedMovement])

  const est = useMemo(() => {
    if (mw && parseFloat(mw) > 0) return epley(parseFloat(mw), parseInt(mr) || 1)
    if (!matchingResults.length) return null
    let best = 0
    matchingResults.forEach(r => {
      const e = epley(xWeight(r.score), xReps(r.note))
      if (e > best) best = e
    })
    return best > 0 ? best : null
  }, [mw, mr, matchingResults])

  return (
    <div className="modal-wrap" onClick={e => { if (e.target.className === 'modal-wrap') onClose() }}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <div className="modal-title">Prepare</div>
            <div className="modal-sub">{workout.title}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">

          {/* Movement selector */}
          {movementNames?.length > 0 && (
            <div className="field" style={{ marginBottom: '1.25rem' }}>
              <label>Movement</label>
              <select value={selectedMovement} onChange={e => { setSelectedMovement(e.target.value); setMw(''); setMr('1') }}>
                {movementNames.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {/* Manual override */}
          <div className="manual-row">
            <div className="field">
              <label>Weight (lbs)</label>
              <input type="number" value={mw} onChange={e => setMw(e.target.value)} placeholder="Optional override" />
            </div>
            <div className="field">
              <label>Reps performed</label>
              <input type="number" min="1" max="30" value={mr} onChange={e => setMr(e.target.value)} />
            </div>
          </div>

          {/* 1RM estimate */}
          {est
            ? <>
                <div className="est-box">
                  <div className="est-label">Estimated 1RM — {selectedMovement}</div>
                  <div className="est-val">{est} lbs</div>
                  <div className="est-sub">Epley formula · use as a guide, not gospel</div>
                </div>
                <div className="pct-grid">
                  {PCTS.map(p => (
                    <div key={p} className="pct-card">
                      <div className="pct-pct">{p}%</div>
                      <div className="pct-val">{Math.round(est * (p / 100))} lbs</div>
                    </div>
                  ))}
                </div>
              </>
            : <div className="est-box">
                <div className="est-label">No history found for {selectedMovement}</div>
                <div style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginTop: '6px' }}>
                  Enter a weight and rep count above to estimate your 1RM, or log this movement to build history.
                </div>
              </div>
          }

          {/* Past results for this movement */}
          <div className="past-title">Past results — {selectedMovement}</div>
          {matchingResults.length === 0
            ? <p style={{ fontSize: '13px', color: 'var(--charcoal-light)' }}>No results logged for this movement yet.</p>
            : matchingResults.map((r, i) => (
              <div key={i} className="past-row">
                <span style={{ flex: 1, color: 'var(--bone)', fontSize: '13px' }}>{r.workouts?.title}</span>
                <span style={{ color: 'var(--gold-light)', fontFamily: 'Cinzel, serif', fontSize: '13px' }}>{r.score}</span>
                {r.note && <span style={{ fontSize: '11px', color: 'var(--moss-light)' }}>{r.note}</span>}
                <span style={{ fontSize: '11px', color: 'var(--charcoal-light)' }}>{r.workouts?.date}</span>
              </div>
            ))
          }
          <div className="formula">Epley: 1RM = weight × (1 + reps ÷ 30)</div>
        </div>
      </div>
    </div>
  )
}
