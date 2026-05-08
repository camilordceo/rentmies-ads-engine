/**
 * GET /api/credentials/meta/health
 *     Authorization: Bearer <supabase_jwt>
 *
 * Cheap health probe for the dashboard banner. Reads meta_connections,
 * tests the token against /me, returns connection summary + status.
 *
 * Distinct from /api/auth/meta/health: that one is OAuth-specific and
 * looks at token_expires_at. This one handles BOTH oauth and system_user
 * connections — system_user tokens never expire, so we only check that
 * the token still resolves /me (the user might have deleted the System
 * User in their Business Manager, in which case the token is dead).
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
    return { empresaId: req.headers['x-empresa-id'] || 'demo', demo: true }
  }
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data || !data.user) return { error: 'Token inválido', status: 401 }
  const { data: profile } = await sb.from('profiles').select('empresa_id').eq('id', data.user.id).maybeSingle()
  return { empresaId: (profile && profile.empresa_id) || data.user.id }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const { data: conn } = await sb.from('meta_connections')
    .select('id, token_type, long_lived_token, page_id, page_name, ig_business_id, ig_username, status, token_expires_at, last_health_check_at, last_error')
    .eq('empresa_id', auth.empresaId)
    .maybeSingle()

  if (!conn || !conn.long_lived_token) {
    return res.json({
      connected: false,
      page_name: null,
      token_healthy: false,
      instagram_connected: false,
      last_checked: null
    })
  }

  // Hit Graph /me — fast and cheap
  let healthy = true
  let errCode = null, errMsg = null
  try {
    const r = await axios.get(`${META_GRAPH}/me`, {
      params: { access_token: conn.long_lived_token, fields: 'id' },
      timeout: 6000
    })
    healthy = !!r.data.id
  } catch (err) {
    healthy = false
    const fb = err.response && err.response.data && err.response.data.error
    errCode = fb ? fb.code : null
    errMsg = fb ? (fb.error_user_msg || fb.message) : err.message
  }

  // For OAuth tokens, also check expiry
  let expiresInDays = null
  if (conn.token_type !== 'system_user' && conn.token_expires_at) {
    expiresInDays = Math.floor((new Date(conn.token_expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    if (expiresInDays < 0) healthy = false
  }

  // Persist the latest probe so the next reader sees fresh status
  try {
    const newStatus = healthy ? 'active' : (errCode === 190 ? 'expired' : (errCode === 10 ? 'revoked' : 'error'))
    await sb.from('meta_connections').update({
      status: newStatus,
      last_health_check_at: new Date().toISOString(),
      last_error: healthy ? null : errMsg
    }).eq('id', conn.id)
  } catch (e) {
    // non-fatal
  }

  return res.json({
    connected: true,
    page_name: conn.page_name,
    page_id: conn.page_id,
    token_healthy: healthy,
    token_type: conn.token_type || 'oauth',
    instagram_connected: !!conn.ig_business_id,
    instagram_username: conn.ig_username,
    expires_in_days: expiresInDays,   // null for system_user tokens
    last_checked: new Date().toISOString(),
    error: healthy ? null : errMsg,
    error_code: healthy ? null : errCode
  })
}
