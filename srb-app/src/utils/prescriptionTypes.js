export const PRESCRIPTION_TYPES = [
  { value: 'reps', label: 'Reps', placeholder: '3' },
  { value: 'distance', label: 'Distance', placeholder: '60ft or 100m' },
  { value: 'calories', label: 'Calories', placeholder: '12' },
  { value: 'time', label: 'Time', placeholder: ':30 or 1:00' },
  { value: 'weight', label: 'Weight', placeholder: '150 lb' }
]

export function getPrescriptionMeta(value) {
  return PRESCRIPTION_TYPES.find(type => type.value === value) || PRESCRIPTION_TYPES[0]
}

export function formatPrescriptionValue(value, type) {
  if (!value) return ''
  const meta = getPrescriptionMeta(type)
  if (meta.value === 'reps') return `${value} ${parseInt(value) === 1 ? 'rep' : 'reps'}`
  if (meta.value === 'calories') return `${value} cal`
  return value
}
