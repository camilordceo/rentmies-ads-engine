/**
 * POST /api/posts/publish/instagram
 *      Authorization: Bearer <supabase_jwt>  (or x-empresa-id for demo)
 *      body: { caption, image_url, media_type?: 'IMAGE'|'REELS'|'STORIES', video_url? }
 *
 * Container model: create → poll → publish. Uses page_access_token from
 * meta_connections — system_user/user tokens do NOT work for IG publish,
 * has to be the page token of the Page that owns the IG business account.
 *
 * Pre-publish image validation:
 *   - Must be a public HTTPS URL
 *   - JPEG only for IMAGE type (PNG/WEBP rejected by Meta — fail fast)
 *   - Caption ≤ 2200 chars
 */

const axios = require('axios')
const {
  META_GRAPH, getServiceClient, authedEmpresa,
  getActiveConnection, graphErr, logPublished, markConnectionStatus
} = require('../../../lib/meta-publish')

const POLL_MAX_ATTEMPTS = 12   // 12 × 2.5s = 30s
const POLL_DELAY_MS = 2500
const POLL_INITIAL_DELAY_MS = 2000

function isJpeg (url) {
  // Meta accepts the upload even if the extension is wrong, but the strictest
  // failure mode is PNG which they outright reject. Catch the obvious cases.
  return /\.jpe?g(\?|$)/i.test(url)
}

function isPng (url) {
  return /\.png(\?|$)/i.test(url)
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const { caption, image_url, video_url, inventario_id } = req.body || {}
  const media_type = (req.body && req.body.media_type) || (video_url ? 'REELS' : 'IMAGE')

  if (caption && caption.length > 2200) {
    return res.status(400).json({ error: 'Caption excede 2200 caracteres (límite de Instagram).', code: 'caption_too_long' })
  }
  if (media_type === 'IMAGE' || media_type === 'STORIES') {
    if (!image_url) return res.status(400).json({ error: 'image_url es requerido', code: 'no_image' })
    if (!image_url.startsWith('https://')) return res.status(400).json({ error: 'image_url debe ser una URL pública HTTPS.', code: 'image_not_public' })
    if (isPng(image_url)) {
      return res.status(400).json({
        error: 'Instagram solo acepta JPEG para feed posts. Convierte tu imagen antes de publicar.',
        code: 'image_not_jpeg'
      })
    }
  } else if (media_type === 'REELS') {
    if (!video_url) return res.status(400).json({ error: 'video_url es requerido para REELS', code: 'no_video' })
    if (!video_url.startsWith('https://')) return res.status(400).json({ error: 'video_url debe ser una URL pública HTTPS.', code: 'video_not_public' })
  }

  let conn
  try { conn = await getActiveConnection(sb, auth.empresaId) }
  catch (e) { return res.status(e.status || 500).json({ error: e.message, code: e.code }) }

  let igId = conn.ig_business_id
  const pageToken = conn.page_access_token || conn.long_lived_token

  // Auto-discover IG account if missing but page is connected
  if (!igId && conn.page_id) {
    try {
      const { data } = await axios.get(`${META_GRAPH}/${conn.page_id}`, {
        params: { fields: 'instagram_business_account', access_token: pageToken },
        timeout: 8000
      })
      if (data.instagram_business_account && data.instagram_business_account.id) {
        igId = data.instagram_business_account.id
        // cache for next time
        await sb.from('meta_connections').update({ ig_business_id: igId }).eq('id', conn.id)
      }
    } catch (_) {}
  }
  if (!igId) {
    return res.status(400).json({
      error: 'Tu página no tiene una cuenta de Instagram Business vinculada. Vincúlala en Meta Business Suite y vuelve a probar la conexión en Settings.',
      code: 'no_instagram'
    })
  }

  // Insert pending row for the history view
  const platformLabel = media_type === 'STORIES' ? 'instagram_stories'
                      : media_type === 'REELS'   ? 'instagram_reels'
                                                 : 'instagram'
  const pending = await logPublished(sb, {
    empresa_id: auth.empresaId,
    meta_connection_id: conn.id,
    inventario_id: inventario_id || null,
    platform: platformLabel,
    caption: caption || null,
    media_url: image_url || video_url || null,
    media_kind: video_url ? 'video' : 'image',
    status: 'publishing'
  })

  try {
    // ── 1. Create container ────────────────────────────────
    const createParams = {
      caption: caption || '',
      access_token: pageToken
    }
    if (media_type === 'STORIES') createParams.media_type = 'STORIES'
    if (media_type === 'REELS') {
      createParams.media_type = 'REELS'
      createParams.video_url = video_url
      createParams.share_to_feed = 'true'
    } else if (image_url) {
      createParams.image_url = image_url
    }

    let containerId
    try {
      const { data } = await axios.post(`${META_GRAPH}/${igId}/media`, null, {
        params: createParams,
        timeout: 20000
      })
      containerId = data.id
    } catch (err) {
      throw graphErr(err, 'ig_create_container')
    }
    if (!containerId) throw new Error('Meta no devolvió container_id')

    // ── 2. Poll container until FINISHED ───────────────────
    if (pending && pending.id) {
      await sb.from('published_posts').update({ status: 'processing' }).eq('id', pending.id)
    }
    await new Promise(r => setTimeout(r, POLL_INITIAL_DELAY_MS))
    let lastStatus = null
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      try {
        const { data } = await axios.get(`${META_GRAPH}/${containerId}`, {
          params: { fields: 'status_code', access_token: pageToken },
          timeout: 5000
        })
        lastStatus = data.status_code
        if (lastStatus === 'FINISHED') break
        if (lastStatus === 'ERROR') {
          throw new Error('Instagram rechazó el contenido. Verifica formato (JPEG, 320-1440px ancho, ratio 4:5 a 1.91:1, < 8MB) y que la URL sea accesible públicamente.')
        }
        if (lastStatus === 'EXPIRED') throw new Error('El contenedor expiró antes de poder publicarse.')
      } catch (err) {
        if (err.response) throw graphErr(err, 'ig_poll')
        if (err.message && err.message.startsWith('Instagram')) throw err
      }
      await new Promise(r => setTimeout(r, POLL_DELAY_MS))
    }
    if (lastStatus !== 'FINISHED') {
      // Save container_id so we could resume polling client-side
      if (pending && pending.id) {
        await sb.from('published_posts').update({
          status: 'processing',
          error_message: `Aún procesando (último estado: ${lastStatus || 'sin respuesta'}). Container: ${containerId}`
        }).eq('id', pending.id)
      }
      return res.status(202).json({
        success: false,
        status: 'processing',
        container_id: containerId,
        message: `Instagram aún está procesando el contenido (último estado: ${lastStatus || 'sin respuesta'}). Reintenta publicar en 1-2 min.`
      })
    }

    // ── 3. Publish ─────────────────────────────────────────
    let mediaId
    try {
      const { data } = await axios.post(`${META_GRAPH}/${igId}/media_publish`, null, {
        params: { creation_id: containerId, access_token: pageToken },
        timeout: 20000
      })
      mediaId = data.id
    } catch (err) {
      throw graphErr(err, 'ig_publish')
    }
    if (!mediaId) throw new Error('Meta no devolvió media_id tras publicar')

    // ── 4. Permalink ───────────────────────────────────────
    let permalink = `https://www.instagram.com/`
    try {
      const { data } = await axios.get(`${META_GRAPH}/${mediaId}`, {
        params: { fields: 'permalink', access_token: pageToken },
        timeout: 5000
      })
      if (data.permalink) permalink = data.permalink
    } catch (_) {}

    if (pending && pending.id) {
      await sb.from('published_posts').update({
        post_id: mediaId, post_permalink: permalink,
        status: 'published', published_at: new Date().toISOString()
      }).eq('id', pending.id)
    }

    return res.json({
      success: true,
      platform: platformLabel,
      post_id: mediaId,
      permalink,
      ig_username: conn.ig_username
    })
  } catch (err) {
    const errMsg = err.message || 'Error desconocido'
    if (pending && pending.id) {
      await sb.from('published_posts').update({
        status: 'failed', error_message: errMsg
      }).eq('id', pending.id)
    }
    if (err.metaCode === 190) await markConnectionStatus(sb, auth.empresaId, 'expired', errMsg)
    if (err.metaCode === 10)  await markConnectionStatus(sb, auth.empresaId, 'error',   errMsg)

    return res.status(500).json({
      success: false,
      error: errMsg,
      code: err.code || 'ig_publish_failed',
      meta_code: err.metaCode || null,
      suggestion: err.suggestion || null
    })
  }
}
