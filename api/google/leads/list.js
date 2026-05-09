/**
 * GET /api/google/leads/list
 *   Returns captured Google leads for the empresa.
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
      .from('google_leads')
      .select('id, full_name, email, phone_e164, answers, status, captured_at, whatsapp_followup_sent_at, google_campaign_id, google_lead_form_id')
      .eq('empresa_id', auth.empresaId)
      .order('captured_at', { ascending: false })
      .limit(500)

    if (error) {
      if (error.code === '42P01') return res.json({ leads: [], _hint: 'Run schema-multichannel.sql' })
      return res.status(500).json({ error: error.message })
    }

    return res.json({ leads: data || [] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
