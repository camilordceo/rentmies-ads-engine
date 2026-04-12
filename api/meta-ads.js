/**
 * RENTMIES — META ADS PUBLISHER
 * POST /api/meta-ads
 * Thin handler — logic lives in lib/meta-ads.js
 */

const { requireAuth }   = require('../lib/auth')
const { createCampaign } = require('../lib/meta-ads')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  const auth = await requireAuth(req, res); if (!auth) return
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

  // Modo simulación
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
    const result = await createCampaign({ adAccountId, accessToken, pageId, inmueble, ciudad, dailyBudget, duracion, ads, ctaType, ctaUrl })

    return res.status(200).json({
      success:       true,
      simulated:     false,
      campaignId:    result.campaignId,
      adSetId:       result.adSetId,
      adCount:       result.ads.length,
      ads:           result.ads,
      adsManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace('act_', '')}`,
    })
  } catch(err) {
    console.error('Meta Ads error:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}
