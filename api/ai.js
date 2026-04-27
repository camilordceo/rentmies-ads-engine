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

function buildCaptionUserMessage(inmueble, platform, vibe, customInstructions, hasImage) {
  const lines = []
  lines.push(`Plataforma destino: ${platform || 'instagram'}`)
  if (vibe) lines.push(`Enfoque solicitado: ${vibe}`)

  const tipo = inmueble.tipo || inmueble.tipo_inmueble_propiedad
  const ciudad = inmueble.ciudad || inmueble.nombre_ciudad
  const hasInmuebleData = !!(inmueble.proyecto || tipo || ciudad || inmueble.descripcion)

  if (hasInmuebleData) {
    lines.push('')
    lines.push('Datos del inmueble:')
    if (inmueble.proyecto) lines.push(`- Proyecto: ${inmueble.proyecto}`)
    if (tipo) lines.push(`- Tipo: ${tipo}`)
    if (ciudad) lines.push(`- Ciudad: ${ciudad}`)
    if (inmueble.nombre_barrio && inmueble.nombre_barrio !== inmueble.proyecto) lines.push(`- Barrio: ${inmueble.nombre_barrio}`)
    if (inmueble.area) lines.push(`- Área: ${inmueble.area} m²`)
    if (inmueble.habitaciones) lines.push(`- Habitaciones: ${inmueble.habitaciones}`)
    if (inmueble.banos) lines.push(`- Baños: ${inmueble.banos}`)
    if (inmueble.precio) lines.push(`- Precio: ${inmueble.precio}`)
    if (inmueble.transaccion) lines.push(`- Tipo de operación: ${inmueble.transaccion}`)
    if (inmueble.descripcion) lines.push(`- Descripción interna: ${inmueble.descripcion}`)
  }

  if (hasImage) {
    lines.push('')
    if (hasInmuebleData) {
      lines.push('Te paso también la foto del inmueble. Úsala para enriquecer el caption con detalles visuales reales (acabados, vista, espacios) — sin contradecir los datos.')
    } else {
      lines.push('NO TENGO datos estructurados del inmueble — solo la foto adjunta. Mira la imagen y escribe un caption basado en lo que efectivamente se ve: tipo de espacio, vibe, posibles atributos visuales (luz natural, terraza, vista, materiales). NO inventes ciudad, precio, ni detalles que no aparezcan en la foto.')
    }
  }

  if (customInstructions && customInstructions.trim()) {
    lines.push('')
    lines.push(`Instrucciones adicionales del cliente para este caption: ${customInstructions.trim()}`)
  }

  if (!hasInmuebleData && !hasImage) {
    lines.push('')
    lines.push('No tengo datos del inmueble ni foto. Escribe un caption genérico breve invitando a contactar para más información, basándote SOLO en las instrucciones del cliente si las hay.')
  }

  return lines.join('\n')
}

function buildImagePrompt({ inmueble, customPrompt, customInstructions, hasReference, platform, size }) {
  // If user provided a fully custom prompt, use it verbatim.
  if (customPrompt && customPrompt.trim()) return customPrompt.trim()

  const tipo = (inmueble.tipo || inmueble.tipo_inmueble_propiedad || 'apartamento').toLowerCase()
  const ciudad = inmueble.ciudad || inmueble.nombre_ciudad || 'Colombia'
  const proyecto = inmueble.proyecto ? ` (project: ${inmueble.proyecto})` : ''
  const desc = inmueble.descripcion ? ` Style note: ${inmueble.descripcion}.` : ''
  const wantsText = !!(customInstructions && customInstructions.trim())

  // Aspect-aware composition guide so gpt-image-1 frames the shot correctly.
  let composition = 'square 1:1 composition, centered architectural focal point'
  if (size === '1536x1024') composition = 'wide 3:2 landscape composition, generous sky, architecture on the right third'
  else if (size === '1024x1536') composition = 'tall 2:3 portrait composition, vertical emphasis on the building, sky and ground softly framing'

  const platformGuide = platform === 'instagram'
    ? 'Optimized for Instagram feed: high contrast, vibrant tones, eye-catching at thumbnail size, single clear focal point.'
    : 'Optimized for social media feed: high contrast, eye-catching at thumbnail size.'

  const parts = []

  if (hasReference) {
    parts.push(
      `Reinterpret the supplied reference photo into a polished editorial real estate marketing image of a ${tipo} in ${ciudad}, Colombia${proyecto}.${desc}`,
      `Keep the building's architecture, materials, layout and proportions faithful to the reference — do NOT redesign the structure.`,
      `Upgrade lighting to golden hour with warm natural tones, deepen colors, add subtle atmosphere (light haze, soft sky, soft shadows), polish surfaces and textures.`,
      `Magazine-quality real estate photography aesthetic. No people visible.`,
      composition + '.',
      platformGuide
    )
  } else {
    parts.push(
      `Editorial real estate marketing photograph of a modern ${tipo} in ${ciudad}, Colombia${proyecto}.${desc}`,
      `Premium magazine quality, golden hour natural lighting, clean architectural composition, no people, aspirational minimalist mood.`,
      composition + '.',
      platformGuide
    )
  }

  if (wantsText) {
    // Client wants text/price/branding rendered in the image.
    parts.push(
      `CLIENT INSTRUCTIONS — follow exactly: ${customInstructions.trim()}`,
      `When rendering any text, price, label or call-to-action: use clean modern sans-serif typography (Inter or similar), ensure high contrast against the background, place it tastefully (e.g. a bottom band, a corner badge, or a clean card overlay) without obscuring key architectural elements.`,
      `If brand colors are referenced, Rentmies green is #006c4a (deep) and #40d99d (vibrant). Keep accents minimal — one or two colors max.`,
      `Spell every word in the client instructions correctly and exactly as written. Do not paraphrase, do not translate.`
    )
  } else {
    parts.push('Strict: no text, no logos, no watermarks, no signage, no UI overlays.')
  }

  parts.push('High resolution, photorealistic.')
  return parts.join(' ')
}

// ─── Batch captions: N variantes con vibes rotando, 1 sola llamada ───
// Each vibe maps to a different angle on the property so the campaign
// doesn't read like 10 copies of the same post. Saves ~80% vs N calls.
const DEFAULT_VIBES = [
  'gancho visual — empieza con una observación impactante de lo que se ve en la foto',
  'datos duros — destaca números concretos (área, habitaciones, ubicación)',
  'storytelling — arranca con una mini historia de quién vive ahí',
  'urgencia — disponibilidad limitada, ahora es momento',
  'CTA emocional — pregunta al lector qué siente al verlo',
  'lifestyle — describe cómo es un día típico en este lugar',
  'comparativa — por qué este vale más que la competencia del barrio',
  'social proof — referencias a otros clientes felices o demanda',
  'pregunta-gancho — abre con pregunta provocadora',
  'beneficio único — un detalle diferencial que nadie más tiene'
]

async function generateBatchCaptions({ inmueble, count, vibes, platform, referenceImageUrl, customInstructions }) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY no configurada en Vercel.')
  const n = Math.max(1, Math.min(30, parseInt(count, 10) || 1))
  const vibeList = (vibes && vibes.length ? vibes : DEFAULT_VIBES).slice()
  // Rotate vibes if count > vibeList.length
  const assignedVibes = []
  for (let i = 0; i < n; i++) assignedVibes.push(vibeList[i % vibeList.length])

  const inm = inmueble || {}
  const tipo = inm.tipo || inm.tipo_inmueble_propiedad
  const ciudad = inm.ciudad || inm.nombre_ciudad
  const dataLines = []
  if (inm.proyecto) dataLines.push(`- Proyecto: ${inm.proyecto}`)
  if (tipo) dataLines.push(`- Tipo: ${tipo}`)
  if (ciudad) dataLines.push(`- Ciudad: ${ciudad}`)
  if (inm.nombre_barrio && inm.nombre_barrio !== inm.proyecto) dataLines.push(`- Barrio: ${inm.nombre_barrio}`)
  if (inm.area) dataLines.push(`- Área: ${inm.area} m²`)
  if (inm.habitaciones) dataLines.push(`- Habitaciones: ${inm.habitaciones}`)
  if (inm.banos) dataLines.push(`- Baños: ${inm.banos}`)
  if (inm.precio) dataLines.push(`- Precio: ${inm.precio}`)
  if (inm.transaccion) dataLines.push(`- Tipo de operación: ${inm.transaccion}`)
  if (inm.descripcion) dataLines.push(`- Descripción interna: ${inm.descripcion}`)

  const userText = [
    `Necesito ${n} captions DIFERENTES para una campaña de redes sociales del mismo inmueble en ${platform || 'instagram'}.`,
    '',
    'Cada caption debe tener un enfoque distinto (vibe). Te paso la lista numerada de vibes — respeta el orden y aplica cada vibe al caption con el mismo índice. NO repitas frases ni estructuras entre captions.',
    '',
    'Vibes solicitados (en orden):',
    ...assignedVibes.map((v, i) => `${i + 1}. ${v}`),
    '',
    dataLines.length ? 'Datos del inmueble:' : 'No tengo datos estructurados del inmueble — usa SOLO la imagen y/o las instrucciones del cliente.',
    ...dataLines,
    customInstructions && customInstructions.trim() ? `\nInstrucciones del cliente: ${customInstructions.trim()}` : '',
    '',
    `Devuelve un objeto JSON con array "captions" de exactamente ${n} elementos. Cada elemento: { "index": número (1..${n}), "vibe": el vibe usado, "caption": el texto final del post }.`,
    'Cada caption debe seguir las reglas del sistema (80-150 palabras, hashtags al final, sin clichés, sin inventar precios).'
  ].filter(Boolean).join('\n')

  let input
  if (referenceImageUrl) {
    input = [{
      role: 'user',
      content: [
        { type: 'input_text', text: userText },
        { type: 'input_image', image_url: referenceImageUrl, detail: 'auto' }
      ]
    }]
  } else {
    input = userText
  }

  const body = {
    model: OPENAI_CHAT,
    instructions: CAPTION_SYSTEM,
    input,
    max_output_tokens: 600 + (n * 250),
    text: {
      format: {
        type: 'json_schema',
        name: 'campaign_captions',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['captions'],
          properties: {
            captions: {
              type: 'array',
              minItems: n,
              maxItems: n,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['index', 'vibe', 'caption'],
                properties: {
                  index: { type: 'integer' },
                  vibe: { type: 'string' },
                  caption: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }

  try {
    const { data } = await axios.post(`${OPENAI_BASE}/responses`, body, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60000
    })
    const text = (data && data.output_text) || extractTextFromOutput(data && data.output)
    if (!text) throw new Error('Respuesta vacía de OpenAI')
    let parsed
    try { parsed = JSON.parse(text) } catch (_) {
      throw new Error('OpenAI devolvió JSON inválido')
    }
    if (!parsed.captions || !Array.isArray(parsed.captions)) {
      throw new Error('Respuesta sin array "captions"')
    }
    return { captions: parsed.captions, vibes: assignedVibes }
  } catch (err) {
    const msg = (err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err.message
    throw new Error(`Batch captions falló: ${msg}`)
  }
}

// ─── Caption via Responses API (text + optional vision) ─────────────────
async function generateCaption({ inmueble, platform, vibe, referenceImageUrl, customInstructions }) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY no configurada en Vercel.')

  const userText = buildCaptionUserMessage(inmueble || {}, platform, vibe, customInstructions, !!referenceImageUrl)

  // If we have an image, send it as input_image so GPT-4o-mini can SEE the property
  // and write a caption based on what's visible. Works whether or not an inmueble
  // is also selected — combining both gives the model both data and visual context.
  let input
  if (referenceImageUrl) {
    input = [{
      role: 'user',
      content: [
        { type: 'input_text', text: userText },
        { type: 'input_image', image_url: referenceImageUrl, detail: 'auto' }
      ]
    }]
  } else {
    input = userText
  }

  const body = {
    model: OPENAI_CHAT,
    instructions: CAPTION_SYSTEM,
    input,
    max_output_tokens: 700
  }
  try {
    const { data } = await axios.post(`${OPENAI_BASE}/responses`, body, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30000
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
const VIDEO_BUCKET = 'videos-upload'

async function ensureVideoBucket(sb) {
  try {
    const { data: buckets, error } = await sb.storage.listBuckets()
    if (!error && Array.isArray(buckets) && buckets.find(b => b.name === VIDEO_BUCKET)) return
  } catch (_) { /* fall through */ }

  const { error: createErr } = await sb.storage.createBucket(VIDEO_BUCKET, {
    public: true,
    fileSizeLimit: 250 * 1024 * 1024   // 250MB — IG Reels max
  })
  if (createErr && !/already exists|duplicate/i.test(createErr.message || '')) {
    throw new Error(`No se pudo crear bucket "${VIDEO_BUCKET}": ${createErr.message}`)
  }
}

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
      const { inmueble, platform, vibe, reference_image_url, custom_instructions } = req.body || {}
      // Need at least one source of context: inmueble OR image OR custom instructions.
      if (!inmueble && !reference_image_url && !(custom_instructions && custom_instructions.trim())) {
        return res.status(400).json({ error: 'Necesitas un inmueble, una imagen, o instrucciones del cliente.' })
      }
      const result = await generateCaption({
        inmueble,
        platform,
        vibe,
        referenceImageUrl: reference_image_url,
        customInstructions: custom_instructions
      })
      return res.json(result)
    }

    if (action === 'batch-captions') {
      const { inmueble, count, vibes, platform, reference_image_url, custom_instructions } = req.body || {}
      if (!inmueble && !reference_image_url && !(custom_instructions && custom_instructions.trim())) {
        return res.status(400).json({ error: 'Necesitas un inmueble, una imagen, o instrucciones del cliente.' })
      }
      const n = parseInt(count, 10) || 0
      if (n < 1 || n > 30) {
        return res.status(400).json({ error: 'count debe estar entre 1 y 30' })
      }
      const result = await generateBatchCaptions({
        inmueble,
        count: n,
        vibes,
        platform,
        referenceImageUrl: reference_image_url,
        customInstructions: custom_instructions
      })
      return res.json(result)
    }

    if (action === 'video-upload-url') {
      // Returns a signed upload URL so the client can PUT the video directly to
      // Supabase Storage (Vercel functions cap bodies at ~4.5MB — videos blow that).
      const { filename, contentType } = req.body || {}
      if (!filename) return res.status(400).json({ error: 'filename es requerido' })

      // Explicit env-var check up front so the user sees what's wrong instead of a generic 500.
      const supabaseUrl = process.env.SUPABASE_URL
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl) return res.status(500).json({ error: 'SUPABASE_URL no está configurada en Vercel' })
      if (!supabaseKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY (o SUPABASE_SERVICE_ROLE_KEY) no está configurada en Vercel' })

      const sb = getSupabaseService()

      try {
        // ensureVideoBucket logs and returns a clear error if listBuckets fails
        // (e.g. the service key is actually an anon key and lacks permissions).
        try {
          await ensureVideoBucket(sb)
        } catch (bucketErr) {
          return res.status(500).json({
            error: 'No se pudo provisionar el bucket de videos en Supabase',
            detail: bucketErr.message,
            hint: 'Crea manualmente un bucket llamado "videos-upload" (public, fileSizeLimit 250MB) en el panel de Supabase Storage.'
          })
        }

        const safeName = String(filename).replace(/[^a-z0-9._-]/gi, '_').slice(0, 60)
        const path = `${empresaId}/${Date.now()}-${safeName}`
        const { data, error } = await sb.storage.from(VIDEO_BUCKET).createSignedUploadUrl(path)
        if (error) {
          return res.status(500).json({
            error: 'Supabase rechazó createSignedUploadUrl',
            detail: error.message,
            hint: 'Verifica que el bucket "videos-upload" exista y que la SUPABASE_SERVICE_KEY tenga permisos de Storage.'
          })
        }
        const { data: pub } = sb.storage.from(VIDEO_BUCKET).getPublicUrl(path)
        return res.json({
          uploadUrl: data.signedUrl,
          token: data.token,
          path,
          publicUrl: pub.publicUrl,
          contentType: contentType || 'video/mp4',
          bucket: VIDEO_BUCKET
        })
      } catch (err) {
        return res.status(500).json({ error: 'video-upload-url falló', detail: err.message })
      }
    }

    if (action === 'upload-ref') {
      // User uploads their own reference image (lead magnet flow).
      const { data, contentType, filename } = req.body || {}
      if (!data) return res.status(400).json({ error: 'data (base64) es requerido' })

      const sb = getSupabaseService()
      if (!sb) return res.status(500).json({ error: 'Supabase no configurado para uploads. Define SUPABASE_URL y SUPABASE_SERVICE_KEY.' })

      try {
        await ensureBucket(sb)
        const buffer = Buffer.from(data, 'base64')
        // Vercel inline body limit is ~4.5MB and base64 inflates raw bytes by 33%.
        // Cap raw at 3.3MB so we never hit a 413 before the handler runs.
        if (buffer.length > 3.3 * 1024 * 1024) {
          return res.status(413).json({ error: `Archivo muy grande (${(buffer.length/1024/1024).toFixed(1)}MB). Máximo 3.3MB inline. Para archivos más grandes usa signed URL (video-upload-url).` })
        }
        const ct = (contentType || 'image/png').split(';')[0]
        const ext = (ct.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png'
        const safeName = (filename || 'upload').replace(/[^a-z0-9._-]/gi, '_').slice(0, 60)
        const path = `${empresaId}/uploads/${Date.now()}-${safeName}`
        const { error: upErr } = await sb.storage.from(AI_BUCKET).upload(path, buffer, {
          contentType: ct,
          upsert: false
        })
        if (upErr) return res.status(500).json({ error: 'Upload a Supabase falló', detail: upErr.message })
        const { data: pub } = sb.storage.from(AI_BUCKET).getPublicUrl(path)
        return res.json({ url: pub.publicUrl, path })
      } catch (err) {
        return res.status(500).json({ error: err.message })
      }
    }

    if (action === 'image') {
      const {
        inmueble,
        prompt: userPrompt,
        custom_instructions,
        reference_image_url,
        platform,
        size
      } = req.body || {}
      const refUrl = reference_image_url || (inmueble && inmueble.image_link_1) || ''
      const finalPrompt = buildImagePrompt({
        inmueble: inmueble || {},
        customPrompt: userPrompt,
        customInstructions: custom_instructions,
        hasReference: !!refUrl,
        platform,
        size
      })

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
        reference_url: refUrl || null,
        custom_instructions_applied: !!(custom_instructions && custom_instructions.trim()),
        warning: persisted.warning
      })
    }

    return res.status(400).json({ error: `Acción no válida: '${action}'. Usa caption | image | upload-ref` })
  } catch (err) {
    console.error('[ai]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
