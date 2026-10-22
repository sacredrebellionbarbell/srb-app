import React, { useMemo, useState } from 'react'
import { formatPrescriptionValue } from '../utils/prescriptionTypes'

function isMissValue(value) {
  return /\bmiss\b/i.test(value || '')
}

function displayValue(value) {
  return (value || '').replace(/\s+-\s+(Made|Miss)$/i, '')
}

function scorePlaceholder(scoreType) {
  if (scoreType === 'For Time') return 'e.g. 12:34'
  if (scoreType === 'Max Reps / Calories') return 'e.g. 45 reps'
  if (scoreType === 'Max Distance') return 'e.g. 500m'
  return 'Score'
}

export default function SectionLogModal({ section, workout, userId, onClose, onSave }) {
  const movements = useMemo(() => [...(section.movements || [])]
    .sort((a, b) => a.order_index - b.order_index)
    .map(movement => ({
      ...movement,
      sets: [...(movement.sets || [])].sort((a, b) => a.order_index - b.order_index)
    })), [section])
  const existingSectionLog = (section.section_logs || []).find(log => log.athlete_id === userId)
  const [rows, setRows] = useState(() => movements.flatMap(movement => movement.sets.map(set => {
    const existing = (set.set_logs || []).find(log => log.athlete_id === userId)
    return {
      movementId: movement.id,
      movementName: movement.name,
      scheme: movement.scheme,
      setId: set.id,
      setNumber: set.set_number,
      reps: set.reps || '',
      load: set.load || '',
      rpe: set.rpe || '',
      value: displayValue(existing?.value),
      made: !isMissValue(existing?.value)
    }
  })))
  const [score, setScore] = useState(existingSectionLog?.score || '')
  const [rounds, setRounds] = useState(existingSectionLog?.rounds == null ? '' : String(existingSectionLog.rounds))
  const [reps, setReps] = useState(existingSectionLog?.reps == null ? '' : String(existingSectionLog.reps))
  const [notes, setNotes] = useState(existingSectionLog?.notes || '')
  const [saving, setSaving] = useState(false)
  const scoreType = section.score_type || 'No Score'

  const updateRow = (setId, patch) => setRows(current => current.map(row => row.setId === setId ? { ...row, ...patch } : row))
  const copyDown = row => setRows(current => current.map(candidate =>
    candidate.movementId === row.movementId && candidate.setNumber > row.setNumber
      ? { ...candidate, value: row.value, made: row.made }
      : candidate
  ))

  const save = async () => {
    setSaving(true)
    const sectionLog = {
      score: scoreType === 'AMRAP' ? null : (score.trim() || null),
      rounds: scoreType === 'AMRAP' && rounds !== '' ? Number(rounds) : null,
      reps: scoreType === 'AMRAP' && reps !== '' ? Number(reps) : null,
      notes: notes.trim() || null
    }
    const ok = await onSave({ rows, sectionLog })
    if (!ok) setSaving(false)
  }

  return (
    <div className="modal-wrap" onClick={event => { if (event.target.className === 'modal-wrap') onClose() }}>
      <div className="modal section-log-modal">
        <div className="modal-head">
          <div>
            <div className="modal-title">Log {section.type}</div>
            <div className="modal-sub">{workout.title}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {section.notes && <p className="section-log-prescription">{section.notes}</p>}

          {movements.map(movement => {
            const movementRows = rows.filter(row => row.movementId === movement.id)
            return (
              <div key={movement.id} className="section-log-movement">
                <div className="section-log-movement-title">{movement.name}</div>
                {movement.notes && <div className="section-log-movement-notes">{movement.notes}</div>}
                {movementRows.length === 0 && <div className="section-log-empty">No individual sets to log.</div>}
                {movementRows.map((row, index) => (
                  <div key={row.setId} className="section-log-set">
                    <div className="section-log-set-label">
                      <strong>Set {row.setNumber}</strong>
                      <span>{[row.reps && formatPrescriptionValue(row.reps, row.scheme), row.load && `@ ${row.load}`, row.rpe && `RPE ${row.rpe}`].filter(Boolean).join(' · ')}</span>
                    </div>
                    <input
                      type="text"
                      value={row.value}
                      onChange={event => updateRow(row.setId, { value: event.target.value })}
                      placeholder="Weight / result"
                      autoFocus={index === 0 && movement === movements[0]}
                    />
                    <button className="copy-down" type="button" onClick={() => copyDown(row)} disabled={index === movementRows.length - 1 || !row.value.trim()} title="Copy to sets below">↓</button>
                    <div className="made-miss-control">
                      <button type="button" className={row.made ? 'made active' : 'made'} onClick={() => updateRow(row.setId, { made: true })}>Made</button>
                      <button type="button" className={!row.made ? 'miss active' : 'miss'} onClick={() => updateRow(row.setId, { made: false })}>Miss</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {scoreType !== 'No Score' && scoreType !== 'Heaviest Set' && (
            <div className="field section-score-field">
              <label>{scoreType === 'AMRAP' ? 'Score' : scoreType}</label>
              {scoreType === 'AMRAP' ? (
                <div className="section-score-pair">
                  <input type="number" min="0" value={rounds} onChange={event => setRounds(event.target.value)} placeholder="Rounds" />
                  <input type="number" min="0" value={reps} onChange={event => setReps(event.target.value)} placeholder="Extra reps" />
                </div>
              ) : (
                <input type="text" value={score} onChange={event => setScore(event.target.value)} placeholder={scorePlaceholder(scoreType)} />
              )}
            </div>
          )}

          <div className="field">
            <label>Notes / Scaling</label>
            <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Scaling, modifications, or how it felt..." />
          </div>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : `Save ${section.type}`}</button>
          <button className="btn-ghost" onClick={onClose} style={{ width: '100%', marginTop: '8px' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
