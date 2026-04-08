/**
 * RENTMIES — SIN COMISIÓN ONBOARDING
 * POST /api/nocomm-onboard
 *
 * Crea un listing No-Comisión después del pago.
 * Guarda el inmueble, activa el calendario de 30 días y
 * genera la página pública del inmueble.
 *
 * Body:
 *   seller_name   : string
 *   seller_phone  : string
 *   seller_email  : string
 *   property_type : 'apartamento' | 'casa' | 'lote' | 'local'
 *   city          : 'Bogotá' | 'Medellín' | 'Cali'
 *   neighborhood  : string
 *   price         : number  (en COP)
 *   area          : number  (m²)
 *   bedrooms      : number
 *   bathrooms     : number
 *   description   : string
 *   images        : string[] (URLs públicas — ya subidas a Supabase Storage)
 *   payment_ref   : string  (referencia de pago)
 */

const supabase = require('../lib/supabase')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    seller_name,
    seller_phone,
    seller_email  = '',
    property_type = 'apartamento',
    city          = 'Bogotá',
    neighborhood  = '',
    price         = 0,
    area          = 0,
    bedrooms      = 0,
    bathrooms     = 0,
    description   = '',
    images        = [],
    payment_ref   = '',
  } = req.body || {}

  if (!seller_name || !seller_phone) {
    return res.status(400).json({ error: 'seller_name y seller_phone son requeridos' })
  }

  const campaignStart = new Date()
  const campaignEnd   = new Date(campaignStart.getTime() + 30 * 24 * 60 * 60 * 1000)

  // ── SIMULATION if Supabase not connected ─────────────────────────────────
  if (!supabase) {
    const mockId   = `nocomm-${Date.now()}`
    const mockSlug = `${city.toLowerCase()}-${property_type}-${mockId.slice(-6)}`
    return res.status(200).json({
      success:    true,
      simulated:  true,
      listing_id: mockId,
      listing_url:`https://rentmies.co/inmueble/${mockSlug}`,
      campaign:   { start: campaignStart, end: campaignEnd, posts: 12 },
      message:    'Listing creado (simulado). Conecta Supabase para activación real.',
    })
  }

  try {
    // 1. Buscar o crear client
    let clientId = null
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id')
      .eq('phone', seller_phone)
      .single()

    if (existingClient) {
      clientId = existingClient.id
    } else {
      const { data: newClient } = await supabase
        .from('clients')
        .insert({
          name:  seller_name,
          email: seller_email || null,
          phone: seller_phone,
          plan:  'nocomm',
        })
        .select('id')
        .single()
      if (newClient) clientId = newClient.id
    }

    // 2. Crear listing en nocomm_listings
    const { data: listing, error: listingError } = await supabase
      .from('nocomm_listings')
      .insert({
        client_id:       clientId,
        property_type,
        city,
        neighborhood,
        price:           price || null,
        area:            area || null,
        bedrooms:        bedrooms || null,
        bathrooms:       bathrooms || null,
        description,
        seller_name,
        seller_phone,
        seller_email:    seller_email || null,
        images:          images.length ? images : null,
        status:          'active',
        campaign_start:  campaignStart.toISOString(),
        campaign_end:    campaignEnd.toISOString(),
        created_at:      new Date().toISOString(),
      })
      .select('id')
      .single()

    if (listingError) throw new Error(listingError.message)

    // 3. Crear property en properties table
    const { data: property } = await supabase
      .from('properties')
      .insert({
        client_id:   clientId,
        tipo:        property_type,
        ciudad:      city,
        precio:      price || null,
        area:        area || null,
        habitaciones:bedrooms || null,
        banos:       bathrooms || null,
        descripcion: description,
        images:      images.length ? images : null,
        status:      'disponible',
      })
      .select('id')
      .single()

    // 4. Crear content calendar (12 posts in 30 days, Mon/Wed/Fri)
    const CALENDAR_DAYS = [1, 3, 5] // Mon, Wed, Fri
    const posts = []
    let cursor  = new Date(campaignStart)
    let added   = 0

    while (added < 12) {
      const dow = cursor.getDay()
      if (CALENDAR_DAYS.includes(dow)) {
        const postDate = new Date(cursor)
        postDate.setHours(9, 0, 0, 0) // 9am Colombia
        posts.push({
          subscription_id: null,
          property_id:     property?.id || null,
          post_date:       postDate.toISOString().split('T')[0],
          platform:        added % 3 === 2 ? 'facebook' : 'instagram',
          content_type:    added === 0 ? 'video' : 'image',
          status:          'scheduled',
          created_at:      new Date().toISOString(),
        })
        added++
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    if (posts.length) {
      await supabase.from('content_calendar').insert(posts)
    }

    // 5. Generate listing URL
    const slug = `${city.toLowerCase().replace(/\s+/g, '-')}-${property_type}-${listing.id.slice(-8)}`
    const listingUrl = `${process.env.APP_URL || 'https://ads-generator.vercel.app'}/inmueble/${slug}`

    return res.status(200).json({
      success:     true,
      simulated:   false,
      listing_id:  listing.id,
      listing_url: listingUrl,
      property_id: property?.id || null,
      client_id:   clientId,
      campaign: {
        start:    campaignStart.toISOString(),
        end:      campaignEnd.toISOString(),
        posts:    posts.length,
        schedule: posts.map(p => ({ date: p.post_date, platform: p.platform, type: p.content_type })),
      },
    })

  } catch (err) {
    console.error('[nocomm-onboard] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
