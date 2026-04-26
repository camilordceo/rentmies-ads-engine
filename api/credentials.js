/**
 * RENTMIES — Credentials API
 *
 *   GET  /api/credentials?action=meta              → status (configured?)
 *   POST /api/credentials?action=meta              → save Meta credentials
 *   POST /api/credentials?action=meta-test         → validate access_token against Graph /me
 *   POST /api/credentials?action=whatsapp          → save WhatsApp credentials
 *   GET  /api/credentials?action=google_ai         → status
 *   POST /api/credentials?action=google_ai         → save Google AI key
 *   POST /api/credentials?action=google_ai-test    → validate key against Gemini list-models
 *
 * Persistence:
 *   - With Supabase env vars set, upserts to platform_credentials.
 *   - Without them, returns persisted=false so the client keeps creds in localStorage.
 */

const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')

const META_GRAPH = 'https://graph.facebook.com/v21.0'

function getSupabaseService() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = (req.query.action || '').toString()
  const empresaId = req.headers['x-empresa-id'] || 'demo'

  try {
    if (action === 'meta' && req.method === 'GET')        return res.json(await readCreds(empresaId, 'meta'))
    if (action === 'meta' && req.method === 'POST')       return res.json(await saveCreds(empresaId, 'meta', req.body || {}))
    if (action === 'meta-test' && req.method === 'POST')  return res.json(await testMetaToken((req.body && req.body.access_token) || ''))
    if (action === 'meta-detect-ig' && req.method === 'POST') return res.json(await detectInstagramAccount((req.body && req.body.access_token) || '', (req.body && req.body.page_id) || ''))

    if (action === 'whatsapp' && req.method === 'POST')   return res.json(await saveCreds(empresaId, 'whatsapp', req.body || {}))

    if (action === 'google_ai' && req.method === 'GET')        return res.json(await readCreds(empresaId, 'google_ai'))
    if (action === 'google_ai' && req.method === 'POST')       return res.json(await saveCreds(empresaId, 'google_ai', req.body || {}))
    if (action === 'google_ai-test' && req.method === 'POST')  return res.json(await testGeminiKey((req.body && req.body.api_key) || ''))

    return res.status(400).json({ error: `Acción no válida: '${action}'. Usa meta | meta-test | whatsapp | google_ai | google_ai-test` })
  } catch (err) {
    console.error('[credentials]', err)
    return res.status(500).json({ error: err.message })
  }
}

async function readCreds(empresaId, platform) {
  const sb = getSupabaseService()
  if (!sb) return { configured: false, demo: true }
  try {
    const { data } = await sb
      .from('platform_credentials')
      .select('platform, last_tested_at, configured')
      .eq('empresa_id', empresaId)
      .eq('platform', platform)
      .maybeSingle()
    return { configured: !!(data && data.configured), last_tested_at: (data && data.last_tested_at) || null }
  } catch (_) {
    return { configured: false }
  }
}

async function saveCreds(empresaId, platform, body) {
  const sb = getSupabaseService()
  if (!sb) return { success: true, persisted: false, message: 'Guardado en navegador (Supabase no configurado)' }
  try {
    const { error } = await sb
      .from('platform_credentials')
      .upsert({
        empresa_id: empresaId,
        platform,
        credentials: body,
        configured: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'empresa_id,platform' })
    if (error) return { success: false, error: error.message }
    return { success: true, persisted: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function testMetaToken(token) {
  if (!token) return { success: false, error: 'access_token es requerido' }
  try {
    const { data } = await axios.get(`${META_GRAPH}/me`, {
      params: { access_token: token },
      timeout: 10000
    })
    return { success: true, message: `Conectado como ${data.name || data.id}` }
  } catch (err) {
    const fb = err.response && err.response.data && err.response.data.error
    if (fb) return { success: false, error: `[${fb.code}] ${fb.message}` }
    return { success: false, error: err.message }
  }
}

async function detectInstagramAccount(token, pageId) {
  if (!token) return { success: false, error: 'access_token es requerido' }
  if (!pageId) return { success: false, error: 'page_id es requerido' }
  try {
    const { data } = await axios.get(`${META_GRAPH}/${pageId}`, {
      params: { fields: 'instagram_business_account,name', access_token: token },
      timeout: 10000
    })
    if (!data.instagram_business_account || !data.instagram_business_account.id) {
      return { success: false, error: `La página "${data.name || pageId}" no tiene una cuenta de Instagram Business vinculada.` }
    }
    return { success: true, ig_user_id: data.instagram_business_account.id, page_name: data.name || null }
  } catch (err) {
    const fb = err.response && err.response.data && err.response.data.error
    if (fb) return { success: false, error: `[${fb.code}] ${fb.message}` }
    return { success: false, error: err.message }
  }
}

async function testGeminiKey(key) {
  if (!key) return { success: false, error: 'api_key es requerida' }
  try {
    const { data } = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
      params: { key },
      timeout: 10000
    })
    const count = (data.models || []).length
    return { success: true, message: `${count} modelos disponibles` }
  } catch (err) {
    const ge = err.response && err.response.data && err.response.data.error
    if (ge) return { success: false, error: ge.message }
    return { success: false, error: err.message }
  }
}
