/* app.js — упрощённая, надёжная версия управления multiselect'ами
   - каждый multiselect управляет своей панелью через click на display
   - клик внутри панели не закрывает её
   - клик по документу закрывает все панели
   - сохраняет всё остальное: загрузка CSV, каскад, тултип, сортировка, экспорт
*/

const DATA_URL = 'data.csv';
const STORAGE_FILTERS = 'matrix_filters_v4'; // bumped version

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
  { id: 'filter-function', keyCandidates: ['function','функция','Функция','name','Наименование'] },
  { id: 'filter-department', keyCandidates: ['department','департамент','Департамент','dept'] },
  { id: 'filter-division', keyCandidates: ['division','отдел','Отдел'] },
  { id: 'filter-position', keyCandidates: ['position','должность','Должность'] },
  { id: 'filter-role', keyCandidates: ['role','роль','Роль'] }
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
let headerMap = {};
let sortState = { key: null, dir: 1 }; // dir: 1 asc, -1 desc

document.addEventListener('DOMContentLoaded', () => {
  const clearBtn = document.getElementById('clear');
  const exportBtn = document.getElementById('export');
  if (clearBtn) clearBtn.addEventListener('click', onClearClick);
  if (exportBtn) exportBtn.addEventListener('click', onExportClick);

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

  // single floating tooltip element
  if (!document.getElementById('floating-tooltip')) {
    const tip = document.createElement('div');
    tip.id = 'floating-tooltip';
    tip.className = 'floating-tooltip hidden';
    document.body.appendChild(tip);
  }

  // close panels on any document click (unless click handled inside)
  document.addEventListener('click', (e) => {
    // if click is inside some multiselect container or its panel, do nothing (those handlers run earlier)
    // but simplest: always close all panels on document click; multiselect display/panel handlers will stopPropagation when needed
    closeAllMultiselectPanels();
  });

  loadCSV();
});

/* -------------------- multiselect helpers (simple, robust) -------------------- */

function closeAllMultiselectPanels(){
  document.querySelectorAll('.multiselect-panel').forEach(p => p.classList.add('hidden'));
}

function toggleMultiselectPanelByContainer(container){
  const panel = container.querySelector('.multiselect-panel');
  if (!panel) return;
  // close others
  document.querySelectorAll('.multiselect-panel').forEach(p => { if (p !== panel) p.classList.add('hidden'); });
  panel.classList.toggle('hidden');
}

/* -------------------- CSV load / normalize -------------------- */

function loadCSV(){
  showInfo('Загрузка данных...');
  fetch(DATA_URL)
    .then(r => { if (!r.ok) throw new Error('CSV не найден: ' + r.status); return r.text(); })
    .then(text => {
      const parsed = Papa.parse(text, { header:true, skipEmptyLines:true });
      if (parsed.errors && parsed.errors.length) console.warn('PapaParse errors:', parsed.errors.slice(0,5));
      rawRows = parsed.data.map(r => normalizeRow(r));
      buildHeaderMap(parsed.meta && parsed.meta.fields ? parsed.meta.fields : (rawRows[0] ? Object.keys(rawRows[0]) : []));
      buildAllMultiselects();
      restoreFiltersFromStorage();
      renderTable();
      hideInfo();
      showToast('Данные загружены', 900);
    })
    .catch(err => { console.error(err); showInfo('Ошибка при загрузке данных: ' + err.message, true); });
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

/* -------------------- header mapping -------------------- */
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

function buildHeaderMap(headers){
  headerMap = {};
  Object.entries(LOGICAL_FIELDS).forEach(([k,cands]) => {
    headerMap[k] = findHeaderByCandidates(headers, cands) || headers[0] || '';
  });
  FILTER_CONFIG.forEach(f => {
    const found = findHeaderByCandidates(headers, f.keyCandidates);
    const el = document.getElementById(f.id);
    if (el) el.dataset.csvHeader = found || '';
  });
}

/* -------------------- multiselect build / behavior -------------------- */

function buildAllMultiselects(){
  FILTER_CONFIG.forEach(cfg => buildMultiselect(cfg.id));
}

function buildMultiselect(containerId){
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('multiselect');

  // display area
  const display = document.createElement('div');
  display.className = 'display';
  display.tabIndex = 0; // keyboard focusable
  container.appendChild(display);

  // panel
  const panel = document.createElement('div');
  panel.className = 'multiselect-panel hidden';
  container.appendChild(panel);

  // actions in panel
  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  const selectAllBtn = document.createElement('button'); selectAllBtn.type='button'; selectAllBtn.textContent='Выбрать всё';
  const clearBtn = document.createElement('button'); clearBtn.type='button'; clearBtn.textContent='Очистить';
  actions.appendChild(selectAllBtn); actions.appendChild(clearBtn);
  panel.appendChild(actions);

  const list = document.createElement('div');
  list.className = 'options';
  panel.appendChild(list);

  // populate options
  refreshMultiselectOptions(containerId);

  // Click on display toggles panel. Stop propagation to prevent document click from immediately closing it.
  display.addEventListener('click', function(e){
    e.stopPropagation();
    toggleMultiselectPanelByContainer(container);
  });

  // clicking inside panel should not bubble to document (so it won't close)
  panel.addEventListener('click', function(e){
    e.stopPropagation();
  });

  // actions
  selectAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    Array.from(list.querySelectorAll('input[type=checkbox]')).forEach(i => i.checked = true);
    onMultiselectChange(containerId);
  });
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    Array.from(list.querySelectorAll('input[type=checkbox]')).forEach(i => i.checked = false);
    onMultiselectChange(containerId);
  });

  // keyboard support
  display.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleMultiselectPanelByContainer(container);
    }
  });
}

/* Rebuild options for one multiselect; allowedValues optional */
function refreshMultiselectOptions(containerId, allowedValues=null){
  const container = document.getElementById(containerId);
  if (!container) return;
  const panel = container.querySelector('.multiselect-panel');
  const list = panel.querySelector('.options');
  list.innerHTML = '';
  const header = container.dataset.csvHeader;
  let values = [];
  if (allowedValues) values = Array.from(new Set(allowedValues)).filter(Boolean);
  else if (header) values = Array.from(new Set(rawRows.map(r => r[header]).filter(Boolean)));
  values.sort((a,b)=>a.localeCompare(b,'ru'));
  values.forEach(v => {
    const row = document.createElement('div');
    row.className = 'opt';
    const id = containerId + '___' + Math.abs(hashString(v));
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.value = v;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = v;
    input.addEventListener('change', (ev) => {
      ev.stopPropagation();
      onMultiselectChange(containerId);
    });
    row.appendChild(input);
    row.appendChild(label);
    list.appendChild(row);
  });
  renderMultiselectDisplay(containerId);
}

function hashString(s){ let h=0; for (let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i); return (h>>>0).toString(36); }

function getMultiselectValues(id){
  const container = document.getElementById(id);
  if (!container) return [];
  return Array.from(container.querySelectorAll('input[type=checkbox]:checked')).map(i=>i.value);
}

function setMultiselectValues(id, values){
  const container = document.getElementById(id);
  if (!container) return;
  const inputs = Array.from(container.querySelectorAll('input[type=checkbox]'));
  inputs.forEach(i => i.checked = values.includes(i.value));
  renderMultiselectDisplay(id);
}

function renderMultiselectDisplay(id){
  const container = document.getElementById(id);
  if (!container) return;
  const display = container.querySelector('.display');
  display.innerHTML = '';
  const vals = getMultiselectValues(id);
  if (!vals.length){
    const ph = document.createElement('div');
    ph.className = 'placeholder';
    ph.textContent = container.dataset.placeholder || 'Все';
    display.appendChild(ph);
  } else if (vals.length <= 3){
    vals.forEach(v => {
      const chip = document.createElement('div'); chip.className = 'chip'; chip.textContent = v; display.appendChild(chip);
    });
  } else {
    const chip = document.createElement('div'); chip.className = 'chip'; chip.textContent = `${vals.length} выбрано`; display.appendChild(chip);
  }
  const chevron = document.createElement('div'); chevron.style.marginLeft='auto'; chevron.style.opacity='0.6'; chevron.innerHTML='&#9662;';
  display.appendChild(chevron);
}

/* When selections change */
function onMultiselectChange(containerId){
  renderMultiselectDisplay(containerId);
  saveFiltersToStorage();
  cascadeFilters();
  renderTable();
}

/* cascade filters */
function cascadeFilters(){
  FILTER_CONFIG.forEach(cfg => {
    const containerId = cfg.id;
    const header = document.getElementById(containerId).dataset.csvHeader;
    if (!header) return;
    const subset = rawRows.filter(row => {
      return FILTER_CONFIG.every(otherCfg => {
        if (otherCfg.id === containerId) return true;
        const sel = getMultiselectValues(otherCfg.id);
        if (!sel.length) return true;
        const hdr = document.getElementById(otherCfg.id).dataset.csvHeader;
        return sel.includes(row[hdr]);
      });
    });
    const allowed = Array.from(new Set(subset.map(r => r[header]).filter(Boolean)));
    allowed.sort((a,b)=>a.localeCompare(b,'ru'));
    refreshMultiselectOptions(containerId, allowed);
    const saved = loadFiltersFromStorageFor(containerId) || [];
    const inputs = Array.from(document.getElementById(containerId).querySelectorAll('input[type=checkbox]')).map(i=>i.value);
    const toSet = saved.filter(v => inputs.includes(v));
    setMultiselectValues(containerId, toSet);
  });
}

/* storage */
function saveFiltersToStorage(){ const obj={}; FILTER_CONFIG.forEach(cfg => obj[cfg.id] = getMultiselectValues(cfg.id)); localStorage.setItem(STORAGE_FILTERS, JSON.stringify(obj)); }
function loadFiltersFromStorageFor(id){ try { const raw = localStorage.getItem(STORAGE_FILTERS); if (!raw) return []; const obj = JSON.parse(raw); return obj[id] || []; } catch(e){ return []; } }
function restoreFiltersFromStorage(){
  try {
    const raw = localStorage.getItem(STORAGE_FILTERS);
    if (!raw) { FILTER_CONFIG.forEach(cfg => refreshMultiselectOptions(cfg.id)); return; }
    const obj = JSON.parse(raw);
    FILTER_CONFIG.forEach(cfg => {
      refreshMultiselectOptions(cfg.id);
      const saved = obj[cfg.id] || [];
      setMultiselectValues(cfg.id, saved.filter(Boolean));
    });
    cascadeFilters();
  } catch(e){
    console.warn('restore filters error', e);
    FILTER_CONFIG.forEach(cfg => refreshMultiselectOptions(cfg.id));
  }
}

function onClearClick(){
  FILTER_CONFIG.forEach(cfg => { refreshMultiselectOptions(cfg.id); setMultiselectValues(cfg.id, []); });
  localStorage.removeItem(STORAGE_FILTERS);
  renderTable();
  showToast('Фильтры сброшены', 900);
}

/* -------------------- render table + sorting -------------------- */

function renderTable(){
  const tbody = document.querySelector('#matrix tbody');
  if (!tbody) return;

  const active = {};
  FILTER_CONFIG.forEach(cfg => {
    const hdr = document.getElementById(cfg.id).dataset.csvHeader;
    active[hdr] = getMultiselectValues(cfg.id);
  });

  let rows = rawRows.filter(row => {
    return Object.entries(active).every(([hdr, vals]) => {
      if (!hdr) return true;
      if (!vals || !vals.length) return true;
      return vals.includes(row[hdr]);
    });
  });

  // sorting
  if (sortState.key) {
    const candidates = LOGICAL_FIELDS[sortState.key] || LOGICAL_FIELDS['func'];
    rows.sort((a,b) => {
      const va = (getFieldValue(a, candidates)||'').toString().toLowerCase();
      const vb = (getFieldValue(b, candidates)||'').toString().toLowerCase();
      if (va < vb) return -1 * sortState.dir;
      if (va > vb) return 1 * sortState.dir;
      return 0;
    });
  }

  lastRenderedRows = rows;

  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="7" style="padding:18px 12px; color:#666">Нет данных по выбранным фильтрам</td></tr>`;
    attachRoleTooltips();
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

  attachRoleTooltips();
}

function getFieldValue(row, candidates){
  for (let k of candidates) if (row[k] !== undefined) return row[k];
  return '';
}

/* -------------------- floating tooltip (doesn't affect layout) -------------------- */

function attachRoleTooltips(){
  const tip = document.getElementById('floating-tooltip');
  if (!tip) return;
  tip.className = 'floating-tooltip hidden';

  const tbody = document.querySelector('#matrix tbody');
  if (!tbody) return;

  // replace old tbody to clear listeners
  const newTbody = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(newTbody, tbody);

  newTbody.addEventListener('mouseover', (e) => {
    const el = e.target.closest('.role');
    if (!el) return;
    const text = el.dataset.tooltip || el.getAttribute('data-tooltip') || el.title || '';
    if (!text) return;
    tip.innerHTML = text;
    tip.className = 'floating-tooltip show';
    positionTooltipNearElement(tip, el);
  });

  newTbody.addEventListener('mousemove', (e) => {
    const el = e.target.closest('.role');
    if (!el) { tip.className = 'floating-tooltip hidden'; return; }
    positionTooltipNearElement(tip, el);
  });

  newTbody.addEventListener('mouseout', (e) => {
    const el = e.target.closest('.role');
    if (!el) return;
    tip.className = 'floating-tooltip hidden';
  });
}

function positionTooltipNearElement(tip, el){
  const rect = el.getBoundingClientRect();
  tip.style.maxWidth = Math.min(420, window.innerWidth - 40) + 'px';
  const margin = 8;
  let top = rect.top + rect.height/2 - (tip.offsetHeight/2 || 30);
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

/* -------------------- sorting visuals -------------------- */

function updateSortIndicators(){
  document.querySelectorAll('th.sortable').forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (!arrow) return;
    if (sortState.key === th.dataset.key) arrow.textContent = sortState.dir === 1 ? '▲' : '▼';
    else arrow.textContent = '';
  });
}

/* -------------------- export -------------------- */

function onExportClick(){
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

/* -------------------- tiny UI helpers -------------------- */

function showInfo(msg, important=false){
  const el = document.getElementById('info');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = msg;
  el.style.border = important ? '1px solid #ffdede' : 'none';
}
function hideInfo(){ const el = document.getElementById('info'); if (!el) return; el.classList.add('hidden'); el.textContent=''; el.style.border='none'; }
function showToast(msg, ms=1200){ const t = document.getElementById('toast'); if (!t) return; t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._to); t._to = setTimeout(()=> t.classList.add('hidden'), ms); }
function escapeHtml(s){ if (s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escapeHtmlAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
