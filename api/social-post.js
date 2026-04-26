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
      phone_number_id: headers['x-meta-phone-number-id'] || ''
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id, x-meta-token, x-meta-page-id, x-meta-ad-account-id, x-waba-id, x-meta-phone-number-id')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    inventario_id,
    platform = 'facebook_page',
    caption,
    image_url,
    empresa_id
  } = req.body || {}

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
      if (!creds.page_id) {
        return res.status(400).json({
          error: 'Falta Page ID de Facebook',
          detail: 'Para publicar en Instagram necesitas el Page ID de la página de Facebook que tiene la cuenta de IG Business vinculada. Guárdalo en ⚙️ Configuración → Meta/Facebook.'
        })
      }
      if (!image_url || !image_url.startsWith('http')) {
        return res.status(400).json({
          error: 'Imagen requerida',
          detail: 'Instagram requiere una URL de imagen pública. Selecciona un inmueble que tenga foto o pega una URL en el campo de imagen.'
        })
      }
      let igAccountId
      try {
        igAccountId = await fetchInstagramAccountId(creds.page_id, creds.access_token)
      } catch (err) {
        return res.status(400).json({ error: 'No se pudo obtener la cuenta de Instagram', detail: err.message })
      }
      result = await publishToInstagram(igAccountId, creds.access_token, { caption, imageUrl: image_url })
    } else {
      if (!creds.page_id) throw new Error('Falta el Page ID de Facebook en las credenciales.')
      result = await publishToFacebookPage(creds.page_id, creds.access_token, { caption, imageUrl: image_url })
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
          image_url: image_url || null,
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
