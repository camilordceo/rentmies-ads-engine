/* ─────────────────────────────────────────────────────────────
   Shared UI components — pure HTML-string factories
   Each function takes a plain object and returns markup. No DOM
   ownership, no listeners attached — callers wire interactivity
   themselves. This keeps components composable and testable.

   Public API on window.rmc:
     escapeHtml(s)
     statTile({ label, value, delta?, up?, highlight? })
     statusPill({ kind, label })            kind: 'ok' | 'warn' | 'off' | 'busy'
     aiBadge(label?)
     channelCard({ key, name, emoji, accent, href, stats?, recent?, delta?, deltaUp?, paused? })
     emptyState({ icon?, eyebrow?, title, body?, ctaLabel?, ctaHref?, ctaAction? })
     liveFeed({ title?, items: [{title, body, time, channel?}] })
     skeleton({ rows? })

   CSS classes use the `.rmc-` prefix; component styles live in
   css/shared/components.css (loaded once in index.html).
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  function escapeHtml (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  }
  function escapeAttr (s) { return String(s == null ? '' : s).replace(/"/g, '&quot;') }

  // ── StatTile ─────────────────────────────────────────────
  // KPI card with value + label + optional delta arrow.
  function statTile (opts) {
    const { label, value, delta, up, highlight } = opts || {}
    return `
      <div class="rmc-stat ${highlight ? 'is-highlight' : ''}">
        <div class="rmc-stat-label">${escapeHtml(label)}</div>
        <div class="rmc-stat-value">${escapeHtml(value)}</div>
        ${delta ? `<div class="rmc-stat-delta ${up ? 'up' : 'down'}">${up ? '↗' : '↘'} ${escapeHtml(delta)}</div>` : ''}
      </div>
    `
  }

  // ── StatusPill ───────────────────────────────────────────
  // Small inline pill with traffic-light color based on `kind`.
  function statusPill (opts) {
    const kind = (opts && opts.kind) || 'off'
    const label = (opts && opts.label) || ''
    return `
      <span class="rmc-pill rmc-pill--${escapeAttr(kind)}">
        <span class="rmc-pill-dot"></span>
        <span>${escapeHtml(label)}</span>
      </span>
    `
  }

  // ── AIBadge ──────────────────────────────────────────────
  // Pulsing teal dot + uppercase label, used to signal AI-driven UI.
  function aiBadge (label) {
    return `
      <span class="rmc-ai-badge">
        <span class="rmc-ai-badge-dot"></span>
        <span>${escapeHtml(label || 'AI')}</span>
      </span>
    `
  }

  // ── ChannelCard ──────────────────────────────────────────
  // Compact card representing a channel's status and a CTA to
  // its dedicated page. Used in dashboard overview + settings.
  function channelCard (opts) {
    const o = opts || {}
    const stats = o.stats || []
    const arrow = o.deltaUp === true ? '↗' : o.deltaUp === false ? '↘' : '·'
    const deltaClass = o.deltaUp === true ? 'up' : o.deltaUp === false ? 'down' : 'flat'
    return `
      <a href="${escapeAttr(o.href || '#')}" class="rmc-channel-card ${o.paused ? 'is-paused' : ''}" data-channel="${escapeAttr(o.key)}" style="--ch-accent:${escapeAttr(o.accent || 'var(--rp-teal,#40d99d)')};">
        <div class="rmc-channel-card-h">
          <span class="rmc-channel-card-emoji">${o.emoji || '•'}</span>
          <span class="rmc-channel-card-name">${escapeHtml(o.name || '')}</span>
          <span class="rmc-channel-card-pulse"></span>
        </div>
        ${stats.length ? `
          <div class="rmc-channel-card-stats">
            ${stats.map(s => `
              <div>
                <div class="rmc-channel-card-stat-label">${escapeHtml(s.label || '')}</div>
                <div class="rmc-channel-card-stat-val">${escapeHtml(s.value || '')}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${o.delta ? `<div class="rmc-channel-card-delta ${deltaClass}">${arrow} ${escapeHtml(o.delta)}</div>` : ''}
        ${o.recent ? `<div class="rmc-channel-card-recent">${escapeHtml(o.recent)}</div>` : ''}
        ${o.cta ? `<div class="rmc-channel-card-cta">${escapeHtml(o.cta)} →</div>` : ''}
      </a>
    `
  }

  // ── EmptyState ───────────────────────────────────────────
  // Generic empty state with icon, title, body, optional CTA.
  function emptyState (opts) {
    const o = opts || {}
    const cta = o.ctaLabel
      ? (o.ctaHref
          ? `<a class="rmc-empty-cta" href="${escapeAttr(o.ctaHref)}">${escapeHtml(o.ctaLabel)}</a>`
          : `<button type="button" class="rmc-empty-cta" data-action="${escapeAttr(o.ctaAction || '')}">${escapeHtml(o.ctaLabel)}</button>`)
      : ''
    return `
      <div class="rmc-empty">
        ${o.icon ? `<div class="rmc-empty-icon">${o.icon}</div>` : ''}
        ${o.eyebrow ? `<div class="rmc-empty-eyebrow">${escapeHtml(o.eyebrow)}</div>` : ''}
        <div class="rmc-empty-title">${escapeHtml(o.title || '')}</div>
        ${o.body ? `<p class="rmc-empty-body">${escapeHtml(o.body)}</p>` : ''}
        ${cta}
      </div>
    `
  }

  // ── LiveFeed ─────────────────────────────────────────────
  // Terminal-styled feed for activity logs / live updates.
  function liveFeed (opts) {
    const items = (opts && opts.items) || []
    return `
      ${opts && opts.title ? `<div class="rmc-livefeed-title">${escapeHtml(opts.title)}</div>` : ''}
      <div class="rmc-livefeed">
        ${items.map(it => `
          <div class="rmc-livefeed-row ${it.channel ? 'rmc-channel-' + it.channel : ''}">
            <span class="rmc-livefeed-time">${escapeHtml(it.time || '')}</span>
            <span class="rmc-livefeed-title2">${escapeHtml(it.title || '')}</span>
            ${it.body ? `<span class="rmc-livefeed-body">${escapeHtml(it.body)}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `
  }

  // ── Skeleton ─────────────────────────────────────────────
  function skeleton (opts) {
    const rows = (opts && opts.rows) || 3
    return `
      <div class="rmc-skel">
        ${Array.from({ length: rows }).map(() => '<div class="rmc-skel-row"></div>').join('')}
      </div>
    `
  }

  window.rmc = {
    escapeHtml,
    escapeAttr,
    statTile,
    statusPill,
    aiBadge,
    channelCard,
    emptyState,
    liveFeed,
    skeleton
  }
})()
