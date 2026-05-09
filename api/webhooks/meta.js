/**
 * GET  /api/webhooks/meta?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 *      Meta webhook verification handshake. Returns hub.challenge if
 *      verify_token matches process.env.META_WEBHOOK_VERIFY_TOKEN.
 *
 * POST /api/webhooks/meta
 *      Inbound event payload. Verifies X-Hub-Signature-256 (HMAC-SHA256
 *      of raw body using META_APP_SECRET), then dispatches by field:
 *
 *        message_template_status_update — update whatsapp_templates row
 *        messages                       — message status updates (Step 19)
 *
 * IMPORTANT: this handler reads the RAW request body. Vercel's default
 * JSON body parser is disabled via `config.api.bodyParser = false` so
 * the HMAC signature stays valid.
 */

const crypto = require('crypto')
const { getServiceClient } = require('../_lib/auth')

module.exports = async (req, res) => {
  // CORS not relevant — Meta calls this server-to-server
  if (req.method === 'GET') return verifyHandshake(req, res)
  if (req.method !== 'POST') return res.status(405).end()

  // ── Read raw body for HMAC verification ───────────────────
  let rawBody
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    rawBody = Buffer.concat(chunks).toString('utf8')
  } catch (err) {
    return res.status(400).json({ error: 'Failed to read body' })
  }

  // ── Verify signature ──────────────────────────────────────
  const sigHeader = req.headers['x-hub-signature-256'] || req.headers['X-Hub-Signature-256']
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    console.warn('[meta-webhook] META_APP_SECRET not set — rejecting all POSTs')
    return res.status(503).json({ error: 'webhook not configured' })
  }
  if (!sigHeader) {
    console.warn('[meta-webhook] missing X-Hub-Signature-256')
    return res.status(401).json({ error: 'missing signature' })
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  // Constant-time comparison
  const sigBuf = Buffer.from(sigHeader)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn('[meta-webhook] signature mismatch')
    return res.status(401).json({ error: 'bad signature' })
  }

  // ── Parse + dispatch ──────────────────────────────────────
  let payload
  try { payload = JSON.parse(rawBody) }
  catch (err) { return res.status(400).json({ error: 'Invalid JSON' }) }

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const entries = Array.isArray(payload.entry) ? payload.entry : []
  let processed = 0

  for (const entry of entries) {
    const wabaId = String(entry.id || '')
    const changes = Array.isArray(entry.changes) ? entry.changes : []
    for (const change of changes) {
      try {
        if (change.field === 'message_template_status_update') {
          await handleTemplateStatus(sb, wabaId, change.value)
          processed++
        } else if (change.field === 'message_template_quality_update') {
          await handleTemplateQuality(sb, wabaId, change.value)
          processed++
        } else if (change.field === 'messages') {
          await handleMessages(sb, wabaId, change.value)
          processed++
        }
      } catch (err) {
        console.error('[meta-webhook] handler failed for', change.field, ':', err.message)
        // Don't fail the whole webhook — Meta retries non-200 responses,
        // and we don't want to be hammered for a single bad event.
      }
    }
  }

  return res.status(200).json({ ok: true, processed })
}

// ── GET: handshake ─────────────────────────────────────────
function verifyHandshake (req, res) {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && token === expected && challenge) {
    res.status(200).send(challenge)
    return
  }
  res.status(403).end()
}

// ── Template status update ─────────────────────────────────
async function handleTemplateStatus (sb, wabaId, value) {
  if (!value) return
  const metaTemplateId = value.message_template_id ? String(value.message_template_id) : null
  const name = value.message_template_name
  const language = value.message_template_language || 'es_CO'
  const event = (value.event || '').toUpperCase()
  const reason = value.reason || null
  const now = new Date().toISOString()

  if (!metaTemplateId && !name) return

  const updates = {
    status: event,
    updated_at: now
  }
  if (event === 'APPROVED') updates.approved_at = now
  if (event === 'REJECTED') updates.rejection_reason = reason
  if (['PAUSED', 'DISABLED', 'REJECTED'].includes(event)) updates.rejection_reason = reason

  // Prefer match by meta_template_id; fall back to name+language
  let q = sb.from('whatsapp_templates').update(updates)
  if (metaTemplateId) q = q.eq('meta_template_id', metaTemplateId)
  else q = q.eq('name', name).eq('language', language).eq('waba_id', wabaId)

  await q
}

async function handleTemplateQuality (sb, wabaId, value) {
  if (!value) return
  const metaTemplateId = value.message_template_id ? String(value.message_template_id) : null
  const name = value.message_template_name
  const language = value.message_template_language || 'es_CO'
  const newQuality = (value.new_quality_score || value.quality_score || '').toUpperCase() || null
  if (!newQuality) return
  const updates = { quality_score: newQuality, updated_at: new Date().toISOString() }
  let q = sb.from('whatsapp_templates').update(updates)
  if (metaTemplateId) q = q.eq('meta_template_id', metaTemplateId)
  else q = q.eq('name', name).eq('language', language).eq('waba_id', wabaId)
  await q
}

// ── Messages: delivery + read receipts (Step 19) ───────────
async function handleMessages (sb, wabaId, value) {
  if (!value) return
  const statuses = Array.isArray(value.statuses) ? value.statuses : []
  for (const s of statuses) {
    const wamid = s.id
    const status = (s.status || '').toUpperCase()  // sent | delivered | read | failed
    const ts = s.timestamp ? new Date(parseInt(s.timestamp, 10) * 1000).toISOString() : new Date().toISOString()
    const errorCode = s.errors?.[0]?.code ? String(s.errors[0].code) : null
    const errorMessage = s.errors?.[0]?.title || s.errors?.[0]?.message || null

    const updates = { status: dbStatusFromMeta(status), updated_at: ts }
    if (status === 'SENT')      updates.sent_at = ts
    if (status === 'DELIVERED') updates.delivered_at = ts
    if (status === 'READ')      updates.read_at = ts
    if (status === 'FAILED')    { updates.failed_at = ts; updates.error_code = errorCode; updates.error_message = errorMessage }

    // Update the recipient row if we know about it
    const { data: recipient } = await sb
      .from('whatsapp_broadcast_recipients')
      .update(updates)
      .eq('meta_wamid', wamid)
      .select('id, broadcast_id')
      .maybeSingle()

    // Roll up counts on the broadcast
    if (recipient && recipient.broadcast_id) {
      await rollUpBroadcastCounts(sb, recipient.broadcast_id)
    }
  }
}

function dbStatusFromMeta (s) {
  if (s === 'SENT')      return 'sent'
  if (s === 'DELIVERED') return 'delivered'
  if (s === 'READ')      return 'read'
  if (s === 'FAILED')    return 'failed'
  return 'pending'
}

async function rollUpBroadcastCounts (sb, broadcastId) {
  // Recompute counts from recipient table (cheap because broadcast lifetime is short)
  const { data: rows } = await sb
    .from('whatsapp_broadcast_recipients')
    .select('status')
    .eq('broadcast_id', broadcastId)
  if (!rows) return
  const c = { sent: 0, delivered: 0, read: 0, failed: 0, replied: 0 }
  for (const r of rows) {
    const s = (r.status || '').toLowerCase()
    if (s === 'sent') c.sent++
    if (s === 'delivered') c.delivered++
    if (s === 'read') c.read++
    if (s === 'failed') c.failed++
    if (s === 'replied') c.replied++
  }
  await sb.from('whatsapp_broadcasts')
    .update({
      sent_count: c.sent,
      delivered_count: c.delivered,
      read_count: c.read,
      failed_count: c.failed,
      replied_count: c.replied,
      updated_at: new Date().toISOString()
    })
    .eq('id', broadcastId)
}

// Disable Vercel's default body parser so we can verify the signature
// against the raw request bytes (Meta's HMAC requires byte-exact body).
module.exports.config = {
  api: { bodyParser: false }
}
