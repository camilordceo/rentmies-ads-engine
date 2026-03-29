const PROMPTS_SNAPSHOT = {
  adCopy: {
    system: 'Eres un experto en marketing inmobiliario colombiano. Escribes copy persuasivo, directo y con urgencia real.',
    variations: {
      painPoint: 'Genera un ad enfocado en el DOLOR del arrendatario: buscar inmueble es frustrante, pierde tiempo, no tiene respuesta.',
      outcome:   'Genera un ad enfocado en el RESULTADO: encontrar el inmueble perfecto rápido, sin llamadas, sin intermediarios.',
      social:    'Genera un ad con PRUEBA SOCIAL: primera inmobiliaria en Colombia con IA que ya cerró ventas y arriendos reales.',
      urgency:   'Genera un ad con URGENCIA: inmuebles se van rápido en Bogotá/Medellín/Cali. Ver primero = arrendar primero.'
    }
  },
  imagePrompts: {
    style: 'Fotografía arquitectónica profesional, colores cálidos y luminosos, estilo moderno colombiano. NUNCA texto. NUNCA logos.'
  },
  analysisPrompts: {
    evaluate: 'Analiza métricas: CTR, CPC, conversiones. Pausar si CTR < 0.8%. Escalar si CTR > 3% y CPC < $2000 COP.'
  }
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    return res.status(200).json({ success: true, prompts: PROMPTS_SNAPSHOT })
  }

  if (req.method === 'PUT') {
    const { promptKey } = req.body || {}
    return res.status(200).json({
      success: true,
      updated: promptKey,
      note: 'Edita config/prompts.js y redespliega para persistir.',
      timestamp: new Date().toISOString()
    })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
