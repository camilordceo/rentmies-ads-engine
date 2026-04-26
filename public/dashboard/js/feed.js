/* ─────────────────────────────────────────────────────────────
   Live Feed — terminal-style stream of AI activity.
   Mock event generator emits one event every 2-4s while the
   feed is visible. Step 29 will swap to a Supabase realtime
   subscription on ad_ai_logs.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const MAX_LINES = 50

  const TEMPLATES = {
    GEN: [
      'Generating headline for <em>Villa Victoria</em>',
      'Generating carousel slides for <em>Castelo</em>',
      'Generating Reels script for <em>Praseo</em>',
      'Variation A for ángulo <em>Estatus</em> ready',
      'Variation B for ángulo <em>Refugio</em> ready',
      'Caption rewrite — focus shifted to escasez'
    ],
    PUB: [
      'Published to Meta Feed → <em>ad_8472</em>',
      'Published to Instagram Stories → <em>st_3392</em>',
      'Published WhatsApp Status → <em>wa_1882</em>',
      'TikTok upload complete — moderation pending',
      'Facebook Marketplace listing live → <em>fb_4421</em>'
    ],
    OPT: [
      'Scaling budget +50% on top performer <em>ad_8423</em>',
      'Reasignando €120 TikTok → Meta (CPL Δ -42%)',
      'Auto-bid enabled on Meta — target CPM lead-gen',
      'Pausing horario 02:00-05:00 (zero clicks)'
    ],
    PAUSE: [
      'Paused <em>"Pain Point"</em> — CTR 0.4% below threshold',
      'Paused <em>ad_8211</em> — frequency cap reached',
      'Pausing geo Bogotá-Sur — CPL 3x average'
    ]
  }

  const KINDS = ['GEN', 'GEN', 'PUB', 'OPT', 'PUB', 'GEN', 'OPT', 'PAUSE']

  let timer = null
  let isMounted = false
  let isUserScrolledUp = false

  function nowHHMM() {
    const d = new Date()
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  }

  function makeEvent() {
    const action = KINDS[Math.floor(Math.random() * KINDS.length)]
    const text = TEMPLATES[action][Math.floor(Math.random() * TEMPLATES[action].length)]
    return { ts: nowHHMM(), action, text }
  }

  function appendLine(feed, ev) {
    const line = document.createElement('div')
    line.className = 'ae-feed-line ae-feed-in'
    line.innerHTML = `
      <span class="ae-feed-time">${ev.ts}</span>
      <span class="ae-feed-tag ae-feed-tag-${ev.action.toLowerCase()}">[${ev.action}]</span>
      <span class="ae-feed-text">${ev.text}</span>
    `
    feed.appendChild(line)
    while (feed.children.length > MAX_LINES) feed.removeChild(feed.firstChild)
    if (!isUserScrolledUp) feed.scrollTop = feed.scrollHeight
  }

  function startEmitting() {
    if (timer) return
    const tick = () => {
      const feed = document.querySelector('.ae-feed')
      if (feed) appendLine(feed, makeEvent())
      const next = 1800 + Math.random() * 2400
      timer = setTimeout(tick, next)
    }
    timer = setTimeout(tick, 1500)
  }

  function stopEmitting() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function attachScrollWatcher(feed) {
    feed.addEventListener('scroll', () => {
      const distFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight
      isUserScrolledUp = distFromBottom > 60
    })
  }

  function seed(feed) {
    // Seed with a few rows so the panel doesn't open empty
    const seedEvents = [
      { ts: '00:42', action: 'GEN',   text: 'Generating headline for <em>Villa Victoria</em>' },
      { ts: '00:43', action: 'PUB',   text: 'Published to Meta Feed → <em>ad_8472</em>' },
      { ts: '00:44', action: 'OPT',   text: 'Scaling budget +50% on top performer' },
      { ts: '00:45', action: 'PAUSE', text: 'Paused <em>"Pain Point"</em> — CTR 0.4%' }
    ]
    seedEvents.forEach(ev => appendLine(feed, ev))
  }

  function mount() {
    const slot = document.getElementById('history-feed-slot')
    if (!slot) return
    slot.innerHTML = `
      <div class="ae-feed-wrap">
        <div class="ae-feed-head">
          <div class="ae-feed-head-title">
            <span class="ae-live-dot"></span>
            Feed en vivo · IA
          </div>
          <span class="rm-mono" style="font-size:10px; color:var(--rm-muted); letter-spacing:0.1em;">STREAMING · MOCK</span>
        </div>
        <div class="ae-feed" tabindex="0" aria-label="Stream de eventos de Camilord"></div>
      </div>
    `
    const feed = slot.querySelector('.ae-feed')
    attachScrollWatcher(feed)
    seed(feed)
    isMounted = true
    startEmitting()
  }

  document.addEventListener('rm-page-change', e => {
    if (e.detail.page === 'history') {
      // Wait one tick for history.js to render its DOM
      setTimeout(() => {
        if (!isMounted) mount()
        else startEmitting()
      }, 50)
    } else {
      stopEmitting()
    }
  })

  document.addEventListener('DOMContentLoaded', () => {
    // If history is the initial page, mount after history.js renders
    if ((window.rmRouter?.currentPage() || 'studio') === 'history') {
      setTimeout(mount, 50)
    }
  })

  // Public API for step 29 to stream real events when wired
  window.rmFeedAppend = function (event) {
    const feed = document.querySelector('.ae-feed')
    if (feed && event && event.action) appendLine(feed, event)
  }

  // Called by history.js after it re-renders (e.g., filter change wipes the slot)
  window.rmFeedRemount = function () {
    isMounted = false
    mount()
  }
})()
