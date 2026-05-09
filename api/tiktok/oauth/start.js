/**
 * GET /api/tiktok/oauth/start
 *   Kicks off the TikTok Business OAuth flow.
 *
 * STUB: TikTok integration is scaffolded for a later block.
 * Bounces back to Settings with a coming-soon hint.
 */

module.exports = (req, res) => {
  res.statusCode = 302
  res.setHeader('Location', '/dashboard#settings?tiktok=coming_soon')
  res.end()
}
