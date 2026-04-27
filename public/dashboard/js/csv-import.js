/* ─────────────────────────────────────────────────────────────
   CSV / Excel import for inmuebles.
   - CSV: parsed inline (handles quoted fields with commas)
   - Excel (.xlsx/.xls): lazy-loads SheetJS from CDN
   Maps columns by NORMALIZED header (case/space/underscore
   insensitive) so "image_link_1", "Image Link 1", "IMAGELINK1"
   all match the same target field.
   ───────────────────────────────────────────────────────────── */

(function () {
  'use strict'

  const SHEETJS_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
  let sheetjsPromise = null

  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX)
    if (sheetjsPromise) return sheetjsPromise
    sheetjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SHEETJS_CDN
      s.async = true
      s.onload = () => resolve(window.XLSX)
      s.onerror = () => reject(new Error('No se pudo cargar SheetJS desde CDN'))
      document.head.appendChild(s)
    })
    return sheetjsPromise
  }

  function normalizeKey(k) {
    return String(k || '')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
  }

  // Map of normalized header → canonical field name on the imported item.
  // The first match wins.
  const HEADER_ALIASES = {
    // Identifiers
    'codigoidentificadorinmueble': 'id',
    'codigodomus': 'id_domus',
    'codigofincaraiz': 'id_finca_raiz',
    'codigometrocuadrado': 'id_metro_cuadrado',
    'idassistant': 'id_assistant',
    // Naming / location
    'nombrebarrio': 'nombre_barrio',
    'nombreciudad': 'nombre_ciudad',
    'zona': 'zona',
    'empresa': 'empresa',
    // Description
    'descripcioninmueblepropiedad': 'descripcion_inmueble_propiedad',
    'fichatecnica': 'ficha_tecnica',
    // Sizing
    'antiguedad': 'antiguedad',
    'areaconstruida': 'area_construida',
    'areatotalm2': 'area_total_m2',
    // Rooms
    'numerobanos': 'numero_banos',
    'habitaciones': 'habitaciones',
    'numerohabitaciones': 'habitaciones',
    // Pricing
    'valoradministracion': 'valor_administracion',
    'valorarriendo': 'valor_arriendo',
    'valorventa': 'valor_venta',
    'tipotransaccionnegocio': 'tipo_transaccion_negocio',
    // Media
    'imagelink1': 'image_link_1',
    'imagelink2': 'image_link_2',
    'imagelink3': 'image_link_3',
    'video': 'video',
    // External URLs
    'urlengel': 'url_engel',
    'urlcentury21': 'url_century21',
    // Broker contact
    'brokeremail': 'broker_email',
    'brokername': 'broker_name'
  }

  // ── CSV parser (handles quoted fields with commas/newlines) ─

  function parseCsv(text) {
    const rows = []
    let row = []
    let field = ''
    let inQuotes = false
    let i = 0
    const n = text.length
    while (i < n) {
      const c = text[i]
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue }
          inQuotes = false; i++
        } else { field += c; i++ }
      } else {
        if (c === '"') { inQuotes = true; i++ }
        else if (c === ',') { row.push(field); field = ''; i++ }
        else if (c === '\r') { i++ }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++ }
        else if (c === '\t' && row.length === 0 && field === '') { /* skip */ i++ }
        else { field += c; i++ }
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row) }
    return rows.filter(r => r.some(cell => String(cell).trim() !== ''))
  }

  // Auto-detect delimiter (comma vs tab vs semicolon) from first line
  function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/)[0] || ''
    const counts = { ',': 0, ';': 0, '\t': 0 }
    let inQuotes = false
    for (const c of firstLine) {
      if (c === '"') { inQuotes = !inQuotes; continue }
      if (!inQuotes && counts.hasOwnProperty(c)) counts[c]++
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  }

  function parseCsvWithDelimiter(text, delimiter) {
    if (delimiter === ',') return parseCsv(text)
    // Re-do with custom delimiter
    const rows = []
    let row = []
    let field = ''
    let inQuotes = false
    let i = 0
    const n = text.length
    while (i < n) {
      const c = text[i]
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue }
          inQuotes = false; i++
        } else { field += c; i++ }
      } else {
        if (c === '"') { inQuotes = true; i++ }
        else if (c === delimiter) { row.push(field); field = ''; i++ }
        else if (c === '\r') { i++ }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++ }
        else { field += c; i++ }
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row) }
    return rows.filter(r => r.some(cell => String(cell).trim() !== ''))
  }

  // ── Excel parser (SheetJS) ──────────────────────────────────

  async function parseExcel(file) {
    const xlsx = await loadSheetJs()
    const buf = await file.arrayBuffer()
    const wb = xlsx.read(buf, { type: 'array' })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) throw new Error('El archivo Excel no tiene hojas')
    const sheet = wb.Sheets[sheetName]
    const aoa = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
    return aoa
  }

  // ── Row → normalized inmueble ───────────────────────────────

  function rowsToInmuebles(rows) {
    if (!rows || rows.length < 2) return { items: [], unmappedHeaders: [], headers: [] }
    const headers = (rows[0] || []).map(h => String(h || '').trim())
    const fieldMap = headers.map(h => HEADER_ALIASES[normalizeKey(h)] || null)
    const unmapped = headers.filter((h, i) => !fieldMap[i] && h)

    const items = []
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      if (!row || row.every(c => String(c).trim() === '')) continue
      const obj = { _raw: {} }
      for (let c = 0; c < headers.length; c++) {
        const h = headers[c]
        const v = row[c]
        if (v === undefined || v === null || String(v).trim() === '') continue
        const field = fieldMap[c]
        if (field) obj[field] = String(v).trim()
        // always store raw under original header name for full fidelity
        obj._raw[h] = v
      }
      // Derive primary fields
      obj.id = obj.id || obj.id_finca_raiz || obj.id_domus || `imp_${Date.now()}_${r}`
      obj.imagen = obj.image_link_1 || ''
      obj.proyecto = obj.nombre_barrio || obj.zona || ''
      obj.ciudad = obj.nombre_ciudad || ''
      obj.tipo = obj.tipo_transaccion_negocio || ''
      obj.descripcion = obj.descripcion_inmueble_propiedad || ''
      // Numeric coercions
      if (obj.area_construida) obj.area = parseFloat(String(obj.area_construida).replace(/[^\d.]/g, '')) || null
      if (obj.numero_banos) obj.banos = parseInt(String(obj.numero_banos).replace(/[^\d]/g, ''), 10) || null
      if (obj.valor_arriendo) obj.precio = parseInt(String(obj.valor_arriendo).replace(/[^\d]/g, ''), 10) || null
      else if (obj.valor_venta) obj.precio = parseInt(String(obj.valor_venta).replace(/[^\d]/g, ''), 10) || null
      obj.transaccion = obj.tipo_transaccion_negocio || ''
      items.push(obj)
    }
    return { items, unmappedHeaders: unmapped, headers, fieldMap }
  }

  // ── Modal UI ────────────────────────────────────────────────

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
  }

  function modalHtml() {
    return `
      <div class="rm-csv-overlay" id="rm-csv-overlay">
        <div class="rm-csv-modal">
          <div class="rm-csv-head">
            <div>
              <div class="rm-csv-eyebrow">IMPORTAR INVENTARIO</div>
              <h2 class="rm-csv-title">CSV o Excel</h2>
            </div>
            <button class="rm-csv-close" id="rm-csv-close" aria-label="Cerrar">×</button>
          </div>

          <div class="rm-csv-body" id="rm-csv-body">
            <div class="rm-csv-step" data-step="pick">
              <p class="rm-csv-help">Sube tu lista de inmuebles. Reconocemos automáticamente las 27 columnas estándar (image_link_1, nombre_barrio, valor_arriendo, etc.). Lo demás se guarda en bruto por si lo necesitas después.</p>
              <label class="rm-csv-uploader" for="rm-csv-file">
                <div class="rm-csv-uploader-title">📂 Elegir archivo</div>
                <div class="rm-csv-uploader-hint">CSV (UTF-8) · Excel (.xlsx, .xls) · primera fila = encabezados</div>
                <input id="rm-csv-file" type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style="display:none;" />
              </label>
              <div class="rm-csv-status" id="rm-csv-status"></div>
            </div>

            <div class="rm-csv-step" data-step="preview" style="display:none;">
              <div id="rm-csv-summary" class="rm-csv-summary"></div>
              <div id="rm-csv-table-wrap" class="rm-csv-table-wrap"></div>
              <div id="rm-csv-unmapped" class="rm-csv-unmapped"></div>
            </div>
          </div>

          <div class="rm-csv-foot">
            <button class="ae-btn-ghost" id="rm-csv-cancel">Cancelar</button>
            <div style="flex:1;"></div>
            <button class="ae-btn-ghost" id="rm-csv-restart" style="display:none;">Otro archivo</button>
            <button class="ae-btn-primary" id="rm-csv-import-btn" style="display:none;">Importar 0 inmuebles</button>
          </div>
        </div>
      </div>
    `
  }

  function injectStylesOnce() {
    if (document.getElementById('rm-csv-styles')) return
    const css = `
      .rm-csv-overlay{position:fixed;inset:0;background:rgba(15,20,16,0.55);backdrop-filter:blur(3px);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:5vh 16px;overflow-y:auto;}
      .rm-csv-modal{background:var(--rm-surface);border:1px solid var(--rm-border);border-radius:8px;box-shadow:var(--rm-shadow-lg, 0 20px 60px rgba(0,0,0,.25));width:100%;max-width:920px;display:flex;flex-direction:column;max-height:90vh;}
      .rm-csv-head{padding:18px 22px;border-bottom:1px solid var(--rm-border);display:flex;align-items:center;justify-content:space-between;}
      .rm-csv-eyebrow{font-family:var(--rm-mono);font-size:10px;letter-spacing:0.15em;color:var(--rm-muted);text-transform:uppercase;font-weight:700;}
      .rm-csv-title{font-size:22px;font-weight:600;color:var(--rm-ink);margin:4px 0 0;letter-spacing:-0.01em;}
      .rm-csv-close{background:none;border:none;font-size:28px;color:var(--rm-muted);cursor:pointer;line-height:1;width:32px;height:32px;border-radius:4px;display:flex;align-items:center;justify-content:center;}
      .rm-csv-close:hover{background:var(--rm-surface-2);color:var(--rm-ink);}
      .rm-csv-body{padding:22px;flex:1;overflow-y:auto;}
      .rm-csv-help{font-size:13px;color:var(--rm-ink-2);line-height:1.5;margin-bottom:16px;}
      .rm-csv-uploader{display:block;border:2px dashed var(--rm-border-strong);border-radius:6px;padding:36px 18px;text-align:center;cursor:pointer;background:var(--rm-surface-2);transition:all .15s;}
      .rm-csv-uploader:hover{border-color:var(--rm-green-deep);background:rgba(0,77,53,.04);}
      .rm-csv-uploader-title{font-size:14px;font-weight:600;color:var(--rm-ink);}
      .rm-csv-uploader-hint{font-size:11.5px;color:var(--rm-muted);margin-top:6px;}
      .rm-csv-status{margin-top:14px;font-size:12px;color:var(--rm-muted);font-family:var(--rm-mono);min-height:18px;}
      .rm-csv-status.error{color:var(--rm-red);}
      .rm-csv-status.success{color:var(--rm-green-deep);}
      .rm-csv-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px;}
      .rm-csv-stat{background:var(--rm-surface-2);border:1px solid var(--rm-border);border-radius:5px;padding:10px 12px;}
      .rm-csv-stat-num{font-family:var(--rm-mono);font-size:18px;font-weight:700;color:var(--rm-ink);}
      .rm-csv-stat-label{font-size:10px;color:var(--rm-muted);font-family:var(--rm-mono);letter-spacing:0.08em;text-transform:uppercase;margin-top:2px;}
      .rm-csv-table-wrap{border:1px solid var(--rm-border);border-radius:5px;overflow-x:auto;max-height:380px;overflow-y:auto;}
      .rm-csv-table{width:100%;border-collapse:collapse;font-size:11.5px;}
      .rm-csv-table th{position:sticky;top:0;background:var(--rm-surface-2);font-family:var(--rm-mono);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;color:var(--rm-muted);padding:8px 10px;text-align:left;border-bottom:1px solid var(--rm-border);white-space:nowrap;}
      .rm-csv-table td{padding:7px 10px;border-bottom:1px solid var(--rm-border);color:var(--rm-ink-2);vertical-align:top;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .rm-csv-table tr:hover td{background:var(--rm-surface-2);}
      .rm-csv-thumb{width:32px;height:32px;border-radius:3px;object-fit:cover;background:var(--rm-surface-3);}
      .rm-csv-unmapped{margin-top:12px;font-size:11px;color:var(--rm-muted);font-family:var(--rm-mono);}
      .rm-csv-unmapped code{background:var(--rm-surface-2);padding:1px 5px;border-radius:3px;color:var(--rm-amber);margin-right:4px;}
      .rm-csv-foot{padding:14px 22px;border-top:1px solid var(--rm-border);display:flex;align-items:center;gap:10px;background:var(--rm-surface-2);}
      @media (max-width:760px){.rm-csv-modal{max-height:95vh;border-radius:0;}}
    `
    const style = document.createElement('style')
    style.id = 'rm-csv-styles'
    style.textContent = css
    document.head.appendChild(style)
  }

  // ── Public API ──────────────────────────────────────────────

  function open() {
    injectStylesOnce()
    if (document.getElementById('rm-csv-overlay')) return   // already open
    const wrap = document.createElement('div')
    wrap.innerHTML = modalHtml()
    document.body.appendChild(wrap.firstElementChild)
    wireModal()
  }

  function close() {
    const ov = document.getElementById('rm-csv-overlay')
    if (ov) ov.remove()
  }

  let parsedItems = []

  function wireModal() {
    document.getElementById('rm-csv-close').addEventListener('click', close)
    document.getElementById('rm-csv-cancel').addEventListener('click', close)
    document.getElementById('rm-csv-overlay').addEventListener('click', e => {
      if (e.target.id === 'rm-csv-overlay') close()
    })
    document.getElementById('rm-csv-file').addEventListener('change', onFile)
    document.getElementById('rm-csv-restart').addEventListener('click', () => {
      parsedItems = []
      document.querySelector('[data-step="pick"]').style.display = ''
      document.querySelector('[data-step="preview"]').style.display = 'none'
      document.getElementById('rm-csv-import-btn').style.display = 'none'
      document.getElementById('rm-csv-restart').style.display = 'none'
      document.getElementById('rm-csv-status').textContent = ''
      document.getElementById('rm-csv-file').value = ''
    })
    document.getElementById('rm-csv-import-btn').addEventListener('click', confirmImport)
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const status = document.getElementById('rm-csv-status')
    status.classList.remove('error', 'success')
    status.textContent = `Leyendo ${file.name}…`

    let rows
    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      if (ext === 'xlsx' || ext === 'xls') {
        status.textContent = 'Cargando parser Excel (SheetJS)…'
        rows = await parseExcel(file)
      } else {
        const text = await file.text()
        const delim = detectDelimiter(text)
        rows = parseCsvWithDelimiter(text, delim)
      }
    } catch (err) {
      status.textContent = '✗ ' + err.message
      status.classList.add('error')
      return
    }

    const result = rowsToInmuebles(rows)
    if (result.items.length === 0) {
      status.textContent = '✗ No se encontraron inmuebles válidos en el archivo'
      status.classList.add('error')
      return
    }
    parsedItems = result.items
    showPreview(result, file.name)
  }

  function showPreview({ items, unmappedHeaders, headers, fieldMap }, fileName) {
    document.querySelector('[data-step="pick"]').style.display = 'none'
    document.querySelector('[data-step="preview"]').style.display = ''

    const mappedCount = fieldMap.filter(Boolean).length
    const totalCount = headers.length
    const withImage = items.filter(i => i.imagen).length
    const cities = new Set(items.map(i => i.ciudad).filter(Boolean)).size

    document.getElementById('rm-csv-summary').innerHTML = `
      <div class="rm-csv-stat"><div class="rm-csv-stat-num">${items.length}</div><div class="rm-csv-stat-label">Inmuebles</div></div>
      <div class="rm-csv-stat"><div class="rm-csv-stat-num">${withImage}</div><div class="rm-csv-stat-label">Con imagen</div></div>
      <div class="rm-csv-stat"><div class="rm-csv-stat-num">${cities}</div><div class="rm-csv-stat-label">Ciudades</div></div>
      <div class="rm-csv-stat"><div class="rm-csv-stat-num">${mappedCount}/${totalCount}</div><div class="rm-csv-stat-label">Cols mapeadas</div></div>
    `

    // Show first 8 rows in preview table
    const previewItems = items.slice(0, 8)
    const tableHtml = `
      <table class="rm-csv-table">
        <thead>
          <tr>
            <th>Imagen</th>
            <th>Barrio / Proyecto</th>
            <th>Ciudad</th>
            <th>Transacción</th>
            <th>Área</th>
            <th>Baños</th>
            <th>Precio</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          ${previewItems.map(it => `
            <tr>
              <td>${it.imagen ? `<img class="rm-csv-thumb" src="${escapeHtml(it.imagen)}" onerror="this.style.opacity='.3'">` : '—'}</td>
              <td>${escapeHtml(it.proyecto || '—')}</td>
              <td>${escapeHtml(it.ciudad || '—')}</td>
              <td>${escapeHtml(it.transaccion || '—')}</td>
              <td>${escapeHtml(it.area || '—')}</td>
              <td>${escapeHtml(it.banos || '—')}</td>
              <td>${escapeHtml(it.precio ? Number(it.precio).toLocaleString('es-CO') : '—')}</td>
              <td><code>${escapeHtml(String(it.id).slice(0, 18))}</code></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    document.getElementById('rm-csv-table-wrap').innerHTML = tableHtml

    document.getElementById('rm-csv-unmapped').innerHTML = unmappedHeaders.length
      ? `Columnas no mapeadas (se guardan en bruto): ${unmappedHeaders.map(h => `<code>${escapeHtml(h)}</code>`).join('')}`
      : `<span style="color:var(--rm-green-deep);">✓ Todas las columnas reconocidas</span>`

    const importBtn = document.getElementById('rm-csv-import-btn')
    importBtn.style.display = ''
    importBtn.textContent = `Importar ${items.length} inmuebles`
    document.getElementById('rm-csv-restart').style.display = ''
  }

  function confirmImport() {
    if (!parsedItems.length) return
    const existing = window.rmInmuebles?.loadImported() || []
    const existingIds = new Set(existing.map(p => p.id))
    const fresh = parsedItems.filter(p => !existingIds.has(p.id))
    const merged = [...existing.map(p => p._raw || p), ...parsedItems]   // keep raw shape on disk
    window.rmInmuebles?.saveImported(merged)
    window.rmToast?.(`✓ Importados ${parsedItems.length} inmuebles (${fresh.length} nuevos)`, 'success')
    close()
    // Notify pages so they can re-render
    document.dispatchEvent(new CustomEvent('rm-inmuebles-changed'))
  }

  window.rmCsvImport = { open, close }
})()
