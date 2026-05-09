/**
 * POST /api/whatsapp/templates/save
 *   Upserts a draft template into whatsapp_templates without
 *   submitting to Meta. Used by the editor's "Guardar borrador"
 *   button so the user can pause and come back.
 *
 * Body (matches editor state shape):
 *   {
 *     id?: uuid,
 *     name, category, language,
 *     header: { type, text?, examples?, media_url?, media_kind? },
 *     body, footer,
 *     buttons: [{ type, text, url?, phone_number?, example? }],
 *     examples: { '1': '...', '2': '...' }
 *   }
 *
 * Response: { id, status: 'DRAFT' }
 */

const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')
const { buildComponents, buildVariablesSchema } = require('./_components-helper')

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const t = req.body || {}
  if (!t.name || !t.body) return res.status(400).json({ error: 'name y body son requeridos' })

  // ── Resolve waba_id from meta_connections (or env fallback)
  let wabaId = ''
  const { data: conn } = await sb
    .from('meta_connections')
    .select('id, waba_id, status')
    .eq('empresa_id', auth.empresaId)
    .maybeSingle()
  if (conn && conn.waba_id) wabaId = conn.waba_id
  else wabaId = process.env.META_WABA_ID || 'pending'

  const components = buildComponents(t)
  const variables_schema = buildVariablesSchema(t)

  const row = {
    empresa_id: auth.empresaId,
    meta_connection_id: conn?.id || null,
    waba_id: wabaId,
    name: t.name,
    language: t.language || 'es_CO',
    category: t.category || 'UTILITY',
    status: 'DRAFT',
    components,
    variables_schema,
    notes: t.notes || null,
    updated_at: new Date().toISOString()
  }

  try {
    let result
    if (t.id) {
      // Update existing draft
      const { data, error } = await sb
        .from('whatsapp_templates')
        .update(row)
        .eq('id', t.id)
        .eq('empresa_id', auth.empresaId)
        .select('id, status')
        .single()
      if (error) throw error
      result = data
    } else {
      // Insert (avoid duplicate by upsert on the unique key)
      const { data, error } = await sb
        .from('whatsapp_templates')
        .upsert({ ...row, created_at: new Date().toISOString() }, { onConflict: 'empresa_id,waba_id,name,language' })
        .select('id, status')
        .single()
      if (error) throw error
      result = data
    }
    return res.json({ id: result.id, status: result.status })
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ error: 'Tablas no inicializadas', hint: 'Run schema-multichannel.sql + schema-whatsapp-bloque2.sql' })
    return res.status(500).json({ error: err.message })
  }
}
