/* ─────────────────────────────────────────────────────────────
   Camilord renderer
   Reads window.rmCamilordModes (channel-aware mode registry) and
   draws the panel for the current page. Channel theme is applied
   to the eyebrow pill so the user recognizes which channel they
   are interacting with.

   This file used to inline all per-page content. The content has
   moved to js/camilord/modes.js — this module is now just the
   chrome + tab wiring.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  function panelEl () { return document.querySelector('.ae-camilord, .rp-panel') }

  const SPARKLE_SVG = `
    <svg viewBox="0 0 24 24"><path d="M12 2 L13.8 8.2 L20 10 L13.8 11.8 L12 18 L10.2 11.8 L4 10 L10.2 8.2 Z" fill="currentColor"/></svg>
  `

  function escapeHtml (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  }

  function header (mode) {
    const accent = mode.theme?.accent || 'var(--rp-teal, #40d99d)'
    return `
      <div class="rp-cam-header">
        <div class="rp-cam-header-icon" style="color:${accent};">${SPARKLE_SVG}</div>
        <div class="rp-cam-header-text">
          <div class="rp-cam-title">Camilo AI</div>
          <div class="rp-cam-eyebrow" style="color:${accent};">${escapeHtml(mode.eyebrow || 'Intelligent Insights')}</div>
        </div>
      </div>
      <div class="rp-cam-intro"><p>${mode.intro}</p></div>
    `
  }

  function feed (mode) {
    if (!mode.feed || !mode.feed.length) return ''
    return `
      <div class="rp-cam-section">${escapeHtml(mode.feedTitle || 'Feed')}</div>
      <div class="rp-feed">
        ${mode.feed.map(it => `
          <div class="rp-feed-item">
            <div class="rp-feed-title">${escapeHtml(it.title)}</div>
            <div class="rp-feed-body">${escapeHtml(it.body)}</div>
            <div class="rp-feed-time">${escapeHtml(it.time)}</div>
          </div>
        `).join('')}
      </div>
    `
  }

  function askCamilo () {
    return `
      <div class="ae-cam-spacer"></div>
      <div class="rp-ask-camilo">
        <button class="rp-ask-camilo-btn" type="button">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Ask Camilo
        </button>
      </div>
      <div class="rp-cam-tabs">
        <button class="rp-cam-tab active" data-cam-tab="insights"><span class="rp-cam-tab-dot"></span>Insights</button>
        <button class="rp-cam-tab" data-cam-tab="audience"><span class="rp-cam-tab-dot"></span>Audience</button>
        <button class="rp-cam-tab" data-cam-tab="creative"><span class="rp-cam-tab-dot"></span>Creative</button>
        <button class="rp-cam-tab" data-cam-tab="market"><span class="rp-cam-tab-dot"></span>Market</button>
      </div>
    `
  }

  // ── Mode swap ────────────────────────────────────────────
  let currentMode = null

  function modeFor (page) {
    const reg = window.rmCamilordModes
    if (!reg) {
      // Fallback if modes registry hasn't loaded yet
      return {
        eyebrow: 'Intelligent Insights',
        intro: 'Cargando contexto del canal...',
        feedTitle: 'Loading',
        feed: []
      }
    }
    const mode = reg.modeFor(page)
    return {
      ...mode,
      theme: reg.CHANNEL_THEMES[mode.channel] || null
    }
  }

  function setMode (page) {
    const panel = panelEl()
    if (!panel) return
    if (page === currentMode) return
    currentMode = page

    const mode = modeFor(page)
    panel.innerHTML = header(mode) + feed(mode) + askCamilo()

    // Apply channel accent CSS variable on the panel root
    if (mode.theme?.accent) {
      panel.style.setProperty('--rp-cam-accent', mode.theme.accent)
    } else {
      panel.style.removeProperty('--rp-cam-accent')
    }

    // Wire vertical tabs (visual selection only — content TBD)
    panel.querySelectorAll('[data-cam-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('[data-cam-tab]').forEach(b => b.classList.toggle('active', b === btn))
      })
    })

    // Re-fire store update if Studio (lets camilord-brain reactivity work)
    if (page === 'studio') window.rmStore?.set({})
  }

  document.addEventListener('rm-page-change', e => setMode(e.detail.page))
  document.addEventListener('DOMContentLoaded', () => setMode(window.rmRouter?.currentPage() || 'dashboard'))
})()
