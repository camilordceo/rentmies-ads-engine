/**
 * GET /api/cron/google-token-refresh
 *   Daily cron · pre-refreshes any Google access token that is set
 *   to expire in the next 6 hours. Means real user actions during
 *   peak hours never wait on a token round-trip — and any stale
 *   refresh_token that has been silently revoked surfaces here in
 *   the cron logs instead of mid-flow in the editor.
 *
 *   Runs at 04:00 UTC = 23:00 COL (configured in vercel.json).
 *
 *   Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 */

const { getServiceClient } = require('../_lib/auth')
const { refreshAccessToken } = require('../../lib/google-tokens')

module.exports = async (req, res) => {
  const auth = req.headers.authorization || ''
  const expected = process.env.CRON_SECRET ? 'Bearer ' + process.env.CRON_SECRET : null
  if (expected && auth !== expected) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const startedAt = Date.now()
  const horizonIso = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()

  // Fetch connections whose access token expires within 6h (or is null)
  const { data: rows, error } = await sb
    .from('google_connections')
    .select('id, empresa_id, refresh_token, access_token_expires_at, status')
    .eq('status', 'active')
    .or(`access_token_expires_at.lte.${horizonIso},access_token_expires_at.is.null`)

  if (error) {
    if (error.code === '42P01') return res.json({ ok: true, refreshed: 0, hint: 'google_connections table missing' })
    return res.status(500).json({ error: error.message })
  }

  let refreshed = 0
  let failed = 0
  const failures = []

  for (const r of rows || []) {
    if (!r.refresh_token) continue
    try {
      const fresh = await refreshAccessToken(r.refresh_token)
      const expIso = new Date(Date.now() + (fresh.expires_in || 3600) * 1000).toISOString()
      await sb.from('google_connections').update({
        access_token: fresh.access_token,
        access_token_expires_at: expIso,
        last_health_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', r.id)
      refreshed++
    } catch (err) {
      failed++
      const code = err.response?.data?.error || err.message
      failures.push({ empresa_id: r.empresa_id, error: code })
      // If the refresh token was revoked, mark the connection as expired
      if (err.response?.status === 400 && err.response.data?.error === 'invalid_grant') {
        await sb.from('google_connections').update({
          status: 'expired',
          last_error: 'invalid_grant — refresh_token revoked',
          last_error_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', r.id)
      }
    }
  }

  return res.json({
    ok: true,
    refreshed,
    failed,
    failures,
    elapsed_ms: Date.now() - startedAt
  })
}

module.exports.config = { maxDuration: 60 }
