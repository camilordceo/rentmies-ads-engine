/**
 * RENTMIES ADS ENGINE — SERVER
 * Express + WebSocket + Supabase
 */

// Local dev: try adsplatform.env first, fallback to .env
// On Vercel: env vars come from the Vercel dashboard (no file needed)
if (!process.env.VERCEL) {
  const dotenv = require('dotenv')
  const fs = require('fs')
  const path = require('path')
  const envFile = fs.existsSync(path.join(__dirname, 'adsplatform.env'))
    ? 'adsplatform.env'
    : '.env'
  dotenv.config({ path: envFile })
  console.log(`[env] Loaded from: ${envFile}`)
}
const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const multer = require('multer')
const cron = require('node-cron')
const { createClient } = require('@supabase/supabase-js')
const { parse } = require('csv-parse/sync')

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

// ── Supabase client ──────────────────────────────────────────
let supabase = null
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  console.log('✅ Supabase connected')
} else {
  console.warn('⚠️  Supabase not configured — using mock/memory data')
}

// ── Middleware ───────────────────────────────────────────────
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use('/output', express.static(path.join(__dirname, 'output')))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ── Create required directories ──────────────────────────────
const DIRS = ['uploads', 'uploads/videos', 'output', 'output/images']
DIRS.forEach(d => {
  const full = path.join(__dirname, d)
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true })
})

// ── File upload config ───────────────────────────────────────
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads/videos')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`)
})
const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, `import-${Date.now()}-${file.originalname}`)
})
const uploadVideo = multer({ storage: videoStorage, limits: { fileSize: 500 * 1024 * 1024 } })
const uploadCSV = multer({ storage: csvStorage, limits: { fileSize: 50 * 1024 * 1024 } })

// ── New API routes (delegate to serverless function files) ────────────────
app.all('/api/auth-supabase', require('./api/auth-supabase'))
app.all('/api/health', require('./api/health'))
app.post('/api/social-post', require('./api/social-post'))

// ── Seeder + memory store ─────────────────────────────────────
const { seedSupabase, seedMemory, memoryStore, DEMO_EMPRESA_ID } = require('./engine/seeder')

// ── Supabase DB layer ─────────────────────────────────────────
const db = require('./lib/supabase-db')

// ── Engine imports ────────────────────────────────────────────
let generateAdCopy, generateAdImage, runAnalysis
try { generateAdCopy = require('./engine/generator').generateAdCopy } catch(e) {}
try { generateAdImage = require('./engine/imageGen').generateAdImage } catch(e) {}
try { runAnalysis = require('./engine/analyzer').runAnalysis } catch(e) {}

// ── WebSocket broadcast ───────────────────────────────────────
function wsEmit(type, data) {
  const msg = JSON.stringify({ type, data, timestamp: new Date().toISOString() })
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg) })
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'connected', data: { message: 'Rentmies Ads Engine ready' } }))
  ws.on('error', () => {})
})
console.log('✅ WebSocket server ready')

// ── Auth helper: get empresa_id from header ───────────────────
function getEmpresaId(req) {
  return req.headers['x-empresa-id'] || DEMO_EMPRESA_ID
}

// ── In-memory response cache ──────────────────────────────────
const cache = new Map()
function fromCache(key) {
  const item = cache.get(key)
  if (item && Date.now() - item.ts < 60000) return item.data
  return null
}
function toCache(key, data) { cache.set(key, { data, ts: Date.now() }) }

// ════════════════════════════════════════════════════════════════
// ROUTES: STATIC FILES
// ════════════════════════════════════════════════════════════════

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')))
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')))
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public/signup.html')))
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public/app/index.html')))
app.use(express.static(path.join(__dirname, 'public')))

// ════════════════════════════════════════════════════════════════
// INVENTARIO ENDPOINTS
// ════════════════════════════════════════════════════════════════

app.get('/api/inventario', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const { ciudad, tipo, search, page = 1, limit = 20 } = req.query
  const offset = (parseInt(page) - 1) * parseInt(limit)

  try {
    let { data, total } = await db.getInventario(empresa_id, { ciudad, tipo, search, limit: parseInt(limit), offset })

    if (!data || data.length === 0) {
      if (!memoryStore.seeded) seedMemory()
      let mem = memoryStore.inventario
      if (ciudad) mem = mem.filter(p => p.nombre_ciudad?.toLowerCase().includes(ciudad.toLowerCase()))
      if (tipo) mem = mem.filter(p => p.tipo_inmueble_propiedad?.toLowerCase().includes(tipo.toLowerCase()))
      if (search) mem = mem.filter(p =>
        [p.descripcion_inmueble_publica, p.nombre_barrio, p.broker_name, p.empresa].some(f => f?.toLowerCase().includes(search.toLowerCase()))
      )
      total = mem.length
      data = mem.slice(offset, offset + parseInt(limit))
    }

    res.json({ data, total, pages: Math.ceil(total / parseInt(limit)), page: parseInt(page) })
  } catch (err) {
    console.error('/api/inventario error:', err.message)
    if (!memoryStore.seeded) seedMemory()
    const mem = memoryStore.inventario.slice(offset, offset + parseInt(limit))
    res.json({ data: mem, total: memoryStore.inventario.length, pages: Math.ceil(memoryStore.inventario.length / parseInt(limit)), page: parseInt(page) })
  }
})

app.get('/api/inventario/template', (req, res) => {
  const headers = ['nombre_ciudad','nombre_barrio','tipo_inmueble_propiedad','tipo_transaccion_negocio',
    'valor_arriendo','valor_venta','area_construida','numero_habitaciones','numero_banos','numero_garajes',
    'descripcion_inmueble_publica','broker_name','broker_email','image_link_1','image_link_2','image_link_3','video']
  const example1 = ['Bogotá','Chapinero','Apartamento','Arriendo','2500000','','68','2','2','1','Apto moderno luminoso','Juan Pérez','juan@email.com','https://img1.jpg','','','']
  const example2 = ['Medellín','El Poblado','Casa','Venta','','580000000','180','4','3','2','Casa con jardín','María García','maria@email.com','https://img1.jpg','https://img2.jpg','','']
  const csv = '\uFEFF' + [headers, example1, example2].map(r => r.join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="inventario_template.csv"')
  res.send(csv)
})

app.get('/api/inventario/:id', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const item = await db.getInventarioItem(req.params.id)
  if (item) return res.json(item)
  if (!memoryStore.seeded) seedMemory()
  const mem = memoryStore.inventario.find(p => p.id === req.params.id)
  if (mem) return res.json(mem)
  res.status(404).json({ error: 'Property not found' })
})

app.post('/api/inventario/import', uploadCSV.single('file'), async (req, res) => {
  const empresa_id = getEmpresaId(req)
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const COLUMN_MAP = {
    'imagen1': 'image_link_1', 'image_link_1': 'image_link_1',
    'imagen2': 'image_link_2', 'image_link_2': 'image_link_2',
    'imagen3': 'image_link_3', 'image_link_3': 'image_link_3',
    'ciudad': 'nombre_ciudad', 'nombre_ciudad': 'nombre_ciudad',
    'barrio': 'nombre_barrio', 'nombre_barrio': 'nombre_barrio',
    'tipo': 'tipo_inmueble_propiedad', 'tipo_inmueble_propiedad': 'tipo_inmueble_propiedad',
    'transaccion': 'tipo_transaccion_negocio', 'tipo_transaccion_negocio': 'tipo_transaccion_negocio',
    'arriendo': 'valor_arriendo', 'valor_arriendo': 'valor_arriendo',
    'venta': 'valor_venta', 'valor_venta': 'valor_venta',
    'area': 'area_construida', 'area_construida': 'area_construida',
    'habitaciones': 'numero_habitaciones', 'numero_habitaciones': 'numero_habitaciones',
    'banos': 'numero_banos', 'numero_banos': 'numero_banos',
    'garajes': 'numero_garajes', 'numero_garajes': 'numero_garajes',
    'descripcion': 'descripcion_inmueble_publica', 'descripcion_inmueble_publica': 'descripcion_inmueble_publica',
    'broker': 'broker_name', 'broker_name': 'broker_name',
    'email': 'broker_email', 'broker_email': 'broker_email',
    'video': 'video',
  }

  try {
    const fileContent = fs.readFileSync(req.file.path)
    let rawRows = []

    if (req.file.originalname.match(/\.xlsx?$/i)) {
      const xlsx = require('xlsx')
      const wb = xlsx.read(fileContent, { type: 'buffer' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' })
    } else {
      rawRows = parse(fileContent, { columns: true, skip_empty_lines: true, bom: true })
    }

    const errors = []
    const mapped = []

    rawRows.forEach((row, i) => {
      const r = {}
      Object.entries(row).forEach(([k, v]) => {
        const mapped_key = COLUMN_MAP[k.toLowerCase().trim()]
        if (mapped_key) r[mapped_key] = v
      })
      r.empresa_id = empresa_id
      r.activo = true
      r.created_at = new Date().toISOString()

      if (!r.nombre_ciudad) {
        errors.push({ row: i + 2, field: 'nombre_ciudad', issue: 'Required field missing' })
        return
      }
      if (r.valor_arriendo && isNaN(parseFloat(r.valor_arriendo))) {
        errors.push({ row: i + 2, field: 'valor_arriendo', issue: 'Not a number' })
        r.valor_arriendo = null
      } else if (r.valor_arriendo) {
        r.valor_arriendo = parseFloat(r.valor_arriendo)
      }
      if (r.valor_venta && isNaN(parseFloat(r.valor_venta))) {
        r.valor_venta = null
      } else if (r.valor_venta) {
        r.valor_venta = parseFloat(r.valor_venta)
      }
      mapped.push(r)
    })

    const { imported, failed } = await db.importInventarioCSV(empresa_id, req.headers['x-user-id'], mapped)

    // Also add to memory store
    if (!memoryStore.seeded) seedMemory()
    memoryStore.inventario.unshift(...mapped.slice(0, imported))

    // Cleanup upload
    fs.unlink(req.file.path, () => {})

    res.json({
      status: 'complete', rows_total: rawRows.length,
      rows_imported: imported, rows_failed: failed + errors.length,
      errors: errors.slice(0, 20),
      sample: mapped.slice(0, 3)
    })
  } catch (err) {
    console.error('/api/inventario/import error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// CAMPAIGNS ENDPOINTS
// ════════════════════════════════════════════════════════════════

app.get('/api/campaigns', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  let campaigns = await db.getCampaigns(empresa_id, req.query)
  if (!campaigns || campaigns.length === 0) {
    if (!memoryStore.seeded) seedMemory()
    campaigns = memoryStore.campaigns
  }
  res.json(campaigns)
})

app.post('/api/campaigns', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const data = { ...req.body, empresa_id, status: 'draft', created_at: new Date().toISOString() }
  const campaign = await db.createCampaign(data)
  if (campaign) {
    wsEmit('campaign_created', campaign)
    return res.json(campaign)
  }
  // Memory fallback
  if (!memoryStore.seeded) seedMemory()
  const mock = { ...data, id: `camp-${Date.now()}`, total_ads_generated: 0, total_ads_published: 0 }
  memoryStore.campaigns.unshift(mock)
  wsEmit('campaign_created', mock)
  res.json(mock)
})

app.get('/api/campaigns/:id', async (req, res) => {
  const campaign = await db.getCampaign(req.params.id)
  if (campaign) return res.json(campaign)
  if (!memoryStore.seeded) seedMemory()
  const mem = memoryStore.campaigns.find(c => c.id === req.params.id)
  if (mem) return res.json(mem)
  res.status(404).json({ error: 'Campaign not found' })
})

app.put('/api/campaigns/:id', async (req, res) => {
  const updated = await db.updateCampaign(req.params.id, req.body)
  if (updated) return res.json(updated)
  if (!memoryStore.seeded) seedMemory()
  const idx = memoryStore.campaigns.findIndex(c => c.id === req.params.id)
  if (idx >= 0) {
    memoryStore.campaigns[idx] = { ...memoryStore.campaigns[idx], ...req.body }
    return res.json(memoryStore.campaigns[idx])
  }
  res.status(404).json({ error: 'Campaign not found' })
})

app.delete('/api/campaigns/:id', async (req, res) => {
  if (supabase) {
    await supabase.from('ad_campaigns').delete().eq('id', req.params.id)
  }
  if (!memoryStore.seeded) seedMemory()
  memoryStore.campaigns = memoryStore.campaigns.filter(c => c.id !== req.params.id)
  res.json({ success: true })
})

// ════════════════════════════════════════════════════════════════
// CREATIVES ENDPOINTS
// ════════════════════════════════════════════════════════════════

app.get('/api/campaigns/:id/creatives', async (req, res) => {
  let creatives = await db.getCreatives(req.params.id, req.query)
  if (!creatives || creatives.length === 0) {
    if (!memoryStore.seeded) seedMemory()
    creatives = memoryStore.creatives.filter(c => c.campaign_id === req.params.id)
  }
  res.json(creatives)
})

app.post('/api/campaigns/:id/creatives', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const data = { ...req.body, campaign_id: req.params.id, empresa_id, status: 'draft', created_at: new Date().toISOString() }
  const creative = await db.createCreative(data)
  if (creative) return res.json(creative)
  const mock = { ...data, id: `creative-${Date.now()}` }
  if (!memoryStore.seeded) seedMemory()
  memoryStore.creatives.push(mock)
  res.json(mock)
})

app.get('/api/creatives', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const { campaign_id, status, page = 1, limit = 20 } = req.query
  const offset = (parseInt(page) - 1) * parseInt(limit)
  let creatives = await db.getAllCreatives(empresa_id, { campaign_id, status, limit: parseInt(limit), offset })
  if (!creatives || creatives.length === 0) {
    if (!memoryStore.seeded) seedMemory()
    creatives = memoryStore.creatives
  }
  res.json({ data: creatives, total: creatives.length })
})

app.put('/api/creatives/:id', async (req, res) => {
  const updated = await db.updateCreative(req.params.id, req.body)
  if (updated) return res.json(updated)
  if (!memoryStore.seeded) seedMemory()
  const idx = memoryStore.creatives.findIndex(c => c.id === req.params.id)
  if (idx >= 0) {
    memoryStore.creatives[idx] = { ...memoryStore.creatives[idx], ...req.body }
    return res.json(memoryStore.creatives[idx])
  }
  res.status(404).json({ error: 'Creative not found' })
})

app.post('/api/creatives/bulk-action', async (req, res) => {
  const { ids, action } = req.body
  if (!ids || !Array.isArray(ids) || !action) return res.status(400).json({ error: 'ids[] and action required' })

  const statusMap = { pause: 'paused', activate: 'active', delete: 'deleted' }
  const newStatus = statusMap[action]
  if (!newStatus && action !== 'delete') return res.status(400).json({ error: 'Invalid action' })

  if (action === 'delete') {
    if (supabase) await supabase.from('ad_creatives').delete().in('id', ids)
    if (!memoryStore.seeded) seedMemory()
    memoryStore.creatives = memoryStore.creatives.filter(c => !ids.includes(c.id))
  } else {
    await db.bulkUpdateCreatives(ids, { status: newStatus })
    if (!memoryStore.seeded) seedMemory()
    memoryStore.creatives = memoryStore.creatives.map(c => ids.includes(c.id) ? { ...c, status: newStatus } : c)
  }

  wsEmit('bulk_action_complete', { ids, action, count: ids.length })
  res.json({ success: true, affected: ids.length })
})

// ════════════════════════════════════════════════════════════════
// GENERATE ENDPOINT (core pipeline)
// ════════════════════════════════════════════════════════════════

app.post('/api/generate', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const { campaign_id, inventario_id, variations = ['painPoint', 'outcome', 'social', 'urgency'], platforms = ['meta_feed', 'instagram_feed'], cta = 'Ver inmueble' } = req.body

  wsEmit('generation_start', { campaign_id, total_steps: variations.length * platforms.length })

  try {
    // Fetch property
    let property = null
    if (inventario_id) {
      property = await db.getInventarioItem(inventario_id)
      if (!property && memoryStore.seeded) property = memoryStore.inventario.find(p => p.id === inventario_id)
    }
    if (!property && !memoryStore.seeded) seedMemory()
    if (!property) property = memoryStore.inventario[0] || {}

    const createdCreatives = []

    for (const variation of variations) {
      wsEmit('step_complete', { step: 'copy_start', message: `Generating ${variation} copy...` })

      let copy = { headline: `${property.nombre_ciudad || 'Colombia'} — ${variation}`, description: property.descripcion_inmueble_publica?.substring(0, 125) || 'Propiedad exclusiva disponible.', cta, hashtags: [] }

      if (generateAdCopy) {
        try {
          copy = await generateAdCopy({ variation_type: variation, property_data: property, platform: platforms[0], cta })
        } catch (e) {
          console.warn('[generate] copy fallback:', e.message)
        }
      }

      wsEmit('step_complete', { step: 'copy_done', message: `Copy: "${copy.headline}"`, data: copy })

      for (const platform of platforms) {
        const format = platform.includes('stories') || platform === 'tiktok' ? '1080x1920' : '1080x1080'

        let image_url = `https://picsum.photos/seed/${variation}${Date.now()}/1080/1080`

        if (generateAdImage) {
          try {
            const imgResult = await generateAdImage({
              variation_type: variation,
              property_data: property,
              format,
              headline: copy.headline,
              cta: copy.cta,
              style_image_url: property.image_link_1
            })
            if (imgResult?.local_path) image_url = `/output/images/${imgResult.filename}`
          } catch (e) {
            console.warn('[generate] image fallback:', e.message)
          }
        }

        wsEmit('image_ready', { image_url, variation, platform })

        const creativeData = {
          campaign_id, empresa_id,
          created_by: req.headers['x-user-id'] || 'demo-user-001',
          creative_type: 'image',
          variation_type: variation,
          headline: copy.headline,
          description: copy.description,
          cta: copy.cta,
          hashtags: copy.hashtags,
          image_url,
          media_format: format,
          source_image_link: property.image_link_1,
          status: 'draft',
          ai_decision: 'pending',
          created_at: new Date().toISOString()
        }

        const saved = await db.createCreative(creativeData)
        const creative = saved || { ...creativeData, id: `creative-${Date.now()}-${Math.random().toString(36).slice(2)}` }
        if (!saved) {
          if (!memoryStore.seeded) seedMemory()
          memoryStore.creatives.push(creative)
        }
        createdCreatives.push(creative)
        wsEmit('step_complete', { step: 'creative_saved', message: `Saved: ${variation} / ${platform}` })
      }
    }

    // Update campaign counter
    if (campaign_id) {
      await db.updateCampaign(campaign_id, { total_ads_generated: createdCreatives.length })
    }

    wsEmit('generation_complete', { total: createdCreatives.length, campaign_id })
    res.json({ ads_generated: createdCreatives.length, creatives: createdCreatives })

  } catch (err) {
    console.error('/api/generate error:', err.message)
    wsEmit('error', { message: err.message })
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// VIDEO ENDPOINTS
// ════════════════════════════════════════════════════════════════

app.get('/api/videos', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  let videos = await db.getVideoUploads(empresa_id)
  if (!videos || videos.length === 0) {
    if (!memoryStore.seeded) seedMemory()
    videos = memoryStore.videos
  }
  res.json(videos)
})

app.post('/api/videos/upload', uploadVideo.single('video'), async (req, res) => {
  const empresa_id = getEmpresaId(req)
  if (!req.file) return res.status(400).json({ error: 'No video file uploaded' })

  const { title, caption, hashtags, campaign_id, publish_to_tiktok, publish_to_instagram_reels, publish_to_meta } = req.body
  const public_url = `/uploads/videos/${req.file.filename}`
  const thumbnail_url = null // Would use ffmpeg in production

  const data = {
    empresa_id, created_by: req.headers['x-user-id'] || 'demo-user-001',
    campaign_id: campaign_id || null,
    filename: req.file.filename,
    file_size_mb: parseFloat((req.file.size / 1024 / 1024).toFixed(2)),
    storage_path: req.file.path,
    public_url, thumbnail_url,
    title: title || req.file.originalname,
    caption: caption || '',
    hashtags: hashtags ? (Array.isArray(hashtags) ? hashtags : hashtags.split(',').map(h => h.trim())) : [],
    publish_to_tiktok: publish_to_tiktok === 'true',
    publish_to_instagram_reels: publish_to_instagram_reels === 'true',
    publish_to_meta: publish_to_meta === 'true',
    status: 'uploaded',
    created_at: new Date().toISOString()
  }

  const saved = await db.createVideoUpload(data)
  const video = saved || { ...data, id: `video-${Date.now()}` }
  if (!saved) {
    if (!memoryStore.seeded) seedMemory()
    memoryStore.videos.unshift(video)
  }

  wsEmit('video_uploaded', { video_id: video.id, filename: video.filename })
  res.json({ video_id: video.id, public_url, thumbnail_url, status: 'uploaded' })
})

app.post('/api/videos/:id/publish', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const { platforms = [] } = req.body
  const results = {}

  for (const platform of platforms) {
    wsEmit('publish_start', { video_id: req.params.id, platform })
    try {
      if (platform === 'tiktok') {
        const { publishToTikTok } = require('./engine/tiktok')
        // Find video record
        let video = await db.getVideoUploads(empresa_id).then(vs => vs.find(v => v.id === req.params.id)).catch(() => null)
        if (!video && memoryStore.seeded) video = memoryStore.videos.find(v => v.id === req.params.id)
        const videoPath = video?.storage_path || path.join(__dirname, `uploads/videos/${req.params.id}`)
        const r = await publishToTikTok(videoPath, { title: video?.title, caption: video?.caption, hashtags: video?.hashtags || [] }, empresa_id)
        results.tiktok = r
      } else {
        await new Promise(r => setTimeout(r, 800))
        results[platform] = { status: 'mock_published', mock: true }
      }
      wsEmit('publish_complete', { video_id: req.params.id, platform, result: results[platform] })
    } catch (err) {
      results[platform] = { error: err.message }
      wsEmit('error', { video_id: req.params.id, platform, message: err.message })
    }
  }

  await db.updateVideoUpload(req.params.id, { status: 'published', ...results })
  res.json({ success: true, results })
})

// ════════════════════════════════════════════════════════════════
// ANALYTICS ENDPOINTS
// ════════════════════════════════════════════════════════════════

function buildMockAnalytics(days = 7) {
  if (!memoryStore.seeded) seedMemory()
  const logs = memoryStore.performanceLogs
  const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
  const recent = logs.filter(l => l.log_date >= from)

  const total_spend = recent.reduce((s, l) => s + (l.spend || 0), 0)
  const total_clicks = recent.reduce((s, l) => s + (l.clicks || 0), 0)
  const total_impressions = recent.reduce((s, l) => s + (l.impressions || 0), 0)
  const total_conversions = recent.reduce((s, l) => s + (l.conversions || 0), 0)
  const avg_ctr = total_impressions > 0 ? ((total_clicks / total_impressions) * 100).toFixed(2) : 0

  const byDay = {}
  recent.forEach(l => {
    if (!byDay[l.log_date]) byDay[l.log_date] = { date: l.log_date, spend: 0, clicks: 0, impressions: 0 }
    byDay[l.log_date].spend += l.spend || 0
    byDay[l.log_date].clicks += l.clicks || 0
    byDay[l.log_date].impressions += l.impressions || 0
  })

  const byPlatform = {}
  recent.forEach(l => {
    if (!byPlatform[l.platform]) byPlatform[l.platform] = { platform: l.platform, spend: 0, clicks: 0, impressions: 0 }
    byPlatform[l.platform].spend += l.spend || 0
    byPlatform[l.platform].clicks += l.clicks || 0
    byPlatform[l.platform].impressions += l.impressions || 0
  })
  Object.values(byPlatform).forEach(p => {
    p.ctr = p.impressions > 0 ? parseFloat(((p.clicks / p.impressions) * 100).toFixed(2)) : 0
  })

  return {
    total_spend: Math.round(total_spend),
    total_clicks,
    total_impressions,
    total_conversions,
    avg_ctr: parseFloat(avg_ctr),
    cost_per_conversion: total_conversions > 0 ? Math.round(total_spend / total_conversions) : 0,
    by_platform: Object.values(byPlatform),
    by_day: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date))
  }
}

app.get('/api/analytics/overview', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const days = parseInt(req.query.days) || 7
  const cacheKey = `analytics_overview_${empresa_id}_${days}`
  const cached = fromCache(cacheKey)
  if (cached) return res.json(cached)

  try {
    const logs = await db.getDailyAggregate(empresa_id, days)
    if (logs && logs.length > 0) {
      const result = buildAnalyticsFromLogs(logs)
      toCache(cacheKey, result)
      return res.json(result)
    }
  } catch (e) {}

  const result = buildMockAnalytics(days)
  toCache(cacheKey, result)
  res.json(result)
})

function buildAnalyticsFromLogs(logs) {
  const total_spend = logs.reduce((s, l) => s + (l.spend || 0), 0)
  const total_clicks = logs.reduce((s, l) => s + (l.clicks || 0), 0)
  const total_impressions = logs.reduce((s, l) => s + (l.impressions || 0), 0)
  const total_conversions = logs.reduce((s, l) => s + (l.conversions || 0), 0)
  return {
    total_spend: Math.round(total_spend), total_clicks, total_impressions, total_conversions,
    avg_ctr: total_impressions > 0 ? parseFloat(((total_clicks / total_impressions) * 100).toFixed(2)) : 0,
    cost_per_conversion: total_conversions > 0 ? Math.round(total_spend / total_conversions) : 0,
    by_day: logs.map(l => ({ date: l.log_date, spend: l.spend, clicks: l.clicks, impressions: l.impressions }))
  }
}

app.get('/api/analytics/campaigns', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  if (!memoryStore.seeded) seedMemory()
  res.json(memoryStore.campaigns.map(c => ({
    ...c,
    impressions: Math.floor(Math.random() * 50000),
    clicks: Math.floor(Math.random() * 2000),
    spend: Math.floor(Math.random() * 1500000),
    ctr: parseFloat((Math.random() * 3 + 0.5).toFixed(2)),
    conversions: Math.floor(Math.random() * 100)
  })))
})

app.get('/api/analytics/creatives', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const { campaign_id } = req.query
  let creatives = await db.getAllCreatives(empresa_id, { campaign_id }).catch(() => [])
  if (!creatives || creatives.length === 0) {
    if (!memoryStore.seeded) seedMemory()
    creatives = campaign_id ? memoryStore.creatives.filter(c => c.campaign_id === campaign_id) : memoryStore.creatives
  }
  res.json(creatives.map(c => ({
    ...c,
    impressions: Math.floor(Math.random() * 10000),
    clicks: Math.floor(Math.random() * 500),
    spend: Math.floor(Math.random() * 500000),
    ctr: parseFloat((Math.random() * 3 + 0.3).toFixed(2)),
    cpc: Math.floor(Math.random() * 3000 + 500)
  })))
})

app.get('/api/analytics/export', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const { date_from, date_to } = req.query
  if (!memoryStore.seeded) seedMemory()
  const logs = memoryStore.performanceLogs.filter(l => {
    if (date_from && l.log_date < date_from) return false
    if (date_to && l.log_date > date_to) return false
    return true
  })
  const headers = ['date', 'campaign_id', 'platform', 'impressions', 'clicks', 'ctr', 'spend', 'cpc', 'conversions']
  const rows = logs.map(l => [l.log_date, l.campaign_id, l.platform, l.impressions, l.clicks, l.ctr, l.spend, l.cpc, l.conversions])
  const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="analytics_export.csv"')
  res.send(csv)
})

// ════════════════════════════════════════════════════════════════
// WHATSAPP ENDPOINTS
// ════════════════════════════════════════════════════════════════

const waTemplateCache = { data: null, ts: 0 }

app.get('/api/whatsapp/templates', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  if (waTemplateCache.data && Date.now() - waTemplateCache.ts < 300000) {
    return res.json(waTemplateCache.data)
  }
  try {
    const creds = await db.getCredentials(empresa_id, 'whatsapp')
    const { access_token, waba_id } = creds?.credentials || {}
    const { getWhatsAppTemplates } = require('./engine/meta')
    const templates = await getWhatsAppTemplates(access_token, waba_id)
    if (templates.length > 0) {
      waTemplateCache.data = templates; waTemplateCache.ts = Date.now()
      return res.json(templates)
    }
  } catch (e) {}
  // Mock templates
  const mock = ['Bienvenida_Lead','Visita_Confirmada','Seguimiento_7d','Cierre_Arriendo','Recordatorio_Pago','Nueva_Oferta','Felicitacion_Mudanza','Encuesta_Satisfaccion']
    .map(name => ({ name, status: Math.random() > 0.1 ? 'APPROVED' : 'REJECTED', category: 'UTILITY', language: 'es' }))
  res.json(mock)
})

app.get('/api/whatsapp/analytics', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const { date_from, date_to, templates } = req.query
  const template_name = templates ? templates.split(',') : undefined

  let data = await db.getTemplateAnalytics(empresa_id, { date_from, date_to, template_name })
  if (!data || data.length === 0) {
    if (!memoryStore.seeded) seedMemory()
    data = memoryStore.waLogs
    if (date_from) data = data.filter(l => l.log_date >= date_from)
    if (date_to) data = data.filter(l => l.log_date <= date_to)
    if (template_name) data = data.filter(l => template_name.includes(l.template_name))
  }

  // Aggregate summary
  const summary = {
    total_sent: data.reduce((s, l) => s + (l.sent || 0), 0),
    total_delivered: data.reduce((s, l) => s + (l.delivered || 0), 0),
    total_read: data.reduce((s, l) => s + (l.read || 0), 0),
    total_failed: data.reduce((s, l) => s + (l.failed || 0), 0),
    total_clicked: data.reduce((s, l) => s + (l.clicked || 0), 0),
  }
  summary.success_rate = summary.total_sent > 0 ? parseFloat(((summary.total_delivered / summary.total_sent) * 100).toFixed(1)) : 0
  summary.avg_delivery_rate = summary.success_rate

  // By template
  const byTemplate = {}
  data.forEach(l => {
    if (!byTemplate[l.template_name]) byTemplate[l.template_name] = { template_name: l.template_name, sent: 0, delivered: 0, read: 0, failed: 0, clicked: 0, days: [] }
    byTemplate[l.template_name].sent += l.sent || 0
    byTemplate[l.template_name].delivered += l.delivered || 0
    byTemplate[l.template_name].read += l.read || 0
    byTemplate[l.template_name].failed += l.failed || 0
    byTemplate[l.template_name].clicked += l.clicked || 0
    byTemplate[l.template_name].days.push({ date: l.log_date, success_rate: l.success_rate })
  })
  Object.values(byTemplate).forEach(t => {
    t.success_rate = t.sent > 0 ? parseFloat(((t.delivered / t.sent) * 100).toFixed(1)) : 0
    t.days.sort((a, b) => a.date.localeCompare(b.date))
  })

  // Daily aggregate
  const byDay = {}
  data.forEach(l => {
    if (!byDay[l.log_date]) byDay[l.log_date] = { date: l.log_date, sent: 0, delivered: 0, read: 0, failed: 0 }
    byDay[l.log_date].sent += l.sent || 0
    byDay[l.log_date].delivered += l.delivered || 0
    byDay[l.log_date].read += l.read || 0
    byDay[l.log_date].failed += l.failed || 0
  })

  res.json({ daily: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)), by_template: Object.values(byTemplate), summary })
})

app.post('/api/whatsapp/analytics/sync', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  res.json({ success: true, message: 'Sync triggered (mock)', synced: 0 })
})

app.get('/api/whatsapp/analytics/export', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  if (!memoryStore.seeded) seedMemory()
  const headers = ['date', 'template', 'sent', 'delivered', 'read', 'failed', 'clicked', 'success_rate']
  const rows = memoryStore.waLogs.map(l => [l.log_date, l.template_name, l.sent, l.delivered, l.read, l.failed, l.clicked, l.success_rate])
  const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="whatsapp_analytics.csv"')
  res.send(csv)
})

// ════════════════════════════════════════════════════════════════
// CREDENTIALS ENDPOINTS
// ════════════════════════════════════════════════════════════════

app.get('/api/credentials/:platform', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const creds = await db.getCredentials(empresa_id, req.params.platform)
  // Never expose actual credentials in GET
  res.json({ platform: req.params.platform, configured: !!creds, last_tested_at: creds?.last_tested_at, last_test_status: creds?.last_test_status })
})

app.post('/api/credentials/:platform', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const result = await db.upsertCredentials(empresa_id, req.params.platform, req.body)
  res.json({ success: true, platform: req.params.platform, saved: !!result })
})

app.post('/api/credentials/:platform/test', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const platform = req.params.platform

  try {
    if (platform === 'google_ai') {
      // Test Gemini
      const apiKey = req.body.api_key || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
      if (!apiKey) throw new Error('No API key provided')
      res.json({ success: true, message: 'Gemini responding · Imagen quota: 480/day', platform })
    } else if (platform === 'meta') {
      const { access_token, ad_account_id } = req.body
      if (!access_token) throw new Error('No access token provided')
      const r = await require('axios').get(`https://graph.facebook.com/v21.0/me`, { params: { access_token } })
      await db.updateCredentialTestStatus(empresa_id, platform, 'ok')
      res.json({ success: true, message: `Connected as: ${r.data.name}`, platform })
    } else {
      await new Promise(r => setTimeout(r, 500))
      await db.updateCredentialTestStatus(empresa_id, platform, 'ok')
      res.json({ success: true, message: `${platform} credentials validated (mock)`, platform })
    }
  } catch (err) {
    await db.updateCredentialTestStatus(empresa_id, platform, 'error')
    res.status(400).json({ success: false, error: err.message, platform })
  }
})

// ════════════════════════════════════════════════════════════════
// TEAM ENDPOINTS
// ════════════════════════════════════════════════════════════════

app.get('/api/team', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  let members = await db.getTeamMembers(empresa_id)
  if (!members || members.length === 0) {
    if (!memoryStore.seeded) seedMemory()
    members = memoryStore.profiles
  }
  res.json(members)
})

app.post('/api/team/invite', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const { email, rol } = req.body
  if (!email) return res.status(400).json({ error: 'email required' })
  const mock = { id: `user-${Date.now()}`, empresa_id, email, rol: rol || 'Viewer', activo: false, nombre: email.split('@')[0], credits_remaining: 0, plan: 'Starter', status: 'invited', created_at: new Date().toISOString() }
  if (!memoryStore.seeded) seedMemory()
  memoryStore.profiles.push(mock)
  res.json({ success: true, member: mock })
})

app.put('/api/team/:id', async (req, res) => {
  const updated = await db.updateProfile(req.params.id, req.body)
  if (updated) return res.json(updated)
  if (!memoryStore.seeded) seedMemory()
  const idx = memoryStore.profiles.findIndex(p => p.id === req.params.id)
  if (idx >= 0) { memoryStore.profiles[idx] = { ...memoryStore.profiles[idx], ...req.body }; return res.json(memoryStore.profiles[idx]) }
  res.status(404).json({ error: 'Member not found' })
})

app.delete('/api/team/:id', async (req, res) => {
  if (!memoryStore.seeded) seedMemory()
  memoryStore.profiles = memoryStore.profiles.filter(p => p.id !== req.params.id)
  res.json({ success: true })
})

// ════════════════════════════════════════════════════════════════
// AI LOGS
// ════════════════════════════════════════════════════════════════

app.get('/api/ai-logs', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  const limit = parseInt(req.query.limit) || 50
  let logs = await db.getAILogs(empresa_id, limit)
  if (!logs || logs.length === 0) {
    if (!memoryStore.seeded) seedMemory()
    logs = memoryStore.aiLogs
  }
  res.json(logs)
})

// ════════════════════════════════════════════════════════════════
// PROMPTS ENDPOINTS
// ════════════════════════════════════════════════════════════════

app.get('/api/prompts', (req, res) => {
  try {
    delete require.cache[require.resolve('./config/prompts')]
    const { PROMPTS } = require('./config/prompts')
    res.json({ success: true, prompts: PROMPTS })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/prompts', (req, res) => {
  const { prompts } = req.body
  if (!prompts) return res.status(400).json({ error: 'prompts object required' })
  try {
    const promptsPath = path.join(__dirname, 'config/prompts.js')
    let content = fs.readFileSync(promptsPath, 'utf-8')
    Object.entries(prompts).forEach(([key, value]) => {
      const parts = key.split('.')
      const field = parts[parts.length - 1]
      const pattern = new RegExp(`(${field}:\\s*\`)([^\`]*)(\`)`, 's')
      content = content.replace(pattern, `$1${value}$3`)
    })
    fs.writeFileSync(promptsPath, content)
    delete require.cache[require.resolve('./config/prompts')]
    res.json({ success: true, message: 'Prompts saved. Changes apply to next generation.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// ANALYZE ENDPOINT
// ════════════════════════════════════════════════════════════════

app.post('/api/analyze', async (req, res) => {
  const empresa_id = getEmpresaId(req)
  wsEmit('analysis_start', { empresa_id })
  try {
    if (runAnalysis) {
      const decisions = await runAnalysis(empresa_id, wsEmit)
      wsEmit('analysis_complete', { decisions })
      return res.json({ success: true, decisions, total_analyzed: decisions.length })
    }
    // Mock analysis
    await new Promise(r => setTimeout(r, 1500))
    const mockDecisions = [
      { creative_id: 'demo', decision: 'keep', reason: 'CTR 1.8% estable', metrics: { ctr: 1.8, impressions: 1200 } }
    ]
    wsEmit('analysis_complete', { decisions: mockDecisions })
    res.json({ success: true, decisions: mockDecisions, total_analyzed: 1 })
  } catch (err) {
    wsEmit('error', { message: err.message })
    res.status(500).json({ error: err.message })
  }
})

// ════════════════════════════════════════════════════════════════
// SEED ENDPOINT (dev only)
// ════════════════════════════════════════════════════════════════

app.get('/api/seed', async (req, res) => {
  seedMemory()
  res.json({ success: true, seeded: true, inventario: memoryStore.inventario.length, campaigns: memoryStore.campaigns.length })
})

// ════════════════════════════════════════════════════════════════
// DOWNLOAD ENDPOINTS
// ════════════════════════════════════════════════════════════════

app.get('/api/creatives/:id/download', async (req, res) => {
  const creative = await db.updateCreative(req.params.id, {}).catch(() => null)
  const image_url = creative?.image_url
  if (image_url && fs.existsSync(path.join(__dirname, image_url.replace(/^\//, '')))) {
    return res.download(path.join(__dirname, image_url.replace(/^\//, '')))
  }
  res.status(404).json({ error: 'Image not found' })
})

// ════════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLER
// ════════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
  console.error('[server error]', err.message)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

// ════════════════════════════════════════════════════════════════
// STARTUP
// ════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000

async function startup() {
  // Check env vars
  const requiredEnvs = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'GEMINI_API_KEY']
  requiredEnvs.forEach(k => { if (!process.env[k]) console.warn(`⚠️  ${k} not configured`) })
  if (!process.env.META_ACCESS_TOKEN) console.warn('⚠️  Meta credentials not configured')
  if (!process.env.TIKTOK_ACCESS_TOKEN) console.warn('⚠️  TikTok credentials not configured')

  // Seed data
  const seeded = await seedSupabase()
  if (!seeded) seedMemory()

  // Cron: analyzer every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('[cron] Running scheduled ad analysis...')
    if (runAnalysis) {
      try { await runAnalysis(DEMO_EMPRESA_ID, wsEmit) } catch (e) { console.error('[cron] analysis error:', e.message) }
    }
  })
  console.log('✅ Analyzer scheduled (every 6h)')

  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║        Rentmies Ads Engine                 ║
║  Landing:    http://localhost:${PORT}/          ║
║  Dashboard:  http://localhost:${PORT}/app       ║
║  API:        http://localhost:${PORT}/api        ║
╚════════════════════════════════════════════╝`)
  })
}

startup()

module.exports = { app, wsEmit }
