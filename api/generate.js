const MOCK_COPIES = {
  painPoint: {
    bogotá:   { headline: '¿Cansado de buscar sin respuesta?', description: 'Rentmies te responde en segundos por WhatsApp. Sin llamadas, sin esperas.', cta: 'Escribir ahora', hook: '¿Llevas semanas buscando y nadie contesta?' },
    medellín: { headline: 'Buscar apto no debería ser así',    description: 'En Medellín los mejores aptos duran días. Rentmies te avisa primero. IA 24/7.', cta: 'Ver disponibles', hook: 'El apto que querías ya lo arrendaron.' },
    cali:     { headline: 'Basta de buscar sin resultados',    description: 'Rentmies conoce cada inmueble disponible en Cali. Respuesta inmediata garantizada.', cta: 'Consultar gratis', hook: '¿Cuántas llamadas sin respuesta llevas ya?' },
  },
  outcome: {
    bogotá:   { headline: 'Tu aparto ideal, sin drama',   description: 'Dinos qué buscas en Bogotá y Rentmies lo encuentra. Solo WhatsApp.', cta: 'Empezar búsqueda', hook: 'Encontrá tu nuevo hogar en Bogotá, hoy.' },
    medellín: { headline: 'Arriendo en Medellín, fácil', description: 'Especifica tu presupuesto y zona. Cero pérdida de tiempo.', cta: 'Ver opciones', hook: 'El Poblado, Laureles o Envigado. Tú eliges.' },
    cali:     { headline: 'Tu próximo inmueble en Cali', description: 'Rentmies filtra por lo que realmente importa. Resultados reales en minutos.', cta: 'Buscar ahora', hook: 'Ciudad Jardín te espera.' },
  },
  social: {
    bogotá:   { headline: 'Ya cerramos +200 arriendos en Bogotá', description: 'Rentmies es la primera IA inmobiliaria en Colombia. Clientes reales en menos de 48h.', cta: 'Unirme ahora', hook: '200 familias ya encontraron hogar con Rentmies.' },
    medellín: { headline: 'La IA que ya funciona en Medellín',    description: 'Rentmies ya cerró arriendos reales en El Poblado y Laureles este mes.', cta: 'Ver testimonios', hook: 'En Medellín ya confían en Rentmies. ¿Y vos?' },
    cali:     { headline: 'Primera IA inmobiliaria en Cali',      description: 'Rentmies llegó a Cali con tecnología real. Arriendos cerrados, clientes satisfechos.', cta: 'Conocer más', hook: 'Cali ya tiene su propia IA inmobiliaria.' },
  },
  urgency: {
    bogotá:   { headline: 'Los buenos aptos duran 48h',    description: 'En Bogotá el mercado no espera. Hay 12 aptos disponibles ahora mismo.', cta: 'Ver ahora →', hook: '12 apartamentos disponibles. Por cuánto tiempo, nadie sabe.' },
    medellín: { headline: 'El Poblado: quedan 8 aptos',   description: 'Los arriendos premium en Medellín vuelan. Rentmies te pone en línea antes.', cta: 'Reservar turno', hook: '8 apartamentos en El Poblado. ¿Vas a perder otro?' },
    cali:     { headline: 'Ciudad Jardín: disponibilidad baja', description: 'Cali creció y los buenos inmuebles escasean. Acceso antes de que salgan al público.', cta: 'Acceso anticipado', hook: 'Los mejores inmuebles de Cali nunca llegan a portales.' },
  }
}

const PLATFORM_NAMES = {
  meta_feed: 'Meta Feed', instagram_feed: 'Instagram Feed',
  meta_stories: 'Meta Stories', tiktok: 'TikTok'
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    ciudad = 'Bogotá',
    tipoInmueble = 'apartamento',
    presupuesto = '1.500.000 - 2.500.000',
    plataformas = ['meta_feed', 'instagram_feed'],
    variaciones = ['painPoint', 'outcome', 'social', 'urgency']
  } = req.body || {}

  const cityKey = ciudad.toLowerCase()
  const ads = []
  let counter = 1

  for (const variationType of variaciones) {
    for (const platform of plataformas) {
      const copy = MOCK_COPIES[variationType]?.[cityKey] || MOCK_COPIES[variationType]?.bogotá || {}
      ads.push({
        id: `ad_${Date.now()}_${counter++}`,
        campaignId: `camp_${Date.now()}`,
        variationType,
        platform,
        platformName: PLATFORM_NAMES[platform] || platform,
        ciudad,
        tipoInmueble,
        presupuesto,
        headline:    copy.headline    || 'Rentmies — Tu inmueble ideal',
        description: copy.description || 'Encuentra tu próximo inmueble por WhatsApp.',
        cta:         copy.cta         || 'Escribir ahora',
        hook:        copy.hook        || '',
        status: 'generated',
        source: 'mock',
        createdAt: new Date().toISOString()
      })
    }
  }

  res.status(200).json({ success: true, ads, totalGenerated: ads.length })
}
