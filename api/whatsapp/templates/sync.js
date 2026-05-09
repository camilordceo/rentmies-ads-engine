/**
 * POST /api/whatsapp/templates/sync
 *   Pulls the latest message templates from Meta Graph and upserts
 *   them into whatsapp_templates. Match key: (empresa_id, name,
 *   language). Updates: status, rejection_reason, components,
 *   quality_score, meta_template_id, last_synced_at.
 *
 *   Response: { synced: N, templates: [...new full list...], synced_at: ISO }
 *
 * Credentials priority for the Graph call:
 *   1. Meta connection in DB (preferred, includes WABA ID)
 *   2. Headers x-meta-token + x-waba-id (legacy)
 *   3. Env METAACCESS_TOKEN + META_WABA_ID (server-side fallback)
 */

const axios = require('axios')
const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')

const META_GRAPH = 'https://graph.facebook.com/v21.0'

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  // ── 1. Resolve credentials ───────────────────────────────────
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
      detail: 'No encontré WABA ID + access token. Configura WhatsApp en Settings.',
      hint: 'Settings → WhatsApp Business → pega WABA ID'
    })
  }

  // ── 2. Fetch from Meta Graph ─────────────────────────────────
  let metaTemplates = []
  try {
    const { data } = await axios.get(`${META_GRAPH}/${encodeURIComponent(wabaId)}/message_templates`, {
      params: {
        access_token: token,
        fields: 'name,status,category,language,quality_score,components,id,rejected_reason',
        limit: 200
      },
      timeout: 20000
    })
    metaTemplates = data.data || []
  } catch (err) {
    const fb = err.response && err.response.data && err.response.data.error
    if (fb) return res.status(400).json({ error: `[${fb.code}] ${fb.message}`, code: fb.code, step: 'graph_fetch' })
    return res.status(500).json({ error: err.message, step: 'graph_fetch' })
  }

  // ── 3. Upsert each template into DB ──────────────────────────
  const syncedAt = new Date().toISOString()
  let upsertCount = 0

  // Try the table; if it doesn't exist, fail loudly with a hint
  for (const t of metaTemplates) {
    const row = {
      empresa_id: auth.empresaId,
      meta_connection_id: metaConnId,
      meta_template_id: t.id || null,
      waba_id: wabaId,
      name: t.name,
      language: t.language || 'es',
      category: t.category || 'UTILITY',
      status: (t.status || 'DRAFT').toUpperCase(),
      rejection_reason: t.rejected_reason || null,
      components: t.components || [],
      quality_score: (t.quality_score && t.quality_score.score) || t.quality_score || null,
      last_synced_at: syncedAt,
      updated_at: syncedAt
    }
    if (row.status === 'APPROVED' && !row.approved_at) row.approved_at = syncedAt

    const { error } = await sb
      .from('whatsapp_templates')
      .upsert(row, { onConflict: 'empresa_id,waba_id,name,language' })

    if (error) {
      if (error.code === '42P01') {
        return res.status(503).json({
          error: 'Tabla whatsapp_templates no existe',
          hint: 'Run supabase/schema-multichannel.sql + schema-whatsapp-bloque2.sql',
          step: 'db_upsert'
        })
      }
      // Don't 500 the whole sync — log and keep going
      console.warn('[wa-sync] upsert failed for', t.name, ':', error.message)
      continue
    }
    upsertCount++
  }

  // ── 4. Return the fresh list from DB ─────────────────────────
  const { data: list } = await sb
    .from('whatsapp_templates')
    .select('id, meta_template_id, name, language, category, status, rejection_reason, components, quality_score, sent_count, delivered_count, read_count, notes, preview_image_url, created_at, updated_at, submitted_at, approved_at, last_synced_at')
    .eq('empresa_id', auth.empresaId)
    .order('updated_at', { ascending: false })

  return res.json({
    synced: upsertCount,
    received: metaTemplates.length,
    templates: list || [],
    synced_at: syncedAt
  })
}
