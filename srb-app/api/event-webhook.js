import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const EVENT_PRICE_IDS = [
  'price_1TbLub1vlP8rpquA34L6N80D', // Entry only
  'price_1TbLxA1vlP8rpquAytpOnGFr', // Entry + shirt
]

export const config = { api: { bodyParser: false } }

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function sendCoachPushNotification(supabase, title, body) {
  try {
    const { data: coaches } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'coach')

    if (!coaches?.length) return

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('subscription, user_id')
      .in('user_id', coaches.map(c => c.id))

    if (error) {
      console.error('Push subscription lookup error:', error.message)
      return
    }

    if (!subs?.length) return

    const payload = JSON.stringify({
      title,
      body,
      icon: '/logo.jpg',
      badge: '/logo.jpg',
      tag: 'srb-supertotal-payment',
      renotify: true
    })

    const results = await Promise.allSettled(
      subs.map(sub => webpush.sendNotification(sub.subscription, payload))
    )

    const expired = results
      .map((r, i) => r.status === 'rejected' && r.reason?.statusCode === 410 ? subs[i].user_id : null)
      .filter(Boolean)

    if (expired.length) {
      await supabase.from('push_subscriptions').delete().in('user_id', expired)
    }
  } catch (err) {
    console.error('Coach push notification error:', err)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const sig = req.headers['stripe-signature']
  const rawBody = await getRawBody(req)

  let event

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_EVENT_WEBHOOK_SECRET)
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` })
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ message: 'Ignored' })
  }

  const session = event.data.object
  const email = session.customer_details?.email || session.customer_email
  const priceId = session.line_items?.data?.[0]?.price?.id

  // Only handle event price IDs
  if (!EVENT_PRICE_IDS.includes(priceId)) {
    // Try to get line items if not embedded
    if (!session.line_items) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['line_items']
        })

        const expandedPriceId = fullSession.line_items?.data?.[0]?.price?.id

        if (!EVENT_PRICE_IDS.includes(expandedPriceId)) {
          return res.status(200).json({ message: 'Not an event payment, ignored' })
        }
      } catch {
        return res.status(200).json({ message: 'Not an event payment, ignored' })
      }
    } else {
      return res.status(200).json({ message: 'Not an event payment, ignored' })
    }
  }

  if (!email) return res.status(200).json({ message: 'No email found' })

  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Update most recent pending registration for this email
  const { data: reg } = await supabase
    .from('event_registrations')
    .select('id, first_name, last_name, include_shirt, shirt_size')
    .eq('email', email.toLowerCase())
    .eq('payment_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!reg) return res.status(200).json({ message: 'No pending registration found' })

  await supabase.from('event_registrations').update({
    payment_status: 'paid',
    stripe_session_id: session.id
  }).eq('id', reg.id)

  await sendCoachPushNotification(
    supabase,
    'Supertotal Payment Confirmed',
    `${reg.first_name} ${reg.last_name || ''} completed Supertotal payment.`.trim()
  )

  // Send confirmation email
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://sacredrebellion.fit'}/api/event-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      registrationId: reg.id,
      email,
      firstName: reg.first_name,
      includeShirt: reg.include_shirt,
      shirtSize: reg.shirt_size
    })
  }).catch(err => console.error('Email error:', err))

  return res.status(200).json({ success: true })
}
