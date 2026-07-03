export const CLASS_ACHIEVEMENT_MILESTONES = [
  {
    count: 20,
    icon: '★',
    title: '20 Class Spark',
    blurb: 'showed up for 20 classes.'
  },
  {
    count: 50,
    icon: '✦',
    title: '50 Class Fire',
    blurb: 'stacked 50 classes.'
  },
  {
    count: 100,
    icon: '◆',
    title: '100 Class Standard',
    blurb: 'reached 100 classes.'
  },
  {
    count: 250,
    icon: '✹',
    title: '250 Class Iron',
    blurb: 'crossed 250 classes.'
  },
  {
    count: 500,
    icon: '✷',
    title: '500 Class Legacy',
    blurb: 'hit 500 classes.'
  },
  {
    count: 1000,
    icon: '✺',
    title: '1000 Class Legend',
    blurb: 'reached 1000 classes.'
  }
]

export function attendanceDate(row) {
  return row?.attendance_date || row?.classes?.start_time || row?.class_instances?.instance_date || row?.signed_up_at || null
}

export function normalizeOneTimeAttendance(row) {
  return {
    ...row,
    attendance_source: 'class',
    attendance_date: row?.classes?.start_time || row?.signed_up_at || null,
    attendance_title: row?.classes?.is_247 ? '24/7 Access' : row?.classes?.title,
    is_247: Boolean(row?.classes?.is_247)
  }
}

export function normalizeInstanceAttendance(row) {
  const classInfo = row?.class_instances?.classes

  return {
    ...row,
    attendance_source: 'instance',
    attendance_date: row?.class_instances?.instance_date || row?.signed_up_at || null,
    attendance_title: classInfo?.title,
    is_247: Boolean(classInfo?.is_247)
  }
}

export function isAttendanceCheckedIn(row) {
  return Boolean(row?.checkin_time || row?.checked_in_at || row?.attended_at || row?.is_247_checkin)
}

export function normalizeAttendance(oneTimeRows = [], instanceRows = []) {
  return [
    ...oneTimeRows.map(normalizeOneTimeAttendance),
    ...instanceRows.map(normalizeInstanceAttendance)
  ].sort((a, b) => new Date(attendanceDate(b) || 0) - new Date(attendanceDate(a) || 0))
}

export function classAttendanceRows(attendance = []) {
  return attendance.filter(row => !row.is_247 && !row.classes?.is_247 && isAttendanceCheckedIn(row))
}

export function classAttendanceCount(attendance = []) {
  return classAttendanceRows(attendance).length
}

export function earnedClassAchievements(attendance = []) {
  const total = classAttendanceCount(attendance)
  return CLASS_ACHIEVEMENT_MILESTONES
    .filter(milestone => total >= milestone.count)
    .map(milestone => ({ ...milestone, earned: true }))
}

export function nextClassAchievement(attendance = []) {
  const total = classAttendanceCount(attendance)
  return CLASS_ACHIEVEMENT_MILESTONES.find(milestone => total < milestone.count) || null
}

export function milestoneReachedForTotal(total) {
  return CLASS_ACHIEVEMENT_MILESTONES.find(milestone => milestone.count === total) || null
}
