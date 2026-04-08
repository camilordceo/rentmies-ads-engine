/**
 * RENTMIES — CHECKOUT API
 * POST /api/checkout
 *
 * Crea una sesión de pago para los planes de Rentmies.
 * Compatible con Stripe (internacional) y Wompi (Colombia).
 *
 * Body:
 *   plan_id   : string  ('30dias-basico', '30dias-estandar', '30dias-pro',
 *                         'pro-starter', 'pro-premium', 'nocomm')
 *   client_id : string  (UUID del cliente si ya existe)
 *   name      : string
 *   email     : string
 *   phone     : string
 *   success_url : string (override)
 *   cancel_url  : string (override)
 */

const supabase = require('../lib/supabase')

// ── Planes y precios ──────────────────────────────────────────────────────────
const PLANS = {
  '30dias-basico': {
    name: '30 Días Básico',
    price_cop: 89000,
    billing: 'monthly',
    description: '1 inmueble · 12 posts/mes · Instagram + Facebook',
  },
  '30dias-estandar': {
    name: '30 Días Estándar',
    price_cop: 199000,
    billing: 'monthly',
    description: '5 inmuebles · 20 posts/mes · Videos con IA · Reporte semanal',
  },
  '30dias-pro': {
    name: '30 Días Pro Agencia',
    price_cop: 399000,
    billing: 'monthly',
    description: '20 inmuebles · Posts diarios · Todas las plataformas + TikTok',
  },
  'pro-starter': {
    name: 'Rentmies Pro Starter',
    price_cop: 599000,
    billing: 'monthly',
    description: '3 proyectos · 30 posts/mes · 3 videos con IA · Meta Ads',
  },
  'pro-premium': {
    name: 'Rentmies Pro Premium',
    price_cop: 1200000,
    billing: 'monthly',
    description: 'Proyectos ilimitados · 80 posts/mes · $200k pauta incluida',
  },
  'nocomm': {
    name: 'Sin Comisión',
    price_cop: 149000,
    billing: 'onetime',
    description: '30 días de campaña completa · Página web del inmueble',
  },
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET /api/checkout?plan_id=X → returns plan info
  if (req.method === 'GET') {
    const { plan_id } = req.query
    if (plan_id && PLANS[plan_id]) {
      return res.status(200).json({ success: true, plan: { id: plan_id, ...PLANS[plan_id] } })
    }
    return res.status(200).json({ success: true, plans: PLANS })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    plan_id,
    client_id,
    name  = '',
    email = '',
    phone = '',
    success_url = process.env.APP_URL ? `${process.env.APP_URL}/gracias` : '/gracias',
    cancel_url  = process.env.APP_URL ? `${process.env.APP_URL}/#pricing` : '/#pricing',
  } = req.body || {}

  if (!plan_id || !PLANS[plan_id]) {
    return res.status(400).json({ error: `Plan inválido: ${plan_id}. Opciones: ${Object.keys(PLANS).join(', ')}` })
  }

  const plan = PLANS[plan_id]

  // ── Stripe integration ────────────────────────────────────────────────────
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      // Lazy-load stripe only when key is present
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Stripe = require('stripe')
      const stripe = Stripe(process.env.STRIPE_SECRET_KEY)

      const sessionParams = {
        payment_method_types: ['card'],
        mode: plan.billing === 'onetime' ? 'payment' : 'subscription',
        line_items: [{
          price_data: {
            currency: 'cop',
            unit_amount: plan.price_cop, // COP in cents (x100) — but COP has no cents, use actual value
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            ...(plan.billing !== 'onetime' && {
              recurring: { interval: 'month' },
            }),
          },
          quantity: 1,
        }],
        customer_email: email || undefined,
        metadata: {
          plan_id,
          client_id: client_id || '',
          name,
          phone,
        },
        success_url: `${success_url}?session_id={CHECKOUT_SESSION_ID}&plan=${plan_id}`,
        cancel_url,
      }

      const session = await stripe.checkout.sessions.create(sessionParams)

      // Save pending subscription to Supabase
      if (supabase && (client_id || email)) {
        await supabase.from('subscriptions').insert({
          client_id: client_id || null,
          plan_id,
          status: 'pending',
          payment_reference: session.id,
          amount_paid: plan.price_cop,
          created_at: new Date().toISOString(),
        }).select()
      }

      return res.status(200).json({
        success: true,
        checkout_url: session.url,
        session_id: session.id,
        plan: { id: plan_id, ...plan },
      })

    } catch (err) {
      console.error('[checkout] Stripe error:', err.message)
      return res.status(500).json({ error: `Error de pago: ${err.message}` })
    }
  }

  // ── Wompi integration (Colombia) ─────────────────────────────────────────
  if (process.env.WOMPI_PUBLIC_KEY) {
    const publicKey = process.env.WOMPI_PUBLIC_KEY
    const reference = `rentmies-${plan_id}-${Date.now()}`
    const amountInCents = plan.price_cop * 100 // Wompi uses cents

    // Wompi redirect URL
    const wompiUrl = `https://checkout.wompi.co/p/?public-key=${publicKey}&currency=COP&amount-in-cents=${amountInCents}&reference=${reference}&redirect-url=${encodeURIComponent(success_url)}`

    // Save pending to Supabase
    if (supabase) {
      await supabase.from('subscriptions').insert({
        client_id: client_id || null,
        plan_id,
        status: 'pending',
        payment_reference: reference,
        amount_paid: plan.price_cop,
        created_at: new Date().toISOString(),
      })
    }

    return res.status(200).json({
      success: true,
      checkout_url: wompiUrl,
      reference,
      plan: { id: plan_id, ...plan },
    })
  }

  // ── No payment provider configured — return link to WhatsApp ─────────────
  const waMsg = encodeURIComponent(
    `Hola Rentmies! Quiero contratar el plan ${plan.name} ($${plan.price_cop.toLocaleString('es-CO')} COP). Mi nombre: ${name}. WhatsApp: ${phone}`
  )
  const whatsappUrl = `https://wa.me/573001234567?text=${waMsg}`

  return res.status(200).json({
    success: true,
    checkout_url: whatsappUrl,
    fallback: true,
    message: 'Configura STRIPE_SECRET_KEY o WOMPI_PUBLIC_KEY para pagos automáticos. Por ahora se redirige a WhatsApp.',
    plan: { id: plan_id, ...plan },
  })
}
