/**
 * GET /api/wizard/config
 *
 * Returns public config the Connect Wizard needs:
 *   - meta_app_id    → Rentmies' Meta App ID (same for all clients)
 *   - calendly_url   → onboarding call link
 *   - whatsapp_url   → wa.me link the user can click to ask for help
 *
 * Public — no auth required. Only returns non-secret values.
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const meta_app_id = process.env.META_APP_ID || ''
  const calendly_url = process.env.RENTMIES_CALENDLY_URL || 'https://calendly.com/rentmies/onboarding'
  const whatsapp_number_raw = process.env.RENTMIES_WHATSAPP_NUMBER || '+573000000000'
  const whatsapp_digits = whatsapp_number_raw.replace(/\D/g, '')

  return res.json({
    meta_app_id,
    calendly_url,
    whatsapp_number: whatsapp_number_raw,
    whatsapp_url: `https://wa.me/${whatsapp_digits}?text=${encodeURIComponent('Hola, necesito ayuda conectando mi Meta a Rentmies.')}`,
    has_app_id: !!meta_app_id
  })
}
