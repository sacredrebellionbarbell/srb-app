import { createClient } from '@supabase/supabase-js'

async function authenticatedUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const client = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY)
  const { data, error } = await client.auth.getUser(token)
  return error ? null : data.user
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
}

function offProduct(product) {
  const n = product.nutriments || {}
  return {
    id: product.code || product._id || '',
    name: product.product_name || product.generic_name || 'Packaged food',
    brand: product.brands || '',
    amount: 100,
    unit: 'g',
    servingLabel: product.serving_size || '100 g',
    calories: number(n['energy-kcal_100g']),
    protein: number(n.proteins_100g),
    carbs: number(n.carbohydrates_100g),
    fat: number(n.fat_100g),
    source: 'Open Food Facts'
  }
}

function nutrient(food, names) {
  const row = (food.foodNutrients || []).find(item => names.includes(item.nutrientName))
  return number(row?.value)
}

function usdaFood(food) {
  return {
    id: String(food.fdcId),
    name: food.description || 'Food',
    brand: food.brandOwner || food.brandName || '',
    amount: 100,
    unit: 'g',
    servingLabel: '100 g',
    calories: nutrient(food, ['Energy']),
    protein: nutrient(food, ['Protein']),
    carbs: nutrient(food, ['Carbohydrate, by difference']),
    fat: nutrient(food, ['Total lipid (fat)']),
    source: 'USDA FoodData Central'
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!await authenticatedUser(req)) return res.status(401).json({ error: 'Please sign in again.' })

  const barcode = String(req.query.barcode || '').replace(/\D/g, '')
  const query = String(req.query.q || '').trim()
  try {
    if (barcode) {
      const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`)
      const data = await response.json()
      if (!response.ok || data.status !== 1 || !data.product) return res.status(404).json({ error: 'Barcode not found. You can enter this food manually.' })
      return res.status(200).json({ foods: [offProduct({ ...data.product, code: barcode })] })
    }

    if (query.length < 2) return res.status(400).json({ error: 'Enter at least two letters.' })
    if (process.env.USDA_API_KEY) {
      const response = await fetch('https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(process.env.USDA_API_KEY), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, pageSize: 12 })
      })
      const data = await response.json()
      if (response.ok) return res.status(200).json({ foods: (data.foods || []).map(usdaFood) })
    }

    const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=12`)
    const data = await response.json()
    return res.status(200).json({ foods: (data.products || []).filter(p => p.product_name).map(offProduct) })
  } catch (error) {
    console.error('Food lookup error:', error)
    return res.status(500).json({ error: 'Food search is temporarily unavailable.' })
  }
}
