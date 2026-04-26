/* ─────────────────────────────────────────────────────────────
   Toast — minimal, slide-in top-right, auto-dismiss 4s.
   Public API: rmToast(message, kind?, opts?)
     kind: 'success' | 'error' | 'info' (default success)
     opts: { duration: ms (default 4000), id: string }
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const ICON = { success: '✓', error: '✕', info: 'i' }

  function ensureStack() {
    let stack = document.querySelector('.ae-toast-stack')
    if (!stack) {
      stack = document.createElement('div')
      stack.className = 'ae-toast-stack'
      document.body.appendChild(stack)
    }
    return stack
  }

  function show(message, kind, opts) {
    kind = kind || 'success'
    opts = opts || {}
    const duration = typeof opts.duration === 'number' ? opts.duration : 4000
    const stack = ensureStack()

    const toast = document.createElement('div')
    toast.className = `ae-toast ${kind}`
    if (opts.id) toast.dataset.id = opts.id
    toast.innerHTML = `
      <span class="ae-toast-icon">${ICON[kind] || ICON.success}</span>
      <div class="ae-toast-body">${escapeHtml(message)}</div>
      <button class="ae-toast-close" aria-label="Cerrar">×</button>
    `
    stack.appendChild(toast)
    requestAnimationFrame(() => toast.classList.add('in'))

    const dismiss = () => {
      toast.classList.remove('in')
      setTimeout(() => toast.remove(), 220)
    }
    toast.querySelector('.ae-toast-close').addEventListener('click', dismiss)
    if (duration > 0) setTimeout(dismiss, duration)

    return dismiss
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  }

  window.rmToast = show
})()
