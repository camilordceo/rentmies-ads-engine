/**
 * Meta App configuration — single source of truth for OAuth, scopes,
 * Graph API version. Imported by api/auth/meta/* and api/social-post.js.
 *
 * Required env vars (see docs/META_APP_SETUP.md):
 *   META_APP_ID
 *   META_APP_SECRET
 *   META_LOGIN_CONFIG_ID   (Facebook Login for Business → Configurations → Configuration ID)
 *   META_REDIRECT_URI      (must match the URI registered in the Meta App)
 *   META_OAUTH_SECRET      (HMAC key for signing the state cookie — `openssl rand -hex 32`)
 *
 * Optional:
 *   META_GRAPH_VERSION     (default: v21.0)
 */

const APP_ID = process.env.META_APP_ID || ''
const APP_SECRET = process.env.META_APP_SECRET || ''
const LOGIN_CONFIG_ID = process.env.META_LOGIN_CONFIG_ID || ''
const REDIRECT_URI = process.env.META_REDIRECT_URI || ''
const OAUTH_SECRET = process.env.META_OAUTH_SECRET || ''
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0'

const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`
const FB_DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`

// Permissions requested via the Login for Business Configuration.
// NOTE: With Login for Business, the actual permissions come from the
// Configuration (config_id) — we list them here for documentation only.
// Don't pass `scope` in the OAuth URL when using config_id; mixing breaks the flow.
const REQUIRED_SCOPES = [
  'public_profile',
  'email',
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_manage_metadata',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'whatsapp_business_management',
  'whatsapp_business_messaging',
  'business_management'
]

// Long-lived tokens last 60 days. Refresh when within this many days of expiry.
const REFRESH_THRESHOLD_DAYS = 14

function isConfigured() {
  return !!(APP_ID && APP_SECRET && LOGIN_CONFIG_ID && REDIRECT_URI && OAUTH_SECRET)
}

function missingEnvVars() {
  const missing = []
  if (!APP_ID) missing.push('META_APP_ID')
  if (!APP_SECRET) missing.push('META_APP_SECRET')
  if (!LOGIN_CONFIG_ID) missing.push('META_LOGIN_CONFIG_ID')
  if (!REDIRECT_URI) missing.push('META_REDIRECT_URI')
  if (!OAUTH_SECRET) missing.push('META_OAUTH_SECRET')
  return missing
}

module.exports = {
  APP_ID,
  APP_SECRET,
  LOGIN_CONFIG_ID,
  REDIRECT_URI,
  OAUTH_SECRET,
  GRAPH_VERSION,
  GRAPH_BASE_URL,
  FB_DIALOG_URL,
  REQUIRED_SCOPES,
  REFRESH_THRESHOLD_DAYS,
  isConfigured,
  missingEnvVars
}
