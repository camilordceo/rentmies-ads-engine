function mockMetrics(adId, variationType) {
  const profiles = {
    urgency:   { ctrBase: 4.8, cpcBase: 1200, convBase: 0.15 },
    social:    { ctrBase: 3.4, cpcBase: 1400, convBase: 0.12 },
    painPoint: { ctrBase: 2.1, cpcBase: 1800, convBase: 0.08 },
    outcome:   { ctrBase: 1.4, cpcBase: 2400, convBase: 0.06 },
  }
  const p = profiles[variationType] || profiles.painPoint
  const noise = () => (Math.random() - 0.5) * 0.6
  const impressions = Math.floor(150 + Math.random() * 850)
  const ctr = Math.max(0.1, p.ctrBase + noise() * p.ctrBase)
  const clicks = Math.floor(impressions * ctr / 100)
  const cpc = Math.floor(p.cpcBase * (1 + noise()))
  const spend = clicks * cpc
  const conversions = Math.floor(clicks * (p.convBase + noise() * 0.05))
  return { adId, impressions, clicks, ctr: parseFloat(ctr.toFixed(2)), cpc, spend, conversions }
}

const DEMO_ADS = [
  { adId: '848000', variationType: 'urgency',   platform: 'meta_feed',      platformName: 'Meta Feed',      ciudad: 'Bogotá' },
  { adId: '849000', variationType: 'social',    platform: 'instagram_feed', platformName: 'Instagram Feed', ciudad: 'Medellín' },
  { adId: '850000', variationType: 'painPoint', platform: 'meta_feed',      platformName: 'Meta Feed',      ciudad: 'Cali' },
  { adId: '851000', variationType: 'outcome',   platform: 'meta_stories',   platformName: 'Meta Stories',   ciudad: 'Bogotá' },
  { adId: '852000', variationType: 'urgency',   platform: 'instagram_feed', platformName: 'Instagram Feed', ciudad: 'Medellín' },
]

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ads = DEMO_ADS.map(ad => ({ ...ad, metrics: mockMetrics(ad.adId, ad.variationType) }))
  const totals = ads.reduce((acc, { metrics: m }) => {
    acc.totalImpressions += m.impressions
    acc.totalClicks      += m.clicks
    acc.totalSpend       += m.spend
    acc.totalConversions += m.conversions
    return acc
  }, { totalImpressions: 0, totalClicks: 0, totalSpend: 0, totalConversions: 0 })

  totals.avgCTR      = totals.totalImpressions > 0 ? ((totals.totalClicks / totals.totalImpressions) * 100).toFixed(2) : '0.00'
  totals.costPerLead = totals.totalConversions > 0 ? Math.floor(totals.totalSpend / totals.totalConversions) : 0

  res.status(200).json({ success: true, ads, totals, activeAds: ads.length })
}
