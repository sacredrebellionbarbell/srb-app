import { createClient } from '@supabase/supabase-js'

const EVENT_PRICE_IDS = [
  'price_1TbLub1vlP8rpquA34L6N80D', // Entry only
  'price_1TbLxA1vlP8rpquAytpOnGFr', // Entry + shirt
]

export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function notifyCoach(title, body) {
  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://sacredrebellion.fit'}/api/push-notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body })
  }).catch(err => console.error('Push notification error:', err))
}

async function sendConfirmationEmail(reg, email) {
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
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const sig = req.headers['stripe-signature']
  const rawBody = await getRawBody(req)

  let event
  let stripe

  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_EVENT_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Event webhook signature error:', err.message)
    return res.status(400).json({ error: `Webhook error: ${err.message}` })
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ message: 'Ignored' })
  }

  const session = event.data.object

  let fullSession = session
  try {
    fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items']
    })
  } catch (err) {
    console.error('Could not retrieve expanded session:', err.message)
  }

  const priceId = fullSession.line_items?.data?.[0]?.price?.id || session.line_items?.data?.[0]?.price?.id

  if (!EVENT_PRICE_IDS.includes(priceId)) {
    console.log('Not an event payment, ignored:', { sessionId: session.id, priceId })
    return res.status(200).json({ message: 'Not an event payment, ignored' })
  }

  const email = normalizeEmail(
    fullSession.customer_details?.email ||
    fullSession.customer_email ||
    session.customer_details?.email ||
    session.customer_email
  )

  const clientReferenceId = fullSession.client_reference_id || session.client_reference_id || null

  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  let reg = null

  // Best match: registration ID sent through Stripe as client_reference_id.
  if (clientReferenceId) {
    const { data } = await supabase
      .from('event_registrations')
      .select('id, first_name, last_name, email, include_shirt, shirt_size, payment_status')
      .eq('id', clientReferenceId)
      .maybeSingle()

    if (data) reg = data
  }

  // Fallback: most recent pending registration using Stripe email.
  if (!reg && email) {
    const { data } = await supabase
      .from('event_registrations')
      .select('id, first_name, last_name, email, include_shirt, shirt_size, payment_status')
      .ilike('email', email)
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) reg = data
  }

  // Final fallback: most recent registration with this email, even if not pending.
  if (!reg && email) {
    const { data } = await supabase
      .from('event_registrations')
      .select('id, first_name, last_name, email, include_shirt, shirt_size, payment_status')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) reg = data
  }

  if (!reg) {
    console.error('No matching event registration found', {
      sessionId: session.id,
      email,
      clientReferenceId,
      priceId
    })
    return res.status(200).json({ message: 'No matching event registration found' })
  }

  const { error: updateError } = await supabase
    .from('event_registrations')
    .update({ payment_status: 'paid', stripe_session_id: session.id })
    .eq('id', reg.id)

  if (updateError) {
    console.error('Error updating event registration payment:', updateError)
    return res.status(500).json({ error: updateError.message })
  }

  const cleanName = `${reg.first_name || ''} ${reg.last_name || ''}`.trim() || 'An athlete'

  await notifyCoach(
    'Supertotal Payment Confirmed',
    `${cleanName} completed Supertotal payment.`
  )

  await sendConfirmationEmail(reg, email || reg.email)

  return res.status(200).json({ success: true, registrationId: reg.id })
}
