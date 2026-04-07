/**
 * RENTMIES — AUTH ROUTER
 * GET /api/auth?action=tiktok          → inicia OAuth de TikTok
 * GET /api/auth?action=callback&code=  → intercambia code por token
 *
 * Consolida api/auth/tiktok.js + api/auth/tiktok-callback.js
 * TIKTOK_REDIRECT_URI debe apuntar a: https://tu-app.vercel.app/api/auth?action=callback
 */

const https    = require('https')
const supabase = require('../lib/supabase')

function exchangeCode({ clientKey, clientSecret, code, redirectUri }) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }).toString()
    const req = https.request({
      hostname: 'open.tiktokapis.com', path: '/v2/oauth/token/', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, r => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) return reject(new Error(`TikTok OAuth: ${json.error} — ${json.error_description}`))
          resolve(json)
        } catch (e) { reject(new Error('Non-JSON from TikTok: ' + data.slice(0, 200))) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

module.exports = async (req, res) => {
  const { action, code, state, error: oauthError, client_id } = req.query

  // ── Start OAuth ──────────────────────────────────────────────────────────
  if (action === 'tiktok') {
    const clientKey   = process.env.TIKTOK_CLIENT_KEY
    const redirectUri = process.env.TIKTOK_REDIRECT_URI
    if (!clientKey || !redirectUri) return res.status(500).json({ error: 'Faltan TIKTOK_CLIENT_KEY o TIKTOK_REDIRECT_URI' })

    const stateVal = Buffer.from(JSON.stringify({ clientId: client_id || 'default', ts: Date.now() })).toString('base64url')
    const params   = new URLSearchParams({ client_key: clientKey, scope: 'user.info.basic,video.publish', response_type: 'code', redirect_uri: redirectUri, state: stateVal })
    return res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params}`)
  }

  // ── OAuth Callback ───────────────────────────────────────────────────────
  if (action === 'callback') {
    if (oauthError) return res.status(400).send(`Error de autorización TikTok: ${oauthError}`)
    if (!code)      return res.status(400).send('Falta el parámetro code')

    const clientKey    = process.env.TIKTOK_CLIENT_KEY
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET
    const redirectUri  = process.env.TIKTOK_REDIRECT_URI
    if (!clientKey || !clientSecret || !redirectUri) return res.status(500).send('Faltan variables de entorno TIKTOK_*')

    try {
      const tokenData = await exchangeCode({ clientKey, clientSecret, code, redirectUri })

      let clientId = null
      try { const d = JSON.parse(Buffer.from(state, 'base64url').toString()); clientId = d.clientId !== 'default' ? d.clientId : null } catch (_) {}

      if (supabase && clientId) {
        await supabase.from('social_tokens').upsert({
          client_id: clientId, platform: 'tiktok',
          access_token: tokenData.access_token, refresh_token: tokenData.refresh_token,
          open_id: tokenData.open_id, expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'client_id,platform' })
      }

      const appUrl = process.env.APP_URL || 'https://ads-generator.vercel.app'
      return res.redirect(`${appUrl}?tiktok=connected&open_id=${tokenData.open_id}`)
    } catch (err) {
      console.error('[auth/callback] Error:', err.message)
      return res.status(500).send(`Error al conectar TikTok: ${err.message}`)
    }
  }

  res.status(400).json({ error: "Usa ?action=tiktok para iniciar OAuth o ?action=callback para el callback." })
}
