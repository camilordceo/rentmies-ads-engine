/**
 * Shared auth helpers for Rentmies API endpoints.
 * Vercel ignores files starting with `_` so this module is not
 * exposed as a function — it's just a CommonJS lib.
 *
 *   getServiceClient() → Supabase service-role client (or null if env missing)
 *   authedEmpresa(req, sb) → { empresaId, userId, demo? } or { error, status }
 *   cors(res) → sets the standard CORS headers used across endpoints
 *
 * The demo bypass exists so /app legacy callers and local dev without
 * auth can still hit endpoints — backend treats `Bearer demo_*` tokens
 * as a fallthrough, then reads x-empresa-id from headers.
 */

const { createClient } = require('@supabase/supabase-js')

function getServiceClient () {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function authedEmpresa (req, sb) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return { error: 'No token', status: 401 }
  if (token.startsWith('demo_')) {
    const empresaId = req.headers['x-empresa-id'] || 'demo'
    return { empresaId, userId: empresaId, demo: true }
  }
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data || !data.user) return { error: 'Token inválido', status: 401 }
  const { data: profile } = await sb.from('profiles').select('empresa_id').eq('id', data.user.id).maybeSingle()
  const empresaId = (profile && profile.empresa_id) || data.user.id
  return { empresaId, userId: data.user.id }
}

function cors (res, methods) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', methods || 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id, x-meta-token, x-waba-id, x-meta-page-id, x-meta-ig-user-id, x-meta-phone-number-id, x-meta-ad-account-id')
}

module.exports = { getServiceClient, authedEmpresa, cors }
