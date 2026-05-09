/**
 * GET /api/tiktok/videos/list
 *   Returns TikTok videos for the empresa from tiktok_videos.
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
      .from('tiktok_videos')
      .select('id, tiktok_video_id, tiktok_share_url, caption, cover_image_url, duration_sec, status, scheduled_at, published_at, created_at')
      .eq('empresa_id', auth.empresaId)
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === '42P01') return res.json({ videos: [], _hint: 'Run supabase/schema-multichannel.sql' })
      return res.status(500).json({ error: error.message })
    }

    return res.json({ videos: data || [] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
