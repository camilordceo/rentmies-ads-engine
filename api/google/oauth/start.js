/**
 * GET /api/google/oauth/start
 *   Kicks off the Google Ads OAuth 2.0 flow for the authenticated
 *   empresa. We build the auth URL with a signed CSRF `state`
 *   parameter (HMAC of `empresaId|nonce|timestamp` using
 *   GOOGLE_OAUTH_STATE_SECRET) so the callback can verify the
 *   round-trip without storing transient state on the server.
 *
 *   `access_type=offline&prompt=consent` is required to get a
 *   refresh_token back. Without prompt=consent, Google returns
 *   only the access_token on subsequent authorizations.
 */

const crypto = require('crypto')
const { OAUTH_AUTH_URL, REQUIRED_SCOPES, ENV, isConfigured } = require('../../../lib/google-ads-config')
const { getServiceClient, authedEmpresa } = require('../../_lib/auth')

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end()

  if (!isConfigured()) {
    return res.status(503).json({
      error: 'Google Ads no está configurado en el servidor',
      detail: 'Faltan GOOGLE_ADS_CLIENT_ID / SECRET / DEVELOPER_TOKEN / REDIRECT_URI'
    })
  }

  // Best-effort empresa lookup. If unauthenticated, fall back to demo
  // mode so the redirect still works for local development.
  let empresaId = 'demo'
  const sb = getServiceClient()
  if (sb) {
    const auth = await authedEmpresa(req, sb)
    if (!auth.error) empresaId = auth.empresaId
  }

  const state = signState(empresaId)
  const params = new URLSearchParams({
    client_id: ENV.CLIENT_ID,
    redirect_uri: ENV.REDIRECT_URI,
    response_type: 'code',
    scope: REQUIRED_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  })

  res.statusCode = 302
  res.setHeader('Location', `${OAUTH_AUTH_URL}?${params.toString()}`)
  res.end()
}

// ── CSRF state (HMAC) ─────────────────────────────────────
function signState (empresaId) {
  const secret = ENV.STATE_SECRET || 'dev_state_secret_change_me'
  const nonce = crypto.randomBytes(8).toString('hex')
  const ts = Date.now().toString(36)
  const payload = `${empresaId}|${nonce}|${ts}`
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32)
  return Buffer.from(`${payload}|${sig}`).toString('base64url')
}
