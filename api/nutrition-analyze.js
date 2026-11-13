import { createClient } from '@supabase/supabase-js'

function outputText(payload) {
  return (payload.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text')
    .map(item => item.text)
    .join('')
}

async function authenticatedUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const client = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
  )
  const { data, error } = await client.auth.getUser(token)
  return error ? null : data.user
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const user = await authenticatedUser(req)
  if (!user) return res.status(401).json({ error: 'Please sign in again.' })
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'Meal photo analysis is not configured yet. Add OPENAI_API_KEY in Vercel.' })
  }

  const { imageData, mediaType = 'image/jpeg' } = req.body || {}
  if (!imageData) return res.status(400).json({ error: 'Choose a meal photo first.' })
  if (imageData.length > 5_500_000) return res.status(413).json({ error: 'That photo is too large. Please choose a smaller image.' })

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['foods', 'summary', 'needs_clarification'],
    properties: {
      summary: { type: 'string' },
      needs_clarification: { type: 'boolean' },
      foods: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'amount', 'unit', 'calories', 'protein', 'carbs', 'fat', 'confidence', 'note'],
          properties: {
            name: { type: 'string' },
            amount: { type: 'number' },
            unit: { type: 'string' },
            calories: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
            confidence: { type: 'number' },
            note: { type: 'string' }
          }
        }
      }
    }
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_NUTRITION_MODEL || 'gpt-5.4-mini',
        store: false,
        input: [{
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Identify each visible food and estimate the amount and nutrition. Combine repeated identical foods into one item with the total quantity: for example, four slices of toast must be one food with amount 4 and unit slices, not four separate foods. Calories and macros for that item must cover the full quantity shown. Calories and macros must match the estimated portion, not 100 grams. Be conservative about certainty. Do not invent hidden oils, butter, sauces, dressings, fillings, brands, or cooking ingredients; mention uncertainty in note instead. Return grams when reasonably possible. This is an editable estimate that the athlete must confirm.'
            },
            {
              type: 'input_image',
              image_url: `data:${mediaType};base64,${imageData}`,
              detail: 'high'
            }
          ]
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'meal_estimate',
            strict: true,
            schema
          }
        }
      })
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Meal analysis failed.' })
    const text = outputText(data)
    if (!text) return res.status(502).json({ error: 'No meal estimate was returned.' })
    return res.status(200).json(JSON.parse(text))
  } catch (error) {
    console.error('Nutrition analysis error:', error)
    return res.status(500).json({ error: error.message || 'Meal analysis failed.' })
  }
}
