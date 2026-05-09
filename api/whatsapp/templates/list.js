/**
 * GET /api/whatsapp/templates/list
 *   Returns the empresa's templates from whatsapp_templates (DB cache).
 *   The list page calls this first (fast) then triggers /sync in
 *   the background to refresh the cache from Meta.
 *
 * Response:
 *   { templates: [...], last_synced_at: ISO|null }
 *
 * Optional query: ?source=meta — bypass cache and proxy to Graph
 *   directly (legacy behaviour preserved for back-compat).
 */

const axios = require('axios')
const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')

const META_GRAPH = 'https://graph.facebook.com/v21.0'

module.exports = async (req, res) => {
  cors(res, 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const source = (req.query.source || 'db').toString()

  if (source === 'meta') return passthroughToMeta(req, res)

  // Default: read from DB
  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  try {
    const { data, error } = await sb
      .from('whatsapp_templates')
      .select('id, meta_template_id, name, language, category, status, rejection_reason, components, quality_score, sent_count, delivered_count, read_count, notes, preview_image_url, created_at, updated_at, submitted_at, approved_at, last_synced_at')
      .eq('empresa_id', auth.empresaId)
      .order('updated_at', { ascending: false })

    if (error) {
      if (error.code === '42P01') return res.json({ templates: [], last_synced_at: null, _hint: 'Run schema-multichannel.sql + schema-whatsapp-bloque2.sql' })
      return res.status(500).json({ error: error.message })
    }

    const lastSyncedAt = (data || []).reduce((acc, t) => {
      if (!t.last_synced_at) return acc
      if (!acc || new Date(t.last_synced_at) > new Date(acc)) return t.last_synced_at
      return acc
    }, null)

    return res.json({ templates: data || [], last_synced_at: lastSyncedAt })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// ── Legacy: proxy direct to Meta Graph (no caching) ──────────────
async function passthroughToMeta (req, res) {
  const token = req.headers['x-meta-token'] || process.env.META_ACCESS_TOKEN || ''
  const wabaId = req.headers['x-waba-id'] || process.env.META_WABA_ID || ''

  if (!token || !wabaId) {
    return res.status(400).json({
      error: 'Faltan credenciales. WABA ID + access token requeridos.',
      detail: 'Pasa los headers x-waba-id y x-meta-token, o configura META_ACCESS_TOKEN/META_WABA_ID en el servidor.'
    })
  }

  try {
    const { data } = await axios.get(`${META_GRAPH}/${encodeURIComponent(wabaId)}/message_templates`, {
      params: { access_token: token, fields: 'name,status,category,language,quality_score,components', limit: 100 },
      timeout: 15000
    })
    return res.json({ templates: data.data || [], paging: data.paging || null })
  } catch (err) {
    const fb = err.response && err.response.data && err.response.data.error
    if (fb) return res.status(400).json({ error: `[${fb.code}] ${fb.message}`, code: fb.code })
    return res.status(500).json({ error: err.message })
  }
}
