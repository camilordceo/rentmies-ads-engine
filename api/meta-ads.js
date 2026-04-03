/**
 * RENTMIES — META ADS PUBLISHER
 * Creates Campaign → Ad Set → Ad Creative → Ad in Facebook Ads Manager
 * Uses Marketing API v21.0
 */

const https = require('https')
const BASE  = 'https://graph.facebook.com/v21.0'

function graphPost(path, params) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(params).toString()
    const options = {
      hostname: 'graph.facebook.com',
      path:     `/v21.0${path}`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload)
      }
    }
    const req = https.request(options, (r) => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) {
            const sub = json.error.error_subcode ? ` sub=${json.error.error_subcode}` : ''
            const msg = json.error.error_user_msg || json.error.message
            reject(new Error(`Meta: ${msg} (code=${json.error.code}${sub})`))
          } else resolve(json)
        } catch(e) { reject(new Error('Non-JSON response from Meta')) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

const CITY_GEO = {
  'bogotá':   { key: '2422535', name: 'Bogota', country: 'CO' },
  'medellín': { key: '2422546', name: 'Medellin', country: 'CO' },
  'cali':     { key: '2422509', name: 'Cali', country: 'CO' },
}

const CTA_TYPE_MAP = {
  whatsapp: 'WHATSAPP_MESSAGE', // wa.me links need WHATSAPP_MESSAGE, not MESSAGE_PAGE
  url:      'LEARN_MORE',
  call:     'CALL_NOW',
  form:     'SIGN_UP',
  custom:   'LEARN_MORE',
}

async function createMetaCampaign({ adAccountId, accessToken, name, objective = 'OUTCOME_TRAFFIC' }) {
  const acct = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  return await graphPost(`/${acct}/campaigns`, {
    name,
    objective,
    status:                'PAUSED',
    special_ad_categories: 'NONE',   // required — 'NONE' or e.g. 'HOUSING'
    access_token:          accessToken,
  })
}

async function createAdSet({ adAccountId, accessToken, campaignId, name, dailyBudget, ciudad, duracion = 14 }) {
  const acct    = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  const cityKey = ciudad?.toLowerCase() || 'bogotá'
  const geo     = CITY_GEO[cityKey] || CITY_GEO['bogotá']

  const endTime = new Date()
  endTime.setDate(endTime.getDate() + parseInt(duracion))

  const targeting = JSON.stringify({
    geo_locations: {
      cities: [{ key: geo.key, country: geo.country, radius: 20, distance_unit: 'kilometer' }]
    },
    age_min: 24,
    age_max: 55,
  })

  return await graphPost(`/${acct}/adsets`, {
    name,
    campaign_id:                    campaignId,
    daily_budget:                   String(Math.max(5000, Math.round(dailyBudget))), // COP min 5000
    billing_event:                  'IMPRESSIONS',
    optimization_goal:              'LINK_CLICKS',   // must match OUTCOME_TRAFFIC objective
    bid_strategy:                   'LOWEST_COST_WITHOUT_CAP',
    is_adset_budget_sharing_enabled: 'false',  // explicit: budget is at ad set level, not campaign CBO
    targeting,
    end_time:                       String(Math.floor(endTime.getTime() / 1000)), // Unix timestamp
    status:                         'PAUSED',
    access_token:                   accessToken,
  })
}

async function createAdCreative({ adAccountId, accessToken, pageId, name, imageUrl, headline, description, ctaUrl, ctaType = 'LEARN_MORE' }) {
  const acct    = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  const destUrl = ctaUrl || 'https://rentmies.com'

  // Build link_data — image_url is optional (Meta will use page cover if absent)
  const linkData = {
    message: description,
    name:    headline,
    link:    destUrl,
    call_to_action: { type: ctaType, value: { link: destUrl } },
  }
  if (imageUrl) linkData.image_url = imageUrl  // only set if a real public URL

  const objectStorySpec = JSON.stringify({ page_id: pageId, link_data: linkData })

  return await graphPost(`/${acct}/adcreatives`, {
    name,
    object_story_spec: objectStorySpec,
    access_token:      accessToken,
  })
}

async function createAd({ adAccountId, accessToken, adSetId, creativeId, name }) {
  const acct = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
  return await graphPost(`/${acct}/ads`, {
    name,
    adset_id:    adSetId,
    creative:    JSON.stringify({ creative_id: creativeId }),
    status:      'PAUSED',
    access_token: accessToken,
  })
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    ads = [],
    inmueble = {},
    ciudad = 'Bogotá',
    dailyBudget = 50000,
    duracion    = 14,
    ctaType     = 'url',
    ctaUrl      = '',
    accessToken = process.env.META_ACCESS_TOKEN,
    adAccountId = process.env.META_AD_ACCOUNT_ID,
    pageId      = process.env.META_PAGE_ID,
    simulate    = false,
  } = req.body || {}

  // ── Modo simulación ──
  if (simulate || !accessToken || !adAccountId || !pageId) {
    await new Promise(r => setTimeout(r, 800))
    const fakeId = `mock_${Date.now()}`
    return res.status(200).json({
      success:    true,
      simulated:  true,
      campaignId: fakeId,
      adCount:    ads.length,
      message:    'Simulado. Configura accessToken, adAccountId y pageId para crear ads reales.',
      ads: ads.map((ad, i) => ({
        adId:       `${fakeId}_ad${i}`,
        adSetId:    `${fakeId}_set`,
        creativeId: `${fakeId}_cr${i}`,
        status:     'PAUSED_SIMULATED',
        platform:   ad.platform,
        headline:   ad.headline,
      }))
    })
  }

  try {
    const campaignName = `Rentmies · ${inmueble.proyecto || 'Campaña'} · ${ciudad} · ${new Date().toLocaleDateString('es-CO')}`

    // 1. Crear campaña
    const campaign = await createMetaCampaign({ adAccountId, accessToken, name: campaignName })

    // 2. Crear un ad set compartido para todos los ads
    const adSet = await createAdSet({
      adAccountId, accessToken,
      campaignId:  campaign.id,
      name:        `${campaignName} — AdSet`,
      dailyBudget,
      ciudad,
      duracion,
    })

    // 3. Crear creative + ad por cada variación
    const createdAds = []
    for (const ad of ads) {
      // Meta requires a public HTTPS URL — base64 data: URLs from Gemini are not supported
      const rawImage = inmueble.imagen || ad.feedImage || ''
      const imageUrl = rawImage.startsWith('data:') ? null : (rawImage || null)

      const creative = await createAdCreative({
        adAccountId, accessToken, pageId,
        name:        `${ad.variationType} · ${ad.platform}`,
        imageUrl,
        headline:    ad.headline,
        description: ad.description,
        ctaUrl:      ad.ctaUrl || ctaUrl,
        ctaType:     CTA_TYPE_MAP[ctaType] || 'LEARN_MORE',
      })

      const createdAd = await createAd({
        adAccountId, accessToken,
        adSetId:    adSet.id,
        creativeId: creative.id,
        name:       `${ad.variationType} · ${ad.platform} · ${ad.ciudad}`,
      })

      createdAds.push({
        adId:       createdAd.id,
        adSetId:    adSet.id,
        creativeId: creative.id,
        campaignId: campaign.id,
        status:     'PAUSED',
        platform:   ad.platform,
        headline:   ad.headline,
        variationType: ad.variationType,
      })
    }

    res.status(200).json({
      success:    true,
      simulated:  false,
      campaignId: campaign.id,
      adSetId:    adSet.id,
      adCount:    createdAds.length,
      ads:        createdAds,
      adsManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace('act_','')}`
    })

  } catch(err) {
    console.error('Meta Ads error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
}
