/**
 * GET /api/google/oauth/callback?code=...&state=...
 *   Receives the OAuth redirect from Google. Verifies the CSRF
 *   state, exchanges the authorization code for tokens, lists the
 *   customer accounts the user has access to, and persists the
 *   connection.
 *
 * Flow:
 *   1. Verify state HMAC
 *   2. POST oauth2.googleapis.com/token with code + grant_type
 *   3. GET googleads.googleapis.com/v18/customers:listAccessibleCustomers
 *   4. For each customer, GAQL search for descriptive_name + currency
 *   5. Upsert google_connections with refresh_token + first customer
 *   6. Redirect to /dashboard#settings?google=connected
 *
 * Errors land on /dashboard#settings?google=error&reason=... so the
 * Settings card can show what went wrong.
 */

const crypto = require('crypto')
const axios = require('axios')
const { OAUTH_TOKEN_URL, API_BASE, API_VERSION, ENV, isConfigured, authHeaders } = require('../../../lib/google-ads-config')
const { getServiceClient } = require('../../_lib/auth')

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).end()

  if (!isConfigured()) return redirectError(res, 'not_configured')

  const code = req.query.code
  const state = req.query.state
  if (!code || !state) return redirectError(res, 'missing_params')

  const stateData = verifyState(state)
  if (!stateData) return redirectError(res, 'invalid_state')
  const empresaId = stateData.empresaId

  // ── 1. Exchange code for tokens ──────────────────────────
  let tokens
  try {
    const { data } = await axios.post(OAUTH_TOKEN_URL, new URLSearchParams({
      code,
      client_id: ENV.CLIENT_ID,
      client_secret: ENV.CLIENT_SECRET,
      redirect_uri: ENV.REDIRECT_URI,
      grant_type: 'authorization_code'
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000
    })
    tokens = data
  } catch (err) {
    console.error('[google-oauth] token exchange failed:', err.response?.data || err.message)
    return redirectError(res, 'token_exchange_failed')
  }

  if (!tokens.refresh_token) {
    // Without prompt=consent, Google may skip the refresh token. We force
    // prompt=consent in start.js so this should not happen, but if it
    // does, surface a helpful error rather than silently saving a useless
    // record.
    return redirectError(res, 'no_refresh_token')
  }

  const accessToken = tokens.access_token
  const refreshToken = tokens.refresh_token
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()
  const grantedScopes = (tokens.scope || '').split(/\s+/).filter(Boolean)

  // ── 2. Fetch user info (email + sub) ─────────────────────
  let userEmail = null
  let userId = null
  try {
    const { data } = await axios.get('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    })
    userEmail = data.email
    userId = data.sub
  } catch (_) { /* userinfo scope may not be granted; not fatal */ }

  // ── 3. List accessible customers ─────────────────────────
  let customers = []
  try {
    const { data } = await axios.get(
      `${API_BASE}/${API_VERSION}/customers:listAccessibleCustomers`,
      { headers: authHeaders(accessToken), timeout: 15000 }
    )
    customers = (data.resourceNames || []).map(rn => rn.replace('customers/', ''))
  } catch (err) {
    console.error('[google-oauth] listAccessibleCustomers failed:', err.response?.data || err.message)
    return redirectError(res, 'list_customers_failed')
  }

  if (customers.length === 0) {
    return redirectError(res, 'no_customers')
  }

  // ── 4. Get descriptive name + currency for each customer ─
  const accountsInfo = []
  for (const cid of customers.slice(0, 25)) {
    try {
      const { data } = await axios.post(
        `${API_BASE}/${API_VERSION}/customers/${cid}/googleAds:search`,
        { query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status, customer.test_account, customer.manager FROM customer LIMIT 1' },
        { headers: authHeaders(accessToken), timeout: 10000 }
      )
      const row = data.results?.[0]?.customer
      if (row) {
        accountsInfo.push({
          customer_id: row.id,
          descriptive_name: row.descriptiveName || `Customer ${cid}`,
          currency: row.currencyCode || 'COP',
          time_zone: row.timeZone || 'America/Bogota',
          status: row.status || 'ENABLED',
          test_account: !!row.testAccount,
          is_manager: !!row.manager
        })
      } else {
        accountsInfo.push({ customer_id: cid, descriptive_name: `Customer ${cid}`, currency: 'COP', test_account: false, is_manager: false })
      }
    } catch (_) {
      accountsInfo.push({ customer_id: cid, descriptive_name: `Customer ${cid}`, currency: 'COP', test_account: false, is_manager: false })
    }
  }

  // ── 5. Save connection (use first non-manager customer) ──
  const sb = getServiceClient()
  if (!sb) return redirectError(res, 'no_supabase')

  const primary = accountsInfo.find(a => !a.is_manager) || accountsInfo[0]

  try {
    await sb.from('google_connections').upsert({
      empresa_id: empresaId,
      google_user_id: userId || empresaId,
      google_user_email: userEmail,
      refresh_token: refreshToken,
      access_token: accessToken,
      access_token_expires_at: expiresAt,
      scopes: grantedScopes,
      customer_id: primary.customer_id,
      manager_customer_id: ENV.LOGIN_CUSTOMER_ID || null,
      account_currency_code: primary.currency,
      account_time_zone: primary.time_zone,
      account_status: primary.status,
      is_test_account: !!primary.test_account,
      status: 'active',
      available_accounts: accountsInfo,
      source: 'oauth',
      updated_at: new Date().toISOString()
    }, { onConflict: 'empresa_id' })
  } catch (err) {
    if (err.code === '42P01') return redirectError(res, 'tables_missing')
    console.error('[google-oauth] save failed:', err.message)
    return redirectError(res, 'save_failed')
  }

  // ── 6. Redirect back to dashboard with success flag ──────
  const target = accountsInfo.length > 1 ? '?google=connected&select_account=1' : '?google=connected'
  res.statusCode = 302
  res.setHeader('Location', `/dashboard#settings${target}`)
  res.end()
}

function verifyState (state) {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8')
    const parts = decoded.split('|')
    if (parts.length !== 4) return null
    const [empresaId, nonce, ts, sig] = parts
    const secret = ENV.STATE_SECRET || 'dev_state_secret_change_me'
    const expected = crypto.createHmac('sha256', secret).update(`${empresaId}|${nonce}|${ts}`).digest('hex').slice(0, 32)
    if (sig !== expected) return null
    // Reject states older than 15 min
    const age = Date.now() - parseInt(ts, 36)
    if (isNaN(age) || age > 15 * 60_000 || age < 0) return null
    return { empresaId, nonce, ts }
  } catch (_) {
    return null
  }
}

function redirectError (res, reason) {
  res.statusCode = 302
  res.setHeader('Location', `/dashboard#settings?google=error&reason=${encodeURIComponent(reason)}`)
  res.end()
}
