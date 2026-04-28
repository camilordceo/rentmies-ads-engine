/**
 * GET /api/wompi/acceptance-tokens
 *
 * Refresca los tokens de aceptación (T&C + Habeas Data) que Wompi exige
 * en cada transacción. Expiran rápido — el frontend los pide justo antes
 * de cobrar.
 */

const wompi = require('../../lib/wompi-client')
const cfg = require('../../lib/wompi-config')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const missing = cfg.missingEnvVars()
  if (missing.length) return res.status(503).json({ error: 'Wompi not configured', missing })

  try {
    const tokens = await wompi.fetchAcceptanceTokens()
    return res.json(tokens)
  } catch (err) {
    console.error('[wompi/acceptance-tokens]', err.message)
    return res.status(502).json({ error: 'Wompi /merchants failed', detail: err.message })
  }
}
