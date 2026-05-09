/* ─────────────────────────────────────────────────────────────
   WhatsApp Health Watcher
   WhatsApp rides on the Meta connection (WABA ID is part of the
   meta_connections row). This module asks the server about the
   current WABA tier + quality rating and surfaces issues in the
   shared health registry. It does NOT show its own banner —
   js/core/health.js owns the banner UX so the user sees one
   unified message instead of N stacked banners.

   Surfaces:
     window.rmWhatsappHealth.check(force)   — async, returns latest state
     window.rmWhatsappHealth.last           — last cached state
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const HEALTH_CACHE_MS = 5 * 60 * 1000
  let lastChecked = 0
  let lastResult = null

  async function check (force) {
    if (!force && Date.now() - lastChecked < HEALTH_CACHE_MS) return lastResult
    lastChecked = Date.now()

    // No /api endpoint yet — read the WABA-related signals from the
    // Meta connection record. This is enough to show "not_connected"
    // vs "healthy" vs "expired" without server-side WA-specific work.
    try {
      const r = await fetch('/api/credentials/meta', { headers: window.rmApi?.authHeaders() || {} })
      if (!r.ok) {
        lastResult = { channel: 'whatsapp', health: 'not_connected', label: 'WhatsApp no conectado' }
        return lastResult
      }
      const j = await r.json()
      const waba = j && j.waba_id
      if (!waba) {
        lastResult = { channel: 'whatsapp', health: 'not_connected', label: 'WABA no configurada' }
      } else if (j.status !== 'active') {
        lastResult = { channel: 'whatsapp', health: 'unhealthy', label: 'Conexión Meta inactiva — WhatsApp no puede enviar' }
      } else {
        lastResult = { channel: 'whatsapp', health: 'healthy', label: 'WhatsApp · ' + waba.slice(0, 6) + '…', waba_id: waba }
      }
    } catch (err) {
      lastResult = { channel: 'whatsapp', health: 'error', label: 'No se pudo verificar WhatsApp', error: err.message }
    }

    // Push to shared registry so the orchestrator can render the banner
    if (window.rmHealthRegistry) window.rmHealthRegistry.set('whatsapp', lastResult)
    return lastResult
  }

  document.addEventListener('DOMContentLoaded', () => check(true))
  setInterval(() => check(false), HEALTH_CACHE_MS)

  window.rmWhatsappHealth = { check, get last () { return lastResult } }
})()
