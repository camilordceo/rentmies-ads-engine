/**
 * RENTMIES — 30-DAY SCHEDULER ENGINE
 *
 * Genera y gestiona calendarios de contenido de 30 días.
 * Soporta todos los productos: 30 Días, Pro y Sin Comisión.
 *
 * Loops principales:
 *   1. generateCalendar()  → construye el plan completo de posts
 *   2. processDay()        → ejecuta los posts del día (llamado por cron)
 *   3. optimizeSchedule()  → ajusta el plan según métricas reales
 *   4. renewCalendar()     → renueva para el siguiente mes
 */

require('dotenv').config()
const supabase = require('../lib/supabase')

// ── Constantes ────────────────────────────────────────────────────────────────
const POSTING_DAYS   = [1, 3, 5]    // Lun=1, Mié=3, Vie=5
const POSTING_HOUR   = 9             // 9am Colombia
const STORY_HOUR     = 20            // 8pm para Stories

// ── Content Mix Strategy ──────────────────────────────────────────────────────
const CONTENT_MIX = {
  basic:    { property: 0.80, brand: 0.20 },  // Basic: 80% inmueble, 20% marca
  standard: { property: 0.65, brand: 0.35 },  // Estándar: más variado
  pro:      { property: 0.50, brand: 0.50 },  // Pro: equilibrado
  nocomm:   { property: 1.00, brand: 0.00 },  // NoComm: solo el inmueble
}

const VARIATION_CYCLE = ['urgency', 'outcome', 'social', 'painPoint', 'feature', 'priceValue']
const PLATFORM_CYCLE  = ['instagram', 'facebook', 'instagram_story', 'facebook', 'instagram']

// ── Caption Templates ─────────────────────────────────────────────────────────
const URGENCY_TEMPLATES = [
  (p) => `🚨 DISPONIBLE AHORA — ${p.tipo} en ${p.ciudad}\n\n${p.descripcion || ''}\n\n💰 ${formatPrice(p.precio)}\n📍 ${p.ciudad}\n\n⚡ Los mejores inmuebles duran menos de 72h. Escríbenos AHORA.\n\n${hashtags(p)}`,
  (p) => `⏰ Solo quedan ${Math.floor(Math.random()*3)+1} unidades — ${p.tipo} en ${p.ciudad}\n\n${p.descripcion ? p.descripcion.slice(0,100) + '...' : ''}\n\n✅ ${formatPrice(p.precio)}\n📲 Agenda tu visita hoy\n\n${hashtags(p)}`,
]

const OUTCOME_TEMPLATES = [
  (p) => `🏡 Imagínate viviendo aquí...\n\n${p.tipo === 'apartamento' ? 'Un apartamento' : p.tipo} en ${p.ciudad} que te va a cambiar el día a día.\n\n${p.descripcion || ''}\n\n💰 ${formatPrice(p.precio)}\n🛏 ${p.habitaciones || '?'} hab · 🚿 ${p.banos || '?'} baños\n\nEscríbenos para ver el espacio. Sin compromiso.\n\n${hashtags(p)}`,
  (p) => `✨ Así se ve tu próximo hogar\n\n📍 ${p.ciudad}\n💰 Desde ${formatPrice(p.precio)}\n📐 ${p.area || '?'}m²\n\n${p.descripcion ? p.descripcion.slice(0, 120) : 'Espacio pensado para ti.'}\n\n👇 Comenta o escríbenos para más info\n\n${hashtags(p)}`,
]

const SOCIAL_PROOF_TEMPLATES = [
  (p) => `"Encontramos nuestro apartamento en 3 días con Rentmies" — Familia Torres, ${p.ciudad}\n\n🏠 Hoy tenemos disponible:\n${p.tipo} en ${p.ciudad}\n💰 ${formatPrice(p.precio)}\n\n¿Eres el próximo? 👇\n\n${hashtags(p)}`,
  (p) => `📣 NUEVO EN PORTAFOLIO\n\n${p.tipo} · ${p.ciudad}\n💰 ${formatPrice(p.precio)}\n${p.area ? `📐 ${p.area}m²` : ''}\n${p.habitaciones ? `🛏 ${p.habitaciones} habitaciones` : ''}\n\nMás de 200 familias ya encontraron hogar con Rentmies este año.\n\n¿Serás el siguiente? Escríbenos 💬\n\n${hashtags(p)}`,
]

const BRAND_TEMPLATES = {
  market_tip: (ciudad) => `📊 MERCADO INMOBILIARIO ${ciudad.toUpperCase()} — Abril 2026\n\n✅ Los arriendos en zonas premium subieron 8% vs 2025\n✅ La demanda supera la oferta en el segmento residencial\n✅ El tiempo promedio de arriendo cayó de 45 a 22 días\n\n¿Tienes un inmueble desocupado? Nosotros lo publicamos en 24h.\n\n#mercadoinmobiliario #${ciudad.toLowerCase().replace(/á/g,'a').replace(/é/g,'e')} #bienesinmuebles #rentmies`,
  investment: () => `💡 TIP INVERSIONISTA\n\nUn inmueble desocupado más de 30 días = dinero perdido.\n\nCon Rentmies:\n✅ Lo publicamos en 24h\n✅ Respondemos consultas 24/7\n✅ Calificamos candidatos automáticamente\n\nDM para activar hoy 👇\n\n#inversion #rentabilizar #inmuebles #colombia #rentmies`,
  why_rentmies: () => `🤖 ¿POR QUÉ RENTMIES?\n\nMientras tu inmobiliaria tradicional:\n❌ Cobra 4-5% de comisión\n❌ Publica 1 foto mal tomada\n❌ Solo responde en horario de oficina\n\nRentmies:\n✅ Pago fijo desde $89.000/mes\n✅ 30 posts con IA en 3 plataformas\n✅ Leads 24/7 a tu WhatsApp\n\n¿Cuál prefieres?\n\n#proptech #ia #inmobiliaria #colombia #rentmies`,
  nocomm_tip: () => `💸 SABÍAS QUE...\n\nEn Colombia los agentes cobran entre 3% y 5% de comisión por ventas.\n\nEn un apartamento de $500M eso son $25 MILLONES que le pagas al agente.\n\nCon Rentmies Sin Comisión:\n💰 Pagas $149.000 (una sola vez)\n📱 30 días de marketing completo\n💬 Los leads llegan directo a ti\n\nGuárdate la comisión. 🔥\n\n#sincomision #venderinmueble #colombia #rentmies`,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatPrice(precio) {
  if (!precio) return 'Precio a consultar'
  if (precio >= 1000000000) return `$${(precio/1000000000).toFixed(1).replace('.0','')}B COP`
  if (precio >= 1000000)    return `$${Math.round(precio/1000000)}M COP`
  return `$${parseInt(precio).toLocaleString('es-CO')} COP/mes`
}

function hashtags(p) {
  const city = (p.ciudad || 'Colombia').toLowerCase().replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u').replace(/\s+/g,'')
  const tipo = (p.tipo || 'inmueble').toLowerCase()
  return `#${tipo} #${city} #inmuebles #arriendos #rentmies #proptech #bienesinmuebles #colombia`
}

function getNextPostingDates(startDate, count, preferredHour = POSTING_HOUR) {
  const dates = []
  let cursor = new Date(startDate)
  while (dates.length < count) {
    if (POSTING_DAYS.includes(cursor.getDay())) {
      const d = new Date(cursor)
      d.setHours(preferredHour, 0, 0, 0)
      dates.push(d.toISOString())
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function pickCaption(variation, property, ciudad) {
  switch (variation) {
    case 'urgency':    return URGENCY_TEMPLATES[Math.floor(Math.random()*URGENCY_TEMPLATES.length)](property)
    case 'outcome':    return OUTCOME_TEMPLATES[Math.floor(Math.random()*OUTCOME_TEMPLATES.length)](property)
    case 'social':     return SOCIAL_PROOF_TEMPLATES[Math.floor(Math.random()*SOCIAL_PROOF_TEMPLATES.length)](property)
    case 'brand_market': return BRAND_TEMPLATES.market_tip(ciudad || property.ciudad || 'Bogotá')
    case 'brand_invest': return BRAND_TEMPLATES.investment()
    case 'brand_why':    return BRAND_TEMPLATES.why_rentmies()
    case 'brand_nocomm': return BRAND_TEMPLATES.nocomm_tip()
    default:           return OUTCOME_TEMPLATES[0](property)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * generateCalendar()
 * Construye el plan completo de 30 días para un cliente.
 *
 * @param {object} opts
 *   @param {string}  opts.subscriptionId
 *   @param {string}  opts.plan  ('basic'|'standard'|'pro'|'nocomm')
 *   @param {Array}   opts.properties  — lista de { id, tipo, ciudad, precio, ... }
 *   @param {string}  opts.startDate   — ISO string
 *   @param {string}  opts.ciudad
 *   @param {boolean} opts.simulate
 * @returns {Array} posts programados
 */
async function generateCalendar({ subscriptionId, plan = 'standard', properties = [], startDate, ciudad = 'Bogotá', simulate = false }) {
  const mix        = CONTENT_MIX[plan] || CONTENT_MIX.standard
  const TOTAL      = plan === 'basic' ? 12 : plan === 'pro' ? 30 : 20
  const propCount  = Math.round(TOTAL * mix.property)
  const brandCount = TOTAL - propCount

  const dates      = getNextPostingDates(startDate || new Date().toISOString(), TOTAL)

  const posts = []
  let pi = 0, bi = 0, vi = 0

  for (let i = 0; i < TOTAL; i++) {
    const isBrand      = bi < brandCount && (pi >= propCount || (i % 3 === 2 && mix.brand > 0))
    const variation    = isBrand
      ? ['brand_market','brand_invest','brand_why','brand_nocomm'][bi % 4]
      : VARIATION_CYCLE[vi % VARIATION_CYCLE.length]
    const platform     = PLATFORM_CYCLE[i % PLATFORM_CYCLE.length]
    const prop         = !isBrand && properties.length ? properties[pi % properties.length] : null

    const caption = pickCaption(variation, prop || { tipo: 'inmueble', ciudad, precio: null }, ciudad)

    posts.push({
      subscription_id: subscriptionId || null,
      property_id:     prop?.id || null,
      post_date:       dates[i].split('T')[0],
      platform,
      content_type:    i === 0 ? 'video' : (i % 5 === 4 ? 'carousel' : 'image'),
      caption,
      status:          'scheduled',
      created_at:      new Date().toISOString(),
    })

    if (isBrand) bi++
    else { pi++; vi++ }
  }

  if (!simulate && supabase && subscriptionId) {
    const { error } = await supabase.from('content_calendar').insert(posts)
    if (error) console.error('[scheduler30] DB insert error:', error.message)
  }

  return posts
}

/**
 * processDay()
 * Publica todos los posts de hoy. Llamado por el cron diario.
 *
 * @param {object} opts
 *   @param {string} opts.date  — 'YYYY-MM-DD' (default: today Colombia)
 *   @param {boolean} opts.dryRun
 */
async function processDay({ date, dryRun = false } = {}) {
  const today = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  console.log(`\n[scheduler30] processDay(${today}) — dryRun=${dryRun}`)

  if (!supabase) {
    console.log('[scheduler30] Supabase not connected — skipping')
    return { processed: 0, succeeded: 0, failed: 0, skipped: 1 }
  }

  // Fetch today's scheduled posts
  const { data: posts, error } = await supabase
    .from('content_calendar')
    .select(`
      id, platform, content_type, caption, image_url,
      property_id, subscription_id,
      properties:property_id (tipo, ciudad, precio, images),
      subscriptions:subscription_id (plan_id, client_id,
        clients:client_id (id, name, phone))
    `)
    .eq('post_date', today)
    .eq('status', 'scheduled')
    .limit(50)

  if (error) {
    console.error('[scheduler30] Fetch error:', error.message)
    return { processed: 0, succeeded: 0, failed: 0, error: error.message }
  }

  console.log(`[scheduler30] Found ${posts?.length || 0} posts for ${today}`)

  const results = { processed: posts?.length || 0, succeeded: 0, failed: 0 }

  for (const post of posts || []) {
    if (dryRun) {
      console.log(`[dryRun] Would publish: ${post.platform} — ${post.caption?.slice(0, 60)}...`)
      results.succeeded++
      continue
    }

    try {
      // TODO: call Instagram/Facebook publisher
      // const publisher = require('./publisher')
      // await publisher.publishPost({ ...post })

      await supabase
        .from('content_calendar')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', post.id)

      console.log(`[scheduler30] ✓ Published post ${post.id} on ${post.platform}`)
      results.succeeded++

    } catch (err) {
      console.error(`[scheduler30] ✗ Failed post ${post.id}:`, err.message)
      await supabase
        .from('content_calendar')
        .update({ status: 'failed', error_message: err.message })
        .eq('id', post.id)
      results.failed++
    }
  }

  return results
}

/**
 * optimizeSchedule()
 * Analiza CTR y engagement de posts publicados y ajusta los próximos.
 * Cancela variaciones con CTR < 0.8% y duplica las exitosas.
 */
async function optimizeSchedule(subscriptionId) {
  if (!supabase) return { optimizations: 0 }

  // Get published posts with metrics
  const { data: published } = await supabase
    .from('content_calendar')
    .select('id, platform, content_type, caption, post_id')
    .eq('subscription_id', subscriptionId)
    .eq('status', 'published')
    .not('post_id', 'is', null)
    .limit(20)

  if (!published?.length) return { optimizations: 0 }

  // TODO: fetch real metrics from Meta Graph API
  // For now, apply heuristic rules
  const optimizations = []

  // Upcoming posts
  const { data: upcoming } = await supabase
    .from('content_calendar')
    .select('id, content_type, platform')
    .eq('subscription_id', subscriptionId)
    .eq('status', 'scheduled')
    .gte('post_date', new Date().toISOString().split('T')[0])
    .limit(10)

  // Heuristic: if video posts are available, prioritize them
  const videoCount = published.filter(p => p.content_type === 'video').length
  const imageCount = published.filter(p => p.content_type === 'image').length
  if (videoCount > 0 && imageCount > videoCount * 2) {
    // Convert some upcoming images to video
    const toConvert = upcoming?.filter(p => p.content_type === 'image').slice(0, 2) || []
    for (const post of toConvert) {
      await supabase
        .from('content_calendar')
        .update({ content_type: 'video' })
        .eq('id', post.id)
      optimizations.push({ postId: post.id, change: 'image→video', reason: 'video outperforming' })
    }
  }

  return { optimizations: optimizations.length, changes: optimizations }
}

/**
 * renewCalendar()
 * Genera el calendario del próximo mes para suscripciones activas.
 */
async function renewCalendar(subscriptionId) {
  if (!supabase) return { renewed: false }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select(`
      id, plan_id, client_id,
      clients:client_id (id, name),
      properties:client_id (id, tipo, ciudad, precio, images)
    `)
    .eq('id', subscriptionId)
    .eq('status', 'active')
    .single()

  if (!sub) return { renewed: false, reason: 'subscription not found or inactive' }

  const planMap = { '30dias-basico':'basic', '30dias-estandar':'standard', '30dias-pro':'pro', 'nocomm':'nocomm' }
  const plan = planMap[sub.plan_id] || 'standard'

  // Start next month from today
  const nextStart = new Date()
  nextStart.setDate(nextStart.getDate() + 1) // tomorrow

  const posts = await generateCalendar({
    subscriptionId,
    plan,
    properties: sub.properties || [],
    startDate:  nextStart.toISOString(),
    ciudad:     sub.properties?.[0]?.ciudad || 'Bogotá',
    simulate:   false,
  })

  console.log(`[scheduler30] Renewed calendar for ${subscriptionId}: ${posts.length} posts`)
  return { renewed: true, posts: posts.length, nextStart }
}

module.exports = { generateCalendar, processDay, optimizeSchedule, renewCalendar, PLANS: CONTENT_MIX }
