/**
 * GET /api/auth/meta/health
 *   Authorization: Bearer <supabase_jwt>
 *
 * Probes the Meta token by calling Graph /me, updates meta_connections.status
 * accordingly, returns { health, days_until_expiry, status }.
 *
 * Used by the dashboard banner and the Settings page.
 */

const { createClient } = require('@supabase/supabase-js')
const { checkConnectionHealth } = require('../../../lib/meta-tokens')

function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'No token' })
  const { data: userData, error } = await sb.auth.getUser(token)
  if (error || !userData || !userData.user) return res.status(401).json({ error: 'Token inválido' })

  const { data: profile } = await sb.from('profiles').select('empresa_id').eq('id', userData.user.id).maybeSingle()
  if (!profile || !profile.empresa_id) return res.status(404).json({ error: 'Sin empresa' })

  try {
    const health = await checkConnectionHealth(profile.empresa_id)
    return res.json(health)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
