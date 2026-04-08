/**
 * RENTMIES — LEADS API
 * POST /api/leads
 * Captura leads del landing page y los guarda en Supabase.
 * También envía notificación por WhatsApp/email al equipo.
 */

const supabase = require('../lib/supabase')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    name    = '',
    phone   = '',
    email   = '',
    city    = '',
    product = '',
    source  = 'landing',
    message = '',
  } = req.body || {}

  if (!name || !phone) {
    return res.status(400).json({ error: 'name y phone son requeridos' })
  }

  // Enrich data
  const leadData = {
    name:       name.trim(),
    phone:      phone.trim(),
    email:      email.trim() || null,
    city:       city || null,
    product:    product || null,
    source,
    message:    message || null,
    status:     'new',
    created_at: new Date().toISOString(),
  }

  // ── Save to Supabase ──────────────────────────────────────────────────────
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('leads')
        .insert(leadData)
        .select('id')
        .single()

      if (error) {
        console.error('[leads] Supabase error:', error.message)
        // Don't fail — still return success to user
      } else {
        console.log(`[leads] ✓ Lead guardado: ${data.id} — ${name} — ${product}`)
      }
    } catch (err) {
      console.error('[leads] Unexpected error:', err.message)
    }
  }

  // ── Notify team via WhatsApp (Twilio or direct link) ─────────────────────
  // TODO: integrate Twilio / WhatsApp Business API for instant notifications
  // For now, logs to console
  console.log(`\n🔥 NUEVO LEAD:
  Nombre:   ${name}
  WhatsApp: ${phone}
  Email:    ${email || 'N/A'}
  Ciudad:   ${city || 'N/A'}
  Producto: ${product || 'general'}
  Fuente:   ${source}
  Fecha:    ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
`)

  return res.status(200).json({
    success: true,
    message: 'Lead capturado. Te contactaremos en menos de 2 horas.',
    leadId: null, // returned when supabase works
  })
}
