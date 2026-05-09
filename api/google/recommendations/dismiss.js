/**
 * POST /api/google/recommendations/dismiss?id=...
 *   Dismisses a recommendation so it doesn't surface again.
 */

const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const id = String(req.query.id || '').trim()
  if (!id) return res.status(400).json({ error: 'id requerido' })

  const sb = getServiceClient()
  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const { data, error } = await sb
    .from('google_recommendations')
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('empresa_id', auth.empresaId)
    .select('id, status').single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true, ...data })
}
