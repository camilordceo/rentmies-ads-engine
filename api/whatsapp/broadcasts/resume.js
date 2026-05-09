/**
 * POST /api/whatsapp/broadcasts/resume?id=...
 *   Flips a broadcast from 'paused' back to 'sending'. Cron picks it
 *   up on the next tick.
 */

const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const id = String(req.query.id || '').trim()
  if (!id) return res.status(400).json({ error: 'id requerido' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const { data, error } = await sb
    .from('whatsapp_broadcasts')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('empresa_id', auth.empresaId)
    .eq('status', 'paused')
    .select('id, status')
    .single()

  if (error) return res.status(400).json({ error: error.message })
  return res.json({ ok: true, ...data })
}
