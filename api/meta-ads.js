/**
 * RENTMIES — META ADS PUBLISHER
 * Creates Campaign → Ad Set → Ad Creative → Ad in Facebook Ads Manager
 * Uses Marketing API v21.0 with JSON body (access_token in URL)
 */

const https = require('https')

// Send JSON body; access_token goes in the URL query string so it's not type-mangled
function graphPost(path, accessToken, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const options = {
      hostname: 'graph.facebook.com',
      path:     `/v21.0${path}?access_token=${encodeURIComponent(accessToken)}`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
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
          } else {
            resolve(json)
          }
        } catch(e) {
          reject(new Error('Non-JSON response from Meta: ' + data.slice(0, 200)))
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

const CITY_GEO = {
  'bogotá':   { key: '2422535', country: 'CO' },
  'medellin': { key: '2422546', country: 'CO' },
  'medellín': { key: '2422546', country: 'CO' },
  'cali':     { key: '2422509', country: 'CO' },
}

const CTA_TYPE_MAP = {
  whatsapp: 'WHATSAPP_MESSAGE',
  url:      'LEARN_MORE',
  call:     'CALL_NOW',
  form:     'SIGN_UP',
  custom:   'LEARN_MORE',
}

function acctId(adAccountId) {
  return adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`
}

async function createMetaCampaign({ adAccountId, accessToken, name }) {
  return graphPost(`/${acctId(adAccountId)}/campaigns`, accessToken, {
    name,
    objective:              'OUTCOME_TRAFFIC',
    status:                 'PAUSED',
    special_ad_categories:  [],   // empty array = no special category restrictions
  })
}

async function createAdSet({ adAccountId, accessToken, campaignId, name, dailyBudget, ciudad, duracion = 14 }) {
  const cityKey = (ciudad || 'bogotá').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const geo     = CITY_GEO[ciudad?.toLowerCase()] || CITY_GEO[cityKey] || CITY_GEO['bogotá']

  const endTime = new Date()
  endTime.setDate(endTime.getDate() + parseInt(duracion))

  return graphPost(`/${acctId(adAccountId)}/adsets`, accessToken, {
    name,
    campaign_id:                     campaignId,
    daily_budget:                    Math.max(5000, Math.round(dailyBudget)),
    billing_event:                   'IMPRESSIONS',
    optimization_goal:               'LINK_CLICKS',
    bid_strategy:                    'LOWEST_COST_WITHOUT_CAP',
    is_adset_budget_sharing_enabled: false,   // boolean false — ad set owns its own budget
    targeting: {
      geo_locations: {
        cities: [{ key: geo.key, country: geo.country, radius: 20, distance_unit: 'kilometer' }],
      },
      age_min: 24,
      age_max: 55,
    },
    end_time: Math.floor(endTime.getTime() / 1000),  // Unix timestamp (integer)
    status:   'PAUSED',
  })
}

async function createAdCreative({ adAccountId, accessToken, pageId, name, imageUrl, headline, description, ctaUrl, ctaType = 'LEARN_MORE' }) {
  const destUrl = ctaUrl || 'https://rentmies.com'

  const linkData = {
    message: description,
    name:    headline,
    link:    destUrl,
    call_to_action: { type: ctaType, value: { link: destUrl } },
  }
  // image_url must be a public HTTPS URL — skip if base64 or empty
  if (imageUrl && !imageUrl.startsWith('data:')) {
    linkData.image_url = imageUrl
  }

  return graphPost(`/${acctId(adAccountId)}/adcreatives`, accessToken, {
    name,
    object_story_spec: { page_id: pageId, link_data: linkData },
  })
}

async function createAd({ adAccountId, accessToken, adSetId, creativeId, name }) {
  return graphPost(`/${acctId(adAccountId)}/ads`, accessToken, {
    name,
    adset_id: adSetId,
    creative: { creative_id: creativeId },
    status:   'PAUSED',
  })
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    ads         = [],
    inmueble    = {},
    ciudad      = 'Bogotá',
    dailyBudget = 50000,
    duracion    = 14,
    ctaType     = 'url',
    ctaUrl      = '',
    accessToken = process.env.META_ACCESS_TOKEN || '',
    adAccountId = process.env.META_AD_ACCOUNT_ID || '',
    pageId      = process.env.META_PAGE_ID || '',
    simulate    = false,
  } = req.body || {}

  // ── Simulation mode ──
  if (simulate || !accessToken || !adAccountId || !pageId) {
    await new Promise(r => setTimeout(r, 600))
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
        headline:   ad.headline,
      })),
    })
  }

  try {
    const campaignName = `Rentmies · ${inmueble.proyecto || 'Campaña'} · ${ciudad} · ${new Date().toLocaleDateString('es-CO')}`

    // 1. Campaign
    const campaign = await createMetaCampaign({ adAccountId, accessToken, name: campaignName })

    // 2. Ad Set
    const adSet = await createAdSet({
      adAccountId, accessToken,
      campaignId:  campaign.id,
      name:        `${campaignName} — AdSet`,
      dailyBudget,
      ciudad,
      duracion,
    })

    // 3. Creative + Ad per variation
    const createdAds = []
    for (const ad of ads) {
      const rawImage = inmueble.imagen || ad.feedImage || ''
      const imageUrl = rawImage && !rawImage.startsWith('data:') ? rawImage : null

      const creative = await createAdCreative({
        adAccountId, accessToken, pageId,
        name:        `${ad.variationType} · ${ad.platform}`.slice(0, 255),
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
        name:       `${ad.variationType} · ${ad.ciudad || ciudad}`.slice(0, 255),
      })

      createdAds.push({
        adId:          createdAd.id,
        adSetId:       adSet.id,
        creativeId:    creative.id,
        campaignId:    campaign.id,
        status:        'PAUSED',
        headline:      ad.headline,
        variationType: ad.variationType,
      })
    }

    return res.status(200).json({
      success:       true,
      simulated:     false,
      campaignId:    campaign.id,
      adSetId:       adSet.id,
      adCount:       createdAds.length,
      ads:           createdAds,
      adsManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace('act_', '')}`,
    })

  } catch(err) {
    console.error('Meta Ads error:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}
