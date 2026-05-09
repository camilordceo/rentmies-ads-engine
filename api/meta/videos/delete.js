/**
 * POST /api/meta/videos/delete?id=...&hard=1
 *   Soft delete by default (status='archived'). With ?hard=1 also
 *   removes the file from Supabase Storage.
 *
 * Note: hard delete leaves any historical published_posts pointing
 * at the video (FK is ON DELETE SET NULL). If the user wants the
 * row gone for good, ON DELETE on the FK handles it.
 */

const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const id = String(req.query.id || '').trim()
  const hard = String(req.query.hard || '') === '1'
  if (!id) return res.status(400).json({ error: 'id requerido' })

  const sb = getServiceClient()
  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  // Look up storage_path before any destructive op
  const { data: existing } = await sb
    .from('media_videos')
    .select('id, storage_bucket, storage_path')
    .eq('id', id)
    .eq('empresa_id', auth.empresaId)
    .maybeSingle()
  if (!existing) return res.status(404).json({ error: 'Video no encontrado' })

  if (hard) {
    // Remove from Storage
    try {
      await sb.storage.from(existing.storage_bucket || 'videos-upload').remove([existing.storage_path])
    } catch (err) {
      console.warn('[videos-delete] storage remove failed:', err.message)
      // Don't block the DB delete — orphaned files can be cleaned up later
    }
    const { error } = await sb.from('media_videos').delete().eq('id', id).eq('empresa_id', auth.empresaId)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true, deleted: 'hard', id })
  }

  // Soft delete
  const { error } = await sb.from('media_videos')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id).eq('empresa_id', auth.empresaId)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true, deleted: 'soft', id })
}
