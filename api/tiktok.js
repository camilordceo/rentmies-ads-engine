/**
 * RENTMIES — TIKTOK VIDEO PUBLISHER
 * POST /api/tiktok
 *
 * Publica un video en TikTok via Content Posting API v2.
 * Requiere access_token del usuario (obtenido via OAuth /api/auth/tiktok).
 *
 * Body:
 *   {
 *     videoUrl,       // URL pública del video (Supabase Storage)
 *     caption,        // título del post (max 2200 chars)
 *     accessToken,    // token del usuario TikTok (o client_id para buscarlo en Supabase)
 *     clientId?,      // si viene, busca el token en Supabase
 *     privacyLevel?,  // PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | SELF_ONLY
 *     propertyId?,    // para guardar en social_posts
 *     simulate?
 *   }
 *
 * IMPORTANTE: Sin auditoría TikTok aprobada los posts serán PRIVADOS (SELF_ONLY).
 */

const https    = require('https')
const supabase = require('../lib/supabase')
const { requireAuth } = require('../lib/auth')

function tiktokPost(path, accessToken, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const options = {
      hostname: 'open.tiktokapis.com',
      path,
      method:   'POST',
      headers:  {
        'Authorization':  `Bearer ${accessToken}`,
        'Content-Type':   'application/json; charset=UTF-8',
        'Content-Length': Buffer.byteLength(payload),
      },
    }
    const req = https.request(options, r => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error?.code && json.error.code !== 'ok') {
            return reject(new Error(`TikTok: ${json.error.message} (${json.error.code})`))
          }
          resolve(json)
        } catch (e) { reject(new Error('Non-JSON from TikTok: ' + data.slice(0, 200))) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// Paso 1: Consultar creator info (obligatorio antes de publicar)
async function queryCreatorInfo(accessToken) {
  return tiktokPost('/v2/post/publish/creator_info/query/', accessToken, {})
}

// Paso 2: Iniciar publicación por URL (PULL_FROM_URL)
async function initVideoPublish({ accessToken, videoUrl, caption, privacyLevel, coverTimestampMs = 1000 }) {
  return tiktokPost('/v2/post/publish/video/init/', accessToken, {
    post_info: {
      title:                    caption.slice(0, 2200),
      privacy_level:            privacyLevel,
      disable_duet:             false,
      disable_comment:          false,
      disable_stitch:           false,
      video_cover_timestamp_ms: coverTimestampMs,
    },
    source_info: {
      source:    'PULL_FROM_URL',
      video_url: videoUrl,
    },
  })
}

// Paso 3: Verificar estado de publicación
async function checkPublishStatus(accessToken, publishId) {
  return tiktokPost('/v2/post/publish/status/fetch/', accessToken, { publish_id: publishId })
}

// Guardar en Supabase
async function savePostRecord({ clientId, propertyId, publishId, status, caption, mediaUrl }) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('social_posts')
    .insert({
      client_id:   clientId,
      property_id: propertyId,
      platform:    'tiktok',
      format:      'video',
      publish_id:  publishId,
      status,
      caption,
      media_url:   mediaUrl,
      meta:        { publish_id: publishId },
    })
    .select('id').single()
  if (error) console.error('[tiktok] DB insert error:', error.message)
  return data?.id
}

// Buscar token en Supabase por client_id
async function getStoredToken(clientId) {
  if (!supabase || !clientId) return null
  const { data } = await supabase
    .from('social_tokens')
    .select('access_token, open_id, expires_at')
    .eq('client_id', clientId)
    .eq('platform', 'tiktok')
    .single()
  return data
}

// ── Vercel handler ──
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  const auth = await requireAuth(req, res); if (!auth) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    videoUrl,
    caption       = '🏠 Inmueble disponible en Colombia #inmuebles #arriendos #fyp',
    accessToken:  tokenFromBody,
    clientId,
    privacyLevel  = 'PUBLIC_TO_EVERYONE',
    propertyId,
    simulate      = false,
  } = req.body || {}

  // ── Modo simulación ──
  if (simulate) {
    await new Promise(r => setTimeout(r, 800))
    const fakeId = `v_pub_mock_${Date.now()}`
    return res.status(200).json({
      success:   true,
      simulated: true,
      publishId: fakeId,
      status:    'PUBLISH_COMPLETE',
      message:   'Simulado. Configura el OAuth de TikTok para publicar real.',
    })
  }

  // ── Obtener access token ──
  let accessToken = tokenFromBody
  if (!accessToken && clientId) {
    const stored = await getStoredToken(clientId)
    if (stored) {
      accessToken = stored.access_token
      // Verificar expiración
      if (stored.expires_at && new Date(stored.expires_at) < new Date()) {
        return res.status(401).json({ success: false, error: 'Token de TikTok expirado. Reconecta tu cuenta.' })
      }
    }
  }

  if (!accessToken) {
    return res.status(401).json({
      success: false,
      error:   'Falta access_token de TikTok. Conecta tu cuenta en /api/auth/tiktok',
    })
  }

  if (!videoUrl) {
    return res.status(400).json({ success: false, error: 'Se requiere videoUrl' })
  }

  try {
    // 1. Creator info (obligatorio)
    const creatorInfo = await queryCreatorInfo(accessToken)
    const privacyOptions = creatorInfo?.data?.privacy_level_options || []
    const effectivePrivacy = privacyOptions.includes(privacyLevel) ? privacyLevel : (privacyOptions[0] || 'SELF_ONLY')

    // 2. Iniciar publicación
    const initResult = await initVideoPublish({ accessToken, videoUrl, caption, privacyLevel: effectivePrivacy })
    const publishId  = initResult?.data?.publish_id
    if (!publishId) throw new Error('TikTok no retornó publish_id')

    // 3. Guardar en DB como "processing"
    const postDbId = await savePostRecord({ clientId, propertyId, publishId, status: 'processing', caption, mediaUrl: videoUrl })

    // 4. Polling del estado (hasta 30s)
    let finalStatus = 'processing'
    let postId      = null
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const statusRes = await checkPublishStatus(accessToken, publishId)
      finalStatus = statusRes?.data?.status || 'processing'
      postId      = statusRes?.data?.publicaly_available_post_id?.[0] || null

      if (finalStatus === 'PUBLISH_COMPLETE' || finalStatus === 'FAILED') break
    }

    // 5. Actualizar DB con status final
    if (supabase && postDbId) {
      await supabase.from('social_posts').update({
        status:       finalStatus === 'PUBLISH_COMPLETE' ? 'published' : finalStatus.toLowerCase(),
        post_id:      postId,
        published_at: finalStatus === 'PUBLISH_COMPLETE' ? new Date().toISOString() : null,
        meta:         { publish_id: publishId, post_id: postId, privacy: effectivePrivacy },
      }).eq('id', postDbId)
    }

    return res.status(200).json({
      success:   true,
      simulated: false,
      publishId,
      postId,
      status:    finalStatus,
      privacy:   effectivePrivacy,
      warning:   effectivePrivacy === 'SELF_ONLY'
        ? 'Post publicado como PRIVADO. Solicita auditoría en TikTok Developer Portal para publicar públicamente.'
        : null,
    })

  } catch (err) {
    console.error('[tiktok] Error:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}
