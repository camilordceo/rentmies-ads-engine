/* ─────────────────────────────────────────────────────────────
   TikTok Health Watcher
   TikTok access tokens expire in 24h and must be refreshed.
   This watcher detects "expires in <2h" and pushes to the
   shared health registry so core/health.js can warn the user
   before a video upload fails.

   Surfaces:
     window.rmTiktokHealth.check(force)
     window.rmTiktokHealth.last
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
      const r = await fetch('/api/tiktok/connection', { headers: window.rmApi?.authHeaders() || {} })
      if (r.status === 404) {
        lastResult = { channel: 'tiktok', health: 'not_connected', label: 'TikTok no conectado' }
      } else if (!r.ok) {
        lastResult = { channel: 'tiktok', health: 'error', label: 'No se pudo verificar TikTok' }
      } else {
        const j = await r.json()
        if (!j || !j.connected) {
          lastResult = { channel: 'tiktok', health: 'not_connected', label: 'TikTok no conectado' }
        } else if (j.status === 'expired' || (j.token_expires_at && new Date(j.token_expires_at) < new Date())) {
          lastResult = { channel: 'tiktok', health: 'expired', label: 'Token de TikTok expiró — refresh disponible', detail: j }
        } else if (j.status === 'revoked') {
          lastResult = { channel: 'tiktok', health: 'revoked', label: 'Revocaste el acceso a TikTok', detail: j }
        } else {
          // Hours until expiry
          const hoursLeft = j.token_expires_at
            ? Math.max(0, Math.round((new Date(j.token_expires_at) - new Date()) / 3600e3))
            : null
          if (hoursLeft !== null && hoursLeft < 2) {
            lastResult = { channel: 'tiktok', health: 'expiring_soon', label: `Token de TikTok vence en ${hoursLeft}h`, detail: j }
          } else {
            lastResult = { channel: 'tiktok', health: 'healthy', label: '@' + (j.username || 'business'), detail: j }
          }
        }
      }
    } catch (err) {
      lastResult = { channel: 'tiktok', health: 'error', label: 'Error al verificar TikTok', error: err.message }
    }

    if (window.rmHealthRegistry) window.rmHealthRegistry.set('tiktok', lastResult)
    return lastResult
  }

  document.addEventListener('DOMContentLoaded', () => check(true))
  setInterval(() => check(false), HEALTH_CACHE_MS)

  window.rmTiktokHealth = { check, get last () { return lastResult } }
})()
