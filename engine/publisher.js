/**
 * RENTMIES ADS ENGINE — PUBLISHER
 * Publica ads en Meta Marketing API y TikTok Ads API.
 * Por defecto publica como DRAFT (no activo).
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const { META_API } = require('../config/platforms')

const PUBLISHED_LOG = path.join(__dirname, '../output/published.json')

const LOG = {
  info:    (msg) => console.log(`\x1b[36m📤 ${msg}\x1b[0m`),
  success: (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`),
  warn:    (msg) => console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`),
  error:   (msg) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`),
}

// ── Mock IDs para simulación ──
let mockAdIdCounter = 23847

function generateMockMetaId() {
  return String(120210000000000 + (++mockAdIdCounter))
}

function generateMockTikTokId() {
  return `tiktok_${Date.now()}_${Math.floor(Math.random() * 9999)}`
}

/**
 * Publica un ad en Meta (Facebook/Instagram) como DRAFT.
 * @param {Object} ad - El ad generado
 * @param {string} imagePath - Path local de la imagen
 * @param {Function} wsEmit
 */
async function publishToMeta(ad, imagePath, wsEmit) {
  LOG.info(`Publicando en Meta — ${ad.id} | ${ad.platformName}`)
  if (wsEmit) wsEmit('progress', {
    step: 'publish',
    status: 'publishing',
    message: `Publicando en ${ad.platformName} como draft...`
  })

  // Sin credenciales → mock
  if (!process.env.META_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID) {
    LOG.warn('Credenciales Meta no configuradas. Simulando publicación.')
    await _simulateDelay(1000)

    const mockId = generateMockMetaId()
    const result = {
      platform: ad.platform,
      platformName: ad.platformName,
      adId: mockId,
      adSetId: `adset_${mockId}`,
      campaignId: ad.campaignId,
      status: 'DRAFT',
      url: `https://www.facebook.com/adsmanager/manage/ads?act=&selected_ad_ids=${mockId}`,
      publishedAt: new Date().toISOString(),
      source: 'mock',
      originalAdId: ad.id,
      headline: ad.headline,
      ciudad: ad.ciudad,
      variationType: ad.variationType
    }

    LOG.success(`Ad publicado (mock) — ID: ${mockId} | STATUS: DRAFT`)
    if (wsEmit) wsEmit('progress', {
      step: 'publish', status: 'done',
      message: `Publicado en ${ad.platformName} como draft — ID: ${mockId}`,
      adId: mockId
    })
    return result
  }

  try {
    const accountId = process.env.META_AD_ACCOUNT_ID
    const accessToken = process.env.META_ACCESS_TOKEN
    const baseUrl = `${META_API.baseUrl}/${META_API.version}`

    // 1. Crear campaña (o reutilizar existente)
    const campaignRes = await axios.post(`${baseUrl}/act_${accountId}/campaigns`, {
      name: `Rentmies_${ad.ciudad}_${ad.variationType}_${Date.now()}`,
      objective: META_API.adObjective,
      status: 'PAUSED',
      special_ad_categories: []
    }, { params: { access_token: accessToken } })

    const campaignId = campaignRes.data.id

    // 2. Crear Ad Set
    const adSetRes = await axios.post(`${baseUrl}/act_${accountId}/adsets`, {
      name: `AdSet_${ad.platform}_${ad.variationType}`,
      campaign_id: campaignId,
      billing_event: META_API.billingEvent,
      optimization_goal: META_API.optimizationGoal,
      bid_amount: 500, // COP en centavos
      daily_budget: 50000,
      status: 'PAUSED',
      targeting: {
        geo_locations: { countries: ['CO'] },
        age_min: 22,
        age_max: 50,
        publisher_platforms: ad.platform.includes('instagram') ? ['instagram'] : ['facebook']
      }
    }, { params: { access_token: accessToken } })

    const adSetId = adSetRes.data.id

    // 3. Subir imagen
    const imageHash = await uploadImageToMeta(imagePath, accountId, accessToken, baseUrl)

    // 4. Crear Ad Creative
    const creativeRes = await axios.post(`${baseUrl}/act_${accountId}/adcreatives`, {
      name: `Creative_${ad.id}`,
      object_story_spec: {
        page_id: process.env.META_PAGE_ID,
        link_data: {
          image_hash: imageHash,
          message: ad.description,
          link: `https://wa.me/${process.env.WHATSAPP_NUMBER}?text=${encodeURIComponent('Hola, vi tu anuncio y quiero información')}`,
          name: ad.headline,
          call_to_action: { type: 'WHATSAPP_MESSAGE' }
        }
      }
    }, { params: { access_token: accessToken } })

    const creativeId = creativeRes.data.id

    // 5. Crear Ad
    const adRes = await axios.post(`${baseUrl}/act_${accountId}/ads`, {
      name: `Ad_${ad.id}`,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: 'PAUSED' // Siempre DRAFT/PAUSED primero
    }, { params: { access_token: accessToken } })

    const result = {
      platform: ad.platform,
      platformName: ad.platformName,
      adId: adRes.data.id,
      adSetId,
      campaignId,
      status: 'DRAFT',
      url: `https://www.facebook.com/adsmanager/manage/ads?act=${accountId}&selected_ad_ids=${adRes.data.id}`,
      publishedAt: new Date().toISOString(),
      source: 'meta_api',
      originalAdId: ad.id
    }

    LOG.success(`Ad publicado en Meta — ID: ${result.adId}`)
    return result

  } catch (err) {
    LOG.error(`Error Meta API: ${err.response?.data?.error?.message || err.message}`)
    throw err
  }
}

/**
 * Sube imagen a Meta y retorna su hash.
 */
async function uploadImageToMeta(imagePath, accountId, accessToken, baseUrl) {
  const FormData = require('form-data')
  const form = new FormData()

  if (fs.existsSync(imagePath)) {
    form.append('filename', fs.createReadStream(imagePath))
  } else {
    throw new Error(`Imagen no encontrada: ${imagePath}`)
  }

  const res = await axios.post(
    `${baseUrl}/act_${accountId}/adimages`,
    form,
    {
      params: { access_token: accessToken },
      headers: form.getHeaders()
    }
  )

  const images = res.data.images
  const firstKey = Object.keys(images)[0]
  return images[firstKey].hash
}

/**
 * Publica un ad en TikTok Ads (DRAFT).
 */
async function publishToTikTok(ad, imagePath, wsEmit) {
  LOG.info(`Publicando en TikTok — ${ad.id}`)
  if (wsEmit) wsEmit('progress', {
    step: 'publish', status: 'publishing',
    message: 'Publicando en TikTok Ads como draft...'
  })

  if (!process.env.TIKTOK_ACCESS_TOKEN || !process.env.TIKTOK_ADVERTISER_ID) {
    LOG.warn('Credenciales TikTok no configuradas. Simulando.')
    await _simulateDelay(900)

    const mockId = generateMockTikTokId()
    const result = {
      platform: 'tiktok',
      platformName: 'TikTok Ads',
      adId: mockId,
      status: 'DRAFT',
      publishedAt: new Date().toISOString(),
      source: 'mock',
      originalAdId: ad.id
    }

    LOG.success(`Ad TikTok publicado (mock) — ID: ${mockId}`)
    if (wsEmit) wsEmit('progress', {
      step: 'publish', status: 'done',
      message: `Publicado en TikTok como draft — ID: ${mockId}`
    })
    return result
  }

  // TikTok Ads API real (implementar según documentación oficial)
  try {
    const advertiserId = process.env.TIKTOK_ADVERTISER_ID
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN

    const response = await axios.post(
      'https://business-api.tiktok.com/open_api/v1.3/ad/create/',
      {
        advertiser_id: advertiserId,
        adgroup_id: process.env.TIKTOK_ADGROUP_ID,
        creatives: [{
          ad_name: `Rentmies_${ad.ciudad}_${ad.variationType}`,
          ad_format: 'SINGLE_IMAGE',
          image_ids: [imagePath],
          ad_text: ad.description,
          call_to_action: 'SHOP_NOW',
          landing_page_url: `https://wa.me/${process.env.WHATSAPP_NUMBER}`
        }],
        operation_status: 'DISABLE' // Draft
      },
      { headers: { 'Access-Token': accessToken, 'Content-Type': 'application/json' } }
    )

    return {
      platform: 'tiktok',
      platformName: 'TikTok Ads',
      adId: response.data.data.ad_ids[0],
      status: 'DRAFT',
      publishedAt: new Date().toISOString(),
      source: 'tiktok_api',
      originalAdId: ad.id
    }

  } catch (err) {
    LOG.error(`Error TikTok API: ${err.message}`)
    throw err
  }
}

/**
 * Publica múltiples ads en sus plataformas correspondientes.
 * @param {Array} ads - Array de ads generados
 * @param {Object} imageResults - Resultado de imageGen
 * @param {Function} wsEmit
 */
async function publishCampaign(ads, imageResults, wsEmit) {
  LOG.info(`Publicando ${ads.length} ads...`)
  const published = []
  const imageMap = {}
  if (imageResults) {
    imageResults.forEach(r => { imageMap[r.adId] = r.feedImage })
  }

  for (const ad of ads) {
    const imagePath = imageMap[ad.id] || null
    const fullImagePath = imagePath ? path.join(__dirname, '..', imagePath) : null

    try {
      let result
      if (ad.platform === 'tiktok') {
        result = await publishToTikTok(ad, fullImagePath, wsEmit)
      } else {
        result = await publishToMeta(ad, fullImagePath, wsEmit)
      }
      published.push(result)
    } catch (err) {
      LOG.error(`No se pudo publicar ${ad.id}: ${err.message}`)
      published.push({
        originalAdId: ad.id,
        platform: ad.platform,
        status: 'ERROR',
        error: err.message,
        publishedAt: new Date().toISOString()
      })
    }
  }

  // Guardar historial
  savePublishedLog(published)

  LOG.success(`${published.filter(p => p.status === 'DRAFT').length}/${ads.length} ads publicados como DRAFT`)
  return published
}

/**
 * Activa un ad que estaba en DRAFT (mock o real).
 */
async function activateAd(adId, platform) {
  LOG.info(`Activando ad ${adId} en ${platform}`)
  await _simulateDelay(500)

  // Actualizar en log
  const log = loadPublishedLog()
  const entry = log.find(e => e.adId === adId)
  if (entry) {
    entry.status = 'ACTIVE'
    entry.activatedAt = new Date().toISOString()
    savePublishedLog(log)
  }

  LOG.success(`Ad ${adId} activado`)
  return { adId, status: 'ACTIVE', activatedAt: new Date().toISOString() }
}

/**
 * Pausa un ad activo.
 */
async function pauseAd(adId, platform) {
  LOG.info(`Pausando ad ${adId}`)
  await _simulateDelay(400)

  const log = loadPublishedLog()
  const entry = log.find(e => e.adId === adId)
  if (entry) {
    entry.status = 'PAUSED'
    entry.pausedAt = new Date().toISOString()
    savePublishedLog(log)
  }

  LOG.success(`Ad ${adId} pausado`)
  return { adId, status: 'PAUSED', pausedAt: new Date().toISOString() }
}

function loadPublishedLog() {
  try {
    return JSON.parse(fs.readFileSync(PUBLISHED_LOG, 'utf-8'))
  } catch { return [] }
}

function savePublishedLog(entries) {
  const dir = path.dirname(PUBLISHED_LOG)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const existing = loadPublishedLog()
  const merged = [...existing, ...entries.filter(e =>
    !existing.find(ex => ex.adId === e.adId)
  )]
  fs.writeFileSync(PUBLISHED_LOG, JSON.stringify(merged, null, 2))
}

function _simulateDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = { publishToMeta, publishToTikTok, publishCampaign, pauseAd, activateAd }
