/**
 * POST /api/wizard/validate-token
 *
 * The Connect Wizard's auto-validate endpoint. Takes a System User token
 * the user just pasted in step 5 and validates it end-to-end against Meta
 * Graph BEFORE we save anything.
 *
 * Flow:
 *   1. Format check (starts with EAA, length > 100)
 *   2. /me — token works, returns the System User's name
 *   3. /me/accounts — list every page the System User has been assigned
 *   4. If 0 pages: error "no_pages" — user needs to revisit step 4
 *   5. For each page, fetch IG Business + page_access_token in parallel
 *   6. Return rich payload with page list (frontend shows a picker if >1 page)
 *
 * If only ONE page is found, it's auto-selected and returned as `page` —
 * the frontend can advance straight to the success screen.
 *
 * IMPORTANT: this endpoint does NOT persist anything. It's a read-only
 * validator. The wizard's step 6 calls /api/credentials/meta to save once
 * the user confirms the page selection.
 *
 * body: { token: "EAAxxx..." }
 *
 * Returns:
 *   { valid: true, me_name, pages: [{ id, name, picture, followers, instagram }] }
 *   { valid: false, error: 'format_invalid' | 'token_invalid' | 'permissions_missing' |
 *                          'no_pages' | 'graph_error', message, hints? }
 */

const axios = require('axios')

const META_GRAPH = 'https://graph.facebook.com/v21.0'

function fbErr (err) {
  const fb = err.response && err.response.data && err.response.data.error
  if (!fb) return { code: null, message: err.message, sub: null }
  return { code: fb.code, sub: fb.error_subcode, message: fb.error_user_msg || fb.message }
}

function hintForCode (code) {
  if (code === 190) return 'El token es inválido o fue revocado. Genera uno nuevo en Business Settings → System Users.'
  if (code === 200) return 'Faltan permisos. Regenera el token y marca TODOS los 7 permisos del paso 5.'
  if (code === 100) return 'ID inválido o sin acceso. Vuelve al paso 4 y asigna tu página al System User.'
  if (code === 10)  return 'La app Rentmies no está instalada en tu Business Manager. Vuelve al paso 2.'
  if (code === 4)   return 'Demasiadas peticiones a Meta. Espera 1 minuto y vuelve a intentar.'
  return null
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ valid: false, error: 'POST only' })

  const { token } = req.body || {}
  const t = String(token || '').trim()

  // 1. Format check ─────────────────────────────────────────────
  if (!t) {
    return res.json({ valid: false, error: 'format_invalid', message: 'Pega tu token primero.' })
  }
  if (!t.startsWith('EAA')) {
    return res.json({
      valid: false,
      error: 'format_invalid',
      message: 'Un token de Meta empieza con "EAA". Revisa que copiaste el correcto.'
    })
  }
  if (t.length < 100) {
    return res.json({
      valid: false,
      error: 'format_invalid',
      message: 'El token se ve incompleto. Vuelve a copiarlo desde Meta — debe tener más de 100 caracteres.'
    })
  }

  // 2. /me ─────────────────────────────────────────────────────
  let meName = null, meId = null
  try {
    const { data } = await axios.get(`${META_GRAPH}/me`, {
      params: { access_token: t, fields: 'id,name' },
      timeout: 8000
    })
    meName = data.name || null
    meId = data.id || null
  } catch (err) {
    const e = fbErr(err)
    let errKey = 'token_invalid'
    if (e.code === 200) errKey = 'permissions_missing'
    return res.json({
      valid: false,
      error: errKey,
      message: hintForCode(e.code) || ('No pude validar el token: ' + e.message),
      meta_code: e.code,
      detail: e.message
    })
  }

  // 3. /me/accounts — pages ────────────────────────────────────
  let pages = []
  try {
    const { data } = await axios.get(`${META_GRAPH}/me/accounts`, {
      params: {
        access_token: t,
        fields: 'id,name,access_token,fan_count,picture{url},category,instagram_business_account,tasks',
        limit: 100
      },
      timeout: 10000
    })
    pages = (data.data || []).map(p => ({
      id: p.id,
      name: p.name,
      page_access_token: p.access_token,
      followers: p.fan_count || 0,
      picture: p.picture && p.picture.data ? p.picture.data.url : null,
      category: p.category || null,
      tasks: p.tasks || [],
      ig_id: p.instagram_business_account ? p.instagram_business_account.id : null
    }))
  } catch (err) {
    const e = fbErr(err)
    return res.json({
      valid: false,
      error: 'graph_error',
      message: hintForCode(e.code) || ('No pude leer tus páginas: ' + e.message),
      meta_code: e.code,
      detail: e.message
    })
  }

  if (pages.length === 0) {
    return res.json({
      valid: false,
      error: 'no_pages',
      message: 'El System User no tiene acceso a ninguna página. Vuelve al paso 4 y asigna tu Página de Facebook como asset (con permiso Full control).'
    })
  }

  // 4. Enrich with IG details (parallel) ─────────────────────────
  const igEnrich = await Promise.all(pages.map(async page => {
    if (!page.ig_id) return null
    try {
      const { data } = await axios.get(`${META_GRAPH}/${page.ig_id}`, {
        params: { access_token: t, fields: 'id,username,profile_picture_url,followers_count,media_count' },
        timeout: 6000
      })
      return {
        id: data.id,
        username: data.username,
        profile_picture_url: data.profile_picture_url,
        followers: data.followers_count || 0,
        media_count: data.media_count || 0
      }
    } catch (_) {
      return null
    }
  }))
  pages.forEach((p, i) => { p.instagram = igEnrich[i] })

  return res.json({
    valid: true,
    me_name: meName,
    me_id: meId,
    pages,
    page: pages.length === 1 ? pages[0] : null
  })
}
