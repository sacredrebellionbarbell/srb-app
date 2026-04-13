import React, { useState, useMemo, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const PCTS = [50, 60, 70, 80, 85, 90, 95]

function epley(w, r) { return r === 1 ? w : Math.round(w * (1 + r / 30)) }
function xWeight(s) { const m = (s || '').match(/(\d+\.?\d*)/); return m ? parseFloat(m[1]) : null }
function xReps(n) { const m = (n || '').match(/(\d+)\s*rep/i); return m ? parseInt(m[1]) : 1 }

function parseLoad(load) {
  if (!load) return null
  const rangeMatch = load.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)\s*%/)
  if (rangeMatch) return { type: 'pct_range', low: parseFloat(rangeMatch[1]), high: parseFloat(rangeMatch[2]) }
  const pctMatch = load.match(/(\d+\.?\d*)\s*%/)
  if (pctMatch) return { type: 'pct', value: parseFloat(pctMatch[1]) }
  const lbsRangeMatch = load.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)\s*(lbs?|kg)?/)
  if (lbsRangeMatch) return { type: 'lbs_range', low: parseFloat(lbsRangeMatch[1]), high: parseFloat(lbsRangeMatch[2]) }
  const lbsMatch = load.match(/(\d+\.?\d*)\s*(lbs?|kg)?/)
  if (lbsMatch) return { type: 'lbs', value: parseFloat(lbsMatch[1]) }
  return null
}

function calcWeight(parsedLoad, oneRM) {
  if (!parsedLoad || !oneRM) return null
  if (parsedLoad.type === 'pct') return { single: Math.round(oneRM * parsedLoad.value / 100) }
  if (parsedLoad.type === 'pct_range') return { low: Math.round(oneRM * parsedLoad.low / 100), high: Math.round(oneRM * parsedLoad.high / 100) }
  if (parsedLoad.type === 'lbs') return { single: parsedLoad.value }
  if (parsedLoad.type === 'lbs_range') return { low: parsedLoad.low, high: parsedLoad.high }
  return null
}

function formatWeight(w) {
  if (!w) return null
  if (w.single !== undefined) return `${w.single} lbs`
  if (w.low !== undefined) return `${w.low}–${w.high} lbs`
  return null
}

export default function PrepareModal({ workout, movements, user, onClose }) {
  const [allResults, setAllResults] = useState([])
  const [mw, setMw] = useState('')
  const [mr, setMr] = useState('1')
  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('results')
        .select('score, note, workouts(title, date, workout_sections(type, movements(name)))')
        .eq('athlete_id', user.id)
        .order('created_at', { ascending: false })
      setAllResults((data || []).filter(r => xWeight(r.score) !== null))
    }
    fetch()
  }, [user])

  const selectedMovement = movements?.[selectedIdx]
  const selectedName = selectedMovement?.name || ''
  const selectedSets = selectedMovement?.sets || []

  const matchingResults = useMemo(() => {
    if (!selectedName) return []
    return allResults.filter(r => {
      const mvNames = (r.workouts?.workout_sections || []).flatMap(s => s.movements || []).map(m => m.name?.toLowerCase())
      return mvNames.includes(selectedName.toLowerCase())
    })
  }, [allResults, selectedName])

  const oneRM = useMemo(() => {
    if (mw && parseFloat(mw) > 0) return epley(parseFloat(mw), parseInt(mr) || 1)
    if (!matchingResults.length) return null
    let best = 0
    matchingResults.forEach(r => { const e = epley(xWeight(r.score), xReps(r.note)); if (e > best) best = e })
    return best > 0 ? best : null
  }, [mw, mr, matchingResults])

  const hasPctSets = selectedSets.some(st => st.load && st.load.includes('%'))

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

          {movements?.length > 0 && (
            <div className="field" style={{ marginBottom: '1.25rem' }}>
              <label>Movement</label>
              <select value={selectedIdx} onChange={e => { setSelectedIdx(parseInt(e.target.value)); setMw(''); setMr('1') }}>
                {movements.map((m, i) => <option key={i} value={i}>{m.name}</option>)}
              </select>
            </div>
          )}

          <div className="manual-row">
            <div className="field">
              <label>Your weight (lbs)</label>
              <input type="number" value={mw} onChange={e => setMw(e.target.value)} placeholder="Override 1RM calc" />
            </div>
            <div className="field">
              <label>Reps performed</label>
              <input type="number" min="1" max="30" value={mr} onChange={e => setMr(e.target.value)} />
            </div>
          </div>

          {oneRM
            ? <div className="est-box">
                <div className="est-label">Estimated 1RM — {selectedName}</div>
                <div className="est-val">{oneRM} lbs</div>
                <div className="est-sub">Epley formula · use as a guide, not gospel</div>
              </div>
            : <div className="est-box">
                <div className="est-label">No history for {selectedName}</div>
                <div style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginTop: '6px' }}>Enter a weight and reps above to calculate</div>
              </div>
          }

          {selectedSets.length > 0 && (
            <div className="todays-sets">
              <div className="todays-sets-title">Today's Sets — {selectedName}</div>
              {selectedSets.map((st, i) => {
                const parsed = parseLoad(st.load)
                const calc = oneRM ? calcWeight(parsed, oneRM) : null
                return (
                  <div key={i} className="todays-set-row">
                    <span className="todays-set-label">Set {st.set_number}</span>
                    <span className="todays-set-reps">{st.reps} {parseInt(st.reps) === 1 ? 'rep' : 'reps'}</span>
                    <span className="todays-set-load">{st.load || '—'}</span>
                    {st.rpe && <span style={{ fontSize: '12px', color: 'var(--moss-light)' }}>RPE {st.rpe}</span>}
                    {calc && <span className="todays-set-weight">{formatWeight(calc)}</span>}
                  </div>
                )
              })}
              {oneRM && hasPctSets && (
                <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(200,169,106,0.06)', borderRadius: '2px', fontSize: '13px', color: 'var(--charcoal-light)', fontStyle: 'italic' }}>
                  Weights calculated from your estimated {oneRM} lb 1RM
                </div>
              )}
            </div>
          )}

          {selectedSets.length === 0 && oneRM && (
            <>
              <div className="past-title">Reference Percentages</div>
              <div className="pct-grid">
                {PCTS.map(p => (
                  <div key={p} className="pct-card">
                    <div className="pct-pct">{p}%</div>
                    <div className="pct-val">{Math.round(oneRM * p / 100)} lbs</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="past-title">Past Results — {selectedName}</div>
          {matchingResults.length === 0
            ? <p style={{ fontSize: '13px', color: 'var(--charcoal-light)' }}>No results logged for this movement yet.</p>
            : matchingResults.slice(0, 6).map((r, i) => (
              <div key={i} className="past-row">
                <span style={{ flex: 1, color: 'var(--bone)', fontSize: '14px' }}>{r.workouts?.title}</span>
                <span style={{ color: 'var(--gold-light)', fontFamily: 'Cinzel, serif', fontSize: '14px' }}>{r.score}</span>
                {r.note && <span style={{ fontSize: '12px', color: 'var(--moss-light)' }}>{r.note}</span>}
                <span style={{ fontSize: '12px', color: 'var(--charcoal-light)' }}>{r.workouts?.date}</span>
              </div>
            ))
          }
          <div className="formula">Epley: 1RM = weight × (1 + reps ÷ 30)</div>
        </div>
      </div>
    </div>
  )
}
