/**
 * RENTMIES ADS ENGINE — SERVER
 * Express + WebSocket server en puerto 3000.
 */

require('dotenv').config()
const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const cors = require('cors')
const path = require('path')
const fs = require('fs')

const { generateCampaign } = require('./engine/generator')
const { generateCampaignImages } = require('./engine/imageGen')
const { publishCampaign, pauseAd, activateAd } = require('./engine/publisher')
const { runAnalysis, startAnalysisCron, generateMockMetrics } = require('./engine/analyzer')

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

// ── Middleware ──
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname)))
app.use('/output', express.static(path.join(__dirname, 'output')))
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')))

// ── WebSocket: broadcast a todos los clientes conectados ──
function wsEmit(event, data) {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() })
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

wss.on('connection', (ws) => {
  console.log('📡 Cliente WebSocket conectado')
  ws.send(JSON.stringify({
    event: 'connected',
    data: { message: 'Rentmies Ads Engine conectado', timestamp: new Date().toISOString() }
  }))

  ws.on('close', () => console.log('📡 Cliente WebSocket desconectado'))
})

// ════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ════════════════════════════════════════════════════════════════

/**
 * POST /api/generate
 * Genera copy e imágenes para una campaña nueva.
 */
app.post('/api/generate', async (req, res) => {
  const {
    ciudad = 'Bogotá',
    tipoInmueble = 'apartamento',
    presupuesto = '1.500.000 - 2.500.000',
    plataformas = ['meta_feed', 'instagram_feed'],
    variaciones = ['painPoint', 'outcome', 'social', 'urgency']
  } = req.body

  console.log(`\n🚀 POST /api/generate — ${ciudad} | ${tipoInmueble}`)
  wsEmit('generation_started', { ciudad, tipoInmueble, presupuesto })

  try {
    // 1. Generar copy
    const ads = await generateCampaign(
      { ciudad, tipoInmueble, presupuesto, plataformas, variaciones },
      wsEmit
    )

    // 2. Generar imágenes
    wsEmit('progress', { step: 'images', status: 'start', message: 'Iniciando generación de imágenes...' })
    const imageResults = await generateCampaignImages(ads, wsEmit)

    // Combinar resultados
    const adsWithImages = ads.map(ad => {
      const imgResult = imageResults.find(r => r.adId === ad.id)
      return { ...ad, feedImage: imgResult?.feedImage, storyImage: imgResult?.storyImage }
    })

    wsEmit('generation_complete', { totalAds: adsWithImages.length, ads: adsWithImages })
    res.json({ success: true, ads: adsWithImages, totalGenerated: adsWithImages.length })

  } catch (err) {
    console.error('Error en /api/generate:', err)
    wsEmit('error', { step: 'generate', message: err.message })
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * POST /api/publish
 * Publica ads generados como DRAFT en las plataformas.
 */
app.post('/api/publish', async (req, res) => {
  const { ads, platforms } = req.body
  if (!ads || !Array.isArray(ads)) {
    return res.status(400).json({ error: 'Se requiere array de ads' })
  }

  console.log(`\n📤 POST /api/publish — ${ads.length} ads`)
  wsEmit('publish_started', { totalAds: ads.length })

  try {
    const results = await publishCampaign(ads, null, wsEmit)
    wsEmit('publish_complete', { results, total: results.length })
    res.json({ success: true, published: results })

  } catch (err) {
    console.error('Error en /api/publish:', err)
    wsEmit('error', { step: 'publish', message: err.message })
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/metrics
 * Retorna métricas mock o reales de Meta API.
 */
app.get('/api/metrics', async (req, res) => {
  try {
    const publishedPath = path.join(__dirname, 'output/published.json')
    const published = fs.existsSync(publishedPath)
      ? JSON.parse(fs.readFileSync(publishedPath, 'utf-8'))
      : []

    // Si no hay ads publicados, generar métricas demo
    const adsToAnalyze = published.length > 0 ? published.slice(0, 10) : getDemoAds()

    const metrics = await Promise.all(
      adsToAnalyze.map(async (ad) => {
        const m = generateMockMetrics(ad.adId || ad.id, ad.variationType || 'painPoint')
        return { ...ad, metrics: m }
      })
    )

    // Calcular totales
    const totals = metrics.reduce((acc, ad) => {
      const m = ad.metrics
      acc.totalImpressions += m.impressions || 0
      acc.totalClicks += m.clicks || 0
      acc.totalSpend += m.spend || 0
      acc.totalConversions += m.conversions || 0
      return acc
    }, { totalImpressions: 0, totalClicks: 0, totalSpend: 0, totalConversions: 0 })

    totals.avgCTR = totals.totalImpressions > 0
      ? ((totals.totalClicks / totals.totalImpressions) * 100).toFixed(2)
      : 0
    totals.costPerLead = totals.totalConversions > 0
      ? Math.floor(totals.totalSpend / totals.totalConversions)
      : 0

    res.json({ success: true, ads: metrics, totals, activeAds: adsToAnalyze.length })

  } catch (err) {
    console.error('Error en /api/metrics:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * POST /api/analyze
 * Ejecuta análisis manual de performance.
 */
app.post('/api/analyze', async (req, res) => {
  console.log('\n🔍 POST /api/analyze')
  wsEmit('analysis_started', { timestamp: new Date().toISOString() })

  try {
    const decisions = await runAnalysis(wsEmit)
    res.json({ success: true, decisions, totalAnalyzed: decisions.length })

  } catch (err) {
    console.error('Error en /api/analyze:', err)
    wsEmit('error', { step: 'analyze', message: err.message })
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * PUT /api/prompts
 * Actualiza un prompt en config/prompts.js.
 */
app.put('/api/prompts', async (req, res) => {
  const { promptKey, newValue } = req.body
  if (!promptKey || !newValue) {
    return res.status(400).json({ error: 'Se requiere promptKey y newValue' })
  }

  try {
    const promptsPath = path.join(__dirname, 'config/prompts.js')
    let content = fs.readFileSync(promptsPath, 'utf-8')

    // Buscar y reemplazar el valor del prompt por key
    // Formato: key: `valor`
    const keyMap = {
      'adCopy.system': /system: `([^`]*)`/,
      'adCopy.painPoint': /painPoint: `([^`]*)`/,
      'adCopy.outcome': /outcome: `([^`]*)`/,
      'adCopy.social': /social: `([^`]*)`/,
      'adCopy.urgency': /urgency: `([^`]*)`/,
      'imagePrompts.style': /style: `([^`]*)`/,
      'analysisPrompts.evaluate': /evaluate: `([^`]*)`/,
    }

    const regex = keyMap[promptKey]
    if (!regex) {
      return res.status(400).json({ error: `Prompt key no válida: ${promptKey}` })
    }

    // Encontrar la sección correcta y reemplazar
    const keyParts = promptKey.split('.')
    const section = keyParts[0]
    const field = keyParts[1]

    // Reemplazo simple: encontrar el campo en la sección correcta
    const sectionIdx = content.indexOf(`${section}:`)
    if (sectionIdx === -1) {
      return res.status(400).json({ error: `Sección no encontrada: ${section}` })
    }

    const fieldPattern = new RegExp(`(${field}:\\s*\`)([^\`]*)(\`)`, 's')
    const newContent = content.replace(fieldPattern, `$1${newValue}$3`)

    if (newContent === content) {
      return res.status(400).json({ error: 'No se encontró el campo para actualizar' })
    }

    fs.writeFileSync(promptsPath, newContent)

    // Invalidar cache del módulo para que se recargue
    delete require.cache[require.resolve('./config/prompts')]

    console.log(`✅ Prompt actualizado: ${promptKey}`)
    res.json({ success: true, updated: promptKey, timestamp: new Date().toISOString() })

  } catch (err) {
    console.error('Error en /api/prompts:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/prompts
 * Retorna todos los prompts actuales.
 */
app.get('/api/prompts', (req, res) => {
  try {
    delete require.cache[require.resolve('./config/prompts')]
    const { PROMPTS } = require('./config/prompts')
    res.json({ success: true, prompts: PROMPTS })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/logs
 * Retorna el log de decisiones de análisis.
 */
app.get('/api/logs', (req, res) => {
  try {
    const logPath = path.join(__dirname, 'output/analysis-log.json')
    const log = fs.existsSync(logPath)
      ? JSON.parse(fs.readFileSync(logPath, 'utf-8'))
      : []
    res.json({ success: true, log: log.slice(-100).reverse() }) // Últimos 100, más recientes primero
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * POST /api/ads/:adId/pause
 */
app.post('/api/ads/:adId/pause', async (req, res) => {
  try {
    const result = await pauseAd(req.params.adId, req.body.platform)
    wsEmit('ad_paused', { adId: req.params.adId })
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * POST /api/ads/:adId/activate
 */
app.post('/api/ads/:adId/activate', async (req, res) => {
  try {
    const result = await activateAd(req.params.adId, req.body.platform)
    wsEmit('ad_activated', { adId: req.params.adId })
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET / — Sirve el dashboard
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/index.html'))
})

// ── Demo ads para métricas cuando no hay ads reales ──
function getDemoAds() {
  return [
    { adId: '120210023848000', variationType: 'urgency', platform: 'meta_feed', ciudad: 'Bogotá', platformName: 'Meta Feed', headline: '¿Cansado de buscar sin respuesta?' },
    { adId: '120210023849000', variationType: 'social', platform: 'instagram_feed', ciudad: 'Medellín', platformName: 'Instagram Feed', headline: 'Ya cerramos +200 arriendos en Medellín' },
    { adId: '120210023850000', variationType: 'painPoint', platform: 'meta_feed', ciudad: 'Cali', platformName: 'Meta Feed', headline: 'Basta de buscar sin resultados' },
    { adId: '120210023851000', variationType: 'outcome', platform: 'meta_stories', ciudad: 'Bogotá', platformName: 'Meta Stories', headline: 'Tu aparto ideal, sin drama' },
    { adId: '120210023852000', variationType: 'urgency', platform: 'instagram_feed', ciudad: 'Medellín', platformName: 'Instagram Feed', headline: 'El Poblado: quedan 8 aptos' },
  ]
}

// ── Start ──
const PORT = process.env.PORT || 3000

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║         RENTMIES ADS ENGINE — SERVER ACTIVO          ║
╠══════════════════════════════════════════════════════╣
║  Dashboard:  http://localhost:${PORT}                    ║
║  API:        http://localhost:${PORT}/api/...             ║
║  WebSocket:  ws://localhost:${PORT}                       ║
╚══════════════════════════════════════════════════════╝
  `)

  // Iniciar cron de análisis automático
  startAnalysisCron(wsEmit)
})

module.exports = { app, wsEmit }
