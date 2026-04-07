/**
 * RENTMIES — SUPABASE CLIENT
 * Singleton para usar en todas las funciones serverless de Vercel.
 * Usa service_role_key → bypasea RLS → solo en server, nunca en cliente.
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Operando sin DB.')
}

const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    })
  : null

module.exports = supabase
