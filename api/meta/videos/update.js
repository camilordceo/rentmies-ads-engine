/**
 * PATCH/POST /api/meta/videos/update?id=...
 *   Updates editable fields: title, description, tags,
 *   inventario_id, thumbnail_url.
 */

const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')

const EDITABLE = new Set(['title', 'description', 'tags', 'inventario_id', 'thumbnail_url', 'ai_captions'])

module.exports = async (req, res) => {
  cors(res, 'POST, PATCH, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST' && req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const id = String(req.query.id || '').trim()
  if (!id) return res.status(400).json({ error: 'id requerido' })

  const sb = getServiceClient()
  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const body = req.body || {}
  const update = {}
  for (const k of Object.keys(body)) {
    if (EDITABLE.has(k)) update[k] = body[k]
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nada que actualizar' })
  if (Array.isArray(update.tags)) update.tags = update.tags.filter(Boolean).slice(0, 20).map(String)
  update.updated_at = new Date().toISOString()

  const { data, error } = await sb
    .from('media_videos')
    .update(update)
    .eq('id', id)
    .eq('empresa_id', auth.empresaId)
    .select('*').single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true, video: data })
}
