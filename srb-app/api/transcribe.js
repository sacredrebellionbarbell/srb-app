export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' })
  }

  try {
    const { imageData, mediaType } = req.body

    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided' })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: imageData
              }
            },
            {
              type: 'text',
              text: `You are reading a handwritten or printed gym workout. Extract the workout and return ONLY valid JSON, no other text, no markdown, no backticks.

Return this exact structure:
{
  "title": "workout title or date if visible, otherwise 'Workout'",
  "notes": "any general notes or intent visible",
  "sections": [
    {
      "type": "Strength",
      "score_type": "No Score",
      "notes": "section notes if any",
      "movements": [
        {
          "name": "movement name",
          "notes": "movement notes if any",
          "sets": [
            { "set_number": 1, "reps": "5", "load": "80%", "rpe": "" }
          ]
        }
      ]
    }
  ]
}

Section type must be one of: Warm-Up, Strength, Accessory, Conditioning, Core, Cooldown, Skills, Custom
Score type must be one of: No Score, Heaviest Set, For Time, AMRAP, Max Reps / Calories, Max Distance

Infer score type from context: if it is a timed workout use For Time, if it has weights use Heaviest Set, if it is rounds use AMRAP, otherwise No Score.

If sets are written like 3x5 at 80% create 3 set objects each with reps 5 and load 80%.
If no sets are specified return an empty sets array.
Return ONLY the JSON object.`
            }
          ]
        }]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Anthropic API error' })
    }

    const text = data.content?.[0]?.text || ''
    return res.status(200).json({ text })

  } catch (error) {
    console.error('Transcribe error:', error)
    return res.status(500).json({ error: error.message || 'Server error' })
  }
}
