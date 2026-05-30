export async function notifyCoach(title, body) {
  try {
    await fetch('/api/push-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body })
    })
  } catch (err) {
    console.error('Coach push notification error:', err)
  }
}
