/**
 * POST /api/google/campaigns/pause?id=<rentmies_id>
 *   Pauses a campaign on Google Ads (status=PAUSED) and reflects
 *   the change in google_campaigns.
 */

const axios = require('axios')
const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')
const { isConfigured, customerUrl, authHeaders } = require('../../../lib/google-ads-config')
const { getValidGoogleToken } = require('../../../lib/google-tokens')

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const id = String(req.query.id || '').trim()
  if (!id) return res.status(400).json({ error: 'id requerido' })
  if (!isConfigured()) return res.status(503).json({ error: 'Google Ads no configurado' })

  const sb = getServiceClient()
  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const { data: row } = await sb.from('google_campaigns')
    .select('id, customer_id, campaign_resource_name, google_campaign_id')
    .eq('id', id).eq('empresa_id', auth.empresaId).maybeSingle()
  if (!row) return res.status(404).json({ error: 'Campaña no encontrada' })

  let token
  try {
    const t = await getValidGoogleToken(sb, auth.empresaId)
    token = t.token
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }

  try {
    const url = customerUrl(row.customer_id, '/campaigns:mutate')
    await axios.post(url, {
      operations: [{ updateMask: 'status', update: { resourceName: row.campaign_resource_name, status: 'PAUSED' } }]
    }, { headers: authHeaders(token), timeout: 20000 })

    await sb.from('google_campaigns').update({ status: 'PAUSED', updated_at: new Date().toISOString() }).eq('id', id)
    return res.json({ ok: true, id, status: 'PAUSED' })
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message
    return res.status(500).json({ error: 'Pause failed', detail })
  }
}
