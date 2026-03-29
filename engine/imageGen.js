/**
 * RENTMIES ADS ENGINE — IMAGE GENERATOR
 * Genera imágenes con Imagen 3 (Google) y agrega overlay con Jimp.
 */

require('dotenv').config()
const path = require('path')
const fs = require('fs')
const { PROMPTS } = require('../config/prompts')

const OUTPUT_DIR = path.join(__dirname, '../output/images')

const LOG = {
  info:    (msg) => console.log(`\x1b[36m🎨 ${msg}\x1b[0m`),
  success: (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`),
  warn:    (msg) => console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`),
  error:   (msg) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`),
}

// ── Imágenes placeholder (SVG) para mock sin API key ──
function generateMockSVG(headline, ciudad, tipoInmueble, format) {
  const isStory = format === 'story'
  const width = isStory ? 1080 : 1080
  const height = isStory ? 1920 : 1080

  // Colores Rentmies
  const green = '#1D9E75'
  const darkGray = '#1A1A2E'
  const lightGray = '#E8F5F0'

  // Gradientes de fondo por ciudad
  const cityColors = {
    bogota:   ['#1A1A2E', '#16213E'],
    medellin: ['#0F3460', '#533483'],
    cali:     ['#1B4332', '#2D6A4F']
  }
  const cityKey = ciudad.toLowerCase().replace(/[áéíóú]/g, c => ({ á:'a',é:'e',í:'i',ó:'o',ú:'u' }[c]))
  const [c1, c2] = cityColors[cityKey] || cityColors.bogota

  const escapedHeadline = headline
    ? headline.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : 'Rentmies'

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${c2};stop-opacity:1"/>
    </linearGradient>
    <linearGradient id="overlay" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${green};stop-opacity:0"/>
      <stop offset="100%" style="stop-color:${green};stop-opacity:0.9"/>
    </linearGradient>
  </defs>

  <!-- Fondo -->
  <rect width="${width}" height="${height}" fill="url(#bg)"/>

  <!-- Elementos decorativos que simulan un inmueble -->
  <rect x="120" y="${height * 0.15}" width="${width - 240}" height="${height * 0.55}" rx="12"
        fill="${lightGray}" opacity="0.08"/>
  <rect x="160" y="${height * 0.2}" width="${width - 320}" height="${height * 0.45}" rx="8"
        fill="white" opacity="0.05"/>

  <!-- Ventanas simuladas -->
  ${[0,1,2].map(col => [0,1].map(row => `
  <rect x="${200 + col * 240}" y="${height * 0.25 + row * 140}" width="160" height="100" rx="4"
        fill="${green}" opacity="${0.15 + Math.random() * 0.1}"/>`).join('')).join('')}

  <!-- Overlay inferior -->
  <rect x="0" y="${height * 0.72}" width="${width}" height="${height * 0.28}" fill="url(#overlay)"/>
  <rect x="0" y="${height * 0.82}" width="${width}" height="${height * 0.18}"
        fill="${green}" opacity="0.9"/>

  <!-- Logo Rentmies -->
  <text x="60" y="${height * 0.87}" font-family="Arial, sans-serif" font-size="28"
        font-weight="bold" fill="white" opacity="0.9">RENTMIES</text>
  <circle cx="48" cy="${height * 0.866}" r="14" fill="white" opacity="0.95"/>
  <text x="42" y="${height * 0.872}" font-family="Arial" font-size="14"
        font-weight="bold" fill="${green}">R</text>

  <!-- Headline -->
  <text x="${width / 2}" y="${height * 0.76}" font-family="Arial, sans-serif" font-size="${isStory ? 52 : 48}"
        font-weight="bold" fill="white" text-anchor="middle"
        style="text-shadow: 2px 2px 8px rgba(0,0,0,0.5)">${escapedHeadline}</text>

  <!-- Ciudad / Tipo -->
  <text x="${width / 2}" y="${height * 0.82}" font-family="Arial, sans-serif" font-size="28"
        fill="white" text-anchor="middle" opacity="0.85">${ciudad} · ${tipoInmueble}</text>

  <!-- CTA -->
  <rect x="${width - 280}" y="${height * 0.84}" width="220" height="50" rx="25"
        fill="white" opacity="0.95"/>
  <text x="${width - 170}" y="${height * 0.872}" font-family="Arial, sans-serif" font-size="22"
        font-weight="bold" fill="${green}" text-anchor="middle">WhatsApp →</text>

  <!-- Watermark mock -->
  <text x="${width - 20}" y="${height - 20}" font-family="Arial" font-size="18"
        fill="white" text-anchor="end" opacity="0.4">MOCK · Imagen 3 pendiente</text>
</svg>`

  return svgContent
}

/**
 * Genera imagen para un ad.
 * Usa Imagen 3 si hay API key, sino genera SVG mock.
 * @param {Object} ad - El ad con headline, ciudad, tipoInmueble
 * @param {string} format - 'feed' (1:1) | 'story' (9:16)
 * @param {Function} wsEmit
 * @returns {string} path relativo de la imagen
 */
async function generateImage(ad, format = 'feed', wsEmit) {
  const { id, headline, ciudad, tipoInmueble, variationType } = ad

  LOG.info(`Generando imagen — ${id} | formato: ${format} | variación: ${variationType}`)
  if (wsEmit) wsEmit('progress', {
    step: 'image',
    status: 'generating',
    message: `Generando imagen ${tipoInmueble} ${ciudad} (${format})...`
  })

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const filename = `${id}_${format}.svg`
  const filepath = path.join(OUTPUT_DIR, filename)
  const relativePath = `/output/images/${filename}`

  if (!process.env.GEMINI_API_KEY) {
    LOG.warn('GEMINI_API_KEY no configurada. Generando imagen mock SVG.')
    await _simulateDelay(600)

    const svg = generateMockSVG(headline, ciudad, tipoInmueble, format)
    fs.writeFileSync(filepath, svg)

    LOG.success(`Imagen mock generada: ${filename}`)
    if (wsEmit) wsEmit('progress', {
      step: 'image', status: 'done',
      message: `Imagen generada: ${filename}`,
      imagePath: relativePath
    })
    return relativePath
  }

  try {
    // ── Imagen 3 via Google GenAI ──
    const { GoogleGenerativeAI } = require('@google/genai')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

    const sceneKey = tipoInmueble === 'casa' ? 'house'
                   : tipoInmueble === 'oficina' ? 'office'
                   : tipoInmueble === 'exterior' ? 'exterior' : 'apartment'

    const scenePrompt = PROMPTS.imagePrompts.scenes[sceneKey] || PROMPTS.imagePrompts.scenes.apartment
    const fullPrompt = `${PROMPTS.imagePrompts.style}\n\nESCENA ESPECÍFICA:\n${scenePrompt}\n\nCIUDAD: ${ciudad}`

    const imageModel = genAI.getGenerativeModel({ model: 'imagen-3.0-generate-002' })
    const imageSize = format === 'story' ? '1080x1920' : '1080x1080'

    LOG.info(`Llamando Imagen 3 (${imageSize})...`)

    const result = await imageModel.generateImages({
      prompt: fullPrompt,
      numberOfImages: 1,
      aspectRatio: format === 'story' ? '9:16' : '1:1'
    })

    if (result.images && result.images[0]) {
      const imageData = result.images[0].imageBytes
      const pngPath = filepath.replace('.svg', '.png')
      fs.writeFileSync(pngPath, Buffer.from(imageData, 'base64'))

      // Agregar overlay con Jimp si está disponible
      try {
        await addOverlay(pngPath, headline, ad.cta)
      } catch (overlayErr) {
        LOG.warn(`Overlay falló: ${overlayErr.message}. Imagen sin overlay.`)
      }

      LOG.success(`Imagen Imagen3 generada: ${path.basename(pngPath)}`)
      if (wsEmit) wsEmit('progress', { step: 'image', status: 'done', imagePath: `/output/images/${path.basename(pngPath)}` })
      return `/output/images/${path.basename(pngPath)}`
    }

    throw new Error('Imagen 3 no retornó datos de imagen')

  } catch (err) {
    LOG.error(`Error en Imagen 3: ${err.message}. Fallback a mock SVG.`)
    const svg = generateMockSVG(headline, ciudad, tipoInmueble, format)
    fs.writeFileSync(filepath, svg)
    return relativePath
  }
}

/**
 * Agrega overlay (headline + CTA) sobre imagen PNG con Jimp.
 */
async function addOverlay(imagePath, headline, cta) {
  try {
    const Jimp = require('jimp')
    const image = await Jimp.read(imagePath)
    const { width, height } = image.bitmap

    // Franja inferior semitransparente verde
    const overlayHeight = Math.floor(height * 0.2)
    const overlayY = height - overlayHeight

    // Color verde Rentmies con 80% opacidad
    for (let y = overlayY; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const currentColor = Jimp.intToRGBA(image.getPixelColor(x, y))
        const blendedR = Math.floor(currentColor.r * 0.2 + 0x1D * 0.8)
        const blendedG = Math.floor(currentColor.g * 0.2 + 0x9E * 0.8)
        const blendedB = Math.floor(currentColor.b * 0.2 + 0x75 * 0.8)
        image.setPixelColor(Jimp.rgbaToInt(blendedR, blendedG, blendedB, 255), x, y)
      }
    }

    await image.writeAsync(imagePath)
    LOG.success('Overlay aplicado correctamente')
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      LOG.warn('Jimp no instalado. Imagen sin overlay.')
    } else {
      throw err
    }
  }
}

/**
 * Genera imágenes para todos los ads de una campaña.
 */
async function generateCampaignImages(ads, wsEmit) {
  LOG.info(`Generando imágenes para ${ads.length} ads...`)
  const results = []

  for (const ad of ads) {
    // Feed 1:1
    const feedPath = await generateImage(ad, 'feed', wsEmit)
    // Story 9:16 solo para plataformas que lo soportan
    const needsStory = ['meta_stories', 'tiktok'].includes(ad.platform)
    const storyPath = needsStory ? await generateImage(ad, 'story', wsEmit) : null

    results.push({
      adId: ad.id,
      feedImage: feedPath,
      storyImage: storyPath
    })
  }

  LOG.success(`${results.length} sets de imágenes generados`)
  return results
}

function _simulateDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Ejecución directa ──
if (require.main === module) {
  const testAd = {
    id: 'test_001',
    headline: '¿Cansado de buscar sin respuesta?',
    ciudad: 'Bogotá',
    tipoInmueble: 'apartamento',
    variationType: 'painPoint',
    cta: 'Escribir ahora'
  }
  generateImage(testAd, 'feed').then(p => console.log('Imagen generada:', p)).catch(console.error)
}

module.exports = { generateImage, generateCampaignImages }
