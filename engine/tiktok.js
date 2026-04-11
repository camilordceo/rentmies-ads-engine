/**
 * RENTMIES ADS ENGINE — TIKTOK PUBLISHER
 * TikTok Content Posting API v2 flow.
 * Handles video upload, chunked transfer, and publish status polling.
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const axios = require('axios')

const LOG = {
  info:    (msg) => console.log(`\x1b[36m🎵 [TikTok] ${msg}\x1b[0m`),
  success: (msg) => console.log(`\x1b[32m✅ [TikTok] ${msg}\x1b[0m`),
  warn:    (msg) => console.log(`\x1b[33m⚠️  [TikTok] ${msg}\x1b[0m`),
  error:   (msg) => console.log(`\x1b[31m❌ [TikTok] ${msg}\x1b[0m`),
}

const TIKTOK_API = 'https://open.tiktokapis.com/v2'
const CHUNK_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * Publish a video to TikTok via Content Posting API v2.
 * @param {string} videoPath - absolute path to video file
 * @param {Object} params - publish parameters
 * @param {string} params.title - video title
 * @param {string} params.caption - video caption/description
 * @param {string[]} params.hashtags - array of hashtag strings
 * @param {string} params.privacy_level - PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | SELF_ONLY
 * @param {boolean} params.disable_comment
 * @param {boolean} params.disable_duet
 * @param {boolean} params.disable_stitch
 * @param {Object} credentials - {access_token} from platform_credentials
 * @returns {Object} {publish_id, status, share_url}
 */
async function publishToTikTok(videoPath, params, credentials) {
  const {
    title = '',
    caption = '',
    hashtags = [],
    privacy_level = 'PUBLIC_TO_EVERYONE',
    disable_comment = false,
    disable_duet = false,
    disable_stitch = false
  } = params

  // Mock mode if no credentials
  if (!credentials || !credentials.access_token) {
    LOG.warn('No TikTok credentials. Running in mock mode.')
    await _delay(2000)

    const mockId = `mock_tt_${Date.now()}`
    LOG.success(`Mock publish complete — ID: ${mockId}`)
    return {
      publish_id: mockId,
      status: 'PUBLISH_COMPLETE',
      share_url: `https://www.tiktok.com/@rentmies/video/${mockId}`,
      source: 'mock'
    }
  }

  const accessToken = credentials.access_token

  // Validate video file
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`)
  }

  const stats = fs.statSync(videoPath)
  const fileSizeBytes = stats.size
  const fileSizeMB = fileSizeBytes / (1024 * 1024)

  if (fileSizeMB > 4096) {
    throw new Error(`Video too large (${fileSizeMB.toFixed(0)}MB). TikTok max is 4GB.`)
  }

  LOG.info(`Uploading video: ${path.basename(videoPath)} (${fileSizeMB.toFixed(1)}MB)`)

  try {
    // 1. Initialize upload
    LOG.info('Initializing upload...')
    const fullCaption = hashtags.length > 0
      ? `${caption} ${hashtags.map(h => h.startsWith('#') ? h : '#' + h).join(' ')}`
      : caption

    const initRes = await axios.post(
      `${TIKTOK_API}/post/publish/video/init/`,
      {
        post_info: {
          title: title.substring(0, 150),
          description: fullCaption.substring(0, 2200),
          privacy_level,
          disable_comment,
          disable_duet,
          disable_stitch
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: fileSizeBytes,
          chunk_size: CHUNK_SIZE,
          total_chunk_count: Math.ceil(fileSizeBytes / CHUNK_SIZE)
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    )

    const { upload_url, publish_id } = initRes.data.data
    LOG.info(`Upload initialized — publish_id: ${publish_id}`)

    // 2. Upload video in chunks
    const totalChunks = Math.ceil(fileSizeBytes / CHUNK_SIZE)
    const fileBuffer = fs.readFileSync(videoPath)

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, fileSizeBytes)
      const chunk = fileBuffer.slice(start, end)

      LOG.info(`Uploading chunk ${i + 1}/${totalChunks} (${((end - start) / 1024 / 1024).toFixed(1)}MB)`)

      await axios.put(upload_url, chunk, {
        headers: {
          'Content-Range': `bytes ${start}-${end - 1}/${fileSizeBytes}`,
          'Content-Type': 'video/mp4'
        }
      })
    }

    LOG.success('Video upload complete. Waiting for processing...')

    // 3. Poll for publish status
    let status = 'PROCESSING'
    let attempts = 0
    const maxAttempts = 40 // ~2 minutes at 3s intervals

    while (status !== 'PUBLISH_COMPLETE' && attempts < maxAttempts) {
      await _delay(3000)
      attempts++

      const statusRes = await axios.post(
        `${TIKTOK_API}/post/publish/status/fetch/`,
        { publish_id },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      status = statusRes.data.data.status
      LOG.info(`Status check ${attempts}: ${status}`)

      if (status === 'FAILED') {
        const failReason = statusRes.data.data.fail_reason || 'Unknown error'
        throw new Error(`TikTok publish failed: ${failReason}`)
      }
    }

    if (status !== 'PUBLISH_COMPLETE') {
      throw new Error('TikTok publish timed out after 2 minutes')
    }

    LOG.success(`Published to TikTok — ID: ${publish_id}`)
    return {
      publish_id,
      status: 'PUBLISH_COMPLETE',
      share_url: `https://www.tiktok.com/@rentmies/video/${publish_id}`,
      source: 'tiktok_api'
    }

  } catch (err) {
    // Handle specific TikTok API errors
    if (err.response) {
      const errData = err.response.data
      const errCode = errData?.error?.code

      if (errCode === 'rate_limit_exceeded') {
        LOG.warn('Rate limited by TikTok. Waiting 60s and retrying...')
        await _delay(60000)
        return publishToTikTok(videoPath, params, credentials) // Retry once
      }

      if (errCode === 'access_token_invalid' || errCode === 'token_expired') {
        throw new Error('TikTok token expired. Please reconfigure in Settings.')
      }

      throw new Error(`TikTok API error: ${errData?.error?.message || err.message}`)
    }
    throw err
  }
}

/**
 * Check TikTok credentials by making a test API call.
 * @param {Object} credentials - {access_token}
 * @returns {Object} {valid, message, user_info}
 */
async function testTikTokCredentials(credentials) {
  if (!credentials || !credentials.access_token) {
    return { valid: false, message: 'No access token provided' }
  }

  try {
    const res = await axios.get(`${TIKTOK_API}/user/info/`, {
      headers: { 'Authorization': `Bearer ${credentials.access_token}` },
      params: { fields: 'display_name,avatar_url,follower_count' }
    })

    const user = res.data.data.user
    return {
      valid: true,
      message: `Connected as ${user.display_name} (${user.follower_count} followers)`,
      user_info: user
    }
  } catch (err) {
    return {
      valid: false,
      message: err.response?.data?.error?.message || err.message
    }
  }
}

function _delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = { publishToTikTok, testTikTokCredentials }
