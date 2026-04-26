/* ─────────────────────────────────────────────────────────────
   Keyboard shortcuts + command palette.
   - ⌘K / Ctrl+K → palette
   - ⌘N → Studio (new campaign)
   - ⌘D → Dashboard
   - ⌘H → History
   - ⌘A → Analytics
   - ⌘/ → toggle Camilord visibility
   - ESC → close any modal/drawer/palette
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const isMac = navigator.platform.toLowerCase().includes('mac')
  const modKey = isMac ? '⌘' : 'Ctrl'

  const COMMANDS = [
    // NAVIGATION
    { id: 'nav-studio',    group: 'Navegación', label: 'Ir a Creative Studio', shortcut: ['mod', 'N'], iconKey: 'studio',    run: () => window.rmRouter?.goTo('studio') },
    { id: 'nav-dashboard', group: 'Navegación', label: 'Ir a Dashboard / Parrilla', shortcut: ['mod', 'D'], iconKey: 'parrilla', run: () => window.rmRouter?.goTo('dashboard') },
    { id: 'nav-history',   group: 'Navegación', label: 'Ir a History (decisiones IA)', shortcut: ['mod', 'H'], iconKey: 'history',  run: () => window.rmRouter?.goTo('history') },
    { id: 'nav-analytics', group: 'Navegación', label: 'Ir a Analytics', shortcut: ['mod', 'A'], iconKey: 'analytics', run: () => window.rmRouter?.goTo('analytics') },

    // ACTIONS
    { id: 'act-launch',    group: 'Acciones', label: 'Lanzar nueva campaña', shortcut: null, iconKey: 'rocket', run: () => window.openLaunchWizard?.() },
    { id: 'act-camilord',  group: 'Acciones', label: 'Toggle panel Camilord', shortcut: ['mod', '/'], iconKey: 'sparkle', run: () => toggleCamilord() },
    { id: 'act-clear',     group: 'Acciones', label: 'Limpiar borrador del Studio', shortcut: null, iconKey: 'trash',  run: () => { window.rmStore?.reset(); window.rmToast?.('Borrador limpiado', 'success') } },

    // RECENT (placeholder — could be powered by history.js in step 29)
    { id: 'rec-1', group: 'Reciente', label: 'Villa Victoria Luxury', shortcut: null, iconKey: 'pin', run: () => window.rmRouter?.goTo('studio') },
    { id: 'rec-2', group: 'Reciente', label: 'Apartamento Primavera',  shortcut: null, iconKey: 'pin', run: () => window.rmRouter?.goTo('studio') }
  ]

  const ICONS = {
    studio:   '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    parrilla: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    history:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    analytics:'<svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    rocket:   '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    sparkle:  '<svg viewBox="0 0 24 24"><polygon points="12 2 15 9 22 10 17 15 18 22 12 19 6 22 7 15 2 10 9 9 12 2"/></svg>',
    trash:    '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    pin:      '<svg viewBox="0 0 24 24"><circle cx="12" cy="10" r="3"/><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/></svg>'
  }

  let isPaletteOpen = false
  let activeIdx = 0
  let filtered = COMMANDS.slice()

  // ── Build palette DOM lazily ───────────────────────────────

  function ensureDOM() {
    if (document.querySelector('.ae-cmd-overlay')) return
    const overlay = document.createElement('div')
    overlay.className = 'ae-cmd-overlay'
    overlay.innerHTML = `
      <div class="ae-cmd" role="dialog" aria-label="Paleta de comandos">
        <div class="ae-cmd-input-wrap">
          <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="ae-cmd-input" placeholder="Buscar acciones, páginas, comandos..." aria-label="Buscar">
        </div>
        <div class="ae-cmd-list" role="listbox"></div>
        <div class="ae-cmd-foot">
          <span class="ae-cmd-foot-key"><span class="ae-kbd">↑↓</span> Navegar</span>
          <span class="ae-cmd-foot-key"><span class="ae-kbd">↵</span> Seleccionar</span>
          <span class="ae-cmd-foot-key"><span class="ae-kbd">ESC</span> Cerrar</span>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    overlay.addEventListener('click', e => { if (e.target === overlay) closePalette() })
    overlay.querySelector('.ae-cmd-input').addEventListener('input', e => filterAndRender(e.target.value))
    overlay.querySelector('.ae-cmd-input').addEventListener('keydown', onKeyInList)
  }

  function filterAndRender(q) {
    const query = (q || '').trim().toLowerCase()
    filtered = COMMANDS.filter(c => !query || c.label.toLowerCase().includes(query) || c.group.toLowerCase().includes(query))
    activeIdx = 0
    renderList()
  }

  function renderList() {
    const list = document.querySelector('.ae-cmd-list')
    if (!list) return
    if (!filtered.length) {
      list.innerHTML = `<div style="padding:24px; text-align:center; color:var(--rm-muted); font-size:13px;">Sin resultados</div>`
      return
    }
    const grouped = {}
    filtered.forEach((c, i) => {
      grouped[c.group] = grouped[c.group] || []
      grouped[c.group].push({ ...c, idx: i })
    })
    list.innerHTML = Object.entries(grouped).map(([group, items]) => `
      <div class="ae-cmd-group">
        <div class="ae-cmd-group-label">${group}</div>
        ${items.map(c => `
          <button type="button" class="ae-cmd-item ${c.idx === activeIdx ? 'active' : ''}" data-idx="${c.idx}" role="option">
            <span class="ae-cmd-item-icon">${ICONS[c.iconKey] || ICONS.pin}</span>
            <span class="ae-cmd-item-label">${escape(c.label)}</span>
            ${c.shortcut ? `<span class="ae-cmd-item-shortcut">${c.shortcut.map(k => `<span class="ae-kbd">${k === 'mod' ? modKey : k}</span>`).join('')}</span>` : ''}
          </button>
        `).join('')}
      </div>
    `).join('')

    list.querySelectorAll('[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => runCommand(parseInt(btn.dataset.idx, 10)))
      btn.addEventListener('mouseenter', () => {
        activeIdx = parseInt(btn.dataset.idx, 10)
        list.querySelectorAll('.ae-cmd-item').forEach(el => el.classList.toggle('active', parseInt(el.dataset.idx, 10) === activeIdx))
      })
    })
  }

  function escape(s) { return String(s).replace(/[<>]/g, c => ({'<':'&lt;','>':'&gt;'})[c]) }

  function runCommand(idx) {
    const cmd = filtered[idx]
    if (!cmd) return
    closePalette()
    setTimeout(() => { try { cmd.run() } catch (e) { console.warn('[kbd]', e) } }, 0)
  }

  function onKeyInList(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIdx = Math.min(filtered.length - 1, activeIdx + 1)
      renderList()
      scrollActiveIntoView()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIdx = Math.max(0, activeIdx - 1)
      renderList()
      scrollActiveIntoView()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runCommand(activeIdx)
    }
  }
  function scrollActiveIntoView() {
    document.querySelector('.ae-cmd-item.active')?.scrollIntoView({ block: 'nearest' })
  }

  function openPalette() {
    ensureDOM()
    isPaletteOpen = true
    filtered = COMMANDS.slice()
    activeIdx = 0
    const overlay = document.querySelector('.ae-cmd-overlay')
    overlay.classList.add('open')
    const input = overlay.querySelector('.ae-cmd-input')
    input.value = ''
    renderList()
    setTimeout(() => input.focus(), 50)
  }

  function closePalette() {
    isPaletteOpen = false
    document.querySelector('.ae-cmd-overlay')?.classList.remove('open')
  }

  function toggleCamilord() {
    const cam = document.querySelector('.ae-camilord')
    if (!cam) return
    // Desktop: hide/show via class. Mobile: toggle .open-mobile.
    if (window.innerWidth < 768) {
      cam.classList.toggle('open-mobile')
    } else {
      cam.style.display = cam.style.display === 'none' ? '' : 'none'
    }
  }

  // ── Global keydown handler ────────────────────────────────

  document.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod && e.key !== 'Escape') return

    // ESC closes anything open
    if (e.key === 'Escape') {
      if (isPaletteOpen) { e.preventDefault(); closePalette(); return }
      // Wizard / drawer ESC handlers already exist in their modules
      return
    }

    // ⌘K / Ctrl+K — toggle palette
    if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); isPaletteOpen ? closePalette() : openPalette(); return }

    // Other shortcuts only fire when palette is closed
    if (isPaletteOpen) return

    if (mod && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); window.rmRouter?.goTo('studio'); return }
    if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); window.rmRouter?.goTo('dashboard'); return }
    if (mod && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); window.rmRouter?.goTo('history'); return }
    if (mod && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); window.rmRouter?.goTo('analytics'); return }
    if (mod && e.key === '/')                    { e.preventDefault(); toggleCamilord(); return }
  })

  // ── Decorate the search bar in topnav with a ⌘K hint ──────

  document.addEventListener('DOMContentLoaded', () => {
    const search = document.querySelector('.ae-search')
    if (search && !search.querySelector('.ae-kbd')) {
      const kbd = document.createElement('span')
      kbd.className = 'ae-kbd'
      kbd.textContent = isMac ? '⌘K' : 'Ctrl K'
      search.appendChild(kbd)
    }
    // Click on search opens palette too
    document.querySelector('.ae-search')?.addEventListener('click', openPalette)
  })

  window.openCommandPalette = openPalette
  window.closeCommandPalette = closePalette
})()
