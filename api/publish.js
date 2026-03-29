module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { ads = [] } = req.body || {}
  const published = ads.map((ad, i) => ({
    platform:      ad.platform,
    platformName:  ad.platformName,
    adId:          `12021${Date.now()}${i}`.slice(0, 15),
    status:        'DRAFT',
    publishedAt:   new Date().toISOString(),
    source:        'mock',
    originalAdId:  ad.id,
    headline:      ad.headline,
    ciudad:        ad.ciudad,
    variationType: ad.variationType
  }))

  res.status(200).json({ success: true, published })
}
