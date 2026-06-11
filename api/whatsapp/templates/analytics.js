/**
 * POST /api/whatsapp/templates/analytics
 *   Pulls per-template performance (sent / delivered / read / clicked) from
 *   Meta's `template_analytics` endpoint and writes the counts back onto
 *   whatsapp_templates. Returns the fresh numbers keyed by Meta template id.
 *
 *   Body (all optional):
 *     days   lookback window. Default 90, capped at 90 (Meta's max).
 *
 *   Notes:
 *     - Requires Template Insights to be enabled on the WABA. We enable it
 *       lazily: on Meta error 200005 we POST is_enabled_for_insights=true and
 *       retry the batch once.
 *     - Uses the SYSTEM USER token (whatsapp_business_management), not the page
 *       token — see lib/whatsapp-graph.js.
 *     - Meta retains read/click counts for only 7 days; sent/delivered up to
 *       90. So `read` reflects the last week even on a 90-day window.
 *
 *   Response:
 *     { updated, analytics: { [tplId]: { template_id, name, sent, delivered,
 *       read, clicked } }, window_days, synced_at, errors? }
 */

const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')
const { resolveWabaCreds, enableInsights, fetchTemplateAnalytics, fbError } = require('../../../lib/whatsapp-graph')

const BATCH_SIZE = 10   // Meta caps template_ids at 10 per request

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  // ── 1. Resolve WABA + system user token ──────────────────────
  const { token, wabaId } = await resolveWabaCreds(sb, auth.empresaId, req)
  if (!token || !wabaId) {
    return res.status(400).json({
      error: 'Faltan credenciales de WhatsApp',
      detail: 'No encontré WABA ID + token. Conecta Meta en Settings.',
      hint: 'Settings → Conexión Meta'
    })
  }

  // ── 2. Window (Meta max 90d) ─────────────────────────────────
  let days = parseInt((req.body && req.body.days) || req.query.days || '90', 10)
  if (!Number.isFinite(days) || days <= 0) days = 90
  if (days > 90) days = 90
  const endSec = Math.floor(Date.now() / 1000)
  const startSec = endSec - days * 86400

  // ── 3. Templates we can ask analytics for (need the Meta id) ─
  const { data: rows, error: listErr } = await sb
    .from('whatsapp_templates')
    .select('id, meta_template_id, name')
    .eq('empresa_id', auth.empresaId)
    .not('meta_template_id', 'is', null)

  if (listErr) {
    if (listErr.code === '42P01') {
      return res.status(503).json({ error: 'Tabla whatsapp_templates no existe', hint: 'Run schema-multichannel.sql + schema-whatsapp-bloque2.sql' })
    }
    return res.status(500).json({ error: listErr.message })
  }
  if (!rows || !rows.length) {
    return res.json({
      updated: 0, analytics: {}, window_days: days, synced_at: new Date().toISOString(),
      _note: 'Sin plantillas sincronizadas con Meta todavía. Sincroniza primero.'
    })
  }

  const idToRow = {}
  for (const r of rows) idToRow[String(r.meta_template_id)] = r
  const allIds = Object.keys(idToRow)

  // ── 4. Fetch in batches of 10, enabling insights on demand ───
  const merged = {}
  const errors = []
  let insightsEnabledThisRun = false

  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE)
    let retried = false
    while (true) {
      try {
        const part = await fetchTemplateAnalytics(wabaId, token, batch, startSec, endSec)
        Object.assign(merged, part)
        break
      } catch (err) {
        const e = fbError(err)
        const insightsNotEnabled = e.code === 200005 || /insight/i.test(e.message || '')
        if (insightsNotEnabled && !retried) {
          retried = true
          if (!insightsEnabledThisRun) { await enableInsights(wabaId, token); insightsEnabledThisRun = true }
          continue   // retry this batch once, now that insights are on
        }
        errors.push({ code: e.code, message: e.message })
        break   // skip this batch, keep going with the rest
      }
    }
  }

  // ── 5. Persist counts onto each template row ─────────────────
  let updated = 0
  const analytics = {}
  for (const id of allIds) {
    const counts = merged[id] || { sent: 0, delivered: 0, read: 0, clicked: 0 }
    analytics[id] = { template_id: id, name: idToRow[id].name, ...counts }
    // Only write rows Meta actually returned data for — don't clobber existing
    // counts with zeros when a batch errored out.
    if (merged[id]) {
      const ok = await persistCounts(sb, idToRow[id].id, counts)
      if (ok) updated++
    }
  }

  return res.json({
    updated,
    analytics,
    window_days: days,
    synced_at: new Date().toISOString(),
    insights_enabled: insightsEnabledThisRun || undefined,
    errors: errors.length ? errors : undefined
  })
}

/**
 * Write the counters back. Tries the rich set (incl. clicked_count +
 * analytics_updated_at); if those columns aren't migrated yet, falls back to
 * the base counters so this still works before schema-whatsapp-analytics.sql.
 */
async function persistCounts (sb, rowId, counts) {
  const full = {
    sent_count: counts.sent,
    delivered_count: counts.delivered,
    read_count: counts.read,
    clicked_count: counts.clicked,
    analytics_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  let { error } = await sb.from('whatsapp_templates').update(full).eq('id', rowId)
  if (error && (error.code === '42703' || error.code === 'PGRST204' || /column/i.test(error.message || ''))) {
    const base = {
      sent_count: counts.sent,
      delivered_count: counts.delivered,
      read_count: counts.read,
      updated_at: new Date().toISOString()
    }
    const retry = await sb.from('whatsapp_templates').update(base).eq('id', rowId)
    error = retry.error
  }
  if (error) console.warn('[wa-analytics] persist failed for', rowId, ':', error.message)
  return !error
}
