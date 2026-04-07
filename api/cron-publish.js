/**
 * RENTMIES — MARKETER REAL: CRON PUBLISHER
 * GET /api/cron-publish
 *
 * Ejecutado diariamente por Vercel Cron Jobs a las 8:55am Colombia (13:55 UTC).
 * Busca posts en Supabase con status='scheduled' y scheduled_at <= hoy,
 * luego los publica en Instagram.
 *
 * Configurado en vercel.json:
 *   { "crons": [{ "path": "/api/cron-publish", "schedule": "55 13 * * *" }] }
 */

const https    = require('https')
const supabase = require('../lib/supabase')

function graphPost(path, accessToken, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const opts = {
      hostname: 'graph.facebook.com',
      path:     `/v21.0${path}?access_token=${encodeURIComponent(accessToken)}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }
    const req = https.request(opts, r => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) return reject(new Error(`Meta: ${json.error.message} (${json.error.code})`))
          resolve(json)
        } catch(e) { reject(new Error('Non-JSON: ' + data.slice(0, 100))) }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function graphGet(path, accessToken) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'graph.facebook.com',
      path:     `/v21.0${path}&access_token=${encodeURIComponent(accessToken)}`,
      method:   'GET',
    }
    const req = https.request(opts, r => {
      let data = ''
      r.on('data', c => data += c)
      r.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch(e) { reject(new Error('Non-JSON: ' + data.slice(0, 100))) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

async function publishImageToInstagram(igAccountId, accessToken, imageUrl, caption) {
  // 1. Create container
  const params = new URLSearchParams({ image_url: imageUrl, caption, access_token: accessToken })
  const container = await new Promise((resolve, reject) => {
    const url = new URL(`https://graph.facebook.com/v21.0/${igAccountId}/media?${params}`)
    const opts = { hostname: url.hostname, path: url.pathname + url.search, method: 'POST' }
    const req = https.request(opts, r => {
      let d = ''
      r.on('data', c => d += c)
      r.on('end', () => {
        try {
          const j = JSON.parse(d)
          if (j.error) return reject(new Error(j.error.message))
          resolve(j)
        } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.end()
  })

  const creationId = container.id

  // 2. Poll for FINISHED
  await new Promise(r => setTimeout(r, 4000))
  for (let i = 0; i < 5; i++) {
    const status = await graphGet(`/${creationId}?fields=status_code`, accessToken)
    if (status.status_code === 'FINISHED') break
    if (status.status_code === 'ERROR') throw new Error('Container error')
    if (i === 4) throw new Error('Container timeout')
    await new Promise(r => setTimeout(r, 4000))
  }

  // 3. Publish
  const publish = await new Promise((resolve, reject) => {
    const params2 = new URLSearchParams({ creation_id: creationId, access_token: accessToken })
    const url = new URL(`https://graph.facebook.com/v21.0/${igAccountId}/media_publish?${params2}`)
    const opts = { hostname: url.hostname, path: url.pathname + url.search, method: 'POST' }
    const req = https.request(opts, r => {
      let d = ''
      r.on('data', c => d += c)
      r.on('end', () => {
        try {
          const j = JSON.parse(d)
          if (j.error) return reject(new Error(j.error.message))
          resolve(j)
        } catch(e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.end()
  })

  return publish.id
}

module.exports = async (req, res) => {
  // Solo GET para Vercel Cron
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  if (!supabase) {
    return res.status(200).json({ message: 'Supabase no configurado. No hay posts que publicar.' })
  }

  try {
    const now = new Date().toISOString()

    // Buscar posts programados para hoy o antes
    const { data: posts, error } = await supabase
      .from('social_posts')
      .select('*')
      .eq('status', 'scheduled')
      .eq('platform', 'instagram')
      .lte("meta->>'scheduled_at'", now)
      .limit(10) // max 10 por ejecución para no superar timeout

    if (error) throw new Error(error.message)
    if (!posts || posts.length === 0) {
      return res.status(200).json({ message: 'No hay posts para publicar hoy.', published: 0 })
    }

    const results = []

    for (const post of posts) {
      const igAccountId = post.meta?.ig_account || process.env.META_IG_ACCOUNT_ID
      const accessToken = process.env.META_ACCESS_TOKEN

      if (!igAccountId || !accessToken || !post.media_url) {
        await supabase.from('social_posts').update({
          status:        'failed',
          error_message: 'Faltan credenciales o imagen',
        }).eq('id', post.id)
        results.push({ id: post.id, status: 'failed', reason: 'missing credentials or image' })
        continue
      }

      try {
        const mediaId = await publishImageToInstagram(igAccountId, accessToken, post.media_url, post.caption)
        await supabase.from('social_posts').update({
          status:       'published',
          post_id:      mediaId,
          published_at: new Date().toISOString(),
        }).eq('id', post.id)
        results.push({ id: post.id, status: 'published', mediaId })
      } catch (err) {
        await supabase.from('social_posts').update({
          status:        'failed',
          error_message: err.message,
        }).eq('id', post.id)
        results.push({ id: post.id, status: 'failed', reason: err.message })
      }
    }

    const published = results.filter(r => r.status === 'published').length
    return res.status(200).json({ success: true, published, failed: results.length - published, results })

  } catch (err) {
    console.error('[cron-publish] Error:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}
