/**
 * Token lifecycle management for Meta long-lived user tokens (60d).
 *
 *  getValidToken(empresa_id) → returns a fresh long-lived token, refreshing
 *    if it's within REFRESH_THRESHOLD_DAYS of expiry.
 *
 *  refreshTokenIfNeeded(connection) → pure refresh helper.
 *
 *  refreshAllExpiringSoon() → batch refresh job, called by the daily cron.
 */

const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')
const meta = require('./meta-config')

function getSupabaseService() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function daysUntil(date) {
  const t = new Date(date).getTime()
  if (isNaN(t)) return -Infinity
  return (t - Date.now()) / (24 * 60 * 60 * 1000)
}

async function exchangeForLongLived(currentToken) {
  if (!meta.APP_ID || !meta.APP_SECRET) throw new Error('Meta config missing')
  const r = await axios.get(`${meta.GRAPH_BASE_URL}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: meta.APP_ID,
      client_secret: meta.APP_SECRET,
      fb_exchange_token: currentToken
    },
    timeout: 15000
  })
  if (!r.data.access_token) throw new Error('No access_token in refresh response')
  return {
    token: r.data.access_token,
    expiresInSec: r.data.expires_in || 60 * 24 * 60 * 60
  }
}

/**
 * Returns the current long-lived token for an empresa, refreshing first if
 * we're within REFRESH_THRESHOLD_DAYS of expiry. Updates the connection row
 * on success. Throws if the connection is missing, revoked, or refresh fails.
 */
async function getValidToken(empresaId) {
  const sb = getSupabaseService()
  if (!sb) throw new Error('Supabase not configured')

  const { data: conn, error } = await sb.from('meta_connections')
    .select('id, long_lived_token, token_expires_at, status')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!conn) throw new Error('No Meta connection for empresa')
  if (conn.status === 'revoked') throw new Error('Connection revoked — user must reconnect')

  const days = daysUntil(conn.token_expires_at)
  if (days < 0) {
    // Already expired — try to refresh anyway; Meta allows refreshing within ~30d
    // grace, but the user might still need to reconnect.
  }

  if (days < meta.REFRESH_THRESHOLD_DAYS) {
    try {
      const refreshed = await exchangeForLongLived(conn.long_lived_token)
      const newExpiresAt = new Date(Date.now() + refreshed.expiresInSec * 1000).toISOString()
      await sb.from('meta_connections')
        .update({
          long_lived_token: refreshed.token,
          token_expires_at: newExpiresAt,
          last_refreshed_at: new Date().toISOString(),
          status: 'active',
          last_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', conn.id)
      return refreshed.token
    } catch (err) {
      // Mark as expired so the dashboard can show the reconnect banner
      await sb.from('meta_connections')
        .update({
          status: 'expired',
          last_error: err.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', conn.id)
      throw new Error('Token refresh failed: ' + err.message)
    }
  }

  return conn.long_lived_token
}

/**
 * Calls Graph /me with the token to confirm it's still valid.
 * Returns { healthy: bool, error?: string, code?: number }.
 */
async function probeToken(token) {
  try {
    const r = await axios.get(`${meta.GRAPH_BASE_URL}/me`, {
      params: { fields: 'id', access_token: token },
      timeout: 8000
    })
    return { healthy: !!r.data.id }
  } catch (err) {
    const fb = err.response && err.response.data && err.response.data.error
    return { healthy: false, error: fb ? fb.message : err.message, code: fb ? fb.code : null }
  }
}

/**
 * Health-check + opportunistic refresh for one connection.
 */
async function checkConnectionHealth(empresaId) {
  const sb = getSupabaseService()
  if (!sb) throw new Error('Supabase not configured')

  const { data: conn } = await sb.from('meta_connections')
    .select('id, long_lived_token, token_expires_at, status')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (!conn) return { health: 'no_connection' }

  const days = daysUntil(conn.token_expires_at)
  const probe = await probeToken(conn.long_lived_token)

  let nextStatus = conn.status
  let health = 'healthy'

  if (!probe.healthy) {
    if (probe.code === 190) { nextStatus = 'expired'; health = 'expired' }
    else if (probe.code === 10) { nextStatus = 'revoked'; health = 'revoked' }
    else { nextStatus = 'error'; health = 'error' }
  } else if (days < 0) { nextStatus = 'expired'; health = 'expired' }
  else if (days < 7) { nextStatus = 'active'; health = 'expiring_soon' }
  else { nextStatus = 'active'; health = 'healthy' }

  await sb.from('meta_connections')
    .update({
      status: nextStatus,
      last_health_check_at: new Date().toISOString(),
      last_error: probe.error || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', conn.id)

  return { health, days_until_expiry: Math.floor(days), status: nextStatus, error: probe.error || null }
}

/**
 * Refresh every connection that expires within REFRESH_THRESHOLD_DAYS.
 * Called by /api/cron-refresh-tokens daily.
 */
async function refreshAllExpiringSoon() {
  const sb = getSupabaseService()
  if (!sb) throw new Error('Supabase not configured')

  const cutoff = new Date(Date.now() + meta.REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString()
  // System User tokens never expire — only refresh OAuth connections.
  const { data: rows, error } = await sb.from('meta_connections')
    .select('id, empresa_id, long_lived_token, token_expires_at, status')
    .lte('token_expires_at', cutoff)
    .in('status', ['active', 'expiring_soon'])
    .neq('token_type', 'system_user')

  if (error) throw new Error(error.message)
  if (!rows || !rows.length) return { refreshed: 0, skipped: 0 }

  let refreshed = 0, failed = 0
  for (const r of rows) {
    try {
      const out = await exchangeForLongLived(r.long_lived_token)
      const newExp = new Date(Date.now() + out.expiresInSec * 1000).toISOString()
      await sb.from('meta_connections').update({
        long_lived_token: out.token,
        token_expires_at: newExp,
        last_refreshed_at: new Date().toISOString(),
        status: 'active',
        last_error: null,
        updated_at: new Date().toISOString()
      }).eq('id', r.id)
      refreshed++
    } catch (err) {
      await sb.from('meta_connections').update({
        status: 'expired',
        last_error: err.message,
        updated_at: new Date().toISOString()
      }).eq('id', r.id)
      failed++
    }
  }
  return { refreshed, failed, total: rows.length }
}

module.exports = {
  getValidToken,
  exchangeForLongLived,
  probeToken,
  checkConnectionHealth,
  refreshAllExpiringSoon
}
