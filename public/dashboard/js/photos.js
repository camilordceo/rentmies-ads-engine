/* ─────────────────────────────────────────────────────────────
   Photo grid — 6 placeholder slots seeded with varied gradients,
   each replaceable by URL or upload. Drag-reorder via HTML5 DnD.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const SEED_TONES = ['dark', 'warm', 'leaf', 'sand', 'ocean', 'rose']
  const MAX_PHOTOS = 12

  let mounted = false

  function ensureSeed() {
    const s = window.rmStore.get()
    if (!s.photos || s.photos.length === 0) {
      const seeded = SEED_TONES.map((tone, i) => ({
        id: `seed_${i}`,
        url: '',
        tone,
        isPlaceholder: true
      }))
      window.rmStore.set({ photos: seeded })
    }
  }

  function html(state) {
    const photos = state.photos || []
    const realCount = photos.filter(p => !p.isPlaceholder).length
    const total = photos.length
    return `
      <div class="ae-formcard">
        <div class="ae-formcard-h">
          <span>Contenido Visual</span>
          <span class="rm-mono" style="font-size:11px; color:var(--rm-muted);">${realCount} <span style="opacity:0.5">/</span> ${total} fotos</span>
        </div>
        <div class="ae-photogrid">
          ${photos.map((p, i) => photoHtml(p, i)).join('')}
          ${total < MAX_PHOTOS ? `<button class="ae-photo-add" data-add>+ AÑADIR</button>` : ''}
        </div>
        <input type="file" accept="image/*" multiple style="display:none;" data-photo-input>
      </div>
    `
  }

  function photoHtml(p, i) {
    if (p.isPlaceholder || !p.url) {
      return `
        <div class="ae-photo placeholder" data-tone="${p.tone || 'dark'}" draggable="true" data-idx="${i}">
          ${p.tone ? '' : 'PLACEHOLDER'}
        </div>
      `
    }
    return `
      <div class="ae-photo" draggable="true" data-idx="${i}">
        <img src="${p.url}" alt="">
        <button class="ae-photo-rm" data-rm="${i}" title="Eliminar">×</button>
      </div>
    `
  }

  function wire(slot) {
    const input = slot.querySelector('[data-photo-input]')
    const addBtn = slot.querySelector('[data-add]')

    if (addBtn) addBtn.addEventListener('click', () => input.click())

    if (input) {
      input.addEventListener('change', async () => {
        const files = Array.from(input.files || [])
        if (!files.length) return
        // Read each as data URL — for FASE 2 we keep them client-side.
        // FASE 3 will swap to Supabase Storage upload.
        const newOnes = await Promise.all(files.map(readFileAsDataUrl))
        const photos = [...window.rmStore.get().photos]
        // Replace placeholders first, then append.
        let inserted = 0
        for (let i = 0; i < photos.length && inserted < newOnes.length; i++) {
          if (photos[i].isPlaceholder) {
            photos[i] = { id: `up_${Date.now()}_${i}`, url: newOnes[inserted++], isPlaceholder: false }
          }
        }
        while (inserted < newOnes.length && photos.length < MAX_PHOTOS) {
          photos.push({ id: `up_${Date.now()}_${photos.length}`, url: newOnes[inserted++], isPlaceholder: false })
        }
        window.rmStore.set({ photos })
        input.value = ''
      })
    }

    slot.querySelectorAll('[data-rm]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        const idx = parseInt(btn.dataset.rm, 10)
        const photos = [...window.rmStore.get().photos]
        // Replace with a placeholder so the grid keeps its shape
        photos[idx] = { id: `ph_${Date.now()}_${idx}`, url: '', tone: SEED_TONES[idx % SEED_TONES.length], isPlaceholder: true }
        window.rmStore.set({ photos })
      })
    })

    // ── Drag and drop reorder ──
    let dragFromIdx = null
    slot.querySelectorAll('.ae-photo').forEach(el => {
      el.addEventListener('dragstart', e => {
        dragFromIdx = parseInt(el.dataset.idx, 10)
        el.classList.add('dragging')
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(dragFromIdx))
      })
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging')
        slot.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'))
      })
      el.addEventListener('dragover', e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        slot.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'))
        el.classList.add('drop-target')
      })
      el.addEventListener('drop', e => {
        e.preventDefault()
        const toIdx = parseInt(el.dataset.idx, 10)
        if (dragFromIdx == null || dragFromIdx === toIdx) return
        const photos = [...window.rmStore.get().photos]
        const [moved] = photos.splice(dragFromIdx, 1)
        photos.splice(toIdx, 0, moved)
        window.rmStore.set({ photos })
      })
    })
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(r.error)
      r.readAsDataURL(file)
    })
  }

  function mount() {
    const slot = document.querySelector('[data-slot="photos"]')
    if (!slot) return
    ensureSeed()
    window.rmStore.subscribe(state => {
      slot.innerHTML = html(state)
      wire(slot)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }
})()
