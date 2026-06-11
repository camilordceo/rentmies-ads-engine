/**
 * RENTMIES — WhatsApp Business Management (Graph API) helpers.
 *
 * Why this lib exists: WhatsApp Business Management calls (message_templates,
 * template_analytics, is_enabled_for_insights) require a USER or SYSTEM USER
 * token carrying the `whatsapp_business_management` permission. The Page
 * access token does NOT carry that scope — so for every WABA-level call we
 * prefer the system user token (meta_connections.long_lived_token) over the
 * page_access_token. Using the page token here is the classic cause of empty
 * template lists / analytics.
 *
 * Used by api/whatsapp/templates/{sync,analytics}.js and
 * api/credentials/meta/test.js.
 */

const axios = require('axios')

const GRAPH = 'https://graph.facebook.com/v21.0'

/**
 * Resolve the WABA id + the token to use for WhatsApp Business Management
 * calls for a given empresa. Priority:
 *   1. Explicit request headers (x-waba-id / x-meta-token) — legacy/manual.
 *   2. meta_connections row — system user token (long_lived_token) preferred,
 *      page_access_token only as a last resort.
 *   3. Server env (META_WABA_ID / META_ACCESS_TOKEN).
 *
 * @returns {Promise<{ token: string, wabaId: string, conn: object|null }>}
 */
async function resolveWabaCreds (sb, empresaId, req) {
  let token = (req && req.headers && req.headers['x-meta-token']) || ''
  let wabaId = (req && req.headers && req.headers['x-waba-id']) || ''
  let conn = null

  if (!token || !wabaId) {
    const { data } = await sb.from('meta_connections')
      .select('id, long_lived_token, page_access_token, waba_id, whatsapp_phone_number_id, status')
      .eq('empresa_id', empresaId)
      .maybeSingle()
    conn = data || null
    if (conn) {
      // System user token first — it's the one with whatsapp_business_management.
      token = token || conn.long_lived_token || conn.page_access_token
      wabaId = wabaId || conn.waba_id
    }
  }

  if (!token) token = process.env.META_ACCESS_TOKEN || ''
  if (!wabaId) wabaId = process.env.META_WABA_ID || ''

  return { token, wabaId, conn }
}

/**
 * Enable Template Insights on a WABA. One-time, irreversible, idempotent —
 * safe to call repeatedly. Required before template_analytics returns data
 * (otherwise Meta replies error 200005 "Template Insights not available").
 * Best-effort: returns true/false, never throws — callers treat it as a hint.
 */
async function enableInsights (wabaId, token) {
  if (!wabaId || !token) return false
  try {
    await axios.post(`${GRAPH}/${encodeURIComponent(wabaId)}`, null, {
      params: { is_enabled_for_insights: true, access_token: token },
      timeout: 10000
    })
    return true
  } catch (_) {
    return false
  }
}

/**
 * Fetch template analytics for up to 10 template ids at a time and sum the
 * daily data points across the window. Throws on Graph errors so the caller
 * can react (e.g. enable insights then retry).
 *
 * @param {string}   wabaId
 * @param {string}   token        system user token (whatsapp_business_management)
 * @param {string[]} templateIds  Meta template ids (max 10 — caller batches)
 * @param {number}   startSec     UNIX seconds (inclusive)
 * @param {number}   endSec       UNIX seconds (exclusive)
 * @returns {Promise<Object.<string,{sent:number,delivered:number,read:number,clicked:number}>>}
 */
async function fetchTemplateAnalytics (wabaId, token, templateIds, startSec, endSec) {
  const ids = `[${templateIds.join(',')}]`
  const { data } = await axios.get(`${GRAPH}/${encodeURIComponent(wabaId)}/template_analytics`, {
    params: {
      access_token: token,
      start: startSec,
      end: endSec,
      granularity: 'DAILY',
      template_ids: ids,
      metric_types: 'SENT,DELIVERED,READ,CLICKED'
    },
    timeout: 25000
  })

  const blocks = Array.isArray(data.data) ? data.data : []
  const out = {}
  for (const block of blocks) {
    const points = Array.isArray(block.data_points) ? block.data_points : []
    for (const p of points) {
      const id = String(p.template_id)
      if (!out[id]) out[id] = { sent: 0, delivered: 0, read: 0, clicked: 0 }
      out[id].sent += Number(p.sent || 0)
      out[id].delivered += Number(p.delivered || 0)
      out[id].read += Number(p.read || 0)
      // `clicked` is an array of { type, button_content, count } per button.
      if (Array.isArray(p.clicked)) {
        for (const c of p.clicked) out[id].clicked += Number(c.count || 0)
      }
    }
  }
  return out
}

/** Normalize a Graph error into { message, code, subcode }. */
function fbError (err) {
  const fb = err && err.response && err.response.data && err.response.data.error
  if (!fb) return { message: (err && err.message) || 'Error desconocido', code: null, subcode: null }
  return { message: fb.error_user_msg || fb.message, code: fb.code, subcode: fb.error_subcode }
}

module.exports = { GRAPH, resolveWabaCreds, enableInsights, fetchTemplateAnalytics, fbError }
