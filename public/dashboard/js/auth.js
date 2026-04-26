/* ─────────────────────────────────────────────────────────────
   Auth bootstrap — soft check. Reads sb_token from localStorage,
   verifies via /api/auth-supabase?action=me, and updates the rail
   avatar with the user's initials. Doesn't hard-redirect to /login
   so the user can still preview /dashboard during demos.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  function readUser() {
    try { return JSON.parse(localStorage.getItem('sb_user') || '{}') } catch (_) { return {} }
  }

  function initials(email) {
    if (!email) return 'CR'
    const local = String(email).split('@')[0] || ''
    const parts = local.split(/[._-]/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return (local.slice(0, 2)).toUpperCase()
  }

  function updateAvatar(user) {
    const av = document.querySelector('.ae-rail-avatar')
    if (!av) return
    const ini = initials(user?.email)
    av.textContent = ini
    av.title = user?.email ? `${user.email} · click para cerrar sesión` : 'Sin sesión'
  }

  async function verifyToken() {
    const token = localStorage.getItem('sb_token')
    if (!token) return null
    try {
      const r = await fetch('/api/auth-supabase?action=me', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!r.ok) return null
      const data = await r.json()
      return data.user
    } catch (_) { return null }
  }

  function wireAvatarSignOut() {
    const av = document.querySelector('.ae-rail-avatar')
    if (!av) return
    av.addEventListener('click', () => {
      const token = localStorage.getItem('sb_token')
      if (!token) {
        // No session — go to login
        location.href = '/login'
        return
      }
      if (!confirm('¿Cerrar sesión?')) return
      localStorage.removeItem('sb_token')
      localStorage.removeItem('sb_refresh_token')
      localStorage.removeItem('sb_user')
      window.rmToast?.('Sesión cerrada', 'success')
      setTimeout(() => location.href = '/login', 600)
    })
  }

  document.addEventListener('DOMContentLoaded', async () => {
    let user = readUser()
    updateAvatar(user)
    wireAvatarSignOut()

    const verified = await verifyToken()
    if (verified) {
      localStorage.setItem('sb_user', JSON.stringify({ id: verified.id, email: verified.email }))
      updateAvatar(verified)
    } else if (localStorage.getItem('sb_token')) {
      // Had a token but it's no longer valid — clear silently and warn once
      localStorage.removeItem('sb_token')
      window.rmToast?.('Sesión expirada — ingresa de nuevo', 'info')
    }
  })
})()
