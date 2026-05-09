/**
 * GET /api/google/recommendations/list
 *   Returns open Camilord recommendations for the empresa.
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
      .from('google_recommendations')
      .select('id, kind, severity, title, body, action_kind, action_params, detected_at, expires_at, status, google_campaign_id')
      .eq('empresa_id', auth.empresaId)
      .eq('status', 'open')
      .order('detected_at', { ascending: false })
      .limit(50)

    if (error) {
      if (error.code === '42P01') return res.json({ recommendations: [], _hint: 'Run schema-google-bloque3.sql' })
      return res.status(500).json({ error: error.message })
    }
    return res.json({ recommendations: data || [] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
