export async function notifyCoach(title, body, options = {}) {
  try {
    await fetch('/api/push-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, ...options })
    })
  } catch (err) {
    console.error('Coach push notification error:', err)
  }
}
