/**
 * GET /api/cron/google-recommendations
 *   Runs every 6 hours · analyzes campaign performance and writes
 *   actionable suggestions to google_recommendations.
 *
 *   Rules implemented:
 *     1. CPA > 2x target  → pause_underperformer (urgent)
 *     2. CPA < 0.5x target with conversions > 3 → scale_budget
 *     3. CTR < 1% over 7 days → try_headline (warn)
 *     4. < 10 impressions in 24h → add_audience (info)
 *     5. spend_share too lopsided across campaigns → reallocate_spend
 *
 *   Auth: Vercel cron sends `Authorization: Bearer CRON_SECRET`.
 */

const { getServiceClient } = require('../_lib/auth')

module.exports = async (req, res) => {
  const auth = req.headers.authorization || ''
  const expected = process.env.CRON_SECRET ? 'Bearer ' + process.env.CRON_SECRET : null
  if (expected && auth !== expected) return res.status(401).json({ error: 'Unauthorized' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const startedAt = Date.now()
  let inserted = 0
  let evaluated = 0
  let empresasTouched = new Set()

  // Pull all active connections + their campaigns
  const { data: conns, error } = await sb
    .from('google_connections')
    .select('empresa_id, customer_id, status')
    .eq('status', 'active')

  if (error) {
    if (error.code === '42P01') return res.json({ ok: true, inserted: 0, hint: 'tables missing' })
    return res.status(500).json({ error: error.message })
  }

  for (const c of conns || []) {
    const empresaId = c.empresa_id
    empresasTouched.add(empresaId)

    const { data: campaigns } = await sb
      .from('google_campaigns')
      .select('id, name, campaign_type, status, target_cpa_micros, budget_amount_micros, impressions, clicks, conversions, cost_micros, cost_per_conversion_micros, audience_signals, search_themes, metrics_last_synced_at')
      .eq('empresa_id', empresaId)
      .neq('status', 'REMOVED')

    if (!campaigns || campaigns.length === 0) continue

    const totalSpend = campaigns.reduce((acc, c) => acc + Number(c.cost_micros || 0), 0)

    for (const camp of campaigns) {
      evaluated++
      const recos = analyze(camp, totalSpend, campaigns.length)
      for (const reco of recos) {
        // Avoid duplicates: don't insert the same kind for the same campaign within 24h
        const { data: existing } = await sb
          .from('google_recommendations')
          .select('id')
          .eq('empresa_id', empresaId)
          .eq('google_campaign_id', camp.id)
          .eq('kind', reco.kind)
          .eq('status', 'open')
          .gte('detected_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
          .maybeSingle()
        if (existing) continue

        const { error: insErr } = await sb.from('google_recommendations').insert({
          empresa_id: empresaId,
          google_campaign_id: camp.id,
          kind: reco.kind,
          severity: reco.severity,
          title: reco.title,
          body: reco.body,
          action_kind: reco.action_kind || null,
          action_params: reco.action_params || {},
          expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
        })
        if (!insErr) inserted++
      }
    }
  }

  return res.json({
    ok: true,
    empresas: empresasTouched.size,
    campaigns_evaluated: evaluated,
    recommendations_inserted: inserted,
    elapsed_ms: Date.now() - startedAt
  })
}

function analyze (camp, totalSpend, campaignCount) {
  const recos = []
  const conv = Number(camp.conversions || 0)
  const cost = Number(camp.cost_micros || 0)
  const target = Number(camp.target_cpa_micros || 0)
  const cpa = conv > 0 ? cost / conv : 0
  const impressions = Number(camp.impressions || 0)
  const clicks = Number(camp.clicks || 0)
  const ctr = impressions > 0 ? clicks / impressions : 0

  // 1. CPA > 2x target → pause_underperformer (only if we have enough data)
  if (target > 0 && conv >= 3 && cpa > target * 2) {
    recos.push({
      kind: 'pause_underperformer',
      severity: 'urgent',
      title: `Pausa "${camp.name}"`,
      body: `CPA actual ${fmtMicros(cpa)} vs target ${fmtMicros(target)} (${(cpa/target).toFixed(1)}x sobre objetivo). Pausa o reduce target CPA.`,
      action_kind: 'pause',
      action_params: { campaign_id: camp.id }
    })
  }

  // 2. CPA < 0.5x target with conversions > 3 → scale budget
  if (target > 0 && conv > 3 && cpa > 0 && cpa < target * 0.5) {
    const newBudget = Math.round((Number(camp.budget_amount_micros) || 0) * 1.3)
    recos.push({
      kind: 'scale_budget',
      severity: 'info',
      title: `Escala "${camp.name}" +30%`,
      body: `CPA actual ${fmtMicros(cpa)} es ${(cpa/target).toFixed(1)}x vs target — está convirtiendo barato. Subir budget mantiene la eficiencia.`,
      action_kind: 'mutate_budget',
      action_params: { campaign_id: camp.id, new_budget_micros: newBudget }
    })
  }

  // 3. CTR < 1% over enough volume → suggest new headlines
  if (impressions > 1000 && ctr < 0.01) {
    recos.push({
      kind: 'try_headline',
      severity: 'warn',
      title: `CTR bajo en "${camp.name}"`,
      body: `${(ctr*100).toFixed(2)}% CTR sobre ${impressions.toLocaleString('es-CO')} impresiones. Probemos headlines más concretos — ej: incluir precio o ubicación específica.`,
      action_kind: 'add_asset',
      action_params: { campaign_id: camp.id, asset_type: 'HEADLINE' }
    })
  }

  // 4. Low impressions over 24h → expand audience
  if (impressions < 50 && camp.status === 'ENABLED' && (!camp.audience_signals || camp.audience_signals.length < 2)) {
    recos.push({
      kind: 'add_audience',
      severity: 'info',
      title: `"${camp.name}" tiene poco alcance`,
      body: `Solo ${impressions} impresiones. Agrega 1-2 audience signals adicionales (ej: First-time buyers, Investors) para que la IA tenga más semilla.`,
      action_kind: 'add_audience',
      action_params: { campaign_id: camp.id }
    })
  }

  // 5. Lopsided spend across campaigns
  const share = totalSpend > 0 ? cost / totalSpend : 0
  if (campaignCount >= 3 && share > 0.7) {
    recos.push({
      kind: 'reallocate_spend',
      severity: 'info',
      title: `"${camp.name}" consume ${Math.round(share*100)}% del spend`,
      body: `Una sola campaña concentra el ${Math.round(share*100)}% de tu inversión. Diversifica: cap budget de esta y sube las otras 30%.`,
      action_kind: 'mutate_budget',
      action_params: { campaign_id: camp.id, suggestion: 'cap_share_60pct' }
    })
  }

  return recos
}

function fmtMicros (m) {
  if (!m) return '$0'
  const dollars = Number(m) / 1_000_000
  return '$' + dollars.toFixed(2)
}

module.exports.config = { maxDuration: 60 }
