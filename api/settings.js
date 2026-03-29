// En producción, las credenciales van en Vercel Environment Variables.
// Este endpoint lee las env vars y retorna cuáles están configuradas (sin exponer valores).

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Retorna qué variables están configuradas (boolean, nunca el valor real)
  const status = {
    meta: {
      accessToken:   !!process.env.META_ACCESS_TOKEN,
      adAccountId:   !!process.env.META_AD_ACCOUNT_ID,
      pageId:        !!process.env.META_PAGE_ID,
      igAccountId:   !!process.env.META_IG_ACCOUNT_ID,
      businessId:    !!process.env.META_BUSINESS_ID,
    },
    whatsapp: {
      number:        !!process.env.WHATSAPP_NUMBER,
      phoneNumberId: !!process.env.WHATSAPP_PHONE_ID,
    },
    google: {
      geminiKey:     !!process.env.GEMINI_API_KEY,
    },
    tiktok: {
      accessToken:   !!process.env.TIKTOK_ACCESS_TOKEN,
      advertiserId:  !!process.env.TIKTOK_ADVERTISER_ID,
    }
  }

  // Contar cuántas están configuradas
  const allVars = Object.values(status).flatMap(s => Object.values(s))
  const configured = allVars.filter(Boolean).length
  const total = allVars.length

  res.status(200).json({
    success: true,
    status,
    summary: { configured, total, ready: configured >= 4 }
  })
}
