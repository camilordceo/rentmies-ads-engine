/**
 * Signed cookie helpers for OAuth state (CSRF protection) and
 * lightweight session metadata. Uses HMAC-SHA256 with META_OAUTH_SECRET.
 *
 * The cookie value is `<base64url(payload)>.<base64url(hmac)>`.
 * Tampering invalidates the HMAC. We also include an exp timestamp so
 * stale cookies are rejected even if the signature checks out.
 */

const crypto = require('crypto')

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function b64urlDecode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Buffer.from(s, 'base64')
}

function sign(value, secret) {
  if (!secret) throw new Error('META_OAUTH_SECRET not configured')
  const payload = b64url(JSON.stringify(value))
  const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest())
  return `${payload}.${sig}`
}

function verify(token, secret) {
  if (!token || !secret) return null
  const [payload, sig] = String(token).split('.')
  if (!payload || !sig) return null
  const expected = b64url(crypto.createHmac('sha256', secret).update(payload).digest())
  // Constant-time comparison
  if (sig.length !== expected.length) return null
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) return null
  try {
    const obj = JSON.parse(b64urlDecode(payload).toString('utf8'))
    if (obj.exp && Date.now() > obj.exp) return null
    return obj
  } catch (_) { return null }
}

/**
 * Build a `Set-Cookie` header value.
 * @param {string} name
 * @param {string} value
 * @param {Object} opts { maxAge (sec), httpOnly, secure, sameSite, path }
 */
function buildSetCookie(name, value, opts) {
  const o = opts || {}
  const parts = [`${name}=${value}`]
  if (o.maxAge != null) parts.push(`Max-Age=${o.maxAge}`)
  parts.push(`Path=${o.path || '/'}`)
  if (o.httpOnly !== false) parts.push('HttpOnly')
  if (o.secure !== false) parts.push('Secure')
  parts.push(`SameSite=${o.sameSite || 'Lax'}`)
  return parts.join('; ')
}

function readCookie(req, name) {
  const raw = req.headers && req.headers.cookie
  if (!raw) return null
  const parts = String(raw).split(';')
  for (const p of parts) {
    const i = p.indexOf('=')
    if (i < 0) continue
    const k = p.slice(0, i).trim()
    if (k === name) return p.slice(i + 1).trim()
  }
  return null
}

/**
 * Generate a random state token, sign it, and return both the raw value
 * and a Set-Cookie string the caller can attach.
 */
function makeState(secret, opts) {
  const o = opts || {}
  const state = crypto.randomBytes(24).toString('hex')
  const exp = Date.now() + ((o.maxAgeSeconds || 600) * 1000)   // 10 min default
  const signed = sign({ state, exp, source: o.source || 'signup' }, secret)
  return {
    state,
    cookie: buildSetCookie('rm_meta_state', signed, {
      maxAge: o.maxAgeSeconds || 600,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax'
    })
  }
}

function readState(req, secret) {
  const raw = readCookie(req, 'rm_meta_state')
  if (!raw) return null
  return verify(raw, secret)
}

function clearStateCookie() {
  return buildSetCookie('rm_meta_state', '', { maxAge: 0, httpOnly: true, secure: true, sameSite: 'Lax' })
}

module.exports = {
  sign,
  verify,
  buildSetCookie,
  readCookie,
  makeState,
  readState,
  clearStateCookie
}
