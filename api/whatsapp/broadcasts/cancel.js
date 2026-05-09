/**
 * POST /api/whatsapp/broadcasts/cancel?id=...
 *   Hard cancel — flips the broadcast to 'cancelled' and marks
 *   pending recipients so the cron processor skips them.
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

  // Flip the broadcast
  const { data, error } = await sb
    .from('whatsapp_broadcasts')
    .update({ status: 'cancelled', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('empresa_id', auth.empresaId)
    .in('status', ['sending', 'paused', 'scheduled'])
    .select('id, status')
    .single()

  if (error) return res.status(400).json({ error: error.message })

  // Mark unsent recipients as skipped
  await sb.from('whatsapp_broadcast_recipients')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('broadcast_id', id)
    .eq('status', 'pending')

  return res.json({ ok: true, ...data })
}
