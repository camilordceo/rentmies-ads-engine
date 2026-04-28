/**
 * GET  /api/wompi/subscription      → estado actual + plan + payment source
 * POST /api/wompi/subscription      → { action: 'cancel' } cancela al final del periodo
 *
 * Auth: Bearer token. Demo bypass para tokens 'demo_*'.
 */

const { createClient } = require('@supabase/supabase-js')
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase not configured' })

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  const empresaId = await resolveEmpresaId(sb, token)
  if (!empresaId) return res.status(401).json({ error: 'No autorizado' })

  if (req.method === 'GET') {
    try {
      const { data: sub } = await sb.from('subscriptions')
        .select('*')
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!sub) return res.json({ subscription: null, plan: null, usage: null })

      const plan = getPlan(sub.plan_code)

      // Usage del periodo actual
      const { data: usage } = await sb.from('usage_counters')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('subscription_id', sub.id)
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle()

      return res.json({ subscription: sub, plan, usage })
    } catch (err) {
      console.error('[wompi/subscription GET]', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method === 'POST') {
    let body = req.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
    body = body || {}

    if (body.action === 'cancel') {
      try {
        const { data: sub, error } = await sb.from('subscriptions')
          .update({
            cancel_at_period_end: true,
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('empresa_id', empresaId)
          .select('*')
          .single()
        if (error) throw new Error(error.message)
        return res.json({ ok: true, subscription: sub })
      } catch (err) {
        return res.status(500).json({ error: err.message })
      }
    }

    return res.status(400).json({ error: 'action no soportada' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
