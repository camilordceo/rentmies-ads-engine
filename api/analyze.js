function mockMetrics(adId, variationType) {
  const profiles = {
    urgency: { ctrBase: 4.8, cpcBase: 1200 }, social: { ctrBase: 3.4, cpcBase: 1400 },
    painPoint: { ctrBase: 2.1, cpcBase: 1800 }, outcome: { ctrBase: 1.4, cpcBase: 2400 },
  }
  const p = profiles[variationType] || profiles.painPoint
  const noise = () => (Math.random() - 0.5) * 0.6
  const impressions = Math.floor(150 + Math.random() * 850)
  const ctr = Math.max(0.1, p.ctrBase + noise() * p.ctrBase)
  const cpc = Math.floor(p.cpcBase * (1 + noise()))
  return { adId, impressions, clicks: Math.floor(impressions * ctr / 100), ctr: parseFloat(ctr.toFixed(2)), cpc, spend: Math.floor(impressions * ctr / 100) * cpc, conversions: Math.floor(impressions * ctr / 100 * 0.1) }
}

function decide(metrics) {
  const { ctr, cpc, impressions } = metrics
  if (impressions < 100) return { decision: 'mantener', razon: `Solo ${impressions} impresiones. Necesita más datos.`, nuevo_presupuesto: null }
  if (ctr < 0.8)         return { decision: 'pausar',   razon: `CTR ${ctr}% bajo el umbral mínimo de 0.8%`, nuevo_presupuesto: null }
  if (ctr >= 5 && cpc <= 1500) return { decision: 'escalar_agresivo', razon: `CTR ${ctr}% excelente + CPC $${cpc} muy eficiente.`, nuevo_presupuesto: 150000 }
  if (ctr >= 3 && cpc <= 2000) return { decision: 'escalar',          razon: `CTR ${ctr}% sobre umbral, CPC aceptable.`, nuevo_presupuesto: 100000 }
  return { decision: 'mantener', razon: `CTR ${ctr}% aceptable. Monitorear.`, nuevo_presupuesto: null }
}

const DEMO = [
  { adId: '848000', variationType: 'urgency',   ciudad: 'Bogotá',   platform: 'meta_feed' },
  { adId: '849000', variationType: 'social',    ciudad: 'Medellín', platform: 'instagram_feed' },
  { adId: '850000', variationType: 'painPoint', ciudad: 'Cali',     platform: 'meta_feed' },
  { adId: '851000', variationType: 'outcome',   ciudad: 'Bogotá',   platform: 'meta_stories' },
]

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const decisions = DEMO.map(ad => {
    const metrics = mockMetrics(ad.adId, ad.variationType)
    return { timestamp: new Date().toISOString(), ...ad, metrics, ...decide(metrics), source: 'rules' }
  })

  res.status(200).json({ success: true, decisions, totalAnalyzed: decisions.length })
}
