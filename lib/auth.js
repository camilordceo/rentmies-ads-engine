/**
 * RENTMIES — Middleware de autenticación
 *
 * Dos capas:
 *   1. API Key interna (x-api-key header o ?api_key=...) → para dashboard y crons internos
 *   2. Supabase JWT (Authorization: Bearer <token>) → para clientes
 *
 * Uso:
 *   const auth = await requireAuth(req, res)
 *   if (!auth) return  // ya respondió 401
 */

const supabase = require('./supabase')

async function requireAuth(req, res) {
  // Preflight CORS — sin auth requerida
  if (req.method === 'OPTIONS') return { authenticated: true, source: 'preflight' }

  // Capa 1: API key interna
  const apiKey = req.headers['x-api-key'] || req.query.api_key
  if (apiKey) {
    if (apiKey === process.env.RENTMIES_API_KEY) {
      return { authenticated: true, source: 'api_key' }
    }
    res.status(401).json({ error: 'API key inválida' })
    return null
  }

  // Capa 2: Supabase JWT
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Se requiere autenticación. Usa x-api-key o Authorization: Bearer <token>' })
    return null
  }

  if (!supabase) {
    res.status(401).json({ error: 'Servicio de autenticación no disponible' })
    return null
  }

  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    res.status(401).json({ error: 'Token inválido o expirado' })
    return null
  }

  return { authenticated: true, source: 'supabase', user }
}

module.exports = { requireAuth }
