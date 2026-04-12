/**
 * RENTMIES — AD COPY GENERATOR
 * POST /api/generate
 * Thin handler — logic lives in lib/generator.js
 */

const { requireAuth }           = require('../lib/auth')
const { generateCopy, generateImageWithGemini } = require('../lib/generator')
const { normalizeCity }         = require('../lib/normalize')

const PLATFORM_NAMES = {
  meta_feed:      'Meta Feed',
  instagram_feed: 'Instagram Feed',
  meta_stories:   'Meta Stories',
  tiktok:         'TikTok',
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  const auth = await requireAuth(req, res); if (!auth) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    ciudad        = 'Bogotá',
    tipoInmueble  = 'apartamento',
    presupuesto   = '$50.000 COP/día',
    plataformas   = ['meta_feed', 'instagram_feed'],
    variaciones   = ['painPoint', 'outcome', 'social', 'urgency'],
    proyecto      = '',
    userContext   = '',
    geminiKey     = process.env.GEMINI_API_KEY,
  } = req.body || {}

  const ads     = []
  let counter   = 1

  for (const variationType of variaciones.slice(0, 4)) {
    const copy = await generateCopy({ geminiKey, ciudad, tipoInmueble, presupuesto, variationType, proyecto, userContext })

    let generatedImage = null
    if (geminiKey) {
      generatedImage = await generateImageWithGemini({
        geminiKey,
        inmuebleDescription: `${tipoInmueble} en ${ciudad}, proyecto ${proyecto}`,
        headline:            copy.headline,
        variationType,
      })
    }

    ads.push({
      id:            `ad_${Date.now()}_${counter++}`,
      campaignId:    `camp_${Date.now()}`,
      variationType,
      platform:      plataformas[0] || 'meta_feed',
      platforms:     plataformas,
      platformName:  PLATFORM_NAMES[plataformas[0]] || plataformas[0],
      ciudad,
      tipoInmueble,
      presupuesto,
      proyecto,
      headline:      copy.headline    || 'Rentmies — Tu inmueble ideal',
      description:   copy.description || 'Encuentra tu próximo inmueble por WhatsApp.',
      cta:           copy.cta         || 'Escribir ahora',
      hook:          copy.hook        || '',
      generatedImage,
      status:        'generated',
      source:        copy.source,
      createdAt:     new Date().toISOString(),
    })
  }

  res.status(200).json({
    success:        true,
    ads,
    totalGenerated: ads.length,
    source:         geminiKey ? 'gemini-2.0-flash-lite' : 'mock',
  })
}
