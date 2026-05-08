/**
 * POST /api/wompi/checkout
 *
 * Suscribe (o renueva) a un plan. Flujo:
 *  1. Auth: lee Bearer token → empresa_id
 *  2. Recibe { plan_code, card_token, customer_email, session_id, acceptance_token, accept_personal_auth }
 *  3. Crea payment_source (CARD) con private key — guarda payment_source_id
 *  4. Si AVAILABLE → crea primer transaction usando el payment_source_id
 *  5. Upsert en subscriptions con status='pending' hasta que el webhook
 *     confirme APPROVED — ahí pasa a 'active' y se setea current_period_end
 *  6. Devuelve { transaction_id, status, subscription_id }
 *
 * El frontend (payment.html) ya tokenizó la tarjeta en Wompi con la public key
 * y obtuvo session_id de la JS lib anti-fraude.
 */

const { createClient } = require('@supabase/supabase-js')
const wompi = require('../../lib/wompi-client')
const cfg = require('../../lib/wompi-config')
const { getPlan } = require('../../lib/wompi-plans')

function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function resolveEmpresaId(sb, token) {
  if (!token) return null
  if (token.startsWith('demo_')) return 'demo'
  try {
    const { data: { user }, error } = await sb.auth.getUser(token)
    if (error || !user) return null
    const { data: profile } = await sb.from('profiles')
      .select('empresa_id')
      .eq('id', user.id)
      .maybeSingle()
    return profile && profile.empresa_id ? profile.empresa_id : user.id
  } catch (err) {
    return null
  }
}

function addOneMonth(date) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + 1)
  return d
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const missing = cfg.missingEnvVars()
  if (missing.length) return res.status(503).json({ error: 'Wompi not configured', missing })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase not configured' })

  // Auth
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  const empresaId = await resolveEmpresaId(sb, token)
  if (!empresaId) return res.status(401).json({ error: 'No autorizado' })

  // Body
  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  body = body || {}

  const {
    plan_code,
    card_token,
    customer_email,
    session_id,
    acceptance_token,
    accept_personal_auth
  } = body

  if (!plan_code) return res.status(400).json({ error: 'plan_code requerido' })
  if (!card_token) return res.status(400).json({ error: 'card_token requerido' })
  if (!customer_email) return res.status(400).json({ error: 'customer_email requerido' })
  if (!acceptance_token || !accept_personal_auth) {
    return res.status(400).json({ error: 'Tokens de aceptación requeridos (T&C + Habeas Data)' })
  }

  const plan = getPlan(plan_code)
  if (!plan) return res.status(400).json({ error: 'plan_code inválido' })

  try {
    // ── 1. Crear payment_source en Wompi ───────────────────────
    const ps = await wompi.createPaymentSourceCard({
      token: card_token,
      customerEmail: customer_email,
      acceptanceToken: acceptance_token,
      acceptPersonalAuth: accept_personal_auth,
      sessionId: session_id
    })
    if (!ps || !ps.id) {
      return res.status(502).json({ error: 'Wompi no devolvió payment_source', detail: ps })
    }
    if (ps.status !== 'AVAILABLE') {
      // Guardamos el intento fallido pero no cobramos
      return res.status(402).json({
        error: 'Tarjeta no disponible',
        payment_source_status: ps.status,
        detail: ps
      })
    }

    // Card metadata — Wompi devuelve last_four y brand en ps.public_data
    const cardMeta = ps.public_data || {}
    const cardBrand = cardMeta.brand || cardMeta.card_brand || null
    const cardLastFour = cardMeta.last_four || null

    // ── 2. Crear/actualizar subscriptions row ──────────────────
    const reference = wompi.generateReference({ planCode: plan.code, empresaId })
    const now = new Date()

    const subRow = {
      empresa_id: empresaId,
      plan_code: plan.code,
      plan_price_cop_cents: plan.price_cop_cents,
      plan_quotas: plan.quotas,
      status: 'pending',
      payment_source_id: ps.id,
      payment_source_card_brand: cardBrand,
      payment_source_last_four: cardLastFour,
      payment_source_status: ps.status,
      customer_email,
      updated_at: now.toISOString()
    }

    const { data: existing } = await sb.from('subscriptions')
      .select('id')
      .eq('empresa_id', empresaId)
      .maybeSingle()

    let subId
    if (existing && existing.id) {
      const { data: up, error: upErr } = await sb.from('subscriptions')
        .update(subRow)
        .eq('id', existing.id)
        .select('id')
        .single()
      if (upErr) throw new Error('subscriptions update: ' + upErr.message)
      subId = up.id
    } else {
      const { data: ins, error: insErr } = await sb.from('subscriptions')
        .insert({ ...subRow, created_at: now.toISOString() })
        .select('id')
        .single()
      if (insErr) throw new Error('subscriptions insert: ' + insErr.message)
      subId = ins.id
    }

    // ── 3. Cargar primer cobro contra el payment_source_id ─────
    const txRow = {
      empresa_id: empresaId,
      subscription_id: subId,
      reference,
      payment_source_id: ps.id,
      amount_in_cents: plan.price_cop_cents,
      currency: 'COP',
      plan_code: plan.code,
      customer_email,
      kind: 'initial',
      status: 'PENDING',
      payment_method_type: 'CARD',
      card_brand: cardBrand,
      card_last_four: cardLastFour
    }
    const { data: txInsert, error: txInsertErr } = await sb.from('wompi_transactions')
      .insert(txRow)
      .select('id')
      .single()
    if (txInsertErr) throw new Error('wompi_transactions insert: ' + txInsertErr.message)

    let wompiTx
    try {
      wompiTx = await wompi.createTransaction({
        amountCents: plan.price_cop_cents,
        currency: 'COP',
        customerEmail: customer_email,
        reference,
        paymentSourceId: ps.id,
        installments: 1,
        acceptanceToken: acceptance_token,
        acceptPersonalAuth: accept_personal_auth
      })
    } catch (chargeErr) {
      const detail = chargeErr.response && chargeErr.response.data ? chargeErr.response.data : chargeErr.message
      await sb.from('wompi_transactions').update({
        status: 'ERROR',
        status_message: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500),
        finalized_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', txInsert.id)
      return res.status(502).json({ error: 'Cobro rechazado por Wompi', detail })
    }

    // Update tx row con id de Wompi
    await sb.from('wompi_transactions').update({
      wompi_transaction_id: wompiTx.id,
      status: wompiTx.status,
      raw_event: wompiTx,
      updated_at: new Date().toISOString()
    }).eq('id', txInsert.id)

    // Si Wompi ya devolvió APPROVED, activamos sub al toque (el webhook
    // también lo hará pero nos adelantamos para mejor UX).
    if (wompiTx.status === 'APPROVED') {
      const periodEnd = addOneMonth(now)
      await sb.from('subscriptions').update({
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', subId)

      // Inicializar usage_counter del primer periodo
      await sb.from('usage_counters').upsert({
        empresa_id: empresaId,
        subscription_id: subId,
        period_start: now.toISOString(),
        period_end: periodEnd.toISOString(),
        posts_used: 0, images_used: 0, videos_used: 0
      }, { onConflict: 'empresa_id,period_start' })
    }

    return res.json({
      ok: true,
      transaction_id: wompiTx.id,
      status: wompiTx.status,
      subscription_id: subId,
      reference,
      next: wompiTx.status === 'APPROVED' ? '/welcome' : null
    })
  } catch (err) {
    console.error('[wompi/checkout]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
