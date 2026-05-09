/**
 * GET /api/whatsapp/templates/list
 *   Lists message templates for the empresa's WABA.
 *
 * Backwards-compat: this is the new namespaced URL. The old endpoint
 * `/api/whatsapp?action=templates` keeps working — both proxy to Meta
 * Graph using the same credentials priority (request headers > env).
 *
 * Bloque 2 will extend this to read from the local cache table
 * `whatsapp_templates` and only hit Graph on cache miss / refresh.
 */

const axios = require('axios')
const { cors } = require('../../_lib/auth')

const META_GRAPH = 'https://graph.facebook.com/v21.0'

module.exports = async (req, res) => {
  cors(res, 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers['x-meta-token'] || process.env.META_ACCESS_TOKEN || ''
  const wabaId = req.headers['x-waba-id'] || process.env.META_WABA_ID || ''

  if (!token || !wabaId) {
    return res.status(400).json({
      error: 'Faltan credenciales de WhatsApp. Configura WABA ID y access token en Settings → WhatsApp.'
    })
  }

  try {
    const { data } = await axios.get(`${META_GRAPH}/${encodeURIComponent(wabaId)}/message_templates`, {
      params: {
        access_token: token,
        fields: 'name,status,category,language,quality_score,components',
        limit: 100
      },
      timeout: 15000
    })
    return res.json({ templates: data.data || [], paging: data.paging || null })
  } catch (err) {
    const fb = err.response && err.response.data && err.response.data.error
    if (fb) return res.status(400).json({ error: `[${fb.code}] ${fb.message}`, code: fb.code })
    return res.status(500).json({ error: err.message })
  }
}
