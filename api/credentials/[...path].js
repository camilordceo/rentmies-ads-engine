/**
 * RENTMIES — Credentials API (catch-all)
 *
 * Routes:
 *   GET  /api/credentials/meta          → status (configured?)
 *   POST /api/credentials/meta          → save Meta credentials
 *   POST /api/credentials/meta/test     → validate Meta access_token against Graph /me
 *   POST /api/credentials/whatsapp      → save WhatsApp credentials
 *   GET  /api/credentials/google_ai     → status
 *   POST /api/credentials/google_ai     → save Google AI key
 *   POST /api/credentials/google_ai/test → validate against generativelanguage API
 *
 * Behavior:
 *   - If Supabase is configured, credentials are upserted into platform_credentials.
 *   - If not (demo mode), the endpoint acknowledges the save but reports
 *     persisted=false so the client knows to keep them in localStorage.
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

  const segs = Array.isArray(req.query.path) ? req.query.path : (req.query.path ? [req.query.path] : [])
  const route = segs.join('/')
  const empresaId = req.headers['x-empresa-id'] || 'demo'

  try {
    if (route === 'meta' && req.method === 'GET')        return res.json(await readCreds(empresaId, 'meta'))
    if (route === 'meta' && req.method === 'POST')       return res.json(await saveCreds(empresaId, 'meta', req.body || {}))
    if (route === 'meta/test' && req.method === 'POST')  return res.json(await testMetaToken((req.body && req.body.access_token) || ''))

    if (route === 'whatsapp' && req.method === 'POST')   return res.json(await saveCreds(empresaId, 'whatsapp', req.body || {}))

    if (route === 'google_ai' && req.method === 'GET')        return res.json(await readCreds(empresaId, 'google_ai'))
    if (route === 'google_ai' && req.method === 'POST')       return res.json(await saveCreds(empresaId, 'google_ai', req.body || {}))
    if (route === 'google_ai/test' && req.method === 'POST')  return res.json(await testGeminiKey((req.body && req.body.api_key) || ''))

    return res.status(404).json({ error: `Ruta no encontrada: /api/credentials/${route}` })
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
