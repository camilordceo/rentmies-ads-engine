/**
 * Google access-token lifecycle helpers.
 *
 *   const { getValidGoogleToken, refreshAccessToken } = require('lib/google-tokens')
 *
 *   const { token, customerId } = await getValidGoogleToken(supabase, empresaId)
 *
 * Access tokens last 1 hour. Refresh tokens are long-lived but
 * can be revoked. We refresh ahead of expiry by 5 minutes to give
 * ourselves margin against clock skew + slow Google responses.
 */

const axios = require('axios')
const { OAUTH_TOKEN_URL, ENV } = require('./google-ads-config')

const REFRESH_MARGIN_MS = 5 * 60 * 1000

async function getValidGoogleToken (supabase, empresaId) {
  if (!supabase) throw new Error('supabase client required')
  if (!empresaId) throw new Error('empresaId required')

  const { data: conn, error } = await supabase
    .from('google_connections')
    .select('id, access_token, refresh_token, access_token_expires_at, customer_id, status')
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (error) {
    if (error.code === '42P01') throw new Error('Google connections table missing — run schema-multichannel.sql')
    throw error
  }
  if (!conn) {
    const e = new Error('Google Ads no conectado para esta empresa')
    e.code = 'not_connected'
    throw e
  }
  if (conn.status !== 'active') {
    const e = new Error(`Google connection status: ${conn.status}`)
    e.code = 'inactive_connection'
    throw e
  }
  if (!conn.refresh_token) {
    const e = new Error('Falta refresh_token — reconecta Google Ads')
    e.code = 'no_refresh_token'
    throw e
  }

  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0
  const stillFresh = conn.access_token && (expiresAt - Date.now() > REFRESH_MARGIN_MS)
  if (stillFresh) {
    return { token: conn.access_token, customerId: conn.customer_id, connectionId: conn.id }
  }

  // Refresh
  const fresh = await refreshAccessToken(conn.refresh_token)
  const expIso = new Date(Date.now() + fresh.expires_in * 1000).toISOString()

  await supabase.from('google_connections').update({
    access_token: fresh.access_token,
    access_token_expires_at: expIso,
    last_health_check_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('id', conn.id)

  return { token: fresh.access_token, customerId: conn.customer_id, connectionId: conn.id }
}

async function refreshAccessToken (refreshToken) {
  const { data } = await axios.post(OAUTH_TOKEN_URL, new URLSearchParams({
    client_id: ENV.CLIENT_ID,
    client_secret: ENV.CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  }).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000
  })
  return data
}

module.exports = { getValidGoogleToken, refreshAccessToken }
