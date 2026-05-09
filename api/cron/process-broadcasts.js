/**
 * GET /api/cron/process-broadcasts
 *   Vercel cron job · runs every minute (configured in vercel.json).
 *
 *   Picks broadcasts in 'sending' state (or 'scheduled' with
 *   scheduled_at in the past) and sends a chunk of pending
 *   recipients via Meta Graph. Respects per-broadcast sending_speed.
 *
 *   Authorization: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`
 *   automatically. We verify against process.env.CRON_SECRET.
 *
 *   Per-invocation budget: max 50 messages total across broadcasts,
 *   to stay within Vercel's 60s timeout. Backs off exponentially on
 *   429. Marks broadcast 'completed' when all recipients are done.
 */

const axios = require('axios')
const { getServiceClient } = require('../_lib/auth')

const META_GRAPH = 'https://graph.facebook.com/v21.0'
const MAX_MESSAGES_PER_RUN = 50
const SAFE_BUDGET_MS = 50_000  // leave room before Vercel kills us

module.exports = async (req, res) => {
  // ── 1. Authenticate the cron request ─────────────────────
  const auth = req.headers.authorization || ''
  const expected = process.env.CRON_SECRET ? 'Bearer ' + process.env.CRON_SECRET : null
  if (expected && auth !== expected) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const startedAt = Date.now()
  const log = []
  let totalSent = 0
  let totalFailed = 0

  try {
    // ── 2. Promote scheduled broadcasts whose time has come ──
    const { data: dueScheduled } = await sb
      .from('whatsapp_broadcasts')
      .select('id, name')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
    if (dueScheduled && dueScheduled.length) {
      const ids = dueScheduled.map(b => b.id)
      await sb.from('whatsapp_broadcasts')
        .update({ status: 'sending', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .in('id', ids)
      log.push({ promoted: ids.length })
    }

    // ── 3. Pick active broadcasts ────────────────────────────
    const { data: active } = await sb
      .from('whatsapp_broadcasts')
      .select('id, empresa_id, template_id, name, language, sending_speed, media_url, media_handle, total_recipients, sent_count, failed_count, last_processor_run_at')
      .eq('status', 'sending')
      .order('started_at', { ascending: true })
      .limit(10)

    if (!active || active.length === 0) {
      return res.json({ ok: true, processed: 0, log, elapsed_ms: Date.now() - startedAt })
    }

    // ── 4. Process each broadcast until budget exhausted ────
    let budgetMessages = MAX_MESSAGES_PER_RUN
    for (const bcast of active) {
      if (Date.now() - startedAt > SAFE_BUDGET_MS) break
      if (budgetMessages <= 0) break

      const result = await processOneBroadcast(sb, bcast, budgetMessages, startedAt)
      totalSent += result.sent
      totalFailed += result.failed
      budgetMessages -= (result.sent + result.failed)
      log.push({ broadcast_id: bcast.id, name: bcast.name, sent: result.sent, failed: result.failed, completed: result.completed })

      // If completed, mark it
      if (result.completed) {
        await sb.from('whatsapp_broadcasts')
          .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', bcast.id)
      } else {
        // Mark heartbeat
        await sb.from('whatsapp_broadcasts')
          .update({ last_processor_run_at: new Date().toISOString() })
          .eq('id', bcast.id)
      }
    }

    return res.json({
      ok: true,
      sent: totalSent,
      failed: totalFailed,
      log,
      elapsed_ms: Date.now() - startedAt
    })
  } catch (err) {
    console.error('[cron-process-broadcasts]', err.message, err.stack)
    return res.status(500).json({ error: err.message, log, elapsed_ms: Date.now() - startedAt })
  }
}

// ── Process one broadcast ────────────────────────────────────
async function processOneBroadcast (sb, bcast, budget, startedAt) {
  // Resolve credentials for this empresa
  const { data: conn } = await sb
    .from('meta_connections')
    .select('long_lived_token, page_access_token, waba_id, whatsapp_phone_number_id, status')
    .eq('empresa_id', bcast.empresa_id)
    .maybeSingle()

  const token = conn?.page_access_token || conn?.long_lived_token || process.env.META_ACCESS_TOKEN
  const phoneNumberId = conn?.whatsapp_phone_number_id || process.env.META_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    // Mark broadcast as failed — credentials missing
    await sb.from('whatsapp_broadcasts')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', bcast.id)
    return { sent: 0, failed: 0, completed: false, error: 'no_credentials' }
  }

  // Resolve template (for name + language + components)
  const { data: tpl } = await sb
    .from('whatsapp_templates')
    .select('name, language, components, status')
    .eq('id', bcast.template_id)
    .maybeSingle()
  if (!tpl || (tpl.status || '').toUpperCase() !== 'APPROVED') {
    await sb.from('whatsapp_broadcasts')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', bcast.id)
    return { sent: 0, failed: 0, completed: false, error: 'template_not_approved' }
  }

  // Take a chunk of pending recipients
  const speedPerSec = Math.max(1, Math.min(10, bcast.sending_speed || 5))
  const intervalMs = Math.floor(1000 / speedPerSec)
  // Don't take more than we can send within remaining budget
  const remainingTime = SAFE_BUDGET_MS - (Date.now() - startedAt)
  const maxByTime = Math.floor(remainingTime / Math.max(intervalMs, 200))
  const chunkSize = Math.max(1, Math.min(budget, maxByTime, 50))

  const { data: recipients } = await sb
    .from('whatsapp_broadcast_recipients')
    .select('id, phone_e164, variables')
    .eq('broadcast_id', bcast.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(chunkSize)

  if (!recipients || recipients.length === 0) {
    // Check if anything is still in-flight
    const { count: stillPending } = await sb
      .from('whatsapp_broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', bcast.id)
      .in('status', ['pending', 'sending'])
    return { sent: 0, failed: 0, completed: !stillPending }
  }

  // Mark them as 'sending' so concurrent runs don't pick them up
  const ids = recipients.map(r => r.id)
  await sb.from('whatsapp_broadcast_recipients')
    .update({ status: 'sending' })
    .in('id', ids)

  let sent = 0
  let failed = 0
  let backoffMs = 0

  // Build the template payload once (variables substituted per recipient)
  const componentsTemplate = tpl.components || []

  for (const r of recipients) {
    if (Date.now() - startedAt > SAFE_BUDGET_MS) {
      // Out of time — return remaining to pending
      await sb.from('whatsapp_broadcast_recipients')
        .update({ status: 'pending' })
        .eq('id', r.id)
      continue
    }
    if (backoffMs > 0) {
      await new Promise(resolve => setTimeout(resolve, backoffMs))
      backoffMs = 0
    } else if (intervalMs > 50) {
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    const components = buildComponentsForRecipient(componentsTemplate, r.variables || {}, bcast)

    try {
      const { data } = await axios.post(
        `${META_GRAPH}/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: r.phone_e164.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: tpl.name,
            language: { code: tpl.language || 'es_CO' },
            components: components.length ? components : undefined
          }
        },
        { params: { access_token: token }, timeout: 8000, headers: { 'Content-Type': 'application/json' } }
      )
      const wamid = data?.messages?.[0]?.id || null
      await sb.from('whatsapp_broadcast_recipients')
        .update({ status: 'sent', sent_at: new Date().toISOString(), meta_wamid: wamid })
        .eq('id', r.id)
      sent++
    } catch (err) {
      const fb = err.response?.data?.error
      const status = err.response?.status
      if (status === 429) {
        // Rate limited — return remaining recipients to pending and back off
        backoffMs = Math.min(120_000, Math.max(30_000, backoffMs * 2 || 30_000))
        await sb.from('whatsapp_broadcast_recipients')
          .update({ status: 'pending' })
          .eq('id', r.id)
        // Skip remaining in this run
        const remaining = recipients.slice(recipients.indexOf(r) + 1)
        if (remaining.length) {
          await sb.from('whatsapp_broadcast_recipients')
            .update({ status: 'pending' })
            .in('id', remaining.map(x => x.id))
        }
        break
      }
      // Permanent error
      const errCode = fb?.code ? String(fb.code) : (status ? String(status) : 'unknown')
      const errMsg = fb?.message || err.message
      await sb.from('whatsapp_broadcast_recipients')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_code: errCode,
          error_message: errMsg
        })
        .eq('id', r.id)
      failed++
    }
  }

  // Roll up counters on the broadcast
  if (sent || failed) {
    await sb.rpc('rentmies_set_updated_at')   // optional; will fail silently
    const { data: counts } = await sb
      .from('whatsapp_broadcast_recipients')
      .select('status')
      .eq('broadcast_id', bcast.id)
    if (counts) {
      const c = { sent: 0, delivered: 0, read: 0, failed: 0, replied: 0, pending: 0 }
      for (const x of counts) {
        const s = (x.status || '').toLowerCase()
        if (c.hasOwnProperty(s)) c[s]++
      }
      const completed = c.pending === 0 && (c.sent + c.delivered + c.read + c.failed + c.replied) > 0
      await sb.from('whatsapp_broadcasts')
        .update({
          sent_count: c.sent + c.delivered + c.read,    // anything that left our system
          delivered_count: c.delivered + c.read,
          read_count: c.read,
          failed_count: c.failed,
          replied_count: c.replied,
          updated_at: new Date().toISOString()
        })
        .eq('id', bcast.id)
      return { sent, failed, completed }
    }
  }

  return { sent, failed, completed: false }
}

// ── Substitute variables for a single recipient ─────────────
function buildComponentsForRecipient (componentsTemplate, vars, bcast) {
  const out = []
  for (const c of componentsTemplate) {
    if (c.type === 'HEADER') {
      if (c.format === 'TEXT') {
        const headerVars = (c.text || '').match(/\{\{(\d+)\}\}/g) || []
        const params = headerVars.map(m => {
          const k = m.slice(2, -2)
          return { type: 'text', text: vars[k] || '' }
        })
        if (params.length) out.push({ type: 'header', parameters: params })
      } else if (['IMAGE','VIDEO','DOCUMENT'].includes(c.format)) {
        const link = bcast.media_url
        if (link) {
          out.push({
            type: 'header',
            parameters: [{
              type: c.format.toLowerCase(),
              [c.format.toLowerCase()]: { link }
            }]
          })
        }
      }
    } else if (c.type === 'BODY') {
      const bodyVars = (c.text || '').match(/\{\{(\d+)\}\}/g) || []
      const params = bodyVars.map(m => {
        const k = m.slice(2, -2)
        return { type: 'text', text: vars[k] || '' }
      })
      if (params.length) out.push({ type: 'body', parameters: params })
    } else if (c.type === 'BUTTONS') {
      // URL buttons can have a parameter for variable in URL
      const urlButtons = (c.buttons || []).filter(b => b.type === 'URL' && /\{\{1\}\}/.test(b.url || ''))
      urlButtons.forEach((_, i) => {
        out.push({
          type: 'button',
          sub_type: 'url',
          index: String(i),
          parameters: [{ type: 'text', text: vars['1'] || '' }]
        })
      })
    }
  }
  return out
}

// Vercel needs explicit timeout for cron
module.exports.config = {
  maxDuration: 60
}
