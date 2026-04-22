/**
 * RENTMIES ADS ENGINE — MOCK DATA SEEDER
 * Seeds realistic Colombian real estate data for dev/demo.
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const path = require('path')
const fs = require('fs')

function getClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

const DEMO_EMPRESA_ID = 'demo-empresa-001'

// Real property images from Domus (inmobiliaria_1122)
const DOMUS_IMGS = [
  'https://s3-us-west-2.amazonaws.com/pictures.domus.la/inmobiliaria_1122/249_1_1776777076.jpg',
  'https://s3-us-west-2.amazonaws.com/pictures.domus.la/inmobiliaria_1122/1_1_1774537428_1.jpg',
  'https://s3-us-west-2.amazonaws.com/pictures.domus.la/inmobiliaria_1122/211_1_1774968499.jpg',
  'https://s3-us-west-2.amazonaws.com/pictures.domus.la/inmobiliaria_1122/2_1_1774537429_1.jpg',
  'https://s3-us-west-2.amazonaws.com/pictures.domus.la/inmobiliaria_1122/3_1_1774537438_1.jpg',
  'https://s3-us-west-2.amazonaws.com/pictures.domus.la/inmobiliaria_1122/5_1_1774537455_1.jpg',
  'https://s3-us-west-2.amazonaws.com/pictures.domus.la/inmobiliaria_1122/4_1_1774537444_1.jpg',
]

const DEMO_PROPERTIES = [
  {
    id: 'demo-prop-001', empresa_id: DEMO_EMPRESA_ID,
    tipo_inmueble_propiedad: 'Apartamento', tipo_transaccion_negocio: 'Arriendo',
    nombre_ciudad: 'Bogotá', nombre_barrio: 'Chapinero Alto',
    valor_arriendo: 2800000, valor_venta: null,
    area_construida: 68, numero_habitaciones: 2, numero_banos: 2, numero_garajes: 1,
    descripcion_inmueble_publica: 'Moderno apartamento en Chapinero Alto con excelente iluminación natural, cocina integral y zona de lavandería. Piso 8, vista despejada.',
    broker_name: 'Valentina Torres', broker_email: 'v.torres@rentmies.co',
    image_link_1: DOMUS_IMGS[0], image_link_2: DOMUS_IMGS[1], image_link_3: DOMUS_IMGS[2],
    activo: true
  },
  {
    id: 'demo-prop-002', empresa_id: DEMO_EMPRESA_ID,
    tipo_inmueble_propiedad: 'Apartamento', tipo_transaccion_negocio: 'Venta',
    nombre_ciudad: 'Bogotá', nombre_barrio: 'El Chicó',
    valor_arriendo: null, valor_venta: 850000000,
    area_construida: 120, numero_habitaciones: 3, numero_banos: 3, numero_garajes: 2,
    descripcion_inmueble_publica: 'Exclusivo apartamento en El Chicó con acabados de lujo, terraza privada y vista panorámica. Edificio con portería 24h, gimnasio y salón social.',
    broker_name: 'Sebastián Morales', broker_email: 's.morales@rentmies.co',
    image_link_1: DOMUS_IMGS[3], image_link_2: DOMUS_IMGS[4], image_link_3: DOMUS_IMGS[5],
    activo: true
  },
  {
    id: 'demo-prop-003', empresa_id: DEMO_EMPRESA_ID,
    tipo_inmueble_propiedad: 'Casa', tipo_transaccion_negocio: 'Arriendo',
    nombre_ciudad: 'Medellín', nombre_barrio: 'El Poblado',
    valor_arriendo: 4500000, valor_venta: null,
    area_construida: 180, numero_habitaciones: 4, numero_banos: 3, numero_garajes: 2,
    descripcion_inmueble_publica: 'Casa campestre en El Poblado con jardín privado, piscina y BBQ. Zona residencial tranquila a 5 minutos del Parque El Poblado.',
    broker_name: 'Camila Ríos', broker_email: 'c.rios@rentmies.co',
    image_link_1: DOMUS_IMGS[6], image_link_2: DOMUS_IMGS[0], image_link_3: DOMUS_IMGS[1],
    activo: true
  },
  {
    id: 'demo-prop-004', empresa_id: DEMO_EMPRESA_ID,
    tipo_inmueble_propiedad: 'Apartamento', tipo_transaccion_negocio: 'Arriendo',
    nombre_ciudad: 'Medellín', nombre_barrio: 'Laureles',
    valor_arriendo: 1950000, valor_venta: null,
    area_construida: 52, numero_habitaciones: 1, numero_banos: 1, numero_garajes: 1,
    descripcion_inmueble_publica: 'Apartamento tipo estudio moderno en Laureles. Ideal para profesionales. Amoblado disponible bajo solicitud. Cerca a metro Estadio.',
    broker_name: 'Juan Pablo Gómez', broker_email: 'jp.gomez@rentmies.co',
    image_link_1: DOMUS_IMGS[2], image_link_2: DOMUS_IMGS[3], image_link_3: null,
    activo: true
  },
  {
    id: 'demo-prop-005', empresa_id: DEMO_EMPRESA_ID,
    tipo_inmueble_propiedad: 'Local Comercial', tipo_transaccion_negocio: 'Arriendo',
    nombre_ciudad: 'Bogotá', nombre_barrio: 'Usaquén',
    valor_arriendo: 5200000, valor_venta: null,
    area_construida: 95, numero_habitaciones: 0, numero_banos: 1, numero_garajes: 1,
    descripcion_inmueble_publica: 'Local comercial en zona rosa de Usaquén. Alta circulación peatonal, frente a vía principal. Ideal para restaurante o boutique premium.',
    broker_name: 'Valentina Torres', broker_email: 'v.torres@rentmies.co',
    image_link_1: DOMUS_IMGS[4], image_link_2: DOMUS_IMGS[5], image_link_3: null,
    activo: true
  },
  {
    id: 'demo-prop-006', empresa_id: DEMO_EMPRESA_ID,
    tipo_inmueble_propiedad: 'Apartamento', tipo_transaccion_negocio: 'Venta',
    nombre_ciudad: 'Cali', nombre_barrio: 'Ciudad Jardín',
    valor_arriendo: null, valor_venta: 420000000,
    area_construida: 88, numero_habitaciones: 3, numero_banos: 2, numero_garajes: 1,
    descripcion_inmueble_publica: 'Apartamento en Ciudad Jardín con excelentes acabados. Conjunto cerrado con piscina, cancha de tennis y zona BBQ. Entrega inmediata.',
    broker_name: 'Andrés Vargas', broker_email: 'a.vargas@rentmies.co',
    image_link_1: DOMUS_IMGS[6], image_link_2: DOMUS_IMGS[0], image_link_3: DOMUS_IMGS[1],
    activo: true
  },
  {
    id: 'demo-prop-007', empresa_id: DEMO_EMPRESA_ID,
    tipo_inmueble_propiedad: 'Penthouse', tipo_transaccion_negocio: 'Venta',
    nombre_ciudad: 'Bogotá', nombre_barrio: 'Santa Bárbara',
    valor_arriendo: null, valor_venta: 1200000000,
    area_construida: 210, numero_habitaciones: 4, numero_banos: 4, numero_garajes: 3,
    descripcion_inmueble_publica: 'Exclusivo penthouse en Santa Bárbara con terraza de 80m², vista 360° de Bogotá. Cocina europea, jacuzzi y cuarto de servicio independiente.',
    broker_name: 'Sebastián Morales', broker_email: 's.morales@rentmies.co',
    image_link_1: DOMUS_IMGS[2], image_link_2: DOMUS_IMGS[3], image_link_3: DOMUS_IMGS[4],
    activo: true
  },
  {
    id: 'demo-prop-008', empresa_id: DEMO_EMPRESA_ID,
    tipo_inmueble_propiedad: 'Apartamento', tipo_transaccion_negocio: 'Arriendo',
    nombre_ciudad: 'Bogotá', nombre_barrio: 'Cedritos',
    valor_arriendo: 1650000, valor_venta: null,
    area_construida: 58, numero_habitaciones: 2, numero_banos: 1, numero_garajes: 0,
    descripcion_inmueble_publica: 'Cómodo apartamento en Cedritos, segundo piso, buena iluminación. Zona residencial tranquila, cerca a centros comerciales y colegios.',
    broker_name: 'Camila Ríos', broker_email: 'c.rios@rentmies.co',
    image_link_1: DOMUS_IMGS[5], image_link_2: DOMUS_IMGS[6], image_link_3: null,
    activo: true
  },
  {
    id: 'demo-prop-009', empresa_id: DEMO_EMPRESA_ID,
    tipo_inmueble_propiedad: 'Casa', tipo_transaccion_negocio: 'Venta',
    nombre_ciudad: 'Medellín', nombre_barrio: 'Envigado',
    valor_arriendo: null, valor_venta: 680000000,
    area_construida: 220, numero_habitaciones: 5, numero_banos: 4, numero_garajes: 2,
    descripcion_inmueble_publica: 'Casa familiar en Envigado con jardín amplio, estudio independiente y zona de BBQ. Excelente valorización en el sector. Escritura inmediata.',
    broker_name: 'Juan Pablo Gómez', broker_email: 'jp.gomez@rentmies.co',
    image_link_1: DOMUS_IMGS[1], image_link_2: DOMUS_IMGS[2], image_link_3: null,
    activo: true
  },
  {
    id: 'demo-prop-010', empresa_id: DEMO_EMPRESA_ID,
    tipo_inmueble_propiedad: 'Oficina', tipo_transaccion_negocio: 'Arriendo',
    nombre_ciudad: 'Bogotá', nombre_barrio: 'Chicó Norte',
    valor_arriendo: 3800000, valor_venta: null,
    area_construida: 72, numero_habitaciones: 0, numero_banos: 2, numero_garajes: 2,
    descripcion_inmueble_publica: 'Oficina moderna en Chicó Norte, edificio clase A con recepción, auditorio y parking. Ideal para firmas de consultoría o tecnología.',
    broker_name: 'Andrés Vargas', broker_email: 'a.vargas@rentmies.co',
    image_link_1: DOMUS_IMGS[3], image_link_2: DOMUS_IMGS[4], image_link_3: null,
    activo: true
  },
]

const DEMO_PROFILES = [
  { id: 'demo-user-001', empresa_id: DEMO_EMPRESA_ID, email: 'camilo@rentmies.co', nombre: 'Camilo González', rol: 'Admin', activo: true, credits_remaining: 500, plan: 'Pro' },
  { id: 'demo-user-002', empresa_id: DEMO_EMPRESA_ID, email: 'valentina@rentmies.co', nombre: 'Valentina Torres', rol: 'Editor', activo: true, credits_remaining: 200, plan: 'Pro' },
  { id: 'demo-user-003', empresa_id: DEMO_EMPRESA_ID, email: 'sebastian@rentmies.co', nombre: 'Sebastián Morales', rol: 'Editor', activo: true, credits_remaining: 150, plan: 'Pro' },
  { id: 'demo-user-004', empresa_id: DEMO_EMPRESA_ID, email: 'camila@rentmies.co', nombre: 'Camila Ríos', rol: 'Viewer', activo: true, credits_remaining: 50, plan: 'Starter' },
  { id: 'demo-user-005', empresa_id: DEMO_EMPRESA_ID, email: 'andres@rentmies.co', nombre: 'Andrés Vargas', rol: 'Viewer', activo: false, credits_remaining: 0, plan: 'Starter' },
]

const DEMO_CAMPAIGNS = [
  {
    id: 'demo-camp-001', empresa_id: DEMO_EMPRESA_ID, created_by: 'demo-user-001',
    name: 'Aptos Chapinero — Arriendo Q1', status: 'active',
    ciudad: 'Bogotá', tipo_inmueble: 'Apartamento', tipo_transaccion: 'Arriendo',
    presupuesto_diario: 50000, presupuesto_total: 1500000, moneda: 'COP',
    inventario_sql_id: 'demo-prop-001',
    platforms: ['meta_feed', 'instagram_feed'],
    total_ads_generated: 8, total_ads_published: 6
  },
  {
    id: 'demo-camp-002', empresa_id: DEMO_EMPRESA_ID, created_by: 'demo-user-001',
    name: 'Ventas El Chicó Premium', status: 'draft',
    ciudad: 'Bogotá', tipo_inmueble: 'Apartamento', tipo_transaccion: 'Venta',
    presupuesto_diario: 100000, presupuesto_total: 3000000, moneda: 'COP',
    inventario_sql_id: 'demo-prop-002',
    platforms: ['meta_feed', 'instagram_feed', 'tiktok'],
    total_ads_generated: 4, total_ads_published: 0
  },
  {
    id: 'demo-camp-003', empresa_id: DEMO_EMPRESA_ID, created_by: 'demo-user-002',
    name: 'Medellín Poblado — Mayo', status: 'completed',
    ciudad: 'Medellín', tipo_inmueble: 'Casa', tipo_transaccion: 'Arriendo',
    presupuesto_diario: 80000, presupuesto_total: 2400000, moneda: 'COP',
    inventario_sql_id: 'demo-prop-003',
    platforms: ['meta_feed', 'instagram_feed'],
    total_ads_generated: 12, total_ads_published: 12
  },
]

function randomBetween(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a }

function generatePerfLogs(empresa_id) {
  const logs = []
  const campaigns = ['demo-camp-001', 'demo-camp-002', 'demo-camp-003']
  const platforms = ['meta', 'instagram']
  for (let d = 29; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000).toISOString().split('T')[0]
    campaigns.forEach(cid => {
      platforms.forEach(plat => {
        const impressions = randomBetween(800, 4000)
        const ctr = (Math.random() * 2.5 + 0.5) / 100
        const clicks = Math.floor(impressions * ctr)
        const cpc = randomBetween(900, 2800)
        const spend = clicks * cpc
        const conversions = Math.floor(clicks * 0.08)
        logs.push({
          campaign_id: cid, empresa_id,
          log_date: date, platform: plat,
          impressions, clicks, spend, ctr: parseFloat((ctr * 100).toFixed(2)),
          cpc, conversions,
          reach: Math.floor(impressions * 0.7),
          frequency: parseFloat((impressions / (impressions * 0.7)).toFixed(2))
        })
      })
    })
  }
  return logs
}

const WA_TEMPLATES = ['Bienvenida_Lead', 'Visita_Confirmada', 'Seguimiento_7d', 'Cierre_Arriendo', 'Recordatorio_Pago', 'Nueva_Oferta', 'Felicitacion_Mudanza', 'Encuesta_Satisfaccion']

function generateWALogs(empresa_id) {
  const logs = []
  for (let d = 29; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000).toISOString().split('T')[0]
    WA_TEMPLATES.forEach(tpl => {
      const sent = randomBetween(30, 300)
      const delivered = Math.floor(sent * (0.94 + Math.random() * 0.05))
      const read = Math.floor(delivered * (0.60 + Math.random() * 0.30))
      const failed = sent - delivered
      const clicked = Math.floor(read * (0.05 + Math.random() * 0.15))
      logs.push({
        empresa_id, template_name: tpl,
        log_date: date, language: 'es',
        sent, delivered, read, failed, clicked,
        delivery_rate: parseFloat(((delivered / sent) * 100).toFixed(1)),
        read_rate: parseFloat(((read / delivered) * 100).toFixed(1)),
        success_rate: parseFloat(((delivered / sent) * 100).toFixed(1))
      })
    })
  }
  return logs
}

// In-memory seed for when Supabase is not configured
const memoryStore = {
  seeded: false,
  inventario: [],
  campaigns: [],
  creatives: [],
  profiles: DEMO_PROFILES,
  performanceLogs: [],
  waLogs: [],
  aiLogs: [],
  videos: [],
}

function seedMemory() {
  if (memoryStore.seeded) return
  memoryStore.seeded = true
  memoryStore.inventario = DEMO_PROPERTIES

  // Load inmuebles-demo.json if exists
  try {
    const demoPath = path.join(__dirname, '../inmuebles-demo.json')
    if (fs.existsSync(demoPath)) {
      const demoData = JSON.parse(fs.readFileSync(demoPath, 'utf-8'))
      const mapped = demoData.map((item, idx) => ({
        id: `demo-json-${idx}`,
        empresa_id: DEMO_EMPRESA_ID,
        tipo_inmueble_propiedad: item.tipo_inmueble_propiedad || 'Apartamento',
        tipo_transaccion_negocio: item.tipo_transaccion_negocio || 'Venta',
        nombre_ciudad: item.nombre_ciudad || 'Bogotá',
        nombre_barrio: item.nombre_barrio || '',
        valor_arriendo: item.valor_arriendo ? parseFloat(item.valor_arriendo) : null,
        valor_venta: item.valor_venta ? parseFloat(item.valor_venta) : null,
        area_construida: item.area_construida ? parseFloat(item.area_construida) : null,
        numero_habitaciones: item.numero_habitaciones ? parseInt(item.numero_habitaciones) : null,
        numero_banos: item.numero_banos ? parseFloat(item.numero_banos) : null,
        numero_garajes: item.numero_garajes ? parseInt(item.numero_garajes) : null,
        descripcion_inmueble_publica: item.descripcion_inmueble_propiedad || item.descripcion_inmueble_publica || '',
        broker_name: item.Broker_Name || item.broker_name || '',
        broker_email: item.broker_email || '',
        image_link_1: item.image_link_1 || DOMUS_IMGS[idx % DOMUS_IMGS.length],
        image_link_2: item.image_link_2 || null,
        image_link_3: item.image_link_3 || null,
        video: item.video || null,
        activo: true,
        created_at: new Date().toISOString(),
        // extra fields from demo json
        empresa: item.empresa || '',
        codigo_finca_raiz: item.codigo_finca_raiz || '',
        url_finca_raiz: item.URL_Finca_Raiz || '',
        url_metro_cuadrado: item.URL_Metro_Cuadrado || '',
        url_century21: item.Url_Century21 || '',
      }))
      memoryStore.inventario = [...mapped, ...memoryStore.inventario]
    }
  } catch (e) {
    console.warn('[seeder] Could not load inmuebles-demo.json:', e.message)
  }

  memoryStore.campaigns = DEMO_CAMPAIGNS
  memoryStore.performanceLogs = generatePerfLogs(DEMO_EMPRESA_ID)
  memoryStore.waLogs = generateWALogs(DEMO_EMPRESA_ID)
  memoryStore.aiLogs = [
    { id: 'log-001', empresa_id: DEMO_EMPRESA_ID, campaign_id: 'demo-camp-001', trigger_type: 'scheduled', decision: 'scale', reason: 'CTR 4.2% supera umbral. Escalando presupuesto.', new_budget: 80000, created_at: new Date(Date.now()-3600000).toISOString() },
    { id: 'log-002', empresa_id: DEMO_EMPRESA_ID, campaign_id: 'demo-camp-001', trigger_type: 'scheduled', decision: 'pause', reason: 'CTR 0.3% bajo umbral mínimo de 0.8%.', new_budget: null, created_at: new Date(Date.now()-7200000).toISOString() },
    { id: 'log-003', empresa_id: DEMO_EMPRESA_ID, campaign_id: 'demo-camp-003', trigger_type: 'manual', decision: 'keep', reason: 'CTR 1.8% estable, métricas saludables.', new_budget: null, created_at: new Date(Date.now()-10800000).toISOString() },
  ]
}

// Run seeder against Supabase if configured
async function seedSupabase() {
  const sb = getClient()
  if (!sb) {
    console.log('[seeder] No Supabase — using in-memory demo data')
    seedMemory()
    return false
  }

  // Check if already seeded
  const { data: existing } = await sb.from('ad_campaigns').select('id').eq('empresa_id', DEMO_EMPRESA_ID).limit(1)
  if (existing && existing.length > 0) {
    console.log('[seeder] Supabase already seeded')
    return true
  }

  console.log('[seeder] Seeding Supabase with demo data...')
  try {
    // Empresa
    await sb.from('empresas').upsert({ id: DEMO_EMPRESA_ID, nombre: 'Rentmies Demo Agency', plan: 'Pro', activa: true })
    // Profiles
    for (const p of DEMO_PROFILES) {
      await sb.from('profiles').upsert(p)
    }
    // Inventario
    await sb.from('inventario_sql').upsert(DEMO_PROPERTIES)
    // Campaigns
    await sb.from('ad_campaigns').upsert(DEMO_CAMPAIGNS)
    // Performance logs (batched)
    const logs = generatePerfLogs(DEMO_EMPRESA_ID)
    for (let i = 0; i < logs.length; i += 100) {
      await sb.from('ad_performance_logs').insert(logs.slice(i, i + 100))
    }
    // WA logs
    const waLogs = generateWALogs(DEMO_EMPRESA_ID)
    for (let i = 0; i < waLogs.length; i += 100) {
      await sb.from('whatsapp_template_analytics').upsert(waLogs.slice(i, i + 100), { onConflict: 'empresa_id,template_name,log_date' })
    }
    console.log('[seeder] Supabase seeded successfully')
    return true
  } catch (e) {
    console.error('[seeder] Error seeding Supabase:', e.message)
    seedMemory()
    return false
  }
}

module.exports = { seedSupabase, seedMemory, memoryStore, DEMO_EMPRESA_ID, DEMO_PROPERTIES, DEMO_CAMPAIGNS, WA_TEMPLATES }
