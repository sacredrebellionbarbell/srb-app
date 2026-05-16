import { createClient } from '@supabase/supabase-js'

// Price ID to product name mapping
const PRICE_TO_PRODUCT = {
  'price_1TToui1vlP8rpquAesmlYqy3': 'Online Training',
  'price_1TQ9LM1vlP8rpquA4EFaK5U9': 'Class Drop In',
  'price_1TQ9KO1vlP8rpquA5b6kGwlx': 'Nutrition Coaching',
  'price_1TQ9J41vlP8rpquAcSgHcbZb': 'Personal Training 3x/Week',
  'price_1TQ9Ha1vlP8rpquAInlmjvYP': 'Personal Training 2x/Week',
  'price_1TQ9Fx1vlP8rpquALxR003aq': 'Class Access',
}

// Product to membership_type mapping (for backwards compatibility)
const PRODUCT_TO_MEMBERSHIP = {
  'Online Training': 'Personal Training',
  'Class Drop In': 'Class Access',
  'Nutrition Coaching': 'Nutrition',
  'Personal Training 3x/Week': 'Personal Training',
  'Personal Training 2x/Week': 'Personal Training',
  'Class Access': 'Class Access',
}

// Derive legacy membership_type from active products array
function deriveMembershipType(products) {
  const hasClass = products.some(p => ['Class Access', 'Class Drop In'].includes(p))
  const hasPT = products.some(p => ['Personal Training 2x/Week', 'Personal Training 3x/Week', 'Online Training'].includes(p))
  if (hasClass && hasPT) return 'Both'
  if (hasPT) return 'Personal Training'
  if (hasClass) return 'Class Access'
  return 'None'
}

// Raw body parser — needed for Stripe signature verification
export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const stripeKey = process.env.STRIPE_SECRET_KEY

  if (!webhookSecret || !stripeKey) {
    console.error('Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  // Verify Stripe signature
  const sig = req.headers['stripe-signature']
  const rawBody = await getRawBody(req)

  let event
  try {
    const stripe = require('stripe')(stripeKey)
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).json({ error: `Webhook Error: ${err.message}` })
  }

  // Initialize Supabase with service role key to bypass RLS
  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const subscription = event.data.object

  // Get customer email from Stripe
  let customerEmail = subscription.customer_email
  if (!customerEmail) {
    try {
      const stripe = require('stripe')(stripeKey)
      const customer = await stripe.customers.retrieve(subscription.customer)
      customerEmail = customer.email
    } catch (err) {
      console.error('Failed to retrieve customer:', err.message)
      return res.status(400).json({ error: 'Could not retrieve customer email' })
    }
  }

  if (!customerEmail) {
    console.error('No customer email found')
    return res.status(400).json({ error: 'No customer email' })
  }

  // Find profile by email
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, active_products, membership_type')
    .eq('email', customerEmail)
    .maybeSingle()

  // If no profile found by email, try auth.users
  let athleteId = profile?.id
  if (!athleteId) {
    const { data: authUser } = await supabase.auth.admin.listUsers()
    const matchedUser = authUser?.users?.find(u => u.email === customerEmail)
    if (matchedUser) athleteId = matchedUser.id
  }

  if (!athleteId) {
    console.error('No profile found for email:', customerEmail)
    return res.status(200).json({ message: 'No profile found, skipping' })
  }

  // Get price ID from subscription
  const priceId = subscription.items?.data?.[0]?.price?.id
  const productName = PRICE_TO_PRODUCT[priceId]

  if (!productName) {
    console.error('Unknown price ID:', priceId)
    return res.status(200).json({ message: 'Unknown price, skipping' })
  }

  // Get current active products
  const currentProducts = profile?.active_products || []

  let newProducts
  if (event.type === 'customer.subscription.deleted') {
    // Remove this product
    newProducts = currentProducts.filter(p => p !== productName)
  } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    if (subscription.status === 'active' || subscription.status === 'trialing') {
      // Add product if not already present
      newProducts = currentProducts.includes(productName)
        ? currentProducts
        : [...currentProducts, productName]
    } else {
      // Subscription not active — remove it
      newProducts = currentProducts.filter(p => p !== productName)
    }
  } else {
    return res.status(200).json({ message: 'Unhandled event type' })
  }

  const newMembershipType = deriveMembershipType(newProducts)

  // Update profile
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      active_products: newProducts,
      membership_type: newMembershipType
    })
    .eq('id', athleteId)

  if (updateError) {
    console.error('Failed to update profile:', updateError.message)
    return res.status(500).json({ error: 'Database update failed' })
  }

  console.log(`Updated ${customerEmail}: products=${JSON.stringify(newProducts)}, membership=${newMembershipType}`)
  return res.status(200).json({ success: true, products: newProducts, membership: newMembershipType })
}
