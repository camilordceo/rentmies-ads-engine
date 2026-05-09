/**
 * GET /api/tiktok/connection
 *   Returns the TikTok OAuth connection for the authed empresa.
 *   Used by Settings (channel card) and js/tiktok/health.js.
 *
 * Response shape:
 *   { connected: true|false, ...row fields when connected }
 */

const { getServiceClient, authedEmpresa, cors } = require('../_lib/auth')

module.exports = async (req, res) => {
  cors(res, 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  try {
    const { data, error } = await sb
      .from('tiktok_connections')
      .select('id, status, tiktok_username, tiktok_avatar_url, business_account_id, access_token_expires_at, last_refreshed_at, last_health_check_at, created_at, updated_at')
      .eq('empresa_id', auth.empresaId)
      .maybeSingle()

    if (error) {
      if (error.code === '42P01') return res.json({ connected: false, _hint: 'Run supabase/schema-multichannel.sql' })
      return res.status(500).json({ error: error.message })
    }

    if (!data) return res.json({ connected: false })

    return res.json({
      connected: true,
      status: data.status,
      username: data.tiktok_username,
      avatar_url: data.tiktok_avatar_url,
      business_account_id: data.business_account_id,
      token_expires_at: data.access_token_expires_at,
      last_refreshed_at: data.last_refreshed_at,
      last_health_check_at: data.last_health_check_at,
      created_at: data.created_at,
      updated_at: data.updated_at
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
