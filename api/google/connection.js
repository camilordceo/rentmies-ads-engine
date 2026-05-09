/**
 * GET /api/google/connection
 *   Returns the Google Ads OAuth connection for the authed empresa.
 *   Used by Settings (channel card) and js/google/health.js.
 *
 * Response shape (200):
 *   {
 *     connected: true,
 *     status: 'active',
 *     customer_id: '123-456-7890',
 *     descriptive_name: 'Inmobiliaria XYZ',
 *     currency_code: 'COP',
 *     access_token_expires_at: ISO,
 *     created_at: ISO
 *   }
 *
 * If no connection exists, returns 200 with { connected: false } (NOT 404),
 * so the frontend can branch on `connected` rather than handling errors.
 *
 * Note: full OAuth + Google Ads API integration ships in Bloque 3.
 * Until then, this endpoint reads from `google_connections` if the row
 * exists (e.g., manually inserted for testing) and returns a clean
 * "not connected" response otherwise.
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
      .from('google_connections')
      .select('id, status, customer_id, manager_customer_id, account_currency_code, account_time_zone, account_status, google_user_email, available_accounts, access_token_expires_at, last_health_check_at, created_at, updated_at')
      .eq('empresa_id', auth.empresaId)
      .maybeSingle()

    if (error) {
      // Table might not exist yet (schema-multichannel.sql not applied) —
      // surface that cleanly instead of 500-ing.
      if (error.code === '42P01') {
        return res.json({ connected: false, _hint: 'Run supabase/schema-multichannel.sql' })
      }
      return res.status(500).json({ error: error.message })
    }

    if (!data) return res.json({ connected: false })

    return res.json({
      connected: true,
      status: data.status,
      customer_id: data.customer_id,
      manager_customer_id: data.manager_customer_id,
      currency_code: data.account_currency_code,
      time_zone: data.account_time_zone,
      account_status: data.account_status,
      google_user_email: data.google_user_email,
      available_accounts: data.available_accounts || [],
      access_token_expires_at: data.access_token_expires_at,
      last_health_check_at: data.last_health_check_at,
      created_at: data.created_at,
      updated_at: data.updated_at
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
