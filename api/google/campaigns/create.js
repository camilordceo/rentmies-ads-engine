/**
 * POST /api/google/campaigns/create
 *   Creates a Google Ads campaign via the Google Ads API.
 *
 * BLOQUE 3 STUB: returns 501 until implementation lands.
 */

const { cors } = require('../../_lib/auth')

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  return res.status(501).json({
    error: 'Not Implemented',
    detail: 'Google campaign creation ships in Bloque 3. Need: developer token approval + MCC account.'
  })
}
