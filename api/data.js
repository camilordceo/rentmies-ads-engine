/**
 * RENTMIES — DATA ROUTER
 * GET/POST/PUT /api/data?resource=<name>
 *
 * Consolida endpoints utilitarios + nuevos recursos de la plataforma:
 *   inmuebles      → GET  lista de propiedades
 *   metrics        → GET  métricas de ads (demo)
 *   logs           → GET  log de decisiones del analizador
 *   analyze        → POST analiza métricas y decide acción
 *   settings       → GET  estado de variables de entorno
 *   prompts        → GET|PUT  prompts del sistema
 *   publish        → POST publicación genérica (mock)
 *   leads          → POST captura lead del landing
 *   checkout       → POST|GET crea sesión de pago
 *   nocomm         → POST onboarding Sin Comisión
 */

const inmuebles = require('../data/inmuebles.json')
const supabase  = require('../lib/supabase')
const { requireAuth } = require('../lib/auth')

// ── Plans (for checkout) ─────────────────────────────────────────────────────
const PLANS = {
  '30dias-basico':   { name:'30 Días Básico',        price_cop:89000,   billing:'monthly' },
  '30dias-estandar': { name:'30 Días Estándar',       price_cop:199000,  billing:'monthly' },
  '30dias-pro':      { name:'30 Días Pro Agencia',    price_cop:399000,  billing:'monthly' },
  'pro-starter':     { name:'Rentmies Pro Starter',   price_cop:599000,  billing:'monthly' },
  'pro-premium':     { name:'Rentmies Pro Premium',   price_cop:1200000, billing:'monthly' },
  'nocomm':          { name:'Sin Comisión',           price_cop:149000,  billing:'onetime' },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockMetrics(adId, variationType) {
  const profiles = {
    urgency:   { ctrBase: 4.8, cpcBase: 1200, convBase: 0.15 },
    social:    { ctrBase: 3.4, cpcBase: 1400, convBase: 0.12 },
    painPoint: { ctrBase: 2.1, cpcBase: 1800, convBase: 0.08 },
    outcome:   { ctrBase: 1.4, cpcBase: 2400, convBase: 0.06 },
  }
  const p    = profiles[variationType] || profiles.painPoint
  const n    = () => (Math.random() - 0.5) * 0.6
  const imp  = Math.floor(150 + Math.random() * 850)
  const ctr  = Math.max(0.1, p.ctrBase + n() * p.ctrBase)
  const clk  = Math.floor(imp * ctr / 100)
  const cpc  = Math.floor(p.cpcBase * (1 + n()))
  return { adId, impressions: imp, clicks: clk, ctr: parseFloat(ctr.toFixed(2)), cpc, spend: clk * cpc, conversions: Math.floor(clk * (p.convBase + n() * 0.05)) }
}

function decide(m) {
  if (m.impressions < 100)             return { decision: 'mantener',         razon: `Solo ${m.impressions} impresiones. Necesita más datos.`, nuevo_presupuesto: null }
  if (m.ctr < 0.8)                     return { decision: 'pausar',           razon: `CTR ${m.ctr}% bajo el umbral mínimo de 0.8%`, nuevo_presupuesto: null }
  if (m.ctr >= 5 && m.cpc <= 1500)     return { decision: 'escalar_agresivo', razon: `CTR ${m.ctr}% excelente + CPC $${m.cpc} muy eficiente.`, nuevo_presupuesto: 150000 }
  if (m.ctr >= 3 && m.cpc <= 2000)     return { decision: 'escalar',          razon: `CTR ${m.ctr}% sobre umbral, CPC aceptable.`, nuevo_presupuesto: 100000 }
  return                                        { decision: 'mantener',        razon: `CTR ${m.ctr}% aceptable. Monitorear.`, nuevo_presupuesto: null }
}

const DEMO_ADS = [
  { adId: '848000', variationType: 'urgency',   platform: 'meta_feed',      platformName: 'Meta Feed',      ciudad: 'Bogotá' },
  { adId: '849000', variationType: 'social',    platform: 'instagram_feed', platformName: 'Instagram Feed', ciudad: 'Medellín' },
  { adId: '850000', variationType: 'painPoint', platform: 'meta_feed',      platformName: 'Meta Feed',      ciudad: 'Cali' },
  { adId: '851000', variationType: 'outcome',   platform: 'meta_stories',   platformName: 'Meta Stories',   ciudad: 'Bogotá' },
  { adId: '852000', variationType: 'urgency',   platform: 'instagram_feed', platformName: 'Instagram Feed', ciudad: 'Medellín' },
]

const LOG_ENTRIES = [
  { adId: '852000', variationType: 'urgency',   ciudad: 'Medellín', decision: 'escalar_agresivo', ctr: 5.2, cpc: 1100, mins: 18 },
  { adId: '849000', variationType: 'social',    ciudad: 'Medellín', decision: 'escalar',          ctr: 3.8, cpc: 1600, mins: 36 },
  { adId: '848000', variationType: 'urgency',   ciudad: 'Bogotá',   decision: 'mantener',         ctr: 2.1, cpc: 1900, mins: 54 },
  { adId: '851000', variationType: 'outcome',   ciudad: 'Bogotá',   decision: 'mantener',         ctr: 1.5, cpc: 2200, mins: 72 },
  { adId: '850000', variationType: 'painPoint', ciudad: 'Cali',     decision: 'pausar',           ctr: 0.5, cpc: 3100, mins: 90 },
]

const PROMPTS = {
  adCopy: {
    system: 'Eres un experto en marketing inmobiliario colombiano. Escribes copy persuasivo, directo y con urgencia real.',
    variations: {
      painPoint: 'Genera un ad enfocado en el DOLOR del arrendatario: buscar inmueble es frustrante, pierde tiempo, no tiene respuesta.',
      outcome:   'Genera un ad enfocado en el RESULTADO: encontrar el inmueble perfecto rápido, sin llamadas, sin intermediarios.',
      social:    'Genera un ad con PRUEBA SOCIAL: primera inmobiliaria en Colombia con IA que ya cerró ventas y arriendos reales.',
      urgency:   'Genera un ad con URGENCIA: inmuebles se van rápido en Bogotá/Medellín/Cali. Ver primero = arrendar primero.',
    },
  },
  imagePrompts: { style: 'Fotografía arquitectónica profesional, colores cálidos y luminosos, estilo moderno colombiano. NUNCA texto. NUNCA logos.' },
  analysisPrompts: { evaluate: 'Analiza métricas: CTR, CPC, conversiones. Pausar si CTR < 0.8%. Escalar si CTR > 3% y CPC < $2000 COP.' },
}

// ── Router ───────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const resource = req.query.resource || ''

  // checkout y settings son públicos (pricing page, health check)
  if (resource !== 'checkout' && resource !== 'settings') {
    const auth = await requireAuth(req, res); if (!auth) return
  }

  // ── GET /api/data?resource=inmuebles ──
  if (resource === 'inmuebles') {
    return res.status(200).json({ success: true, inmuebles })
  }

  // ── GET /api/data?resource=metrics ──
  if (resource === 'metrics') {
    const ads = DEMO_ADS.map(ad => ({ ...ad, metrics: mockMetrics(ad.adId, ad.variationType) }))
    const totals = ads.reduce((acc, { metrics: m }) => {
      acc.totalImpressions += m.impressions; acc.totalClicks += m.clicks
      acc.totalSpend += m.spend;             acc.totalConversions += m.conversions
      return acc
    }, { totalImpressions: 0, totalClicks: 0, totalSpend: 0, totalConversions: 0 })
    totals.avgCTR      = totals.totalImpressions > 0 ? ((totals.totalClicks / totals.totalImpressions) * 100).toFixed(2) : '0.00'
    totals.costPerLead = totals.totalConversions > 0 ? Math.floor(totals.totalSpend / totals.totalConversions) : 0
    return res.status(200).json({ success: true, ads, totals, activeAds: ads.length })
  }

  // ── GET /api/data?resource=logs ──
  if (resource === 'logs') {
    const RAZONES = {
      pausar: 'CTR por debajo del umbral mínimo de 0.8%', mantener: 'CTR aceptable. Continuar monitoreando.',
      escalar: 'CTR sobre umbral y CPC eficiente. Escalar.', escalar_agresivo: 'CTR excelente + CPC muy bajo. Escalar agresivo ×3.',
    }
    const log = LOG_ENTRIES.map(e => ({
      timestamp: new Date(Date.now() - e.mins * 60000).toISOString(), adId: e.adId,
      variationType: e.variationType, ciudad: e.ciudad, decision: e.decision,
      razon: RAZONES[e.decision],
      nuevo_presupuesto: e.decision === 'escalar_agresivo' ? 150000 : e.decision === 'escalar' ? 100000 : null,
      confianza: e.decision === 'pausar' ? 9 : e.decision.includes('escalar') ? 10 : 7,
      metrics: { ctr: e.ctr, cpc: e.cpc, impressions: 320, clicks: Math.floor(320 * e.ctr / 100), conversions: 4, spend: Math.floor(320 * e.ctr / 100) * e.cpc },
      source: 'rules',
    }))
    return res.status(200).json({ success: true, log })
  }

  // ── POST /api/data?resource=analyze ──
  if (resource === 'analyze') {
    const decisions = DEMO_ADS.map(ad => {
      const metrics = mockMetrics(ad.adId, ad.variationType)
      return { timestamp: new Date().toISOString(), ...ad, metrics, ...decide(metrics), source: 'rules' }
    })
    return res.status(200).json({ success: true, decisions, totalAnalyzed: decisions.length })
  }

  // ── GET /api/data?resource=settings ──
  if (resource === 'settings') {
    const status = {
      meta:     { accessToken: !!process.env.META_ACCESS_TOKEN, adAccountId: !!process.env.META_AD_ACCOUNT_ID, pageId: !!process.env.META_PAGE_ID, igAccountId: !!process.env.META_IG_ACCOUNT_ID },
      google:   { geminiKey: !!process.env.GEMINI_API_KEY },
      tiktok:   { clientKey: !!process.env.TIKTOK_CLIENT_KEY, clientSecret: !!process.env.TIKTOK_CLIENT_SECRET },
      supabase: { url: !!process.env.SUPABASE_URL, key: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
    }
    const allVars    = Object.values(status).flatMap(s => Object.values(s))
    const configured = allVars.filter(Boolean).length
    return res.status(200).json({ success: true, status, summary: { configured, total: allVars.length, ready: configured >= 4 } })
  }

  // ── GET|PUT /api/data?resource=prompts ──
  if (resource === 'prompts') {
    if (req.method === 'PUT') {
      const { promptKey } = req.body || {}
      return res.status(200).json({ success: true, updated: promptKey, note: 'Edita config/prompts.js y redespliega para persistir.', timestamp: new Date().toISOString() })
    }
    return res.status(200).json({ success: true, prompts: PROMPTS })
  }

  // ── POST /api/data?resource=publish ──
  if (resource === 'publish') {
    const { ads = [] } = req.body || {}
    const published = ads.map((ad, i) => ({
      platform: ad.platform, platformName: ad.platformName,
      adId: `12021${Date.now()}${i}`.slice(0, 15), status: 'DRAFT',
      publishedAt: new Date().toISOString(), source: 'mock',
      originalAdId: ad.id, headline: ad.headline, ciudad: ad.ciudad, variationType: ad.variationType,
    }))
    return res.status(200).json({ success: true, published })
  }

  // ── POST /api/data?resource=leads ──────────────────────────────────────────
  if (resource === 'leads') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
    const { name, phone, email='', city='', product='', source='landing', message='' } = req.body || {}
    if (!name || !phone) return res.status(400).json({ error: 'name y phone son requeridos' })
    const leadData = { name: name.trim(), phone: phone.trim(), email: email||null, city: city||null, product: product||null, source, message: message||null, status:'new', created_at: new Date().toISOString() }
    if (supabase) {
      try { await supabase.from('leads').insert(leadData) }
      catch(e) { console.error('[leads]', e.message) }
    }
    console.log(`🔥 LEAD: ${name} · ${phone} · ${product} · ${city}`)
    return res.status(200).json({ success: true, message: 'Lead capturado. Te contactaremos en menos de 2 horas.' })
  }

  // ── GET|POST /api/data?resource=checkout ────────────────────────────────────
  if (resource === 'checkout') {
    if (req.method === 'GET') {
      const { plan_id } = req.query
      if (plan_id && PLANS[plan_id]) return res.status(200).json({ success: true, plan: { id: plan_id, ...PLANS[plan_id] } })
      return res.status(200).json({ success: true, plans: PLANS })
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST required' })
    const { plan_id, name='', email='', phone='' } = req.body || {}
    if (!plan_id || !PLANS[plan_id]) return res.status(400).json({ error: `Plan inválido: ${plan_id}` })
    const plan = PLANS[plan_id]
    const waMsg = encodeURIComponent(`Hola Rentmies! Quiero contratar ${plan.name} ($${plan.price_cop.toLocaleString('es-CO')} COP). Nombre: ${name}. WhatsApp: ${phone}`)
    const checkoutUrl = `https://wa.me/573001234567?text=${waMsg}`
    return res.status(200).json({ success: true, checkout_url: checkoutUrl, plan: { id: plan_id, ...plan }, fallback: true })
  }

  // ── POST /api/data?resource=nocomm ──────────────────────────────────────────
  if (resource === 'nocomm') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
    const { seller_name, seller_phone, seller_email='', property_type='apartamento', city='Bogotá', neighborhood='', price=0, area=0, bedrooms=0, bathrooms=0, description='', images=[] } = req.body || {}
    if (!seller_name || !seller_phone) return res.status(400).json({ error: 'seller_name y seller_phone requeridos' })
    const start = new Date()
    const end   = new Date(start.getTime() + 30*24*60*60*1000)
    const mockId = `nocomm-${Date.now()}`
    if (supabase) {
      try {
        await supabase.from('nocomm_listings').insert({ property_type, city, neighborhood, price:price||null, area:area||null, bedrooms:bedrooms||null, bathrooms:bathrooms||null, description, seller_name, seller_phone, seller_email:seller_email||null, images:images.length?images:null, status:'active', campaign_start:start.toISOString(), campaign_end:end.toISOString() })
      } catch(e) { console.error('[nocomm]', e.message) }
    }
    return res.status(200).json({ success: true, listing_id: mockId, campaign: { start, end, posts: 12 } })
  }

  res.status(400).json({ error: `Recurso desconocido: '${resource}'. Usa ?resource=inmuebles|metrics|logs|analyze|settings|prompts|publish|leads|checkout|nocomm` })
}
