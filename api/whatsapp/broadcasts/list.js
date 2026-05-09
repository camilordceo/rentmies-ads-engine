/**
 * GET /api/whatsapp/broadcasts/list
 *   Returns broadcasts for the empresa from whatsapp_broadcasts.
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
      .from('whatsapp_broadcasts')
      .select('id, name, status, scheduled_at, started_at, completed_at, total_recipients, sent_count, delivered_count, read_count, failed_count, replied_count, template_id, created_at')
      .eq('empresa_id', auth.empresaId)
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === '42P01') return res.json({ broadcasts: [], _hint: 'Run supabase/schema-multichannel.sql' })
      return res.status(500).json({ error: error.message })
    }

    return res.json({ broadcasts: data || [] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
