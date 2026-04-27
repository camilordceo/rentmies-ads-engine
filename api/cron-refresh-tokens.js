/**
 * Daily cron: refresh Meta long-lived tokens that expire within
 * REFRESH_THRESHOLD_DAYS so users never hit a dead token in production.
 *
 * Triggered by Vercel cron (vercel.json → "/api/cron-refresh-tokens" at 03:00 UTC).
 */

const { refreshAllExpiringSoon } = require('../lib/meta-tokens')

module.exports = async (req, res) => {
  // Vercel cron sends GET with no body. Allow GET and POST for manual testing.
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Optional shared-secret guard (set CRON_SECRET in env to enable).
  const expected = process.env.CRON_SECRET
  if (expected) {
    const got = req.headers.authorization || req.query.secret || ''
    if (got !== `Bearer ${expected}` && got !== expected) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    const result = await refreshAllExpiringSoon()
    return res.json({ ok: true, ...result, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[cron-refresh-tokens]', err.message)
    return res.status(500).json({ ok: false, error: err.message })
  }
}
