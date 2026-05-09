/* ─────────────────────────────────────────────────────────────
   Shared API client helpers
   Used by every channel module that needs to talk to /api/*.
   Centralizes auth header construction, demo-mode fallback, and
   the empresa_id lookup. Keeping it in one place means a token
   format change touches only this file.

   Public API on window.rmApi:
     authToken()         -- the supabase token, '' if unauthenticated
     empresaId()         -- best-effort empresa_id from sb_user
     authHeaders(extra)  -- { Content-Type, Authorization, [x-empresa-id] }
     get(url, opts)      -- fetch wrapper that injects auth headers
     post(url, body)     -- POST with JSON body + auth
     put(url, body)
     del(url)
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  function authToken () {
    try { return localStorage.getItem('sb_token') || '' } catch (_) { return '' }
  }

  function empresaId () {
    try { return (JSON.parse(localStorage.getItem('sb_user') || '{}')).id || '' } catch (_) { return '' }
  }

  function authHeaders (extra) {
    const t = authToken()
    const h = { 'Content-Type': 'application/json' }
    if (t) {
      h.Authorization = 'Bearer ' + t
    } else {
      // Demo / local-server fallback: backend accepts demo_local + x-empresa-id
      h.Authorization = 'Bearer demo_local'
      h['x-empresa-id'] = empresaId() || 'demo'
    }
    if (extra) Object.assign(h, extra)
    return h
  }

  async function request (method, url, body, opts) {
    const init = {
      method,
      headers: authHeaders((opts && opts.headers) || null),
      ...(opts || {})
    }
    if (body !== undefined && body !== null) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
    }
    const r = await fetch(url, init)
    const ct = r.headers.get('content-type') || ''
    const data = ct.includes('application/json') ? await r.json().catch(() => null) : await r.text().catch(() => null)
    if (!r.ok) {
      const err = new Error((data && data.error) || ('HTTP ' + r.status))
      err.status = r.status
      err.body = data
      throw err
    }
    return data
  }

  window.rmApi = {
    authToken,
    empresaId,
    authHeaders,
    get:  (url, opts) => request('GET', url, null, opts),
    post: (url, body, opts) => request('POST', url, body, opts),
    put:  (url, body, opts) => request('PUT', url, body, opts),
    del:  (url, opts) => request('DELETE', url, null, opts)
  }
})()
