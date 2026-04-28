/**
 * Cron diario que renueva subscriptions vencidas o por vencer.
 *
 * Ejecutado por Vercel cron (ver vercel.json) — POST /api/cron-renew-subscriptions.
 * Lógica:
 *   1. Lee la vista `subscriptions_due_for_renewal` (active|past_due, sin cancel,
 *      con payment_source_id, vencen en <24h).
 *   2. Para cada una: re-fetch acceptance tokens, crea transaction recurring
 *      (kind='renewal') con el payment_source_id guardado (3RI auto).
 *   3. Inserta wompi_transactions row con status PENDING.
 *   4. Si Wompi devuelve APPROVED inmediato → activa periodo (también lo hace
 *      el webhook). Si DECLINED/ERROR → sub queda 'past_due', counter de error.
 */

const { createClient } = require('@supabase/supabase-js')
const wompi = require('../lib/wompi-client')
const cfg = require('../lib/wompi-config')
const { getPlan } = require('../lib/wompi-plans')

function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

module.exports = async (req, res) => {
  // Vercel cron manda GET por default; aceptamos ambos.
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Mismo guard que cron-refresh-tokens.js — opcional, activable con CRON_SECRET.
  const expected = process.env.CRON_SECRET
  if (expected) {
    const got = req.headers.authorization || req.query.secret || ''
    if (got !== `Bearer ${expected}` && got !== expected) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const missing = cfg.missingEnvVars()
  if (missing.length) return res.status(503).json({ error: 'Wompi not configured', missing })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase not configured' })

  let acceptance
  try {
    acceptance = await wompi.fetchAcceptanceTokens()
  } catch (err) {
    return res.status(502).json({ error: 'No pudimos refrescar acceptance tokens', detail: err.message })
  }

  const { data: due, error } = await sb.from('subscriptions_due_for_renewal').select('*')
  if (error) return res.status(500).json({ error: error.message })
  if (!due || !due.length) return res.json({ ok: true, processed: 0 })

  const results = []
  for (const sub of due) {
    const plan = getPlan(sub.plan_code)
    const amountCents = (plan && plan.price_cop_cents) || sub.plan_price_cop_cents
    if (!amountCents) {
      results.push({ id: sub.id, skipped: 'no_amount' })
      continue
    }

    const reference = wompi.generateReference({ planCode: sub.plan_code, empresaId: sub.empresa_id })

    // Insert pending tx primero (idempotencia: si ya hay una tx PENDING reciente,
    // no creamos otra)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: recent } = await sb.from('wompi_transactions')
      .select('id, status')
      .eq('subscription_id', sub.id)
      .eq('kind', 'renewal')
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(1)

    if (recent && recent.length && recent[0].status === 'PENDING') {
      results.push({ id: sub.id, skipped: 'pending_exists' })
      continue
    }

    const { data: txInsert, error: txInsertErr } = await sb.from('wompi_transactions').insert({
      empresa_id: sub.empresa_id,
      subscription_id: sub.id,
      reference,
      payment_source_id: sub.payment_source_id,
      amount_in_cents: amountCents,
      currency: 'COP',
      plan_code: sub.plan_code,
      customer_email: sub.customer_email,
      kind: 'renewal',
      status: 'PENDING',
      payment_method_type: 'CARD'
    }).select('id').single()

    if (txInsertErr) {
      results.push({ id: sub.id, error: 'tx_insert: ' + txInsertErr.message })
      continue
    }

    try {
      const tx = await wompi.createTransaction({
        amountCents,
        currency: 'COP',
        customerEmail: sub.customer_email,
        reference,
        paymentSourceId: sub.payment_source_id,
        installments: 1,
        acceptanceToken: acceptance.acceptance_token,
        acceptPersonalAuth: acceptance.accept_personal_auth
      })

      await sb.from('wompi_transactions').update({
        wompi_transaction_id: tx.id,
        status: tx.status,
        raw_event: tx,
        updated_at: new Date().toISOString()
      }).eq('id', txInsert.id)

      await sb.from('subscriptions').update({
        last_renewal_attempt_at: new Date().toISOString(),
        last_renewal_error: tx.status === 'APPROVED' ? null : (tx.status_message || tx.status),
        updated_at: new Date().toISOString()
      }).eq('id', sub.id)

      results.push({ id: sub.id, tx_id: tx.id, status: tx.status })
    } catch (chargeErr) {
      const detail = chargeErr.response && chargeErr.response.data
        ? JSON.stringify(chargeErr.response.data).slice(0, 500)
        : chargeErr.message
      await sb.from('wompi_transactions').update({
        status: 'ERROR',
        status_message: detail,
        finalized_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', txInsert.id)
      await sb.from('subscriptions').update({
        status: 'past_due',
        last_renewal_attempt_at: new Date().toISOString(),
        last_renewal_error: detail,
        updated_at: new Date().toISOString()
      }).eq('id', sub.id)
      results.push({ id: sub.id, error: detail })
    }
  }

  return res.json({ ok: true, processed: results.length, results })
}
