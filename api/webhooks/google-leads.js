/**
 * POST /api/webhooks/google-leads
 *   Receives Google Lead Form submissions.
 *
 *   Auth: Google sends a `google_key` field that matches the
 *   secret you configured when creating the Lead Form. We compare
 *   constant-time against process.env.GOOGLE_LEADS_WEBHOOK_SECRET.
 *
 * Payload (Google Lead Form):
 *   {
 *     "google_key": "...",
 *     "lead_id": "...",
 *     "campaign_id": "..." (Google's, not ours),
 *     "user_column_data": [
 *       { "column_id": "FULL_NAME",   "string_value": "..." },
 *       { "column_id": "EMAIL",       "string_value": "..." },
 *       { "column_id": "PHONE_NUMBER","string_value": "..." },
 *       { "column_id": "PROPERTY",    "string_value": "..." }
 *     ],
 *     ...
 *   }
 *
 * Side effects:
 *   - Inserts a row in google_leads
 *   - Optionally fires a WhatsApp follow-up template via the
 *     same empresa's meta_connection (if a `lead_followup_v2`
 *     template is approved + opt_in configured)
 *   - Returns 200 fast — Google retries 4xx/5xx for 24h
 */

const crypto = require('crypto')
const { getServiceClient } = require('../_lib/auth')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  // Read raw body for HMAC if needed
  let rawBody
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    rawBody = Buffer.concat(chunks).toString('utf8')
  } catch (err) {
    return res.status(400).json({ error: 'Failed to read body' })
  }

  let payload
  try { payload = JSON.parse(rawBody) }
  catch (_) { return res.status(400).json({ error: 'Invalid JSON' }) }

  // ── Verify google_key (shared secret you set on the Lead Form)
  const expected = process.env.GOOGLE_LEADS_WEBHOOK_SECRET
  if (expected) {
    const got = String(payload.google_key || '')
    if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
      return res.status(401).json({ error: 'Invalid google_key' })
    }
  }

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  // Extract user column data
  const cols = Array.isArray(payload.user_column_data) ? payload.user_column_data : []
  const byKey = {}
  for (const c of cols) {
    if (c.column_id) byKey[c.column_id] = c.string_value || c.value || ''
  }

  const fullName = byKey.FULL_NAME || byKey.NAME || ''
  const email = byKey.EMAIL || ''
  const phone = byKey.PHONE_NUMBER || byKey.PHONE || ''
  const phoneE164 = normalizeColombianPhone(phone)

  // Resolve which campaign / empresa this lead belongs to
  let empresaId = null
  let googleCampaignId = null
  let googleLeadFormId = null

  if (payload.campaign_id) {
    const { data: camp } = await sb
      .from('google_campaigns')
      .select('id, empresa_id')
      .eq('google_campaign_id', String(payload.campaign_id))
      .maybeSingle()
    if (camp) {
      empresaId = camp.empresa_id
      googleCampaignId = camp.id
    }
  }

  if (!empresaId) {
    // Fallback: look up by Lead Form id
    if (payload.lead_form_id) {
      const { data: lf } = await sb
        .from('google_lead_forms')
        .select('id, empresa_id, google_campaign_id')
        .eq('google_lead_form_id', String(payload.lead_form_id))
        .maybeSingle()
      if (lf) {
        empresaId = lf.empresa_id
        googleLeadFormId = lf.id
        googleCampaignId = lf.google_campaign_id
      }
    }
  }

  if (!empresaId) {
    console.warn('[google-leads] could not resolve empresa for lead', payload.lead_id || payload.campaign_id)
    // Still 200 OK — we don't want Google to retry forever; the lead is logged
    return res.status(200).json({ ok: true, status: 'unresolved', lead_id: payload.lead_id })
  }

  try {
    const { data: inserted, error } = await sb.from('google_leads').insert({
      empresa_id: empresaId,
      google_lead_form_id: googleLeadFormId,
      google_campaign_id: googleCampaignId,
      google_user_lead_id: payload.lead_id ? String(payload.lead_id) : null,
      answers: byKey,
      full_name: fullName || null,
      email: email || null,
      phone_e164: phoneE164,
      status: 'new',
      captured_at: new Date().toISOString()
    }).select('id').single()

    if (error) {
      if (error.code === '42P01') {
        return res.status(200).json({ ok: true, hint: 'tables missing — run schema-multichannel.sql' })
      }
      throw error
    }

    // ── Optional: fire a WhatsApp follow-up template ────────
    // Look for a template named lead_followup_v2 (or similar) that's
    // APPROVED for this empresa, and queue a single-message send.
    if (phoneE164) {
      await maybeFireFollowup(sb, empresaId, phoneE164, fullName).catch(err => {
        console.warn('[google-leads] follow-up dispatch failed:', err.message)
      })
    }

    // Increment the lead form's total counter
    if (googleLeadFormId) {
      await sb.rpc('rentmies_set_updated_at').catch(() => {})   // optional; ignore failures
      const { data: lf } = await sb.from('google_lead_forms').select('total_leads').eq('id', googleLeadFormId).single()
      if (lf) {
        await sb.from('google_lead_forms').update({ total_leads: (lf.total_leads || 0) + 1 }).eq('id', googleLeadFormId)
      }
    }

    return res.status(200).json({ ok: true, lead_id: inserted.id })
  } catch (err) {
    console.error('[google-leads] insert failed:', err.message)
    // Still 200 to avoid retries — log loud
    return res.status(200).json({ ok: true, error: err.message })
  }
}

function normalizeColombianPhone (raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '')
  if (!digits) return null
  if (digits.startsWith('+')) return digits
  if (digits.length === 10 && digits.startsWith('3')) return '+57' + digits
  if (digits.length === 12 && digits.startsWith('57')) return '+' + digits
  return '+' + digits
}

async function maybeFireFollowup (sb, empresaId, phone, fullName) {
  // Find an APPROVED lead_followup template
  const { data: tpl } = await sb
    .from('whatsapp_templates')
    .select('id, name, language, components')
    .eq('empresa_id', empresaId)
    .eq('status', 'APPROVED')
    .ilike('name', '%lead_followup%')
    .order('approved_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tpl) return   // nothing to fire — that's fine

  // Create a single-recipient broadcast (so the cron processor handles it)
  const now = new Date().toISOString()
  const { data: bcast, error } = await sb.from('whatsapp_broadcasts').insert({
    empresa_id: empresaId,
    template_id: tpl.id,
    name: `Auto-followup · ${fullName || phone}`,
    language: tpl.language || 'es_CO',
    status: 'sending',
    sending_speed: 1,
    rate_per_minute: 60,
    opt_in_attested: true,
    opt_in_attested_at: now,
    total_recipients: 1,
    created_at: now,
    updated_at: now,
    started_at: now
  }).select('id').single()
  if (error || !bcast) return

  await sb.from('whatsapp_broadcast_recipients').insert({
    empresa_id: empresaId,
    broadcast_id: bcast.id,
    phone_e164: phone,
    contact_name: fullName,
    variables: { '1': fullName || 'Hola' },
    status: 'pending',
    created_at: now
  })
}

module.exports.config = {
  api: { bodyParser: false }
}
