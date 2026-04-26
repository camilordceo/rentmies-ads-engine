/* ─────────────────────────────────────────────────────────────
   Studio store — single source of truth for the form state.
   Tiny pub/sub. Every component subscribes; every input writes.
   Persists to localStorage with a 300ms debounce on changes.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const STORAGE_KEY = 'rm_studio_draft_v1'

  const defaultState = {
    description: '',
    price: '',
    location: '',
    photos: [],          // array of { id, url, isPlaceholder }
    angles: {            // active flags; locked computed from data
      ESTATUS:   true,
      CONFORT:   false,
      INVERSION: true,
      REFUGIO:   true
    },
    channels: ['instagram', 'instagram_stories'],   // default selection
    propertyName: 'Villa Victoria Luxury',
    propertyTipo: 'villa'
  }

  let state = loadFromStorage() || JSON.parse(JSON.stringify(defaultState))
  const listeners = new Set()
  let saveTimer = null

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const saved = JSON.parse(raw)
      // Merge defaults so newly-added fields don't break old drafts
      return { ...defaultState, ...saved, angles: { ...defaultState.angles, ...(saved.angles || {}) } }
    } catch (_) { return null }
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch (_) {}
  }

  function debouncedPersist() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, 300)
  }

  function get() { return state }

  function set(patch) {
    state = { ...state, ...patch }
    debouncedPersist()
    notify()
  }

  // Replace a nested property safely
  function setIn(path, value) {
    const keys = path.split('.')
    const next = JSON.parse(JSON.stringify(state))
    let cursor = next
    for (let i = 0; i < keys.length - 1; i++) {
      cursor[keys[i]] = cursor[keys[i]] || {}
      cursor = cursor[keys[i]]
    }
    cursor[keys[keys.length - 1]] = value
    state = next
    debouncedPersist()
    notify()
  }

  function notify() {
    for (const fn of listeners) {
      try { fn(state) } catch (e) { console.warn('[store] listener error:', e) }
    }
  }

  function subscribe(fn) {
    listeners.add(fn)
    fn(state)  // emit current state immediately
    return () => listeners.delete(fn)
  }

  function reset() {
    state = JSON.parse(JSON.stringify(defaultState))
    persist()
    notify()
  }

  // ── Derived selectors ──

  function computeEnergy(s) {
    const st = s || state
    let score = 0
    if ((st.description || '').trim().length >= 40)  score += 20
    if ((st.price || '').trim().length > 0)           score += 15
    if ((st.location || '').trim().length > 0)        score += 15
    const photoCount = st.photos.filter(p => !p.isPlaceholder).length
    if (photoCount >= 3) score += 20
    if (photoCount >= 6) score += 30
    return Math.min(100, score)
  }

  function isFullyFueled(s) { return computeEnergy(s) >= 95 }

  // ── Public API ──
  window.rmStore = {
    get, set, setIn, subscribe, reset,
    computeEnergy, isFullyFueled,
    defaults: defaultState
  }
})()
