/**
 * GET  /api/auth/meta/connection
 *      Authorization: Bearer <supabase_jwt>
 *
 * Returns the meta_connections row for the empresa of the logged-in user.
 * Used by /onboarding/post-oauth to populate localStorage.meta_creds and
 * by /dashboard Settings to show connection health.
 */

const { createClient } = require('@supabase/supabase-js')

function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function authedEmpresaId(req, sb) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return { error: 'No token' }
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data || !data.user) return { error: 'Token inválido' }
  const { data: profile } = await sb.from('profiles').select('empresa_id').eq('id', data.user.id).maybeSingle()
  if (!profile || !profile.empresa_id) return { error: 'Perfil sin empresa_id' }
  return { empresaId: profile.empresa_id, userId: data.user.id }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresaId(req, sb)
  if (auth.error) return res.status(401).json({ error: auth.error })

  try {
    const { data, error } = await sb.from('meta_connections')
      .select(`
        id, meta_user_id, meta_user_name, meta_user_email,
        long_lived_token, token_expires_at, last_refreshed_at,
        page_id, page_name, page_picture_url, page_category, page_followers_count, page_access_token, page_tasks,
        ig_business_id, ig_username, ig_profile_picture_url, ig_followers_count,
        waba_id, whatsapp_phone_number_id, whatsapp_display_name,
        status, last_error, last_health_check_at,
        available_pages, source, created_at, updated_at
      `)
      .eq('empresa_id', auth.empresaId)
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Sin conexión Meta', empresa_id: auth.empresaId })

    // Compute lightweight health info
    const expiresAt = new Date(data.token_expires_at)
    const daysUntilExpiry = Math.floor((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    const health = data.status !== 'active'
      ? 'unhealthy'
      : (daysUntilExpiry < 0 ? 'expired' : (daysUntilExpiry < 7 ? 'expiring_soon' : 'healthy'))

    return res.json({ ...data, days_until_expiry: daysUntilExpiry, health, empresa_id: auth.empresaId })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
