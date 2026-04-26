/* ─────────────────────────────────────────────────────────────
   Persistence — Supabase first, localStorage always.
   Hands the wizard's payload to /api/credentials? No, to a new
   /api/campaigns endpoint with action=create. If the endpoint
   isn't configured (Supabase missing), persists the draft to
   localStorage 'rm_campaign_drafts' with status=draft and
   surfaces a yellow warning toast so the user knows it didn't
   reach the server.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const LOCAL_KEY = 'rm_campaign_drafts'

  function appendLocal(payload) {
    let list = []
    try { list = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') } catch (_) {}
    list.unshift({ ...payload, id: 'local_' + Date.now(), saved_at: new Date().toISOString() })
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 50)))   // cap at 50 drafts
    return list[0]
  }

  async function persistCampaign(payload) {
    // payload merges wizard local state + studio store snapshot
    const empresaId = (function () {
      try {
        const u = JSON.parse(localStorage.getItem('sb_user') || '{}')
        return u.id || 'demo'
      } catch (_) { return 'demo' }
    })()

    const body = {
      name: payload.propertyName || 'Campaña sin nombre',
      status: 'draft',
      ciudad: payload.location || null,
      tipo_inmueble: payload.propertyTipo || 'villa',
      prompt_config: {
        description: payload.description || '',
        price: payload.price || '',
        location: payload.location || '',
        angles: payload.angles || {},
        photo_count: (payload.photos || []).filter(p => !p.isPlaceholder).length,
        // Don't ship full base64 photos to the server — just count + first URL.
        photo_first: (payload.photos || []).find(p => !p.isPlaceholder && p.url && !p.url.startsWith('data:'))?.url || null
      },
      platforms: payload.channels || [],
      budget: {
        daily: payload.daily_budget,
        total: payload.total_budget,
        duration_days: payload.duration_days,
        currency: 'COP'
      },
      schedule: {
        when: payload.schedule,
        custom_date: payload.custom_date || null
      },
      empresa_id: empresaId,
      source: 'creative_studio'
    }

    // Always save locally first — guarantees the user never loses a draft.
    const local = appendLocal(body)

    // Try server. /api/campaigns?action=create doesn't exist yet — when we
    // add it, this block lights up automatically. For now expect a 404.
    try {
      const r = await fetch('/api/campaigns?action=create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-empresa-id': empresaId
        },
        body: JSON.stringify(body)
      })
      const text = await r.text()
      let data = {}
      try { data = JSON.parse(text) } catch (_) { data = {} }

      if (r.ok && data.id) {
        if (window.rmToast) window.rmToast('✓ Campaña creada — Camilord está generando los creativos', 'success')
        // Wizard wipes the studio draft so the next "Lanzar" starts clean.
        // Keep it for now — user might want to iterate on the same property.
        return { id: data.id, persisted: 'server' }
      }

      // Server endpoint missing or rejected — still keep the local draft.
      if (window.rmToast) {
        window.rmToast(
          'Borrador guardado localmente. El endpoint /api/campaigns aún no está activo en este entorno.',
          'info',
          { duration: 6000 }
        )
      }
      return { id: local.id, persisted: 'local', warning: 'server endpoint missing' }
    } catch (err) {
      if (window.rmToast) {
        window.rmToast('Borrador guardado localmente · ' + err.message, 'info')
      }
      return { id: local.id, persisted: 'local', warning: err.message }
    }
  }

  window.rmPersistCampaign = persistCampaign
})()
