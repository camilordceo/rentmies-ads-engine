/* ─────────────────────────────────────────────────────────────
   Google Ads Health Watcher
   Polls /api/google/connection (or the channel_health_summary
   view via /api/health/channels). When the OAuth token is near
   expiration or revoked, push to the shared health registry.

   Surfaces:
     window.rmGoogleHealth.check(force)
     window.rmGoogleHealth.last
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const HEALTH_CACHE_MS = 5 * 60 * 1000
  let lastChecked = 0
  let lastResult = null

  async function check (force) {
    if (!force && Date.now() - lastChecked < HEALTH_CACHE_MS) return lastResult
    lastChecked = Date.now()

    try {
      const r = await fetch('/api/google/connection', { headers: window.rmApi?.authHeaders() || {} })
      if (r.status === 404) {
        lastResult = { channel: 'google', health: 'not_connected', label: 'Google Ads no conectado' }
      } else if (!r.ok) {
        lastResult = { channel: 'google', health: 'error', label: 'No se pudo verificar Google Ads' }
      } else {
        const j = await r.json()
        if (!j || !j.connected) {
          lastResult = { channel: 'google', health: 'not_connected', label: 'Google Ads no conectado' }
        } else if (j.status === 'expired') {
          lastResult = { channel: 'google', health: 'expired', label: 'Tu OAuth de Google Ads expiró', detail: j }
        } else if (j.status === 'revoked') {
          lastResult = { channel: 'google', health: 'revoked', label: 'Revocaste el acceso a Google Ads', detail: j }
        } else if (j.status !== 'active') {
          lastResult = { channel: 'google', health: 'unhealthy', label: 'Estado: ' + j.status, detail: j }
        } else {
          lastResult = { channel: 'google', health: 'healthy', label: 'Customer ID · ' + (j.customer_id || '—'), detail: j }
        }
      }
    } catch (err) {
      lastResult = { channel: 'google', health: 'error', label: 'Error al verificar Google Ads', error: err.message }
    }

    if (window.rmHealthRegistry) window.rmHealthRegistry.set('google', lastResult)
    return lastResult
  }

  document.addEventListener('DOMContentLoaded', () => check(true))
  setInterval(() => check(false), HEALTH_CACHE_MS)

  window.rmGoogleHealth = { check, get last () { return lastResult } }
})()
