/**
 * POST /api/posts/publish/facebook
 *      Authorization: Bearer <supabase_jwt>  (or x-empresa-id header for demo)
 *      body: { caption, image_url?, video_url?, link?, inventario_id?, media_video_id? }
 *
 * Publishes to the Facebook Page stored in meta_connections, using the
 * page-level access token (NOT the system_user token). Logs the result
 * to published_posts.
 *
 * Branches:
 *   video_url present → POST /{page_id}/videos with file_url + description
 *   image_url present → POST /{page_id}/photos
 *   link present      → POST /{page_id}/feed with link
 *   else              → POST /{page_id}/feed text-only
 *
 * media_video_id (FK to media_videos) is recorded on published_posts so
 * usage_count auto-increments via the trigger from schema-videos-bloque4.sql.
 */

const axios = require('axios')
const {
  META_GRAPH, getServiceClient, authedEmpresa,
  getActiveConnection, graphErr, logPublished, markConnectionStatus
} = require('../../../lib/meta-publish')

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

  const { caption, image_url, video_url, link, inventario_id, media_video_id } = req.body || {}
  if (!caption && !image_url && !video_url && !link) {
    return res.status(400).json({ error: 'Necesito al menos caption, image_url, video_url o link' })
  }
  if (video_url && !video_url.startsWith('https://')) {
    return res.status(400).json({ error: 'video_url debe ser una URL pública HTTPS', code: 'video_not_public' })
  }

  let conn
  try { conn = await getActiveConnection(sb, auth.empresaId) }
  catch (e) { return res.status(e.status || 500).json({ error: e.message, code: e.code }) }

  if (!conn.page_id) {
    return res.status(400).json({ error: 'Sin Facebook Page conectada. Configúrala en Settings.', code: 'no_page' })
  }

  // Page Access Token is preferred; fall back to user/system_user token if missing
  // (the test endpoint should populate page_access_token, but be defensive).
  const pageToken = conn.page_access_token || conn.long_lived_token
  if (!pageToken) {
    return res.status(400).json({ error: 'Sin Page Access Token. Vuelve a probar la conexión en Settings.', code: 'no_page_token' })
  }

  const mediaKind = video_url ? 'video' : (image_url ? 'image' : (link ? 'link' : 'text'))
  // Insert pending row so we can update with success/failure + show in history immediately
  let pending = await logPublished(sb, {
    empresa_id: auth.empresaId,
    meta_connection_id: conn.id,
    inventario_id: inventario_id || null,
    platform: video_url ? 'facebook_video' : 'facebook',
    caption: caption || null,
    media_url: video_url || image_url || null,
    media_kind: mediaKind,
    media_video_id: (video_url && media_video_id) ? media_video_id : null,
    status: 'publishing'
  })

  try {
    let postId, permalink
    if (video_url) {
      // Facebook Page video upload via file_url. Returns immediately with id;
      // FB processes async — the video appears on the page within seconds.
      const { data } = await axios.post(`${META_GRAPH}/${conn.page_id}/videos`, null, {
        params: { file_url: video_url, description: caption || '', access_token: pageToken },
        timeout: 60000
      })
      postId = data.id
      // FB videos use a different permalink shape
      permalink = `https://www.facebook.com/${conn.page_id}/videos/${postId}`
    } else if (image_url && image_url.startsWith('http')) {
      const { data } = await axios.post(`${META_GRAPH}/${conn.page_id}/photos`, null, {
        params: { url: image_url, caption: caption || '', access_token: pageToken },
        timeout: 30000
      })
      postId = data.post_id || data.id
    } else if (link) {
      const { data } = await axios.post(`${META_GRAPH}/${conn.page_id}/feed`, null, {
        params: { message: caption || '', link, access_token: pageToken },
        timeout: 15000
      })
      postId = data.id
    } else {
      const { data } = await axios.post(`${META_GRAPH}/${conn.page_id}/feed`, null, {
        params: { message: caption, access_token: pageToken },
        timeout: 15000
      })
      postId = data.id
    }
    if (!postId) throw new Error('Meta no devolvió post_id')

    // Resolve permalink
    permalink = `https://www.facebook.com/${postId}`
    try {
      const { data } = await axios.get(`${META_GRAPH}/${postId}`, {
        params: { fields: 'permalink_url', access_token: pageToken },
        timeout: 5000
      })
      if (data.permalink_url) permalink = data.permalink_url
    } catch (_) {}

    // Update the pending row to published
    if (pending && pending.id) {
      await sb.from('published_posts').update({
        post_id: postId, post_permalink: permalink,
        status: 'published', published_at: new Date().toISOString()
      }).eq('id', pending.id)
    }

    return res.json({
      success: true,
      platform: 'facebook',
      post_id: postId,
      permalink,
      page_name: conn.page_name
    })
  } catch (err) {
    const ge = graphErr(err, 'facebook_publish')
    if (pending && pending.id) {
      await sb.from('published_posts').update({
        status: 'failed', error_message: ge.message
      }).eq('id', pending.id)
    }
    if (ge.metaCode === 190) await markConnectionStatus(sb, auth.empresaId, 'expired', ge.message)
    if (ge.metaCode === 10)  await markConnectionStatus(sb, auth.empresaId, 'error',   ge.message)

    return res.status(500).json({
      success: false,
      error: ge.message,
      code: ge.code,
      meta_code: ge.metaCode,
      suggestion: ge.suggestion
    })
  }
}
