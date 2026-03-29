/**
 * RENTMIES ADS ENGINE — ANALYZER
 * Analiza performance de ads con Gemini y toma decisiones automáticas.
 * Corre cada 6 horas via node-cron.
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const cron = require('node-cron')
const { PROMPTS } = require('../config/prompts')

const ANALYSIS_LOG = path.join(__dirname, '../output/analysis-log.json')
const PUBLISHED_LOG = path.join(__dirname, '../output/published.json')

const LOG = {
  info:    (msg) => console.log(`\x1b[36m🔍 ${msg}\x1b[0m`),
  success: (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`),
  warn:    (msg) => console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`),
  error:   (msg) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`),
  ai:      (msg) => console.log(`\x1b[35m🤖 ${msg}\x1b[0m`),
  scale:   (msg) => console.log(`\x1b[32m🚀 ${msg}\x1b[0m`),
  pause:   (msg) => console.log(`\x1b[31m⏸  ${msg}\x1b[0m`),
}

// ── Umbrales (deben coincidir con analysisPrompts.evaluate) ──
const THRESHOLDS = {
  PAUSE_CTR: 0.8,        // % — pausar si CTR < 0.8%
  PAUSE_MIN_IMPRESSIONS: 100,
  SCALE_CTR: 3.0,        // % — escalar si CTR > 3%
  SCALE_MAX_CPC: 2000,   // COP — escalar si CPC < $2000
  SCALE_AGGRESSIVE_CTR: 5.0,
  SCALE_AGGRESSIVE_CPC: 1500,
  MAX_BUDGET_MULTIPLIER: 3.0
}

/**
 * Genera métricas mock realistas para testing.
 * Simula distribución real de performance de ads.
 */
function generateMockMetrics(adId, variationType) {
  // Diferentes perfiles de performance según variación
  const profiles = {
    painPoint:  { ctrBase: 2.1, cpcBase: 1800, convBase: 0.08 },
    outcome:    { ctrBase: 1.4, cpcBase: 2400, convBase: 0.06 },
    social:     { ctrBase: 3.4, cpcBase: 1400, convBase: 0.12 },
    urgency:    { ctrBase: 4.8, cpcBase: 1200, convBase: 0.15 },
  }

  const profile = profiles[variationType] || profiles.painPoint
  const noise = () => (Math.random() - 0.5) * 0.6 // ±30% variación

  const impressions = Math.floor(150 + Math.random() * 850)
  const ctr = Math.max(0.1, profile.ctrBase + noise() * profile.ctrBase)
  const clicks = Math.floor(impressions * ctr / 100)
  const cpc = Math.floor(profile.cpcBase * (1 + noise()))
  const spend = clicks * cpc
  const conversions = Math.floor(clicks * (profile.convBase + noise() * 0.05))
  const costPerLead = conversions > 0 ? Math.floor(spend / conversions) : null

  return {
    adId,
    variationType,
    impressions,
    clicks,
    ctr: parseFloat(ctr.toFixed(2)),
    cpc,
    spend,
    conversions,
    costPerLead,
    reach: Math.floor(impressions * 0.85),
    frequency: parseFloat((1 + Math.random() * 0.5).toFixed(2)),
    timestamp: new Date().toISOString()
  }
}

/**
 * Obtiene métricas reales de Meta API (o mock si no hay credenciales).
 */
async function fetchMetaMetrics(adId) {
  if (!process.env.META_ACCESS_TOKEN) {
    LOG.warn(`Credenciales Meta no configuradas. Usando métricas mock para ${adId}`)
    await _simulateDelay(300)
    const published = loadJSON(PUBLISHED_LOG)
    const adEntry = published.find(e => e.adId === adId)
    return generateMockMetrics(adId, adEntry?.variationType || 'painPoint')
  }

  try {
    const axios = require('axios')
    const { META_API } = require('../config/platforms')
    const res = await axios.get(
      `${META_API.baseUrl}/${META_API.version}/${adId}/insights`,
      {
        params: {
          access_token: process.env.META_ACCESS_TOKEN,
          fields: 'impressions,clicks,ctr,cpc,spend,actions,cost_per_action_type',
          date_preset: 'last_7d'
        }
      }
    )

    const data = res.data.data[0] || {}
    const leadActions = data.actions?.find(a => a.action_type === 'lead')
    return {
      adId,
      impressions: parseInt(data.impressions || 0),
      clicks: parseInt(data.clicks || 0),
      ctr: parseFloat(data.ctr || 0),
      cpc: parseInt(data.cpc || 0),
      spend: parseInt(data.spend || 0),
      conversions: parseInt(leadActions?.value || 0),
      costPerLead: leadActions ? parseInt(data.cost_per_action_type?.find(c => c.action_type === 'lead')?.value || 0) : null,
      timestamp: new Date().toISOString()
    }
  } catch (err) {
    LOG.error(`Error Meta insights API: ${err.message}`)
    return generateMockMetrics(adId, 'painPoint')
  }
}

/**
 * Evalúa métricas con Gemini y retorna decisión.
 */
async function evaluateWithAI(metrics) {
  LOG.ai(`Evaluando con IA — Ad: ${metrics.adId} | CTR: ${metrics.ctr}% | CPC: $${metrics.cpc}`)

  // Decisión basada en reglas (siempre disponible)
  const ruleDecision = makeRuleBasedDecision(metrics)

  // Si no hay API key, usar solo reglas
  if (!process.env.GEMINI_API_KEY) {
    LOG.warn('GEMINI_API_KEY no configurada. Usando decisión basada en reglas.')
    return { ...ruleDecision, source: 'rules' }
  }

  try {
    const { GoogleGenerativeAI } = require('@google/genai')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = PROMPTS.analysisPrompts.evaluate
      .replace('{{metrics}}', JSON.stringify(metrics, null, 2))

    const result = await model.generateContent(prompt)
    const text = result.response.text()
    const jsonMatch = text.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const aiDecision = JSON.parse(jsonMatch[0])
      LOG.ai(`Decisión Gemini: ${aiDecision.decision} — ${aiDecision.razon}`)
      return { ...aiDecision, source: 'gemini' }
    }

    return { ...ruleDecision, source: 'rules_fallback' }

  } catch (err) {
    LOG.error(`Error Gemini análisis: ${err.message}. Usando reglas.`)
    return { ...ruleDecision, source: 'rules_fallback' }
  }
}

/**
 * Decisión basada en reglas determinísticas (sin IA).
 */
function makeRuleBasedDecision(metrics) {
  const { ctr, cpc, impressions, conversions } = metrics

  if (impressions < THRESHOLDS.PAUSE_MIN_IMPRESSIONS) {
    return {
      decision: 'mantener',
      razon: `Solo ${impressions} impresiones. Necesita más datos (mín. ${THRESHOLDS.PAUSE_MIN_IMPRESSIONS})`,
      nuevo_presupuesto: null,
      confianza: 6
    }
  }

  if (ctr < THRESHOLDS.PAUSE_CTR) {
    return {
      decision: 'pausar',
      razon: `CTR ${ctr}% está por debajo del umbral mínimo de ${THRESHOLDS.PAUSE_CTR}%`,
      nuevo_presupuesto: null,
      confianza: 9
    }
  }

  if (ctr >= THRESHOLDS.SCALE_AGGRESSIVE_CTR && cpc <= THRESHOLDS.SCALE_AGGRESSIVE_CPC) {
    const multiplier = Math.min(3, 1 + (ctr - THRESHOLDS.SCALE_CTR) / 2)
    return {
      decision: 'escalar_agresivo',
      razon: `CTR ${ctr}% excelente + CPC $${cpc} muy eficiente. Escalar agresivo.`,
      nuevo_presupuesto: Math.floor(50000 * multiplier),
      confianza: 10
    }
  }

  if (ctr >= THRESHOLDS.SCALE_CTR && cpc <= THRESHOLDS.SCALE_MAX_CPC) {
    return {
      decision: 'escalar',
      razon: `CTR ${ctr}% sobre umbral y CPC $${cpc} bajo límite. Escalar.`,
      nuevo_presupuesto: Math.floor(50000 * 2),
      confianza: 8
    }
  }

  return {
    decision: 'mantener',
    razon: `CTR ${ctr}% aceptable, CPC $${cpc} razonable. Monitorear.`,
    nuevo_presupuesto: null,
    confianza: 7
  }
}

/**
 * Ejecuta análisis completo de todos los ads activos.
 * @param {Function} wsEmit - WebSocket emit para dashboard
 */
async function runAnalysis(wsEmit) {
  LOG.info('━━━ INICIANDO ANÁLISIS DE PERFORMANCE ━━━')
  if (wsEmit) wsEmit('analysis_start', { timestamp: new Date().toISOString() })

  const published = loadJSON(PUBLISHED_LOG)
  const activeAds = published.filter(ad => ['DRAFT', 'ACTIVE'].includes(ad.status))

  if (activeAds.length === 0) {
    LOG.warn('No hay ads activos para analizar. Usando datos demo.')
    // Generar análisis demo para el dashboard
    return await runDemoAnalysis(wsEmit)
  }

  const decisions = []

  for (const ad of activeAds) {
    LOG.info(`Analizando ad ${ad.adId} (${ad.variationType || 'unknown'})...`)
    if (wsEmit) wsEmit('progress', {
      step: 'analysis',
      status: 'analyzing',
      message: `Analizando performance últimas 6h — Ad ${ad.adId.slice(-6)}...`
    })

    // 1. Obtener métricas
    const metrics = await fetchMetaMetrics(ad.adId)

    // 2. Evaluar con IA
    const decision = await evaluateWithAI(metrics)

    // 3. Ejecutar acción
    const action = await executeDecision(ad.adId, ad.platform, decision, metrics, wsEmit)

    const logEntry = {
      timestamp: new Date().toISOString(),
      adId: ad.adId,
      variationType: ad.variationType,
      ciudad: ad.ciudad,
      platform: ad.platform,
      metrics,
      decision: decision.decision,
      razon: decision.razon,
      nuevo_presupuesto: decision.nuevo_presupuesto,
      confianza: decision.confianza,
      source: decision.source,
      actionTaken: action
    }

    decisions.push(logEntry)
    saveAnalysisLog(logEntry)
  }

  LOG.success(`Análisis completo — ${decisions.length} ads procesados`)
  if (wsEmit) wsEmit('analysis_complete', { decisions, totalAnalyzed: decisions.length })

  return decisions
}

/**
 * Análisis demo con datos mock para mostrar el dashboard funcionando.
 */
async function runDemoAnalysis(wsEmit) {
  const demoAds = [
    { adId: '120210023848000', variationType: 'urgency', platform: 'meta_feed', ciudad: 'Bogotá' },
    { adId: '120210023849000', variationType: 'social', platform: 'instagram_feed', ciudad: 'Medellín' },
    { adId: '120210023850000', variationType: 'painPoint', platform: 'meta_feed', ciudad: 'Cali' },
    { adId: '120210023851000', variationType: 'outcome', platform: 'meta_stories', ciudad: 'Bogotá' },
  ]

  const decisions = []

  for (const ad of demoAds) {
    await _simulateDelay(500)

    const metrics = generateMockMetrics(ad.adId, ad.variationType)
    const decision = makeRuleBasedDecision(metrics)

    if (wsEmit) {
      const msg = decision.decision === 'pausar'
        ? `Ad #${ad.adId.slice(-6)} pausado — CTR ${metrics.ctr}% < umbral`
        : decision.decision.includes('escalar')
        ? `Ad #${ad.adId.slice(-6)} escalado a $${decision.nuevo_presupuesto?.toLocaleString()} COP — CTR ${metrics.ctr}%`
        : `Ad #${ad.adId.slice(-6)} mantenido — CTR ${metrics.ctr}%`

      wsEmit('progress', {
        step: 'analysis',
        status: decision.decision,
        message: msg,
        adId: ad.adId,
        decision: decision.decision,
        metrics
      })
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      ...ad,
      metrics,
      decision: decision.decision,
      razon: decision.razon,
      nuevo_presupuesto: decision.nuevo_presupuesto,
      confianza: decision.confianza,
      source: 'demo'
    }

    decisions.push(logEntry)
    saveAnalysisLog(logEntry)
  }

  return decisions
}

/**
 * Ejecuta la acción decidida (pausar, escalar, mantener).
 */
async function executeDecision(adId, platform, decision, metrics, wsEmit) {
  const { publisher } = require('./publisher')

  switch (decision.decision) {
    case 'pausar':
      LOG.pause(`Pausando ad ${adId} — CTR: ${metrics.ctr}%`)
      if (wsEmit) wsEmit('ad_paused', {
        adId,
        ctr: metrics.ctr,
        message: `Ad #${adId.slice(-6)} pausado — CTR ${metrics.ctr}% < umbral`
      })
      try {
        const { pauseAd } = require('./publisher')
        await pauseAd(adId, platform)
      } catch (e) { /* publisher puede no estar disponible */ }
      return 'paused'

    case 'escalar':
    case 'escalar_agresivo':
      LOG.scale(`Escalando ad ${adId} — CTR: ${metrics.ctr}% → Nuevo presupuesto: $${decision.nuevo_presupuesto}`)
      if (wsEmit) wsEmit('ad_scaled', {
        adId,
        ctr: metrics.ctr,
        newBudget: decision.nuevo_presupuesto,
        message: `Ad #${adId.slice(-6)} escalado a $${decision.nuevo_presupuesto?.toLocaleString()} COP — CTR ${metrics.ctr}%`
      })
      return `scaled_to_${decision.nuevo_presupuesto}`

    default:
      return 'maintained'
  }
}

// ── Persistencia ──
function loadJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')) }
  catch { return [] }
}

function saveAnalysisLog(entry) {
  const dir = path.dirname(ANALYSIS_LOG)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const log = loadJSON(ANALYSIS_LOG)
  log.push(entry)
  // Mantener solo los últimos 500 registros
  if (log.length > 500) log.splice(0, log.length - 500)
  fs.writeFileSync(ANALYSIS_LOG, JSON.stringify(log, null, 2))
}

function _simulateDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Inicializa el cron job para análisis automático cada 6 horas.
 * @param {Function} wsEmit
 */
function startAnalysisCron(wsEmit) {
  LOG.info('Iniciando cron de análisis — cada 6 horas')
  cron.schedule('0 */6 * * *', async () => {
    LOG.info('⏰ Cron: ejecutando análisis automático...')
    try {
      await runAnalysis(wsEmit)
    } catch (err) {
      LOG.error(`Error en cron análisis: ${err.message}`)
    }
  })
  LOG.success('Cron activo: análisis cada 6 horas (0 */6 * * *)')
}

// ── Ejecución directa ──
if (require.main === module) {
  runAnalysis().then(decisions => {
    console.log(`\n📊 ANÁLISIS COMPLETO: ${decisions.length} decisiones tomadas`)
    decisions.forEach(d => {
      console.log(`  ${d.adId.slice(-6)} | CTR: ${d.metrics?.ctr}% | Decisión: ${d.decision}`)
    })
  }).catch(console.error)
}

module.exports = { runAnalysis, startAnalysisCron, generateMockMetrics, THRESHOLDS }
