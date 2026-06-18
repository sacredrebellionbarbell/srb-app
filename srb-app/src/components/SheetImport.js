import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

const TRACKS = ['Babes Who Fight Bears', 'Strong & Savage', 'Olympic Weightlifting', 'Private']
const STYPES = ['Warm-Up', 'Strength', 'Accessory', 'Conditioning', 'Core', 'Cooldown', 'Skills', 'Custom']
const SCORE_TYPES = ['No Score', 'Heaviest Set', 'For Time', 'AMRAP', 'Max Reps / Calories', 'Max Distance']

const TEMPLATE = `date,track,title,workout_notes,section_type,score_type,section_notes,movement,movement_notes,set_count,reps,load,rpe,demo_url
2026-07-06,Strong & Savage,Back Squat Day,,Strength,Heaviest Set,,Back Squat,,4,3,80%,8,
2026-07-06,Strong & Savage,Back Squat Day,,Accessory,No Score,3 Rounds,Split Squat,,3,10/side,,,
2026-07-07,Babes Who Fight Bears,Conditioning,,Conditioning,For Time,,Bike Calories,,1,50,,,`

function clean(value) {
  return String(value || '').trim()
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function pick(row, names) {
  for (const name of names) {
    const value = row[normalize(name)]
    if (value != null && clean(value) !== '') return clean(value)
  }
  return ''
}

function parseDelimited(text) {
  const delimiter = text.includes('\t') ? '\t' : ','
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && quoted && next === '"') {
      cell += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell)
      if (row.some(v => clean(v))) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  if (row.some(v => clean(v))) rows.push(row)
  return rows
}

function parseRows(text) {
  const table = parseDelimited(text)
  if (table.length < 2) return []

  const headers = table[0].map(normalize)
  return table.slice(1).map(values => {
    const row = {}
    headers.forEach((header, index) => { row[header] = clean(values[index]) })
    return row
  })
}

function validOption(value, options, fallback) {
  const match = options.find(option => option.toLowerCase() === clean(value).toLowerCase())
  return match || fallback
}

function parseSetPlan(row) {
  const setNumber = pick(row, ['set_number', 'set'])
  const setCountRaw = pick(row, ['set_count', 'sets', 'number_of_sets'])
  let reps = pick(row, ['reps', 'rep_scheme'])
  const load = pick(row, ['load', 'weight', 'percent', 'percentage'])
  const rpe = pick(row, ['rpe'])

  if (!setNumber && !setCountRaw && !reps && !load && !rpe) return []

  const scheme = reps || setCountRaw
  const schemeMatch = scheme.match(/^(\d+)\s*x\s*(.+)$/i)
  if (schemeMatch && !setNumber) {
    const count = parseInt(schemeMatch[1], 10)
    reps = reps === scheme ? schemeMatch[2] : reps
    return Array.from({ length: count }, (_, index) => ({
      set_number: index + 1,
      reps,
      load,
      rpe,
      order_index: index
    }))
  }

  if (setNumber) {
    const num = parseInt(setNumber, 10)
    return [{ set_number: Number.isNaN(num) ? 1 : num, reps, load, rpe, order_index: 0 }]
  }

  const count = parseInt(setCountRaw, 10)
  const safeCount = Number.isNaN(count) || count < 1 ? 1 : Math.min(count, 20)
  return Array.from({ length: safeCount }, (_, index) => ({
    set_number: index + 1,
    reps,
    load,
    rpe,
    order_index: index
  }))
}

function buildWorkouts(rows, members) {
  const memberByEmail = new Map(members.map(member => [clean(member.email).toLowerCase(), member]))
  const memberByName = new Map(members.map(member => [clean(member.name).toLowerCase(), member]))
  const workouts = []
  const workoutMap = new Map()

  rows.forEach((row, rowIndex) => {
    const date = pick(row, ['date', 'workout_date'])
    const title = pick(row, ['title', 'workout', 'workout_title']) || `Workout ${rowIndex + 1}`
    const rawTrack = pick(row, ['track', 'membership_track']) || TRACKS[0]
    const athleteEmail = pick(row, ['athlete_email', 'client_email'])
    const athleteName = pick(row, ['athlete_name', 'client_name'])
    const athlete = athleteEmail
      ? memberByEmail.get(athleteEmail.toLowerCase())
      : athleteName
        ? memberByName.get(athleteName.toLowerCase())
        : null
    const track = athlete ? 'Private' : validOption(rawTrack, TRACKS, TRACKS[0])
    const workoutKey = [date, track, title, athlete?.id || 'public'].join('|')

    if (!workoutMap.has(workoutKey)) {
      const workout = {
        title,
        date,
        track,
        notes: pick(row, ['workout_notes', 'notes']),
        assigned_athlete_id: athlete?.id || null,
        sections: [],
        sectionMap: new Map()
      }
      workoutMap.set(workoutKey, workout)
      workouts.push(workout)
    }

    const workout = workoutMap.get(workoutKey)
    if (!workout.notes) workout.notes = pick(row, ['workout_notes', 'notes'])

    const sectionType = validOption(pick(row, ['section_type', 'section']) || 'Strength', STYPES, 'Strength')
    const scoreType = validOption(pick(row, ['score_type', 'score']) || 'No Score', SCORE_TYPES, 'No Score')
    const sectionNotes = pick(row, ['section_notes'])
    const sectionKey = [sectionType, scoreType, sectionNotes].join('|')

    let section = workout.sectionMap.get(sectionKey)
    if (!section) {
      section = {
        type: sectionType,
        score_type: scoreType,
        notes: sectionNotes,
        movements: [],
        movementMap: new Map()
      }
      workout.sectionMap.set(sectionKey, section)
      workout.sections.push(section)
    }

    const movementName = pick(row, ['movement', 'movement_name', 'exercise'])
    if (!movementName) return

    const movementKey = [movementName, pick(row, ['movement_notes']), pick(row, ['demo_url'])].join('|')
    let movement = section.movementMap.get(movementKey)
    if (!movement) {
      movement = {
        name: movementName,
        notes: pick(row, ['movement_notes']),
        demo_url: pick(row, ['demo_url']),
        sets: []
      }
      section.movementMap.set(movementKey, movement)
      section.movements.push(movement)
    }

    const nextSets = parseSetPlan(row)
    movement.sets.push(...nextSets.map((set, index) => ({
      ...set,
      order_index: movement.sets.length + index
    })))
  })

  return workouts.map(workout => ({
    ...workout,
    sections: workout.sections.map(section => ({
      ...section,
      movements: section.movements.map(movement => ({
        ...movement,
        sets: movement.sets.map((set, index) => ({ ...set, set_number: set.set_number || index + 1, order_index: index }))
      }))
    }))
  }))
}

export default function SheetImport() {
  const [rawText, setRawText] = useState(TEMPLATE)
  const [members, setMembers] = useState([])
  const [posting, setPosting] = useState(false)
  const [toast, setToast] = useState(null)
  const [errors, setErrors] = useState([])

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  useEffect(() => {
    supabase.from('profiles').select('id, name, email').order('name').then(({ data }) => setMembers(data || []))
  }, [])

  const parsedRows = useMemo(() => parseRows(rawText), [rawText])
  const workouts = useMemo(() => buildWorkouts(parsedRows, members), [parsedRows, members])

  const loadFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setRawText(await file.text())
  }

  const validate = () => {
    const nextErrors = []
    workouts.forEach((workout, index) => {
      if (!workout.date) nextErrors.push(`Workout ${index + 1} is missing a date.`)
      if (!workout.sections.some(section => section.movements.length)) nextErrors.push(`${workout.title} has no movements.`)
    })
    setErrors(nextErrors)
    return nextErrors.length === 0
  }

  const postImport = async () => {
    if (!validate()) return
    setPosting(true)

    for (const workout of workouts) {
      const { data: createdWorkout, error: workoutError } = await supabase
        .from('workouts')
        .insert({
          title: workout.title,
          track: workout.track,
          date: workout.date,
          notes: workout.notes,
          assigned_athlete_id: workout.assigned_athlete_id
        })
        .select()
        .single()

      if (workoutError) {
        setPosting(false)
        showToast('Error: ' + workoutError.message)
        return
      }

      for (let sectionIndex = 0; sectionIndex < workout.sections.length; sectionIndex++) {
        const section = workout.sections[sectionIndex]
        const { data: createdSection } = await supabase
          .from('workout_sections')
          .insert({
            workout_id: createdWorkout.id,
            type: section.type,
            score_type: section.score_type,
            notes: section.notes,
            order_index: sectionIndex
          })
          .select()
          .single()

        if (!createdSection) continue

        for (let movementIndex = 0; movementIndex < section.movements.length; movementIndex++) {
          const movement = section.movements[movementIndex]
          const { data: createdMovement } = await supabase
            .from('movements')
            .insert({
              section_id: createdSection.id,
              name: movement.name,
              notes: movement.notes,
              demo_url: movement.demo_url || null,
              scheme: '',
              order_index: movementIndex
            })
            .select()
            .single()

          if (!createdMovement || !movement.sets.length) continue

          await supabase.from('sets').insert(
            movement.sets.map((set, setIndex) => ({
              movement_id: createdMovement.id,
              set_number: set.set_number || setIndex + 1,
              reps: set.reps,
              load: set.load,
              rpe: set.rpe,
              order_index: setIndex
            }))
          )
        }
      }
    }

    setPosting(false)
    showToast(`Imported ${workouts.length} workout${workouts.length === 1 ? '' : 's'}`)
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Import Sheet</h2>
      </div>

      <div className="panel">
        <div className="panel-title">Google Sheets Import</div>
        <p style={{ fontSize: '14px', color: 'var(--charcoal-light)', lineHeight: 1.7, marginBottom: '1rem' }}>
          Paste rows from Google Sheets, or export as CSV/TSV and upload here. Each row becomes a movement or set plan, grouped by date, track, title, and athlete.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <label className="btn-sm" style={{ display: 'inline-block' }}>
            Choose CSV
            <input type="file" accept=".csv,.tsv,.txt" onChange={loadFile} style={{ display: 'none' }} />
          </label>
          <button className="btn-ghost" onClick={() => setRawText(TEMPLATE)}>Load Template</button>
          <button className="btn-ghost" onClick={() => setRawText('')}>Clear</button>
        </div>

        <div className="field">
          <label>Sheet Data</label>
          <textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            style={{ minHeight: '220px', fontFamily: 'monospace', fontSize: '13px' }}
          />
        </div>
      </div>

      {errors.length > 0 && (
        <div className="panel" style={{ borderColor: 'var(--rose)' }}>
          <div className="panel-title">Fix Before Import</div>
          {errors.map((error, index) => (
            <div key={index} style={{ fontSize: '14px', color: 'var(--rose-light)', marginBottom: '6px' }}>{error}</div>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="panel-title">Preview</div>
        {workouts.length === 0 ? (
          <p className="no-data">No workouts found yet.</p>
        ) : (
          <>
            <div style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginBottom: '1rem' }}>
              {workouts.length} workout{workouts.length === 1 ? '' : 's'} ready to import.
            </div>
            {workouts.slice(0, 12).map((workout, index) => (
              <div key={index} className="workout-card">
                <div className="workout-header" style={{ cursor: 'default' }}>
                  <div>
                    <div className="workout-title">{workout.title}</div>
                    <div className="workout-meta">
                      <span className={`track-badge ${workout.track === 'Private' ? 'track-bears' : 'track-open'}`}>{workout.track}</span>
                      <span className="future-badge">{workout.date || 'No date'}</span>
                    </div>
                  </div>
                </div>
                <div className="workout-body">
                  {workout.sections.map((section, sectionIndex) => (
                    <div key={sectionIndex} className="section-block">
                      <div className="section-block-title">{section.type} · {section.score_type}</div>
                      {section.movements.map((movement, movementIndex) => (
                        <div key={movementIndex} className="movement-block">
                          <div className="movement-block-name">{movement.name}</div>
                          <div style={{ fontSize: '13px', color: 'var(--charcoal-light)' }}>
                            {movement.sets.length} set{movement.sets.length === 1 ? '' : 's'}
                            {movement.sets[0]?.reps ? ` · ${movement.sets[0].reps} reps` : ''}
                            {movement.sets[0]?.load ? ` · ${movement.sets[0].load}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {workouts.length > 12 && (
              <p style={{ fontSize: '13px', color: 'var(--charcoal-light)', marginBottom: '1rem' }}>
                Showing first 12 workouts.
              </p>
            )}
            <button className="btn-primary" onClick={postImport} disabled={posting}>
              {posting ? 'Importing...' : `Import ${workouts.length} Workout${workouts.length === 1 ? '' : 's'}`}
            </button>
          </>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
