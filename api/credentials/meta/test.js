/**
 * POST /api/credentials/meta/test
 *      Authorization: Bearer <supabase_jwt>
 *      body: { access_token, page_id, instagram_id?, waba_id? }
 *
 * Validates a System User token end-to-end against Meta Graph:
 *  1. /me — token works, returns business name (or system user name)
 *  2. /{page_id} — System User has the Page assigned, plus we fetch the
 *     PAGE-level access_token (the one we actually post with).
 *  3. /{ig_business_id} (if provided) — IG Business asset is reachable.
 *  4. /{waba_id} (if provided) — WhatsApp Business Account is reachable.
 *  5. Persists the page_access_token + asset metadata to meta_connections
 *     and flips status → 'active'.
 *
 * Returns the rich shape the Settings UI uses to render the success card:
 *   { ok, page_name, page_id, instagram, whatsapp, token_type, expires }
 */

const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')

const META_GRAPH = 'https://graph.facebook.com/v21.0'

function getServiceClient () {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function authedEmpresa (req, sb) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return { error: 'No token', status: 401 }
  if (token.startsWith('demo_')) {
    return { empresaId: req.headers['x-empresa-id'] || 'demo', userId: 'demo', demo: true }
  }
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data || !data.user) return { error: 'Token inválido', status: 401 }
  const { data: profile } = await sb.from('profiles').select('empresa_id').eq('id', data.user.id).maybeSingle()
  return { empresaId: (profile && profile.empresa_id) || data.user.id, userId: data.user.id }
}

function fbErr (err) {
  const fb = err.response && err.response.data && err.response.data.error
  if (!fb) return err.message
  const code = [fb.code, fb.error_subcode].filter(Boolean).join('/')
  return code ? `[${code}] ${fb.error_user_msg || fb.message}` : (fb.error_user_msg || fb.message)
}

function fbErrorCode (err) {
  const fb = err.response && err.response.data && err.response.data.error
  return fb ? fb.code : null
}

function suggestionForCode (code) {
  if (code === 190) return 'El token es inválido o fue revocado. Genera uno nuevo en Business Settings → System Users.'
  if (code === 200) return 'Faltan permisos. Regenera el token con pages_manage_posts, instagram_content_publish y instagram_basic.'
  if (code === 100) return 'Verifica que el ID que pegaste sea correcto y que el System User tenga el asset asignado.'
  if (code === 10)  return 'Tu app de Meta no tiene permiso. Asegúrate de haber instalado la app Rentmies en tu Business Manager.'
  return null
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ ok: false, error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ ok: false, error: auth.error })

  const { access_token, page_id, instagram_id, waba_id } = req.body || {}
  if (!access_token) return res.status(400).json({ ok: false, error: 'access_token es requerido' })
  if (!page_id) return res.status(400).json({ ok: false, error: 'page_id es requerido' })

  // ── 1. Probe /me ──────────────────────────────────────────
  let meName = null
  try {
    const { data } = await axios.get(`${META_GRAPH}/me`, {
      params: { access_token, fields: 'id,name' },
      timeout: 8000
    })
    meName = data.name || data.id
  } catch (err) {
    return res.status(200).json({
      ok: false,
      step: 'token',
      error: 'El token no es válido. ' + (suggestionForCode(fbErrorCode(err)) || ''),
      detail: fbErr(err)
    })
  }

  // ── 2. Probe Page + grab page-level access token ──────────
  let page
  try {
    const { data } = await axios.get(`${META_GRAPH}/${page_id}`, {
      params: {
        fields: 'id,name,picture{url},category,fan_count,access_token,instagram_business_account,tasks',
        access_token
      },
      timeout: 10000
    })
    page = data
  } catch (err) {
    return res.status(200).json({
      ok: false,
      step: 'page',
      error: `No tienes acceso a la página ${page_id}. ${suggestionForCode(fbErrorCode(err)) || 'Verifica que el System User tenga la página asignada como asset.'}`,
      detail: fbErr(err)
    })
  }
  if (!page.access_token) {
    return res.status(200).json({
      ok: false,
      step: 'page_token',
      error: 'La página no devolvió un Page Access Token. Asegúrate de asignar la página al System User con permiso "Manage Page" (no solo "Analyze").',
      detail: 'Sin page.access_token en la respuesta'
    })
  }

  // ── 3. Probe IG (optional) ────────────────────────────────
  let ig = null
  const igId = instagram_id || (page.instagram_business_account && page.instagram_business_account.id)
  if (igId) {
    try {
      const { data } = await axios.get(`${META_GRAPH}/${igId}`, {
        params: {
          fields: 'username,profile_picture_url,followers_count,follows_count,media_count',
          access_token
        },
        timeout: 8000
      })
      ig = { id: igId, username: data.username, profile_picture_url: data.profile_picture_url, followers_count: data.followers_count, media_count: data.media_count }
    } catch (err) {
      return res.status(200).json({
        ok: false,
        step: 'instagram',
        error: instagram_id
          ? 'Instagram ID incorrecto o no vinculado a esta página. Déjalo vacío para que lo detectemos automáticamente.'
          : 'No se pudo leer Instagram aunque la Page lo reporta vinculado. Asegúrate de asignar IG al System User como asset.',
        detail: fbErr(err)
      })
    }
  }

  // ── 4. Probe WABA (optional) ──────────────────────────────
  let waba = null
  if (waba_id) {
    try {
      const { data } = await axios.get(`${META_GRAPH}/${waba_id}`, {
        params: {
          fields: 'id,name,phone_numbers{id,display_phone_number,verified_name}',
          access_token
        },
        timeout: 8000
      })
      const phone = data.phone_numbers && data.phone_numbers.data && data.phone_numbers.data[0]
      waba = {
        id: data.id,
        name: data.name || null,
        phone_number_id: phone ? phone.id : null,
        display_phone_number: phone ? phone.display_phone_number : null,
        verified_name: phone ? phone.verified_name : null
      }
    } catch (err) {
      return res.status(200).json({
        ok: false,
        step: 'whatsapp',
        error: 'WABA ID incorrecto o sin acceso. Déjalo vacío si no usas WhatsApp.',
        detail: fbErr(err)
      })
    }
  }

  // ── 5. Persist everything to meta_connections ─────────────
  const update = {
    empresa_id: auth.empresaId,
    token_type: 'system_user',
    long_lived_token: access_token,
    meta_user_name: meName,
    page_id: page.id,
    page_name: page.name,
    page_picture_url: page.picture && page.picture.data ? page.picture.data.url : null,
    page_category: page.category || null,
    page_followers_count: page.fan_count || null,
    page_access_token: page.access_token,   // ← CRITICAL: this is what we post with
    page_tasks: page.tasks || null,
    ig_business_id: ig ? ig.id : null,
    ig_username: ig ? ig.username : null,
    ig_profile_picture_url: ig ? ig.profile_picture_url : null,
    ig_followers_count: ig ? ig.followers_count : null,
    waba_id: waba ? waba.id : null,
    whatsapp_phone_number_id: waba ? waba.phone_number_id : null,
    whatsapp_display_name: waba ? (waba.verified_name || waba.name) : null,
    status: 'active',
    last_tested_at: new Date().toISOString(),
    last_health_check_at: new Date().toISOString(),
    last_error: null,
    source: 'system_user',
    updated_at: new Date().toISOString()
  }

  try {
    if (!auth.demo) {
      // Make sure empresa exists (Settings save endpoint also handles this; do it again defensively)
      const { data: emp } = await sb.from('empresas').select('id').eq('id', auth.empresaId).maybeSingle()
      if (!emp) {
        await sb.from('empresas').insert({ id: auth.empresaId, nombre: meName || 'Mi inmobiliaria', plan: 'Trial' })
      }
    }
    const { error } = await sb.from('meta_connections').upsert(update, { onConflict: 'empresa_id' })
    if (error) console.warn('[credentials/meta/test] persist failed:', error.message)

    // Also mirror to platform_credentials for backward compatibility
    await sb.from('platform_credentials').upsert({
      empresa_id: auth.empresaId,
      platform: 'meta',
      credentials: {
        access_token,
        page_id: page.id,
        ig_user_id: ig ? ig.id : '',
        waba_id: waba ? waba.id : '',
        phone_number_id: waba ? waba.phone_number_id : ''
      },
      configured: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'empresa_id,platform' })
  } catch (err) {
    console.warn('[credentials/meta/test] persistence error (non-fatal):', err.message)
  }

  return res.json({
    ok: true,
    page_name: page.name,
    page_id: page.id,
    page_followers: page.fan_count || 0,
    instagram: ig ? { username: ig.username, followers: ig.followers_count, id: ig.id } : null,
    whatsapp: waba ? { name: waba.verified_name || waba.name, phone: waba.display_phone_number, id: waba.id } : null,
    token_type: 'system_user',
    expires: 'never',
    me_name: meName
  })
}
