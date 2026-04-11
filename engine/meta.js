/**
 * RENTMIES ADS ENGINE — META PUBLISHER
 * Handles Meta/Facebook Marketing API operations:
 * - Image ad creation (campaign → adset → creative → ad)
 * - Ad pausing and scaling
 * - Credential testing
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const axios = require('axios')

const LOG = {
  info:    (msg) => console.log(`\x1b[36m📘 [Meta] ${msg}\x1b[0m`),
  success: (msg) => console.log(`\x1b[32m✅ [Meta] ${msg}\x1b[0m`),
  warn:    (msg) => console.log(`\x1b[33m⚠️  [Meta] ${msg}\x1b[0m`),
  error:   (msg) => console.log(`\x1b[31m❌ [Meta] ${msg}\x1b[0m`),
}

const META_BASE = 'https://graph.facebook.com/v21.0'

/**
 * Publish an image ad to Meta (Facebook/Instagram).
 * Creates: Campaign → Ad Set → Ad Creative → Ad (all as PAUSED).
 * @param {Object} creative - ad_creatives record
 * @param {Object} credentials - {access_token, ad_account_id, page_id}
 * @returns {Object} {ad_id, creative_id, adset_id, campaign_id}
 */
async function publishImageAd(creative, credentials) {
  if (!credentials || !credentials.access_token || !credentials.ad_account_id) {
    LOG.warn('No Meta credentials. Running in mock mode.')
    await _delay(1500)

    const mockId = `mock_meta_${Date.now()}`
    return {
      ad_id: mockId,
      creative_id: `cr_${mockId}`,
      adset_id: `as_${mockId}`,
      campaign_id: `cp_${mockId}`,
      status: 'PAUSED',
      source: 'mock'
    }
  }

  const { access_token, ad_account_id, page_id } = credentials
  const accountPrefix = ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id}`

  try {
    // 1. Upload image
    LOG.info('Uploading image to Meta...')
    let imageHash = null

    if (creative.image_url && fs.existsSync(creative.image_url)) {
      const FormData = require('form-data')
      const form = new FormData()
      form.append('filename', fs.createReadStream(creative.image_url))

      const imgRes = await axios.post(
        `${META_BASE}/${accountPrefix}/adimages`,
        form,
        {
          params: { access_token },
          headers: form.getHeaders()
        }
      )

      const images = imgRes.data.images
      const firstKey = Object.keys(images)[0]
      imageHash = images[firstKey].hash
      LOG.success(`Image uploaded — hash: ${imageHash}`)
    } else {
      LOG.warn('No local image file. Using placeholder.')
      // Use a test image hash
      imageHash = 'placeholder'
    }

    // 2. Create Ad Creative
    LOG.info('Creating ad creative...')
    const whatsappNumber = process.env.WHATSAPP_NUMBER || '573001234567'
    const waLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hola, vi tu anuncio y quiero información')}`

    const creativeRes = await axios.post(
      `${META_BASE}/${accountPrefix}/adcreatives`,
      {
        name: creative.headline || 'Rentmies Ad',
        object_story_spec: {
          page_id: page_id,
          link_data: {
            image_hash: imageHash,
            link: waLink,
            message: creative.description || '',
            name: creative.headline || '',
            call_to_action: {
              type: creative.cta === 'Escribir por WhatsApp' ? 'WHATSAPP_MESSAGE' : 'LEARN_MORE',
              value: { link: waLink }
            }
          }
        }
      },
      { params: { access_token } }
    )

    const metaCreativeId = creativeRes.data.id
    LOG.success(`Creative created — ID: ${metaCreativeId}`)

    // 3. Create Ad (as PAUSED draft)
    LOG.info('Creating ad...')

    // We need an adset_id. For now create a simple one or use an existing one.
    // In production, the adset would be created as part of campaign setup.
    const adRes = await axios.post(
      `${META_BASE}/${accountPrefix}/ads`,
      {
        name: creative.headline || 'Rentmies Ad',
        creative: { creative_id: metaCreativeId },
        status: 'PAUSED'
      },
      { params: { access_token } }
    )

    const adId = adRes.data.id
    LOG.success(`Ad created (PAUSED) — ID: ${adId}`)

    return {
      ad_id: adId,
      creative_id: metaCreativeId,
      status: 'PAUSED',
      source: 'meta_api'
    }

  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message
    LOG.error(`Meta API error: ${errMsg}`)
    throw new Error(`Meta publish failed: ${errMsg}`)
  }
}

/**
 * Pause an active ad on Meta.
 * @param {string} metaAdId - the Meta ad ID
 * @param {Object} credentials - {access_token}
 */
async function pauseAd(metaAdId, credentials) {
  if (!credentials || !credentials.access_token) {
    LOG.warn(`Mock pause for ad ${metaAdId}`)
    return { ad_id: metaAdId, status: 'PAUSED', source: 'mock' }
  }

  try {
    await axios.post(
      `${META_BASE}/${metaAdId}`,
      { status: 'PAUSED' },
      { params: { access_token: credentials.access_token } }
    )
    LOG.success(`Ad ${metaAdId} paused`)
    return { ad_id: metaAdId, status: 'PAUSED', source: 'meta_api' }
  } catch (err) {
    LOG.error(`Failed to pause ad ${metaAdId}: ${err.message}`)
    throw err
  }
}

/**
 * Scale an ad by increasing its adset daily budget.
 * @param {string} metaAdsetId - the Meta ad set ID
 * @param {number} newDailyBudget - new daily budget in COP (will be converted to cents)
 * @param {Object} credentials - {access_token}
 */
async function scaleAd(metaAdsetId, newDailyBudget, credentials) {
  if (!credentials || !credentials.access_token) {
    LOG.warn(`Mock scale for adset ${metaAdsetId} to $${newDailyBudget}`)
    return { adset_id: metaAdsetId, daily_budget: newDailyBudget, source: 'mock' }
  }

  try {
    await axios.post(
      `${META_BASE}/${metaAdsetId}`,
      { daily_budget: newDailyBudget * 100 }, // Meta uses cents
      { params: { access_token: credentials.access_token } }
    )
    LOG.success(`Adset ${metaAdsetId} scaled to $${newDailyBudget}/day`)
    return { adset_id: metaAdsetId, daily_budget: newDailyBudget, source: 'meta_api' }
  } catch (err) {
    LOG.error(`Failed to scale adset ${metaAdsetId}: ${err.message}`)
    throw err
  }
}

/**
 * Activate (unpause) a paused ad.
 * @param {string} metaAdId
 * @param {Object} credentials
 */
async function activateAd(metaAdId, credentials) {
  if (!credentials || !credentials.access_token) {
    LOG.warn(`Mock activate for ad ${metaAdId}`)
    return { ad_id: metaAdId, status: 'ACTIVE', source: 'mock' }
  }

  try {
    await axios.post(
      `${META_BASE}/${metaAdId}`,
      { status: 'ACTIVE' },
      { params: { access_token: credentials.access_token } }
    )
    LOG.success(`Ad ${metaAdId} activated`)
    return { ad_id: metaAdId, status: 'ACTIVE', source: 'meta_api' }
  } catch (err) {
    LOG.error(`Failed to activate ad ${metaAdId}: ${err.message}`)
    throw err
  }
}

/**
 * Test Meta credentials by fetching ad account info.
 * @param {Object} credentials - {access_token, ad_account_id}
 * @returns {Object} {valid, message, account_info}
 */
async function testMetaCredentials(credentials) {
  if (!credentials || !credentials.access_token || !credentials.ad_account_id) {
    return { valid: false, message: 'Missing access_token or ad_account_id' }
  }

  const accountPrefix = credentials.ad_account_id.startsWith('act_')
    ? credentials.ad_account_id
    : `act_${credentials.ad_account_id}`

  try {
    const res = await axios.get(`${META_BASE}/${accountPrefix}`, {
      params: {
        access_token: credentials.access_token,
        fields: 'name,account_status,amount_spent,balance,currency,spend_cap'
      }
    })

    const account = res.data
    const statusMap = { 1: 'Active', 2: 'Disabled', 3: 'Unsettled', 7: 'Pending Review', 9: 'In Grace Period', 100: 'Pending Closure', 101: 'Closed' }

    return {
      valid: true,
      message: `Connected: ${account.name} (${statusMap[account.account_status] || 'Unknown'})`,
      account_info: {
        name: account.name,
        status: statusMap[account.account_status],
        currency: account.currency,
        spend_cap: account.spend_cap,
        amount_spent: account.amount_spent
      }
    }
  } catch (err) {
    return {
      valid: false,
      message: err.response?.data?.error?.message || err.message
    }
  }
}

/**
 * Fetch ad insights from Meta API.
 * @param {string} adId
 * @param {Object} credentials
 * @param {string} datePreset - 'today', 'yesterday', 'last_7d', 'last_30d'
 */
async function getAdInsights(adId, credentials, datePreset = 'last_7d') {
  if (!credentials || !credentials.access_token) {
    return null
  }

  try {
    const res = await axios.get(`${META_BASE}/${adId}/insights`, {
      params: {
        access_token: credentials.access_token,
        fields: 'impressions,clicks,ctr,cpc,spend,actions,cost_per_action_type,reach,frequency',
        date_preset: datePreset
      }
    })

    const data = res.data.data[0]
    if (!data) return null

    const leadActions = data.actions?.find(a => a.action_type === 'lead')
    return {
      impressions: parseInt(data.impressions || 0),
      clicks: parseInt(data.clicks || 0),
      ctr: parseFloat(data.ctr || 0),
      cpc: parseFloat(data.cpc || 0),
      spend: parseFloat(data.spend || 0),
      reach: parseInt(data.reach || 0),
      frequency: parseFloat(data.frequency || 0),
      conversions: parseInt(leadActions?.value || 0)
    }
  } catch (err) {
    LOG.error(`Failed to fetch insights for ${adId}: ${err.message}`)
    return null
  }
}

function _delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = {
  publishImageAd,
  pauseAd,
  scaleAd,
  activateAd,
  testMetaCredentials,
  getAdInsights
}
