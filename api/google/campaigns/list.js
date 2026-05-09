/**
 * GET /api/google/campaigns/list
 *   Returns campaigns for the empresa, with live metrics from
 *   Google Ads API when the connection is valid. Falls back to
 *   the cached values in google_campaigns if the API call fails
 *   (e.g., dev token not yet approved).
 *
 *   Optional: ?refresh=1 forces a re-sync against Google Ads.
 *
 *   Response: { campaigns: [...], synced_at: ISO|null, source: 'live'|'cache' }
 */

const axios = require('axios')
const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')
const { isConfigured, customerUrl, authHeaders } = require('../../../lib/google-ads-config')
const { getValidGoogleToken } = require('../../../lib/google-tokens')

module.exports = async (req, res) => {
  cors(res, 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const wantRefresh = String(req.query.refresh || '') === '1'

  // Load cached campaigns first (always fast)
  const { data: rows, error } = await sb
    .from('google_campaigns')
    .select('id, name, campaign_type, status, budget_amount_micros, budget_currency_code, target_cpa_micros, bidding_strategy, customer_id, google_campaign_id, campaign_resource_name, impressions, clicks, conversions, cost_micros, cost_per_conversion_micros, final_url, audience_signals, search_themes, inventario_id, metrics_last_synced_at, created_at, updated_at')
    .eq('empresa_id', auth.empresaId)
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return res.json({ campaigns: [], source: 'cache', _hint: 'Run schema-multichannel.sql + schema-google-bloque3.sql' })
    return res.status(500).json({ error: error.message })
  }

  // If no cached campaigns OR no live request, return cache only
  if (!rows || rows.length === 0 || !wantRefresh || !isConfigured()) {
    return res.json({
      campaigns: rows || [],
      source: 'cache',
      synced_at: rows?.reduce((acc, r) => r.metrics_last_synced_at && (!acc || r.metrics_last_synced_at > acc) ? r.metrics_last_synced_at : acc, null)
    })
  }

  // ── Refresh metrics from Google Ads API ──────────────────
  let token, customerId
  try {
    const t = await getValidGoogleToken(sb, auth.empresaId)
    token = t.token
    customerId = t.customerId
  } catch (err) {
    // Return cached data with a warning
    return res.json({
      campaigns: rows,
      source: 'cache',
      sync_warning: err.message
    })
  }

  if (!customerId) return res.json({ campaigns: rows, source: 'cache', sync_warning: 'No customer_id' })

  try {
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.cost_micros,
        metrics.cost_per_conversion,
        metrics.average_cpc,
        metrics.ctr
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
    `.trim()
    const url = customerUrl(customerId, '/googleAds:search')
    const { data } = await axios.post(url, { query }, { headers: authHeaders(token), timeout: 30000 })

    const liveById = {}
    for (const row of data.results || []) {
      const cid = String(row.campaign?.id || '')
      const m = row.metrics || {}
      const existing = liveById[cid] || { impressions: 0, clicks: 0, conversions: 0, cost_micros: 0 }
      liveById[cid] = {
        impressions: existing.impressions + Number(m.impressions || 0),
        clicks: existing.clicks + Number(m.clicks || 0),
        conversions: existing.conversions + Number(m.conversions || 0),
        cost_micros: existing.cost_micros + Number(m.costMicros || 0)
      }
    }

    // Update each campaign row
    const syncedAt = new Date().toISOString()
    for (const r of rows) {
      const live = liveById[String(r.google_campaign_id || '')]
      if (!live) continue
      const cpaMicros = live.conversions > 0 ? Math.round(live.cost_micros / live.conversions) : 0
      await sb.from('google_campaigns').update({
        impressions: live.impressions,
        clicks: live.clicks,
        conversions: live.conversions,
        cost_micros: live.cost_micros,
        cost_per_conversion_micros: cpaMicros,
        metrics_last_synced_at: syncedAt,
        updated_at: syncedAt
      }).eq('id', r.id)

      // Mutate the local row in-place for the response
      r.impressions = live.impressions
      r.clicks = live.clicks
      r.conversions = live.conversions
      r.cost_micros = live.cost_micros
      r.cost_per_conversion_micros = cpaMicros
      r.metrics_last_synced_at = syncedAt
    }

    return res.json({ campaigns: rows, source: 'live', synced_at: syncedAt })
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message
    return res.json({ campaigns: rows, source: 'cache', sync_warning: detail })
  }
}
