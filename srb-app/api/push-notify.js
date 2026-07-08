import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { title, body, userId, badgeCount = 1, tag = 'srb-alert' } = req.body
  if (!title || !body) return res.status(400).json({ error: 'Missing title or body' })

  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    // Get all coach subscriptions if no specific userId, otherwise get that user's sub
    let query = supabase.from('push_subscriptions').select('subscription, user_id')
    if (userId) {
      query = query.eq('user_id', userId)
    } else {
      // Send to all coaches
      const { data: coaches } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'coach')
      if (coaches?.length) {
        query = query.in('user_id', coaches.map(c => c.id))
      }
    }

    const { data: subs, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    if (!subs?.length) return res.status(200).json({ message: 'No subscriptions found' })

    const payload = JSON.stringify({
      title,
      body,
      icon: '/logo.jpg',
      badge: '/logo.jpg',
      tag,
      renotify: true,
      badgeCount
    })

    const results = await Promise.allSettled(
      subs.map(sub => webpush.sendNotification(sub.subscription, payload))
    )

    // Remove expired subscriptions
    const expired = results
      .map((r, i) => r.status === 'rejected' && r.reason?.statusCode === 410 ? subs[i].user_id : null)
      .filter(Boolean)

    if (expired.length) {
      await supabase.from('push_subscriptions').delete().in('user_id', expired)
    }

    return res.status(200).json({ sent: results.filter(r => r.status === 'fulfilled').length })
  } catch (err) {
    console.error('Push notification error:', err)
    return res.status(500).json({ error: err.message })
  }
}
