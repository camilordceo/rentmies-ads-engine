/**
 * RENTMIES — MARKETER REAL: CREATE SCHEDULE PLAN
 * POST /api/schedule-plan
 *
 * Crea un plan de publicación de Instagram:
 *   - plan: '10posts' ($20) o '20posts' ($30)
 *   - propertyIds: IDs de inmuebles seleccionados
 *   - brandTopics: temas de marca seleccionados
 *   - startDate: fecha de inicio (ISO)
 *   - igAccountId, accessToken: credenciales de Instagram
 *
 * Devuelve el calendario completo de posts con fechas programadas.
 * Guarda en Supabase como social_posts con status='scheduled'.
 */

const supabase = require('../lib/supabase')
const { requireAuth } = require('../lib/auth')

const BRAND_TEMPLATES = {
  market_tip: {
    category: 'mercado',
    headline: 'El mercado inmobiliario colombiano en 2025',
    caption: (ciudad) => `📊 ¿Sabías que el sector inmobiliario en ${ciudad} creció un 12% este año?\n\nLos arriendos en zonas premium siguen al alza, mientras la demanda supera la oferta en el segmento residencial.\n\n✅ Esta es la oportunidad perfecta para invertir o publicar tu inmueble.\n\n#mercadoinmobiliario #inversion #${ciudad.toLowerCase().replace('á','a').replace('é','e')} #bienesinmuebles`,
    emoji: '📊',
  },
  investment_tip: {
    category: 'consejos',
    headline: 'Tip para rentabilizar tu inmueble',
    caption: () => `💡 TIP INMOBILIARIO\n\nSi tienes un inmueble desocupado más de 30 días, estás perdiendo dinero.\n\nCon Rentmies:\n✅ Lo publicamos en 24 horas\n✅ Recibimos interesados 24/7\n✅ Calificamos candidatos automáticamente\n\nDM para saber más 👇\n\n#rentmies #inmuebles #arrendamiento #colombia`,
    emoji: '💡',
  },
  brand_story: {
    category: 'marca',
    headline: '¿Qué es Rentmies?',
    caption: () => `🤖 RENTMIES ES DIFERENTE\n\nMientras las inmobiliarias tradicionales duermen, nuestro agente de IA está:\n\n• Respondiendo consultas\n• Agendando visitas\n• Calificando arrendatarios\n• Publicando tus propiedades\n\nTodo automático. Todo 24/7.\n\n¿Listo para modernizar tu negocio?\n\n#PropTech #IA #inmobiliaria #colombia #automatizacion`,
    emoji: '🤖',
  },
  tenant_tip: {
    category: 'consejos',
    headline: 'Tips para encontrar el inmueble ideal',
    caption: (ciudad) => `🏡 GUÍA RÁPIDA PARA ARRENDATARIOS\n\nBuscando inmueble en ${ciudad}? Ten en cuenta:\n\n1️⃣ Define tu presupuesto (incluye servicios)\n2️⃣ Elige zona por tiempo de desplazamiento, no solo precio\n3️⃣ Revisa el estado del inmueble antes de firmar\n4️⃣ Lee el contrato completo\n5️⃣ Exige inventario firmado al entregar\n\n¿Tienes preguntas? Escríbenos 💬\n\n#arriendos #${ciudad.toLowerCase().replace('á','a')} #consejoshogar`,
    emoji: '🏡',
  },
  industry_trend: {
    category: 'tendencias',
    headline: 'Tendencias del sector en 2025',
    caption: () => `🔮 TENDENCIAS INMOBILIARIAS 2025\n\nLo que está transformando el sector este año:\n\n📱 El 78% de los arrendatarios busca inmuebles desde el celular\n🤖 La IA reduce tiempos de arrendamiento en un 60%\n🌿 Los inmuebles sostenibles valen 15% más\n📊 El mercado de arriendo creció 18% vs 2024\n\n¿Está tu negocio al día?\n\n#PropTech #tendencias #mercadoinmobiliario #colombia`,
    emoji: '🔮',
  },
}

// Genera el calendario de fechas para los posts
function buildSchedule(startDate, totalPosts, postsPerWeek = 3) {
  const dates = []
  const start = new Date(startDate)
  // Lun, Mié, Vie son los mejores días para Instagram inmobiliario
  const targetDays = [1, 3, 5] // Monday=1, Wed=3, Fri=5

  let current = new Date(start)
  let added = 0

  while (added < totalPosts) {
    const dayOfWeek = current.getDay()
    if (targetDays.includes(dayOfWeek)) {
      const postDate = new Date(current)
      postDate.setHours(9, 0, 0, 0) // 9am Colombia time
      dates.push(postDate.toISOString())
      added++
    }
    current.setDate(current.getDate() + 1)
  }

  return dates
}

// Mezcla property posts y brand posts de forma alternada
function buildContentPlan({ propertyPosts, brandPosts, dates }) {
  const plan = []
  let pi = 0, bi = 0
  for (let i = 0; i < dates.length; i++) {
    if (i % 2 === 0 && pi < propertyPosts.length) {
      plan.push({ ...propertyPosts[pi++], type: 'property', scheduledAt: dates[i] })
    } else if (bi < brandPosts.length) {
      plan.push({ ...brandPosts[bi++], type: 'brand', scheduledAt: dates[i] })
    } else if (pi < propertyPosts.length) {
      plan.push({ ...propertyPosts[pi++], type: 'property', scheduledAt: dates[i] })
    }
  }
  return plan
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  const auth = await requireAuth(req, res); if (!auth) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    plan        = '10posts',            // '10posts' | '20posts'
    properties  = [],                   // [{ id, proyecto, tipo, ciudad, precio, imageUrl, descripcion }]
    brandTopics = ['market_tip','investment_tip','brand_story','tenant_tip','industry_trend'],
    startDate   = new Date().toISOString(),
    ciudad      = 'Bogotá',
    clientId,
    igAccountId = process.env.META_IG_ACCOUNT_ID,
    accessToken = process.env.META_ACCESS_TOKEN,
    simulate    = false,
  } = req.body || {}

  const totalPosts    = plan === '20posts' ? 20 : 10
  const propertyCount = Math.ceil(totalPosts / 2)
  const brandCount    = Math.floor(totalPosts / 2)

  // Generar captions de propiedades
  const propertyPosts = properties.slice(0, propertyCount).map(p => ({
    propertyId:  p.id,
    imageUrl:    p.imageUrl,
    headline:    `${p.tipo === 'apartamento' ? 'Apartamento' : p.tipo === 'casa' ? 'Casa' : 'Local'} disponible en ${p.ciudad || ciudad}`,
    caption:     [
      `🏠 ${p.proyecto ? p.proyecto + ' — ' : ''}${p.tipo === 'apartamento' ? 'Apartamento' : p.tipo === 'casa' ? 'Casa' : 'Local'} en ${p.ciudad || ciudad}`,
      p.descripcion ? `\n${p.descripcion}` : '',
      `\n💰 ${p.precio ? '$' + parseInt(p.precio).toLocaleString('es-CO') + '/mes' : 'Precio a consultar'}`,
      '\n\n📲 Escríbenos para agendar tu visita',
      `\n\n#inmuebles #${(p.ciudad || ciudad).toLowerCase().replace('á','a').replace('é','e')} #arriendos #${p.tipo} #rentmies`,
    ].join(''),
    category: 'property',
  }))

  // Seleccionar brand templates
  const brandPosts = brandTopics.slice(0, brandCount).map(key => {
    const tpl = BRAND_TEMPLATES[key] || BRAND_TEMPLATES.market_tip
    return {
      headline: tpl.headline,
      caption:  tpl.caption(ciudad),
      category: tpl.category,
      emoji:    tpl.emoji,
      imageUrl: null, // brand posts usan imágenes de plantilla (generadas o de la marca)
    }
  })

  const dates       = buildSchedule(startDate, totalPosts)
  const contentPlan = buildContentPlan({ propertyPosts, brandPosts, dates })

  // Modo simulación
  if (simulate || !supabase) {
    return res.status(200).json({
      success:  true,
      simulated: true,
      plan,
      totalPosts,
      propertyCount: propertyPosts.length,
      brandCount:    brandPosts.length,
      schedule:      contentPlan,
      message: 'Plan creado (simulado). Conecta Supabase para persistir el calendario.',
    })
  }

  // Guardar en Supabase
  try {
    const rows = contentPlan.map(post => ({
      client_id:    clientId || null,
      property_id:  post.propertyId || null,
      platform:     'instagram',
      format:       'image',
      status:       'scheduled',
      caption:      post.caption,
      media_url:    post.imageUrl || null,
      ad_headline:  post.headline,
      meta: {
        type:        post.type,
        category:    post.category,
        plan,
        ig_account:  igAccountId,
      },
      created_at:   new Date().toISOString(),
      // scheduled_at no está en el schema base — se guarda en meta
    }))

    // Actualizar meta con scheduled_at
    rows.forEach((r, i) => { r.meta.scheduled_at = contentPlan[i].scheduledAt })

    const { data, error } = await supabase.from('social_posts').insert(rows).select('id')
    if (error) throw new Error(error.message)

    return res.status(200).json({
      success:       true,
      simulated:     false,
      plan,
      totalPosts,
      propertyCount: propertyPosts.length,
      brandCount:    brandPosts.length,
      savedIds:      data.map(r => r.id),
      schedule:      contentPlan,
    })
  } catch (err) {
    console.error('[schedule-plan] DB error:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}
