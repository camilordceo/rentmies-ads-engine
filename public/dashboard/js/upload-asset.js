/* ─────────────────────────────────────────────────────────────
   Upload Asset Helper — single entry point used by Quick Post,
   Campaign Builder, and any future page that uploads media.

   Flow:
   - Files < 3MB: inline base64 → /api/ai?action=upload-ref (image OR video)
   - Files ≥ 3MB: signed URL → direct PUT to Supabase Storage
                 (esquiva el 4.5MB body limit de Vercel functions)

   Returns: { url, kind: 'image'|'video', path, bucket }
   Throws on failure with a descriptive message; logs to console.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i
  const INLINE_LIMIT = 3 * 1024 * 1024            // 3MB — comfortably below Vercel's 4.5MB body cap
  const SIGNED_URL_LIMIT = 250 * 1024 * 1024      // 250MB — IG Reels max

  function detectKindFromFile(file) {
    if (/^video\//i.test(file.type)) return 'video'
    if (/^image\//i.test(file.type)) return 'image'
    return VIDEO_EXT_RE.test(file.name) ? 'video' : 'image'
  }

  function detectKindFromUrl(url) {
    if (!url) return 'image'
    return VIDEO_EXT_RE.test(url) ? 'video' : 'image'
  }

  function empresaIdFromStorage() {
    try { return (JSON.parse(localStorage.getItem('sb_user') || '{}')).id || 'demo' } catch (_) { return 'demo' }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => {
        const dataUrl = String(r.result || '')
        const base64 = dataUrl.split(',')[1] || ''
        if (!base64) return reject(new Error('No se pudo leer el archivo'))
        resolve(base64)
      }
      r.onerror = () => reject(r.error || new Error('FileReader falló'))
      r.readAsDataURL(file)
    })
  }

  /**
   * Upload a file to Supabase via the safest path for its size.
   * @param {File} file - the file from <input type="file">
   * @param {Object} opts
   * @param {Function} [opts.onStatus] - callback(status: string) for UI updates
   * @returns {Promise<{url: string, kind: 'image'|'video', path?: string, bucket?: string}>}
   */
  async function uploadAsset(file, opts) {
    const onStatus = (opts && opts.onStatus) || (() => {})
    const kind = detectKindFromFile(file)
    const empresaId = empresaIdFromStorage()

    if (file.size > SIGNED_URL_LIMIT) {
      throw new Error(`Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 250MB.`)
    }

    // ── Inline path (< 3MB) ─────────────────────────────────
    if (file.size < INLINE_LIMIT) {
      onStatus(`Subiendo ${kind} (${(file.size / 1024).toFixed(0)}KB)…`)
      try {
        const base64 = await fileToBase64(file)
        const r = await fetch('/api/ai?action=upload-ref', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-empresa-id': empresaId },
          body: JSON.stringify({ data: base64, contentType: file.type, filename: file.name })
        })
        const json = await r.json().catch(() => ({}))
        if (!r.ok) {
          const msg = `${json.error || 'Upload inline falló'} ${json.detail ? '— ' + json.detail : ''}`.trim()
          console.error('[upload-asset] inline upload failed', { status: r.status, body: json })
          throw new Error(msg)
        }
        return { url: json.url, kind, path: json.path, bucket: 'ai-images' }
      } catch (err) {
        console.error('[upload-asset] inline path threw', err)
        throw err
      }
    }

    // ── Signed URL path (≥ 3MB) ─────────────────────────────
    onStatus(`Pidiendo URL firmada para ${kind} (${(file.size / 1024 / 1024).toFixed(1)}MB)…`)
    let meta
    try {
      const r1 = await fetch('/api/ai?action=video-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-empresa-id': empresaId },
        body: JSON.stringify({ filename: file.name, contentType: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg') })
      })
      meta = await r1.json().catch(() => ({}))
      if (!r1.ok) {
        const parts = [meta.error || 'Error pidiendo URL firmada']
        if (meta.detail) parts.push(meta.detail)
        if (meta.hint) parts.push('Hint: ' + meta.hint)
        const msg = parts.join(' — ')
        console.error('[upload-asset] signed URL request failed', { status: r1.status, body: meta })
        throw new Error(msg)
      }
    } catch (err) {
      console.error('[upload-asset] signed URL fetch threw', err)
      throw err
    }

    onStatus(`Subiendo ${kind} (${(file.size / 1024 / 1024).toFixed(1)}MB) directo a Supabase…`)
    try {
      const upRes = await fetch(meta.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
          'x-upsert': 'true'
        },
        body: file
      })
      if (!upRes.ok) {
        let body = ''
        try { body = await upRes.text() } catch (_) {}
        console.error('[upload-asset] signed PUT failed', { status: upRes.status, body: body.slice(0, 500) })
        throw new Error(`PUT a Supabase falló (${upRes.status}) — ${body.slice(0, 200) || 'sin cuerpo'}`)
      }
    } catch (err) {
      console.error('[upload-asset] PUT threw', err)
      throw err
    }

    onStatus(`✓ ${kind} subido`)
    return { url: meta.publicUrl, kind, path: meta.path, bucket: meta.bucket }
  }

  window.rmUploadAsset = {
    upload: uploadAsset,
    detectKindFromFile,
    detectKindFromUrl,
    INLINE_LIMIT,
    SIGNED_URL_LIMIT
  }
})()
