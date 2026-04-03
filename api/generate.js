/**
 * RENTMIES — AD COPY GENERATOR
 * Uses Gemini 2.0 Flash Lite for copy generation (falls back to mock)
 */

const https = require('https')

const MOCK_COPIES = {
  painPoint: {
    bogotá:   { headline: '¿Cansado de buscar sin respuesta?', description: 'Rentmies te responde en segundos por WhatsApp. Sin llamadas, sin esperas.', cta: 'Escribir ahora', hook: '¿Llevas semanas buscando y nadie contesta?' },
    medellín: { headline: 'Buscar apto no debería ser tan difícil', description: 'En Medellín los mejores aptos duran días. Rentmies te avisa primero.', cta: 'Ver disponibles', hook: 'El apto que querías ya lo arrendaron.' },
    cali:     { headline: 'Basta de buscar sin resultados', description: 'Rentmies conoce cada inmueble disponible en Cali. Respuesta inmediata.', cta: 'Consultar gratis', hook: '¿Cuántas llamadas sin respuesta llevas ya?' },
  },
  outcome: {
    bogotá:   { headline: 'Tu apartamento ideal, sin drama', description: 'Dinos qué buscas en Bogotá y Rentmies lo encuentra. Solo WhatsApp.', cta: 'Empezar búsqueda', hook: 'Encontrá tu nuevo hogar en Bogotá, hoy.' },
    medellín: { headline: 'Arriendo en Medellín, fácil', description: 'Especifica tu presupuesto y zona. Cero pérdida de tiempo.', cta: 'Ver opciones', hook: 'El Poblado, Laureles o Envigado. Tú eliges.' },
    cali:     { headline: 'Tu próximo inmueble en Cali', description: 'Rentmies filtra por lo que realmente importa. Resultados en minutos.', cta: 'Buscar ahora', hook: 'Ciudad Jardín te espera.' },
  },
  social: {
    bogotá:   { headline: 'Ya cerramos +200 arriendos en Bogotá', description: 'La IA inmobiliaria que ya confían cientos de familias. Clientes reales en menos de 48h.', cta: 'Unirme', hook: '200 familias ya encontraron hogar con Rentmies.' },
    medellín: { headline: 'La IA que ya funciona en Medellín', description: 'Arriendos reales cerrados en El Poblado y Laureles este mes.', cta: 'Ver testimonios', hook: 'Medellín ya confía en Rentmies.' },
    cali:     { headline: 'Primera IA inmobiliaria en Cali', description: 'Tecnología real, arriendos cerrados, clientes satisfechos.', cta: 'Conocer más', hook: 'Cali ya tiene su propia IA inmobiliaria.' },
  },
  urgency: {
    bogotá:   { headline: 'Los buenos aptos duran 48h', description: 'En Bogotá el mercado no espera. Hay opciones disponibles ahora mismo.', cta: 'Ver ahora →', hook: 'Los apartamentos buenos no duran.' },
    medellín: { headline: 'El Poblado: disponibilidad limitada', description: 'Los arriendos premium en Medellín se van rápido. Rentmies te pone primero.', cta: 'Reservar turno', hook: '¿Vas a perder otro?' },
    cali:     { headline: 'Ciudad Jardín: disponibilidad baja', description: 'Cali creció y los buenos inmuebles escasean. Acceso antes que salgan al público.', cta: 'Acceso anticipado', hook: 'Los mejores inmuebles de Cali nunca llegan a portales.' },
  }
}

const PLATFORM_NAMES = {
  meta_feed:      'Meta Feed',
  instagram_feed: 'Instagram Feed',
  meta_stories:   'Meta Stories',
  tiktok:         'TikTok',
}

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
      generationConfig: { temperature: 0.8, maxOutputTokens: 256 }
    })

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path:     `/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }

    const req = https.request(options, (r) => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try {
          const json   = JSON.parse(data)
          if (json.error) return reject(new Error(json.error.message))
          const text   = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
          const clean  = text.replace(/```json|```/g, '').trim()
          const parsed = JSON.parse(clean)
          resolve(parsed)
        } catch(e) { reject(new Error('Gemini parse error: ' + e.message)) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

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

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
    })

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path:     `/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${geminiKey}`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }

    const req = https.request(options, (r) => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try {
          const json  = JSON.parse(data)
          if (json.error) return resolve(null) // graceful fallback
          const parts = json.candidates?.[0]?.content?.parts || []
          const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'))
          if (imgPart) {
            resolve(`data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`)
          } else {
            resolve(null)
          }
        } catch(e) { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.write(body)
    req.end()
  })
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    ciudad        = 'Bogotá',
    tipoInmueble  = 'apartamento',
    presupuesto   = '$50.000 COP/día',
    plataformas   = ['meta_feed', 'instagram_feed'],
    variaciones   = ['painPoint', 'outcome', 'social', 'urgency'],
    proyecto      = '',
    userContext   = '',
    inmuebleId    = '',
    geminiKey     = process.env.GEMINI_API_KEY,
  } = req.body || {}

  const cityKey  = ciudad.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const ads      = []
  const useGemini = !!geminiKey
  let counter    = 1

  // Generate ONE ad per variation (not per variation×platform)
  // Then clone across platforms
  for (const variationType of variaciones.slice(0, 4)) {
    let copy
    let generatedImage = null

    if (useGemini) {
      try {
        copy = await generateWithGemini({ geminiKey, ciudad, tipoInmueble, presupuesto, variationType, proyecto, userContext })
      } catch(e) {
        console.warn('Gemini copy fallback:', e.message)
        copy = MOCK_COPIES[variationType]?.[cityKey] || MOCK_COPIES[variationType]?.bogotá || {}
      }

      // Generate image variation with Gemini
      try {
        generatedImage = await generateImageWithGemini({
          geminiKey,
          inmuebleDescription: `${tipoInmueble} en ${ciudad}, proyecto ${proyecto}`,
          headline: copy.headline,
          variationType,
        })
      } catch(e) {
        // graceful fallback — will use property image
      }
    } else {
      copy = MOCK_COPIES[variationType]?.[cityKey] || MOCK_COPIES[variationType]?.bogotá || {}
    }

    // One ad entry per variation (shared across platforms)
    ads.push({
      id:            `ad_${Date.now()}_${counter++}`,
      campaignId:    `camp_${Date.now()}`,
      variationType,
      platform:      plataformas[0] || 'meta_feed',
      platforms:     plataformas,
      platformName:  PLATFORM_NAMES[plataformas[0]] || plataformas[0],
      ciudad,
      tipoInmueble,
      presupuesto,
      proyecto,
      headline:      copy.headline    || 'Rentmies — Tu inmueble ideal',
      description:   copy.description || 'Encuentra tu próximo inmueble por WhatsApp.',
      cta:           copy.cta         || 'Escribir ahora',
      hook:          copy.hook        || '',
      generatedImage,
      status:        'generated',
      source:        useGemini ? 'gemini' : 'mock',
      createdAt:     new Date().toISOString()
    })
  }

  res.status(200).json({
    success:        true,
    ads,
    totalGenerated: ads.length,
    source:         useGemini ? 'gemini-2.0-flash-lite' : 'mock'
  })
}
