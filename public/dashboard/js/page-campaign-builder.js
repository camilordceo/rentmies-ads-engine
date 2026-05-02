/* ─────────────────────────────────────────────────────────────
   Campaigns page — Rentmies Prime
   Two views with tab toggle:
   - Smart: conversational UI + targeting + budget slider + Live Previews
   - Advanced: calendar schedule + asset upload + AI Studio Lab
   Mounts on section[data-page="schedule"].
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const SCHED_KEY = 'rm_scheduled_posts'

  let view = 'smart'   // 'smart' | 'advanced'
  let budget = 450
  let audienceTags = ['HNWI Segment', 'Real Estate Investors']

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  }

  // ─────────────────────────────────────────────────────────────
  // Smart Campaign Creator
  // ─────────────────────────────────────────────────────────────

  function smartHtml() {
    return `
      <div class="rp-page rp-rise">
        <div class="rp-page-header" style="text-align:center; margin-bottom:32px;">
          <span class="rp-ai-badge" style="margin-bottom:16px;">Powered by Camilo AI</span>
          <h1 class="rp-display hero" style="text-align:center; max-width:none;">
            Smart <em>Campaign</em> Creator
          </h1>
          <p class="rp-subhead" style="margin: 0 auto;">Habla con Camilo en lenguaje natural y ella arma la campaña completa — copy, imagen, audiencia y horario óptimos para Bogotá, Medellín y Cali.</p>
        </div>

        <!-- View toggle -->
        ${viewToggleHtml()}

        <div class="rp-creator-grid">
          <div class="rp-creator-main">

            <!-- Conversational chat -->
            <div class="rp-chat-thread">
              <div class="rp-chat-bubble user">
                Lanzar campaña en Bogotá para los penthouses de Calle 93, Rosales y Santa Bárbara · presupuesto $450 esta semana.
              </div>
              <div class="rp-chat-ai">
                <div class="rp-chat-ai-icon">
                  <svg viewBox="0 0 24 24" fill="white"><path d="M12 2 L13.8 8.2 L20 10 L13.8 11.8 L12 18 L10.2 11.8 L4 10 L10.2 8.2 Z"/></svg>
                </div>
                <div class="rp-chat-ai-body">
                  <p>He analizado tu inventario en Bogotá. Generé <strong>3 anuncios de alta conversión</strong> para Meta e Instagram con los penthouses de <em>Calle 93, Rosales y Santa Bárbara</em>. Listas para lanzar en <strong>4.2k - 12k</strong> compradores premium 24-45.</p>
                  <p style="margin-top:12px;">¿Confirmas el lanzamiento o prefieres ajustar algo antes?</p>
                </div>
              </div>
            </div>

            <!-- Targeting + budget cards -->
            <div class="rp-creator-cards">
              <div class="rp-card">
                <div class="rp-eyebrow">TARGETING & REACH</div>
                <div class="rp-card-title" style="font-size:16px;">Bogotá Metro Area</div>
                <div class="rp-card-subtitle" style="font-size:13px; margin-bottom:16px;">4.2k – 12k potential buyers</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                  ${audienceTags.map(tag => `
                    <span class="rp-chip active">${escapeHtml(tag)} <span style="margin-left:4px; opacity:0.7;">×</span></span>
                  `).join('')}
                  <button class="rp-chip" id="rp-add-audience">+ Add segment</button>
                </div>
              </div>

              <div class="rp-card">
                <div class="rp-eyebrow">BUDGET SETTING</div>
                <div style="display:flex; align-items:baseline; gap:6px; margin: 4px 0 12px;">
                  <span class="rp-budget-amount" id="rp-budget-amount">$${budget}</span>
                  <span style="font-size:14px; color:var(--rp-muted);">/ total week</span>
                </div>
                <input type="range" min="100" max="5000" step="50" value="${budget}" id="rp-budget-slider" class="rp-slider">
                <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:11px; font-weight:700; letter-spacing:0.1em; color:var(--rp-muted);">
                  <span>MIN $100</span>
                  <span>MAX $5000</span>
                </div>
              </div>
            </div>

            <!-- CTA -->
            <div class="rp-creator-actions">
              <button class="rp-btn-primary rp-btn-block" id="rp-confirm-launch" style="font-size:15px; padding:18px 32px; min-height:auto;">
                Confirm &amp; Launch Campaign ✦
              </button>
              <button class="rp-btn-secondary" id="rp-edit-copies" style="font-size:15px; padding:18px 32px; min-height:auto;">
                Edit All Copies
              </button>
            </div>
          </div>

          <!-- Live previews -->
          <aside class="rp-creator-aside">
            <div class="rp-eyebrow" style="display:flex; align-items:center; gap:6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              LIVE PREVIEWS
            </div>

            <div class="rp-phone-card">
              <div class="rp-phone-head">
                <div class="rp-phone-avatar"></div>
                <div style="flex:1; min-width:0;">
                  <div class="rp-phone-username">rentmies_prime</div>
                  <div class="rp-phone-loc">Bogotá, Colombia</div>
                </div>
                <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="#888" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
              </div>
              <div class="rp-phone-img" style="background-image: url('https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&h=600&fit=crop')"></div>
              <div class="rp-phone-actions">
                <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </div>
              <div class="rp-phone-caption">
                <strong>rentmies_prime</strong> Penthouse en Calle 93, Bogotá. Vista 360° desde la terraza, acabados premium, doble altura.
                <span style="color: var(--rp-teal);">#bogota #penthouse #rentmies</span>
              </div>
            </div>

            <div class="rp-card" style="padding:18px;">
              <div class="rp-eyebrow" style="margin-bottom:8px;">FACEBOOK PLACEMENT</div>
              <div style="font-size:14px; font-weight:600; color: var(--rp-ink);">Bogotá Metro · Feed</div>
              <div style="font-size:13px; color: var(--rp-muted); margin-top:4px;">Estimated impressions: <strong style="color: var(--rp-ink);">8.4k</strong></div>
            </div>
          </aside>
        </div>
      </div>
    `
  }

  // ─────────────────────────────────────────────────────────────
  // Advanced Campaign Planner
  // ─────────────────────────────────────────────────────────────

  function advancedHtml() {
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    const today = new Date()
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))

    const sampleEvents = [
      { day: 1, label: 'Facebook Feed Beach...', kind: 'fb' },
      { day: 2, label: 'Instagram Reel Drone Fl...', kind: 'ig' },
      { day: 4, label: 'Carrusel Penthouse 93', kind: 'ig' },
      { day: 5, label: 'Reel Castelo Medellín', kind: 'ig' },
      { day: 6, label: 'Story Rosales 2BR', kind: 'ig' }
    ]

    return `
      <div class="rp-page rp-rise">
        <div class="rp-page-header">
          <span class="rp-eyebrow">REAL ESTATE MARKETING CLOUD</span>
          <h1 class="rp-display">Advanced Campaign Planner</h1>
          <p class="rp-subhead">Orchestrate your high-end property launches with <strong>cinematic precision</strong> y AI-driven distribution strategies.</p>
          <div style="display:flex; gap:12px; margin-top:24px;">
            <button class="rp-btn-secondary" id="rp-save-draft">Save Draft</button>
            <button class="rp-btn-primary" id="rp-launch-campaign">Launch Campaign ✦</button>
          </div>
        </div>

        ${viewToggleHtml()}

        <div class="rp-planner-grid">
          <div class="rp-planner-main">

            <!-- Calendar / programming schedule -->
            <div class="rp-card">
              <div class="rp-card-header">
                <div>
                  <div class="rp-card-title">Programming Schedule</div>
                  <div class="rp-card-subtitle" style="margin:0;">Drag and drop · AI suggests slots</div>
                </div>
                <div class="rp-filter-pills">
                  <button class="rp-filter-pill selected">Week</button>
                  <button class="rp-filter-pill">Month</button>
                </div>
              </div>

              <div class="rp-calendar">
                ${days.map((d, i) => {
                  const dayDate = new Date(weekStart)
                  dayDate.setDate(weekStart.getDate() + i)
                  const events = sampleEvents.filter(e => e.day === i)
                  return `
                    <div class="rp-cal-day">
                      <div class="rp-cal-day-h">
                        <div class="rp-cal-day-name">${d}</div>
                        <div class="rp-cal-day-num">${dayDate.getDate()}</div>
                      </div>
                      <div class="rp-cal-day-body">
                        ${events.map(e => `
                          <div class="rp-cal-event ${e.kind}">${escapeHtml(e.label)}</div>
                        `).join('')}
                        ${events.length === 0 ? '<button class="rp-cal-empty" type="button">+</button>' : ''}
                      </div>
                    </div>
                  `
                }).join('')}
              </div>
            </div>

            <!-- Upload card -->
            <div class="rp-card">
              <div class="rp-card-header">
                <div>
                  <div class="rp-card-title">Upload New Assets</div>
                  <div class="rp-card-subtitle" style="margin:0;">AI auto-tagging + background removal</div>
                </div>
              </div>
              <div class="rp-upload-zone" id="rp-upload-zone">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <div class="rp-upload-text">Drag videos or photos here to begin AI processing.</div>
                <button class="rp-btn-secondary sm" type="button">Select Files</button>
              </div>
            </div>

            <!-- Active assets table -->
            <div class="rp-card">
              <div class="rp-card-header">
                <div>
                  <div class="rp-card-title">Active Creative Assets</div>
                  <div class="rp-card-subtitle" style="margin:0;">7 assets · 3 optimized · 2 review needed</div>
                </div>
              </div>

              <div class="rp-asset-table">
                <div class="rp-asset-cols">
                  <div>ASSET</div><div>TYPE</div><div>STATUS</div><div>ENG. RATE</div>
                </div>
                ${[
                  { name: 'penthouse_93_drone.mp4', dim: '1080×1920', type: 'Video', status: 'Optimized', engagement: '6.4%', ok: true, thumb: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=120&h=120&fit=crop' },
                  { name: 'castelo_lobby_4k.jpg',   dim: '2400×3000', type: 'Image', status: 'Optimized', engagement: '5.2%', ok: true, thumb: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=120&h=120&fit=crop' },
                  { name: 'rosales_reel_v2.mp4',    dim: '1080×1920', type: 'Reel',  status: 'Review Needed', engagement: '2.1%', ok: false, thumb: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=120&h=120&fit=crop' },
                  { name: 'strada_carousel_a.jpg',  dim: '1080×1080', type: 'Image', status: 'Optimized', engagement: '4.8%', ok: true, thumb: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=120&h=120&fit=crop' }
                ].map(a => `
                  <div class="rp-asset-row">
                    <div class="rp-asset-cell">
                      <div class="rp-asset-thumb" style="background-image: url('${a.thumb}')"></div>
                      <div style="min-width:0;">
                        <div class="rp-asset-name">${a.name}</div>
                        <div class="rp-asset-dim">${a.dim}</div>
                      </div>
                    </div>
                    <div class="rp-asset-type">${a.type}</div>
                    <div class="rp-asset-status ${a.ok ? 'ok' : 'warn'}">
                      <span class="rp-dot" style="background: ${a.ok ? 'var(--rp-teal)' : 'var(--rp-amber)'};"></span>
                      ${a.status}
                    </div>
                    <div class="rp-asset-eng">${a.engagement}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- AI Studio Lab side panel -->
          <aside class="rp-planner-aside">
            <div class="rp-card">
              <div class="rp-card-title" style="display:flex; align-items:center; gap:8px;">
                <span style="display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:6px; background: var(--rp-teal); color:white;">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M12 2 L13.8 8.2 L20 10 L13.8 11.8 L12 18 L10.2 11.8 L4 10 L10.2 8.2 Z"/></svg>
                </span>
                AI Studio Lab
              </div>
              <div class="rp-card-subtitle">Background removal · auto-tagging · variant generation</div>

              <div style="margin-bottom:18px;">
                <div class="rp-eyebrow" style="margin-bottom:10px;">BACKGROUND REMOVAL</div>
                <div style="background-image: url('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=240&fit=crop'); background-size:cover; background-position:center; aspect-ratio: 4/2.4; border-radius:8px; margin-bottom:12px;"></div>
                <button class="rp-btn-primary rp-btn-block sm">Extract Subject</button>
              </div>

              <div style="margin-bottom:18px;">
                <div class="rp-eyebrow" style="margin-bottom:10px;">PREDICTED TAGS</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                  <span class="rp-chip active">#Minimalist</span>
                  <span class="rp-chip active">#Penthouse</span>
                  <span class="rp-chip active">#Skyline</span>
                  <span class="rp-chip">#Luxury</span>
                </div>
              </div>

              <div class="rp-card-teal" style="padding:16px; border-radius:8px;">
                <div class="rp-eyebrow" style="margin-bottom:8px;">AI SUGGESTIONS</div>
                <p style="margin:0; font-size:13px; line-height:1.55; color:var(--rp-ink-2);">
                  Este asset rinde <strong>40% mejor</strong> en LinkedIn que en Instagram. Sugiero auto-programar 2 publicaciones esta semana.
                </p>
                <button class="rp-btn-ghost sm" style="padding:6px 0; margin-top:8px;">Apply Auto-Schedule →</button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    `
  }

  function viewToggleHtml() {
    return `
      <div class="rp-view-toggle">
        <button class="rp-view-tab ${view === 'smart' ? 'active' : ''}" data-view="smart">
          <span class="rp-dot"></span>
          Smart Creator
        </button>
        <button class="rp-view-tab ${view === 'advanced' ? 'active' : ''}" data-view="advanced">
          <span class="rp-dot" style="background: var(--rp-green-deep);"></span>
          Advanced Planner
        </button>
      </div>
    `
  }

  function render() {
    const slot = document.querySelector('section[data-page="schedule"]')
    if (!slot) return
    slot.innerHTML = view === 'smart' ? smartHtml() : advancedHtml()
    wire(slot)
  }

  function wire(slot) {
    slot.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        view = btn.dataset.view
        render()
      })
    })

    const slider = slot.querySelector('#rp-budget-slider')
    const amount = slot.querySelector('#rp-budget-amount')
    if (slider && amount) {
      slider.addEventListener('input', e => {
        budget = parseInt(e.target.value, 10)
        amount.textContent = '$' + budget
      })
    }

    slot.querySelector('#rp-confirm-launch')?.addEventListener('click', () => {
      window.rmToast?.('🚀 Campaña lanzada · Camilo está optimizando en tiempo real', 'success')
    })
    slot.querySelector('#rp-launch-campaign')?.addEventListener('click', () => {
      window.rmToast?.('🚀 Campaña lanzada · Schedule programado', 'success')
    })
    slot.querySelector('#rp-save-draft')?.addEventListener('click', () => {
      window.rmToast?.('📝 Borrador guardado', 'info')
    })
    slot.querySelector('#rp-edit-copies')?.addEventListener('click', () => {
      window.rmToast?.('Abriendo editor de copies…', 'info')
    })
    slot.querySelector('#rp-add-audience')?.addEventListener('click', () => {
      const seg = prompt('Nuevo segmento de audiencia:')
      if (seg && seg.trim()) {
        audienceTags.push(seg.trim())
        render()
      }
    })
  }

  document.addEventListener('rm-page-change', e => { if (e.detail.page === 'schedule') render() })
  document.addEventListener('DOMContentLoaded', () => {
    if ((window.rmRouter?.currentPage() || 'dashboard') === 'schedule') render()
  })
})()
