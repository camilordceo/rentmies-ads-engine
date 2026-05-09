/**
 * POST /api/google/leads/update?id=...
 *   Updates a lead's status/notes from the Lead Forms list page.
 *   Body: { status: 'contacted' | 'qualified' | ... }
 */

const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')

const ALLOWED = new Set(['new','contacted','qualified','meeting','closed','lost'])

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const id = String(req.query.id || '').trim()
  if (!id) return res.status(400).json({ error: 'id requerido' })

  const sb = getServiceClient()
  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const body = req.body || {}
  const status = body.status
  if (!status || !ALLOWED.has(status)) return res.status(400).json({ error: 'status inválido' })

  const { data, error } = await sb
    .from('google_leads')
    .update({ status })
    .eq('id', id)
    .eq('empresa_id', auth.empresaId)
    .select('id, status').single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true, ...data })
}
