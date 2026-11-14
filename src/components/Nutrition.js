import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { isPaidMember } from '../utils/access'
import { notifyCoach } from '../utils/notifyCoach'

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']
const EMPTY_TARGET = { calorie_target: 0, protein_target: 0, carb_target: 0, fat_target: 0 }
const EMPTY_FOOD = { food_name: '', serving_amount: 1, serving_unit: 'serving', calories: 0, protein: 0, carbs: 0, fat: 0, meal: 'Meal', source: 'manual', notes: '' }

function localISO(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftISO(iso, days) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, month - 1, day + days, 12)
  return localISO(date)
}

function dateLabel(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

function num(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
}

function rounded(value) {
  return Math.round(num(value))
}

function oneDecimal(value) {
  return Math.round(num(value) * 10) / 10
}

function foodDraft(food = {}) {
  return {
    ...EMPTY_FOOD,
    ...food,
    food_name: food.food_name || food.name || '',
    serving_amount: food.serving_amount ?? food.amount ?? 1,
    serving_unit: food.serving_unit || food.unit || 'serving',
    calories: rounded(food.calories),
    protein: oneDecimal(food.protein),
    carbs: oneDecimal(food.carbs),
    fat: oneDecimal(food.fat),
    confidence: food.confidence == null ? null : num(food.confidence),
    notes: food.notes || food.note || '',
    source_id: food.source_id || food.id || null
  }
}

function combineMatchingFoods(foods = []) {
  const combined = []
  foods.map(foodDraft).forEach(food => {
    const name = food.food_name.trim().toLowerCase().replace(/\s+/g, ' ')
    const unit = food.serving_unit.trim().toLowerCase().replace(/\s+/g, ' ')
    const existing = combined.find(item => item.key === `${name}|${unit}`)
    if (!existing) {
      combined.push({ key: `${name}|${unit}`, food: { ...food } })
      return
    }
    const notes = [...new Set([existing.food.notes, food.notes].filter(Boolean))]
    existing.food = {
      ...existing.food,
      serving_amount: num(existing.food.serving_amount) + num(food.serving_amount),
      calories: rounded(num(existing.food.calories) + num(food.calories)),
      protein: rounded(num(existing.food.protein) + num(food.protein)),
      carbs: rounded(num(existing.food.carbs) + num(food.carbs)),
      fat: rounded(num(existing.food.fat) + num(food.fat)),
      confidence: Math.min(num(existing.food.confidence), num(food.confidence)),
      notes: notes.join(' ')
    }
  })
  return combined.map(item => item.food)
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token || ''}` }
}

async function imageToJpeg(file) {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
    const max = 1600
    const scale = Math.min(1, max / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82).split(',')[1]
  } finally {
    URL.revokeObjectURL(url)
  }
}

function GoalBar({ label, consumed, target, unit = 'g' }) {
  const percent = target > 0 ? Math.min((consumed / target) * 100, 100) : 0
  const remaining = Math.max(target - consumed, 0)
  return (
    <div className="nutrition-goal">
      <div className="nutrition-goal-head">
        <strong>{label}</strong>
        <span>{target > 0 ? `${rounded(remaining)} ${unit} left` : 'No target'}</span>
      </div>
      <div className="nutrition-progress"><span style={{ width: `${percent}%` }} /></div>
      <small>{rounded(consumed)} of {rounded(target)} {unit}</small>
    </div>
  )
}

function ConfirmationModal({ foods, setFoods, onClose, onSave, saving }) {
  const [extraOptions, setExtraOptions] = useState([])
  const [extrasOpen, setExtrasOpen] = useState(false)
  const [extrasLoading, setExtrasLoading] = useState(false)
  const [extrasError, setExtrasError] = useState('')
  const update = (index, field, value) => setFoods(current => current.map((food, i) => i === index ? { ...food, [field]: value } : food))
  const updateAmount = (index, value) => setFoods(current => current.map((food, i) => {
    if (i !== index) return food
    const previous = num(food.serving_amount)
    const next = num(value)
    if (!previous || !next) return { ...food, serving_amount: value }
    const ratio = next / previous
    return {
      ...food,
      serving_amount: value,
      calories: Math.round(num(food.calories) * ratio * 10) / 10,
      protein: Math.round(num(food.protein) * ratio * 10) / 10,
      carbs: Math.round(num(food.carbs) * ratio * 10) / 10,
      fat: Math.round(num(food.fat) * ratio * 10) / 10
    }
  }))
  const remove = index => setFoods(current => current.filter((_, i) => i !== index))
  const openExtras = async () => {
    setExtrasOpen(true)
    if (extraOptions.length || extrasLoading) return
    setExtrasLoading(true); setExtrasError('')
    try {
      const headers = await authHeaders()
      const response = await fetch('/api/food-lookup?extras=cooking-fats', { headers })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load oil and butter choices.')
      setExtraOptions(data.foods || [])
    } catch (error) {
      setExtrasError(error.message)
    } finally {
      setExtrasLoading(false)
    }
  }
  const addExtra = optionIndex => {
    if (optionIndex === '') return
    const extra = extraOptions[Number(optionIndex)]
    if (!extra) return
    setFoods(current => [...current, foodDraft({
      ...extra,
      food_name: extra.name,
      source: 'search',
      source_id: extra.id,
      notes: `USDA FoodData Central · ${extra.servingLabel}`,
      meal: current[0]?.meal || 'Meal'
    })])
    setExtrasOpen(false)
  }
  const totals = foods.reduce((sum, food) => ({ calories: sum.calories + num(food.calories), protein: sum.protein + num(food.protein), carbs: sum.carbs + num(food.carbs), fat: sum.fat + num(food.fat) }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

  return (
    <div className="modal-wrap" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="modal nutrition-confirm-modal">
        <div className="modal-head">
          <div><div className="modal-title">Confirm Food</div><div className="modal-sub">Review the estimate before it changes your daily totals.</div></div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {foods.map((food, index) => (
            <div className="nutrition-confirm-food" key={`${index}-${food.source_id || ''}`}>
              <div className="nutrition-confirm-top">
                <input aria-label="Food name" value={food.food_name} onChange={event => update(index, 'food_name', event.target.value)} />
                <button className="btn-rm" onClick={() => remove(index)} aria-label="Remove food">×</button>
              </div>
              <div className="nutrition-fields nutrition-serving-fields">
                <label>Amount<input type="number" min="0" step="0.1" value={food.serving_amount} onChange={event => updateAmount(index, event.target.value)} /></label>
                <label>Unit<input value={food.serving_unit} onChange={event => update(index, 'serving_unit', event.target.value)} /></label>
                <label>Meal<select value={food.meal} onChange={event => update(index, 'meal', event.target.value)}><option>Meal</option>{MEALS.map(meal => <option key={meal}>{meal}</option>)}</select></label>
              </div>
              <div className="nutrition-fields nutrition-macro-fields">
                <label>Calories<input type="number" min="0" value={food.calories} onChange={event => update(index, 'calories', event.target.value)} /></label>
                <label>Protein<input type="number" min="0" value={food.protein} onChange={event => update(index, 'protein', event.target.value)} /></label>
                <label>Carbs<input type="number" min="0" value={food.carbs} onChange={event => update(index, 'carbs', event.target.value)} /></label>
                <label>Fat<input type="number" min="0" value={food.fat} onChange={event => update(index, 'fat', event.target.value)} /></label>
              </div>
              {food.notes && <div className="nutrition-estimate-note">{food.notes}</div>}
              {food.source === 'photo' && <div className="nutrition-estimate-warning">Photo estimate. Adjust the food and portion if anything looks wrong.</div>}
            </div>
          ))}

          {!extrasOpen && <button className="nutrition-extra-button" onClick={openExtras}>+ Add oil or butter</button>}
          {extrasOpen && <div className="nutrition-extra-picker">
            <label>Oil or butter
              <select defaultValue="" disabled={extrasLoading} onChange={event => addExtra(event.target.value)}>
                <option value="">{extrasLoading ? 'Loading USDA choices...' : 'Choose one...'}</option>
                {extraOptions.map((extra, index) => <option key={extra.id} value={index}>{extra.name} · {extra.calories} cal / tbsp</option>)}
              </select>
            </label>
            <small>Nutrition per tablespoon from USDA FoodData Central.</small>
            {extrasError && <div className="nutrition-estimate-warning">{extrasError}</div>}
          </div>}
          <div className="nutrition-confirm-total">
            <strong>{rounded(totals.calories)} calories</strong>
            <span>{rounded(totals.protein)}g protein · {rounded(totals.carbs)}g carbs · {rounded(totals.fat)}g fat</span>
          </div>
          <button className="btn-primary" disabled={saving || !foods.length || foods.some(food => !food.food_name.trim())} onClick={onSave}>
            {saving ? 'Adding...' : `Confirm & Add ${foods.length > 1 ? `${foods.length} Foods` : 'Food'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddFoodModal({ onClose, onConfirm }) {
  const [mode, setMode] = useState('frequent')
  const [manual, setManual] = useState({ ...EMPTY_FOOD, meal: 'Meal' })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [frequentFoods, setFrequentFoods] = useState([])
  const [frequentLoading, setFrequentLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [scannerActive, setScannerActive] = useState(false)
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const barcodeHandledRef = useRef(false)

  useEffect(() => {
    let active = true
    supabase.from('nutrition_entries')
      .select('food_name, serving_amount, serving_unit, calories, protein, carbs, fat, meal, source, source_id, confidence, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        const grouped = new Map()
        ;(data || []).forEach(food => {
          const key = `${food.food_name.trim().toLowerCase()}|${(food.serving_unit || '').trim().toLowerCase()}`
          const existing = grouped.get(key)
          if (existing) existing.count += 1
          else grouped.set(key, { ...food, count: 1 })
        })
        setFrequentFoods([...grouped.values()].sort((a, b) => b.count - a.count || new Date(b.created_at) - new Date(a.created_at)).slice(0, 15))
        setFrequentLoading(false)
      })
    return () => { active = false; controlsRef.current?.stop() }
  }, [])

  const lookup = async url => {
    setBusy(true); setError('')
    try {
      const headers = await authHeaders()
      const response = await fetch(url, { headers })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Food lookup failed.')
      setResults(data.foods || [])
      return data.foods || []
    } catch (err) {
      setError(err.message)
      return []
    } finally { setBusy(false) }
  }

  const search = event => {
    event.preventDefault()
    lookup(`/api/food-lookup?q=${encodeURIComponent(query)}`)
  }

  const chooseSearchFood = food => onConfirm([foodDraft({ ...food, food_name: [food.brand, food.name].filter(Boolean).join(' '), source: 'search', meal: 'Meal' })])

  const startScanner = async () => {
    setError(''); setScannerActive(true); barcodeHandledRef.current = false
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, async (result) => {
        if (!result || barcodeHandledRef.current) return
        barcodeHandledRef.current = true
        controlsRef.current?.stop()
        setScannerActive(false)
        const foods = await lookup(`/api/food-lookup?barcode=${encodeURIComponent(result.getText())}`)
        if (foods[0]) onConfirm([foodDraft({ ...foods[0], food_name: [foods[0].brand, foods[0].name].filter(Boolean).join(' '), source: 'barcode', meal: 'Meal' })])
      })
    } catch (err) {
      setScannerActive(false)
      setError('Camera scanning could not start. Check camera permission or enter the barcode below.')
    }
  }

  const photoSelected = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true); setError('')
    try {
      const imageData = await imageToJpeg(file)
      const headers = await authHeaders()
      const response = await fetch('/api/nutrition-analyze', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData, mediaType: 'image/jpeg' })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Meal analysis failed.')
      if (!data.foods?.length) throw new Error('No food was found in that photo.')
      onConfirm(combineMatchingFoods(data.foods.map(food => ({ ...food, source: 'photo', meal: 'Meal' }))))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="modal-wrap" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="modal nutrition-add-modal">
        <div className="modal-head">
          <div><div className="modal-title">Add Food</div><div className="modal-sub">Nothing is logged until you confirm it.</div></div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="nutrition-add-tabs" role="tablist" aria-label="Food logging options">
            <button className={mode === 'frequent' ? 'active' : ''} onClick={() => { controlsRef.current?.stop(); setMode('frequent'); setScannerActive(false); setError('') }}>Frequently Logged</button>
            <button className={mode === 'choices' ? 'active' : ''} onClick={() => { controlsRef.current?.stop(); setMode('choices'); setScannerActive(false); setError('') }}>Add New</button>
          </div>
          {!['choices', 'frequent'].includes(mode) && <button className="nutrition-back" onClick={() => { controlsRef.current?.stop(); setMode('choices'); setScannerActive(false); setError('') }}>‹ Add New options</button>}
          {error && <div className="auth-error">{error}</div>}
          {busy && <div className="nutrition-analyzing">Analyzing...</div>}

          {mode === 'frequent' && <div className="nutrition-frequent-list">
            {frequentLoading && <div className="nutrition-analyzing">Loading your foods...</div>}
            {!frequentLoading && !frequentFoods.length && <div className="nutrition-frequent-empty">
              <strong>No frequently logged foods yet</strong>
              <small>Foods you log will appear here for quick reuse.</small>
              <button className="btn-primary" onClick={() => setMode('choices')}>Add Your First Food</button>
            </div>}
            {frequentFoods.map(food => <button key={`${food.food_name}-${food.serving_unit}`} onClick={() => onConfirm([foodDraft(food)])}>
              <span><strong>{food.food_name}</strong><small>{food.serving_amount || 1} {food.serving_unit || 'serving'} · {rounded(food.calories)} calories</small></span>
              <em>{food.count}×</em>
            </button>)}
          </div>}

          {mode === 'choices' && <div className="nutrition-add-choices">
            <button onClick={() => setMode('manual')}><span>+</span><strong>Add Food</strong><small>Enter nutrition from a label or recipe</small></button>
            <label><span>▣</span><strong>Upload Photo of Meal</strong><small>Get an editable AI estimate</small><input type="file" accept="image/*" capture="environment" onChange={photoSelected} /></label>
            <button onClick={() => setMode('search')}><span>⌕</span><strong>Search / Enter Food</strong><small>Search USDA and packaged foods</small></button>
            <button onClick={() => setMode('barcode')}><span>▥</span><strong>Scan Barcode</strong><small>Look up a packaged food</small></button>
          </div>}

          {mode === 'manual' && <div>
            <div className="field"><label>Food name</label><input value={manual.food_name} onChange={event => setManual({ ...manual, food_name: event.target.value })} placeholder="Chicken breast" /></div>
            <div className="nutrition-fields nutrition-serving-fields">
              <label>Amount<input type="number" min="0" step="0.1" value={manual.serving_amount} onChange={event => setManual({ ...manual, serving_amount: event.target.value })} /></label>
              <label>Unit<input value={manual.serving_unit} onChange={event => setManual({ ...manual, serving_unit: event.target.value })} /></label>
              <label>Meal<select value={manual.meal} onChange={event => setManual({ ...manual, meal: event.target.value })}><option>Meal</option>{MEALS.map(meal => <option key={meal}>{meal}</option>)}</select></label>
            </div>
            <div className="nutrition-fields nutrition-macro-fields">
              {['calories', 'protein', 'carbs', 'fat'].map(field => <label key={field}>{field[0].toUpperCase() + field.slice(1)}<input type="number" min="0" value={manual[field]} onChange={event => setManual({ ...manual, [field]: event.target.value })} /></label>)}
            </div>
            <button className="btn-primary" disabled={!manual.food_name.trim()} onClick={() => onConfirm([foodDraft(manual)])}>Review Food</button>
          </div>}

          {mode === 'search' && <div>
            <form className="nutrition-search" onSubmit={search}><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search chicken, yogurt, cereal..." /><button className="btn-sm" disabled={busy}>Search</button></form>
            <div className="nutrition-search-results">{results.map((food, index) => <button key={`${food.id}-${index}`} onClick={() => chooseSearchFood(food)}><strong>{food.name}</strong><small>{food.brand && `${food.brand} · `}{rounded(food.calories)} cal per {food.servingLabel || '100 g'}</small></button>)}</div>
            <button className="btn-ghost" onClick={() => setMode('manual')}>Can’t find it? Enter manually</button>
          </div>}

          {mode === 'barcode' && <div>
            {scannerActive ? <video ref={videoRef} className="nutrition-scanner" muted playsInline /> : <button className="btn-primary" onClick={startScanner}>Start Barcode Scanner</button>}
            <form className="nutrition-search" onSubmit={async event => { event.preventDefault(); const foods = await lookup(`/api/food-lookup?barcode=${encodeURIComponent(query)}`); if (foods[0]) chooseSearchFood({ ...foods[0], source: 'barcode' }) }}>
              <input inputMode="numeric" value={query} onChange={event => setQuery(event.target.value)} placeholder="Or type barcode number" />
              <button className="btn-sm" disabled={busy}>Look Up</button>
            </form>
          </div>}
        </div>
      </div>
    </div>
  )
}

function CoachNutrition({ user }) {
  const [athletes, setAthletes] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [target, setTarget] = useState(EMPTY_TARGET)
  const [completed, setCompleted] = useState([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('id, name, email, role, membership_type').order('name'),
      supabase.from('nutrition_diary_days').select('athlete_id, log_date, completed_at, profiles(name)').not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(30)
    ]).then(([profiles, diaries]) => {
      const eligibleProfiles = (profiles.data || []).filter(profile => profile.role === 'coach' || isPaidMember(profile))
      setAthletes(eligibleProfiles)
      setSelectedId(eligibleProfiles.find(profile => profile.id === user.id)?.id || eligibleProfiles[0]?.id || '')
      setCompleted(diaries.data || [])
    })
  }, [user.id])

  useEffect(() => {
    if (!selectedId) return
    supabase.from('nutrition_targets').select('*').eq('athlete_id', selectedId).maybeSingle().then(({ data }) => setTarget(data || EMPTY_TARGET))
  }, [selectedId])

  const save = async () => {
    setSaving(true); setMessage('')
    const payload = {
      athlete_id: selectedId,
      calorie_target: rounded(target.calorie_target), protein_target: num(target.protein_target),
      carb_target: num(target.carb_target), fat_target: num(target.fat_target),
      updated_by: user.id, updated_at: new Date().toISOString()
    }
    const { error } = await supabase.from('nutrition_targets').upsert(payload, { onConflict: 'athlete_id' })
    setSaving(false)
    setMessage(error ? error.message : 'Targets saved.')
  }

  return <div>
    <div className="panel nutrition-coach-targets">
      <div className="panel-title">Athlete Targets</div>
      <div className="field"><label>Athlete or Coach</label><select value={selectedId} onChange={event => setSelectedId(event.target.value)}>{athletes.map(athlete => <option key={athlete.id} value={athlete.id}>{athlete.name || athlete.email}{athlete.role === 'coach' ? ' (Coach)' : ''}</option>)}</select></div>
      <div className="nutrition-fields nutrition-macro-fields">
        <label>Calories<input type="number" min="0" value={target.calorie_target} onChange={event => setTarget({ ...target, calorie_target: event.target.value })} /></label>
        <label>Protein (g)<input type="number" min="0" value={target.protein_target} onChange={event => setTarget({ ...target, protein_target: event.target.value })} /></label>
        <label>Carbs (g)<input type="number" min="0" value={target.carb_target} onChange={event => setTarget({ ...target, carb_target: event.target.value })} /></label>
        <label>Fat (g)<input type="number" min="0" value={target.fat_target} onChange={event => setTarget({ ...target, fat_target: event.target.value })} /></label>
      </div>
      <button className="btn-primary" onClick={save} disabled={!selectedId || saving}>{saving ? 'Saving...' : 'Save Targets'}</button>
      {message && <div className="nutrition-save-message">{message}</div>}
    </div>
    <div className="panel">
      <div className="panel-title">Recently Closed Diaries</div>
      {completed.length ? completed.map(day => <div className="nutrition-closed-row" key={`${day.athlete_id}-${day.log_date}`}><strong>{day.profiles?.name || 'Athlete'}</strong><span>{dateLabel(day.log_date)}</span></div>) : <div className="no-data">No athletes have closed a diary yet.</div>}
    </div>
  </div>
}

export default function Nutrition({ user, profile }) {
  const isCoach = profile?.role === 'coach'
  const [view, setView] = useState('diary')
  const [date, setDate] = useState(localISO())
  const [entries, setEntries] = useState([])
  const [target, setTarget] = useState(EMPTY_TARGET)
  const [diary, setDiary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [confirmFoods, setConfirmFoods] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savingGoals, setSavingGoals] = useState(false)
  const [toast, setToast] = useState('')

  const loadDay = useCallback(async () => {
    setLoading(true)
    const [entryResult, targetResult, diaryResult] = await Promise.all([
      supabase.from('nutrition_entries').select('*').eq('athlete_id', user.id).eq('log_date', date).order('created_at'),
      supabase.from('nutrition_targets').select('*').eq('athlete_id', user.id).maybeSingle(),
      supabase.from('nutrition_diary_days').select('*').eq('athlete_id', user.id).eq('log_date', date).maybeSingle()
    ])
    setEntries(entryResult.data || [])
    setTarget(targetResult.data || EMPTY_TARGET)
    setDiary(diaryResult.data || null)
    setLoading(false)
  }, [date, user.id])

  useEffect(() => { loadDay() }, [loadDay])

  const totals = useMemo(() => entries.reduce((sum, entry) => ({ calories: sum.calories + num(entry.calories), protein: sum.protein + num(entry.protein), carbs: sum.carbs + num(entry.carbs), fat: sum.fat + num(entry.fat) }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [entries])
  const hasTargets = num(target.calorie_target) + num(target.protein_target) + num(target.carb_target) + num(target.fat_target) > 0
  const closeEnough = (value, goal) => goal <= 0 || (value >= goal * 0.9 && value <= goal * 1.1)
  const goalsMet = hasTargets && closeEnough(totals.calories, num(target.calorie_target)) && closeEnough(totals.protein, num(target.protein_target)) && closeEnough(totals.carbs, num(target.carb_target)) && closeEnough(totals.fat, num(target.fat_target))

  const beginConfirm = foods => { setAddOpen(false); setConfirmFoods(foods.map(foodDraft)) }
  const saveOwnGoals = async () => {
    setSavingGoals(true)
    const { error } = await supabase.from('nutrition_targets').upsert({
      athlete_id: user.id,
      calorie_target: rounded(target.calorie_target),
      protein_target: oneDecimal(target.protein_target),
      carb_target: oneDecimal(target.carb_target),
      fat_target: oneDecimal(target.fat_target),
      updated_by: user.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'athlete_id' })
    setSavingGoals(false)
    setToast(error ? error.message : 'Daily goals saved.')
  }
  const saveFoods = async () => {
    setSaving(true)
    const payload = confirmFoods.map(food => ({
      athlete_id: user.id, log_date: date, meal: food.meal || 'Meal', food_name: food.food_name.trim(),
      serving_amount: num(food.serving_amount), serving_unit: food.serving_unit || null,
      calories: num(food.calories), protein: num(food.protein), carbs: num(food.carbs), fat: num(food.fat),
      source: food.source || 'manual', source_id: food.source_id || null, confidence: food.confidence, notes: food.notes || null
    }))
    const { error } = await supabase.from('nutrition_entries').insert(payload)
    setSaving(false)
    if (error) { setToast(error.message); return }
    setConfirmFoods(null); setToast('Food added.'); loadDay()
  }

  const deleteEntry = async id => {
    if (!window.confirm('Remove this food from the diary?')) return
    await supabase.from('nutrition_entries').delete().eq('id', id).eq('athlete_id', user.id)
    loadDay()
  }

  const finishDay = async () => {
    if (!entries.length) { setToast('Add at least one food before closing your diary.'); return }
    if (!window.confirm(`Close your diary for ${dateLabel(date)} and alert your coach?`)) return
    const completedAt = new Date().toISOString()
    const { error } = await supabase.from('nutrition_diary_days').upsert({ athlete_id: user.id, log_date: date, completed_at: completedAt, coach_notified_at: completedAt, updated_at: completedAt }, { onConflict: 'athlete_id,log_date' })
    if (error) { setToast(error.message); return }
    const message = `${profile?.name || 'An athlete'} finished logging nutrition for ${dateLabel(date)}: ${rounded(totals.calories)} calories, ${rounded(totals.protein)}g protein, ${rounded(totals.carbs)}g carbs, ${rounded(totals.fat)}g fat.`
    await supabase.from('notifications').insert({ athlete_id: user.id, type: 'nutrition_diary_complete', message })
    await notifyCoach('Nutrition diary complete', message, { tag: `nutrition-${user.id}-${date}` })
    setDiary({ athlete_id: user.id, log_date: date, completed_at: completedAt })
    setToast(goalsMet ? 'Goals met. Beautiful work.' : 'Diary closed and your coach was notified.')
  }

  if (isCoach && view === 'coach') return <div>
    <div className="section-header"><h2 className="section-title">Nutrition</h2></div>
    <div className="nutrition-view-tabs"><button className="btn-ghost" onClick={() => setView('diary')}>My Diary</button><button className="btn-sm">Coach Targets</button></div>
    <CoachNutrition user={user} />
  </div>

  return <div className="nutrition-page">
    <div className="section-header">
      <h2 className="section-title">Nutrition</h2>
      {isCoach && <button className="btn-ghost" onClick={() => setView('coach')}>Coach Targets</button>}
    </div>

    <div className="date-nav nutrition-date-nav">
      <button className="date-nav-btn" onClick={() => setDate(shiftISO(date, -1))} aria-label="Previous day">‹</button>
      <button className="nutrition-date-label" onClick={() => setDate(localISO())}><strong>{dateLabel(date)}</strong><small>{date === localISO() ? 'Today' : 'Tap to return to today'}</small></button>
      <button className="date-nav-btn" onClick={() => setDate(shiftISO(date, 1))} aria-label="Next day">›</button>
    </div>

    {loading ? <div className="loading">Loading nutrition...</div> : <>
      {diary?.completed_at && <div className={`nutrition-celebration ${goalsMet ? 'goals-met' : ''}`}><span>★</span><div><strong>{goalsMet ? 'Daily goals achieved' : 'Diary complete'}</strong><small>{goalsMet ? 'You landed within range on every active target.' : 'Your coach has been notified.'}</small></div></div>}

      <div className="panel nutrition-summary">
        <div className="nutrition-calorie-ring" style={{ '--progress': `${target.calorie_target > 0 ? Math.min(totals.calories / target.calorie_target * 100, 100) : 0}%` }}>
          <div><strong>{rounded(Math.max(num(target.calorie_target) - totals.calories, 0))}</strong><span>calories left</span></div>
        </div>
        <div className="nutrition-goals">
          <GoalBar label="Protein" consumed={totals.protein} target={num(target.protein_target)} />
          <GoalBar label="Carbs" consumed={totals.carbs} target={num(target.carb_target)} />
          <GoalBar label="Fat" consumed={totals.fat} target={num(target.fat_target)} />
        </div>
        {!hasTargets && <div className="nutrition-no-target">Your coach has not set nutrition targets yet. You can still log food.</div>}
      </div>

      <details className="panel nutrition-own-goals">
        <summary>My Daily Goals</summary>
        <div className="modal-sub">Use goals from your coach or enter your own.</div>
        <div className="nutrition-fields nutrition-macro-fields">
          <label>Calories<input type="number" min="0" value={target.calorie_target} onChange={event => setTarget({ ...target, calorie_target: event.target.value })} /></label>
          <label>Protein (g)<input type="number" min="0" value={target.protein_target} onChange={event => setTarget({ ...target, protein_target: event.target.value })} /></label>
          <label>Carbs (g)<input type="number" min="0" value={target.carb_target} onChange={event => setTarget({ ...target, carb_target: event.target.value })} /></label>
          <label>Fat (g)<input type="number" min="0" value={target.fat_target} onChange={event => setTarget({ ...target, fat_target: event.target.value })} /></label>
        </div>
        <button className="btn-primary" disabled={savingGoals} onClick={saveOwnGoals}>{savingGoals ? 'Saving...' : 'Save My Goals'}</button>
      </details>

      {!entries.length ? <div className="panel nutrition-empty">
        <div className="nutrition-empty-mark">+</div>
        <h3>Start today’s diary</h3>
        <p>Add food manually, photograph a meal, search the food database, or scan a barcode.</p>
        <div className="nutrition-empty-actions">
          <button className="btn-primary" onClick={() => setAddOpen(true)}>Add Food</button>
          <button className="btn-ghost" onClick={() => setAddOpen(true)}>Upload Photo of Meal</button>
          <button className="btn-ghost" onClick={() => setAddOpen(true)}>Search / Enter Food</button>
        </div>
      </div> : <div className="nutrition-meals">
        {['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Meal'].map(meal => {
          const mealEntries = entries.filter(entry => entry.meal === meal)
          if (!mealEntries.length) return null
          return <div className="panel nutrition-meal" key={meal}>
            <div className="nutrition-meal-title"><strong>{meal}</strong><span>{rounded(mealEntries.reduce((sum, entry) => sum + num(entry.calories), 0))} cal</span></div>
            {mealEntries.map(entry => <div className="nutrition-entry" key={entry.id}>
              <div><strong>{entry.food_name}</strong><small>{entry.serving_amount ? `${entry.serving_amount} ${entry.serving_unit || ''} · ` : ''}{rounded(entry.protein)}g P · {rounded(entry.carbs)}g C · {rounded(entry.fat)}g F</small></div>
              <span>{rounded(entry.calories)}</span>
              <button onClick={() => deleteEntry(entry.id)} aria-label={`Remove ${entry.food_name}`}>×</button>
            </div>)}
          </div>
        })}
        <button className="btn-primary nutrition-add-more" onClick={() => setAddOpen(true)}>+ Add Food</button>
      </div>}

      {entries.length > 0 && <button className="nutrition-finish" onClick={finishDay} disabled={Boolean(diary?.completed_at)}>{diary?.completed_at ? 'Diary closed for this day' : "I'm done logging for the day"}</button>}
    </>}

    {addOpen && <AddFoodModal onClose={() => setAddOpen(false)} onConfirm={beginConfirm} />}
    {confirmFoods && <ConfirmationModal foods={confirmFoods} setFoods={setConfirmFoods} onClose={() => setConfirmFoods(null)} onSave={saveFoods} saving={saving} />}
    {toast && <div className="toast" onAnimationEnd={() => setTimeout(() => setToast(''), 1800)}>{toast}</div>}
    <style>{`
      .nutrition-view-tabs{display:flex;gap:8px;margin-bottom:1.25rem}.nutrition-date-nav{margin-bottom:1.25rem}.nutrition-date-label{min-width:280px;border:0;background:transparent;color:var(--bone);cursor:pointer}.nutrition-date-label strong,.nutrition-date-label small{display:block}.nutrition-date-label strong{font-family:'Cinzel',serif;font-size:20px;color:var(--gold-light)}.nutrition-date-label small{font-size:12px;color:var(--charcoal-light);margin-top:2px}.nutrition-summary{display:grid;grid-template-columns:190px 1fr;gap:28px;align-items:center}.nutrition-calorie-ring{width:170px;height:170px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--gold) var(--progress),rgba(255,248,236,.12) 0);position:relative}.nutrition-calorie-ring:after{content:'';position:absolute;inset:13px;border-radius:50%;background:#454139}.nutrition-calorie-ring>div{position:relative;z-index:1;text-align:center}.nutrition-calorie-ring strong,.nutrition-calorie-ring span{display:block}.nutrition-calorie-ring strong{font-family:'Cinzel',serif;font-size:35px;color:var(--gold-light)}.nutrition-calorie-ring span{font-size:13px;color:var(--charcoal-light)}.nutrition-goals{display:grid;gap:16px}.nutrition-goal-head{display:flex;justify-content:space-between;gap:12px;font-size:14px}.nutrition-goal-head strong{font-family:'Cinzel',serif;color:var(--bone)}.nutrition-goal-head span,.nutrition-goal small{color:var(--charcoal-light)}.nutrition-goal small{display:block;font-size:12px;margin-top:4px}.nutrition-progress{height:9px;background:rgba(255,248,236,.12);margin-top:6px}.nutrition-progress span{display:block;height:100%;background:var(--moss-light)}.nutrition-no-target{grid-column:1/-1;border-top:1px solid var(--border);padding-top:12px;color:var(--charcoal-light);font-size:14px}.nutrition-empty{text-align:center}.nutrition-empty-mark{width:58px;height:58px;border:1px solid var(--gold-dark);display:grid;place-items:center;margin:0 auto 14px;font-size:34px;color:var(--gold-light)}.nutrition-empty h3{font-family:'Cinzel',serif;color:var(--gold-light);margin:0}.nutrition-empty p{color:var(--charcoal-light);font-size:15px}.nutrition-empty-actions{display:grid;gap:9px;max-width:440px;margin:20px auto 0}.nutrition-meals{display:grid;gap:14px}.nutrition-meal{padding:0!important;overflow:hidden}.nutrition-meal-title{display:flex;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)}.nutrition-meal-title strong{font-family:'Cinzel',serif;color:var(--gold-light)}.nutrition-meal-title span{color:var(--charcoal-light);font-size:14px}.nutrition-entry{display:grid;grid-template-columns:1fr auto 38px;gap:12px;align-items:center;padding:14px 18px;border-bottom:1px solid rgba(242,221,170,.18)}.nutrition-entry:last-child{border-bottom:0}.nutrition-entry strong,.nutrition-entry small{display:block}.nutrition-entry strong{font-size:16px;color:var(--bone)}.nutrition-entry small{font-size:13px;color:var(--charcoal-light);margin-top:3px}.nutrition-entry>span{font-family:'Cinzel',serif;color:var(--gold-light)}.nutrition-entry>button{border:0;background:transparent;color:var(--rose-light);font-size:26px;cursor:pointer}.nutrition-add-more{max-width:440px;margin:4px auto 0}.nutrition-finish{width:100%;margin:18px 0;border:1px solid var(--moss-light);background:rgba(130,144,106,.18);color:var(--bone);padding:16px;font-family:'Cinzel',serif;font-size:16px;cursor:pointer}.nutrition-finish:disabled{opacity:.6;cursor:default}.nutrition-celebration{display:flex;align-items:center;gap:14px;border:1px solid var(--moss);background:rgba(130,144,106,.14);padding:14px 18px;margin-bottom:14px}.nutrition-celebration.goals-met{border-color:var(--gold);background:rgba(215,184,111,.12)}.nutrition-celebration>span{font-size:32px;color:var(--gold-light)}.nutrition-celebration strong,.nutrition-celebration small{display:block}.nutrition-celebration strong{font-family:'Cinzel',serif;color:var(--gold-light)}.nutrition-celebration small{font-size:13px;color:var(--charcoal-light)}.nutrition-add-modal,.nutrition-confirm-modal{max-width:760px}.nutrition-add-choices{display:grid;gap:10px}.nutrition-add-choices button,.nutrition-add-choices label{display:grid;grid-template-columns:48px 1fr;gap:2px 12px;text-align:left;align-items:center;border:1px solid var(--border);background:rgba(255,248,236,.05);color:var(--bone);padding:15px;cursor:pointer}.nutrition-add-choices span{grid-row:1/3;font-family:'Cinzel',serif;font-size:28px;color:var(--gold-light);text-align:center}.nutrition-add-choices strong{font-family:'Cinzel',serif;font-size:16px}.nutrition-add-choices small{font-size:13px;color:var(--charcoal-light)}.nutrition-add-choices input{display:none}.nutrition-back{border:0;background:transparent;color:var(--gold-light);font-size:15px;cursor:pointer;margin-bottom:14px}.nutrition-fields{display:grid;gap:10px;margin:14px 0}.nutrition-serving-fields{grid-template-columns:1fr 1fr 1.2fr}.nutrition-macro-fields{grid-template-columns:repeat(4,1fr)}.nutrition-fields label{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--charcoal-light)}.nutrition-fields input,.nutrition-fields select,.nutrition-confirm-top input,.nutrition-search input{width:100%;display:block;margin-top:5px;background:rgba(255,248,236,.12);border:1px solid var(--border-strong);color:var(--bone);font-size:17px;padding:10px}.nutrition-fields select option{background:var(--charcoal)}.nutrition-search{display:grid;grid-template-columns:1fr auto;gap:8px;margin:12px 0}.nutrition-search input{margin:0}.nutrition-search-results{display:grid;gap:7px;margin:12px 0;max-height:45vh;overflow:auto}.nutrition-search-results button{border:1px solid var(--border);background:rgba(255,248,236,.04);padding:11px;text-align:left;color:var(--bone);cursor:pointer}.nutrition-search-results strong,.nutrition-search-results small{display:block}.nutrition-search-results small{color:var(--charcoal-light);margin-top:3px}.nutrition-scanner{width:100%;max-height:360px;object-fit:cover;border:1px solid var(--gold);background:#111}.nutrition-analyzing{text-align:center;color:var(--gold-light);padding:18px;font-family:'Cinzel',serif}.nutrition-confirm-food{border:1px solid var(--border);background:rgba(255,248,236,.035);padding:14px;margin-bottom:12px}.nutrition-confirm-top{display:grid;grid-template-columns:1fr auto;gap:8px}.nutrition-confirm-top input{margin:0}.nutrition-estimate-note,.nutrition-estimate-warning{font-size:12px;color:var(--charcoal-light);margin-top:8px}.nutrition-estimate-warning{color:var(--gold-light)}.nutrition-extra-button{width:100%;border:1px dashed var(--gold-dark);background:transparent;color:var(--gold-light);padding:12px;cursor:pointer}.nutrition-extra-picker{border:1px dashed var(--gold-dark);padding:12px}.nutrition-extra-picker label,.nutrition-extra-picker small{display:block}.nutrition-extra-picker label{font-size:12px;text-transform:uppercase;color:var(--charcoal-light)}.nutrition-extra-picker select{width:100%;margin-top:6px;background:rgba(255,248,236,.12);border:1px solid var(--border-strong);color:var(--bone);font-size:16px;padding:10px}.nutrition-extra-picker select option{background:var(--charcoal)}.nutrition-extra-picker small{margin-top:7px;color:var(--charcoal-light)}.nutrition-confirm-total{text-align:center;padding:16px}.nutrition-confirm-total strong,.nutrition-confirm-total span{display:block}.nutrition-confirm-total strong{font-family:'Cinzel',serif;color:var(--gold-light);font-size:22px}.nutrition-confirm-total span{font-size:13px;color:var(--charcoal-light)}.nutrition-save-message{text-align:center;color:var(--moss-light);margin-top:10px}.nutrition-closed-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);font-size:14px}.nutrition-closed-row strong{color:var(--bone)}.nutrition-closed-row span{color:var(--charcoal-light)}
      @media(max-width:640px){.nutrition-summary{grid-template-columns:1fr}.nutrition-calorie-ring{margin:auto}.nutrition-serving-fields{grid-template-columns:1fr 1fr}.nutrition-serving-fields label:last-child{grid-column:1/-1}.nutrition-macro-fields{grid-template-columns:1fr 1fr}.nutrition-date-label{min-width:0;flex:1}.nutrition-date-label strong{font-size:16px}.nutrition-confirm-modal .modal-body,.nutrition-add-modal .modal-body{padding:1rem}.nutrition-entry{padding:12px}.nutrition-add-choices button,.nutrition-add-choices label{grid-template-columns:40px 1fr;padding:12px}.nutrition-add-choices span{font-size:24px}}
    `}</style>
    <style>{`
      .nutrition-own-goals{margin-top:14px}.nutrition-own-goals summary{cursor:pointer;font-family:'Cinzel',serif;color:var(--gold-light);font-size:16px}.nutrition-own-goals[open] summary{margin-bottom:8px}.nutrition-own-goals .btn-primary{max-width:260px}
      .nutrition-add-tabs{display:grid;grid-template-columns:1fr 1fr;margin-bottom:16px;border-bottom:1px solid var(--border)}
      .nutrition-add-tabs button{border:0;border-bottom:3px solid transparent;background:transparent;color:var(--charcoal-light);padding:11px 8px;font-family:'Cinzel',serif;font-size:14px;cursor:pointer}
      .nutrition-add-tabs button.active{border-bottom-color:var(--gold);color:var(--gold-light)}
      .nutrition-frequent-list{display:grid;gap:8px}
      .nutrition-frequent-list>button{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--border);background:rgba(255,248,236,.05);color:var(--bone);padding:13px 14px;text-align:left;cursor:pointer}
      .nutrition-frequent-list strong,.nutrition-frequent-list small{display:block}
      .nutrition-frequent-list strong{font-size:16px}.nutrition-frequent-list small{margin-top:4px;color:var(--charcoal-light);font-size:13px}
      .nutrition-frequent-list em{flex:0 0 auto;border:1px solid var(--gold-dark);color:var(--gold-light);font-style:normal;font-size:12px;padding:4px 7px}
      .nutrition-frequent-empty{text-align:center;padding:24px 8px}.nutrition-frequent-empty strong,.nutrition-frequent-empty small{display:block}
      .nutrition-frequent-empty strong{font-family:'Cinzel',serif;color:var(--gold-light)}.nutrition-frequent-empty small{color:var(--charcoal-light);margin:7px 0 18px}
    `}</style>
  </div>
}
