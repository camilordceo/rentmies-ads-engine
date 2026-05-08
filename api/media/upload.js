/**
 * POST /api/media/upload
 *      Authorization: Bearer <supabase_jwt>  (or x-empresa-id for demo)
 *      Content-Type: application/json
 *      body: { data: <base64>, contentType: 'image/jpeg', filename: 'foo.jpg' }
 *
 * NOTE on multipart vs base64:
 *   Vercel serverless functions have a 4.5MB body limit. For larger files
 *   the dashboard uses /api/ai?action=video-upload-url to get a signed URL
 *   and PUTs directly to Supabase Storage. This endpoint handles the small
 *   path (≤ 4MB) via base64 — same shape as /api/ai?action=upload-ref so
 *   the rmUploadAsset helper just works.
 *
 * Storage:
 *   bucket: "media" (must be PUBLIC — see docs/VERCEL_SETUP.md)
 *   path:   {empresa_id}/{uuid}-{filename}
 *
 * Validation:
 *   - jpg / jpeg / png / webp / mp4
 *   - 16MB max for images, 100MB for video (enforced server-side; the
 *     base64 path will only ever see ≤ 4MB before Vercel rejects)
 */

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const BUCKET = 'media'
const ALLOWED_TYPES = {
  'image/jpeg': { ext: 'jpg', max: 16 * 1024 * 1024, kind: 'image' },
  'image/jpg':  { ext: 'jpg', max: 16 * 1024 * 1024, kind: 'image' },
  'image/png':  { ext: 'png', max: 16 * 1024 * 1024, kind: 'image' },
  'image/webp': { ext: 'webp', max: 16 * 1024 * 1024, kind: 'image' },
  'video/mp4':  { ext: 'mp4', max: 100 * 1024 * 1024, kind: 'video' },
  'video/quicktime': { ext: 'mov', max: 100 * 1024 * 1024, kind: 'video' },
  'video/webm': { ext: 'webm', max: 100 * 1024 * 1024, kind: 'video' }
}

function getServiceClient () {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

async function authedEmpresa (req, sb) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) {
    const empresaId = req.headers['x-empresa-id']
    if (empresaId) return { empresaId, demo: true }
    return { error: 'No token', status: 401 }
  }
  if (token.startsWith('demo_')) {
    return { empresaId: req.headers['x-empresa-id'] || 'demo', demo: true }
  }
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data || !data.user) return { error: 'Token inválido', status: 401 }
  const { data: profile } = await sb.from('profiles').select('empresa_id').eq('id', data.user.id).maybeSingle()
  return { empresaId: (profile && profile.empresa_id) || data.user.id }
}

async function ensureBucket (sb) {
  try {
    const { data: existing } = await sb.storage.getBucket(BUCKET)
    if (existing) return
  } catch (_) {}
  try {
    await sb.storage.createBucket(BUCKET, { public: true })
  } catch (_) {
    // Ignore — likely race or already exists
  }
}

function safeFilename (name) {
  return String(name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-empresa-id')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado en el servidor' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const { data, contentType, filename } = req.body || {}
  if (!data) return res.status(400).json({ error: 'data (base64) es requerido' })
  if (!contentType) return res.status(400).json({ error: 'contentType es requerido' })

  const spec = ALLOWED_TYPES[contentType.toLowerCase()]
  if (!spec) return res.status(400).json({ error: `Tipo no permitido: ${contentType}. Acepto JPG, PNG, WEBP, MP4, MOV, WEBM.` })

  let buf
  try { buf = Buffer.from(data, 'base64') }
  catch (e) { return res.status(400).json({ error: 'base64 inválido' }) }
  if (buf.length > spec.max) {
    return res.status(413).json({ error: `Archivo excede el máximo permitido (${(spec.max/1024/1024).toFixed(0)}MB para ${spec.kind}). Usa el flujo de URL firmada.` })
  }

  await ensureBucket(sb)

  const id = crypto.randomBytes(8).toString('hex')
  const cleanName = safeFilename(filename || `upload.${spec.ext}`)
  const path = `${auth.empresaId}/${id}-${cleanName}`

  try {
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, {
      contentType,
      upsert: false
    })
    if (upErr) return res.status(500).json({ error: 'Upload falló: ' + upErr.message })
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
    if (!pub || !pub.publicUrl) return res.status(500).json({ error: 'No se pudo obtener URL pública' })
    return res.json({
      success: true,
      url: pub.publicUrl,
      path,
      bucket: BUCKET,
      size: buf.length,
      contentType,
      kind: spec.kind,
      filename: cleanName
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
