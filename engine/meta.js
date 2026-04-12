/**
 * RENTMIES ADS ENGINE — META PUBLISH ENGINE
 * Meta Graph API v21.0
 */

require('dotenv').config()
const fs = require('fs')
const axios = require('axios')

const GRAPH = 'https://graph.facebook.com/v21.0'

async function getCredentials(empresa_id) {
  try {
    const db = require('../api/supabase')
    const creds = await db.getCredentials(empresa_id, 'meta')
    if (creds?.credentials) return creds.credentials
  } catch (e) {}
  return {
    access_token: process.env.META_ACCESS_TOKEN,
    ad_account_id: process.env.META_AD_ACCOUNT_ID,
    page_id: process.env.META_PAGE_ID,
  }
}

/**
 * Upload image to Meta and return image_hash
 */
async function uploadImage(imagePath, adAccountId, accessToken) {
  const imageBuffer = fs.readFileSync(imagePath)
  const base64 = imageBuffer.toString('base64')
  const res = await axios.post(
    `${GRAPH}/act_${adAccountId}/adimages`,
    { bytes: base64 },
    { params: { access_token: accessToken } }
  )
  const images = res.data.images
  const key = Object.keys(images)[0]
  return images[key].hash
}

/**
 * Publish an image ad to Meta (as PAUSED draft)
 */
async function publishImageAd(creative, campaignId, empresa_id = 'demo') {
  const creds = await getCredentials(empresa_id)

  if (!creds?.access_token || !creds?.ad_account_id) {
    console.log('[meta] Mock mode — configure credentials in Settings')
    await new Promise(r => setTimeout(r, 1500))
    return {
      meta_ad_id: `mock_meta_${Date.now()}`,
      meta_creative_id: `mock_creative_${Date.now()}`,
      status: 'MOCK_PUBLISHED',
      mock: true
    }
  }

  const { access_token, ad_account_id, page_id } = creds

  try {
    // 1. Upload image
    let image_hash
    if (creative.image_url && fs.existsSync(creative.image_url)) {
      image_hash = await uploadImage(creative.image_url, ad_account_id, access_token)
    } else {
      // Use URL reference if local file not available
      image_hash = null
    }

    // 2. Create Ad Creative
    const creativePayload = {
      name: creative.headline || 'Rentmies Ad',
      object_story_spec: {
        page_id,
        link_data: {
          message: creative.description || '',
          link: 'https://rentmies.com',
          call_to_action: { type: 'LEARN_MORE' },
          ...(image_hash ? { image_hash } : {})
        }
      }
    }

    const creativeRes = await axios.post(
      `${GRAPH}/act_${ad_account_id}/adcreatives`,
      creativePayload,
      { params: { access_token } }
    )
    const meta_creative_id = creativeRes.data.id

    // 3. Create Ad (PAUSED draft)
    const adRes = await axios.post(
      `${GRAPH}/act_${ad_account_id}/ads`,
      {
        name: creative.headline || 'Rentmies Ad',
        adset_id: campaignId,
        creative: { creative_id: meta_creative_id },
        status: 'PAUSED'
      },
      { params: { access_token } }
    )

    return {
      meta_ad_id: adRes.data.id,
      meta_creative_id,
      status: 'PAUSED'
    }
  } catch (err) {
    const errMsg = err?.response?.data?.error?.message || err.message
    console.error('[meta] publishImageAd error:', errMsg)
    throw new Error(`Meta publish failed: ${errMsg}`)
  }
}

/**
 * Pause an active Meta ad
 */
async function pauseAd(meta_ad_id, empresa_id = 'demo') {
  const creds = await getCredentials(empresa_id)
  if (!creds?.access_token) return { mock: true, status: 'PAUSED' }
  try {
    await axios.post(`${GRAPH}/${meta_ad_id}`, { status: 'PAUSED' }, { params: { access_token: creds.access_token } })
    return { status: 'PAUSED' }
  } catch (err) {
    throw new Error(`Meta pause failed: ${err?.response?.data?.error?.message || err.message}`)
  }
}

/**
 * Scale a Meta adset budget
 */
async function scaleAd(meta_adset_id, new_daily_budget, empresa_id = 'demo') {
  const creds = await getCredentials(empresa_id)
  if (!creds?.access_token) return { mock: true, new_budget: new_daily_budget }
  try {
    await axios.post(
      `${GRAPH}/${meta_adset_id}`,
      { daily_budget: new_daily_budget },
      { params: { access_token: creds.access_token } }
    )
    return { status: 'SCALED', new_budget: new_daily_budget }
  } catch (err) {
    throw new Error(`Meta scale failed: ${err?.response?.data?.error?.message || err.message}`)
  }
}

/**
 * Fetch WhatsApp templates from Meta WABA API
 */
async function getWhatsAppTemplates(access_token, waba_id) {
  if (!access_token || !waba_id) return []
  try {
    const res = await axios.get(`${GRAPH}/${waba_id}/message_templates`, {
      params: { access_token, fields: 'name,status,category,language,components' }
    })
    return res.data.data || []
  } catch (err) {
    console.error('[meta] getWhatsAppTemplates error:', err?.response?.data?.error?.message || err.message)
    return []
  }
}

module.exports = { publishImageAd, pauseAd, scaleAd, getWhatsAppTemplates }
