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

async function publishToFacebookPage(pageId, accessToken, { caption, imageUrl }) {
  if (imageUrl && imageUrl.startsWith('http')) {
    // Post photo
    const { data } = await axios.post(`${META_GRAPH}/${pageId}/photos`, {
      url: imageUrl,
      caption,
      access_token: accessToken
    })
    return { post_id: data.id || data.post_id, platform: 'facebook_page', url: `https://www.facebook.com/${data.id || data.post_id}` }
  } else {
    // Text-only post
    const { data } = await axios.post(`${META_GRAPH}/${pageId}/feed`, {
      message: caption,
      access_token: accessToken
    })
    return { post_id: data.id, platform: 'facebook_page', url: `https://www.facebook.com/${data.id}` }
  }
}

async function publishToInstagram(pageId, accessToken, { caption, imageUrl }) {
  if (!imageUrl || !imageUrl.startsWith('http')) {
    throw new Error('Instagram requires a public image URL')
  }

  // Step 1: Create media container
  const { data: container } = await axios.post(`${META_GRAPH}/${pageId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: accessToken
  })

  if (!container.id) throw new Error('Failed to create Instagram media container')

  // Step 2: Publish container
  const { data: published } = await axios.post(`${META_GRAPH}/${pageId}/media_publish`, {
    creation_id: container.id,
    access_token: accessToken
  })

  return {
    post_id: published.id,
    platform: 'instagram',
    url: `https://www.instagram.com/p/${published.id}`
  }
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

    // Get Instagram business account ID if posting to Instagram
    let igAccountId = null
    if (platform === 'instagram' && creds.page_id) {
      try {
        const { data: pageData } = await axios.get(`${META_GRAPH}/${creds.page_id}`, {
          params: {
            fields: 'instagram_business_account',
            access_token: creds.access_token
          }
        })
        igAccountId = pageData.instagram_business_account?.id
      } catch (e) {
        console.warn('[social-post] Could not fetch IG account:', e.message)
      }
    }

    let result
    if (platform === 'instagram') {
      if (!igAccountId) throw new Error('No se encontró cuenta de Instagram Business vinculada a esta página.')
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
    console.error('[social-post]', err.message, err.response?.data)
    const detail = err.response?.data?.error?.message || err.message

    return res.status(500).json({
      error: 'No se pudo publicar el post',
      detail,
      retry_allowed: true
    })
  }
}
