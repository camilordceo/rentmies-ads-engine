/**
 * RENTMIES — Campaigns API
 *
 *   POST /api/campaigns?action=create   { ...campaign payload } → { id, persisted }
 *   GET  /api/campaigns?action=list                              → { campaigns: [] }
 *   GET  /api/campaigns?action=ai-logs                           → { logs: [] }
 *
 * Persistence: requires a Supabase table `ad_campaigns`. If the table
 * doesn't exist, the endpoint returns 501 with a clear error pointing
 * at docs/supabase-schema.sql so the user can provision it. The frontend
 * (persist.js) already falls back to localStorage so drafts never get
 * lost.
 */

const { createClient } = require('@supabase/supabase-js')

function getSupabaseService() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = (req.query.action || '').toString()
  const empresaId = req.headers['x-empresa-id'] || (req.body && req.body.empresa_id) || 'demo'

  const sb = getSupabaseService()
  if (!sb) {
    return res.status(503).json({
      error: 'Supabase no configurado',
      detail: 'Define SUPABASE_URL y SUPABASE_SERVICE_KEY en Vercel para persistir campañas en servidor. La UI sigue funcionando contra localStorage.'
    })
  }

  try {
    if (action === 'create' && req.method === 'POST') {
      const body = req.body || {}
      // Lightweight validation
      if (!body.name) return res.status(400).json({ error: 'name es requerido' })

      const row = {
        empresa_id: empresaId,
        name: body.name,
        status: body.status || 'draft',
        ciudad: body.ciudad || null,
        tipo_inmueble: body.tipo_inmueble || null,
        prompt_config: body.prompt_config || {},
        platforms: body.platforms || [],
        budget: body.budget || {},
        schedule: body.schedule || {},
        source: body.source || 'creative_studio',
        created_at: new Date().toISOString()
      }

      const { data, error } = await sb.from('ad_campaigns').insert(row).select('id').single()
      if (error) {
        // Most common case: table doesn't exist yet
        if (/does not exist|not found/i.test(error.message || '')) {
          return res.status(501).json({
            error: 'Tabla ad_campaigns no existe',
            detail: 'Crea la tabla siguiendo docs/supabase-schema.sql y vuelve a intentar.',
            schema_hint: 'ad_campaigns(id uuid pk, empresa_id text, name text, status text, ciudad text, tipo_inmueble text, prompt_config jsonb, platforms jsonb, budget jsonb, schedule jsonb, source text, created_at timestamptz)'
          })
        }
        return res.status(500).json({ error: 'Insert falló', detail: error.message })
      }
      return res.json({ id: data.id, persisted: 'server' })
    }

    if (action === 'list' && req.method === 'GET') {
      const { data, error } = await sb
        .from('ad_campaigns')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) {
        if (/does not exist|not found/i.test(error.message || '')) {
          return res.json({ campaigns: [], warning: 'Tabla ad_campaigns no existe — usa drafts locales' })
        }
        return res.status(500).json({ error: error.message })
      }
      return res.json({ campaigns: data || [] })
    }

    if (action === 'ai-logs' && req.method === 'GET') {
      const { data, error } = await sb
        .from('ad_ai_logs')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) {
        if (/does not exist|not found/i.test(error.message || '')) {
          return res.json({ logs: [], warning: 'Tabla ad_ai_logs no existe — usando datos de ejemplo en UI' })
        }
        return res.status(500).json({ error: error.message })
      }
      return res.json({ logs: data || [] })
    }

    return res.status(400).json({ error: `Acción no válida: '${action}'. Usa create | list | ai-logs` })
  } catch (err) {
    console.error('[campaigns]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
