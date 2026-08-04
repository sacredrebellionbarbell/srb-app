export const FREE_TRIAL_CLASS_LIMIT = 3

export const MEMBERSHIP_TYPES = [
  'Free Trial',
  'Class Access',
  'Open Gym',
  'Personal Training',
  'Online Training',
  'Nutrition Coaching',
  'Former Member',
  'None'
]

export const PAID_MEMBERSHIP_TYPES = [
  'Class Access',
  'Open Gym',
  'Personal Training',
  'Online Training',
  'Nutrition',
  'Nutrition Coaching',
  'Hybrid Training',
  'Both',
  'Founding Membership'
]

export const CLASS_ACCESS_TYPES = ['Class Access', 'Both', 'Founding Membership']

export const PRIVATE_TRAINING_TYPES = ['Personal Training', 'Online Training', 'Nutrition', 'Nutrition Coaching', 'Hybrid Training']

export const OPEN_GYM_ACCESS_TYPES = ['Open Gym', 'Class Access', 'Both', 'Founding Membership']

export const MEMBERSHIP_CLASS = {
  'Free Trial': 'membership-trial',
  'Class Access': 'membership-class',
  'Open Gym': 'membership-class',
  'Personal Training': 'membership-pt',
  'Online Training': 'membership-pt',
  'Nutrition': 'membership-pt',
  'Nutrition Coaching': 'membership-pt',
  'Hybrid Training': 'membership-pt',
  Both: 'membership-both',
  'Founding Membership': 'membership-both',
  'Founding Preregistration': 'membership-both',
  'Former Member': 'membership-none',
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

export function isFormerMember(profile) {
  return profile?.membership_type === 'Former Member'
}

export function hasClassAccess(profile) {
  return CLASS_ACCESS_TYPES.includes(profile?.membership_type)
}

export function hasPrivateTrainingAccess(profile) {
  return PRIVATE_TRAINING_TYPES.includes(profile?.membership_type)
}

export function hasOpenGymAccess(profile) {
  return OPEN_GYM_ACCESS_TYPES.includes(profile?.membership_type)
}

export function getAccessStatus(profile) {
  if (isCoach(profile)) return 'Coach'
  if (isFormerMember(profile)) return 'Former Member'
  if (isFreeTrial(profile)) return 'Free Trial'
  if (isPaidMember(profile)) return 'Paid Member'
  return 'Lead'
}

export function canSeeWorkouts(profile) {
  return isCoach(profile) || isPaidMember(profile)
}
