/**
 * RENTMIES ADS ENGINE — TIKTOK PUBLISH ENGINE
 * TikTok Content Posting API v2
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const axios = require('axios')

async function getCredentials(empresa_id) {
  try {
    const db = require('../api/supabase')
    const creds = await db.getCredentials(empresa_id, 'tiktok')
    if (creds?.credentials) return creds.credentials
  } catch (e) {}
  // Fall back to env
  if (process.env.TIKTOK_ACCESS_TOKEN) {
    return { access_token: process.env.TIKTOK_ACCESS_TOKEN }
  }
  return null
}

/**
 * Publish a video to TikTok via Content Posting API v2
 */
async function publishToTikTok(videoPath, params, empresa_id = 'demo') {
  const {
    title = 'Rentmies — Tu próxima propiedad',
    caption = '',
    hashtags = [],
    privacy_level = 'PUBLIC_TO_EVERYONE',
    disable_comment = false,
    disable_duet = false,
    disable_stitch = false,
  } = params

  const creds = await getCredentials(empresa_id)

  if (!creds?.access_token) {
    console.log('[tiktok] Mock mode — configure credentials in Settings')
    await new Promise(r => setTimeout(r, 2000))
    return {
      publish_id: `mock_tt_${Date.now()}`,
      share_url: null,
      status: 'MOCK_PUBLISHED',
      mock: true
    }
  }

  const accessToken = creds.access_token

  // Get file info
  if (!fs.existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`)
  const stats = fs.statSync(videoPath)
  const videoSize = stats.size
  const chunkSize = 10 * 1024 * 1024 // 10MB chunks

  if (videoSize > 4 * 1024 * 1024 * 1024) throw new Error('Video too large, max 4GB')

  const fullCaption = [caption, ...hashtags.map(h => `#${h.replace('#', '')}`)].filter(Boolean).join(' ')

  // 1. Initialize upload
  let initRes
  try {
    initRes = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      {
        post_info: {
          title: title.substring(0, 150),
          privacy_level,
          disable_comment,
          disable_duet,
          disable_stitch,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoSize,
          chunk_size: chunkSize,
          total_chunk_count: Math.ceil(videoSize / chunkSize),
        }
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' } }
    )
  } catch (err) {
    const status = err?.response?.status
    if (status === 401) throw new Error('TikTok token expired — reconfigure in Settings')
    if (status === 429) {
      await new Promise(r => setTimeout(r, 60000))
      return publishToTikTok(videoPath, params, empresa_id)
    }
    throw new Error(`TikTok init failed: ${err?.response?.data?.error?.message || err.message}`)
  }

  const { upload_url, publish_id } = initRes.data.data

  // 2. Upload chunks
  const fileBuffer = fs.readFileSync(videoPath)
  const totalChunks = Math.ceil(videoSize / chunkSize)

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize
    const end = Math.min(start + chunkSize - 1, videoSize - 1)
    const chunk = fileBuffer.slice(start, end + 1)

    try {
      await axios.put(upload_url, chunk, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes ${start}-${end}/${videoSize}`,
          'Content-Length': chunk.length,
        }
      })
    } catch (err) {
      throw new Error(`TikTok chunk ${i + 1} upload failed: ${err.message}`)
    }
  }

  // 3. Poll publish status
  let attempts = 0
  while (attempts < 20) {
    await new Promise(r => setTimeout(r, 3000))
    try {
      const statusRes = await axios.post(
        'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
        { publish_id },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' } }
      )
      const { status: pubStatus, share_url } = statusRes.data.data
      if (pubStatus === 'PUBLISH_COMPLETE') {
        return { publish_id, share_url, status: 'PUBLISH_COMPLETE' }
      }
      if (pubStatus === 'FAILED') {
        throw new Error('TikTok publish failed')
      }
    } catch (err) {
      if (err.message === 'TikTok publish failed') throw err
    }
    attempts++
  }

  throw new Error('TikTok publish timeout after 60 seconds')
}

module.exports = { publishToTikTok }
