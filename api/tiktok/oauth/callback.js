/**
 * GET /api/tiktok/oauth/callback
 *   STUB · 501 Not Implemented until TikTok integration ships.
 */

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 501
  res.end(JSON.stringify({
    error: 'Not Implemented',
    detail: 'TikTok OAuth callback ships in a later block.'
  }))
}
