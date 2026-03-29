/**
 * RENTMIES ADS ENGINE — GOOGLE ADS API
 *
 * ─── ESTRUCTURA DE UNA CAMPAÑA GOOGLE ADS ───────────────────────────
 *
 *  CampaignBudget          ← presupuesto diario (independiente)
 *       │
 *  Campaign                ← tipo (Search / PMax), bidding, geo
 *       │
 *  AdGroup                 ← segmento / conjunto de palabras clave
 *       │
 *  ├── AdGroupCriteria     ← keywords (broad / phrase / exact)
 *  └── AdGroupAd           ← Responsive Search Ad (RSA)
 *           ├── headlines  (hasta 15, máx 30 chars c/u)
 *           └── descriptions (hasta 4, máx 90 chars c/u)
 *
 * ─── AUTH ──────────────────────────────────────────────────────────
 *  Google Ads requiere OAuth2 + developer token:
 *    1. developer-token   → Google Ads API Center (tu cuenta MCC)
 *    2. client_id/secret  → Google Cloud Console → OAuth2 credentials
 *    3. refresh_token     → run OAuth2 flow once, save token
 *    4. customer_id       → Google Ads account ID (sin guiones, ej: 1234567890)
 *
 * ─── ACTIONS ───────────────────────────────────────────────────────
 *    POST /api/google-ads   { action: 'test_connection' }
 *    POST /api/google-ads   { action: 'create_campaign', ... }
 *    POST /api/google-ads   { action: 'list_campaigns' }
 *    POST /api/google-ads   { action: 'get_metrics', campaignId }
 *    POST /api/google-ads   { action: 'pause_campaign', campaignId }
 *    POST /api/google-ads   { action: 'enable_campaign', campaignId }
 */

const https = require('https')

const GOOGLE_ADS_API_VERSION = 'v18'
const BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// ── OAuth2: obtener access token desde refresh token ──
async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    }).toString()

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path:     '/token',
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, r => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        const json = JSON.parse(data)
        if (json.error) reject(new Error(`OAuth2: ${json.error_description || json.error}`))
        else resolve(json.access_token)
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Google Ads REST request ──
function adsRequest({ method, path, accessToken, developerToken, customerId, body }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'googleads.googleapis.com',
      path:     `/${GOOGLE_ADS_API_VERSION}/${path}`,
      method,
      headers: {
        'Authorization':         `Bearer ${accessToken}`,
        'developer-token':       developerToken,
        'login-customer-id':     customerId,
        'Content-Type':          'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }
    const req = https.request(options, r => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) reject(new Error(`Google Ads API: ${JSON.stringify(json.error)}`))
          else resolve(json)
        } catch(e) { reject(new Error('Respuesta no-JSON de Google Ads API')) }
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

// ════════════════════════════════════════════════════════
// ACCIONES
// ════════════════════════════════════════════════════════

/**
 * Verifica credenciales obteniendo info de la cuenta.
 */
async function testConnection({ accessToken, developerToken, customerId }) {
  const query = `SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1`
  return await adsRequest({
    method: 'POST',
    path: `customers/${customerId}/googleAds:searchStream`,
    accessToken, developerToken, customerId,
    body: { query }
  })
}

/**
 * Crea presupuesto diario de campaña.
 * El API trabaja en micros: 1 COP = 1,000,000 micros
 */
async function createBudget({ accessToken, developerToken, customerId, dailyBudgetCOP, name }) {
  const result = await adsRequest({
    method: 'POST',
    path: `customers/${customerId}/campaignBudgets:mutate`,
    accessToken, developerToken, customerId,
    body: {
      operations: [{
        create: {
          name:              `Budget_${name}_${Date.now()}`,
          amountMicros:      String(dailyBudgetCOP * 1_000_000),
          deliveryMethod:    'STANDARD',
          explicitlyShared:  false
        }
      }]
    }
  })
  return result.results[0].resourceName
}

/**
 * Crea una campaña de Search o Performance Max.
 */
async function createCampaign({ accessToken, developerToken, customerId, budgetResourceName, config }) {
  const { name, type, city, biddingStrategy, targetCpaMicros } = config

  // Mapeo de países/ciudades a location criteria IDs de Google
  const locationIds = {
    'Bogotá':   1006538,  // Bogotá, Colombia
    'Medellín': 1006545,
    'Cali':     1006542,
    'Colombia': 2170      // País entero
  }

  const campaignBody = {
    name,
    status: 'PAUSED', // Siempre PAUSED primero, activar manualmente
    advertisingChannelType: type === 'PERFORMANCE_MAX' ? 'PERFORMANCE_MAX' : 'SEARCH',
    campaignBudget: budgetResourceName,
    startDate: formatDate(new Date()),
    endDate:   formatDate(addDays(new Date(), 30)),
    geoTargetTypeSetting: {
      positiveGeoTargetType: 'PRESENCE_OR_INTEREST'
    },
    networkSettings: {
      targetGoogleSearch:         true,
      targetSearchNetwork:        true,
      targetContentNetwork:       false,
      targetPartnerSearchNetwork: false
    }
  }

  // Bidding strategy
  if (biddingStrategy === 'TARGET_CPA' && targetCpaMicros) {
    campaignBody.targetCpa = { targetCpaMicros: String(targetCpaMicros) }
  } else if (biddingStrategy === 'MAXIMIZE_CONVERSIONS') {
    campaignBody.maximizeConversions = {}
  } else {
    campaignBody.maximizeClicks = { targetSpendMicros: String(config.dailyBudgetCOP * 1_000_000) }
  }

  const result = await adsRequest({
    method: 'POST',
    path: `customers/${customerId}/campaigns:mutate`,
    accessToken, developerToken, customerId,
    body: { operations: [{ create: campaignBody }] }
  })

  const campaignResourceName = result.results[0].resourceName

  // Agregar targeting geográfico
  if (locationIds[city]) {
    await adsRequest({
      method: 'POST',
      path: `customers/${customerId}/campaignCriteria:mutate`,
      accessToken, developerToken, customerId,
      body: {
        operations: [{
          create: {
            campaign: campaignResourceName,
            location: { geoTargetConstant: `geoTargetConstants/${locationIds[city]}` }
          }
        }]
      }
    })
  }

  // Idioma: Español
  await adsRequest({
    method: 'POST',
    path: `customers/${customerId}/campaignCriteria:mutate`,
    accessToken, developerToken, customerId,
    body: {
      operations: [{
        create: {
          campaign: campaignResourceName,
          language: { languageConstant: 'languageConstants/1003' } // Spanish
        }
      }]
    }
  })

  return campaignResourceName
}

/**
 * Crea un Ad Group dentro de una campaña.
 */
async function createAdGroup({ accessToken, developerToken, customerId, campaignResourceName, name, cpcBidMicros }) {
  const result = await adsRequest({
    method: 'POST',
    path: `customers/${customerId}/adGroups:mutate`,
    accessToken, developerToken, customerId,
    body: {
      operations: [{
        create: {
          name,
          campaign:       campaignResourceName,
          status:         'ENABLED',
          type:           'SEARCH_STANDARD',
          cpcBidMicros:   String(cpcBidMicros || 500_000_000) // 500 COP default
        }
      }]
    }
  })
  return result.results[0].resourceName
}

/**
 * Agrega keywords al Ad Group.
 * matchType: BROAD | PHRASE | EXACT
 */
async function addKeywords({ accessToken, developerToken, customerId, adGroupResourceName, keywords }) {
  const operations = keywords.map(kw => ({
    create: {
      adGroup:   adGroupResourceName,
      status:    'ENABLED',
      keyword: {
        text:      kw.text,
        matchType: kw.matchType || 'PHRASE'
      }
    }
  }))

  return await adsRequest({
    method: 'POST',
    path: `customers/${customerId}/adGroupCriteria:mutate`,
    accessToken, developerToken, customerId,
    body: { operations }
  })
}

/**
 * Crea un Responsive Search Ad (RSA).
 * headlines: array de strings (hasta 15, máx 30 chars)
 * descriptions: array de strings (hasta 4, máx 90 chars)
 */
async function createResponsiveSearchAd({ accessToken, developerToken, customerId, adGroupResourceName, ad }) {
  const { headlines, descriptions, finalUrl, displayUrl } = ad

  const result = await adsRequest({
    method: 'POST',
    path: `customers/${customerId}/adGroupAds:mutate`,
    accessToken, developerToken, customerId,
    body: {
      operations: [{
        create: {
          adGroup: adGroupResourceName,
          status:  'ENABLED',
          ad: {
            responsiveSearchAd: {
              headlines:    headlines.slice(0, 15).map(text => ({ text: text.slice(0, 30) })),
              descriptions: descriptions.slice(0, 4).map(text => ({ text: text.slice(0, 90) })),
              path1: displayUrl?.split('/')[0] || '',
              path2: displayUrl?.split('/')[1] || ''
            },
            finalUrls: [finalUrl]
          }
        }
      }]
    }
  })
  return result.results[0].resourceName
}

/**
 * Obtiene métricas de campañas activas.
 */
async function getCampaignMetrics({ accessToken, developerToken, customerId }) {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM campaign
    WHERE campaign.status != 'REMOVED'
    AND segments.date DURING LAST_7_DAYS
    ORDER BY metrics.cost_micros DESC
    LIMIT 20`

  return await adsRequest({
    method: 'POST',
    path: `customers/${customerId}/googleAds:searchStream`,
    accessToken, developerToken, customerId,
    body: { query }
  })
}

// ── FLUJO COMPLETO: campaña + ad group + keywords + RSA ──
async function createFullCampaign(creds, config) {
  const { accessToken, developerToken, customerId } = creds
  const { proyecto, ciudad, tipo, presupuestoCOP, ctaUrl, whatsappNumber } = config

  // 1. Presupuesto
  const budgetRN = await createBudget({
    accessToken, developerToken, customerId,
    dailyBudgetCOP: presupuestoCOP,
    name: `${proyecto}_${ciudad}`
  })

  // 2. Campaña
  const campaignRN = await createCampaign({
    accessToken, developerToken, customerId,
    budgetResourceName: budgetRN,
    config: {
      name:             `Rentmies_${proyecto}_${ciudad}_${new Date().toISOString().slice(0,10)}`,
      type:             'SEARCH',
      city:             ciudad,
      biddingStrategy:  'MAXIMIZE_CLICKS',
      dailyBudgetCOP:   presupuestoCOP
    }
  })

  // 3. Ad Group
  const adGroupRN = await createAdGroup({
    accessToken, developerToken, customerId,
    campaignResourceName: campaignRN,
    name: `AdGroup_${proyecto}_Principal`,
    cpcBidMicros: 800_000_000 // 800 COP
  })

  // 4. Keywords generadas según proyecto y ciudad
  const keywords = generateKeywords(proyecto, ciudad, tipo)
  await addKeywords({
    accessToken, developerToken, customerId,
    adGroupResourceName: adGroupRN,
    keywords
  })

  // 5. Responsive Search Ad
  const adContent = generateRSAContent(proyecto, ciudad, tipo, ctaUrl, whatsappNumber)
  const adRN = await createResponsiveSearchAd({
    accessToken, developerToken, customerId,
    adGroupResourceName: adGroupRN,
    ad: adContent
  })

  return {
    success:      true,
    campaignId:   campaignRN.split('/').pop(),
    campaignRN,
    adGroupRN,
    adRN,
    status:       'PAUSED',
    keywords:     keywords.length,
    mensaje:      `Campaña creada en estado PAUSADO. Revísala en Google Ads y actívala cuando esté lista.`
  }
}

// ── Generadores de contenido ──
function generateKeywords(proyecto, ciudad, tipo) {
  const cityLow  = ciudad.toLowerCase().replace('á','a').replace('é','e').replace('ó','o')
  const tipoLow  = tipo.toLowerCase()
  const proyLow  = proyecto.toLowerCase()

  return [
    // Exact — máxima intención
    { text: `${tipoLow} en ${cityLow}`,           matchType: 'EXACT' },
    { text: `arriendo ${tipoLow} ${cityLow}`,      matchType: 'EXACT' },
    { text: `venta ${tipoLow} ${cityLow}`,         matchType: 'EXACT' },
    // Phrase — intención alta
    { text: `${tipoLow} ${cityLow}`,               matchType: 'PHRASE' },
    { text: `proyecto ${proyLow}`,                 matchType: 'PHRASE' },
    { text: `inmuebles en ${cityLow}`,             matchType: 'PHRASE' },
    { text: `arriendo ${tipoLow}`,                 matchType: 'PHRASE' },
    // Broad — alcance
    { text: `${tipoLow} colombia`,                 matchType: 'BROAD' },
    { text: `finca raiz ${cityLow}`,               matchType: 'BROAD' },
    { text: `inmobiliaria whatsapp`,               matchType: 'BROAD' },
  ]
}

function generateRSAContent(proyecto, ciudad, tipo, ctaUrl, whatsappNumber) {
  const wa = whatsappNumber ? `wa.me/${whatsappNumber}` : ctaUrl

  return {
    headlines: [
      `Proyecto ${proyecto}`,
      `${tipo.charAt(0).toUpperCase()+tipo.slice(1)}s en ${ciudad}`,
      `Responde en segundos por WhatsApp`,
      `IA Inmobiliaria 24/7`,
      `Sin llamadas. Solo WhatsApp`,
      `Los mejores ${tipo}s de ${ciudad}`,
      `Rentmies — Tu próximo hogar`,
      `Disponibles ahora en ${ciudad}`,
      `Arriendo rápido y seguro`,
      `Encuentra tu ${tipo} ideal`,
      `Consulta gratis por WhatsApp`,
      `Inmobiliaria con IA real`,
    ],
    descriptions: [
      `Encuentra ${tipo}s en ${ciudad} con nuestra IA. Respuesta inmediata por WhatsApp. Sin llamadas, sin citas innecesarias.`,
      `Proyecto ${proyecto} en ${ciudad}. Visita virtual disponible. Más de 200 arriendos cerrados con Rentmies IA.`,
      `Primera inmobiliaria con IA en Colombia. Busca, compara y arrenda desde WhatsApp. Disponible 24 horas, 7 días.`,
      `${tipo.charAt(0).toUpperCase()+tipo.slice(1)}s disponibles en ${ciudad}. Precios actualizados. Respuesta en menos de 60 segundos.`
    ],
    finalUrl:   ctaUrl || `https://wa.me/${whatsappNumber || '573001234567'}`,
    displayUrl: `${ciudad.toLowerCase().replace('á','a')}/proyecto`
  }
}

// ── Helpers de fecha ──
function formatDate(d) {
  return d.toISOString().slice(0,10).replace(/-/g,'')
}
function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

// ── Mock data para simulación ──
function getMockCampaigns() {
  return [
    { id: 'g_001', name: 'Rentmies_Primavera_Bogotá_2026-03-01', status: 'ENABLED',  type: 'SEARCH',          impressions: 4820, clicks: 186, ctr: 3.86, avgCpc: 580, costCOP: 107880, conversions: 12, cpl: 8990  },
    { id: 'g_002', name: 'Rentmies_Castelo_Medellín_2026-03-10', status: 'ENABLED',  type: 'SEARCH',          impressions: 3240, clicks: 97,  ctr: 2.99, avgCpc: 720, costCOP: 69840,  conversions: 7,  cpl: 9977  },
    { id: 'g_003', name: 'Rentmies_Praseo_Cali_2026-03-15',      status: 'PAUSED',   type: 'PERFORMANCE_MAX', impressions: 890,  clicks: 21,  ctr: 2.36, avgCpc: 940, costCOP: 19740,  conversions: 2,  cpl: 9870  },
    { id: 'g_004', name: 'Rentmies_Strada_Medellín_2026-03-20',  status: 'ENABLED',  type: 'SEARCH',          impressions: 2100, clicks: 42,  ctr: 2.00, avgCpc: 810, costCOP: 34020,  conversions: 3,  cpl: 11340 },
  ]
}

// ════════════════════════════════════════════════════════
// VERCEL HANDLER
// ════════════════════════════════════════════════════════
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    action,
    // Credenciales desde el body (settings del usuario) o env vars
    developerToken  = process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    clientId        = process.env.GOOGLE_ADS_CLIENT_ID,
    clientSecret    = process.env.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken    = process.env.GOOGLE_ADS_REFRESH_TOKEN,
    customerId      = process.env.GOOGLE_ADS_CUSTOMER_ID,
    simulate        = false,
    ...params
  } = req.body || {}

  if (!action) return res.status(400).json({ error: 'Se requiere action' })

  // ── Modo simulación ──
  if (simulate || !developerToken || !clientId || !refreshToken || !customerId) {
    return handleSimulated(action, params, res)
  }

  try {
    // Obtener access token OAuth2
    const accessToken = await getAccessToken({ clientId, clientSecret, refreshToken })
    const creds = { accessToken, developerToken, customerId }

    switch (action) {
      case 'test_connection': {
        const result = await testConnection(creds)
        const customer = result[0]?.results?.[0]?.customer || {}
        return res.json({ success: true, accountName: customer.descriptiveName, currency: customer.currencyCode, customerId })
      }
      case 'create_campaign': {
        const result = await createFullCampaign(creds, params)
        return res.json(result)
      }
      case 'list_campaigns': {
        const result = await getCampaignMetrics(creds)
        return res.json({ success: true, campaigns: result })
      }
      case 'pause_campaign': {
        await adsRequest({ method: 'POST', path: `customers/${customerId}/campaigns:mutate`, ...creds,
          body: { operations: [{ update: { resourceName: `customers/${customerId}/campaigns/${params.campaignId}`, status: 'PAUSED' }, updateMask: 'status' }] }
        })
        return res.json({ success: true, campaignId: params.campaignId, status: 'PAUSED' })
      }
      case 'enable_campaign': {
        await adsRequest({ method: 'POST', path: `customers/${customerId}/campaigns:mutate`, ...creds,
          body: { operations: [{ update: { resourceName: `customers/${customerId}/campaigns/${params.campaignId}`, status: 'ENABLED' }, updateMask: 'status' }] }
        })
        return res.json({ success: true, campaignId: params.campaignId, status: 'ENABLED' })
      }
      default:
        return res.status(400).json({ error: `Acción desconocida: ${action}` })
    }
  } catch (err) {
    console.error('Google Ads error:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}

function handleSimulated(action, params, res) {
  const delay = ms => new Promise(r => setTimeout(r, ms))
  switch (action) {
    case 'test_connection':
      return delay(800).then(() => res.json({ success: true, simulated: true, accountName: 'Rentmies Colombia (Demo)', currency: 'COP', customerId: '1234567890' }))
    case 'create_campaign':
      return delay(1500).then(() => res.json({
        success: true, simulated: true,
        campaignId: `sim_${Date.now()}`,
        campaignRN: `customers/1234567890/campaigns/${Date.now()}`,
        status: 'PAUSED', keywords: 10,
        proyecto: params.proyecto, ciudad: params.ciudad,
        mensaje: 'Campaña simulada creada. Configura credenciales Google Ads para crear campañas reales.'
      }))
    case 'list_campaigns':
      return delay(600).then(() => res.json({ success: true, simulated: true, campaigns: getMockCampaigns() }))
    case 'pause_campaign':
      return delay(400).then(() => res.json({ success: true, simulated: true, campaignId: params.campaignId, status: 'PAUSED' }))
    case 'enable_campaign':
      return delay(400).then(() => res.json({ success: true, simulated: true, campaignId: params.campaignId, status: 'ENABLED' }))
    default:
      return res.status(400).json({ error: `Acción desconocida: ${action}` })
  }
}
