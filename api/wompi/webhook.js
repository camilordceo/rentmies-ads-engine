/**
 * POST /api/wompi/webhook
 *
 * Recibe eventos de Wompi (transaction.updated, payment_source.created).
 * Verifica signature → upsert en wompi_transactions → si APPROVED y es
 * un cobro de subscription, marca la sub como active y reset usage counters.
 *
 * IMPORTANTE: Wompi reintenta si no devolvemos 200, así que respondemos
 * 200 incluso ante errores no críticos para evitar storms — pero logueamos.
 */

const { createClient } = require('@supabase/supabase-js')
const wompi = require('../../lib/wompi-client')
const cfg = require('../../lib/wompi-config')

function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function addOneMonth(date) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1)
  return d
}

module.exports = async (req, res) => {
  // No CORS — Wompi servidor a servidor
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let event = req.body
  if (typeof event === 'string') { try { event = JSON.parse(event) } catch { event = {} } }
  if (!event || !event.event) return res.status(400).json({ error: 'Invalid event' })

  // Verificar firma
  if (!wompi.verifyWebhook(event)) {
    console.warn('[wompi/webhook] Invalid signature for event', event.event)
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const sb = getServiceClient()
  if (!sb) {
    console.error('[wompi/webhook] Supabase not configured — event ignored')
    return res.status(200).json({ ok: true, ignored: 'no_supabase' })
  }

  try {
    if (event.event === 'transaction.updated') {
      const tx = event.data && event.data.transaction
      if (!tx || !tx.reference) return res.status(200).json({ ok: true, ignored: 'no_tx' })

      const cardBrand = (tx.payment_method && tx.payment_method.extra && tx.payment_method.extra.brand) || null
      const cardLastFour = (tx.payment_method && tx.payment_method.extra && tx.payment_method.extra.last_four) || null

      // Update por reference (single source of truth)
      const { data: row, error: selErr } = await sb.from('wompi_transactions')
        .select('id, empresa_id, subscription_id, kind, status')
        .eq('reference', tx.reference)
        .maybeSingle()

      if (selErr) {
        console.error('[wompi/webhook] select error', selErr.message)
        return res.status(200).json({ ok: true, ignored: 'select_error' })
      }

      if (!row) {
        // Transacción que no creamos nosotros (ej. test desde Wompi dashboard)
        console.warn('[wompi/webhook] Unknown reference', tx.reference)
        return res.status(200).json({ ok: true, ignored: 'unknown_reference' })
      }

      // Idempotencia: si ya está APPROVED no re-aplicamos lógica de activación
      const wasApproved = row.status === 'APPROVED'

      await sb.from('wompi_transactions').update({
        wompi_transaction_id: tx.id,
        status: tx.status,
        status_message: tx.status_message || null,
        payment_method_type: tx.payment_method_type || null,
        card_brand: cardBrand,
        card_last_four: cardLastFour,
        finalized_at: tx.finalized_at || new Date().toISOString(),
        raw_event: event,
        updated_at: new Date().toISOString()
      }).eq('id', row.id)

      // Lógica de subscription según resultado
      if (tx.status === 'APPROVED' && !wasApproved && row.subscription_id) {
        const now = new Date()
        const periodEnd = addOneMonth(now)

        if (row.kind === 'initial' || row.kind === 'one_time') {
          await sb.from('subscriptions').update({
            status: 'active',
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
            last_renewal_attempt_at: now.toISOString(),
            last_renewal_error: null,
            updated_at: now.toISOString()
          }).eq('id', row.subscription_id)
        } else if (row.kind === 'renewal') {
          // Renovación: extender periodo desde el current_period_end actual
          const { data: sub } = await sb.from('subscriptions')
            .select('current_period_end')
            .eq('id', row.subscription_id)
            .maybeSingle()
          const base = sub && sub.current_period_end ? new Date(sub.current_period_end) : now
          const newEnd = addOneMonth(base)
          await sb.from('subscriptions').update({
            status: 'active',
            current_period_start: base.toISOString(),
            current_period_end: newEnd.toISOString(),
            last_renewal_attempt_at: now.toISOString(),
            last_renewal_error: null,
            updated_at: now.toISOString()
          }).eq('id', row.subscription_id)
        }

        // Reset usage counter del nuevo periodo
        await sb.from('usage_counters').upsert({
          empresa_id: row.empresa_id,
          subscription_id: row.subscription_id,
          period_start: now.toISOString(),
          period_end: periodEnd.toISOString(),
          posts_used: 0, images_used: 0, videos_used: 0,
          updated_at: now.toISOString()
        }, { onConflict: 'empresa_id,period_start' })
      } else if ((tx.status === 'DECLINED' || tx.status === 'ERROR') && row.subscription_id) {
        await sb.from('subscriptions').update({
          status: row.kind === 'renewal' ? 'past_due' : 'pending',
          last_renewal_attempt_at: new Date().toISOString(),
          last_renewal_error: tx.status_message || tx.status,
          updated_at: new Date().toISOString()
        }).eq('id', row.subscription_id)
      }
    }
    // payment_source.created — informativo, ya lo creamos en checkout.
    // Lo logueamos pero no requiere acción.

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[wompi/webhook]', err.message, err.stack)
    // Devolvemos 200 igual para que Wompi no reintente eternamente; ya quedó en logs
    return res.status(200).json({ ok: true, error: err.message })
  }
}

// Wompi puede mandar payloads con ~5KB — el body parser default es OK
module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } }
