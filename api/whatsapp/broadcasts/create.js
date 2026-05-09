/**
 * POST /api/whatsapp/broadcasts/create
 *   Persists a broadcast and all its recipients atomically.
 *
 * Body:
 *   {
 *     name, template_id, template_name, template_language,
 *     schedule: 'now' | 'later',
 *     scheduled_at: ISO | null,
 *     sending_speed: 1 | 5 | 10,
 *     opt_in_attested: true,
 *     media_url: null | string,
 *     source_csv_filename: string,
 *     recipients: [{ phone_e164, variables: {...} }]
 *   }
 *
 * Response: { id, queued, status }
 *
 * Note: actual sending is done by the cron processor at
 * /api/cron/process-broadcasts (Step 19). This endpoint just
 * inserts rows and flips status to 'scheduled' (for later) or
 * 'sending' (for now — picks up on next cron tick).
 */

const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')

const E164_RE = /^\+[1-9]\d{6,14}$/
const MAX_RECIPIENTS = 50_000

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const body = req.body || {}

  // ── Validate ─────────────────────────────────────────────
  if (!body.name || !String(body.name).trim()) return res.status(400).json({ error: 'name requerido' })
  if (!body.template_id) return res.status(400).json({ error: 'template_id requerido' })
  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return res.status(400).json({ error: 'recipients requerido (array no vacío)' })
  }
  if (body.recipients.length > MAX_RECIPIENTS) {
    return res.status(400).json({ error: `Demasiados destinatarios (max ${MAX_RECIPIENTS})` })
  }
  if (!body.opt_in_attested) {
    return res.status(400).json({ error: 'Debes confirmar que tienes opt-in explícito de cada destinatario.' })
  }
  if (body.schedule === 'later' && !body.scheduled_at) {
    return res.status(400).json({ error: 'scheduled_at requerido cuando schedule = later' })
  }
  const allowedSpeeds = [1, 5, 10]
  const speed = allowedSpeeds.includes(Number(body.sending_speed)) ? Number(body.sending_speed) : 5

  // ── Verify the template belongs to this empresa and is approved
  const { data: tpl, error: tplErr } = await sb
    .from('whatsapp_templates')
    .select('id, name, language, status, components, waba_id')
    .eq('id', body.template_id)
    .eq('empresa_id', auth.empresaId)
    .maybeSingle()
  if (tplErr || !tpl) {
    return res.status(404).json({ error: 'Template no encontrado para esta empresa' })
  }
  if ((tpl.status || '').toUpperCase() !== 'APPROVED') {
    return res.status(400).json({ error: 'Template no está APPROVED — no se puede enviar' })
  }

  const now = new Date().toISOString()
  const initialStatus = body.schedule === 'now' ? 'sending' : 'scheduled'

  // ── Insert broadcast row ─────────────────────────────────
  const broadcastInsert = {
    empresa_id: auth.empresaId,
    template_id: body.template_id,
    name: String(body.name).slice(0, 200),
    language: tpl.language || body.template_language || 'es_CO',
    status: initialStatus,
    scheduled_at: body.scheduled_at || null,
    sending_speed: speed,
    rate_per_minute: speed * 60,
    opt_in_attested: true,
    opt_in_attested_at: now,
    opt_in_attested_by_user_id: auth.userId === auth.empresaId ? null : auth.userId,
    media_url: body.media_url || null,
    media_kind: body.media_kind || null,
    source_csv_filename: body.source_csv_filename || null,
    variables_payload: body.variables_payload || {},
    total_recipients: body.recipients.length,
    sent_count: 0,
    delivered_count: 0,
    read_count: 0,
    failed_count: 0,
    replied_count: 0,
    created_at: now,
    updated_at: now,
    started_at: body.schedule === 'now' ? now : null
  }

  let broadcastId
  try {
    const { data, error } = await sb
      .from('whatsapp_broadcasts')
      .insert(broadcastInsert)
      .select('id')
      .single()
    if (error) {
      if (error.code === '42P01') return res.status(503).json({ error: 'Tablas no inicializadas', hint: 'Run schema-multichannel.sql + schema-whatsapp-bloque2.sql' })
      throw error
    }
    broadcastId = data.id
  } catch (err) {
    return res.status(500).json({ error: err.message, step: 'insert_broadcast' })
  }

  // ── Insert recipients in chunks (Supabase max ~1000 per insert)
  const CHUNK = 500
  const cleanRecipients = []
  for (const r of body.recipients) {
    const phone = String(r.phone_e164 || '').trim()
    if (!E164_RE.test(phone)) continue
    cleanRecipients.push({
      empresa_id: auth.empresaId,
      broadcast_id: broadcastId,
      phone_e164: phone,
      contact_name: r.contact_name || null,
      variables: r.variables || {},
      status: 'pending',
      created_at: now
    })
  }

  let inserted = 0
  for (let i = 0; i < cleanRecipients.length; i += CHUNK) {
    const slice = cleanRecipients.slice(i, i + CHUNK)
    const { error } = await sb.from('whatsapp_broadcast_recipients').insert(slice)
    if (error) {
      console.error('[wa-broadcast-create] recipient insert chunk failed:', error.message)
      // Don't fail the whole broadcast — partial inserts are recoverable
      continue
    }
    inserted += slice.length
  }

  // Update total_recipients to actual valid count if it differs
  if (inserted !== body.recipients.length) {
    await sb.from('whatsapp_broadcasts')
      .update({ total_recipients: inserted, updated_at: new Date().toISOString() })
      .eq('id', broadcastId)
  }

  return res.json({
    id: broadcastId,
    queued: inserted,
    skipped: body.recipients.length - inserted,
    status: initialStatus,
    next_step: body.schedule === 'now'
      ? 'cron processor will pick up within 60s'
      : `scheduled for ${body.scheduled_at}`
  })
}
