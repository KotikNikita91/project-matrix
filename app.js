/* app.js — компактная, надёжная версия
   - загружает data.csv (PapaParse)
   - строит кастомные multiselect контролы (мультивыбор)
   - каскадная фильтрация по выбранным множествам
   - экспорт текущего среза в Excel (SheetJS)
   - сохраняет фильтры в localStorage
*/

const DATA_URL = 'data.csv';
const STORAGE_FILTERS = 'matrix_filters_v2';

/* роль -> описание */
const ROLE_INFO = {
  'О': 'Ответственный: организует и координирует выполнение функции. Назначает исполнителей, контролирует сроки и качество.',
  'В': 'Выполняющий: непосредственно выполняет работу по поручению ответственного.',
  'У': 'Утверждающий: принимает и утверждает результат.',
  'К': 'Консультант: даёт экспертные рекомендации.',
  'И': 'Информируемый: получает информацию о ходе или результате.',
  'П': 'Помощник: содействует выполнению функции ресурсами.',
  'ПК': 'Помощник-консультант: сочетает помощь и экспертизу.',
   'ВО': 'Выполняющий - Ответственный: Организует и непосредственно выполняет работу.'
};

/* основной набор фильтров (идентификаторы элементов и кандидаты для поиска заголовков) */
const FILTER_CONFIG = [
  { id: 'filter-function', keyCandidates: ['function','функция','Функция','name','Наименование'] },
  { id: 'filter-department', keyCandidates: ['department','департамент','Департамент','dept'] },
  { id: 'filter-division', keyCandidates: ['division','отдел','Отдел'] },
  { id: 'filter-position', keyCandidates: ['position','должность','Должность'] },
  { id: 'filter-role', keyCandidates: ['role','роль','Роль'] }
];

/* локальные данные */
let rawRows = [];
let lastRenderedRows = [];
let headerMap = {}; // map logical keys -> actual CSV header names

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('clear').addEventListener('click', onClearClick);
  document.getElementById('export').addEventListener('click', onExportClick);
  loadCSV();
});

/* --- UI helpers --- */
function showInfo(msg, important=false){
  const el = document.getElementById('info');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = msg;
  el.style.border = important ? '1px solid #ffdede' : 'none';
}
function hideInfo(){
  const el = document.getElementById('info');
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
  el.style.border = 'none';
}
function showToast(msg, ms=1400){
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._to);
  t._to = setTimeout(()=> t.classList.add('hidden'), ms);
}
function escapeHtml(s){ if (s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escapeHtmlAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

/* --- CSV loading --- */
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
    .catch(err => {
      console.error(err);
      showInfo('Ошибка при загрузке данных: ' + err.message, true);
    });
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

/* --- header mapping: определяем имя столбца в CSV для каждой логической сущности */
function findHeaderByCandidates(headers, candidates){
  const lowered = headers.map(h => h.toLowerCase().replace(/\s+/g,''));
  for (let cand of candidates){
    const key = cand.toLowerCase().replace(/\s+/g,'');
    const idx = lowered.indexOf(key);
    if (idx !== -1) return headers[idx];
  }
  // fuzzy contains
  for (let cand of candidates){
    for (let h of headers){
      if (h.toLowerCase().includes(cand.toLowerCase().replace(/\s+/g,''))) return h;
    }
  }
  return null;
}

/* We only need these logical columns for rendering/export */
const LOGICAL_FIELDS = {
  num: ['№','number','No','id','no'],
  func: ['Функция','function','Function','name'],
  product: ['Продукт','product'],
  department: ['Департамент','department'],
  division: ['Отдел','division'],
  position: ['Должность','position'],
  role: ['Роль','role']
};

function buildHeaderMap(headers){
  headerMap = {};
  // map logical -> actual header name
  Object.entries(LOGICAL_FIELDS).forEach(([key,cands]) => {
    const found = findHeaderByCandidates(headers, cands);
    headerMap[key] = found || headers[0] || '';
  });
  // also set for filters from FILTER_CONFIG
  FILTER_CONFIG.forEach(f => {
    const found = findHeaderByCandidates(headers, f.keyCandidates);
    // store actual CSV header on the DOM container for reference
    const el = document.getElementById(f.id);
    if (el) el.dataset.csvHeader = found || '';
  });
}

/* --- Multiselect builder & logic --- */
function buildAllMultiselects(){
  FILTER_CONFIG.forEach(cfg => buildMultiselect(cfg.id));
}

function buildMultiselect(containerId){
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = ''; // clear

  container.classList.add('multiselect');
  const placeholderText = container.dataset.placeholder || 'Все';

  // display area
  const display = document.createElement('div');
  display.className = 'display';
  container.appendChild(display);

  // chevron
  const chevron = document.createElement('div');
  chevron.style.marginLeft = 'auto';
  chevron.style.opacity = '0.6';
  chevron.innerHTML = '&#9662;';
  display.appendChild(chevron);

  // panel (hidden)
  const panel = document.createElement('div');
  panel.className = 'multiselect-panel hidden';
  container.appendChild(panel);

  // panel header with actions
  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  const selectAllBtn = document.createElement('button'); selectAllBtn.type='button'; selectAllBtn.textContent='Выбрать всё';
  const clearBtn = document.createElement('button'); clearBtn.type='button'; clearBtn.textContent='Очистить';
  actions.appendChild(selectAllBtn); actions.appendChild(clearBtn);
  panel.appendChild(actions);

  const list = document.createElement('div');
  list.className = 'options';
  panel.appendChild(list);

  // populate options from data
  refreshMultiselectOptions(containerId);

  // toggle panel
  container.addEventListener('click', (e) => {
    // if clicked on a checkbox inside panel, let it handle
    if (e.target.closest('.multiselect-panel')) return;
    const p = panel;
    const isHidden = p.classList.contains('hidden');
    // hide other panels
    document.querySelectorAll('.multiselect-panel').forEach(pp => pp.classList.add('hidden'));
    if (isHidden) p.classList.remove('hidden'); else p.classList.add('hidden');
  });

  // close on outside click
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });

  // panel actions
  selectAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opts = Array.from(list.querySelectorAll('input[type=checkbox]'));
    opts.forEach(i => { i.checked = true; });
    onMultiselectChange(containerId);
  });
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opts = Array.from(list.querySelectorAll('input[type=checkbox]'));
    opts.forEach(i => { i.checked = false; });
    onMultiselectChange(containerId);
  });
}

/* Build option items for a multiselect from available values */
function refreshMultiselectOptions(containerId, allowedValues=null){
  // allowedValues: if provided, use as the set to show; otherwise compute from full rawRows or filtered subset during cascade
  const container = document.getElementById(containerId);
  if (!container) return;
  const panel = container.querySelector('.multiselect-panel');
  const list = panel.querySelector('.options');
  list.innerHTML = '';

  const headerName = container.dataset.csvHeader;
  // compute unique values (if allowedValues provided — use it; else gather unique)
  let values = [];
  if (allowedValues) {
    values = Array.from(new Set(allowedValues)).filter(Boolean);
  } else if (headerName) {
    values = Array.from(new Set(rawRows.map(r => r[headerName]).filter(Boolean)));
  } else {
    values = [];
  }
  values.sort((a,b)=>a.localeCompare(b,'ru'));

  // create checkboxes
  values.forEach(v => {
    const row = document.createElement('div');
    row.className = 'opt';
    const id = containerId + '___' + hashString(v);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.value = v;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = v;
    input.addEventListener('change', (e) => {
      e.stopPropagation();
      onMultiselectChange(containerId);
    });
    row.appendChild(input);
    row.appendChild(label);
    list.appendChild(row);
  });

  // update display
  renderMultiselectDisplay(containerId);
}

/* helper: small stable hash for id */
function hashString(s){
  let h = 0;
  for (let i=0;i<s.length;i++) h = ((h<<5)-h) + s.charCodeAt(i);
  return (h>>>0).toString(36);
}

/* read selected values of multiselect as array */
function getMultiselectValues(containerId){
  const container = document.getElementById(containerId);
  if (!container) return [];
  const checked = Array.from(container.querySelectorAll('input[type=checkbox]:checked')).map(i=>i.value);
  return checked;
}

/* set selected values (used when restoring from storage or cascade) */
function setMultiselectValues(containerId, values){
  const container = document.getElementById(containerId);
  if (!container) return;
  const inputs = Array.from(container.querySelectorAll('input[type=checkbox]'));
  inputs.forEach(i => { i.checked = values.includes(i.value); });
  renderMultiselectDisplay(containerId);
}

/* rerender the compact display showing chips or placeholder */
function renderMultiselectDisplay(containerId){
  const container = document.getElementById(containerId);
  if (!container) return;
  const display = container.querySelector('.display');
  if (!display) return;
  // clear except chevron (chevron is last child)
  display.innerHTML = '';
  const values = getMultiselectValues(containerId);

  if (!values.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';
    placeholder.textContent = container.dataset.placeholder || 'Все';
    display.appendChild(placeholder);
  } else if (values.length <= 3) {
    values.forEach(v => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = v;
      display.appendChild(chip);
    });
  } else {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = `${values.length} выбрано`;
    display.appendChild(chip);
  }
  // add chevron at end
  const chevron = document.createElement('div'); chevron.style.marginLeft='auto'; chevron.style.opacity='0.6'; chevron.innerHTML='&#9662;';
  display.appendChild(chevron);
}

/* called when user toggles checkboxes in a multiselect */
function onMultiselectChange(containerId){
  renderMultiselectDisplay(containerId);
  saveFiltersToStorage();
  cascadeFilters();
  renderTable();
}

/* cascade filters: recompute available options for each multiselect based on other active filters */
function cascadeFilters(){
  // for each filter, compute subset filtered by other filters (excluding this one)
  FILTER_CONFIG.forEach(cfg => {
    const containerId = cfg.id;
    const header = document.getElementById(containerId).dataset.csvHeader;
    if (!header) return;
    // subset of rows where for every other filter, row value in selected set (or not filtered)
    const subset = rawRows.filter(row => {
      return FILTER_CONFIG.every(otherCfg => {
        if (otherCfg.id === containerId) return true;
        const otherVals = getMultiselectValues(otherCfg.id);
        if (!otherVals.length) return true; // not filtered
        const csvHdr = document.getElementById(otherCfg.id).dataset.csvHeader;
        return otherVals.includes(row[csvHdr]);
      });
    });
    // extract values for this header in subset
    const allowed = Array.from(new Set(subset.map(r => r[header]).filter(Boolean)));
    allowed.sort((a,b)=>a.localeCompare(b,'ru'));
    // rebuild options but preserve currently checked that remain in allowed (if not allowed, will be unchecked by refresh)
    refreshMultiselectOptions(containerId, allowed);
    // try to restore previous selections if still present
    const saved = loadFiltersFromStorageFor(containerId);
    if (saved && Array.isArray(saved) && saved.length) {
      // ensure only allowed remain
      const remain = saved.filter(v=>allowed.includes(v));
      setMultiselectValues(containerId, remain);
    }
  });
}

/* --- Filters persistence --- */
function saveFiltersToStorage(){
  const obj = {};
  FILTER_CONFIG.forEach(cfg => {
    obj[cfg.id] = getMultiselectValues(cfg.id);
  });
  localStorage.setItem(STORAGE_FILTERS, JSON.stringify(obj));
}

function loadFiltersFromStorageFor(containerId){
  try {
    const raw = localStorage.getItem(STORAGE_FILTERS);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj[containerId] || null;
  } catch(e){ return null; }
}

function restoreFiltersFromStorage(){
  try {
    const raw = localStorage.getItem(STORAGE_FILTERS);
    if (!raw) return;
    const obj = JSON.parse(raw);
    FILTER_CONFIG.forEach(cfg => {
      const saved = obj[cfg.id];
      if (Array.isArray(saved) && saved.length){
        // only set those which are present in options (we will refresh options first)
        refreshMultiselectOptions(cfg.id); // build current options
        // filter exists
        const allowedInputs = Array.from(document.getElementById(cfg.id).querySelectorAll('input[type=checkbox]')).map(i=>i.value);
        const toSet = saved.filter(v=>allowedInputs.includes(v));
        setMultiselectValues(cfg.id, toSet);
      } else {
        // just build options
        refreshMultiselectOptions(cfg.id);
      }
    });
    // cascade to adapt options to saved selections
    cascadeFilters();
  } catch(e){ console.warn('restore filters parse error', e); }
}

/* clear filters */
function onClearClick(){
  FILTER_CONFIG.forEach(cfg => {
    const container = document.getElementById(cfg.id);
    if (!container) return;
    refreshMultiselectOptions(cfg.id);
    setMultiselectValues(cfg.id, []);
  });
  localStorage.removeItem(STORAGE_FILTERS);
  renderTable();
  showToast('Фильтры сброшены', 900);
}

/* --- Rendering table (only 7 columns) --- */
function renderTable(){
  const tbody = document.querySelector('#matrix tbody');
  if (!tbody) return;

  // build active filters map: header -> array of values (empty => no filter)
  const active = {};
  FILTER_CONFIG.forEach(cfg => {
    const csvHdr = document.getElementById(cfg.id).dataset.csvHeader;
    active[csvHdr] = getMultiselectValues(cfg.id); // [] means not filtered
  });

  const rows = rawRows.filter(row => {
    return Object.entries(active).every(([hdr,vals]) => {
      if (!hdr) return true;
      if (!vals || !vals.length) return true;
      return vals.includes(row[hdr]);
    });
  });

  lastRenderedRows = rows;

  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="7" style="padding:18px 12px; color:#666">Нет данных по выбранным фильтрам</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const get = (candidates) => { for (let k of candidates) if (row[k] !== undefined) return row[k]; return ''; };
    const num = get(LOGICAL_FIELDS.num);
    const func = get(LOGICAL_FIELDS.func);
    const product = get(LOGICAL_FIELDS.product);
    const department = get(LOGICAL_FIELDS.department);
    const division = get(LOGICAL_FIELDS.division);
    const position = get(LOGICAL_FIELDS.position);
    const roleKey = get(LOGICAL_FIELDS.role);
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
}

/* --- Export current (visible) to Excel (only 7 columns) --- */
function onExportClick(){
  if (!lastRenderedRows || !lastRenderedRows.length){
    showToast('Нет данных для экспорта', 1400);
    return;
  }

  const headers = ["№","Функция","Продукт","Департамент","Отдел","Должность","Роль"];
  const sheetData = lastRenderedRows.map(row => {
    const get = (candidates) => { for (let k of candidates) if (row[k] !== undefined) return row[k]; return ''; };
    return {
      "№": get(LOGICAL_FIELDS.num),
      "Функция": get(LOGICAL_FIELDS.func),
      "Продукт": get(LOGICAL_FIELDS.product),
      "Департамент": get(LOGICAL_FIELDS.department),
      "Отдел": get(LOGICAL_FIELDS.division),
      "Должность": get(LOGICAL_FIELDS.position),
      "Роль": get(LOGICAL_FIELDS.role)
    };
  });

  const ws = XLSX.utils.json_to_sheet(sheetData, { header: headers, skipHeader:false });

  // column widths
  ws['!cols'] = [{wch:6},{wch:40},{wch:30},{wch:20},{wch:20},{wch:20},{wch:8}];

  // wrap + borders
  const range = XLSX.utils.decode_range(ws['!ref']);
  const thinBorder = { style: "thin", color: { rgb: "FFBFBFBF" } };
  const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  for (let R = range.s.r; R <= range.e.r; ++R){
    for (let C = range.s.c; C <= range.e.c; ++C){
      const addr = XLSX.utils.encode_cell({r:R,c:C});
      const cell = ws[addr];
      if (!cell) continue;
      cell.s = cell.s || {};
      cell.s.alignment = Object.assign({}, cell.s.alignment, { wrapText:true, vertical:'top', horizontal:'left' });
      cell.s.border = allBorders;
    }
  }
  // header style
  const headerRow = range.s.r;
  for (let C = range.s.c; C <= range.e.c; ++C){
    const addr = XLSX.utils.encode_cell({r:headerRow,c:C});
    if (!ws[addr]) continue;
    ws[addr].s = ws[addr].s || {};
    ws[addr].s.font = Object.assign({}, ws[addr].s.font, { bold:true });
    ws[addr].s.alignment = Object.assign({}, ws[addr].s.alignment, { wrapText:true, vertical:'center', horizontal:'center' });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Matrix');
  wb.Workbook = wb.Workbook || {}; wb.Workbook.Views = wb.Workbook.Views || [];
  wb.Workbook.Views[0] = Object.assign(wb.Workbook.Views[0] || {}, { xSplit:0, ySplit:1, topLeftCell:"A2", activeTab:0 });

  const now = new Date(); const ts = now.toISOString().replace(/[:\-]/g,'').split('.')[0];
  const filename = `functional-matrix-${ts}.xlsx`;
  XLSX.writeFile(wb, filename);
  showToast('Экспорт завершён: ' + filename, 1500);
}
