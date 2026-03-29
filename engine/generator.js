/**
 * RENTMIES ADS ENGINE — GENERATOR
 * Genera copy de ads usando Gemini 1.5 Flash.
 * Lee prompts desde config/prompts.js para fácil edición.
 */

require('dotenv').config()
const { GoogleGenerativeAI } = require('@google/genai')
const { PROMPTS } = require('../config/prompts')
const { PLATFORMS } = require('../config/platforms')

// ── Colores para logs en consola ──
const LOG = {
  info:    (msg) => console.log(`\x1b[36m🔄 ${msg}\x1b[0m`),
  success: (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`),
  warn:    (msg) => console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`),
  error:   (msg) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`),
  ai:      (msg) => console.log(`\x1b[35m🤖 ${msg}\x1b[0m`),
}

// ── Mock data realista para desarrollo sin API key ──
const MOCK_COPIES = {
  painPoint: {
    bogota: {
      headline: '¿Cansado de buscar sin respuesta?',
      description: 'Rentmies te responde en segundos por WhatsApp. Sin llamadas, sin esperas. Tu próximo apto en Bogotá está a un mensaje.',
      cta: 'Escribir ahora',
      hook: '¿Llevas semanas buscando y nadie contesta?'
    },
    medellin: {
      headline: 'Buscar apto no debería ser así',
      description: 'En Medellín los mejores aptos duran días. Rentmies te avisa primero. IA disponible 24/7 por WhatsApp.',
      cta: 'Ver disponibles',
      hook: 'El apto que querías ya lo arrendaron.'
    },
    cali: {
      headline: 'Basta de buscar sin resultados',
      description: 'Rentmies conoce cada inmueble disponible en Cali. Pregunta ahora por WhatsApp, respuesta inmediata garantizada.',
      cta: 'Consultar gratis',
      hook: '¿Cuántas llamadas sin respuesta llevas ya?'
    }
  },
  outcome: {
    bogota: {
      headline: 'Tu aparto ideal, sin drama',
      description: 'Dinos qué buscas en Bogotá y Rentmies lo encuentra. Sin reuniones, sin papeleo inicial. Solo WhatsApp.',
      cta: 'Empezar búsqueda',
      hook: 'Encontrá tu nuevo hogar en Bogotá, hoy.'
    },
    medellin: {
      headline: 'Arriendo en Medellín, fácil',
      description: 'Especifica tu presupuesto y zona. Nuestra IA te muestra solo lo que realmente aplica. Cero pérdida de tiempo.',
      cta: 'Ver opciones',
      hook: 'El Poblado, Laureles o Envigado. Tú eliges, nosotros buscamos.'
    },
    cali: {
      headline: 'Tu próximo inmueble en Cali',
      description: 'Rentmies filtra por lo que realmente importa. Zona, precio, condiciones. Resultados reales en minutos.',
      cta: 'Buscar ahora',
      hook: 'Ciudad Jardín te espera. Y Rentmies ya tiene las opciones.'
    }
  },
  social: {
    bogota: {
      headline: 'Ya cerramos +200 arriendos en Bogotá',
      description: 'Rentmies es la primera IA inmobiliaria en Colombia. Clientes reales encontraron apartamento en menos de 48h.',
      cta: 'Unirme ahora',
      hook: '200 familias ya encontraron hogar con Rentmies.'
    },
    medellin: {
      headline: 'La IA que ya funciona en Medellín',
      description: 'No es el futuro, es ahora. Rentmies ya cerró arriendos reales en El Poblado y Laureles este mes.',
      cta: 'Ver testimonios',
      hook: 'En Medellín ya confían en Rentmies. ¿Y vos?'
    },
    cali: {
      headline: 'Primera IA inmobiliaria en Cali',
      description: 'Rentmies llegó a Cali con tecnología real. Arriendos cerrados, clientes satisfechos. Únete.',
      cta: 'Conocer más',
      hook: 'Cali ya tiene su propia IA inmobiliaria.'
    }
  },
  urgency: {
    bogota: {
      headline: 'Los buenos aptos duran 48h',
      description: 'En Bogotá el mercado no espera. Quien busca primero con Rentmies, arrenda primero. Hay 12 aptos disponibles ahora.',
      cta: 'Ver ahora →',
      hook: '12 apartamentos disponibles. Por cuánto tiempo, nadie sabe.'
    },
    medellin: {
      headline: 'El Poblado: quedan 8 aptos',
      description: 'Los arriendos premium en Medellín vuelan. Rentmies te pone en línea antes que el resto. No esperes más.',
      cta: 'Reservar turno',
      hook: '8 apartamentos en El Poblado. ¿Vas a perder otro?'
    },
    cali: {
      headline: 'Ciudad Jardín: disponibilidad baja',
      description: 'Cali creció y los buenos inmuebles escasean. Rentmies tiene acceso a listados antes de que salgan al público.',
      cta: 'Acceso anticipado',
      hook: 'Los mejores inmuebles de Cali nunca llegan a portales.'
    }
  }
}

/**
 * Genera copy para un ad usando Gemini (o mock data).
 * @param {string} variationType - painPoint | outcome | social | urgency
 * @param {string} ciudad - bogota | medellin | cali
 * @param {string} tipoInmueble - apartamento | casa | etc
 * @param {string} presupuesto - rango en COP
 * @param {string} platform - facebook | instagram | tiktok
 * @param {Function} wsEmit - función para emitir eventos al dashboard
 */
async function generateAdCopy(variationType, ciudad, tipoInmueble, presupuesto, platform, wsEmit) {
  LOG.info(`Generando copy — variación: ${variationType} | ciudad: ${ciudad} | plataforma: ${platform}`)
  if (wsEmit) wsEmit('progress', { step: 'copy', status: 'generating', variationType, platform })

  // Si no hay API key, usar mock data
  if (!process.env.GEMINI_API_KEY) {
    LOG.warn('GEMINI_API_KEY no configurada. Usando mock data.')
    await _simulateDelay(800)

    const ciudadKey = ciudad.toLowerCase().replace('é', 'e').replace('ó', 'o')
    const mockCity = MOCK_COPIES[variationType]?.[ciudadKey] || MOCK_COPIES[variationType]?.bogota
    const copy = { ...mockCity, source: 'mock' }

    LOG.success(`Copy generado (mock) — "${copy.headline}"`)
    if (wsEmit) wsEmit('progress', { step: 'copy', status: 'done', headline: copy.headline })
    return copy
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const promptTemplate = PROMPTS.adCopy.variations[variationType]
    const prompt = promptTemplate
      .replace(/\{\{ciudad\}\}/g, ciudad)
      .replace(/\{\{tipoInmueble\}\}/g, tipoInmueble)
      .replace(/\{\{presupuesto\}\}/g, presupuesto)

    LOG.ai(`Enviando prompt a Gemini (${prompt.length} chars)...`)

    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: PROMPTS.adCopy.system }] },
        { role: 'model', parts: [{ text: 'Entendido. Soy tu copywriter inmobiliario colombiano.' }] },
        { role: 'user', parts: [{ text: prompt }] }
      ]
    })

    const text = result.response.text()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Gemini no retornó JSON válido')

    const copy = JSON.parse(jsonMatch[0])
    copy.source = 'gemini'

    LOG.success(`Copy generado — "${copy.headline}"`)
    if (wsEmit) wsEmit('progress', { step: 'copy', status: 'done', headline: copy.headline })
    return copy

  } catch (err) {
    LOG.error(`Error en Gemini: ${err.message}. Fallback a mock.`)
    const ciudadKey = ciudad.toLowerCase().replace(/[áéíóú]/g, c => ({ á:'a',é:'e',í:'i',ó:'o',ú:'u' }[c]))
    return { ...MOCK_COPIES[variationType]?.[ciudadKey] || MOCK_COPIES[variationType]?.bogota, source: 'mock_fallback' }
  }
}

/**
 * Genera todas las variaciones de una campaña completa.
 * @param {Object} params - { ciudad, tipoInmueble, presupuesto, plataformas, variaciones }
 * @param {Function} wsEmit - WebSocket emit function
 * @returns {Array} Array de ads completos
 */
async function generateCampaign(params, wsEmit) {
  const {
    ciudad = 'Bogotá',
    tipoInmueble = 'apartamento',
    presupuesto = '1.500.000 - 2.500.000',
    plataformas = ['meta_feed', 'instagram_feed'],
    variaciones = ['painPoint', 'outcome', 'social', 'urgency']
  } = params

  LOG.info(`━━━ GENERANDO CAMPAÑA ━━━`)
  LOG.info(`Ciudad: ${ciudad} | Tipo: ${tipoInmueble} | Presupuesto: ${presupuesto} COP`)
  if (wsEmit) wsEmit('campaign_start', { ciudad, tipoInmueble, presupuesto, plataformas, variaciones })

  const ads = []
  let adCounter = 1

  for (const variationType of variaciones) {
    for (const platformId of plataformas) {
      const platform = PLATFORMS[platformId]
      if (!platform) continue

      LOG.info(`Generando variación "${variationType}" para ${platform.name}...`)
      if (wsEmit) wsEmit('progress', {
        step: 'copy',
        status: 'generating',
        message: `Generando copy variación ${variationType} para ${platform.name}...`
      })

      const copy = await generateAdCopy(
        variationType,
        ciudad.toLowerCase().replace('á', 'a').replace('é', 'e').replace('ó', 'o'),
        tipoInmueble,
        presupuesto,
        platformId,
        wsEmit
      )

      const ad = {
        id: `ad_${Date.now()}_${adCounter++}`,
        campaignId: `camp_${Date.now()}`,
        variationType,
        platform: platformId,
        platformName: platform.name,
        ciudad,
        tipoInmueble,
        presupuesto,
        headline: copy.headline,
        description: copy.description || copy.caption,
        cta: copy.cta,
        hook: copy.hook,
        hashtags: copy.hashtags || generateHashtags(ciudad, tipoInmueble),
        status: 'generated',
        createdAt: new Date().toISOString(),
        source: copy.source
      }

      ads.push(ad)
      LOG.success(`Ad generado: ${ad.id} — "${ad.headline}"`)
    }
  }

  LOG.success(`━━━ ${ads.length} ADS GENERADOS ━━━`)
  if (wsEmit) wsEmit('campaign_complete', { totalAds: ads.length, ads })

  return ads
}

/** Genera hashtags relevantes para inmobiliaria colombiana */
function generateHashtags(ciudad, tipoInmueble) {
  const base = ['#Rentmies', '#InmobiliariaIA', '#ArriendoColombia']
  const cityTags = {
    bogotá: ['#ApartamentosBogota', '#ArriendoBogota', '#ViveBogota'],
    medellín: ['#ApartamentosMedellin', '#ArriendoMedellin', '#ViveMedellin'],
    cali: ['#ApartamentosCali', '#ArriendoCali', '#ViveCali']
  }
  const typeTags = {
    apartamento: ['#Apartamento', '#ApartamentoModerno', '#AptoBonito'],
    casa: ['#Casa', '#CasaModerna', '#CasaFamiliar'],
    oficina: ['#Oficina', '#EspacioComercial', '#LocalComercial']
  }
  const cidadKey = ciudad.toLowerCase().replace('á', 'a').replace('é', 'e').replace('ó', 'o')
  return [
    ...base,
    ...(cityTags[cidadKey] || []),
    ...(typeTags[tipoInmueble] || [])
  ].slice(0, 10)
}

function _simulateDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Ejecución directa: node engine/generator.js ──
if (require.main === module) {
  generateCampaign({
    ciudad: 'Bogotá',
    tipoInmueble: 'apartamento',
    presupuesto: '1.500.000 - 2.500.000',
    plataformas: ['meta_feed', 'instagram_feed'],
    variaciones: ['painPoint', 'outcome']
  }).then(ads => {
    console.log('\n📋 ADS GENERADOS:')
    ads.forEach(ad => {
      console.log(`\n─── ${ad.id} ───`)
      console.log(`Variación: ${ad.variationType} | Plataforma: ${ad.platformName}`)
      console.log(`Headline: ${ad.headline}`)
      console.log(`CTA: ${ad.cta}`)
    })
  }).catch(console.error)
}

module.exports = { generateCampaign, generateAdCopy }
