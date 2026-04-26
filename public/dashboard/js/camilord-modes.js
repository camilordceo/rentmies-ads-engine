/* ─────────────────────────────────────────────────────────────
   Camilord modes — swaps the panel's content based on which page
   the user is on. Studio mode lives in camilord-brain.js. Dashboard,
   History, and Analytics modes live here.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  function panelEl() { return document.querySelector('.ae-camilord') }

  // ── Templates ──────────────────────────────────────────────

  const STUDIO_TEMPLATE = `
    <div class="ae-cam-header">
      <div>
        <div class="ae-cam-title">
          <span class="ae-live-dot"></span>
          Camilord AI
        </div>
        <div class="ae-cam-status">Listo para asistir</div>
      </div>
      <button class="ae-cam-close" aria-label="Cerrar copiloto">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="ae-cam-quote"><p data-current="">Estoy listo. Dame un inmueble y armo la campaña completa.</p></div>
    <div class="ae-cam-section">Sugerencias de hoy</div>
    <div class="ae-cam-suggestions"></div>
    <div class="ae-cam-spacer"></div>
    <div class="ae-cam-chat">
      <div class="ae-cam-chat-row">
        <input type="text" placeholder="Pregunta a Camilord...">
        <button class="ae-cam-chat-send" aria-label="Enviar">
          <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `

  const DASHBOARD_TEMPLATE = `
    <div class="ae-cam-hero">
      <svg viewBox="0 0 24 24"><polygon points="12 2 15 9 22 10 17 15 18 22 12 19 6 22 7 15 2 10 9 9 12 2"/></svg>
    </div>
    <h2 class="ae-cam-bigtitle">Camilord AI Insights</h2>
    <div class="ae-cam-bigsub">Contextual Optimization</div>

    <div class="ae-cam-insight">
      💡 Tu post de TikTok tiene un <strong>15% más</strong> de probabilidad de éxito a las <em>7 PM</em>. Mover la programación de las 19:00 → 19:00 hora pico local.
      <br>
      <button class="ae-cam-cta" data-action="apply-time">APLICAR CAMBIO →</button>
    </div>

    <div class="ae-cam-section">Feedback en vivo</div>
    <div class="ae-cam-feedback">
      <div class="ae-cam-feedback-item done">
        <div class="ae-cam-feedback-title">✓ Instagram optimizado</div>
        <div class="ae-cam-feedback-sub">Copy actualizado con keywords de alta conversión para zona Norte.</div>
      </div>
      <div class="ae-cam-feedback-item pending">
        <div class="ae-cam-feedback-title">🕐 Revisión pendiente: TikTok</div>
        <div class="ae-cam-feedback-sub">Faltan tags de ubicación para mejorar alcance orgánico.</div>
      </div>
      <div class="ae-cam-feedback-item done">
        <div class="ae-cam-feedback-title">✓ Bid auto-ajustado</div>
        <div class="ae-cam-feedback-sub">Subí el CPC max +12% en horario estelar para los 3 ads top.</div>
      </div>
    </div>

    <div class="ae-cam-spacer"></div>

    <div class="ae-cam-chat">
      <div class="ae-cam-chat-row">
        <input type="text" placeholder="Pregunta a Camilord...">
        <button class="ae-cam-chat-send" aria-label="Enviar">
          <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `

  const HISTORY_TEMPLATE = `
    <div class="ae-cam-hero">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    </div>
    <h2 class="ae-cam-bigtitle">Decision Log</h2>
    <div class="ae-cam-bigsub">Auditable · Reversible</div>

    <div class="ae-cam-insight">
      Cada acción que tomo queda registrada con su métrica gatillo. Puedes revertir cualquier decisión desde el detalle de la fila.
    </div>

    <div class="ae-cam-section">Decisiones de hoy</div>
    <div class="ae-cam-feedback">
      <div class="ae-cam-feedback-item done">
        <div class="ae-cam-feedback-title">12 generaciones</div>
        <div class="ae-cam-feedback-sub">Headlines, copy variations y carruseles para 3 propiedades activas.</div>
      </div>
      <div class="ae-cam-feedback-item done">
        <div class="ae-cam-feedback-title">4 publicaciones</div>
        <div class="ae-cam-feedback-sub">Meta Feed e Instagram Stories. CTR promedio inicial 3.2%.</div>
      </div>
      <div class="ae-cam-feedback-item pending">
        <div class="ae-cam-feedback-title">1 pausa</div>
        <div class="ae-cam-feedback-sub">'Pain Point' en Marbella, CTR bajo 0.4%. Te recomiendo testear 'Estatus' en su lugar.</div>
      </div>
    </div>

    <div class="ae-cam-spacer"></div>
  `

  const ANALYTICS_TEMPLATE = `
    <div class="ae-cam-hero">
      <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
    </div>
    <h2 class="ae-cam-bigtitle">Performance Insights</h2>
    <div class="ae-cam-bigsub">7 días</div>

    <div class="ae-cam-insight">
      📈 Tu CTR subió <strong>+0.6 pts</strong> esta semana. El driver principal: el ángulo <em>Estatus</em> en Marbella, que pasó de 1.8% → 4.4%.
      <br>
      <button class="ae-cam-cta" data-action="duplicate-winner">DUPLICAR LO QUE FUNCIONA →</button>
    </div>

    <div class="ae-cam-section">Aprendizajes</div>
    <div class="ae-cam-feedback">
      <div class="ae-cam-feedback-item done">
        <div class="ae-cam-feedback-title">Hora pico: 6-8pm</div>
        <div class="ae-cam-feedback-sub">+34% engagement en este window. Programando ahí por defecto.</div>
      </div>
      <div class="ae-cam-feedback-item done">
        <div class="ae-cam-feedback-title">Meta &gt; TikTok esta semana</div>
        <div class="ae-cam-feedback-sub">CPL en Meta Feed €18 vs. TikTok €31. Reasignando budget.</div>
      </div>
    </div>

    <div class="ae-cam-spacer"></div>
  `

  // ── Mode swap ──────────────────────────────────────────────

  let currentMode = null

  function setMode(page) {
    const panel = panelEl()
    if (!panel) return
    if (page === currentMode) return
    currentMode = page

    // Studio mode lets camilord-brain.js do its dynamic thing
    if (page === 'studio') {
      panel.innerHTML = STUDIO_TEMPLATE
      // Trigger a store-emission so camilord-brain re-applies its quote/suggestions
      window.rmStore?.set({})
      return
    }

    if (page === 'dashboard') panel.innerHTML = DASHBOARD_TEMPLATE
    else if (page === 'history')   panel.innerHTML = HISTORY_TEMPLATE
    else if (page === 'analytics') panel.innerHTML = ANALYTICS_TEMPLATE
    else if (page === 'quickpost') panel.innerHTML = QUICKPOST_TEMPLATE
    else if (page === 'schedule')  panel.innerHTML = SCHEDULE_TEMPLATE
    else if (page === 'inmuebles') panel.innerHTML = INMUEBLES_TEMPLATE
    else if (page === 'whatsapp')  panel.innerHTML = WHATSAPP_TEMPLATE
    else if (page === 'settings')  panel.innerHTML = SETTINGS_TEMPLATE
  }

  const QUICKPOST_TEMPLATE = `
    <div class="ae-cam-hero"><svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div>
    <h2 class="ae-cam-bigtitle">Quick Post</h2>
    <div class="ae-cam-bigsub">Publicar orgánico</div>
    <div class="ae-cam-quote"><p><em>Toma una foto cualquiera, dame un caption, y publico.</em> Sin pauta requerida — la pauta paga llega cuando estés listo.</p></div>
    <div class="ae-cam-section">Tips</div>
    <div class="ae-cam-suggestions">
      <div class="ae-cam-suggestion"><span>IG necesita imagen 1:1 ó 4:5</span></div>
      <div class="ae-cam-suggestion action"><span>Configura tus credenciales primero</span></div>
    </div>
    <div class="ae-cam-spacer"></div>
  `

  const SCHEDULE_TEMPLATE = `
    <div class="ae-cam-hero"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg></div>
    <h2 class="ae-cam-bigtitle">Programador</h2>
    <div class="ae-cam-bigsub">Cliente-side · setTimeout</div>
    <div class="ae-cam-quote"><p>Mantén la pestaña abierta. Cuando llegue la hora, disparo el POST a Graph automáticamente. Para programación robusta a largo plazo, viene el cron server-side.</p></div>
    <div class="ae-cam-spacer"></div>
  `

  const INMUEBLES_TEMPLATE = `
    <div class="ae-cam-hero"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
    <h2 class="ae-cam-bigtitle">Tu Inventario</h2>
    <div class="ae-cam-bigsub">Catálogo activo</div>
    <div class="ae-cam-quote"><p>Click en cualquier inmueble para publicarlo. Si todavía no has importado tu catálogo, te muestro 5 propiedades de muestra para que pruebes el flow.</p></div>
    <div class="ae-cam-spacer"></div>
  `

  const WHATSAPP_TEMPLATE = `
    <div class="ae-cam-hero"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></div>
    <h2 class="ae-cam-bigtitle">WhatsApp Business</h2>
    <div class="ae-cam-bigsub">Templates aprobados</div>
    <div class="ae-cam-quote"><p>Trae tus templates desde Meta Graph en vivo. Necesitas WABA ID en Settings.</p></div>
    <div class="ae-cam-spacer"></div>
  `

  const SETTINGS_TEMPLATE = `
    <div class="ae-cam-hero"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06"/></svg></div>
    <h2 class="ae-cam-bigtitle">Credenciales</h2>
    <div class="ae-cam-bigsub">Tus llaves, tu control</div>
    <div class="ae-cam-quote"><p>Las credenciales se guardan en este navegador (localStorage). Si las quieres en servidor, configura SUPABASE_URL + SERVICE_KEY en Vercel.</p></div>
    <div class="ae-cam-spacer"></div>
  `

  document.addEventListener('rm-page-change', e => setMode(e.detail.page))
  document.addEventListener('DOMContentLoaded', () => setMode(window.rmRouter?.currentPage() || 'studio'))
})()
