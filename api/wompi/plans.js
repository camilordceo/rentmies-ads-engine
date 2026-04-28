/**
 * GET /api/wompi/plans → catálogo público de planes (sin secrets).
 *
 * Lo lee la página /onboarding/payment.html para renderizar las cards.
 */

const { PLANS } = require('../../lib/wompi-plans')
const cfg = require('../../lib/wompi-config')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  return res.json({
    env: cfg.ENV,
    public_key: cfg.PUBLIC_KEY,    // pública, OK exponer
    js_lib_url: cfg.JS_LIB_URL,
    plans: PLANS
  })
}
