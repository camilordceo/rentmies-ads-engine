/**
 * GET /api/google/oauth/start
 *   Kicks off the Google Ads OAuth 2.0 flow for the current empresa.
 *
 * BLOQUE 3 STUB: returns a friendly redirect to Settings with a
 * "coming soon" toast trigger until the full OAuth implementation
 * lands. This way the Settings card link doesn't 404 in the meantime.
 *
 * When implemented:
 *   1. Build Google OAuth URL with scopes:
 *      - https://www.googleapis.com/auth/adwords
 *      - https://www.googleapis.com/auth/userinfo.email
 *   2. Set state cookie with empresa_id signed JWT
 *   3. 302 redirect to https://accounts.google.com/o/oauth2/v2/auth
 *   4. /api/google/oauth/callback receives the code, exchanges for
 *      refresh_token + access_token, creates google_connections row.
 */

module.exports = (req, res) => {
  // Hint visible to the user, then bounce back to Settings
  res.statusCode = 302
  res.setHeader('Location', '/dashboard#settings?google=coming_soon')
  res.end()
}
