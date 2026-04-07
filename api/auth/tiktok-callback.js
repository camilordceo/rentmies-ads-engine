/**
 * RENTMIES — TIKTOK OAUTH CALLBACK
 * GET /api/auth/tiktok-callback
 *
 * TikTok redirige aquí con ?code=...&state=...
 * Intercambia el code por access_token y guarda en Supabase.
 */

const https    = require('https')
const supabase = require('../../lib/supabase')

function exchangeCode({ clientKey, clientSecret, code, redirectUri }) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_key:    clientKey,
      client_secret: clientSecret,
      code,
      grant_type:    'authorization_code',
      redirect_uri:  redirectUri,
    }).toString()

    const options = {
      hostname: 'open.tiktokapis.com',
      path:     '/v2/oauth/token/',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const req = https.request(options, r => {
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
  const { code, state, error: oauthError } = req.query

  if (oauthError) {
    return res.status(400).send(`Error de autorización TikTok: ${oauthError}`)
  }
  if (!code) {
    return res.status(400).send('Falta el parámetro code')
  }

  const clientKey    = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET
  const redirectUri  = process.env.TIKTOK_REDIRECT_URI

  if (!clientKey || !clientSecret || !redirectUri) {
    return res.status(500).send('Faltan variables de entorno TIKTOK_*')
  }

  try {
    // 1. Intercambiar code por token
    const tokenData = await exchangeCode({ clientKey, clientSecret, code, redirectUri })

    // 2. Extraer client_id del state
    let clientId = null
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
      clientId = decoded.clientId !== 'default' ? decoded.clientId : null
    } catch (_) {}

    // 3. Calcular expires_at
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    // 4. Guardar en Supabase
    if (supabase && clientId) {
      await supabase.from('social_tokens').upsert({
        client_id:     clientId,
        platform:      'tiktok',
        access_token:  tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        open_id:       tokenData.open_id,
        expires_at:    expiresAt,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'client_id,platform' })
    }

    // 5. Redirigir al dashboard con éxito
    const appUrl = process.env.APP_URL || 'https://rentmies-ads-engine.vercel.app'
    res.redirect(`${appUrl}?tiktok=connected&open_id=${tokenData.open_id}`)

  } catch (err) {
    console.error('[tiktok-callback] Error:', err.message)
    res.status(500).send(`Error al conectar TikTok: ${err.message}`)
  }
}
