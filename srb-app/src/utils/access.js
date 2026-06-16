export const FREE_TRIAL_CLASS_LIMIT = 3

export const MEMBERSHIP_TYPES = [
  'Free Trial',
  'Class Access',
  'Personal Training',
  'Online Training',
  'Nutrition',
  'Both',
  'Founding Membership',
  'Founding Preregistration',
  'None'
]

export const PAID_MEMBERSHIP_TYPES = [
  'Class Access',
  'Personal Training',
  'Online Training',
  'Nutrition',
  'Nutrition Coaching',
  'Both',
  'Founding Membership'
]

export const CLASS_ACCESS_TYPES = ['Class Access', 'Both', 'Founding Membership']

export const PRIVATE_TRAINING_TYPES = ['Personal Training', 'Online Training', 'Nutrition', 'Nutrition Coaching']

export const MEMBERSHIP_CLASS = {
  'Free Trial': 'membership-trial',
  'Class Access': 'membership-class',
  'Personal Training': 'membership-pt',
  'Online Training': 'membership-pt',
  'Nutrition': 'membership-pt',
  'Nutrition Coaching': 'membership-pt',
  Both: 'membership-both',
  'Founding Membership': 'membership-both',
  'Founding Preregistration': 'membership-both',
  None: 'membership-none'
}

export function isCoach(profile) {
  return profile?.role === 'coach'
}

export function isFreeTrial(profile) {
  return profile?.membership_type === 'Free Trial'
}

export function isPaidMember(profile) {
  return PAID_MEMBERSHIP_TYPES.includes(profile?.membership_type)
}

export function hasClassAccess(profile) {
  return CLASS_ACCESS_TYPES.includes(profile?.membership_type)
}

export function hasPrivateTrainingAccess(profile) {
  return PRIVATE_TRAINING_TYPES.includes(profile?.membership_type)
}

export function getAccessStatus(profile) {
  if (isCoach(profile)) return 'Coach'
  if (isFreeTrial(profile)) return 'Free Trial'
  if (isPaidMember(profile)) return 'Paid Member'
  return 'Lead'
}

export function canSeeWorkouts(profile) {
  return isCoach(profile) || isPaidMember(profile)
}
