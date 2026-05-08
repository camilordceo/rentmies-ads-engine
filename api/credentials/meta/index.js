/**
 * GET  /api/credentials/meta
 *      Authorization: Bearer <supabase_jwt>
 *      → returns the empresa's meta_connections row (or null if none)
 *
 * POST /api/credentials/meta
 *      Authorization: Bearer <supabase_jwt>
 *      body: { access_token, page_id, instagram_id?, waba_id?, business_manager_id? }
 *      → upserts a system_user-type row in meta_connections (and writes
 *        platform_credentials too so legacy /app and /dashboard can keep
 *        reading from localStorage.meta_creds without changes).
 *
 * Save-only: this does NOT validate the token against Graph. Use
 * /api/credentials/meta/test for that — most callers will save THEN test
 * (or test, then save what test discovered) inside the Settings UI.
 */

const { createClient } = require('@supabase/supabase-js')

function getServiceClient () {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function authedEmpresa (req, sb) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return { error: 'No token', status: 401 }
  // Demo bypass for local dev / unauthenticated /app users
  if (token.startsWith('demo_')) {
    const empresaId = req.headers['x-empresa-id'] || 'demo'
    return { empresaId, userId: empresaId, demo: true }
  }
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data || !data.user) return { error: 'Token inválido', status: 401 }
  const { data: profile } = await sb.from('profiles').select('empresa_id').eq('id', data.user.id).maybeSingle()
  const empresaId = (profile && profile.empresa_id) || data.user.id
  return { empresaId, userId: data.user.id }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado en el servidor' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  if (req.method === 'GET') return getStatus(req, res, sb, auth)
  if (req.method === 'POST') return saveCreds(req, res, sb, auth)
  return res.status(405).json({ error: 'Method not allowed' })
}

async function getStatus (req, res, sb, auth) {
  try {
    const { data, error } = await sb.from('meta_connections')
      .select(`
        id, token_type, status, last_tested_at, last_health_check_at, last_error,
        page_id, page_name, page_picture_url, page_followers_count,
        ig_business_id, ig_username, ig_profile_picture_url, ig_followers_count,
        waba_id, whatsapp_phone_number_id, whatsapp_display_name,
        business_manager_id, system_user_id,
        token_expires_at, created_at, updated_at
      `)
      .eq('empresa_id', auth.empresaId)
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.json({ connected: false, empresa_id: auth.empresaId })
    return res.json({ connected: true, ...data, empresa_id: auth.empresaId })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

async function saveCreds (req, res, sb, auth) {
  const { access_token, page_id, instagram_id, waba_id, business_manager_id, system_user_id } = req.body || {}
  if (!access_token) return res.status(400).json({ error: 'access_token es requerido' })
  if (!page_id) return res.status(400).json({ error: 'page_id es requerido' })

  // Make sure the empresa exists for non-demo users (auth/meta/callback would
  // have created one, but pasting a token in Settings on a fresh account won't).
  if (!auth.demo) {
    const { data: emp } = await sb.from('empresas').select('id').eq('id', auth.empresaId).maybeSingle()
    if (!emp) {
      const { data: created, error: empErr } = await sb.from('empresas').insert({
        id: auth.empresaId,
        nombre: 'Mi inmobiliaria',
        plan: 'Trial'
      }).select().single()
      if (empErr) return res.status(500).json({ error: 'No pude crear empresa: ' + empErr.message })
      // Also link the profile if missing
      await sb.from('profiles').upsert({ id: auth.userId, empresa_id: created.id, rol: 'Admin', plan: 'Trial', activo: true })
    }
  }

  const row = {
    empresa_id: auth.empresaId,
    token_type: 'system_user',
    long_lived_token: access_token,
    page_id,
    ig_business_id: instagram_id || null,
    waba_id: waba_id || null,
    business_manager_id: business_manager_id || null,
    system_user_id: system_user_id || null,
    status: 'pending_test',   // flips to 'active' once /test succeeds
    last_error: null,
    updated_at: new Date().toISOString()
  }

  try {
    const { error } = await sb.from('meta_connections').upsert(row, { onConflict: 'empresa_id' })
    if (error) return res.status(500).json({ error: 'meta_connections upsert: ' + error.message })

    // Mirror to platform_credentials so /app legacy + dashboard quickpost
    // (which read localStorage.meta_creds) keep working without code changes.
    await sb.from('platform_credentials').upsert({
      empresa_id: auth.empresaId,
      platform: 'meta',
      credentials: {
        access_token,
        page_id,
        ig_user_id: instagram_id || '',
        waba_id: waba_id || ''
      },
      configured: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'empresa_id,platform' })

    return res.json({ success: true, empresa_id: auth.empresaId, status: row.status })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
