/**
 * RENTMIES — GENERATE VIDEO WITH GEMINI VEO
 * POST /api/generate-video
 *
 * Body:
 *   { propertyId, photos: string[], description, ciudad, tipo, apiKey? }
 *
 * Flujo:
 *   1. Llama a Gemini Veo para generar video de 15s (9:16, MP4)
 *   2. Sube el video a Supabase Storage (bucket: property-videos)
 *   3. Guarda registro en generated_videos
 *   4. Retorna { videoUrl }
 *
 * Sin credenciales → modo simulación.
 */

const https   = require('https')
const supabase = require('../lib/supabase')
const { requireAuth } = require('../lib/auth')

// ── Gemini Veo: iniciar operación de generación de video ──
function veoGenerateVideo(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'veo-2.0-flash-exp',
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['video'],
        duration: '15s',
        aspectRatio: '9:16',
        personGeneration: 'dont_allow',
      },
    })
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path:     `/v1beta/models/veo-2.0-flash-exp:generateContent?key=${apiKey}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }
    const req = https.request(options, r => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) return reject(new Error(`Veo: ${json.error.message} (${json.error.code})`))
          resolve(json)
        } catch (e) { reject(new Error('Non-JSON from Veo: ' + data.slice(0, 200))) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Construir prompt para video inmobiliario ──
function buildVideoPrompt({ tipo, ciudad, description, amenidades = [] }) {
  const features = amenidades.length ? amenidades.join(', ') : 'acabados modernos'
  return [
    `Genera un video slideshow vertical (9:16) de 15 segundos para TikTok y Reels`,
    `mostrando un ${tipo} en ${ciudad}, Colombia.`,
    `${description ? 'Descripción: ' + description + '.' : ''}`,
    `Características: ${features}.`,
    `Estilo: moderno, dinámico, con transiciones suaves entre tomas del interior y exterior.`,
    `Iluminación cálida y natural. Colores vibrantes. Sin texto ni watermarks.`,
    `Enfoque en espacios amplios, cocina moderna, sala luminosa y vista desde ventanas.`,
    `Tono aspiracional, para audiencia entre 25-50 años interesada en arrendar.`,
  ].join(' ')
}

// ── Subir video buffer a Supabase Storage ──
async function uploadVideoToSupabase(videoBuffer, fileName) {
  if (!supabase) throw new Error('Supabase no configurado')

  const { data, error } = await supabase.storage
    .from('property-videos')
    .upload(fileName, videoBuffer, {
      contentType:  'video/mp4',
      cacheControl: '3600',
      upsert:        true,
    })

  if (error) throw new Error(`Supabase Storage: ${error.message}`)

  const { data: urlData } = supabase.storage
    .from('property-videos')
    .getPublicUrl(fileName)

  return urlData.publicUrl
}

// ── Guardar registro en DB ──
async function saveVideoRecord({ propertyId, clientId, prompt, videoUrl, model }) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('generated_videos')
    .insert({ property_id: propertyId, client_id: clientId, prompt, video_url: videoUrl, model, status: 'ready' })
    .select('id')
    .single()
  if (error) console.error('[generate-video] DB insert error:', error.message)
  return data?.id
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
    propertyId,
    clientId,
    photos        = [],
    description   = '',
    ciudad        = 'Bogotá',
    tipo          = 'apartamento',
    amenidades    = [],
    apiKey        = process.env.GEMINI_API_KEY || '',
    simulate      = false,
  } = req.body || {}

  // ── Modo simulación ──
  if (simulate || !apiKey) {
    await new Promise(r => setTimeout(r, 1500))
    return res.status(200).json({
      success:   true,
      simulated: true,
      videoUrl:  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      message:   'Video simulado. Configura GEMINI_API_KEY para generar videos reales con Veo.',
    })
  }

  try {
    const prompt = buildVideoPrompt({ tipo, ciudad, description, amenidades })

    // 1. Llamar a Gemini Veo
    const veoResponse = await veoGenerateVideo(apiKey, prompt)

    // Extraer video de la respuesta (base64 MP4)
    const part = veoResponse?.candidates?.[0]?.content?.parts?.[0]
    if (!part) throw new Error('Veo no retornó contenido de video')

    let videoUrl
    const fileName = `property_${propertyId || Date.now()}_${Date.now()}.mp4`

    if (part.inlineData?.data) {
      // 2a. Video como base64 → subir a Supabase Storage
      const videoBuffer = Buffer.from(part.inlineData.data, 'base64')
      videoUrl = await uploadVideoToSupabase(videoBuffer, fileName)
    } else if (part.fileData?.fileUri) {
      // 2b. Veo retorna URI de Google File API → usar directamente
      videoUrl = part.fileData.fileUri
    } else {
      throw new Error('Formato de respuesta Veo desconocido: ' + JSON.stringify(part).slice(0, 200))
    }

    // 3. Guardar en DB
    const videoId = await saveVideoRecord({ propertyId, clientId, prompt, videoUrl, model: 'veo-2.0-flash-exp' })

    // 4. Actualizar property si viene propertyId
    if (propertyId && supabase) {
      await supabase.from('properties').update({ video_url: videoUrl }).eq('id', propertyId)
    }

    return res.status(200).json({ success: true, simulated: false, videoUrl, videoId, prompt })

  } catch (err) {
    console.error('[generate-video] Error:', err.message)

    // Veo en preview puede no estar disponible para todas las keys — mensaje claro
    const isUnavailable = err.message.includes('404') || err.message.includes('not found') || err.message.includes('preview')
    return res.status(isUnavailable ? 503 : 500).json({
      success: false,
      error:   err.message,
      hint:    isUnavailable
        ? 'Gemini Veo requiere acceso al programa preview. Solicita acceso en aistudio.google.com'
        : null,
    })
  }
}
