/**
 * GET /api/auth/meta/callback?code=X&state=Y
 *
 * Handles the OAuth redirect from Facebook Login for Business:
 *  1. Verify CSRF state cookie matches.
 *  2. Exchange code → short-lived token → long-lived token (60d).
 *  3. Fetch /me, /me/accounts (pages with linked IG), /me/businesses (WhatsApp).
 *  4. Create/find empresa + Supabase user matching the Meta email.
 *  5. Persist everything to meta_connections (upsert by empresa_id).
 *  6. Generate a Supabase magic link → redirect browser there so the user
 *     ends up logged in to Supabase Auth on /onboarding/select-page or
 *     /onboarding/payment.
 *
 * Required env vars: see lib/meta-config.js + SUPABASE_URL + SUPABASE_SERVICE_KEY.
 *
 * Manual one-time setup (see docs/META_APP_SETUP.md):
 *   - In Supabase → Auth → URL Configuration → Redirect URLs, add:
 *       https://rentmies-ads-engine.vercel.app/onboarding/post-oauth
 *       http://localhost:3000/onboarding/post-oauth
 */

const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')
const meta = require('../../../lib/meta-config')
const { readState, clearStateCookie } = require('../../../lib/signed-cookies')

function getSupabaseService() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function appBaseUrl(req) {
  // Prefer explicit env, fall back to the host header.
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '')
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers.host
  return `${proto}://${host}`
}

function redirectErr(res, base, code, detail) {
  const params = new URLSearchParams({ error: code })
  if (detail) params.set('detail', detail.slice(0, 200))
  res.statusCode = 302
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('Set-Cookie', clearStateCookie())
  res.setHeader('Location', `${base}/signup?${params.toString()}`)
  res.end()
}

module.exports = async (req, res) => {
  const base = appBaseUrl(req)

  if (req.method === 'OPTIONS') return res.status(200).end()

  // Sanity-check config first
  const missing = meta.missingEnvVars()
  if (missing.length) {
    return redirectErr(res, base, 'config_missing', missing.join(','))
  }

  const { code, state, error } = req.query || {}

  // User cancelled or denied permissions
  if (error) return redirectErr(res, base, 'oauth_denied', error)
  if (!code) return redirectErr(res, base, 'no_code')

  // ── 1. CSRF state ─────────────────────────────────────────
  const cookieState = readState(req, meta.OAUTH_SECRET)
  if (!cookieState || cookieState.state !== state) {
    return redirectErr(res, base, 'invalid_state')
  }
  const source = cookieState.source || 'signup'

  // ── 2. Exchange code → short-lived token ──────────────────
  let shortToken
  try {
    const r = await axios.get(`${meta.GRAPH_BASE_URL}/oauth/access_token`, {
      params: {
        client_id: meta.APP_ID,
        client_secret: meta.APP_SECRET,
        code,
        redirect_uri: meta.REDIRECT_URI
      },
      timeout: 15000
    })
    shortToken = r.data.access_token
    if (!shortToken) throw new Error('Empty access_token in response')
  } catch (err) {
    const fb = err.response && err.response.data && err.response.data.error
    return redirectErr(res, base, 'token_exchange_failed', fb ? fb.message : err.message)
  }

  // ── 3. Exchange short → long-lived (60d) ──────────────────
  let longToken, longTokenExpiresIn
  try {
    const r = await axios.get(`${meta.GRAPH_BASE_URL}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: meta.APP_ID,
        client_secret: meta.APP_SECRET,
        fb_exchange_token: shortToken
      },
      timeout: 15000
    })
    longToken = r.data.access_token
    longTokenExpiresIn = r.data.expires_in || 60 * 24 * 60 * 60   // default 60d
    if (!longToken) throw new Error('Empty long-lived token')
  } catch (err) {
    const fb = err.response && err.response.data && err.response.data.error
    return redirectErr(res, base, 'long_token_failed', fb ? fb.message : err.message)
  }
  const tokenExpiresAt = new Date(Date.now() + longTokenExpiresIn * 1000)

  // ── 4. Fetch user info ────────────────────────────────────
  let me
  try {
    const r = await axios.get(`${meta.GRAPH_BASE_URL}/me`, {
      params: { fields: 'id,name,email', access_token: longToken },
      timeout: 10000
    })
    me = r.data
  } catch (err) {
    const fb = err.response && err.response.data && err.response.data.error
    return redirectErr(res, base, 'me_fetch_failed', fb ? fb.message : err.message)
  }
  if (!me.email) {
    return redirectErr(res, base, 'no_email_permission', 'Meta no devolvió email — verifica que el permiso "email" esté en la Configuration.')
  }

  // ── 5. Fetch Pages with linked IG ─────────────────────────
  let pages = []
  try {
    const r = await axios.get(`${meta.GRAPH_BASE_URL}/me/accounts`, {
      params: {
        fields: 'id,name,picture{url},category,fan_count,instagram_business_account{id,username,profile_picture_url,followers_count},access_token,tasks',
        access_token: longToken,
        limit: 100
      },
      timeout: 15000
    })
    pages = r.data.data || []
  } catch (err) {
    // Non-fatal — user might have no pages
    console.warn('[meta-oauth] pages fetch failed:', err.message)
  }

  // ── 6. Fetch WhatsApp Business Accounts (best-effort) ─────
  let wabaList = []
  try {
    const r = await axios.get(`${meta.GRAPH_BASE_URL}/${me.id}/businesses`, {
      params: {
        fields: 'id,name,owned_whatsapp_business_accounts{id,name,owner_business_info,phone_numbers{id,display_phone_number,verified_name}}',
        access_token: longToken,
        limit: 50
      },
      timeout: 15000
    })
    const businesses = r.data.data || []
    for (const biz of businesses) {
      const wabas = (biz.owned_whatsapp_business_accounts && biz.owned_whatsapp_business_accounts.data) || []
      wabaList.push(...wabas)
    }
  } catch (err) {
    console.warn('[meta-oauth] WhatsApp fetch failed (non-fatal):', err.message)
  }

  // ── 7. Find or create empresa + Supabase user ─────────────
  const sb = getSupabaseService()
  if (!sb) return redirectErr(res, base, 'supabase_not_configured')

  let supaUser
  let empresaId
  try {
    // Try to find existing user by email via admin list (paginate up to 1000)
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
    supaUser = (list && list.users || []).find(u => (u.email || '').toLowerCase() === me.email.toLowerCase())

    if (!supaUser) {
      // Create new user (no password — they'll log in via magic link)
      const created = await sb.auth.admin.createUser({
        email: me.email,
        email_confirm: true,
        user_metadata: { name: me.name, source: 'meta_oauth' }
      })
      if (created.error) throw new Error(created.error.message)
      supaUser = created.data.user
    }

    // Find or create empresa for this user
    const { data: profile } = await sb.from('profiles').select('empresa_id').eq('id', supaUser.id).maybeSingle()
    if (profile && profile.empresa_id) {
      empresaId = profile.empresa_id
    } else {
      const empresaName = (me.name || me.email.split('@')[0])
      const { data: empData, error: empErr } = await sb.from('empresas').insert({
        nombre: empresaName,
        plan: 'Trial',
        created_at: new Date().toISOString()
      }).select().single()
      if (empErr) throw new Error('empresa insert: ' + empErr.message)
      empresaId = empData.id

      await sb.from('profiles').upsert({
        id: supaUser.id,
        empresa_id: empresaId,
        email: me.email,
        nombre: me.name,
        rol: 'Admin',
        activo: true,
        plan: 'Trial',
        created_at: new Date().toISOString()
      })
    }
  } catch (err) {
    console.error('[meta-oauth] supabase user/empresa step:', err.message)
    return redirectErr(res, base, 'user_provisioning_failed', err.message)
  }

  // ── 8. Persist meta_connection ────────────────────────────
  // Decide initial selected page: auto-pick if exactly 1, else mark pending_page_select.
  let selectedPage = null
  let connectionStatus = 'active'
  if (pages.length === 1) selectedPage = pages[0]
  else if (pages.length === 0) connectionStatus = 'no_pages'
  else connectionStatus = 'pending_page_select'

  const igAcct = selectedPage && selectedPage.instagram_business_account
  const firstWaba = wabaList[0]
  const firstPhone = firstWaba && firstWaba.phone_numbers && firstWaba.phone_numbers.data && firstWaba.phone_numbers.data[0]

  try {
    const row = {
      empresa_id: empresaId,
      meta_user_id: me.id,
      meta_user_name: me.name || null,
      meta_user_email: me.email,
      long_lived_token: longToken,
      short_lived_token: shortToken,
      token_expires_at: tokenExpiresAt.toISOString(),
      last_refreshed_at: new Date().toISOString(),
      page_id: selectedPage ? selectedPage.id : null,
      page_name: selectedPage ? selectedPage.name : null,
      page_picture_url: selectedPage && selectedPage.picture && selectedPage.picture.data ? selectedPage.picture.data.url : null,
      page_category: selectedPage ? selectedPage.category : null,
      page_followers_count: selectedPage ? selectedPage.fan_count : null,
      page_access_token: selectedPage ? selectedPage.access_token : null,
      page_tasks: selectedPage ? selectedPage.tasks : null,
      ig_business_id: igAcct ? igAcct.id : null,
      ig_username: igAcct ? igAcct.username : null,
      ig_profile_picture_url: igAcct ? igAcct.profile_picture_url : null,
      ig_followers_count: igAcct ? igAcct.followers_count : null,
      waba_id: firstWaba ? firstWaba.id : null,
      whatsapp_phone_number_id: firstPhone ? firstPhone.id : null,
      whatsapp_display_name: firstPhone ? firstPhone.verified_name : null,
      status: connectionStatus,
      available_pages: pages.map(p => ({
        id: p.id,
        name: p.name,
        picture: p.picture && p.picture.data ? p.picture.data.url : null,
        category: p.category,
        fan_count: p.fan_count,
        ig_id: p.instagram_business_account ? p.instagram_business_account.id : null,
        ig_username: p.instagram_business_account ? p.instagram_business_account.username : null,
        ig_followers: p.instagram_business_account ? p.instagram_business_account.followers_count : null,
        ig_picture: p.instagram_business_account ? p.instagram_business_account.profile_picture_url : null,
        tasks: p.tasks || []
      })),
      source,
      updated_at: new Date().toISOString()
    }
    const { error } = await sb.from('meta_connections')
      .upsert(row, { onConflict: 'empresa_id' })
    if (error) throw new Error(error.message)
  } catch (err) {
    console.error('[meta-oauth] meta_connections upsert:', err.message)
    return redirectErr(res, base, 'connection_save_failed', err.message)
  }

  // ── 9. Generate Supabase magic link to log the user in ────
  // Decide where to send them after auth completes.
  let postAuthPath = '/onboarding/payment'
  if (connectionStatus === 'pending_page_select') postAuthPath = '/onboarding/select-page'
  else if (connectionStatus === 'no_pages') postAuthPath = '/onboarding/no-pages'
  if (source === 'reconnect') postAuthPath = '/dashboard'

  let actionLink
  try {
    const linkRes = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: me.email,
      options: { redirectTo: `${base}/onboarding/post-oauth?next=${encodeURIComponent(postAuthPath)}` }
    })
    if (linkRes.error) throw new Error(linkRes.error.message)
    actionLink = linkRes.data && linkRes.data.properties && linkRes.data.properties.action_link
    if (!actionLink) throw new Error('No action_link in response')
  } catch (err) {
    console.error('[meta-oauth] generateLink failed:', err.message)
    // Fallback: send them to /login with a flag — they'll see "your account is set up, log in"
    res.statusCode = 302
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    res.setHeader('Set-Cookie', clearStateCookie())
    res.setHeader('Location', `${base}/login?from=oauth&email=${encodeURIComponent(me.email)}`)
    return res.end()
  }

  // ── 10. Redirect browser to magic link → ends in /onboarding/post-oauth
  res.statusCode = 302
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('Set-Cookie', clearStateCookie())
  res.setHeader('Location', actionLink)
  res.end()
}
