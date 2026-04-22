/**
 * RENTMIES — Health Check
 * GET /api/health
 * Returns environment status and DB connectivity
 */

const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const env = {
    supabase: !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)),
    supabase_anon: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    google_ai: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
    meta: !!(process.env.META_APP_ID || process.env.META_ACCESS_TOKEN)
  }

  let database = 'not_configured'

  if (env.supabase) {
    try {
      const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
      const sb = createClient(process.env.SUPABASE_URL, key, { auth: { persistSession: false } })
      const { error } = await sb.from('empresas').select('id').limit(1)
      database = error ? `error: ${error.message}` : 'connected'
    } catch (err) {
      database = `error: ${err.message}`
    }
  }

  const ok = env.supabase && database === 'connected'

  return res.status(ok ? 200 : 503).json({
    ok,
    version: '1.1.0',
    env,
    database,
    timestamp: new Date().toISOString()
  })
}
