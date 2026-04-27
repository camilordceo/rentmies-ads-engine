/**
 * RENTMIES — Social Post Publisher
 * POST /api/social-post
 *
 * Body: { inventario_id, platform, caption, image_url, empresa_id }
 * Platforms: facebook_page | instagram
 *
 * Publishes to Facebook/Instagram using Meta Graph API v21.
 * Reads Meta credentials from platform_credentials table (server-side).
 */

const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')

const META_GRAPH = 'https://graph.facebook.com/v21.0'

function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function getMetaCredentials(empresa_id, headers) {
  // 1. Headers from the dashboard (demo mode without Supabase persistence).
  if (headers && headers['x-meta-token']) {
    return {
      access_token: headers['x-meta-token'],
      page_id: headers['x-meta-page-id'] || '',
      ad_account_id: headers['x-meta-ad-account-id'] || '',
      waba_id: headers['x-waba-id'] || '',
      phone_number_id: headers['x-meta-phone-number-id'] || '',
      ig_user_id: headers['x-meta-ig-user-id'] || ''   // direct IG bypass
    }
  }

  // 2. Try server-side credentials from Supabase.
  const sb = getServiceClient()
  if (sb) {
    try {
      const { data } = await sb
        .from('platform_credentials')
        .select('credentials')
        .eq('empresa_id', empresa_id)
        .eq('platform', 'meta')
        .single()
      if (data?.credentials) return data.credentials
    } catch (_) {}
  }

  // 3. Fallback to env vars (server-level defaults).
  if (process.env.META_ACCESS_TOKEN) {
    return {
      access_token: process.env.META_ACCESS_TOKEN,
      page_id: process.env.META_PAGE_ID,
      ad_account_id: process.env.META_AD_ACCOUNT_ID,
      waba_id: process.env.META_WABA_ID,
      phone_number_id: process.env.META_PHONE_NUMBER_ID
    }
  }

  return null
}

async function getPageAccessToken(pageId, userToken) {
  // Page-level posts (/{page_id}/photos, /{page_id}/feed) require a Page Access Token,
  // NOT a User Access Token — using the latter triggers Meta's misleading
  // "publish_actions deprecated" error. Derive the Page Token from the User Token.
  try {
    const { data } = await axios.get(`${META_GRAPH}/${pageId}`, {
      params: { fields: 'access_token,name', access_token: userToken },
      timeout: 10000
    })
    if (data.access_token) return { token: data.access_token, pageName: data.name }
  } catch (err) {
    // If reading the page fails, surface a clear hint instead of letting it bubble up.
    const msg = formatMetaError(err)
    throw new Error(
      `No se pudo obtener el Page Access Token: ${msg}. ` +
      `Asegúrate de que tu token tenga los scopes 'pages_show_list', 'pages_manage_posts' y 'pages_read_engagement', ` +
      `y que seas admin de la página ${pageId}.`
    )
  }
  // No access_token in response → token is probably already page-scoped (System User token), use as-is.
  return { token: userToken, pageName: null }
}

async function publishToFacebookPage(pageId, userToken, { caption, imageUrl }) {
  const { token: pageToken } = await getPageAccessToken(pageId, userToken)

  let postId
  try {
    if (imageUrl && imageUrl.startsWith('http')) {
      const { data } = await axios.post(`${META_GRAPH}/${pageId}/photos`, null, {
        params: { url: imageUrl, caption: caption || '', access_token: pageToken },
        timeout: 30000
      })
      postId = data.post_id || data.id
    } else {
      const { data } = await axios.post(`${META_GRAPH}/${pageId}/feed`, null, {
        params: { message: caption, access_token: pageToken },
        timeout: 15000
      })
      postId = data.id
    }
  } catch (err) {
    throw new Error(`Publicación falló: ${formatMetaError(err)}`)
  }
  if (!postId) throw new Error('Meta no devolvió post_id')

  // Resolve the actual permalink_url so the success message links to the real post.
  let url = `https://www.facebook.com/${postId}`
  try {
    const { data } = await axios.get(`${META_GRAPH}/${postId}`, {
      params: { fields: 'permalink_url', access_token: pageToken },
      timeout: 5000
    })
    if (data.permalink_url) url = data.permalink_url
  } catch (_) {}

  return { post_id: postId, platform: 'facebook_page', url }
}

function formatMetaError(err) {
  const e = err.response && err.response.data && err.response.data.error
  if (!e) return err.message
  const msg = e.error_user_msg || e.message || 'error desconocido'
  const codeBits = [e.code, e.error_subcode].filter(Boolean).join('/')
  return codeBits ? `[${codeBits}] ${msg}` : msg
}

async function fetchInstagramAccountId(pageId, accessToken) {
  let data
  try {
    const r = await axios.get(`${META_GRAPH}/${pageId}`, {
      params: {
        fields: 'instagram_business_account,name',
        access_token: accessToken
      },
      timeout: 10000
    })
    data = r.data
  } catch (err) {
    throw new Error(`No se pudo leer la página de Facebook: ${formatMetaError(err)}`)
  }
  if (!data.instagram_business_account || !data.instagram_business_account.id) {
    throw new Error(
      `La página "${data.name || pageId}" no tiene una cuenta de Instagram Business vinculada. ` +
      `Vincúlala en Meta Business Suite → Configuración → Cuentas vinculadas.`
    )
  }
  return data.instagram_business_account.id
}

async function publishToInstagram(igUserId, accessToken, { caption, imageUrl }) {
  if (!imageUrl || !imageUrl.startsWith('http')) {
    throw new Error('Instagram requiere una URL de imagen pública (https://...)')
  }

  // Step 1: Create media container (use query params, not JSON body — Meta expects form-style)
  let containerId
  try {
    const { data } = await axios.post(`${META_GRAPH}/${igUserId}/media`, null, {
      params: {
        image_url: imageUrl,
        caption: caption || '',
        access_token: accessToken
      },
      timeout: 15000
    })
    containerId = data.id
  } catch (err) {
    throw new Error(`No se pudo crear el contenedor de Instagram: ${formatMetaError(err)}`)
  }
  if (!containerId) throw new Error('Meta no devolvió container_id')

  // Step 2: Poll status until FINISHED. Instagram needs a few seconds to fetch + validate the image.
  // Budget: 2s initial + 8 * 2.5s = 22s of polling, leaving ~7s for create/publish/permalink within the 30s function limit.
  const maxAttempts = 8
  const delayMs = 2500
  let lastStatus = null
  await new Promise(r => setTimeout(r, 2000))   // initial breathing room
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { data } = await axios.get(`${META_GRAPH}/${containerId}`, {
        params: { fields: 'status_code,status', access_token: accessToken },
        timeout: 5000
      })
      lastStatus = data.status_code
      if (lastStatus === 'FINISHED') break
      if (lastStatus === 'ERROR') {
        throw new Error(
          `Instagram rechazó la imagen (status ERROR). ` +
          `Verifica: formato JPEG, ancho 320–1440px, ratio entre 4:5 y 1.91:1, peso < 8MB, URL pública.`
        )
      }
      if (lastStatus === 'EXPIRED') throw new Error('El contenedor expiró antes de poderse publicar')
    } catch (err) {
      if (err.response) {
        // Network/Graph error during poll — give up after first one
        throw new Error(`Polling falló: ${formatMetaError(err)}`)
      }
      // Internal throw from above — propagate
      if (err.message.startsWith('Instagram rechazó') || err.message.startsWith('El contenedor')) throw err
    }
    await new Promise(r => setTimeout(r, delayMs))
  }
  if (lastStatus !== 'FINISHED') {
    throw new Error(`Timeout esperando procesamiento. Último estado: "${lastStatus || 'sin respuesta'}"`)
  }

  // Step 3: Publish
  let mediaId
  try {
    const { data } = await axios.post(`${META_GRAPH}/${igUserId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: accessToken },
      timeout: 15000
    })
    mediaId = data.id
  } catch (err) {
    throw new Error(`Publicación falló: ${formatMetaError(err)}`)
  }
  if (!mediaId) throw new Error('Meta no devolvió media_id tras publicar')

  // Step 4: Resolve a public permalink so the success message has a real URL.
  let url = `https://www.instagram.com/`
  try {
    const { data } = await axios.get(`${META_GRAPH}/${mediaId}`, {
      params: { fields: 'permalink', access_token: accessToken },
      timeout: 5000
    })
    if (data.permalink) url = data.permalink
  } catch (_) {}

  return { post_id: mediaId, platform: 'instagram', url }
}

// ─── Video publishing ──────────────────────────────────────────────────
// IG Reels — recommended path for short-form video on Instagram. Feed VIDEO
// has been deprecated by Meta in favor of REELS for new accounts.

async function publishVideoToInstagram(igUserId, accessToken, { caption, videoUrl, mediaType }) {
  if (!videoUrl || !videoUrl.startsWith('http')) {
    throw new Error('Instagram requiere una URL de video pública (https://...)')
  }

  // Default to REELS — that's what Meta promotes now and what works for new accounts.
  // Allow caller to force VIDEO if they want feed video specifically.
  const mt = (mediaType || 'REELS').toUpperCase() === 'VIDEO' ? 'VIDEO' : 'REELS'

  // Step 1: Create media container
  let containerId
  try {
    const { data } = await axios.post(`${META_GRAPH}/${igUserId}/media`, null, {
      params: {
        media_type: mt,
        video_url: videoUrl,
        caption: caption || '',
        share_to_feed: 'true',
        access_token: accessToken
      },
      timeout: 20000
    })
    containerId = data.id
  } catch (err) {
    throw new Error(`No se pudo crear el contenedor de video: ${formatMetaError(err)}`)
  }
  if (!containerId) throw new Error('Meta no devolvió container_id')

  // Step 2: Poll status. Videos take 30s-3min on Meta's side.
  // Budget: ~50s of polling within Vercel's 60s function limit.
  // Initial wait 5s + 18 attempts * 2.5s = 50s
  const maxAttempts = 18
  const delayMs = 2500
  let lastStatus = null
  await new Promise(r => setTimeout(r, 5000))
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { data } = await axios.get(`${META_GRAPH}/${containerId}`, {
        params: { fields: 'status_code,status', access_token: accessToken },
        timeout: 5000
      })
      lastStatus = data.status_code
      if (lastStatus === 'FINISHED') break
      if (lastStatus === 'ERROR') {
        throw new Error(
          `Instagram rechazó el video (status ERROR). ` +
          `Verifica: MP4/MOV, codec H.264, audio AAC, ratio 9:16 (Reels) o 4:5/1:1/16:9 (Feed), ` +
          `duración 3-90s (Reels), peso < 250MB (Reels) o 100MB (Feed).`
        )
      }
      if (lastStatus === 'EXPIRED') throw new Error('El contenedor expiró antes de poderse publicar')
    } catch (err) {
      if (err.message && (err.message.startsWith('Instagram rechazó') || err.message.startsWith('El contenedor'))) throw err
      if (err.response) throw new Error(`Polling falló: ${formatMetaError(err)}`)
    }
    await new Promise(r => setTimeout(r, delayMs))
  }
  if (lastStatus !== 'FINISHED') {
    // Don't fail: return container_id so client can retry with video-status action.
    return {
      status: 'processing',
      container_id: containerId,
      platform: 'instagram',
      media_type: mt,
      message: `Video aún procesando en Meta (último estado: ${lastStatus || 'sin respuesta'}). Reintenta en 30-60s con video-status.`
    }
  }

  // Step 3: Publish
  let mediaId
  try {
    const { data } = await axios.post(`${META_GRAPH}/${igUserId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: accessToken },
      timeout: 20000
    })
    mediaId = data.id
  } catch (err) {
    throw new Error(`Publicación falló: ${formatMetaError(err)}`)
  }
  if (!mediaId) throw new Error('Meta no devolvió media_id tras publicar')

  let url = `https://www.instagram.com/`
  try {
    const { data } = await axios.get(`${META_GRAPH}/${mediaId}`, {
      params: { fields: 'permalink', access_token: accessToken },
      timeout: 5000
    })
    if (data.permalink) url = data.permalink
  } catch (_) {}

  return { post_id: mediaId, platform: 'instagram', media_type: mt, url }
}

async function publishVideoToFacebookPage(pageId, userToken, { caption, videoUrl }) {
  const { token: pageToken } = await getPageAccessToken(pageId, userToken)

  // FB Page videos: POST /{page_id}/videos with file_url. Returns immediately
  // with the video id; FB processes the video async and the post appears in
  // the timeline once ready (usually within a minute).
  let videoId
  try {
    const { data } = await axios.post(`${META_GRAPH}/${pageId}/videos`, null, {
      params: {
        file_url: videoUrl,
        description: caption || '',
        access_token: pageToken
      },
      timeout: 30000
    })
    videoId = data.id
  } catch (err) {
    throw new Error(`Publicación de video falló: ${formatMetaError(err)}`)
  }
  if (!videoId) throw new Error('Meta no devolvió video id')

  // FB doesn't give a permalink immediately for processing videos — generic URL works.
  const url = `https://www.facebook.com/${pageId}/videos/${videoId}`
  return { post_id: videoId, platform: 'facebook_page', media_type: 'VIDEO', url }
}

// Resume polling for a video container that didn't finish in the original
// publish call. Caller passes container_id; we poll briefly and either publish
// or report still-processing.
async function resumeIgVideoPublish(igUserId, accessToken, containerId) {
  const maxAttempts = 8
  const delayMs = 2500
  let lastStatus = null
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { data } = await axios.get(`${META_GRAPH}/${containerId}`, {
        params: { fields: 'status_code,status', access_token: accessToken },
        timeout: 5000
      })
      lastStatus = data.status_code
      if (lastStatus === 'FINISHED') break
      if (lastStatus === 'ERROR') throw new Error('Instagram rechazó el video durante el procesamiento')
      if (lastStatus === 'EXPIRED') throw new Error('El contenedor expiró')
    } catch (err) {
      if (err.message && (err.message.startsWith('Instagram') || err.message.startsWith('El contenedor'))) throw err
      if (err.response) throw new Error(`Polling falló: ${formatMetaError(err)}`)
    }
    if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, delayMs))
  }
  if (lastStatus !== 'FINISHED') {
    return { status: 'processing', container_id: containerId, last_status: lastStatus }
  }
  let mediaId
  try {
    const { data } = await axios.post(`${META_GRAPH}/${igUserId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: accessToken },
      timeout: 20000
    })
    mediaId = data.id
  } catch (err) {
    throw new Error(`Publicación falló: ${formatMetaError(err)}`)
  }
  let url = 'https://www.instagram.com/'
  try {
    const { data } = await axios.get(`${META_GRAPH}/${mediaId}`, {
      params: { fields: 'permalink', access_token: accessToken },
      timeout: 5000
    })
    if (data.permalink) url = data.permalink
  } catch (_) {}
  return { status: 'published', post_id: mediaId, url }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id, x-meta-token, x-meta-page-id, x-meta-ad-account-id, x-waba-id, x-meta-phone-number-id, x-meta-ig-user-id')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = (req.query && req.query.action) || ''

  // ─── action=video-status: resume polling on a pending IG video container ─
  if (action === 'video-status') {
    const { container_id, empresa_id } = req.body || {}
    if (!container_id) return res.status(400).json({ error: 'container_id es requerido' })
    if (!empresa_id) return res.status(400).json({ error: 'empresa_id es requerido' })
    try {
      const creds = await getMetaCredentials(empresa_id, req.headers)
      if (!creds || !creds.access_token) {
        return res.status(400).json({ error: 'Sin credenciales Meta' })
      }
      let igAccountId = creds.ig_user_id || ''
      if (!igAccountId && creds.page_id) {
        igAccountId = await fetchInstagramAccountId(creds.page_id, creds.access_token)
      }
      if (!igAccountId) return res.status(400).json({ error: 'Sin IG Business Account ID' })
      const result = await resumeIgVideoPublish(igAccountId, creds.access_token, container_id)
      return res.json(result)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  const {
    inventario_id,
    platform = 'facebook_page',
    caption,
    image_url,
    video_url,
    media_type,
    empresa_id
  } = req.body || {}

  const isVideo = (media_type && media_type.toLowerCase() === 'video') || !!video_url

  if (!caption) return res.status(400).json({ error: 'caption es requerido' })
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id es requerido' })

  try {
    // Get Meta credentials (headers > Supabase > env vars)
    const creds = await getMetaCredentials(empresa_id, req.headers)
    if (!creds) {
      return res.status(400).json({
        error: 'No hay credenciales de Meta configuradas.',
        detail: 'Ve a Configuración → Integraciones → Meta y guarda tus credenciales.',
        retry_allowed: false
      })
    }

    if (!creds.access_token) {
      return res.status(400).json({
        error: 'Falta el Access Token de Meta.',
        detail: 'Configura META_ACCESS_TOKEN en las credenciales.',
        retry_allowed: false
      })
    }

    let result
    if (platform === 'instagram') {
      if (isVideo) {
        if (!video_url || !video_url.startsWith('http')) {
          return res.status(400).json({ error: 'Video requerido', detail: 'IG requiere video_url pública.' })
        }
      } else if (!image_url || !image_url.startsWith('http')) {
        return res.status(400).json({
          error: 'Imagen requerida',
          detail: 'Instagram requiere una URL de imagen pública.'
        })
      }
      // Direct IG user_id bypass: skips the FB Page lookup entirely.
      let igAccountId = creds.ig_user_id || ''
      if (!igAccountId) {
        if (!creds.page_id) {
          return res.status(400).json({
            error: 'Falta Page ID de Facebook o IG Business Account ID',
            detail: 'Necesitas EITHER el Page ID O el IG Business Account ID directo. Guárdalos en ⚙️ Configuración.'
          })
        }
        try {
          igAccountId = await fetchInstagramAccountId(creds.page_id, creds.access_token)
        } catch (err) {
          return res.status(400).json({
            error: 'No se pudo obtener la cuenta de Instagram',
            detail: err.message + ' — Tip: guarda el IG Business Account ID directo y se salta este paso.'
          })
        }
      }
      if (isVideo) {
        result = await publishVideoToInstagram(igAccountId, creds.access_token, {
          caption, videoUrl: video_url, mediaType: media_type
        })
      } else {
        result = await publishToInstagram(igAccountId, creds.access_token, { caption, imageUrl: image_url })
      }
    } else {
      if (!creds.page_id) throw new Error('Falta el Page ID de Facebook en las credenciales.')
      if (isVideo) {
        if (!video_url || !video_url.startsWith('http')) {
          return res.status(400).json({ error: 'Video requerido', detail: 'FB requiere video_url pública.' })
        }
        result = await publishVideoToFacebookPage(creds.page_id, creds.access_token, { caption, videoUrl: video_url })
      } else {
        result = await publishToFacebookPage(creds.page_id, creds.access_token, { caption, imageUrl: image_url })
      }
    }

    // If IG video is still processing, return 202 with container_id
    if (result.status === 'processing') {
      return res.status(202).json({
        success: false,
        status: 'processing',
        container_id: result.container_id,
        platform: result.platform,
        media_type: result.media_type,
        message: result.message
      })
    }

    // Save to social_posts table (best-effort)
    const sb = getServiceClient()
    if (sb) {
      try {
        await sb.from('social_posts').insert({
          empresa_id,
          inventario_id: inventario_id || null,
          platform,
          caption,
          image_url: image_url || video_url || null,
          post_id: result.post_id,
          post_url: result.url,
          status: 'published',
          published_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
      } catch (e) {
        console.warn('[social-post] Could not save to social_posts:', e.message)
      }
    }

    return res.json({
      success: true,
      post_id: result.post_id,
      url: result.url,
      platform,
      message: `Publicado en ${platform === 'instagram' ? 'Instagram' : 'Facebook'}`
    })
  } catch (err) {
    console.error('[social-post]', err.message, err.response && err.response.data)
    const detail = err.response ? formatMetaError(err) : err.message

    return res.status(500).json({
      error: 'No se pudo publicar el post',
      detail,
      retry_allowed: true
    })
  }
}
