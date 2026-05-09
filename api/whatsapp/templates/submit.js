/**
 * POST /api/whatsapp/templates/submit
 *   Submits the template to Meta Graph for approval.
 *
 *   1. Save / upsert draft into whatsapp_templates.
 *   2. POST /v21.0/{waba_id}/message_templates with components[].
 *   3. On Meta success: update row with meta_template_id +
 *      status='PENDING' + submitted_at.
 *   4. Return { id, meta_template_id, status, category } — UI bounces
 *      to the list view and waits for the webhook to flip status.
 *
 *   On Meta error (e.g. immediate rejection of a tag), capture the
 *   error code/message and surface it to the user without flipping
 *   the row state.
 */

const axios = require('axios')
const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')
const { buildComponents, buildVariablesSchema } = require('./_components-helper')

const META_GRAPH = 'https://graph.facebook.com/v21.0'

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

  // ── 1. Resolve credentials + waba ────────────────────────────
  let token = req.headers['x-meta-token'] || ''
  let wabaId = req.headers['x-waba-id'] || ''
  let metaConnId = null

  if (!token || !wabaId) {
    const { data: conn } = await sb
      .from('meta_connections')
      .select('id, page_access_token, long_lived_token, waba_id, status')
      .eq('empresa_id', auth.empresaId)
      .maybeSingle()
    if (conn && conn.status === 'active') {
      token = token || conn.page_access_token || conn.long_lived_token
      wabaId = wabaId || conn.waba_id
      metaConnId = conn.id
    }
  }
  if (!token) token = process.env.META_ACCESS_TOKEN || ''
  if (!wabaId) wabaId = process.env.META_WABA_ID || ''

  if (!token || !wabaId) {
    return res.status(400).json({
      error: 'Faltan credenciales',
      detail: 'WABA ID + access token requeridos. Configura WhatsApp en Settings.',
      step: 'auth'
    })
  }

  // ── 2. Save draft first (so we have a row even if Meta fails)
  const components = buildComponents(t)
  const variables_schema = buildVariablesSchema(t)
  const baseRow = {
    empresa_id: auth.empresaId,
    meta_connection_id: metaConnId,
    waba_id: wabaId,
    name: t.name,
    language: t.language || 'es_CO',
    category: t.category || 'UTILITY',
    components,
    variables_schema,
    updated_at: new Date().toISOString()
  }

  let templateRowId = t.id || null
  try {
    if (templateRowId) {
      const { data, error } = await sb.from('whatsapp_templates')
        .update({ ...baseRow, status: 'DRAFT' })
        .eq('id', templateRowId)
        .eq('empresa_id', auth.empresaId)
        .select('id').single()
      if (error) throw error
      templateRowId = data.id
    } else {
      const { data, error } = await sb.from('whatsapp_templates')
        .upsert({ ...baseRow, status: 'DRAFT', created_at: new Date().toISOString() }, { onConflict: 'empresa_id,waba_id,name,language' })
        .select('id').single()
      if (error) throw error
      templateRowId = data.id
    }
  } catch (err) {
    if (err.code === '42P01') return res.status(503).json({ error: 'Tablas no inicializadas', hint: 'Run schema-multichannel.sql + schema-whatsapp-bloque2.sql', step: 'pre_save' })
    return res.status(500).json({ error: err.message, step: 'pre_save' })
  }

  // ── 3. POST to Meta ──────────────────────────────────────────
  let metaResp
  try {
    const { data } = await axios.post(
      `${META_GRAPH}/${encodeURIComponent(wabaId)}/message_templates`,
      {
        name: baseRow.name,
        language: baseRow.language,
        category: baseRow.category,
        components
      },
      {
        params: { access_token: token },
        timeout: 20000,
        headers: { 'Content-Type': 'application/json' }
      }
    )
    metaResp = data
  } catch (err) {
    const fb = err.response && err.response.data && err.response.data.error
    // Meta rejected synchronously — record the reason on the draft row
    if (fb) {
      await sb.from('whatsapp_templates')
        .update({ rejection_reason: `[${fb.code}] ${fb.error_subcode || ''} ${fb.message}`, status: 'REJECTED', updated_at: new Date().toISOString() })
        .eq('id', templateRowId)
      return res.status(400).json({
        error: `[${fb.code}] ${fb.message}`,
        detail: fb.error_user_msg || fb.error_user_title || '',
        code: fb.code,
        step: 'meta_submit'
      })
    }
    return res.status(500).json({ error: err.message, step: 'meta_submit' })
  }

  // ── 4. Save Meta response back to row ────────────────────────
  const submittedAt = new Date().toISOString()
  await sb.from('whatsapp_templates')
    .update({
      meta_template_id: metaResp.id,
      status: (metaResp.status || 'PENDING').toUpperCase(),
      submitted_at: submittedAt,
      updated_at: submittedAt
    })
    .eq('id', templateRowId)

  return res.json({
    id: templateRowId,
    meta_template_id: metaResp.id,
    status: (metaResp.status || 'PENDING').toUpperCase(),
    category: metaResp.category
  })
}
