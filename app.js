/* app.js — details-based multiselects
   - стабильный выпадающий мультиселект на <details>
   - множественный выбор, кнопки Выбрать всё/Очистить
   - каскад, сохранение, экспорт, сортировка, тултипы
*/

const DATA_URL = 'data.csv';
const STORAGE_KEY = 'matrix_details_filters_v1';

const ROLE_INFO = {
  'О': 'Ответственный: организует и координирует выполнение функции. Назначает исполнителей, контролирует сроки и качество.',
  'В': 'Выполняющий: непосредственно выполняет работу по поручению ответственного.',
  'У': 'Утверждающий: принимает и утверждает результат.',
  'К': 'Консультант: даёт экспертные рекомендации.',
  'И': 'Информируемый: получает информацию о ходе или результате.',
  'П': 'Помощник: содействует выполнению функции ресурсами.',
  'ПК': 'Помощник-консультант: сочетает помощь и экспертизу.'
};

const FILTER_CONFIG = [
  { id: 'filter-function', label: 'Функция', keyCandidates: ['function','функция','Функция','name','Наименование'] },
  { id: 'filter-department', label: 'Департамент', keyCandidates: ['department','департамент','Департамент','dept'] },
  { id: 'filter-division', label: 'Отдел', keyCandidates: ['division','отдел','Отдел'] },
  { id: 'filter-position', label: 'Должность', keyCandidates: ['position','должность','Должность'] },
  { id: 'filter-role', label: 'Роль', keyCandidates: ['role','роль','Роль'] }
];

const LOGICAL_FIELDS = {
  num: ['№','number','No','id','no'],
  func: ['Функция','function','Function','name'],
  product: ['Продукт','product'],
  department: ['Департамент','department'],
  division: ['Отдел','division'],
  position: ['Должность','position'],
  role: ['Роль','role']
};

let rawRows = [];
let lastRenderedRows = [];
let sortState = { key: null, dir: 1 };

document.addEventListener('DOMContentLoaded', () => {
  // build filter placeholders in header (so markup exists before data)
  buildFilterPlaceholders();

  document.getElementById('clear').addEventListener('click', onClearFilters);
  document.getElementById('export').addEventListener('click', onExport);

  // sorting headers
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (!key) return;
      if (sortState.key === key) sortState.dir = -sortState.dir;
      else { sortState.key = key; sortState.dir = 1; }
      updateSortIndicators();
      renderTable();
    });
  });

  if (!document.getElementById('floating-tooltip')) {
    const tip = document.createElement('div');
    tip.id = 'floating-tooltip';
    tip.className = 'floating-tooltip hidden';
    document.body.appendChild(tip);
  }

  loadData();
});

/* build empty .details containers in header based on FILTER_CONFIG */
function buildFilterPlaceholders(){
  const container = document.getElementById('controls-compact');
  FILTER_CONFIG.forEach(cfg => {
    const wrapper = document.querySelector(`.filter-compact[data-filter-id="${cfg.id}"]`);
    if (!wrapper) return;
    const label = document.createElement('label');
    label.textContent = cfg.label;
    wrapper.appendChild(label);
    // details skeleton: will be filled after data load
    const details = document.createElement('details');
    details.className = 'details-multi';
    details.dataset.filterId = cfg.id;
    // summary
    const summary = document.createElement('summary');
    summary.innerHTML = `<div class="details-display"><div class="placeholder">Все</div></div><div class="details-caret">▾</div>`;
    details.appendChild(summary);
    // panel container
    const panel = document.createElement('div');
    panel.className = 'details-panel';
    panel.style.display = 'none'; // initially hidden; will be shown when details[open]
    details.appendChild(panel);

    // hook behaviors: summary click will toggle and stop propagation to document
    summary.addEventListener('click', (e) => {
      // in some browsers click toggles open automatically; we simply stop propagation to avoid accidental document handlers
      e.stopPropagation();
      // close other details
      document.querySelectorAll('.details-multi').forEach(d => { if (d !== details) d.removeAttribute('open'); });
      // panel display toggling
      setTimeout(() => { // small timeout to let browser set open attribute
        if (details.hasAttribute('open')) panel.style.display = 'block'; else panel.style.display = 'none';
      }, 0);
    });

    // clicking inside panel should not close parent (stop propagation)
    panel.addEventListener('click', (e) => e.stopPropagation());

    wrapper.appendChild(details);
  });

  // close details when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.details-multi').forEach(d => { d.removeAttribute('open'); const p = d.querySelector('.details-panel'); if (p) p.style.display='none'; });
  });
}

/* Load CSV */
function loadData(){
  showInfo('Загрузка данных...');
  fetch(DATA_URL)
    .then(r => { if (!r.ok) throw new Error('CSV не найден: ' + r.status); return r.text(); })
    .then(text => {
      const parsed = Papa.parse(text, { header:true, skipEmptyLines:true });
      if (parsed.errors && parsed.errors.length) console.warn('PapaParse errors:', parsed.errors.slice(0,5));
      rawRows = parsed.data.map(r => normalizeRow(r));
      const headers = parsed.meta && parsed.meta.fields ? parsed.meta.fields : (rawRows[0] ? Object.keys(rawRows[0]) : []);
      mapHeaders(headers);
      buildDetailsOptions();
      restoreFilters();
      renderTable();
      hideInfo();
      showToast('Данные загружены', 900);
    })
    .catch(err => { console.error(err); showInfo('Ошибка при загрузке: ' + err.message, true); });
}

function normalizeRow(row){
  const out = {};
  Object.keys(row).forEach(k => {
    const key = String(k).replace(/^\uFEFF/, '').trim();
    const val = row[k] == null ? '' : String(row[k]).replace(/\r/g,'').trim();
    out[key] = val;
  });
  return out;
}

/* map headers to logical keys and set dataset on details elements */
function mapHeaders(headers){
  FILTER_CONFIG.forEach(cfg => {
    const hdr = findHeaderByCandidates(headers, cfg.keyCandidates);
    const details = document.querySelector(`.details-multi[data-filter-id="${cfg.id}"]`);
    if (details) details.dataset.csvHeader = hdr || '';
  });
  // also store mapping for LOGICAL_FIELDS (not necessary but helpful)
  Object.entries(LOGICAL_FIELDS).forEach(([k,cands]) => {
    // nothing global needed; we'll use findFieldValue for row lookups
  });
}

function findHeaderByCandidates(headers, candidates){
  const lowered = headers.map(h => h.toLowerCase().replace(/\s+/g,''));
  for (let cand of candidates){
    const key = cand.toLowerCase().replace(/\s+/g,'');
    const idx = lowered.indexOf(key);
    if (idx !== -1) return headers[idx];
  }
  for (let cand of candidates){
    for (let h of headers){
      if (h.toLowerCase().includes(cand.toLowerCase().replace(/\s+/g,''))) return h;
    }
  }
  return null;
}

/* Build options inside each details panel */
function buildDetailsOptions(){
  FILTER_CONFIG.forEach(cfg => {
    const details = document.querySelector(`.details-multi[data-filter-id="${cfg.id}"]`);
    if (!details) return;
    const hdr = details.dataset.csvHeader;
    const panel = details.querySelector('.details-panel');
    panel.innerHTML = '';

    // actions
    const actions = document.createElement('div');
    actions.className = 'panel-actions';
    const btnAll = document.createElement('button'); btnAll.type='button'; btnAll.textContent='Выбрать всё';
    const btnClear = document.createElement('button'); btnClear.type='button'; btnClear.textContent='Очистить';
    actions.appendChild(btnAll); actions.appendChild(btnClear);
    panel.appendChild(actions);

    // options container
    const options = document.createElement('div');
    options.className = 'options-list';
    panel.appendChild(options);

    // populate values
    const vals = hdr ? Array.from(new Set(rawRows.map(r => r[hdr]).filter(Boolean))) : [];
    vals.sort((a,b)=>a.localeCompare(b,'ru'));
    vals.forEach(v => {
      const row = document.createElement('div'); row.className = 'opt';
      const id = `${cfg.id}___${Math.abs(hashString(v))}`;
      const input = document.createElement('input'); input.type='checkbox'; input.id = id; input.value = v;
      const label = document.createElement('label'); label.htmlFor = id; label.textContent = v;
      input.addEventListener('change', (e) => { e.stopPropagation(); onDetailsSelectionChange(cfg.id); });
      row.appendChild(input); row.appendChild(label);
      options.appendChild(row);
    });

    // actions handlers
    btnAll.addEventListener('click', (e) => { e.stopPropagation(); Array.from(panel.querySelectorAll('input[type=checkbox]')).forEach(ch => ch.checked = true); onDetailsSelectionChange(cfg.id); });
    btnClear.addEventListener('click', (e) => { e.stopPropagation(); Array.from(panel.querySelectorAll('input[type=checkbox]')).forEach(ch => ch.checked = false); onDetailsSelectionChange(cfg.id); });

    // render display (placeholder or chips)
    renderDetailsDisplay(cfg.id);
  });
}

/* helpers */
function hashString(s){ let h=0; for (let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i); return (h>>>0).toString(36); }

function getDetailsSelectedValues(filterId){
  const details = document.querySelector(`.details-multi[data-filter-id="${filterId}"]`);
  if (!details) return [];
  return Array.from(details.querySelectorAll('input[type=checkbox]:checked')).map(i=>i.value);
}

function setDetailsSelectedValues(filterId, arr){
  const details = document.querySelector(`.details-multi[data-filter-id="${filterId}"]`);
  if (!details) return;
  Array.from(details.querySelectorAll('input[type=checkbox]')).forEach(i => i.checked = arr.includes(i.value));
  renderDetailsDisplay(filterId);
}

/* update the summary display (chips or placeholder) */
function renderDetailsDisplay(filterId){
  const details = document.querySelector(`.details-multi[data-filter-id="${filterId}"]`);
  if (!details) return;
  const summary = details.querySelector('summary');
  const display = summary.querySelector('.details-display');
  display.innerHTML = '';
  const vals = getDetailsSelectedValues(filterId);
  if (!vals.length){
    const ph = document.createElement('div'); ph.className='placeholder'; ph.textContent='Все';
    display.appendChild(ph);
  } else if (vals.length <= 3){
    vals.forEach(v => { const chip = document.createElement('div'); chip.className='chip'; chip.textContent = v; display.appendChild(chip); });
  } else {
    const chip = document.createElement('div'); chip.className='chip'; chip.textContent = `${vals.length} выбрано`; display.appendChild(chip);
  }
  // caret handled by CSS
}

/* called when user changes checkbox inside details panel */
function onDetailsSelectionChange(filterId){
  renderDetailsDisplay(filterId);
  saveFilters();
  cascadeFilters();
  renderTable();
}

/* cascade filtering: recompute allowed options for each filter */
function cascadeFilters(){
  FILTER_CONFIG.forEach(cfg => {
    const details = document.querySelector(`.details-multi[data-filter-id="${cfg.id}"]`);
    if (!details) return;
    const hdr = details.dataset.csvHeader;
    if (!hdr) return;
    // subset of rows matching other filters
    const subset = rawRows.filter(r => {
      return FILTER_CONFIG.every(other => {
        if (other.id === cfg.id) return true;
        const otherDetails = document.querySelector(`.details-multi[data-filter-id="${other.id}"]`);
        if (!otherDetails) return true;
        const sel = getDetailsSelectedValues(other.id);
        if (!sel.length) return true;
        return sel.includes(r[ otherDetails.dataset.csvHeader ]);
      });
    });
    const allowed = Array.from(new Set(subset.map(r => r[hdr]).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ru'));
    // rebuild options but preserve selections
    const current = getDetailsSelectedValues(cfg.id);
    const panel = details.querySelector('.details-panel');
    const opts = panel.querySelector('.options-list');
    opts.innerHTML = '';
    allowed.forEach(v => {
      const row = document.createElement('div'); row.className='opt';
      const id = `${cfg.id}___${Math.abs(hashString(v))}`;
      const input = document.createElement('input'); input.type='checkbox'; input.id=id; input.value=v;
      if (current.includes(v)) input.checked = true;
      const label = document.createElement('label'); label.htmlFor=id; label.textContent = v;
      input.addEventListener('change',(e)=>{ e.stopPropagation(); onDetailsSelectionChange(cfg.id); });
      row.appendChild(input); row.appendChild(label);
      opts.appendChild(row);
    });
    renderDetailsDisplay(cfg.id);
  });
}

/* save / restore filters */
function saveFilters(){
  const obj = {};
  FILTER_CONFIG.forEach(cfg => { obj[cfg.id] = getDetailsSelectedValues(cfg.id); });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}
function restoreFilters(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    FILTER_CONFIG.forEach(cfg => {
      const vals = obj[cfg.id] || [];
      // if options not built yet, apply after build
      setDetailsSelectedValues(cfg.id, vals);
    });
    cascadeFilters();
  } catch(e){ console.warn('restore filters err', e); }
}

/* clear */
function onClearFilters(){
  FILTER_CONFIG.forEach(cfg => {
    const details = document.querySelector(`.details-multi[data-filter-id="${cfg.id}"]`);
    if (!details) return;
    Array.from(details.querySelectorAll('input[type=checkbox]')).forEach(i => i.checked = false);
    renderDetailsDisplay(cfg.id);
  });
  localStorage.removeItem(STORAGE_KEY);
  renderTable();
  showToast('Фильтры сброшены', 900);
}

/* Render table with current filters+sorting */
function renderTable(){
  const tbody = document.querySelector('#matrix tbody');
  if (!tbody) return;

  // active filter map
  const active = {};
  FILTER_CONFIG.forEach(cfg => {
    const details = document.querySelector(`.details-multi[data-filter-id="${cfg.id}"]`);
    active[ details.dataset.csvHeader || '' ] = getDetailsSelectedValues(cfg.id);
  });

  let rows = rawRows.filter(r => {
    return Object.entries(active).every(([hdr, vals]) => {
      if (!hdr) return true;
      if (!vals || !vals.length) return true;
      return vals.includes(r[hdr]);
    });
  });

  // sorting
  if (sortState.key){
    const cand = LOGICAL_FIELDS[sortState.key] || LOGICAL_FIELDS['func'];
    rows.sort((a,b) => {
      const va = (getFieldValue(a,cand)||'').toString().toLowerCase();
      const vb = (getFieldValue(b,cand)||'').toString().toLowerCase();
      if (va < vb) return -1 * sortState.dir;
      if (va > vb) return 1 * sortState.dir;
      return 0;
    });
  }

  lastRenderedRows = rows;

  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="7" style="padding:18px 12px; color:#666">Нет данных по выбранным фильтрам</td></tr>`;
    attachTooltips();
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const num = getFieldValue(row, LOGICAL_FIELDS.num);
    const func = getFieldValue(row, LOGICAL_FIELDS.func);
    const product = getFieldValue(row, LOGICAL_FIELDS.product);
    const department = getFieldValue(row, LOGICAL_FIELDS.department);
    const division = getFieldValue(row, LOGICAL_FIELDS.division);
    const position = getFieldValue(row, LOGICAL_FIELDS.position);
    const roleKey = getFieldValue(row, LOGICAL_FIELDS.role);
    const roleDesc = ROLE_INFO[roleKey] || '';

    return `<tr>
      <td class="col-id">${escapeHtml(num)}</td>
      <td class="col-function">${escapeHtml(func)}</td>
      <td class="col-text-medium">${escapeHtml(product)}</td>
      <td class="col-department">${escapeHtml(department)}</td>
      <td class="col-division">${escapeHtml(division)}</td>
      <td class="col-position">${escapeHtml(position)}</td>
      <td class="col-role"><div class="rolewrap"><span class="role" data-tooltip="${escapeHtmlAttr(roleDesc)}">${escapeHtml(roleKey)}</span></div></td>
    </tr>`;
  }).join('');

  attachTooltips();
}

/* get value by candidate header names */
function getFieldValue(row, candidates){
  for (let c of candidates) if (row[c] !== undefined) return row[c];
  return '';
}

/* attach floating tooltip for roles */
function attachTooltips(){
  const tip = document.getElementById('floating-tooltip');
  if (!tip) return;
  tip.className = 'floating-tooltip hidden';
  const tbody = document.querySelector('#matrix tbody');
  if (!tbody) return;
  const newT = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(newT, tbody);

  newT.addEventListener('mouseover', (e) => {
    const el = e.target.closest('.role');
    if (!el) return;
    const text = el.dataset.tooltip || el.getAttribute('data-tooltip') || '';
    if (!text) return;
    tip.innerHTML = text;
    tip.className = 'floating-tooltip show';
    positionTooltip(tip, el);
  });
  newT.addEventListener('mousemove', (e) => {
    const el = e.target.closest('.role');
    if (!el) { tip.className='floating-tooltip hidden'; return; }
    positionTooltip(tip, el);
  });
  newT.addEventListener('mouseout', (e) => { tip.className='floating-tooltip hidden'; });
}

function positionTooltip(tip, el){
  const rect = el.getBoundingClientRect();
  tip.style.maxWidth = Math.min(420, window.innerWidth - 40) + 'px';
  const margin = 8;
  let top = rect.top + rect.height/2 - tip.offsetHeight/2;
  if (top < 8) top = 8;
  if (top + tip.offsetHeight > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 8 - tip.offsetHeight);
  const tipW = tip.offsetWidth || Math.min(420, window.innerWidth - 40);
  const rightX = rect.right + margin;
  const leftX = rect.left - margin - tipW;
  if (rightX + tipW < window.innerWidth - 8) tip.style.left = rightX + 'px';
  else if (leftX > 8) tip.style.left = leftX + 'px';
  else tip.style.left = Math.max(8, Math.min(window.innerWidth - tipW - 8, rect.right + margin)) + 'px';
  tip.style.top = top + 'px';
}

/* Export (xlsx) of currently rendered rows */
function onExport(){
  if (!lastRenderedRows || !lastRenderedRows.length){ showToast('Нет данных для экспорта', 1200); return; }
  const headers = ["№","Функция","Продукт","Департамент","Отдел","Должность","Роль"];
  const sheetData = lastRenderedRows.map(r => ({
    "№": getFieldValue(r, LOGICAL_FIELDS.num),
    "Функция": getFieldValue(r, LOGICAL_FIELDS.func),
    "Продукт": getFieldValue(r, LOGICAL_FIELDS.product),
    "Департамент": getFieldValue(r, LOGICAL_FIELDS.department),
    "Отдел": getFieldValue(r, LOGICAL_FIELDS.division),
    "Должность": getFieldValue(r, LOGICAL_FIELDS.position),
    "Роль": getFieldValue(r, LOGICAL_FIELDS.role)
  }));
  const ws = XLSX.utils.json_to_sheet(sheetData, { header: headers, skipHeader:false });
  ws['!cols'] = [{wch:6},{wch:40},{wch:30},{wch:20},{wch:20},{wch:20},{wch:8}];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const thin = { style:"thin", color:{rgb:"FFBFBFBF"} }; const allB = { top:thin, bottom:thin, left:thin, right:thin };
  for (let R=range.s.r; R<=range.e.r; ++R) for (let C=range.s.c; C<=range.e.c; ++C) {
    const addr = XLSX.utils.encode_cell({r:R,c:C}); const cell = ws[addr]; if(!cell) continue;
    cell.s = cell.s || {}; cell.s.alignment = Object.assign({}, cell.s.alignment, { wrapText:true, vertical:'top', horizontal:'left' }); cell.s.border = allB;
  }
  const headerRow = range.s.r;
  for (let C=range.s.c; C<=range.e.c; ++C){ const addr = XLSX.utils.encode_cell({r:headerRow,c:C}); if(!ws[addr]) continue; ws[addr].s = ws[addr].s || {}; ws[addr].s.font = Object.assign({}, ws[addr].s.font, { bold:true }); ws[addr].s.alignment = Object.assign({}, ws[addr].s.alignment, { wrapText:true, vertical:'center', horizontal:'center' }); }
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Matrix'); wb.Workbook = wb.Workbook || {}; wb.Workbook.Views = wb.Workbook.Views || []; wb.Workbook.Views[0] = Object.assign(wb.Workbook.Views[0] || {}, { xSplit:0, ySplit:1, topLeftCell:"A2", activeTab:0 });
  const now = new Date(); const ts = now.toISOString().replace(/[:\-]/g,'').split('.')[0]; const fn = `functional-matrix-${ts}.xlsx`; XLSX.writeFile(wb, fn);
  showToast('Экспорт завершён: ' + fn, 1500);
}

/* utils */
function showInfo(msg, important=false){ const el=document.getElementById('info'); if(!el) return; el.classList.remove('hidden'); el.textContent=msg; el.style.border = important ? '1px solid #ffdede' : 'none'; }
function hideInfo(){ const el=document.getElementById('info'); if(!el) return; el.classList.add('hidden'); el.textContent=''; el.style.border='none'; }
function showToast(msg, ms=1200){ const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.classList.remove('hidden'); clearTimeout(t._to); t._to = setTimeout(()=> t.classList.add('hidden'), ms); }
function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escapeHtmlAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
