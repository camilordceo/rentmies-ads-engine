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

const https = require('https')

const BASE = 'https://graph.facebook.com/v21.0'

// ── Helper: fetch con Node nativo (sin axios para reducir cold start) ──
function graphRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path)
    const payload = body ? JSON.stringify(body) : null

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }

    const req = https.request(options, (r) => {
      let data = ''
      r.on('data', chunk => data += chunk)
      r.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) reject(new Error(`Meta API: ${json.error.message} (code ${json.error.code})`))
          else resolve(json)
        } catch(e) { reject(new Error('Respuesta no-JSON de Meta API')) }
      })
    })

    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * Paso 1a — Crea un container de IMAGEN en Instagram.
 */
async function createImageContainer({ igAccountId, accessToken, imageUrl, caption }) {
  const params = new URLSearchParams({
    image_url:    imageUrl,
    caption:      caption,
    access_token: accessToken
  })
  const result = await graphRequest('POST', `/${igAccountId}/media?${params}`, null)
  return result.id // creation_id
}

/**
 * Paso 1b — Crea un container de VIDEO (Reel) en Instagram.
 * video_url debe ser una URL pública de MP4 (9:16, max 90s, max 1GB).
 */
async function createReelContainer({ igAccountId, accessToken, videoUrl, caption, shareToFeed = true }) {
  const params = new URLSearchParams({
    media_type:    'REELS',
    video_url:     videoUrl,
    caption:       caption,
    share_to_feed: String(shareToFeed),  // también aparece en el feed
    access_token:  accessToken
  })
  const result = await graphRequest('POST', `/${igAccountId}/media?${params}`, null)
  return result.id // creation_id
}

/**
 * Paso 2 — Publica el container creado.
 * Puede tardar unos segundos en procesarse.
 */
async function publishContainer({ igAccountId, accessToken, creationId }) {
  const params = new URLSearchParams({
    creation_id:  creationId,
    access_token: accessToken
  })
  const result = await graphRequest('POST', `/${igAccountId}/media_publish?${params}`, null)
  return result.id // media_id del post publicado
}

/**
 * Paso 3 — Obtiene el permalink del post publicado.
 */
async function getPermalink({ mediaId, accessToken }) {
  const params = new URLSearchParams({
    fields:       'permalink,thumbnail_url,timestamp',
    access_token: accessToken
  })
  return await graphRequest('GET', `/${mediaId}?${params}`, null)
}

/**
 * Verifica el estado de un container (útil si falla la publicación).
 * status_code: IN_PROGRESS | FINISHED | ERROR
 */
async function checkContainerStatus({ creationId, accessToken }) {
  const params = new URLSearchParams({
    fields:       'status_code,status',
    access_token: accessToken
  })
  return await graphRequest('GET', `/${creationId}?${params}`, null)
}

/**
 * Flujo completo: imagen → container → publicar → permalink.
 * Con retry si el container no está listo.
 */
async function publishToInstagram({ igAccountId, accessToken, imageUrl, videoUrl, caption, format = 'image', shareToFeed = true, retries = 6 }) {
  const mediaUrl = format === 'video' ? videoUrl : imageUrl

  // Validar que la URL sea pública
  if (!mediaUrl || mediaUrl.startsWith('data:') || mediaUrl.includes('localhost')) {
    throw new Error(`La ${format === 'video' ? 'URL del video' : 'imagen'} debe ser pública (no base64 ni localhost)`)
  }

  // 1. Crear container según formato
  let creationId
  if (format === 'video') {
    creationId = await createReelContainer({ igAccountId, accessToken, videoUrl: mediaUrl, caption, shareToFeed })
  } else {
    creationId = await createImageContainer({ igAccountId, accessToken, imageUrl: mediaUrl, caption })
  }

  // 2. Esperar que el container esté listo (videos tardan más)
  const initialDelay = format === 'video' ? 8000 : 3000
  await new Promise(r => setTimeout(r, initialDelay))

  for (let i = 0; i < retries; i++) {
    const status = await checkContainerStatus({ creationId, accessToken })
    if (status.status_code === 'FINISHED') break
    if (status.status_code === 'ERROR') throw new Error(`Container error: ${status.status}`)
    if (i === retries - 1) throw new Error('Container no listo después de múltiples intentos')
    await new Promise(r => setTimeout(r, format === 'video' ? 5000 : 3000))
  }

  // 3. Publicar
  const mediaId = await publishContainer({ igAccountId, accessToken, creationId })

  // 4. Obtener permalink
  const post = await getPermalink({ mediaId, accessToken })

  return {
    success:   true,
    mediaId,
    creationId,
    permalink: post.permalink,
    timestamp: post.timestamp,
    platform:  'instagram',
    format,
  }
}

// ── Vercel handler ──
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
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
