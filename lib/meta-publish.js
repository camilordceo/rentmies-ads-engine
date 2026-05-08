/**
 * Shared helpers for the new published_posts pipeline.
 *  - getActiveConnection(empresaId) → meta_connections row, or throws
 *  - logPublished(...) → insert into published_posts
 *  - graphErr(...) → format Meta Graph errors with actionable hints
 *
 * Used by api/posts/publish/{facebook,instagram}.js. The legacy
 * api/social-post.js endpoint (header-driven, used by /app) does NOT
 * use this — it stays untouched.
 */

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
  if (!token) {
    // Allow header-based auth for dashboard pages that don't pass a Supabase JWT
    const empresaId = req.headers['x-empresa-id']
    if (empresaId) return { empresaId, demo: true }
    return { error: 'No token', status: 401 }
  }
  if (token.startsWith('demo_')) {
    return { empresaId: req.headers['x-empresa-id'] || 'demo', demo: true }
  }
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data || !data.user) return { error: 'Token inválido', status: 401 }
  const { data: profile } = await sb.from('profiles').select('empresa_id').eq('id', data.user.id).maybeSingle()
  return { empresaId: (profile && profile.empresa_id) || data.user.id, userId: data.user.id }
}

async function getActiveConnection (sb, empresaId) {
  const { data, error } = await sb.from('meta_connections')
    .select('id, token_type, status, long_lived_token, page_id, page_name, page_access_token, ig_business_id, ig_username')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (error) { const e = new Error(error.message); e.code = 'connection_lookup_failed'; throw e }
  if (!data) {
    const e = new Error('No tienes una conexión Meta. Configúrala en Settings.')
    e.code = 'no_connection'
    e.status = 400
    throw e
  }
  if (!data.long_lived_token) {
    const e = new Error('Tu conexión Meta no tiene un token. Vuelve a guardar las credenciales en Settings.')
    e.code = 'no_token'
    e.status = 400
    throw e
  }
  return data
}

/**
 * Map Graph API errors to actionable user-facing messages plus a stable code
 * the frontend can switch on.
 */
function graphErr (err, context) {
  const fb = err.response && err.response.data && err.response.data.error
  const code = fb ? fb.code : null
  const sub = fb ? fb.error_subcode : null
  const message = fb ? (fb.error_user_msg || fb.message) : err.message

  let userMsg = message
  let suggestion = null
  let action = null   // 'reconnect' | 'check_permissions' | 'install_app' | null

  if (code === 190) {
    userMsg = 'El token de Meta es inválido o fue revocado.'
    suggestion = 'Genera un nuevo token en Business Settings → System Users → Generate New Token.'
    action = 'reconnect'
  } else if (code === 200) {
    userMsg = 'Faltan permisos en tu token.'
    suggestion = 'Regenera el token y marca pages_manage_posts, instagram_content_publish y instagram_basic.'
    action = 'check_permissions'
  } else if (code === 10) {
    userMsg = 'La app Rentmies no está instalada en tu Business Manager.'
    suggestion = 'Ve a Business Settings → Apps y agrega Rentmies, luego asigna assets al System User.'
    action = 'install_app'
  } else if (code === 100) {
    userMsg = 'ID inválido o sin acceso.'
    suggestion = 'Verifica que el ID sea correcto y que el System User tenga el asset asignado.'
  }

  const formatted = code ? `[${code}${sub ? '/' + sub : ''}] ${userMsg}` : userMsg
  const out = new Error(formatted)
  out.code = action || ('graph_' + (code || 'unknown'))
  out.metaCode = code
  out.suggestion = suggestion
  out.context = context
  return out
}

async function logPublished (sb, payload) {
  try {
    const { data, error } = await sb.from('published_posts').insert(payload).select().single()
    if (error) { console.warn('[meta-publish] log insert failed:', error.message); return null }
    return data
  } catch (e) {
    console.warn('[meta-publish] log insert threw:', e.message); return null
  }
}

async function markConnectionStatus (sb, empresaId, status, errMsg) {
  try {
    await sb.from('meta_connections').update({
      status,
      last_error: errMsg || null,
      updated_at: new Date().toISOString()
    }).eq('empresa_id', empresaId)
  } catch (_) {}
}

module.exports = {
  META_GRAPH,
  getServiceClient,
  authedEmpresa,
  getActiveConnection,
  graphErr,
  logPublished,
  markConnectionStatus
}
