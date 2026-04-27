/**
 * POST /api/auth/meta/disconnect
 *   Authorization: Bearer <supabase_jwt>
 *
 * Revokes the Meta connection: tries to invalidate the token on Meta's side
 * (best-effort), then deletes meta_connections row for the empresa. The user
 * stays logged in to Rentmies but the Meta integration is gone.
 */

const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')
const meta = require('../../../lib/meta-config')

function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'No token' })
  const { data: userData, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !userData || !userData.user) return res.status(401).json({ error: 'Token inválido' })

  const { data: profile } = await sb.from('profiles').select('empresa_id').eq('id', userData.user.id).maybeSingle()
  if (!profile || !profile.empresa_id) return res.status(404).json({ error: 'Sin empresa' })

  const { data: conn } = await sb.from('meta_connections')
    .select('id, long_lived_token, meta_user_id')
    .eq('empresa_id', profile.empresa_id)
    .maybeSingle()

  // Best-effort token revocation on Meta's side. Failure is OK — we still delete.
  if (conn && conn.long_lived_token && conn.meta_user_id) {
    try {
      await axios.delete(`${meta.GRAPH_BASE_URL}/${conn.meta_user_id}/permissions`, {
        params: { access_token: conn.long_lived_token },
        timeout: 8000
      })
    } catch (err) {
      console.warn('[disconnect] Meta permission revoke failed (non-fatal):', err.message)
    }
  }

  if (conn) {
    await sb.from('meta_connections').delete().eq('id', conn.id)
  }

  return res.json({ success: true })
}
