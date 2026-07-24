import { createClient } from '@supabase/supabase-js'

const HIGH_FIVE_DELAY_MINUTES = 60
const LOOKBACK_HOURS = 72
const BATCH_SIZE = 500

function isAuthorized(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization
  return Boolean(process.env.CRON_SECRET) && authHeader === `Bearer ${process.env.CRON_SECRET}`
}

async function getHighFiveCoachId(supabase) {
  if (process.env.COACH_HIGHFIVE_USER_ID) return process.env.COACH_HIGHFIVE_USER_ID

  let query = supabase
    .from('profiles')
    .select('id')
    .order('id', { ascending: true })
    .limit(1)

  if (process.env.COACH_HIGHFIVE_EMAIL) {
    query = query.ilike('email', process.env.COACH_HIGHFIVE_EMAIL.trim())
  } else {
    query = query.eq('role', 'coach')
  }

  const { data, error } = await query.maybeSingle()

  if (error) throw error
  return data?.id || null
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey || !process.env.CRON_SECRET) {
    return res.status(500).json({ error: 'Required environment variables are not configured' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const coachId = await getHighFiveCoachId(supabase)

  if (!coachId) {
    return res.status(200).json({ message: 'No coach profile found for auto high-fives', added: 0 })
  }

  const cutoff = new Date(Date.now() - HIGH_FIVE_DELAY_MINUTES * 60 * 1000).toISOString()
  const recentWindowStart = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()

  try {
    const { data: results, error } = await supabase
      .from('results')
      .select('id, athlete_id, created_at, reactions(id, athlete_id, type)')
      .not('athlete_id', 'is', null)
      .gte('created_at', recentWindowStart)
      .lt('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(BATCH_SIZE)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const eligible = (results || []).filter(result => {
      if (!result.id || result.athlete_id === coachId) return false
      return !(result.reactions || []).some(reaction => reaction.athlete_id === coachId)
    })

    if (!eligible.length) {
      return res.status(200).json({ added: 0, checked: results?.length || 0 })
    }

    const resultIds = eligible.map(result => result.id)
    const { data: existingReactions, error: existingError } = await supabase
      .from('reactions')
      .select('result_id')
      .eq('athlete_id', coachId)
      .in('result_id', resultIds)

    if (existingError) {
      return res.status(500).json({ error: existingError.message })
    }

    const alreadyReacted = new Set((existingReactions || []).map(reaction => reaction.result_id))
    const inserts = eligible.filter(result => !alreadyReacted.has(result.id)).map(result => ({
      result_id: result.id,
      athlete_id: coachId,
      type: 'highfive'
    }))

    if (!inserts.length) {
      return res.status(200).json({ added: 0, checked: results?.length || 0 })
    }

    const { error: insertError } = await supabase.from('reactions').insert(inserts)

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(200).json({ added: 0, checked: results?.length || 0, skippedDuplicate: true })
      }
      return res.status(500).json({ error: insertError.message })
    }

    return res.status(200).json({ added: inserts.length, checked: results?.length || 0 })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Auto high-five failed' })
  }
}
