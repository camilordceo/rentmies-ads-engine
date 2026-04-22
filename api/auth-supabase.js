/**
 * RENTMIES — Supabase Auth API
 *
 * GET  /api/auth-supabase?action=config   → returns { supabaseUrl, supabaseAnonKey }
 * POST /api/auth-supabase?action=signup   → { email, password, empresa_name } → creates user + empresa
 * POST /api/auth-supabase?action=signin   → { email, password } → returns session
 * POST /api/auth-supabase?action=signout  → { access_token } → signs out
 * GET  /api/auth-supabase?action=me       → Authorization: Bearer <token> → current user + empresa
 */

const { createClient } = require('@supabase/supabase-js')

function getAnonClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { action } = req.query

  // ── GET /api/auth-supabase?action=config ─────────────────────────────────
  if (action === 'config') {
    return res.json({
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
    })
  }

  // ── GET /api/auth-supabase?action=me ─────────────────────────────────────
  if (action === 'me' && req.method === 'GET') {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
    if (!token) return res.status(401).json({ error: 'No token provided' })

    const sb = getServiceClient()
    if (!sb) return res.status(503).json({ error: 'Auth service not configured' })

    try {
      const { data: { user }, error } = await sb.auth.getUser(token)
      if (error || !user) return res.status(401).json({ error: 'Token inválido o expirado' })

      // Fetch profile + empresa
      const { data: profile } = await sb.from('profiles').select('*, empresas(*)').eq('id', user.id).single()

      return res.json({ user: { id: user.id, email: user.email }, profile: profile || null })
    } catch (err) {
      console.error('[auth/me]', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── POST /api/auth-supabase?action=signup ────────────────────────────────
  if (action === 'signup' && req.method === 'POST') {
    const { email, password, empresa_name } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'email y password son requeridos' })

    const sbAnon = getAnonClient()
    const sbService = getServiceClient()
    if (!sbAnon) return res.status(503).json({ error: 'Supabase no configurado. Agrega SUPABASE_URL y SUPABASE_ANON_KEY.' })

    try {
      // 1. Create auth user
      const { data, error } = await sbAnon.auth.signUp({ email, password })
      if (error) return res.status(400).json({ error: error.message })

      const user = data.user
      if (!user) return res.status(400).json({ error: 'No se pudo crear el usuario' })

      // 2. Create empresa record (if service client available)
      if (sbService && empresa_name) {
        try {
          const { data: emp } = await sbService.from('empresas').insert({
            nombre: empresa_name,
            created_at: new Date().toISOString()
          }).select().single()

          if (emp) {
            // 3. Create profile linked to empresa
            await sbService.from('profiles').upsert({
              id: user.id,
              email,
              empresa_id: emp.id,
              rol: 'Admin',
              nombre: email.split('@')[0],
              activo: true,
              created_at: new Date().toISOString()
            })
          }
        } catch (e) {
          console.warn('[auth/signup] profile/empresa creation failed (non-fatal):', e.message)
        }
      }

      return res.json({
        user: { id: user.id, email: user.email },
        session: data.session,
        message: data.session ? 'Cuenta creada y sesión iniciada' : 'Cuenta creada. Revisa tu email para confirmar.'
      })
    } catch (err) {
      console.error('[auth/signup]', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── POST /api/auth-supabase?action=signin ────────────────────────────────
  if (action === 'signin' && req.method === 'POST') {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'email y password son requeridos' })

    const sbAnon = getAnonClient()
    if (!sbAnon) return res.status(503).json({ error: 'Supabase no configurado' })

    try {
      const { data, error } = await sbAnon.auth.signInWithPassword({ email, password })
      if (error) return res.status(401).json({ error: error.message })

      return res.json({ user: { id: data.user.id, email: data.user.email }, session: data.session })
    } catch (err) {
      console.error('[auth/signin]', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── POST /api/auth-supabase?action=signout ───────────────────────────────
  if (action === 'signout' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
    if (!token) return res.json({ success: true })

    const sbAnon = getAnonClient()
    if (sbAnon) {
      // Sign out server-side (best effort)
      try { await sbAnon.auth.admin?.signOut(token) } catch (_) {}
    }
    return res.json({ success: true })
  }

  return res.status(400).json({ error: 'Acción no válida. Usa: config, signup, signin, signout, me' })
}
