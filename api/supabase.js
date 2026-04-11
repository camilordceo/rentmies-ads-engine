/**
 * RENTMIES ADS ENGINE — SUPABASE API LAYER
 * All database operations in one place.
 * Uses service_role_key → bypasses RLS.
 */

const supabase = require('../lib/supabase')

// ═══════════════════════════════════════
// EMPRESAS
// ═══════════════════════════════════════

async function getEmpresa(empresa_id) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('empresas')
    .select('*')
    .eq('id', empresa_id)
    .single()
  if (error) console.error('[Supabase] getEmpresa:', error.message)
  return data
}

async function getFirstEmpresa() {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('empresas')
    .select('*')
    .limit(1)
    .single()
  if (error) console.error('[Supabase] getFirstEmpresa:', error.message)
  return data
}

// ═══════════════════════════════════════
// PROFILES
// ═══════════════════════════════════════

async function getProfile(user_id) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user_id)
    .single()
  if (error) console.error('[Supabase] getProfile:', error.message)
  return data
}

async function updateProfile(user_id, updateData) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', user_id)
    .select()
    .single()
  if (error) console.error('[Supabase] updateProfile:', error.message)
  return data
}

async function getTeamMembers(empresa_id) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('empresa_id', empresa_id)
    .order('nombre', { ascending: true })
  if (error) console.error('[Supabase] getTeamMembers:', error.message)
  return data || []
}

// ═══════════════════════════════════════
// INVENTARIO
// ═══════════════════════════════════════

async function getInventario(empresa_id, filters = {}) {
  if (!supabase) return { data: [], total: 0 }
  const { ciudad, tipo, transaccion, search, activo, limit = 20, offset = 0 } = filters

  let query = supabase
    .from('inventario_sql')
    .select('*', { count: 'exact' })
    .eq('empresa_id', empresa_id)

  if (ciudad) query = query.eq('nombre_ciudad', ciudad)
  if (tipo) query = query.eq('tipo_inmueble_propiedad', tipo)
  if (transaccion) query = query.eq('tipo_transaccion_negocio', transaccion)
  if (activo !== undefined) query = query.eq('activo', activo)
  if (search) {
    query = query.or(
      `descripcion_inmueble_publica.ilike.%${search}%,nombre_ciudad.ilike.%${search}%,nombre_barrio.ilike.%${search}%,broker_name.ilike.%${search}%`
    )
  }

  query = query.order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) console.error('[Supabase] getInventario:', error.message)
  return { data: data || [], total: count || 0 }
}

async function getInventarioItem(id) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('inventario_sql')
    .select('*')
    .eq('id', id)
    .single()
  if (error) console.error('[Supabase] getInventarioItem:', error.message)
  return data
}

async function getInventarioCities(empresa_id) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('inventario_sql')
    .select('nombre_ciudad')
    .eq('empresa_id', empresa_id)
    .not('nombre_ciudad', 'is', null)
  if (error) return []
  const unique = [...new Set((data || []).map(d => d.nombre_ciudad).filter(Boolean))]
  return unique.sort()
}

async function importInventarioRows(empresa_id, rows) {
  if (!supabase) return { imported: 0, failed: 0, errors: [] }
  const errors = []
  let imported = 0
  let failed = 0

  // Batch insert 50 at a time
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50).map(row => ({
      empresa_id,
      ...row,
      activo: true,
      created_at: new Date().toISOString()
    }))

    const { data, error } = await supabase
      .from('inventario_sql')
      .insert(batch)
      .select()

    if (error) {
      console.error('[Supabase] importInventarioRows batch error:', error.message)
      failed += batch.length
      errors.push({ batch_start: i, issue: error.message })
    } else {
      imported += (data || []).length
    }
  }

  return { imported, failed, errors }
}

async function createInventarioImport(data) {
  if (!supabase) return null
  const { data: record, error } = await supabase
    .from('ad_inventario_imports')
    .insert(data)
    .select()
    .single()
  if (error) console.error('[Supabase] createInventarioImport:', error.message)
  return record
}

async function updateInventarioImport(id, updateData) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ad_inventario_imports')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  if (error) console.error('[Supabase] updateInventarioImport:', error.message)
  return data
}

// ═══════════════════════════════════════
// CAMPAIGNS
// ═══════════════════════════════════════

async function getCampaigns(empresa_id, filters = {}) {
  if (!supabase) return []
  const { status, limit = 50 } = filters

  let query = supabase
    .from('ad_campaigns')
    .select('*')
    .eq('empresa_id', empresa_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) console.error('[Supabase] getCampaigns:', error.message)
  return data || []
}

async function getCampaign(id) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ad_campaigns')
    .select('*')
    .eq('id', id)
    .single()
  if (error) console.error('[Supabase] getCampaign:', error.message)
  return data
}

async function createCampaign(campaignData) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ad_campaigns')
    .insert(campaignData)
    .select()
    .single()
  if (error) console.error('[Supabase] createCampaign:', error.message)
  return data
}

async function updateCampaign(id, updateData) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ad_campaigns')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  if (error) console.error('[Supabase] updateCampaign:', error.message)
  return data
}

async function deleteCampaign(id) {
  if (!supabase) return false
  const { error } = await supabase
    .from('ad_campaigns')
    .delete()
    .eq('id', id)
  if (error) console.error('[Supabase] deleteCampaign:', error.message)
  return !error
}

// ═══════════════════════════════════════
// CREATIVES
// ═══════════════════════════════════════

async function getCreatives(campaign_id, filters = {}) {
  if (!supabase) return []
  const { status, variation_type, limit = 100 } = filters

  let query = supabase
    .from('ad_creatives')
    .select('*')
    .eq('campaign_id', campaign_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (variation_type) query = query.eq('variation_type', variation_type)

  const { data, error } = await query
  if (error) console.error('[Supabase] getCreatives:', error.message)
  return data || []
}

async function getAllCreatives(empresa_id, filters = {}) {
  if (!supabase) return []
  const { sort_by = 'created_at', order = 'desc', limit = 100 } = filters

  const { data, error } = await supabase
    .from('ad_creatives')
    .select('*')
    .eq('empresa_id', empresa_id)
    .order(sort_by, { ascending: order === 'asc' })
    .limit(limit)

  if (error) console.error('[Supabase] getAllCreatives:', error.message)
  return data || []
}

async function createCreative(creativeData) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ad_creatives')
    .insert(creativeData)
    .select()
    .single()
  if (error) console.error('[Supabase] createCreative:', error.message)
  return data
}

async function updateCreative(id, updateData) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ad_creatives')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  if (error) console.error('[Supabase] updateCreative:', error.message)
  return data
}

async function bulkUpdateCreatives(ids, updateData) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('ad_creatives')
    .update(updateData)
    .in('id', ids)
    .select()
  if (error) console.error('[Supabase] bulkUpdateCreatives:', error.message)
  return data || []
}

// ═══════════════════════════════════════
// PERFORMANCE LOGS
// ═══════════════════════════════════════

async function getPerformanceLogs(filters = {}) {
  if (!supabase) return []
  const { empresa_id, campaign_id, creative_id, date_from, date_to, platform, limit = 500 } = filters

  let query = supabase
    .from('ad_performance_logs')
    .select('*')
    .order('log_date', { ascending: false })
    .limit(limit)

  if (empresa_id) query = query.eq('empresa_id', empresa_id)
  if (campaign_id) query = query.eq('campaign_id', campaign_id)
  if (creative_id) query = query.eq('creative_id', creative_id)
  if (platform) query = query.eq('platform', platform)
  if (date_from) query = query.gte('log_date', date_from)
  if (date_to) query = query.lte('log_date', date_to)

  const { data, error } = await query
  if (error) console.error('[Supabase] getPerformanceLogs:', error.message)
  return data || []
}

async function insertPerformanceLog(logData) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ad_performance_logs')
    .insert(logData)
    .select()
    .single()
  if (error) console.error('[Supabase] insertPerformanceLog:', error.message)
  return data
}

async function getDailyAggregate(empresa_id, days = 7) {
  if (!supabase) return []
  const dateFrom = new Date()
  dateFrom.setDate(dateFrom.getDate() - days)

  const { data, error } = await supabase
    .from('ad_performance_logs')
    .select('*')
    .eq('empresa_id', empresa_id)
    .gte('log_date', dateFrom.toISOString().split('T')[0])
    .order('log_date', { ascending: true })

  if (error) console.error('[Supabase] getDailyAggregate:', error.message)
  return data || []
}

// ═══════════════════════════════════════
// AI LOGS
// ═══════════════════════════════════════

async function getAILogs(empresa_id, limit = 50) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('ad_ai_logs')
    .select('*')
    .eq('empresa_id', empresa_id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) console.error('[Supabase] getAILogs:', error.message)
  return data || []
}

async function insertAILog(logData) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ad_ai_logs')
    .insert(logData)
    .select()
    .single()
  if (error) console.error('[Supabase] insertAILog:', error.message)
  return data
}

// ═══════════════════════════════════════
// VIDEO UPLOADS
// ═══════════════════════════════════════

async function getVideoUploads(empresa_id) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('ad_video_uploads')
    .select('*')
    .eq('empresa_id', empresa_id)
    .order('created_at', { ascending: false })
  if (error) console.error('[Supabase] getVideoUploads:', error.message)
  return data || []
}

async function createVideoUpload(uploadData) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ad_video_uploads')
    .insert(uploadData)
    .select()
    .single()
  if (error) console.error('[Supabase] createVideoUpload:', error.message)
  return data
}

async function updateVideoUpload(id, updateData) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('ad_video_uploads')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  if (error) console.error('[Supabase] updateVideoUpload:', error.message)
  return data
}

// ═══════════════════════════════════════
// WHATSAPP TEMPLATE ANALYTICS
// ═══════════════════════════════════════

async function getTemplateAnalytics(empresa_id, filters = {}) {
  if (!supabase) return []
  const { date_from, date_to, template_names } = filters

  let query = supabase
    .from('whatsapp_template_analytics')
    .select('*')
    .eq('empresa_id', empresa_id)
    .order('log_date', { ascending: false })

  if (date_from) query = query.gte('log_date', date_from)
  if (date_to) query = query.lte('log_date', date_to)
  if (template_names && template_names.length > 0) {
    query = query.in('template_name', template_names)
  }

  const { data, error } = await query
  if (error) console.error('[Supabase] getTemplateAnalytics:', error.message)
  return data || []
}

async function getTemplateSummary(empresa_id) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('whatsapp_template_analytics')
    .select('template_name, template_id, category, language')
    .eq('empresa_id', empresa_id)

  if (error) console.error('[Supabase] getTemplateSummary:', error.message)

  // Deduplicate by template_name
  const seen = new Set()
  return (data || []).filter(d => {
    if (seen.has(d.template_name)) return false
    seen.add(d.template_name)
    return true
  })
}

async function upsertTemplateAnalytics(analyticsData) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('whatsapp_template_analytics')
    .upsert(analyticsData, { onConflict: 'empresa_id,template_name,log_date' })
    .select()
  if (error) console.error('[Supabase] upsertTemplateAnalytics:', error.message)
  return data
}

// ═══════════════════════════════════════
// PLATFORM CREDENTIALS
// ═══════════════════════════════════════

async function getCredentials(empresa_id, platform) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('platform_credentials')
    .select('*')
    .eq('empresa_id', empresa_id)
    .eq('platform', platform)
    .single()
  if (error && error.code !== 'PGRST116') console.error('[Supabase] getCredentials:', error.message)
  return data
}

async function getAllCredentials(empresa_id) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('platform_credentials')
    .select('*')
    .eq('empresa_id', empresa_id)
  if (error) console.error('[Supabase] getAllCredentials:', error.message)
  return data || []
}

async function upsertCredentials(empresa_id, platform, credentials) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('platform_credentials')
    .upsert({
      empresa_id,
      platform,
      credentials,
      is_active: true
    }, { onConflict: 'empresa_id,platform' })
    .select()
    .single()
  if (error) console.error('[Supabase] upsertCredentials:', error.message)
  return data
}

async function updateCredentialTestStatus(empresa_id, platform, status) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('platform_credentials')
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_status: status
    })
    .eq('empresa_id', empresa_id)
    .eq('platform', platform)
    .select()
    .single()
  if (error) console.error('[Supabase] updateCredentialTestStatus:', error.message)
  return data
}

// ═══════════════════════════════════════
// COUNTS & AGGREGATES
// ═══════════════════════════════════════

async function getCounts(empresa_id) {
  if (!supabase) return { campaigns: 0, creatives: 0, videos: 0, properties: 0 }

  const [campaigns, creatives, videos, properties] = await Promise.all([
    supabase.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa_id),
    supabase.from('ad_creatives').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa_id),
    supabase.from('ad_video_uploads').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa_id),
    supabase.from('inventario_sql').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa_id),
  ])

  return {
    campaigns: campaigns.count || 0,
    creatives: creatives.count || 0,
    videos: videos.count || 0,
    properties: properties.count || 0
  }
}

async function getActiveCampaignCount(empresa_id) {
  if (!supabase) return 0
  const { count, error } = await supabase
    .from('ad_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresa_id)
    .eq('status', 'active')
  if (error) return 0
  return count || 0
}

module.exports = {
  getEmpresa, getFirstEmpresa,
  getProfile, updateProfile, getTeamMembers,
  getInventario, getInventarioItem, getInventarioCities, importInventarioRows,
  createInventarioImport, updateInventarioImport,
  getCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign,
  getCreatives, getAllCreatives, createCreative, updateCreative, bulkUpdateCreatives,
  getPerformanceLogs, insertPerformanceLog, getDailyAggregate,
  getAILogs, insertAILog,
  getVideoUploads, createVideoUpload, updateVideoUpload,
  getTemplateAnalytics, getTemplateSummary, upsertTemplateAnalytics,
  getCredentials, getAllCredentials, upsertCredentials, updateCredentialTestStatus,
  getCounts, getActiveCampaignCount
}
