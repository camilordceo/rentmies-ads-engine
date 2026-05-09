/**
 * GET /api/google/campaigns/list
 *   Returns campaigns for the empresa from google_campaigns.
 *   Empty array if no campaigns yet (or table missing).
 */

const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')

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
      .from('google_campaigns')
      .select('id, name, campaign_type, status, budget_amount_micros, budget_currency_code, target_locations, impressions, clicks, conversions, cost_micros, last_synced_at, created_at')
      .eq('empresa_id', auth.empresaId)
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === '42P01') return res.json({ campaigns: [], _hint: 'Run supabase/schema-multichannel.sql' })
      return res.status(500).json({ error: error.message })
    }

    return res.json({ campaigns: data || [] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
