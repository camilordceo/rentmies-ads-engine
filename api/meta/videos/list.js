/**
 * GET /api/meta/videos/list
 *   Returns videos for the empresa, with publish stats.
 *
 *   Optional filters via query:
 *     ?orientation=vertical|square|horizontal
 *     ?platform=ig_reels|ig_feed|fb_feed|fb_reels  (returns only compat)
 *     ?inventario_id=uuid
 *     ?status=ready|archived
 *     ?q=search-text  (matches title or tags)
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

  const orientation = req.query.orientation
  const platform = req.query.platform
  const inventarioId = req.query.inventario_id
  const status = req.query.status || 'ready'
  const q = (req.query.q || '').toString().trim()

  try {
    // Read from the view to get publish stats
    let query = sb
      .from('media_videos_with_stats')
      .select('*')
      .eq('empresa_id', auth.empresaId)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') query = query.eq('status', status)
    if (orientation)   query = query.eq('orientation', orientation)
    if (inventarioId)  query = query.eq('inventario_id', inventarioId)
    if (platform === 'ig_reels')  query = query.eq('compat_ig_reels',  true)
    if (platform === 'ig_feed')   query = query.eq('compat_ig_feed',   true)
    if (platform === 'ig_stories') query = query.eq('compat_ig_stories', true)
    if (platform === 'fb_feed')   query = query.eq('compat_fb_feed',   true)
    if (platform === 'fb_reels')  query = query.eq('compat_fb_reels',  true)

    const { data, error } = await query.limit(200)
    if (error) {
      if (error.code === '42P01') return res.json({ videos: [], _hint: 'Run schema-videos-bloque4.sql' })
      // The view might not exist yet but the table does — fall back to direct table query
      const { data: rawData, error: rawErr } = await sb.from('media_videos')
        .select('*').eq('empresa_id', auth.empresaId).order('created_at', { ascending: false }).limit(200)
      if (rawErr) {
        if (rawErr.code === '42P01') return res.json({ videos: [], _hint: 'Run schema-videos-bloque4.sql' })
        return res.status(500).json({ error: rawErr.message })
      }
      return res.json({ videos: rawData || [], source: 'table' })
    }

    let videos = data || []
    if (q) {
      const ql = q.toLowerCase()
      videos = videos.filter(v =>
        (v.title || '').toLowerCase().includes(ql) ||
        (Array.isArray(v.tags) && v.tags.some(t => String(t).toLowerCase().includes(ql)))
      )
    }

    return res.json({ videos, source: 'view' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
