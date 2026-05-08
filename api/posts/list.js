/**
 * GET /api/posts/list
 *     Authorization: Bearer <supabase_jwt>  (or x-empresa-id for demo)
 *     query: ?limit=50&platform=facebook|instagram|all&status=published|failed|all
 *
 * Returns the last N entries from published_posts for the empresa.
 * Used by the Post History view in the dashboard.
 */

const { createClient } = require('@supabase/supabase-js')

function getServiceClient () {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function authedEmpresa (req, sb) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) {
    const empresaId = req.headers['x-empresa-id']
    if (empresaId) return { empresaId, demo: true }
    return { error: 'No token', status: 401 }
  }
  if (token.startsWith('demo_')) {
    return { empresaId: req.headers['x-empresa-id'] || 'demo', demo: true }
  }
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data || !data.user) return { error: 'Token inválido', status: 401 }
  const { data: profile } = await sb.from('profiles').select('empresa_id').eq('id', data.user.id).maybeSingle()
  return { empresaId: (profile && profile.empresa_id) || data.user.id }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
  const platform = (req.query.platform || 'all').toString()
  const status = (req.query.status || 'all').toString()

  try {
    let q = sb.from('published_posts')
      .select('id, platform, caption, media_url, media_kind, post_id, post_permalink, status, error_message, scheduled_at, published_at, created_at, inventario_id')
      .eq('empresa_id', auth.empresaId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (platform !== 'all') {
      // Instagram has variants — match prefix
      if (platform === 'instagram') q = q.like('platform', 'instagram%')
      else q = q.eq('platform', platform)
    }
    if (status !== 'all') q = q.eq('status', status)

    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })

    return res.json({ posts: data || [], count: (data || []).length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
