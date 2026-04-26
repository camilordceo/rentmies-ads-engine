/**
 * RENTMIES — AI assist (OpenAI direct)
 *
 *   POST /api/ai?action=caption
 *     Body: { inmueble, platform?, vibe? }
 *     Returns: { caption: string }
 *
 *   POST /api/ai?action=image
 *     Body: { inmueble?, prompt?, reference_image_url?, size? }
 *     Returns: { url, persisted, prompt, reference_used, warning? }
 *
 * Env vars (required):
 *   OPENAI_API_KEY
 *
 * Env vars (optional):
 *   OPENAI_CHAT_MODEL    (default: gpt-4o-mini)
 *   OPENAI_IMAGE_MODEL   (default: gpt-image-1)
 *
 * Supabase Storage (required for image persistence):
 *   SUPABASE_URL + SUPABASE_SERVICE_KEY
 *   Bucket 'ai-images' must exist with public read enabled.
 *
 * Why /v1/images/edits and not Responses API for images:
 *   gpt-image-1 always returns base64. Going through /v1/responses with the
 *   image_generation tool adds chat-model token costs on top of the image
 *   cost (you pay twice). The dedicated /v1/images/edits endpoint is a
 *   straight image-to-image call when a reference URL is provided.
 */

const axios = require('axios')
const FormData = require('form-data')
const { createClient } = require('@supabase/supabase-js')

const OPENAI_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_CHAT = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'
const OPENAI_IMG = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
const OPENAI_BASE = 'https://api.openai.com/v1'

function getSupabaseService() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

const CAPTION_SYSTEM = `Eres un copywriter senior de Rentmies, una empresa colombiana de tecnología inmobiliaria que opera en Bogotá, Medellín y Cali. Tu trabajo es escribir captions para redes sociales que arrienden o vendan inmuebles.

TONO: moderno, directo, confiable. Espontáneo pero profesional. Cero relleno corporativo.

ESTRUCTURA del caption (entre 80 y 150 palabras):
1. Una primera línea con gancho visual o pregunta provocadora.
2. Dos o tres highlights del inmueble en formato de bullet con emojis sutiles (no abuses).
3. Llamada a la acción clara: escribir por WhatsApp, agendar visita, etc.
4. Tres a cinco hashtags al final, relevantes al inmueble y la ciudad.

REGLAS DURAS:
- NUNCA uses clichés ("la casa de tus sueños", "oportunidad única", "no te lo puedes perder").
- NUNCA inventes precios, áreas, habitaciones o detalles que no estén en los datos.
- Si no hay precio, no menciones precio.
- NUNCA prometas rendimientos ni valorización garantizada.
- Usa SIEMPRE los datos del inmueble que te paso.
- Hashtags al final: #rentmies + ciudad (sin tildes, lowercase) + tipo de inmueble.

Devuelve SOLO el caption final, sin comentarios ni encabezados ni "Aquí está tu caption:".`

function buildCaptionUserMessage(inmueble, platform, vibe) {
  const lines = []
  lines.push(`Plataforma destino: ${platform || 'instagram'}`)
  if (vibe) lines.push(`Enfoque solicitado: ${vibe}`)
  lines.push('')
  lines.push('Datos del inmueble:')
  if (inmueble.proyecto) lines.push(`- Proyecto: ${inmueble.proyecto}`)
  const tipo = inmueble.tipo || inmueble.tipo_inmueble_propiedad
  if (tipo) lines.push(`- Tipo: ${tipo}`)
  const ciudad = inmueble.ciudad || inmueble.nombre_ciudad
  if (ciudad) lines.push(`- Ciudad: ${ciudad}`)
  if (inmueble.nombre_barrio && inmueble.nombre_barrio !== inmueble.proyecto) lines.push(`- Barrio: ${inmueble.nombre_barrio}`)
  if (inmueble.area) lines.push(`- Área: ${inmueble.area} m²`)
  if (inmueble.habitaciones) lines.push(`- Habitaciones: ${inmueble.habitaciones}`)
  if (inmueble.banos) lines.push(`- Baños: ${inmueble.banos}`)
  if (inmueble.precio) lines.push(`- Precio: ${inmueble.precio}`)
  if (inmueble.transaccion) lines.push(`- Tipo de operación: ${inmueble.transaccion}`)
  if (inmueble.descripcion) lines.push(`- Descripción interna: ${inmueble.descripcion}`)
  return lines.join('\n')
}

function buildImagePrompt(inmueble, custom, hasReference) {
  if (custom && custom.trim()) return custom.trim()
  const tipo = (inmueble.tipo || inmueble.tipo_inmueble_propiedad || 'apartamento').toLowerCase()
  const ciudad = inmueble.ciudad || inmueble.nombre_ciudad || 'Colombia'
  const proyecto = inmueble.proyecto ? ` (proyecto ${inmueble.proyecto})` : ''
  const desc = inmueble.descripcion ? ` Estilo: ${inmueble.descripcion}.` : ''

  if (hasReference) {
    return (
      `Reinterpret the reference photo as a polished editorial real estate marketing image of a ${tipo} in ${ciudad}, Colombia${proyecto}.${desc} ` +
      `Keep the building's architecture, layout and proportions faithful to the reference. ` +
      `Upgrade lighting to golden hour with warm natural tones, deepen colors, add subtle atmosphere (light haze, soft sky), polish surfaces. ` +
      `Magazine-quality real estate photography aesthetic. No people. Square 1:1 aspect ratio. ` +
      `Strict: no text, no logos, no watermarks, no signage overlays.`
    )
  }
  return (
    `Editorial real estate marketing photograph of a modern ${tipo} in ${ciudad}, Colombia${proyecto}.${desc} ` +
    `Premium magazine quality, golden hour natural lighting, clean architectural composition, no people, aspirational minimalist mood. ` +
    `Square 1:1 aspect ratio, high resolution. Strict: no text, no logos, no watermarks, no signage.`
  )
}

// ─── Caption via Responses API ────────────────────────────────────────────
async function generateCaption(inmueble, platform, vibe) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY no configurada en Vercel.')

  const body = {
    model: OPENAI_CHAT,
    instructions: CAPTION_SYSTEM,
    input: buildCaptionUserMessage(inmueble, platform, vibe),
    max_output_tokens: 600
  }
  try {
    const { data } = await axios.post(`${OPENAI_BASE}/responses`, body, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      timeout: 25000
    })
    const caption = (data && data.output_text) || extractTextFromOutput(data && data.output)
    if (!caption || !caption.trim()) throw new Error('OpenAI devolvió respuesta vacía')
    return { caption: caption.trim() }
  } catch (err) {
    const msg = (err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err.message
    throw new Error(`Caption falló: ${msg}`)
  }
}

function extractTextFromOutput(output) {
  if (!Array.isArray(output)) return ''
  for (const item of output) {
    if (item && item.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c && c.type === 'output_text' && c.text) return c.text
      }
    }
  }
  return ''
}

// ─── Image via /v1/images/edits or /v1/images/generations ────────────────
async function generateImage({ prompt, referenceImageUrl, size }) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY no configurada en Vercel.')

  const finalSize = size || '1024x1024'
  let response

  if (referenceImageUrl) {
    // Image-to-image edit. Download the reference, then upload as multipart.
    let refBuffer, refContentType, refExt
    try {
      const imgRes = await axios.get(referenceImageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 25 * 1024 * 1024
      })
      refBuffer = Buffer.from(imgRes.data)
      refContentType = imgRes.headers['content-type'] || 'image/png'
      refExt = (refContentType.split('/')[1] || 'png').split(';')[0].replace(/[^a-z0-9]/gi, '') || 'png'
    } catch (err) {
      throw new Error(`No se pudo descargar la imagen de referencia (${err.message}). URL: ${referenceImageUrl.slice(0, 80)}…`)
    }

    const form = new FormData()
    form.append('image', refBuffer, { filename: `ref.${refExt}`, contentType: refContentType })
    form.append('model', OPENAI_IMG)
    form.append('prompt', prompt)
    form.append('size', finalSize)
    form.append('quality', 'medium')
    form.append('n', '1')

    response = await axios.post(`${OPENAI_BASE}/images/edits`, form, {
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        ...form.getHeaders()
      },
      timeout: 90000,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024
    })
  } else {
    // Text-to-image (no reference)
    response = await axios.post(`${OPENAI_BASE}/images/generations`, {
      model: OPENAI_IMG,
      prompt,
      size: finalSize,
      quality: 'medium',
      n: 1
    }, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      timeout: 90000,
      maxContentLength: 50 * 1024 * 1024
    })
  }

  const item = response.data && response.data.data && response.data.data[0]
  if (!item) throw new Error('OpenAI no devolvió data')
  if (item.b64_json) return { kind: 'b64', value: item.b64_json }
  if (item.url) return { kind: 'url', value: item.url }
  throw new Error('OpenAI devolvió formato no reconocido')
}

const AI_BUCKET = 'ai-images'

async function ensureBucket(sb) {
  // Idempotent: check first, create only if missing. Tolerant to "already exists"
  // races when two requests provision concurrently.
  try {
    const { data: buckets, error } = await sb.storage.listBuckets()
    if (!error && Array.isArray(buckets) && buckets.find(b => b.name === AI_BUCKET)) return
  } catch (_) { /* fall through to create */ }

  const { error: createErr } = await sb.storage.createBucket(AI_BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024
    // intentionally not setting allowedMimeTypes — keeps the bucket flexible
    // for future formats (we already control inputs server-side).
  })
  if (createErr && !/already exists|duplicate/i.test(createErr.message || '')) {
    throw new Error(`No se pudo crear bucket "${AI_BUCKET}": ${createErr.message}`)
  }
}

async function persistImageToSupabase(image, empresaId, inmuebleId) {
  const sb = getSupabaseService()
  if (!sb) {
    return {
      url: null,
      persisted: false,
      warning: 'Supabase no configurado. Define SUPABASE_URL y SUPABASE_SERVICE_KEY en Vercel.'
    }
  }

  try {
    // Auto-provision the bucket on first use. No-op if it already exists.
    await ensureBucket(sb)

    let buffer, contentType
    if (image.kind === 'url') {
      const res = await axios.get(image.value, { responseType: 'arraybuffer', timeout: 30000 })
      buffer = Buffer.from(res.data)
      contentType = res.headers['content-type'] || 'image/png'
    } else {
      buffer = Buffer.from(image.value, 'base64')
      contentType = 'image/png'
    }

    const ext = (contentType.split('/')[1] || 'png').split(';')[0].replace(/[^a-z0-9]/gi, '') || 'png'
    const safeId = (inmuebleId || 'ai').replace(/[^a-z0-9]/gi, '_').slice(0, 40)
    const path = `${empresaId || 'demo'}/${Date.now()}-${safeId}.${ext}`

    const { error: upErr } = await sb.storage.from(AI_BUCKET).upload(path, buffer, {
      contentType,
      upsert: false
    })
    if (upErr) throw new Error(upErr.message)

    const { data: pub } = sb.storage.from(AI_BUCKET).getPublicUrl(path)
    return { url: pub.publicUrl, persisted: true, path }
  } catch (err) {
    return { url: null, persisted: false, warning: `Supabase Storage: ${err.message}` }
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = (req.query.action || '').toString()
  const empresaId = req.headers['x-empresa-id'] || 'demo'

  try {
    if (action === 'caption') {
      const { inmueble, platform, vibe } = req.body || {}
      if (!inmueble) return res.status(400).json({ error: 'inmueble es requerido' })
      const result = await generateCaption(inmueble, platform, vibe)
      return res.json(result)
    }

    if (action === 'image') {
      const { inmueble, prompt: userPrompt, reference_image_url, size } = req.body || {}
      const refUrl = reference_image_url || (inmueble && inmueble.image_link_1) || ''
      const finalPrompt = buildImagePrompt(inmueble || {}, userPrompt, !!refUrl)

      let image
      try {
        image = await generateImage({ prompt: finalPrompt, referenceImageUrl: refUrl, size })
      } catch (err) {
        const msg = (err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err.message
        return res.status(500).json({ error: 'Imagen falló', detail: msg })
      }

      const persisted = await persistImageToSupabase(image, empresaId, inmueble && inmueble.id)
      if (!persisted.url) {
        return res.status(500).json({
          error: 'Imagen generada pero sin URL pública',
          detail: persisted.warning
        })
      }

      return res.json({
        url: persisted.url,
        persisted: persisted.persisted,
        prompt: finalPrompt,
        reference_used: !!refUrl,
        warning: persisted.warning
      })
    }

    return res.status(400).json({ error: `Acción no válida: '${action}'. Usa caption | image` })
  } catch (err) {
    console.error('[ai]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
