/**
 * RENTMIES — AI assist (Azure OpenAI)
 *
 *   POST /api/ai?action=caption
 *     Body: { inmueble, platform?, vibe? }
 *     Returns: { caption: string }
 *
 *   POST /api/ai?action=image
 *     Body: { inmueble?, prompt?, size? }    size = '1024x1024' | '1024x1536' | '1536x1024'
 *     Returns: { url, persisted, prompt, warning? }
 *
 * Env vars:
 *   AZURE_OPENAI_ENDPOINT          (e.g. https://azureai-instance1.openai.azure.com/)
 *   AZURE_OPENAI_API_KEY
 *   AZURE_OPENAI_API_VERSION       (default: 2025-04-01-preview)
 *   AZURE_OPENAI_IMAGE_DEPLOYMENT  (default: gpt-image-2)
 *   AZURE_OPENAI_CHAT_DEPLOYMENT   (default: gpt-4o-mini)
 *
 * Optional Supabase Storage upload:
 *   SUPABASE_URL + SUPABASE_SERVICE_KEY → bucket 'ai-images' (public read)
 *   Without them, we return Azure's temp URL (TTL ~1h, suficiente para que IG la baje al publicar).
 */

const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')

const AZ_ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/$/, '')
const AZ_KEY = process.env.AZURE_OPENAI_API_KEY || ''
const AZ_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview'
const AZ_IMG_DEPLOY = process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || 'gpt-image-2'
const AZ_CHAT_DEPLOY = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o-mini'

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

function buildImagePrompt(inmueble, custom) {
  if (custom && custom.trim()) return custom.trim()
  const tipo = (inmueble.tipo || inmueble.tipo_inmueble_propiedad || 'apartamento').toLowerCase()
  const ciudad = inmueble.ciudad || inmueble.nombre_ciudad || 'Colombia'
  const proyecto = inmueble.proyecto ? ` (proyecto ${inmueble.proyecto})` : ''
  const desc = inmueble.descripcion ? ` Estilo arquitectónico: ${inmueble.descripcion}.` : ''
  return (
    `Editorial real estate photograph of a modern ${tipo} in ${ciudad}, Colombia${proyecto}.` +
    `${desc} Premium magazine quality, golden hour natural lighting, clean architectural composition, ` +
    `no people visible, aspirational minimalist mood. Square 1:1 aspect ratio, high resolution. ` +
    `Strictly: no text, no logos, no watermarks, no signage, no UI overlays.`
  )
}

async function generateCaption(inmueble, platform, vibe) {
  if (!AZ_ENDPOINT || !AZ_KEY) {
    throw new Error('Azure OpenAI no configurado. Define AZURE_OPENAI_ENDPOINT y AZURE_OPENAI_API_KEY en Vercel.')
  }
  // Deployment-based path: more permissive with dated api-versions than the /openai/v1/* surface.
  const url = `${AZ_ENDPOINT}/openai/deployments/${AZ_CHAT_DEPLOY}/chat/completions?api-version=${AZ_VERSION}`
  const body = {
    messages: [
      { role: 'system', content: CAPTION_SYSTEM },
      { role: 'user', content: buildCaptionUserMessage(inmueble, platform, vibe) }
    ],
    temperature: 0.75,
    max_tokens: 600
  }
  try {
    const { data } = await axios.post(url, body, {
      headers: { 'api-key': AZ_KEY, 'Content-Type': 'application/json' },
      timeout: 25000
    })
    const caption = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
    if (!caption || !caption.trim()) throw new Error('Azure devolvió respuesta vacía')
    return { caption: caption.trim() }
  } catch (err) {
    const msg = (err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err.message
    throw new Error(`Caption falló: ${msg}`)
  }
}

async function generateImage(prompt, size) {
  if (!AZ_ENDPOINT || !AZ_KEY) {
    throw new Error('Azure OpenAI no configurado.')
  }
  const url = `${AZ_ENDPOINT}/openai/deployments/${AZ_IMG_DEPLOY}/images/generations?api-version=${AZ_VERSION}`
  // gpt-image-2 quality values are: low | medium | high | auto (NOT 'standard' — that's DALL-E 3).
  const body = {
    prompt,
    n: 1,
    size: size || '1024x1024',
    quality: 'medium'
  }
  try {
    const { data } = await axios.post(url, body, {
      headers: { 'api-key': AZ_KEY, 'Content-Type': 'application/json' },
      timeout: 55000
    })
    const item = data && data.data && data.data[0]
    if (!item) throw new Error('Azure no devolvió data')
    if (item.url) return { kind: 'url', value: item.url }
    if (item.b64_json) return { kind: 'b64', value: item.b64_json }
    throw new Error('Azure devolvió un formato no reconocido')
  } catch (err) {
    const msg = (err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err.message
    throw new Error(`Imagen falló: ${msg}`)
  }
}

async function persistImageToSupabase(image, empresaId, inmuebleId) {
  const sb = getSupabaseService()
  if (!sb) {
    if (image.kind === 'b64') {
      // Sin Supabase no podemos servir el b64 a Meta directamente — devolver data URL no funciona para IG.
      return { url: null, persisted: false, warning: 'La imagen vino como base64 y no hay Supabase configurado para alojarla públicamente.' }
    }
    return { url: image.value, persisted: false }
  }

  try {
    let buffer, contentType
    if (image.kind === 'url') {
      const res = await axios.get(image.value, { responseType: 'arraybuffer', timeout: 30000 })
      buffer = Buffer.from(res.data)
      contentType = res.headers['content-type'] || 'image/png'
    } else {
      buffer = Buffer.from(image.value, 'base64')
      contentType = 'image/png'
    }

    const ext = (contentType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png'
    const safeId = (inmuebleId || 'ai').replace(/[^a-z0-9]/gi, '_').slice(0, 40)
    const path = `${empresaId || 'demo'}/${Date.now()}-${safeId}.${ext}`

    const { error: upErr } = await sb.storage.from('ai-images').upload(path, buffer, {
      contentType,
      upsert: false
    })
    if (upErr) throw new Error(upErr.message)

    const { data: pub } = sb.storage.from('ai-images').getPublicUrl(path)
    return { url: pub.publicUrl, persisted: true, path }
  } catch (err) {
    console.warn('[ai] Supabase persist falló:', err.message)
    if (image.kind === 'url') return { url: image.value, persisted: false, warning: `Supabase: ${err.message}. Usando URL temporal de Azure.` }
    return { url: null, persisted: false, warning: `Supabase: ${err.message}` }
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
      const { inmueble, prompt: userPrompt, size } = req.body || {}
      const finalPrompt = buildImagePrompt(inmueble || {}, userPrompt)
      const image = await generateImage(finalPrompt, size)
      const persisted = await persistImageToSupabase(image, empresaId, inmueble && inmueble.id)
      if (!persisted.url) {
        return res.status(500).json({ error: 'No hay URL pública', detail: persisted.warning })
      }
      return res.json({
        url: persisted.url,
        persisted: persisted.persisted,
        prompt: finalPrompt,
        warning: persisted.warning
      })
    }

    return res.status(400).json({ error: `Acción no válida: '${action}'. Usa caption | image` })
  } catch (err) {
    console.error('[ai]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
