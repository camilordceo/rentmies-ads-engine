/**
 * RENTMIES ADS ENGINE — INSTAGRAM PUBLISHER
 *
 * Soporta tres formatos:
 *   - image  → Feed post (imagen)
 *   - video  → Reel (video 9:16, MP4, max 90s)
 *   - carousel → Hasta 10 imágenes
 *
 * Flujo común:
 *   1. Crear container (image/video/carousel)
 *   2. Esperar procesamiento (polling status_code)
 *   3. Publicar container (media_publish)
 *   4. Obtener permalink
 *
 * Requisitos:
 *   - META_ACCESS_TOKEN: token con permisos instagram_basic, instagram_content_publish
 *   - META_IG_ACCOUNT_ID: Instagram Business Account ID
 *   - URLs deben ser públicas (no localhost, no base64)
 */

const { requireAuth } = require('../lib/auth')
const { publishToInstagram } = require('../lib/instagram')

// ── Vercel handler ──
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  const auth = await requireAuth(req, res); if (!auth) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    imageUrl,
    videoUrl,
    format       = 'image',   // 'image' | 'video'
    caption,
    shareToFeed  = true,
    igAccountId  = process.env.META_IG_ACCOUNT_ID,
    accessToken  = process.env.META_ACCESS_TOKEN,
    simulate     = false,
  } = req.body || {}

  if (!caption) {
    return res.status(400).json({ success: false, error: 'Se requiere caption' })
  }
  if (format === 'video' && !videoUrl) {
    return res.status(400).json({ success: false, error: 'Se requiere videoUrl para formato video' })
  }
  if (format === 'image' && !imageUrl) {
    return res.status(400).json({ success: false, error: 'Se requiere imageUrl para formato imagen' })
  }

  // ── Modo simulación ──
  if (simulate || !igAccountId || !accessToken) {
    await new Promise(r => setTimeout(r, 1200))
    const fakeId = `ig_${Date.now()}`
    return res.status(200).json({
      success:    true,
      simulated:  true,
      mediaId:    fakeId,
      creationId: `cont_${fakeId}`,
      permalink:  `https://www.instagram.com/p/mock_${fakeId.slice(-8)}/`,
      timestamp:  new Date().toISOString(),
      platform:   'instagram',
      format,
      message:    'Simulado. Configura META_IG_ACCOUNT_ID y META_ACCESS_TOKEN para publicar real.',
    })
  }

  // ── Publicación real ──
  try {
    const result = await publishToInstagram({ igAccountId, accessToken, imageUrl, videoUrl, caption, format, shareToFeed })
    res.status(200).json(result)
  } catch (err) {
    console.error('Instagram publish error:', err.message)
    res.status(500).json({ success: false, error: err.message, platform: 'instagram', format })
  }
}
