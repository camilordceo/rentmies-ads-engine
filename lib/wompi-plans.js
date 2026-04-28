/**
 * Plan catalog — single source of truth for pricing and quotas.
 *
 * Wompi only supports COP. Prices are stored as integer cents (amount_in_cents).
 * USD reference is for display + analytics; the actual charge is COP.
 *
 * Rates: USD * 4000 ≈ COP (rounded to nice numbers — verify monthly).
 */

const PLANS = [
  {
    code: 'starter',
    name: 'Starter',
    usd: 20,
    price_cop_cents: 8000000,         // 80,000 COP
    price_cop_display: '$80.000 COP',
    period: 'monthly',
    quotas: { posts: 7, images: 4, videos: 3 },
    features: [
      '7 publicaciones al mes',
      '4 imágenes IA + 3 videos',
      'Caption con Camilord IA',
      'Programación de campañas',
      'Cancela cuando quieras'
    ]
  },
  {
    code: 'growth',
    name: 'Growth',
    usd: 100,
    price_cop_cents: 40000000,        // 400,000 COP
    price_cop_display: '$400.000 COP',
    period: 'monthly',
    quotas: { posts: 20, images: 10, videos: 10 },
    features: [
      '20 publicaciones al mes',
      '10 imágenes IA + 10 videos',
      'Caption con Camilord IA',
      'Campañas multi-día',
      'Soporte prioritario'
    ],
    recommended: true
  },
  {
    code: 'scale',
    name: 'Scale',
    usd: 500,
    price_cop_cents: 200000000,       // 2,000,000 COP
    price_cop_display: '$2.000.000 COP',
    period: 'monthly',
    quotas: { posts: 40, images: 15, videos: 25 },
    features: [
      '40 publicaciones al mes',
      '15 imágenes IA + 25 videos',
      'Caption con Camilord IA',
      'Campañas multi-cuenta',
      'Account manager dedicado'
    ]
  }
]

function getPlan(code) {
  return PLANS.find(p => p.code === code) || null
}

module.exports = { PLANS, getPlan }
