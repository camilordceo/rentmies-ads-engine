/**
 * RENTMIES — Ad Copy Generator (lib)
 *
 * Genera copy de ads con Gemini 2.0 Flash Lite.
 * Fallback a mocks si no hay API key.
 * Usado por api/generate.js y engine/generator.js.
 */

const https = require('https')
const { normalizeCity } = require('./normalize')

// ── Mock copies por variación × ciudad ──────────────────────────────────────
const MOCK_COPIES = {
  painPoint: {
    bogota:   { headline: '¿Cansado de buscar sin respuesta?',    description: 'Rentmies te responde en segundos por WhatsApp. Sin llamadas, sin esperas.', cta: 'Escribir ahora',   hook: '¿Llevas semanas buscando y nadie contesta?' },
    medellin: { headline: 'Buscar apto no debería ser tan difícil', description: 'En Medellín los mejores aptos duran días. Rentmies te avisa primero.',       cta: 'Ver disponibles', hook: 'El apto que querías ya lo arrendaron.' },
    cali:     { headline: 'Basta de buscar sin resultados',        description: 'Rentmies conoce cada inmueble disponible en Cali. Respuesta inmediata.',     cta: 'Consultar gratis', hook: '¿Cuántas llamadas sin respuesta llevas ya?' },
  },
  outcome: {
    bogota:   { headline: 'Tu apartamento ideal, sin drama',  description: 'Dinos qué buscas en Bogotá y Rentmies lo encuentra. Solo WhatsApp.',          cta: 'Empezar búsqueda', hook: 'Encontrá tu nuevo hogar en Bogotá, hoy.' },
    medellin: { headline: 'Arriendo en Medellín, fácil',      description: 'Especifica tu presupuesto y zona. Cero pérdida de tiempo.',                   cta: 'Ver opciones',     hook: 'El Poblado, Laureles o Envigado. Tú eliges.' },
    cali:     { headline: 'Tu próximo inmueble en Cali',      description: 'Rentmies filtra por lo que realmente importa. Resultados en minutos.',         cta: 'Buscar ahora',     hook: 'Ciudad Jardín te espera.' },
  },
  social: {
    bogota:   { headline: 'Ya cerramos +200 arriendos en Bogotá', description: 'La IA inmobiliaria que ya confían cientos de familias. Clientes reales en menos de 48h.', cta: 'Unirme',          hook: '200 familias ya encontraron hogar con Rentmies.' },
    medellin: { headline: 'La IA que ya funciona en Medellín',    description: 'Arriendos reales cerrados en El Poblado y Laureles este mes.',                             cta: 'Ver testimonios', hook: 'Medellín ya confía en Rentmies.' },
    cali:     { headline: 'Primera IA inmobiliaria en Cali',      description: 'Tecnología real, arriendos cerrados, clientes satisfechos.',                               cta: 'Conocer más',     hook: 'Cali ya tiene su propia IA inmobiliaria.' },
  },
  urgency: {
    bogota:   { headline: 'Los buenos aptos duran 48h',           description: 'En Bogotá el mercado no espera. Hay opciones disponibles ahora mismo.',             cta: 'Ver ahora →',      hook: 'Los apartamentos buenos no duran.' },
    medellin: { headline: 'El Poblado: disponibilidad limitada',   description: 'Los arriendos premium en Medellín se van rápido. Rentmies te pone primero.',        cta: 'Reservar turno',   hook: '¿Vas a perder otro?' },
    cali:     { headline: 'Ciudad Jardín: disponibilidad baja',    description: 'Cali creció y los buenos inmuebles escasean. Acceso antes que salgan al público.', cta: 'Acceso anticipado', hook: 'Los mejores inmuebles de Cali nunca llegan a portales.' },
  },
}

/**
 * Genera copy de ad con Gemini 2.0 Flash Lite.
 */
async function generateWithGemini({ geminiKey, ciudad, tipoInmueble, presupuesto, variationType, proyecto, userContext }) {
  const prompt = `Eres un experto en marketing inmobiliario colombiano. Genera copy de ad para Facebook/Instagram.

Inmueble: ${tipoInmueble} en ${ciudad}
Proyecto: ${proyecto || 'proyecto inmobiliario'}
Presupuesto: ${presupuesto}
Variación de copy: ${variationType} (${
    variationType === 'painPoint' ? 'resalta el dolor/frustración del buscador' :
    variationType === 'outcome'   ? 'resalta el resultado positivo de encontrar hogar' :
    variationType === 'social'    ? 'prueba social, testimonios, comunidad' :
    'urgencia, escasez, tiempo limitado'
  })
${userContext ? `Contexto adicional del cliente: ${userContext}` : ''}

Responde SOLO con JSON válido, sin markdown:
{
  "headline": "título del ad (máx 40 caracteres, impactante)",
  "description": "descripción del ad (máx 120 caracteres, persuasiva)",
  "hook": "primera línea del caption de Instagram (máx 80 caracteres)",
  "cta": "texto del botón (máx 15 caracteres)"
}`

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 256 },
    })

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path:     `/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (r) => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try {
          const json  = JSON.parse(data)
          if (json.error) return reject(new Error(json.error.message))
          const text  = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
          const clean = text.replace(/```json|```/g, '').trim()
          resolve(JSON.parse(clean))
        } catch(e) { reject(new Error('Gemini parse error: ' + e.message)) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/**
 * Genera imagen con Gemini 2.0 Flash Exp.
 * Retorna data URI o null si falla.
 */
async function generateImageWithGemini({ geminiKey, inmuebleDescription, headline, variationType }) {
  const prompt = `Create a professional real estate advertisement photo for a Colombian property listing.
Property: ${inmuebleDescription}
Ad headline: "${headline}"
Style: ${
    variationType === 'painPoint' ? 'warm, empathetic, cozy interior' :
    variationType === 'outcome'   ? 'bright, aspirational, modern living space' :
    variationType === 'social'    ? 'lifestyle, community, happy family' :
    'premium, exclusive, high-end real estate'
  }
Requirements: photorealistic, professional photography, 1:1 square format, no text overlays.`

  return new Promise((resolve) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    })

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path:     `/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${geminiKey}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (r) => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) return resolve(null)
          const parts   = json.candidates?.[0]?.content?.parts || []
          const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'))
          resolve(imgPart ? `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}` : null)
        } catch(e) { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.write(body)
    req.end()
  })
}

/**
 * Genera copy para una variación dada.
 * Usa Gemini si hay API key, sino mock.
 *
 * @param {object} opts
 * @returns {{ headline, description, cta, hook, source }}
 */
async function generateCopy({ geminiKey, ciudad, tipoInmueble, presupuesto, variationType, proyecto, userContext }) {
  const cityKey = normalizeCity(ciudad)

  if (geminiKey) {
    try {
      const copy = await generateWithGemini({ geminiKey, ciudad, tipoInmueble, presupuesto, variationType, proyecto, userContext })
      return { ...copy, source: 'gemini' }
    } catch(e) {
      console.warn('[generator] Gemini fallback:', e.message)
    }
  }

  const copy = MOCK_COPIES[variationType]?.[cityKey] || MOCK_COPIES[variationType]?.bogota || {}
  return { ...copy, source: 'mock' }
}

module.exports = { generateCopy, generateWithGemini, generateImageWithGemini, MOCK_COPIES }
