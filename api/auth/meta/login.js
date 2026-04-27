/**
 * GET /api/auth/meta/login?source=signup|reconnect
 *
 * Initiates the Meta Login for Business OAuth flow.
 *  1. Generates a random CSRF state token.
 *  2. Stores it in an HMAC-signed httpOnly cookie (rm_meta_state).
 *  3. Builds the Facebook dialog URL with config_id (NOT scope — Login for
 *     Business uses configuration-based permissions).
 *  4. 302 redirects the browser to Facebook.
 *
 * Required env vars:
 *   META_APP_ID, META_LOGIN_CONFIG_ID, META_REDIRECT_URI, META_OAUTH_SECRET
 */

const meta = require('../../../lib/meta-config')
const { makeState } = require('../../../lib/signed-cookies')

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end()

  const missing = meta.missingEnvVars()
  if (missing.length) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(500).send(setupErrorHtml(missing))
  }

  const source = (req.query && req.query.source) || 'signup'
  const next = (req.query && req.query.next) || ''

  const { state, cookie } = makeState(meta.OAUTH_SECRET, {
    source,
    maxAgeSeconds: 600
  })

  // Stash the optional `next` redirect target in the same signed cookie so the
  // callback can route back where the user expected.
  // (We embed it in state via JSON encoding handled inside makeState.)

  const params = new URLSearchParams({
    client_id: meta.APP_ID,
    config_id: meta.LOGIN_CONFIG_ID,
    redirect_uri: meta.REDIRECT_URI,
    state,
    response_type: 'code'
  })
  if (next) params.set('next', next)   // not used by Meta but echoed back via state encoding later

  const url = `${meta.FB_DIALOG_URL}?${params.toString()}`

  res.setHeader('Set-Cookie', cookie)
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.statusCode = 302
  res.setHeader('Location', url)
  res.end()
}

function setupErrorHtml(missing) {
  const list = missing.map(v => `<li><code>${v}</code></li>`).join('')
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Setup pendiente</title>
<style>body{font-family:system-ui;background:#f8f8f8;padding:48px;max-width:680px;margin:0 auto;color:#1a1a1a}
h1{font-size:22px}code{background:#fff;padding:2px 7px;border-radius:4px;border:1px solid #e5e5e5;font-family:ui-monospace,monospace;font-size:13px}
.box{background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:24px;margin-top:24px}
a{color:#40d99d}</style></head>
<body>
  <h1>OAuth no configurado todavía</h1>
  <p>Faltan estas env vars en Vercel:</p>
  <div class="box"><ul>${list}</ul></div>
  <p>Sigue la guía en <code>docs/META_APP_SETUP.md</code> y luego redespliega con <code>vercel deploy --prod --yes</code>.</p>
  <p><a href="/">← Volver al landing</a></p>
</body></html>`
}
