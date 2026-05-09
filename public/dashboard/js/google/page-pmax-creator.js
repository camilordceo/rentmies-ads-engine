/* ─────────────────────────────────────────────────────────────
   Google Performance Max Creator (Step 25)
   /dashboard#google/campaigns/new (alias: #google-campaign-new)

   Conversational, inmueble-first flow:
     1. Pick an inmueble from inventory
     2. Camilord auto-fills copy + audience signals + budget
     3. Edit anything before submit
     4. Live preview shows Search ad + Display rendition

   Submits to /api/google/campaigns/create-pmax. The campaign
   lands as PAUSED so the user reviews + activates manually
   from the campaigns list.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const PAGE_IDS = ['google-campaign-new', 'google-pmax']
  const esc = (s) => window.rmc?.escapeHtml(s) ?? String(s ?? '')
  const escAttr = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;')

  function defaultCampaign () {
    return {
      name: '',
      daily_budget_cents: 2500,           // $25/day default
      target_cpa_cents: 2000,             // $20 target CPA
      final_url: '',
      audience_signals: [],
      search_themes: [],
      headlines: ['', '', '', '', ''],
      long_headlines: ['', '', '', '', ''],
      descriptions: ['', '', '', '', '']
    }
  }

  const PRESET_AUDIENCES = [
    'First-time buyers',
    'High net worth individuals',
    'Investors',
    'Young families',
    'Retirees / downsizers',
    'Out-of-state buyers'
  ]

  const state = {
    pageId: null,
    loading: true,
    inmuebles: [],
    selectedInmuebleId: null,
    campaign: defaultCampaign(),
    submitting: false,
    serverError: null,
    googleConn: null,
    googleConnLoaded: false
  }

  // ─── Auto-fill from inmueble ─────────────────────────────
  function autoFill (inm) {
    if (!inm) return
    const nombre = inm.nombre || inm.name || inm.title || 'Inmueble'
    const ciudad = inm.ciudad || inm.city || 'Bogotá'
    const tipo = (inm.tipo || inm.type || 'apartamento').toLowerCase()
    const precio = inm.precio || inm.price || 0
    const habs = inm.habitaciones || inm.rooms || inm.bedrooms || 2
    const m2 = inm.m2 || inm.area_m2 || 0
    const slug = String(nombre).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    const isPremium = precio >= 500_000_000 || /penthouse|premium|lux/i.test(nombre)

    state.campaign.name = `PMax · ${nombre} · ${ciudad}`
    state.campaign.final_url = `https://rentmies.com/p/${slug || 'inmueble'}`

    // Budget heuristic: 0.005% of property price per day, clamp $5-$200
    const budgetUsd = precio ? Math.max(5, Math.min(200, Math.round(precio * 0.000005 / 4500))) : 25
    state.campaign.daily_budget_cents = budgetUsd * 100

    // Target CPA: 1% of monthly mortgage equivalent
    state.campaign.target_cpa_cents = isPremium ? 4000 : 2500

    // Audience signals
    state.campaign.audience_signals = isPremium
      ? ['High net worth individuals', 'Investors']
      : (precio < 200_000_000 ? ['First-time buyers', 'Young families'] : ['First-time buyers', 'Investors'])

    // Search themes
    state.campaign.search_themes = [
      `${tipo} ${ciudad}`,
      `${tipo} en venta ${ciudad}`,
      `${tipo} ${habs} habitaciones`,
      isPremium ? `${tipo} premium ${ciudad}` : `${tipo} económico ${ciudad}`
    ]

    // Headlines (max 30 chars each)
    state.campaign.headlines = [
      truncTo(nombre, 30),
      truncTo(`${tipo} en ${ciudad}`, 30),
      truncTo(`${habs} hab · ${m2 ? m2 + 'm²' : ciudad}`, 30),
      isPremium ? 'Vive en zona premium' : 'Tu primer hogar te espera',
      'Visita 100% online'
    ]

    // Long headlines (max 90 chars)
    state.campaign.long_headlines = [
      truncTo(`${nombre} · ${ciudad} ${precio ? '· ' + fmtPrice(precio) : ''}`, 90),
      truncTo(`Inmueble ${tipo} en ${ciudad} · ${habs} habitaciones${m2 ? ' · ' + m2 + 'm²' : ''}`, 90),
      truncTo(`Agenda visita virtual a ${nombre} · respuesta en menos de 1 hora`, 90),
      truncTo('Inmuebles verificados con asesoría humana de Rentmies', 90),
      truncTo(isPremium ? 'Inversión segura en zona premium de Colombia' : 'Tu próximo hogar a un click de distancia', 90)
    ]

    // Descriptions (max 90 chars)
    state.campaign.descriptions = [
      truncTo(`Conoce ${nombre} en ${ciudad}. Tour virtual disponible. Agenda visita.`, 90),
      truncTo(`${habs} habitaciones${m2 ? ', ' + m2 + ' m²' : ''}. Ubicación premium y seguridad 24/7.`, 90),
      truncTo('Asesoría humana en cada paso. Sin comisiones ocultas.', 90),
      truncTo(precio ? `Precio: ${fmtPrice(precio)}. Financiación con bancos aliados.` : 'Financiación con bancos aliados.', 90),
      truncTo('Respuesta WhatsApp en menos de 1 hora. Visita el mismo día.', 90)
    ]
  }

  function truncTo (s, max) {
    if (!s) return ''
    s = String(s)
    return s.length > max ? s.slice(0, max - 1) + '…' : s
  }
  function fmtPrice (n) {
    if (!n) return ''
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}MM COP`
    if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M COP`
    return `$${n.toLocaleString('es-CO')} COP`
  }

  // ─── Validation ──────────────────────────────────────────
  function validate () {
    const c = state.campaign
    const errors = []
    const warnings = []

    if (!c.name || c.name.length < 6) errors.push('El nombre de la campaña es muy corto')
    if (!c.final_url || !/^https?:\/\//.test(c.final_url)) errors.push('Final URL inválida (debe empezar con http:// o https://)')
    if (c.daily_budget_cents < 100) errors.push('El presupuesto diario mínimo es $1 USD')
    if (c.daily_budget_cents > 100000) warnings.push('Presupuesto >$1000 USD/día — confirma con el cliente')

    const headlines = (c.headlines || []).filter(h => h && h.trim())
    if (headlines.length < 3) errors.push('Mínimo 3 headlines (max 30 chars cada uno)')
    if (headlines.some(h => h.length > 30)) errors.push('Algún headline excede 30 chars')

    const descriptions = (c.descriptions || []).filter(d => d && d.trim())
    if (descriptions.length < 2) errors.push('Mínimo 2 descripciones (max 90 chars cada una)')
    if (descriptions.some(d => d.length > 90)) errors.push('Alguna descripción excede 90 chars')

    if ((c.search_themes || []).filter(Boolean).length === 0) warnings.push('Sin search themes la IA tarda más en arrancar — agrega 2-3')

    return { ok: errors.length === 0, errors, warnings }
  }

  // ─── HTML ────────────────────────────────────────────────
  function html () {
    const subnav = window.rpSubnav ? window.rpSubnav.html('google-campaigns') : ''
    const v = validate()
    const budget = (state.campaign.daily_budget_cents / 100).toFixed(0)
    const cpa = (state.campaign.target_cpa_cents / 100).toFixed(0)

    if (state.googleConnLoaded && (!state.googleConn || !state.googleConn.connected)) {
      return notConnectedHtml(subnav)
    }

    return `
      <section class="rp-page rp-rise">
        ${subnav}

        <div class="rp-page-header" style="display:flex; align-items:flex-start; justify-content:space-between; gap:18px;">
          <div>
            <span class="rp-eyebrow">${window.rmc?.aiBadge ? 'POWERED BY ' + window.rmc.aiBadge('Camilord AI') : 'POWERED BY CAMILORD AI'}</span>
            <h1 class="rp-display">Crea tu campaña <em>de Google</em></h1>
            <p class="rp-subhead">Performance Max distribuye automáticamente entre Search, Display, YouTube, Maps y Discover. Camilord arma el copy basado en tu inmueble.</p>
          </div>
          <a href="#google/campaigns" class="ae-btn-ghost">← Campañas</a>
        </div>

        <div class="gpm-editor">
          <!-- LEFT: form -->
          <div class="gpm-form-col">
            <!-- Inmueble selector -->
            <section class="ae-formcard">
              <div class="ae-formcard-h"><span><span class="gpm-step-num">01</span> Inmueble base</span></div>
              <div class="ae-field">
                <label class="ae-field-label" for="gpm-inmueble">Selecciona el inmueble que vas a promocionar</label>
                <select id="gpm-inmueble" class="ae-input">
                  <option value="">— elige inmueble —</option>
                  ${state.inmuebles.map(i => `
                    <option value="${escAttr(i.id || i.codigo || i.slug || '')}" ${state.selectedInmuebleId === (i.id || i.codigo || i.slug || '') ? 'selected' : ''}>
                      ${esc((i.nombre || i.name || i.title || 'Sin nombre'))} · ${esc(i.ciudad || i.city || '')}
                    </option>
                  `).join('')}
                </select>
                <div class="ae-field-hint">Si no ves tu inmueble, agrégalo primero en <a href="#inmuebles" style="color:var(--rm-green-deep);">Inmuebles →</a></div>
              </div>
              ${state.selectedInmuebleId ? `
                <div class="ae-action-row" style="margin-top:14px;">
                  <button type="button" class="ae-btn-authority" id="gpm-autofill">✨ Auto-llenar con Camilord</button>
                  <span style="font-size:11.5px; color:var(--rm-muted);">Genera copy + audience + budget basado en el inmueble.</span>
                </div>
              ` : ''}
            </section>

            <!-- Campaign basics -->
            <section class="ae-formcard">
              <div class="ae-formcard-h"><span><span class="gpm-step-num">02</span> Campaña</span></div>
              <div class="ae-field">
                <label class="ae-field-label" for="gpm-name">Nombre de la campaña</label>
                <input id="gpm-name" class="ae-input" type="text" value="${escAttr(state.campaign.name)}" placeholder="PMax · Penthouse · Bogotá" />
              </div>

              <div class="ae-grid-2">
                <div class="ae-field">
                  <label class="ae-field-label">Presupuesto diario · <strong>$${budget} USD</strong></label>
                  <input type="range" id="gpm-budget" min="5" max="200" step="5" value="${budget}" class="gpm-slider">
                  <div class="gpm-slider-labels"><span>$5</span><span>$200</span></div>
                  <div class="ae-field-hint">Reach diario estimado: ${reachEstimate(budget)} impresiones · ${conversionEstimate(budget, cpa)} conversiones</div>
                </div>
                <div class="ae-field">
                  <label class="ae-field-label">Target CPA · <strong>$${cpa} USD</strong></label>
                  <input type="range" id="gpm-cpa" min="5" max="100" step="1" value="${cpa}" class="gpm-slider">
                  <div class="gpm-slider-labels"><span>$5</span><span>$100</span></div>
                  <div class="ae-field-hint">Costo por lead/conversión que estás dispuesto a pagar.</div>
                </div>
              </div>

              <div class="ae-field">
                <label class="ae-field-label" for="gpm-final-url">Final URL · landing page</label>
                <input id="gpm-final-url" class="ae-input" type="url" value="${escAttr(state.campaign.final_url)}" placeholder="https://rentmies.com/p/inmueble" />
                <div class="ae-field-hint">A dónde se manda al usuario cuando hace click. Camilord usa esta URL para auto-generar headlines.</div>
              </div>
            </section>

            <!-- Audience signals -->
            <section class="ae-formcard">
              <div class="ae-formcard-h"><span><span class="gpm-step-num">03</span> Audience signals</span></div>
              <p class="ae-field-hint" style="margin-bottom:10px;">Pistas que le das al algoritmo de Google sobre tu cliente ideal. PMax explora más allá de estas pero las usa como semilla.</p>
              <div class="gpm-chips">
                ${PRESET_AUDIENCES.map(a => `
                  <button type="button" class="gpm-chip ${state.campaign.audience_signals.includes(a) ? 'is-active' : ''}" data-audience="${esc(a)}">${esc(a)}</button>
                `).join('')}
              </div>
            </section>

            <!-- Search themes -->
            <section class="ae-formcard">
              <div class="ae-formcard-h"><span><span class="gpm-step-num">04</span> Search themes <span class="wa-tpl-opt">3-8 keywords</span></span></div>
              <p class="ae-field-hint" style="margin-bottom:10px;">Frases naturales (no exact-match keywords). Ej: "apartamento Chapinero", "casa con piscina Medellín".</p>
              <div class="gpm-themes" id="gpm-themes-list">
                ${(state.campaign.search_themes || []).map((t, i) => `
                  <div class="gpm-theme">
                    <input class="ae-input" type="text" value="${escAttr(t)}" data-theme-i="${i}" placeholder="apartamento Bogotá" />
                    <button type="button" class="gpm-theme-remove" data-theme-remove="${i}" title="Eliminar">×</button>
                  </div>
                `).join('')}
              </div>
              <button type="button" class="ae-btn-ghost" id="gpm-theme-add" ${state.campaign.search_themes.length >= 8 ? 'disabled' : ''}>+ Agregar tema</button>
            </section>

            <!-- Headlines + descriptions -->
            <section class="ae-formcard">
              <div class="ae-formcard-h"><span><span class="gpm-step-num">05</span> Copy creativo</span></div>

              <div class="ae-field">
                <label class="ae-field-label">Headlines cortos (max 30 chars · mín 3)</label>
                ${state.campaign.headlines.map((h, i) => `
                  <div class="gpm-asset-row">
                    <input class="ae-input gpm-asset-input" type="text" maxlength="30" data-headline-i="${i}" value="${escAttr(h)}" placeholder="Headline ${i+1}" />
                    <span class="gpm-asset-counter">${(h || '').length}/30</span>
                  </div>
                `).join('')}
              </div>

              <div class="ae-field">
                <label class="ae-field-label">Long headlines (max 90 chars)</label>
                ${state.campaign.long_headlines.map((h, i) => `
                  <div class="gpm-asset-row">
                    <input class="ae-input gpm-asset-input" type="text" maxlength="90" data-long-headline-i="${i}" value="${escAttr(h)}" placeholder="Long headline ${i+1}" />
                    <span class="gpm-asset-counter">${(h || '').length}/90</span>
                  </div>
                `).join('')}
              </div>

              <div class="ae-field">
                <label class="ae-field-label">Descripciones (max 90 chars · mín 2)</label>
                ${state.campaign.descriptions.map((d, i) => `
                  <div class="gpm-asset-row">
                    <input class="ae-input gpm-asset-input" type="text" maxlength="90" data-description-i="${i}" value="${escAttr(d)}" placeholder="Descripción ${i+1}" />
                    <span class="gpm-asset-counter">${(d || '').length}/90</span>
                  </div>
                `).join('')}
              </div>
            </section>

            ${(v.errors.length || v.warnings.length) ? `
              <div class="wa-tpl-validation">
                ${v.errors.length ? `
                  <div class="wa-tpl-validation-block wa-tpl-validation-errors">
                    <div class="wa-tpl-validation-title">${v.errors.length} error${v.errors.length === 1 ? '' : 'es'}</div>
                    <ul>${v.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
                  </div>
                ` : ''}
                ${v.warnings.length ? `
                  <div class="wa-tpl-validation-block wa-tpl-validation-warnings">
                    <div class="wa-tpl-validation-title">${v.warnings.length} sugerencia${v.warnings.length === 1 ? '' : 's'}</div>
                    <ul>${v.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
                  </div>
                ` : ''}
              </div>
            ` : ''}

            ${state.serverError ? `
              <div class="ae-help warn"><strong>${esc(state.serverError)}</strong></div>
            ` : ''}

            <div class="gpm-actions">
              <a href="#google/campaigns" class="ae-btn-ghost">Cancelar</a>
              <button type="button" class="ae-btn-primary" id="gpm-submit" ${(!v.ok || state.submitting) ? 'disabled' : ''}>
                ${state.submitting ? 'Creando…' : 'Crear campaña (PAUSADA)'}
              </button>
            </div>
          </div>

          <!-- RIGHT: preview -->
          <div class="gpm-preview-col">
            <div class="gpm-preview-eyebrow">Preview · Search ad</div>
            ${searchAdPreview()}

            <div class="gpm-preview-eyebrow" style="margin-top:18px;">Preview · Display banner</div>
            ${displayPreview()}

            <div class="gpm-preview-meta">
              <span class="rmc-pill rmc-pill--off"><span class="rmc-pill-dot"></span><span>Status inicial: PAUSED</span></span>
            </div>
          </div>
        </div>
      </section>
    `
  }

  function notConnectedHtml (subnav) {
    return `
      <section class="rp-page rp-rise">
        ${subnav}
        <div class="rp-page-header">
          <span class="rp-eyebrow">GOOGLE ADS</span>
          <h1 class="rp-display">Conecta Google primero</h1>
          <p class="rp-subhead">Para crear campañas necesitamos tu OAuth de Google Ads y un customer ID activo. Toma 2 minutos si ya tienes un Google Ads Manager (MCC) creado.</p>
        </div>
        ${window.rmc?.emptyState ? window.rmc.emptyState({
          icon: '🔗',
          eyebrow: 'CONEXIÓN REQUERIDA',
          title: 'Conecta tu Google Ads',
          body: 'OAuth → tomamos refresh_token → empezamos. Si todavía no tienes developer token aprobado por Google, primero aplica en API Center (1-3 semanas).',
          ctaLabel: 'Ir a Settings →',
          ctaHref: '#settings'
        }) : ''}
      </section>
    `
  }

  // ─── Preview renderers ───────────────────────────────────
  function searchAdPreview () {
    const c = state.campaign
    const h1 = (c.headlines || []).find(Boolean) || 'Tu inmueble'
    const h2 = (c.headlines || []).filter(Boolean)[1] || ''
    const desc = (c.descriptions || []).find(Boolean) || 'Conoce el inmueble.'
    const url = (c.final_url || 'rentmies.com').replace(/^https?:\/\//, '')
    return `
      <div class="gpm-search-ad">
        <div class="gpm-search-ad-tag">Patrocinado</div>
        <div class="gpm-search-ad-url">${esc(url)}</div>
        <div class="gpm-search-ad-h">${esc(h1)}${h2 ? ' · ' + esc(h2) : ''}</div>
        <div class="gpm-search-ad-desc">${esc(desc)}</div>
      </div>
    `
  }

  function displayPreview () {
    const c = state.campaign
    const h1 = (c.long_headlines || []).find(Boolean) || (c.headlines || []).find(Boolean) || 'Tu inmueble en Bogotá'
    const desc = (c.descriptions || []).find(Boolean) || 'Conoce el inmueble.'
    return `
      <div class="gpm-display-ad">
        <div class="gpm-display-ad-img">
          <span style="opacity:0.55;">📷 IMAGEN 1200×628</span>
        </div>
        <div class="gpm-display-ad-body">
          <div class="gpm-display-ad-h">${esc(h1)}</div>
          <div class="gpm-display-ad-desc">${esc(desc)}</div>
          <div class="gpm-display-ad-cta">Ver inmueble →</div>
        </div>
      </div>
    `
  }

  function reachEstimate (budgetUsd) {
    // Rough heuristic — real numbers come from Google Ads Reach Planner
    const b = parseFloat(budgetUsd) || 0
    return Math.round(b * 320).toLocaleString('es-CO') + '-' + Math.round(b * 480).toLocaleString('es-CO')
  }
  function conversionEstimate (budgetUsd, cpaUsd) {
    const b = parseFloat(budgetUsd) || 0
    const c = parseFloat(cpaUsd) || 1
    return Math.round(b / c * 0.7).toLocaleString('es-CO') + '-' + Math.round(b / c * 1.1).toLocaleString('es-CO')
  }

  // ─── Wiring ──────────────────────────────────────────────
  function wire () {
    document.getElementById('gpm-inmueble')?.addEventListener('change', e => {
      state.selectedInmuebleId = e.target.value
      const inm = state.inmuebles.find(i => (i.id || i.codigo || i.slug) === state.selectedInmuebleId)
      if (inm && !state.campaign.name) autoFill(inm)
      render()
    })
    document.getElementById('gpm-autofill')?.addEventListener('click', () => {
      const inm = state.inmuebles.find(i => (i.id || i.codigo || i.slug) === state.selectedInmuebleId)
      if (!inm) return
      autoFill(inm)
      render()
      window.rmToast?.('✨ Camilord generó el copy — edita lo que quieras', 'success')
    })

    document.getElementById('gpm-name')?.addEventListener('input', e => {
      state.campaign.name = e.target.value
      refreshSubmitState()
    })
    document.getElementById('gpm-final-url')?.addEventListener('input', e => {
      state.campaign.final_url = e.target.value
      refreshPreview()
      refreshSubmitState()
    })
    document.getElementById('gpm-budget')?.addEventListener('input', e => {
      state.campaign.daily_budget_cents = parseInt(e.target.value, 10) * 100
      const lbl = e.target.previousElementSibling
      if (lbl) lbl.innerHTML = `Presupuesto diario · <strong>$${e.target.value} USD</strong>`
      const hint = e.target.parentElement.querySelector('.ae-field-hint')
      if (hint) hint.innerHTML = `Reach diario estimado: ${reachEstimate(e.target.value)} impresiones · ${conversionEstimate(e.target.value, state.campaign.target_cpa_cents/100)} conversiones`
    })
    document.getElementById('gpm-cpa')?.addEventListener('input', e => {
      state.campaign.target_cpa_cents = parseInt(e.target.value, 10) * 100
      const lbl = e.target.previousElementSibling
      if (lbl) lbl.innerHTML = `Target CPA · <strong>$${e.target.value} USD</strong>`
    })

    document.querySelectorAll('[data-audience]').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.audience
        const idx = state.campaign.audience_signals.indexOf(a)
        if (idx === -1) state.campaign.audience_signals.push(a)
        else state.campaign.audience_signals.splice(idx, 1)
        btn.classList.toggle('is-active')
      })
    })

    document.getElementById('gpm-theme-add')?.addEventListener('click', () => {
      if (state.campaign.search_themes.length >= 8) return
      state.campaign.search_themes.push('')
      render()
    })
    document.querySelectorAll('[data-theme-i]').forEach(inp => {
      inp.addEventListener('input', e => {
        const i = parseInt(inp.dataset.themeI, 10)
        state.campaign.search_themes[i] = e.target.value
      })
    })
    document.querySelectorAll('[data-theme-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.themeRemove, 10)
        state.campaign.search_themes.splice(i, 1)
        render()
      })
    })

    function wireAssetInputs (selector, key) {
      document.querySelectorAll(selector).forEach(inp => {
        inp.addEventListener('input', e => {
          const i = parseInt(inp.dataset[key], 10)
          state.campaign[key.replace(/I$/, 's').replace('headlineI', 'headlines').replace('longHeadlineI', 'long_headlines').replace('descriptionI', 'descriptions')] = state.campaign[
            key === 'headlineI' ? 'headlines' : key === 'longHeadlineI' ? 'long_headlines' : 'descriptions'
          ]
          const arr = state.campaign[key === 'headlineI' ? 'headlines' : key === 'longHeadlineI' ? 'long_headlines' : 'descriptions']
          arr[i] = e.target.value
          // Update counter
          const counter = e.target.nextElementSibling
          const max = parseInt(e.target.maxLength || 0, 10)
          if (counter) counter.textContent = `${e.target.value.length}/${max}`
          refreshPreview()
          refreshSubmitState()
        })
      })
    }
    wireAssetInputs('[data-headline-i]', 'headlineI')
    wireAssetInputs('[data-long-headline-i]', 'longHeadlineI')
    wireAssetInputs('[data-description-i]', 'descriptionI')

    document.getElementById('gpm-submit')?.addEventListener('click', submit)
  }

  function refreshPreview () {
    const slot = document.querySelector('.gpm-preview-col')
    if (!slot) return
    const eyebrows = slot.querySelectorAll('.gpm-preview-eyebrow')
    const meta = slot.querySelector('.gpm-preview-meta')
    slot.innerHTML = `
      <div class="gpm-preview-eyebrow">Preview · Search ad</div>
      ${searchAdPreview()}
      <div class="gpm-preview-eyebrow" style="margin-top:18px;">Preview · Display banner</div>
      ${displayPreview()}
      <div class="gpm-preview-meta">
        <span class="rmc-pill rmc-pill--off"><span class="rmc-pill-dot"></span><span>Status inicial: PAUSED</span></span>
      </div>
    `
  }

  function refreshSubmitState () {
    const v = validate()
    const btn = document.getElementById('gpm-submit')
    if (btn) btn.disabled = !v.ok || state.submitting
    // Re-render the validation block alone (cheap)
    const old = document.querySelector('.wa-tpl-validation')
    if (old) {
      const html = (v.errors.length || v.warnings.length) ? `
        ${v.errors.length ? `
          <div class="wa-tpl-validation-block wa-tpl-validation-errors">
            <div class="wa-tpl-validation-title">${v.errors.length} error${v.errors.length === 1 ? '' : 'es'}</div>
            <ul>${v.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
          </div>` : ''}
        ${v.warnings.length ? `
          <div class="wa-tpl-validation-block wa-tpl-validation-warnings">
            <div class="wa-tpl-validation-title">${v.warnings.length} sugerencia${v.warnings.length === 1 ? '' : 's'}</div>
            <ul>${v.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
          </div>` : ''}
      ` : ''
      old.innerHTML = html
    }
  }

  // ─── Submit ──────────────────────────────────────────────
  async function submit () {
    const v = validate()
    if (!v.ok) {
      window.rmToast?.('Corrige los errores antes de enviar', 'error')
      return
    }
    state.submitting = true
    state.serverError = null
    refreshSubmitState()

    try {
      const payload = {
        ...state.campaign,
        inmueble_id: state.selectedInmuebleId
      }
      const r = await window.rmApi.post('/api/google/campaigns/create-pmax', payload)
      window.rmToast?.(`✓ Campaña creada · ${r.google_campaign_id || 'ID pendiente'} · status PAUSED`, 'success')
      // Bounce to campaigns list
      setTimeout(() => window.rmRouter?.goTo('google-campaigns'), 600)
    } catch (err) {
      const detail = err.body?.detail || err.body?.error || ''
      state.serverError = `${err.message}${detail ? ' — ' + detail : ''}`
      state.submitting = false
      render()
    }
  }

  // ─── Network ─────────────────────────────────────────────
  async function loadInmuebles () {
    try {
      const r = await fetch('/api/data?resource=inmuebles')
      if (r.ok) {
        const data = await r.json()
        state.inmuebles = (data && (data.inmuebles || data.data || (Array.isArray(data) ? data : []))) || []
      } else {
        // Fallback: try the static JSON
        const r2 = await fetch('/data/inmuebles-inicio.json')
        if (r2.ok) state.inmuebles = (await r2.json()) || []
      }
    } catch (_) {
      state.inmuebles = []
    }
  }

  async function loadGoogleConn () {
    try {
      const r = await window.rmApi.get('/api/google/connection')
      state.googleConn = r
    } catch (_) {
      state.googleConn = null
    } finally {
      state.googleConnLoaded = true
    }
  }

  // ─── Styles ──────────────────────────────────────────────
  function injectStylesOnce () {
    if (document.getElementById('gpm-creator-styles')) return
    const css = `
      .gpm-editor { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.7fr); gap: 26px; align-items: start; }
      @media (max-width: 1024px) { .gpm-editor { grid-template-columns: 1fr; } }
      .gpm-form-col { min-width: 0; }
      .gpm-preview-col { position: sticky; top: 16px; }
      .gpm-preview-eyebrow { font-family: var(--rm-mono); font-size: 9.5px; font-weight: 700; letter-spacing: 0.12em; color: var(--rm-muted, #7a7e79); text-transform: uppercase; margin-bottom: 8px; }
      .gpm-preview-meta { margin-top: 16px; }

      .gpm-step-num { font-family: var(--rm-mono); font-size: 11px; color: #4285F4; font-weight: 700; margin-right: 8px; }

      .gpm-slider { width: 100%; -webkit-appearance: none; height: 4px; background: var(--rp-surface-raised, #f6f3ee); border-radius: 999px; outline: none; }
      .gpm-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #4285F4; cursor: pointer; box-shadow: 0 0 0 4px rgba(66,133,244,.15); }
      .gpm-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #4285F4; cursor: pointer; border: none; }
      .gpm-slider-labels { display: flex; justify-content: space-between; font-family: var(--rm-mono); font-size: 10px; color: var(--rm-muted, #7a7e79); margin-top: 4px; }

      .gpm-chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .gpm-chip { background: transparent; border: 1px solid var(--rm-border, #e8e3dc); padding: 8px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600; color: var(--rm-muted, #7a7e79); cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
      .gpm-chip:hover { color: var(--rm-ink, #0f1410); border-color: #4285F4; }
      .gpm-chip.is-active { background: #4285F4; color: white; border-color: #4285F4; }

      .gpm-themes { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
      .gpm-theme { display: grid; grid-template-columns: 1fr 32px; gap: 6px; align-items: center; }
      .gpm-theme-remove { background: none; border: none; font-size: 18px; line-height: 1; cursor: pointer; color: var(--rm-muted, #7a7e79); padding: 0; }
      .gpm-theme-remove:hover { color: var(--rm-red, #c0392b); }

      .gpm-asset-row { display: grid; grid-template-columns: 1fr 60px; gap: 8px; align-items: center; margin-bottom: 6px; }
      .gpm-asset-counter { font-family: var(--rm-mono); font-size: 10.5px; color: var(--rm-muted, #7a7e79); text-align: right; }

      .gpm-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--rm-border, #e8e3dc); }

      /* Search ad mock */
      .gpm-search-ad { background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 8px; padding: 14px 16px; }
      .gpm-search-ad-tag { font-size: 11px; font-weight: 700; color: var(--rm-ink-2, #3a3f3b); margin-bottom: 4px; }
      .gpm-search-ad-url { font-size: 11.5px; color: #006621; margin-bottom: 4px; }
      .gpm-search-ad-h { font-size: 16px; line-height: 1.3; color: #1a0dab; font-weight: 500; margin-bottom: 4px; }
      .gpm-search-ad-desc { font-size: 13px; line-height: 1.4; color: #4d5156; }

      /* Display ad mock */
      .gpm-display-ad { background: var(--rp-surface, #fff); border: 1px solid var(--rm-border, #e8e3dc); border-radius: 8px; overflow: hidden; }
      .gpm-display-ad-img { background: linear-gradient(135deg, #f0ede5, #e8e3dc); height: 140px; display: flex; align-items: center; justify-content: center; font-family: var(--rm-mono); font-size: 11px; color: var(--rm-muted, #7a7e79); }
      .gpm-display-ad-body { padding: 12px 14px; }
      .gpm-display-ad-h { font-size: 14px; font-weight: 700; line-height: 1.3; margin-bottom: 4px; }
      .gpm-display-ad-desc { font-size: 12px; color: var(--rm-ink-2, #3a3f3b); margin-bottom: 8px; }
      .gpm-display-ad-cta { display: inline-block; padding: 5px 12px; background: #4285F4; color: white; border-radius: 4px; font-size: 11.5px; font-weight: 600; }
    `
    const s = document.createElement('style')
    s.id = 'gpm-creator-styles'
    s.textContent = css
    document.head.appendChild(s)
  }

  function render () {
    const slot = document.querySelector(`section[data-page="${state.pageId}"]`)
    if (!slot) return
    injectStylesOnce()
    slot.innerHTML = html()
    wire()
  }

  async function mount (pageId) {
    state.pageId = pageId
    state.loading = true
    state.submitting = false
    state.serverError = null
    state.campaign = defaultCampaign()
    state.selectedInmuebleId = null
    state.googleConnLoaded = false
    render()

    await Promise.all([loadInmuebles(), loadGoogleConn()])
    state.loading = false
    render()
  }

  document.addEventListener('rm-page-change', e => {
    if (PAGE_IDS.includes(e.detail.page)) mount(e.detail.page)
  })
  document.addEventListener('DOMContentLoaded', () => {
    const cur = window.rmRouter?.currentPage()
    if (PAGE_IDS.includes(cur)) mount(cur)
  })
})()
