/**
 * POST /api/onboarding/select-page
 *   Authorization: Bearer <supabase_jwt>
 *   body: { page_id }
 *
 * Updates the meta_connections row with the chosen Page (and its linked
 * Instagram Business account) and flips status to 'active'. Returns the
 * shape that the frontend writes into localStorage.meta_creds so /app and
 * /dashboard immediately recognize the connection.
 */

const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')
const meta = require('../../lib/meta-config')

function getServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  // ── Auth ──
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return res.status(401).json({ error: 'No token' })
  const { data: userData, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !userData || !userData.user) return res.status(401).json({ error: 'Token inválido' })

  const { data: profile } = await sb.from('profiles').select('empresa_id').eq('id', userData.user.id).maybeSingle()
  if (!profile || !profile.empresa_id) return res.status(400).json({ error: 'Perfil sin empresa_id' })
  const empresaId = profile.empresa_id

  const { page_id } = req.body || {}
  if (!page_id) return res.status(400).json({ error: 'page_id requerido' })

  // ── Load existing connection + find the chosen page in available_pages ──
  const { data: conn, error: connErr } = await sb.from('meta_connections')
    .select('*')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (connErr) return res.status(500).json({ error: connErr.message })
  if (!conn) return res.status(404).json({ error: 'Sin conexión Meta — empieza desde /signup' })

  const chosen = (conn.available_pages || []).find(p => p.id === page_id)
  if (!chosen) return res.status(400).json({ error: 'Esa página no está en tus available_pages' })

  // ── Refresh page-level access_token from Graph (page tokens don't expire by default) ──
  let pageAccessToken = null
  let pageTasks = chosen.tasks || []
  try {
    const r = await axios.get(`${meta.GRAPH_BASE_URL}/${page_id}`, {
      params: {
        fields: 'access_token,tasks',
        access_token: conn.long_lived_token
      },
      timeout: 10000
    })
    pageAccessToken = r.data.access_token || null
    if (r.data.tasks) pageTasks = r.data.tasks
  } catch (err) {
    console.warn('[select-page] could not fetch page access_token:', err.message)
  }

  // ── Refresh IG details (in case follower count is stale) ──
  let igEnriched = null
  if (chosen.ig_id) {
    try {
      const r = await axios.get(`${meta.GRAPH_BASE_URL}/${chosen.ig_id}`, {
        params: {
          fields: 'username,profile_picture_url,followers_count,follows_count,media_count',
          access_token: conn.long_lived_token
        },
        timeout: 10000
      })
      igEnriched = r.data
    } catch (err) {
      console.warn('[select-page] IG fetch failed:', err.message)
    }
  }

  // ── Persist selection ──
  const update = {
    page_id: chosen.id,
    page_name: chosen.name,
    page_picture_url: chosen.picture || null,
    page_category: chosen.category || null,
    page_followers_count: chosen.fan_count || null,
    page_access_token: pageAccessToken,
    page_tasks: pageTasks,
    ig_business_id: chosen.ig_id || null,
    ig_username: (igEnriched && igEnriched.username) || chosen.ig_username || null,
    ig_profile_picture_url: (igEnriched && igEnriched.profile_picture_url) || chosen.ig_picture || null,
    ig_followers_count: (igEnriched && igEnriched.followers_count) || chosen.ig_followers || null,
    status: 'active',
    last_error: null,
    updated_at: new Date().toISOString()
  }

  const { error: upErr } = await sb.from('meta_connections')
    .update(update)
    .eq('empresa_id', empresaId)
  if (upErr) return res.status(500).json({ error: upErr.message })

  // ── Build the localStorage.meta_creds shape that /app and /dashboard expect ──
  const meta_creds = {
    access_token: conn.long_lived_token,
    page_id: chosen.id,
    ad_account_id: '',
    ig_user_id: chosen.ig_id || '',
    waba_id: conn.waba_id || '',
    phone_number_id: conn.whatsapp_phone_number_id || ''
  }

  return res.json({
    success: true,
    page: { id: chosen.id, name: chosen.name, ig_username: igEnriched ? igEnriched.username : chosen.ig_username },
    meta_creds
  })
}
