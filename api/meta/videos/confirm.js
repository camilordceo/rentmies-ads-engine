/**
 * POST /api/meta/videos/confirm
 *   Registers a video in media_videos AFTER the client has uploaded
 *   it via the existing /api/ai?action=video-upload-url signed URL
 *   flow. The client extracts metadata client-side from a
 *   <video> element and POSTs the result here.
 *
 * Body:
 *   {
 *     storage_path: 'empresa_id/uuid.mp4',
 *     source_url:   'https://.../videos-upload/...',
 *     title:        'Tour Penthouse Calle 93',
 *     description?: '...',
 *     tags?: ['penthouse', 'bogota'],
 *     inventario_id?: uuid,
 *     duration_sec: 12.4,
 *     width:  1080,
 *     height: 1920,
 *     file_size_bytes: 4_200_000,
 *     mime_type: 'video/mp4'
 *   }
 *
 * Computes platform compatibility from width/height + duration
 * (Meta's published rules — see comments in compat()).
 *
 * Response: the saved media_videos row.
 */

const { getServiceClient, authedEmpresa, cors } = require('../../_lib/auth')

module.exports = async (req, res) => {
  cors(res, 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const sb = getServiceClient()
  if (!sb) return res.status(503).json({ error: 'Supabase no configurado' })

  const auth = await authedEmpresa(req, sb)
  if (auth.error) return res.status(auth.status).json({ error: auth.error })

  const b = req.body || {}
  if (!b.storage_path)  return res.status(400).json({ error: 'storage_path requerido' })
  if (!b.source_url)    return res.status(400).json({ error: 'source_url requerido' })
  if (!b.title)         return res.status(400).json({ error: 'title requerido' })

  const w = Number(b.width)  || 0
  const h = Number(b.height) || 0
  const dur = Number(b.duration_sec) || 0

  const { aspect, orientation } = computeAspect(w, h)
  const compat = computeCompat(aspect, dur)

  const row = {
    empresa_id: auth.empresaId,
    inventario_id: b.inventario_id || null,
    title: String(b.title).slice(0, 200),
    description: b.description ? String(b.description).slice(0, 2000) : null,
    tags: Array.isArray(b.tags) ? b.tags.filter(Boolean).slice(0, 20).map(String) : [],
    storage_bucket: b.storage_bucket || 'videos-upload',
    storage_path: b.storage_path,
    source_url: b.source_url,
    thumbnail_url: b.thumbnail_url || null,
    duration_sec: dur || null,
    width: w || null,
    height: h || null,
    aspect_ratio: aspect,
    orientation,
    file_size_bytes: b.file_size_bytes ? Number(b.file_size_bytes) : null,
    mime_type: b.mime_type || 'video/mp4',
    ...compat,
    status: 'ready',
    created_by_user_id: auth.userId === auth.empresaId ? null : auth.userId
  }

  try {
    const { data, error } = await sb.from('media_videos').insert(row).select('*').single()
    if (error) {
      if (error.code === '42P01') return res.status(503).json({ error: 'Tablas no inicializadas', hint: 'Run schema-videos-bloque4.sql' })
      throw error
    }
    return res.json({ ok: true, video: data })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// ─── Aspect ratio classification ─────────────────────────
function computeAspect (w, h) {
  if (!w || !h) return { aspect: 'unknown', orientation: 'unknown' }
  const r = w / h
  // Tolerance: a 1080×1920 video has r=0.5625; a 1080×1080 video has r=1.0
  if (Math.abs(r - 9/16) < 0.05) return { aspect: '9:16',  orientation: 'vertical'   }
  if (Math.abs(r - 1)     < 0.05) return { aspect: '1:1',   orientation: 'square'     }
  if (Math.abs(r - 4/5)   < 0.05) return { aspect: '4:5',   orientation: 'vertical'   }
  if (Math.abs(r - 16/9)  < 0.05) return { aspect: '16:9',  orientation: 'horizontal' }
  if (r < 1) return { aspect: 'vertical-other',   orientation: 'vertical'   }
  if (r > 1) return { aspect: 'horizontal-other', orientation: 'horizontal' }
  return { aspect: 'square-other', orientation: 'square' }
}

// Meta's published placement rules (current as of 2026):
//   IG Feed:    1:1 or 4:5, ≤ 60s recommended (technically up to 15min)
//   IG Reels:   9:16, 3-90s
//   IG Stories: 9:16, ≤ 60s
//   FB Feed:    16:9 / 1:1 / 4:5, ≤ 240min
//   FB Reels:   9:16, 3-90s
//   TikTok:     9:16, 3-180s (varies)
function computeCompat (aspect, durSec) {
  const v9_16  = aspect === '9:16'  || aspect === 'vertical-other'
  const v1_1   = aspect === '1:1'
  const v4_5   = aspect === '4:5'
  const v16_9  = aspect === '16:9'  || aspect === 'horizontal-other'
  return {
    compat_ig_feed:    (v1_1 || v4_5)            && durSec >= 3 && durSec <= 60,
    compat_ig_reels:   v9_16                     && durSec >= 3 && durSec <= 90,
    compat_ig_stories: v9_16                     && durSec >= 1 && durSec <= 60,
    compat_fb_feed:    (v16_9 || v1_1 || v4_5)   && durSec >= 1 && durSec <= 14400,
    compat_fb_reels:   v9_16                     && durSec >= 3 && durSec <= 90,
    compat_tiktok:     v9_16                     && durSec >= 3 && durSec <= 180
  }
}
