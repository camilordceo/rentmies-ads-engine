/**
 * GET /api/google/oauth/callback?code=...&state=...
 *   OAuth 2.0 redirect target. Exchanges code → refresh_token → empresa connection.
 *
 * BLOQUE 3 STUB: returns 501 until implemented.
 */

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 501
  res.end(JSON.stringify({
    error: 'Not Implemented',
    detail: 'Google Ads OAuth callback ships in Bloque 3 of the Reestructura PRD.'
  }))
}
