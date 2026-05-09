/**
 * GET /api/whatsapp/broadcasts/get?id=...
 *   Returns one broadcast plus its recipients (most recent first).
 *   Used by the detail page for live polling and analytics.
 *
 *   Response: { broadcast: {...}, recipients: [...] }
 */

const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')

module.exports = async (req, res) => {
  cors(res, 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const id = String(req.query.id || '').trim()
  if (!id) return res.status(400).json({ error: 'id requerido' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  try {
    const { data: bcast, error: bErr } = await sb
      .from('whatsapp_broadcasts')
      .select('*')
      .eq('id', id)
      .eq('empresa_id', auth.empresaId)
      .maybeSingle()
    if (bErr) {
      if (bErr.code === '42P01') return res.status(503).json({ error: 'Tablas no inicializadas' })
      throw bErr
    }
    if (!bcast) return res.status(404).json({ error: 'Broadcast no encontrado' })

    // Pull template name for display
    let template = null
    if (bcast.template_id) {
      const { data: t } = await sb
        .from('whatsapp_templates')
        .select('id, name, language, category, status, components')
        .eq('id', bcast.template_id)
        .maybeSingle()
      template = t
    }

    const { data: recipients } = await sb
      .from('whatsapp_broadcast_recipients')
      .select('id, phone_e164, contact_name, status, sent_at, delivered_at, read_at, replied_at, failed_at, error_code, error_message, created_at, meta_wamid')
      .eq('broadcast_id', id)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .limit(2000)

    return res.json({ broadcast: { ...bcast, template }, recipients: recipients || [] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
