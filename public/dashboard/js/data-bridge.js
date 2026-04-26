/* ─────────────────────────────────────────────────────────────
   Data bridge — wraps /api/campaigns calls and exposes a unified
   API for dashboard.js, history.js, and analytics.js. Returns
   server data when the table exists, else falls back to localStorage
   or mock data. Pages don't have to know which path they got.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  function getEmpresaId() {
    try {
      const u = JSON.parse(localStorage.getItem('sb_user') || '{}')
      return u.id || 'demo'
    } catch (_) { return 'demo' }
  }

  async function fetchJson(url, opts) {
    const r = await fetch(url, opts || {})
    const text = await r.text()
    let json = {}
    try { json = JSON.parse(text) } catch (_) { json = { error: 'Non-JSON response' } }
    return { ok: r.ok, status: r.status, json }
  }

  // ── Campaigns ─────────────────────────────────────────────

  async function listCampaigns() {
    const empresaId = getEmpresaId()
    const { ok, json } = await fetchJson('/api/campaigns?action=list', {
      headers: { 'x-empresa-id': empresaId }
    })
    if (ok && Array.isArray(json.campaigns) && json.campaigns.length > 0) {
      return { source: 'server', campaigns: json.campaigns }
    }
    // Fallback to localStorage
    let local = []
    try { local = JSON.parse(localStorage.getItem('rm_campaign_drafts') || '[]') } catch (_) {}
    return { source: 'local', campaigns: local }
  }

  // ── AI logs ───────────────────────────────────────────────

  async function listAiLogs() {
    const empresaId = getEmpresaId()
    const { ok, json } = await fetchJson('/api/campaigns?action=ai-logs', {
      headers: { 'x-empresa-id': empresaId }
    })
    if (ok && Array.isArray(json.logs) && json.logs.length > 0) {
      return { source: 'server', logs: json.logs }
    }
    return { source: 'mock', logs: [] }   // history.js will use its built-in mock when source='mock'
  }

  // ── Realtime subscription ────────────────────────────────
  // Connecting via the JS supabase-js client requires SUPABASE_URL +
  // anon key on the client. We don't expose the anon key here yet;
  // when we wire it, listen on ad_ai_logs INSERT and call
  // window.rmFeedAppend() with the row.

  function subscribeAiLogs(onEvent) {
    // Placeholder — returns a no-op unsubscribe.
    // FASE 4 will wire supabase realtime properly.
    return () => {}
  }

  window.rmData = { listCampaigns, listAiLogs, subscribeAiLogs, getEmpresaId }
})()
