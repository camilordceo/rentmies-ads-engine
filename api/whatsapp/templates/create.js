/**
 * POST /api/whatsapp/templates/create
 *   Creates a new template draft and (optionally) submits it to Meta
 *   for review.
 *
 * BLOQUE 2 STUB: returns 501 until implementation lands.
 *
 * When implemented:
 *   body: { name, language, category, components, submit?: boolean }
 *   1. Insert into whatsapp_templates (status='DRAFT')
 *   2. If submit=true: POST to /v21.0/{waba_id}/message_templates,
 *      update row to status='PENDING' + meta_template_id
 *   3. Return the created/submitted row
 */

const { cors } = require('../../_lib/auth')

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  return res.status(501).json({
    error: 'Not Implemented',
    detail: 'Template creation ships in Bloque 2.'
  })
}
