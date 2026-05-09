/**
 * Google Ads API configuration constants.
 *
 *   require('lib/google-ads-config') from any /api endpoint.
 *
 * Env vars are read at module evaluation; if a required one is
 * missing we still export the constant (empty string) and the
 * caller can branch on it. Centralizing here means a token
 * change touches one file and every consumer picks it up.
 *
 * Setup steps (the user does these once per Google Ads account):
 *   1. Create MCC at ads.google.com → Tools → Manager Accounts
 *   2. Apply for a developer token in API Center (~1-3 weeks)
 *   3. Create a Google Cloud project, enable Google Ads API
 *   4. OAuth 2.0 → Web application credentials with redirect URI
 *      matching GOOGLE_ADS_REDIRECT_URI
 *   5. Paste the values into Vercel env vars (or .env locally).
 */

const API_VERSION = 'v18'
const API_BASE = 'https://googleads.googleapis.com'
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/adwords'
]

const ENV = {
  DEVELOPER_TOKEN:    process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
  CLIENT_ID:          process.env.GOOGLE_ADS_CLIENT_ID       || '',
  CLIENT_SECRET:      process.env.GOOGLE_ADS_CLIENT_SECRET   || '',
  LOGIN_CUSTOMER_ID:  process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '',
  REDIRECT_URI:       process.env.GOOGLE_ADS_REDIRECT_URI    || '',
  STATE_SECRET:       process.env.GOOGLE_OAUTH_STATE_SECRET  || '',
  LEADS_WEBHOOK_SECRET: process.env.GOOGLE_LEADS_WEBHOOK_SECRET || ''
}

function isConfigured () {
  return !!(ENV.DEVELOPER_TOKEN && ENV.CLIENT_ID && ENV.CLIENT_SECRET && ENV.REDIRECT_URI)
}

// Standard request headers every Google Ads API call needs.
// `accessToken` is per-request; the rest are constant.
function authHeaders (accessToken, extra) {
  const h = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': ENV.DEVELOPER_TOKEN,
    'Content-Type': 'application/json'
  }
  if (ENV.LOGIN_CUSTOMER_ID) h['login-customer-id'] = String(ENV.LOGIN_CUSTOMER_ID).replace(/-/g, '')
  if (extra) Object.assign(h, extra)
  return h
}

// Construct the customer endpoint URL for a given customer_id
function customerUrl (customerId, path) {
  const cid = String(customerId).replace(/-/g, '')
  return `${API_BASE}/${API_VERSION}/customers/${cid}${path || ''}`
}

module.exports = {
  API_VERSION,
  API_BASE,
  OAUTH_AUTH_URL,
  OAUTH_TOKEN_URL,
  OAUTH_REVOKE_URL,
  REQUIRED_SCOPES,
  ENV,
  isConfigured,
  authHeaders,
  customerUrl
}
