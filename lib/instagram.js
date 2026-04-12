/**
 * RENTMIES — Instagram Publisher (lib)
 *
 * Funciones puras de publicación en Instagram Graph API v21.0.
 * Sin req/res — se llaman desde api/instagram.js y engine/scheduler30.js.
 *
 * Flujo:
 *   1. Crear container (imagen o reel)
 *   2. Esperar procesamiento (polling status_code)
 *   3. Publicar container (media_publish)
 *   4. Obtener permalink
 */

const https = require('https')

const BASE = 'https://graph.facebook.com/v21.0'

function graphRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path)
    const payload = body ? JSON.stringify(body) : null

    const options = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }

    const req = https.request(options, (r) => {
      let data = ''
      r.on('data', chunk => data += chunk)
      r.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) reject(new Error(`Meta API: ${json.error.message} (code ${json.error.code})`))
          else resolve(json)
        } catch(e) { reject(new Error('Respuesta no-JSON de Meta API')) }
      })
    })

    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function createImageContainer({ igAccountId, accessToken, imageUrl, caption }) {
  const params = new URLSearchParams({ image_url: imageUrl, caption, access_token: accessToken })
  const result = await graphRequest('POST', `/${igAccountId}/media?${params}`, null)
  return result.id
}

async function createReelContainer({ igAccountId, accessToken, videoUrl, caption, shareToFeed = true }) {
  const params = new URLSearchParams({
    media_type:    'REELS',
    video_url:     videoUrl,
    caption,
    share_to_feed: String(shareToFeed),
    access_token:  accessToken,
  })
  const result = await graphRequest('POST', `/${igAccountId}/media?${params}`, null)
  return result.id
}

async function publishContainer({ igAccountId, accessToken, creationId }) {
  const params = new URLSearchParams({ creation_id: creationId, access_token: accessToken })
  const result = await graphRequest('POST', `/${igAccountId}/media_publish?${params}`, null)
  return result.id
}

async function getPermalink({ mediaId, accessToken }) {
  const params = new URLSearchParams({ fields: 'permalink,thumbnail_url,timestamp', access_token: accessToken })
  return await graphRequest('GET', `/${mediaId}?${params}`, null)
}

async function checkContainerStatus({ creationId, accessToken }) {
  const params = new URLSearchParams({ fields: 'status_code,status', access_token: accessToken })
  return await graphRequest('GET', `/${creationId}?${params}`, null)
}

/**
 * Flujo completo: imagen/video → container → publicar → permalink.
 *
 * @param {object} opts
 *   @param {string} opts.igAccountId
 *   @param {string} opts.accessToken
 *   @param {string} [opts.imageUrl]
 *   @param {string} [opts.videoUrl]
 *   @param {string} opts.caption
 *   @param {string} [opts.format='image']  'image' | 'video'
 *   @param {boolean} [opts.shareToFeed=true]
 * @returns {{ success, mediaId, creationId, permalink, timestamp, platform, format }}
 */
async function publishToInstagram({ igAccountId, accessToken, imageUrl, videoUrl, caption, format = 'image', shareToFeed = true }) {
  const mediaUrl = format === 'video' ? videoUrl : imageUrl

  if (!mediaUrl || mediaUrl.startsWith('data:') || mediaUrl.includes('localhost')) {
    throw new Error(`URL de ${format === 'video' ? 'video' : 'imagen'} debe ser pública (no base64 ni localhost)`)
  }

  // 1. Crear container
  let creationId
  if (format === 'video') {
    creationId = await createReelContainer({ igAccountId, accessToken, videoUrl: mediaUrl, caption, shareToFeed })
  } else {
    creationId = await createImageContainer({ igAccountId, accessToken, imageUrl: mediaUrl, caption })
  }

  // 2. Esperar procesamiento
  const initialDelay = format === 'video' ? 8000 : 3000
  await new Promise(r => setTimeout(r, initialDelay))

  for (let i = 0; i < 6; i++) {
    const status = await checkContainerStatus({ creationId, accessToken })
    if (status.status_code === 'FINISHED') break
    if (status.status_code === 'ERROR') throw new Error(`Container error: ${status.status}`)
    if (i === 5) throw new Error('Container no listo después de múltiples intentos')
    await new Promise(r => setTimeout(r, format === 'video' ? 5000 : 3000))
  }

  // 3. Publicar
  const mediaId = await publishContainer({ igAccountId, accessToken, creationId })

  // 4. Obtener permalink
  const post = await getPermalink({ mediaId, accessToken })

  return {
    success:   true,
    mediaId,
    creationId,
    permalink: post.permalink,
    timestamp: post.timestamp,
    platform:  'instagram',
    format,
  }
}

module.exports = { publishToInstagram, createImageContainer, createReelContainer, publishContainer, getPermalink, checkContainerStatus }
