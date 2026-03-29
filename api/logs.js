const ENTRIES = [
  { adId: '852000', variationType: 'urgency',   ciudad: 'Medellín', decision: 'escalar_agresivo', ctr: 5.2, cpc: 1100, mins: 18 },
  { adId: '849000', variationType: 'social',    ciudad: 'Medellín', decision: 'escalar',          ctr: 3.8, cpc: 1600, mins: 36 },
  { adId: '848000', variationType: 'urgency',   ciudad: 'Bogotá',   decision: 'mantener',         ctr: 2.1, cpc: 1900, mins: 54 },
  { adId: '851000', variationType: 'outcome',   ciudad: 'Bogotá',   decision: 'mantener',         ctr: 1.5, cpc: 2200, mins: 72 },
  { adId: '850000', variationType: 'painPoint', ciudad: 'Cali',     decision: 'pausar',           ctr: 0.5, cpc: 3100, mins: 90 },
]

const RAZONES = {
  pausar:           'CTR por debajo del umbral mínimo de 0.8%',
  mantener:         'CTR aceptable. Continuar monitoreando.',
  escalar:          'CTR sobre umbral y CPC eficiente. Escalar.',
  escalar_agresivo: 'CTR excelente + CPC muy bajo. Escalar agresivo ×3.',
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const log = ENTRIES.map(e => ({
    timestamp:        new Date(Date.now() - e.mins * 60000).toISOString(),
    adId:             e.adId,
    variationType:    e.variationType,
    ciudad:           e.ciudad,
    decision:         e.decision,
    razon:            RAZONES[e.decision],
    nuevo_presupuesto: e.decision === 'escalar_agresivo' ? 150000 : e.decision === 'escalar' ? 100000 : null,
    confianza:        e.decision === 'pausar' ? 9 : e.decision.includes('escalar') ? 10 : 7,
    metrics:          { ctr: e.ctr, cpc: e.cpc, impressions: 320, clicks: Math.floor(320 * e.ctr / 100), conversions: 4, spend: Math.floor(320 * e.ctr / 100) * e.cpc },
    source:           'rules'
  }))

  res.status(200).json({ success: true, log })
}
