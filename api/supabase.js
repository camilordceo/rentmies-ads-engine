/**
 * RENTMIES ADS ENGINE — SUPABASE API LAYER
 * All database operations go through here.
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

let supabase = null

function getClient() {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  }
  return supabase
}

// ── Helpers ──────────────────────────────────────────────────
function logErr(fn, err) {
  console.error(`[supabase] ${fn}:`, err?.message || err)
}

// ══════════════════════════════════════════════════════════════
// EMPRESAS
// ══════════════════════════════════════════════════════════════

async function getEmpresa(empresa_id) {
  const sb = getClient()
  if (!sb) return null
  const { data, error } = await sb.from('empresas').select('*').eq('id', empresa_id).single()
  if (error) { logErr('getEmpresa', error); return null }
  return data
}

// ══════════════════════════════════════════════════════════════
// PROFILES
// ══════════════════════════════════════════════════════════════

async function getProfile(user_id) {
  const sb = getClient()
  if (!sb) return null
  const { data, error } = await sb.from('profiles').select('*').eq('id', user_id).single()
  if (error) { logErr('getProfile', error); return null }
  return data
}

async function updateProfile(user_id, data) {
  const sb = getClient()
  if (!sb) return null
  const { data: d, error } = await sb.from('profiles').update(data).eq('id', user_id).select().single()
  if (error) { logErr('updateProfile', error); return null }
  return d
}

async function getTeamMembers(empresa_id) {
  const sb = getClient()
  if (!sb) return []
  const { data, error } = await sb.from('profiles').select('*').eq('empresa_id', empresa_id)
  if (error) { logErr('getTeamMembers', error); return [] }
  return data || []
}

// ══════════════════════════════════════════════════════════════
// INVENTARIO
// ══════════════════════════════════════════════════════════════

async function getInventario(empresa_id, filters = {}) {
  const sb = getClient()
  if (!sb) return { data: [], total: 0 }
  const { ciudad, tipo, activo, search, limit = 20, offset = 0 } = filters

  let q = sb.from('inventario_sql').select('*', { count: 'exact' }).eq('empresa_id', empresa_id)
  if (ciudad) q = q.ilike('nombre_ciudad', `%${ciudad}%`)
  if (tipo) q = q.ilike('tipo_inmueble_propiedad', `%${tipo}%`)
  if (activo !== undefined) q = q.eq('activo', activo)
  if (search) q = q.or(`descripcion_inmueble_publica.ilike.%${search}%,nombre_barrio.ilike.%${search}%,broker_name.ilike.%${search}%`)
  q = q.range(offset, offset + limit - 1).order('created_at', { ascending: false })

  const { data, error, count } = await q
  if (error) { logErr('getInventario', error); return { data: [], total: 0 } }
  return { data: data || [], total: count || 0 }
}

async function getInventarioItem(id) {
  const sb = getClient()
  if (!sb) return null
  const { data, error } = await sb.from('inventario_sql').select('*').eq('id', id).single()
  if (error) { logErr('getInventarioItem', error); return null }
  return data
}

async function importInventarioCSV(empresa_id, user_id, rows) {
  const sb = getClient()
  if (!sb) return { imported: 0, failed: rows.length }
  const BATCH = 50
  let imported = 0, failed = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(r => ({ ...r, empresa_id }))
    const { error } = await sb.from('inventario_sql').insert(batch)
    if (error) { logErr('importInventarioCSV batch', error); failed += batch.length }
    else imported += batch.length
  }
  return { imported, failed }
}

// ══════════════════════════════════════════════════════════════
// CAMPAIGNS
// ══════════════════════════════════════════════════════════════

async function getCampaigns(empresa_id, filters = {}) {
  const sb = getClient()
  if (!sb) return []
  let q = sb.from('ad_campaigns').select('*').eq('empresa_id', empresa_id)
  if (filters.status) q = q.eq('status', filters.status)
  q = q.order('created_at', { ascending: false })
  const { data, error } = await q
  if (error) { logErr('getCampaigns', error); return [] }
  return data || []
}

async function getCampaign(id) {
  const sb = getClient()
  if (!sb) return null
  const { data, error } = await sb.from('ad_campaigns').select('*').eq('id', id).single()
  if (error) { logErr('getCampaign', error); return null }
  return data
}

async function createCampaign(data) {
  const sb = getClient()
  if (!sb) return null
  const { data: d, error } = await sb.from('ad_campaigns').insert(data).select().single()
  if (error) { logErr('createCampaign', error); return null }
  return d
}

async function updateCampaign(id, data) {
  const sb = getClient()
  if (!sb) return null
  const { data: d, error } = await sb.from('ad_campaigns').update(data).eq('id', id).select().single()
  if (error) { logErr('updateCampaign', error); return null }
  return d
}

// ══════════════════════════════════════════════════════════════
// CREATIVES
// ══════════════════════════════════════════════════════════════

async function getCreatives(campaign_id, filters = {}) {
  const sb = getClient()
  if (!sb) return []
  let q = sb.from('ad_creatives').select('*').eq('campaign_id', campaign_id)
  if (filters.status) q = q.eq('status', filters.status)
  q = q.order('created_at', { ascending: false })
  const { data, error } = await q
  if (error) { logErr('getCreatives', error); return [] }
  return data || []
}

async function getAllCreatives(empresa_id, filters = {}) {
  const sb = getClient()
  if (!sb) return []
  let q = sb.from('ad_creatives').select('*').eq('empresa_id', empresa_id)
  if (filters.campaign_id) q = q.eq('campaign_id', filters.campaign_id)
  if (filters.status) q = q.eq('status', filters.status)
  const limit = filters.limit || 50
  const offset = filters.offset || 0
  q = q.range(offset, offset + limit - 1).order('created_at', { ascending: false })
  const { data, error } = await q
  if (error) { logErr('getAllCreatives', error); return [] }
  return data || []
}

async function createCreative(data) {
  const sb = getClient()
  if (!sb) return null
  const { data: d, error } = await sb.from('ad_creatives').insert(data).select().single()
  if (error) { logErr('createCreative', error); return null }
  return d
}

async function updateCreative(id, data) {
  const sb = getClient()
  if (!sb) return null
  const { data: d, error } = await sb.from('ad_creatives').update(data).eq('id', id).select().single()
  if (error) { logErr('updateCreative', error); return null }
  return d
}

async function bulkUpdateCreatives(ids, data) {
  const sb = getClient()
  if (!sb) return false
  const { error } = await sb.from('ad_creatives').update(data).in('id', ids)
  if (error) { logErr('bulkUpdateCreatives', error); return false }
  return true
}

// ══════════════════════════════════════════════════════════════
// PERFORMANCE LOGS
// ══════════════════════════════════════════════════════════════

async function getPerformanceLogs(filters = {}) {
  const sb = getClient()
  if (!sb) return []
  let q = sb.from('ad_performance_logs').select('*')
  if (filters.empresa_id) q = q.eq('empresa_id', filters.empresa_id)
  if (filters.campaign_id) q = q.eq('campaign_id', filters.campaign_id)
  if (filters.creative_id) q = q.eq('creative_id', filters.creative_id)
  if (filters.platform) q = q.eq('platform', filters.platform)
  if (filters.date_from) q = q.gte('log_date', filters.date_from)
  if (filters.date_to) q = q.lte('log_date', filters.date_to)
  q = q.order('log_date', { ascending: false }).limit(500)
  const { data, error } = await q
  if (error) { logErr('getPerformanceLogs', error); return [] }
  return data || []
}

async function insertPerformanceLog(data) {
  const sb = getClient()
  if (!sb) return null
  const { data: d, error } = await sb.from('ad_performance_logs').insert(data).select().single()
  if (error) { logErr('insertPerformanceLog', error); return null }
  return d
}

async function getDailyAggregate(empresa_id, days = 7) {
  const sb = getClient()
  if (!sb) return []
  const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
  const { data, error } = await sb
    .from('ad_performance_logs')
    .select('log_date, impressions, clicks, spend, conversions')
    .eq('empresa_id', empresa_id)
    .gte('log_date', from)
    .order('log_date', { ascending: true })
  if (error) { logErr('getDailyAggregate', error); return [] }
  return data || []
}

// ══════════════════════════════════════════════════════════════
// AI LOGS
// ══════════════════════════════════════════════════════════════

async function getAILogs(empresa_id, limit = 50) {
  const sb = getClient()
  if (!sb) return []
  const { data, error } = await sb
    .from('ad_ai_logs').select('*').eq('empresa_id', empresa_id)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) { logErr('getAILogs', error); return [] }
  return data || []
}

async function insertAILog(data) {
  const sb = getClient()
  if (!sb) return null
  const { data: d, error } = await sb.from('ad_ai_logs').insert(data).select().single()
  if (error) { logErr('insertAILog', error); return null }
  return d
}

// ══════════════════════════════════════════════════════════════
// VIDEO UPLOADS
// ══════════════════════════════════════════════════════════════

async function getVideoUploads(empresa_id) {
  const sb = getClient()
  if (!sb) return []
  const { data, error } = await sb
    .from('ad_video_uploads').select('*').eq('empresa_id', empresa_id)
    .order('created_at', { ascending: false })
  if (error) { logErr('getVideoUploads', error); return [] }
  return data || []
}

async function createVideoUpload(data) {
  const sb = getClient()
  if (!sb) return null
  const { data: d, error } = await sb.from('ad_video_uploads').insert(data).select().single()
  if (error) { logErr('createVideoUpload', error); return null }
  return d
}

async function updateVideoUpload(id, data) {
  const sb = getClient()
  if (!sb) return null
  const { data: d, error } = await sb.from('ad_video_uploads').update(data).eq('id', id).select().single()
  if (error) { logErr('updateVideoUpload', error); return null }
  return d
}

// ══════════════════════════════════════════════════════════════
// WHATSAPP ANALYTICS
// ══════════════════════════════════════════════════════════════

async function getTemplateAnalytics(empresa_id, filters = {}) {
  const sb = getClient()
  if (!sb) return []
  let q = sb.from('whatsapp_template_analytics').select('*').eq('empresa_id', empresa_id)
  if (filters.date_from) q = q.gte('log_date', filters.date_from)
  if (filters.date_to) q = q.lte('log_date', filters.date_to)
  if (filters.template_name && filters.template_name.length > 0) {
    q = q.in('template_name', filters.template_name)
  }
  q = q.order('log_date', { ascending: false }).limit(1000)
  const { data, error } = await q
  if (error) { logErr('getTemplateAnalytics', error); return [] }
  return data || []
}

async function getTemplateSummary(empresa_id) {
  const sb = getClient()
  if (!sb) return []
  const { data, error } = await sb
    .from('whatsapp_template_analytics')
    .select('template_name, sent, delivered, read, failed, success_rate')
    .eq('empresa_id', empresa_id)
  if (error) { logErr('getTemplateSummary', error); return [] }
  return data || []
}

async function upsertTemplateAnalytics(data) {
  const sb = getClient()
  if (!sb) return null
  const { data: d, error } = await sb
    .from('whatsapp_template_analytics')
    .upsert(data, { onConflict: 'empresa_id,template_name,log_date' })
    .select()
  if (error) { logErr('upsertTemplateAnalytics', error); return null }
  return d
}

// ══════════════════════════════════════════════════════════════
// PLATFORM CREDENTIALS
// ══════════════════════════════════════════════════════════════

async function getCredentials(empresa_id, platform) {
  const sb = getClient()
  if (!sb) return null
  const { data, error } = await sb
    .from('platform_credentials')
    .select('*').eq('empresa_id', empresa_id).eq('platform', platform).single()
  if (error) { return null }
  return data
}

async function upsertCredentials(empresa_id, platform, credentials) {
  const sb = getClient()
  if (!sb) return null
  const { data, error } = await sb
    .from('platform_credentials')
    .upsert({ empresa_id, platform, credentials, is_active: true }, { onConflict: 'empresa_id,platform' })
    .select().single()
  if (error) { logErr('upsertCredentials', error); return null }
  return data
}

async function updateCredentialTestStatus(empresa_id, platform, status) {
  const sb = getClient()
  if (!sb) return
  await sb.from('platform_credentials')
    .update({ last_tested_at: new Date().toISOString(), last_test_status: status })
    .eq('empresa_id', empresa_id).eq('platform', platform)
}

module.exports = {
  getEmpresa, getProfile, updateProfile, getTeamMembers,
  getInventario, getInventarioItem, importInventarioCSV,
  getCampaigns, getCampaign, createCampaign, updateCampaign,
  getCreatives, getAllCreatives, createCreative, updateCreative, bulkUpdateCreatives,
  getPerformanceLogs, insertPerformanceLog, getDailyAggregate,
  getAILogs, insertAILog,
  getVideoUploads, createVideoUpload, updateVideoUpload,
  getTemplateAnalytics, getTemplateSummary, upsertTemplateAnalytics,
  getCredentials, upsertCredentials, updateCredentialTestStatus,
}
