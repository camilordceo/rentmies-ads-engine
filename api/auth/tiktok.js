/**
 * RENTMIES — TIKTOK OAUTH START
 * GET /api/auth/tiktok
 *
 * Redirige al usuario al flow de autorización de TikTok.
 * Después del login TikTok redirige a /api/auth/tiktok-callback
 */

module.exports = (req, res) => {
  const clientKey   = process.env.TIKTOK_CLIENT_KEY
  const redirectUri = process.env.TIKTOK_REDIRECT_URI

  if (!clientKey || !redirectUri) {
    return res.status(500).json({
      error: 'Faltan TIKTOK_CLIENT_KEY o TIKTOK_REDIRECT_URI en las variables de entorno.'
    })
  }

  // state puede llevar el client_id del cliente de Rentmies para asociar el token
  const clientId = req.query.client_id || 'default'
  const state     = Buffer.from(JSON.stringify({ clientId, ts: Date.now() })).toString('base64url')

  const params = new URLSearchParams({
    client_key:    clientKey,
    scope:         'user.info.basic,video.publish',
    response_type: 'code',
    redirect_uri:  redirectUri,
    state,
  })

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params}`
  res.redirect(authUrl)
}
