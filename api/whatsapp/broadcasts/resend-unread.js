/**
 * POST /api/whatsapp/broadcasts/resend-unread?id=...
 *   Clones a broadcast targeting only recipients with status NOT IN
 *   ('read', 'replied'). The new broadcast uses the same template +
 *   sending speed, with a "(re-envío)" suffix on the name. Status
 *   starts as 'sending' so the cron picks it up on next tick.
 *
 *   Response: { id, queued }
 */

const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const id = String(req.query.id || '').trim()
  if (!id) return res.status(400).json({ error: 'id requerido' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  // Load original broadcast
  const { data: orig } = await sb
    .from('whatsapp_broadcasts')
    .select('id, template_id, name, language, sending_speed, media_url, media_kind, opt_in_attested')
    .eq('id', id)
    .eq('empresa_id', auth.empresaId)
    .maybeSingle()
  if (!orig) return res.status(404).json({ error: 'Broadcast no encontrado' })
  if (!orig.opt_in_attested) return res.status(400).json({ error: 'opt-in attestation requerido' })

  // Pull recipients who didn't read or reply
  const { data: targets } = await sb
    .from('whatsapp_broadcast_recipients')
    .select('phone_e164, contact_name, variables')
    .eq('broadcast_id', id)
    .not('status', 'in', '(read,replied)')

  if (!targets || targets.length === 0) {
    return res.status(400).json({ error: 'No hay destinatarios sin lectura para re-enviar' })
  }

  // Create the new broadcast
  const now = new Date().toISOString()
  const { data: created, error: cErr } = await sb
    .from('whatsapp_broadcasts')
    .insert({
      empresa_id: auth.empresaId,
      template_id: orig.template_id,
      name: (orig.name || 'broadcast') + ' (re-envío)',
      language: orig.language,
      status: 'sending',
      sending_speed: orig.sending_speed,
      rate_per_minute: (orig.sending_speed || 5) * 60,
      opt_in_attested: true,
      opt_in_attested_at: now,
      media_url: orig.media_url,
      media_kind: orig.media_kind,
      total_recipients: targets.length,
      sent_count: 0,
      delivered_count: 0,
      read_count: 0,
      failed_count: 0,
      created_at: now,
      updated_at: now,
      started_at: now
    })
    .select('id')
    .single()
  if (cErr) return res.status(500).json({ error: cErr.message })

  // Insert recipient rows in chunks
  const CHUNK = 500
  const recipients = targets.map(t => ({
    empresa_id: auth.empresaId,
    broadcast_id: created.id,
    phone_e164: t.phone_e164,
    contact_name: t.contact_name,
    variables: t.variables || {},
    status: 'pending',
    created_at: now
  }))
  let inserted = 0
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const slice = recipients.slice(i, i + CHUNK)
    const { error } = await sb.from('whatsapp_broadcast_recipients').insert(slice)
    if (!error) inserted += slice.length
  }

  if (inserted !== recipients.length) {
    await sb.from('whatsapp_broadcasts')
      .update({ total_recipients: inserted, updated_at: new Date().toISOString() })
      .eq('id', created.id)
  }

  return res.json({ id: created.id, queued: inserted, source_broadcast_id: id })
}
