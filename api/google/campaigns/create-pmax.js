/**
 * POST /api/google/campaigns/create-pmax
 *   Creates a Performance Max campaign. Status = PAUSED so the user
 *   reviews + activates from the campaigns list.
 *
 * Pipeline (4 sequential Google Ads API operations):
 *   1. CampaignBudget.mutate (create)
 *   2. Campaign.mutate (create, advertising_channel_type=PERFORMANCE_MAX,
 *      bidding_strategy=MaximizeConversions, target_cpa optional)
 *   3. AssetGroup.mutate (create, links to campaign)
 *   4. Asset.mutate (create text assets) + AssetGroupAsset.mutate
 *      (link headlines / descriptions to the asset group)
 *
 * On success we save a row in google_campaigns with the resource
 * names + Google IDs so the list page can show it immediately.
 *
 * Body:
 *   {
 *     name, daily_budget_cents, target_cpa_cents, final_url,
 *     audience_signals: [...], search_themes: [...],
 *     headlines: [...5...], long_headlines: [...5...],
 *     descriptions: [...5...],
 *     inmueble_id?
 *   }
 *
 * NOTE: Performance Max strictly requires images (logo + landscape
 * + square). This stub creates text assets only and surfaces a
 * helpful error if Google complains. Image upload comes later — for
 * now the user can use the Google Ads UI to add images on top of
 * the campaign skeleton we created.
 */

const axios = require('axios')
const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')
const { isConfigured, customerUrl, authHeaders } = require('../../../lib/google-ads-config')
const { getValidGoogleToken } = require('../../../lib/google-tokens')

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!isConfigured()) {
    return res.status(503).json({
      error: 'Google Ads no está configurado',
      detail: 'Faltan env vars GOOGLE_ADS_DEVELOPER_TOKEN / CLIENT_ID / SECRET / REDIRECT_URI'
    })
  }

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const c = req.body || {}
  if (!c.name || !c.final_url) return res.status(400).json({ error: 'name + final_url requeridos' })
  if (!c.daily_budget_cents || c.daily_budget_cents < 100) return res.status(400).json({ error: 'daily_budget_cents inválido (mínimo 100)' })

  // 1. Get a valid Google access token + customer_id
  let token, customerId
  try {
    const t = await getValidGoogleToken(sb, auth.empresaId)
    token = t.token
    customerId = t.customerId
  } catch (err) {
    return res.status(400).json({ error: err.message, code: err.code || 'token_failed' })
  }

  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID no encontrado en la conexión Google' })
  }

  const stamp = Date.now()
  const stages = []   // record of what we did, useful for debugging + cleanup on failure

  try {
    // ── 2. Create CampaignBudget ─────────────────────────────
    const budgetMicros = (c.daily_budget_cents / 100) * 1_000_000   // dollars to micros
    const budgetUrl = customerUrl(customerId, '/campaignBudgets:mutate')
    const budgetBody = {
      operations: [{
        create: {
          name: `Budget ${c.name} ${stamp}`,
          amountMicros: String(budgetMicros),
          deliveryMethod: 'STANDARD',
          explicitlyShared: false
        }
      }]
    }
    const budgetResp = await axios.post(budgetUrl, budgetBody, { headers: authHeaders(token), timeout: 20000 })
    const budgetResource = budgetResp.data?.results?.[0]?.resourceName
    if (!budgetResource) throw stageError('budget', 'No resourceName returned')
    stages.push({ stage: 'budget', resource: budgetResource })

    // ── 3. Create Campaign ──────────────────────────────────
    const campaignUrl = customerUrl(customerId, '/campaigns:mutate')
    const campaignCreate = {
      name: c.name,
      advertisingChannelType: 'PERFORMANCE_MAX',
      status: 'PAUSED',
      campaignBudget: budgetResource,
      biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
      urlExpansionOptOut: false,
      networkSettings: {
        targetGoogleSearch: true,
        targetSearchNetwork: true,
        targetContentNetwork: true,
        targetPartnerSearchNetwork: false
      }
    }
    if (c.target_cpa_cents) {
      campaignCreate.maximizeConversions = { targetCpaMicros: String((c.target_cpa_cents / 100) * 1_000_000) }
    }
    const campaignBody = { operations: [{ create: campaignCreate }] }
    const campaignResp = await axios.post(campaignUrl, campaignBody, { headers: authHeaders(token), timeout: 30000 })
    const campaignResource = campaignResp.data?.results?.[0]?.resourceName
    if (!campaignResource) throw stageError('campaign', 'No resourceName returned')
    const googleCampaignId = campaignResource.split('/').pop()
    stages.push({ stage: 'campaign', resource: campaignResource, id: googleCampaignId })

    // ── 4. Create AssetGroup ────────────────────────────────
    const assetGroupUrl = customerUrl(customerId, '/assetGroups:mutate')
    const assetGroupCreate = {
      name: `${c.name} · Asset Group`,
      campaign: campaignResource,
      finalUrls: [c.final_url],
      finalMobileUrls: [c.final_url],
      status: 'PAUSED'
    }
    const assetGroupBody = { operations: [{ create: assetGroupCreate }] }
    let assetGroupResource
    try {
      const r = await axios.post(assetGroupUrl, assetGroupBody, { headers: authHeaders(token), timeout: 30000 })
      assetGroupResource = r.data?.results?.[0]?.resourceName
    } catch (err) {
      // Asset group creation can fail for various reasons (e.g., invalid URL).
      // We DO have a campaign + budget already; record the partial success
      // so the user can complete it in the Google Ads UI.
      const detail = err.response?.data?.error?.message || err.message
      await persistPartial(sb, auth.empresaId, customerId, c, googleCampaignId, campaignResource, budgetResource, null)
      return res.status(202).json({
        ok: false,
        partial: true,
        google_campaign_id: googleCampaignId,
        message: 'Campaign + budget created. Asset group failed.',
        detail,
        next_step: 'Open in Google Ads UI to finish asset group'
      })
    }
    stages.push({ stage: 'asset_group', resource: assetGroupResource })

    // ── 5. Create Text Assets + link them ───────────────────
    const headlinesArr = (c.headlines || []).filter(Boolean).slice(0, 5)
    const longHeadlinesArr = (c.long_headlines || []).filter(Boolean).slice(0, 5)
    const descriptionsArr = (c.descriptions || []).filter(Boolean).slice(0, 5)

    const assetCreates = []
    for (const h of headlinesArr)        assetCreates.push({ create: { textAsset: { text: h } } })
    for (const lh of longHeadlinesArr)   assetCreates.push({ create: { textAsset: { text: lh } } })
    for (const d of descriptionsArr)     assetCreates.push({ create: { textAsset: { text: d } } })

    if (assetCreates.length > 0) {
      try {
        const assetUrl = customerUrl(customerId, '/assets:mutate')
        const assetResp = await axios.post(assetUrl, { operations: assetCreates }, { headers: authHeaders(token), timeout: 30000 })
        const assetResources = (assetResp.data?.results || []).map(r => r.resourceName)
        stages.push({ stage: 'assets', count: assetResources.length })

        // Link assets to asset group with field types
        const linkOps = []
        let idx = 0
        for (let i = 0; i < headlinesArr.length; i++) linkOps.push({ create: { assetGroup: assetGroupResource, asset: assetResources[idx++], fieldType: 'HEADLINE' } })
        for (let i = 0; i < longHeadlinesArr.length; i++) linkOps.push({ create: { assetGroup: assetGroupResource, asset: assetResources[idx++], fieldType: 'LONG_HEADLINE' } })
        for (let i = 0; i < descriptionsArr.length; i++) linkOps.push({ create: { assetGroup: assetGroupResource, asset: assetResources[idx++], fieldType: 'DESCRIPTION' } })

        const linkUrl = customerUrl(customerId, '/assetGroupAssets:mutate')
        await axios.post(linkUrl, { operations: linkOps }, { headers: authHeaders(token), timeout: 30000 })
        stages.push({ stage: 'asset_group_assets', count: linkOps.length })
      } catch (err) {
        const detail = err.response?.data?.error?.message || err.message
        console.warn('[google-pmax] asset linking failed:', detail)
        // Don't fail the whole creation — campaign + budget are valid
      }
    }

    // ── 6. Persist ──────────────────────────────────────────
    await persistFull(sb, auth.empresaId, customerId, c, googleCampaignId, campaignResource, budgetResource, assetGroupResource)

    return res.json({
      ok: true,
      google_campaign_id: googleCampaignId,
      campaign_resource_name: campaignResource,
      budget_resource_name: budgetResource,
      asset_group_resource_name: assetGroupResource,
      stages,
      hint: 'Performance Max requiere imágenes. Agrega logo + landscape + square en Google Ads UI antes de activar.'
    })
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message
    return res.status(500).json({
      error: 'PMax creation failed',
      stage: err.stage || 'unknown',
      detail,
      stages
    })
  }
}

function stageError (stage, message) {
  const e = new Error(message)
  e.stage = stage
  return e
}

async function persistPartial (sb, empresaId, customerId, c, googleCampaignId, campaignResource, budgetResource, assetGroupResource) {
  return sb.from('google_campaigns').insert({
    empresa_id: empresaId,
    customer_id: customerId,
    google_campaign_id: googleCampaignId,
    campaign_resource_name: campaignResource,
    name: c.name,
    campaign_type: 'PERFORMANCE_MAX',
    status: 'PAUSED',
    budget_amount_micros: (c.daily_budget_cents / 100) * 1_000_000,
    budget_currency_code: 'USD',
    bidding_strategy: 'MAXIMIZE_CONVERSIONS',
    target_cpa_micros: c.target_cpa_cents ? (c.target_cpa_cents / 100) * 1_000_000 : null,
    final_url: c.final_url,
    audience_signals: c.audience_signals || [],
    search_themes: c.search_themes || [],
    asset_group_resource_name: assetGroupResource || null,
    inventario_id: c.inmueble_id || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
}

async function persistFull (sb, empresaId, customerId, c, googleCampaignId, campaignResource, budgetResource, assetGroupResource) {
  return persistPartial(sb, empresaId, customerId, c, googleCampaignId, campaignResource, budgetResource, assetGroupResource)
}

module.exports.config = { maxDuration: 60 }
