/* app.js — работа с Google Sheets */

const STORAGE_KEY_FILTERS = 'matrix_filters_v2';
const STORAGE_KEY_SETTINGS = 'matrix_gsheets_settings';

const ROLE_INFO = {
  'О': 'Ответственный: организует и координирует выполнение функции. Назначает исполнителей, контролирует сроки и качество.',
  'В': 'Выполняющий (ВО): непосредственно выполняет работу по поручению ответственного.',
  'ВО': 'Выполняющий (ВО): непосредственно выполняет работу по поручению ответственного.',
  'У': 'Утверждающий: принимает и утверждает результат.',
  'К': 'Консультант: даёт экспертные рекомендации.',
  'И': 'Информируемый: получает информацию о ходе или результате.',
  'П': 'Помощник: содействует выполнению функции ресурсами.',
  'ПК': 'Помощник-консультант: сочетает помощь и экспертизу.',
  'УО': 'Утверждающий ответственный'
};

const FILTER_CONFIG = [
  { id: 'filter-function', label: 'Функция', field: 'func' },
  { id: 'filter-department', label: 'Департамент', field: 'department' },
  { id: 'filter-division', label: 'Отдел', field: 'division' },
  { id: 'filter-position', label: 'Должность', field: 'position' },
  { id: 'filter-role', label: 'Роль', field: 'role' }
];

let rawRows = [];
let departmentHierarchy = {}; // Иерархия из листа "Легенда"
let lastRenderedRows = [];
let sortState = { key: null, dir: 1 };

document.addEventListener('DOMContentLoaded', () => {
  buildFilterPlaceholders();
  
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('cancel-settings').addEventListener('click', closeSettings);
  document.getElementById('clear').addEventListener('click', onClearFilters);
  document.getElementById('export').addEventListener('click', onExport);

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

// Автоматическая настройка (ЗАМЕНИТЕ ID НА СВОЙ!)
const defaultSettings = {
  sheetId: '1KAAS2yR0hvptF5nwr5UOpLElclUd5ja-HXdl3Yjp4HM',  // 
  matrixRange: 'Матрица',
  legendRange: 'Легенда с уровнями'
};
const settings = loadSettings() || defaultSettings;
if (!loadSettings()) {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(defaultSettings));
}
loadDataFromGoogleSheets(settings);
});

/* ==================== GOOGLE SHEETS ==================== */

function loadSettings() {
  const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (e) {
    return null;
  }
}

function saveSettings() {
  const sheetId = document.getElementById('sheet-id').value.trim();
  const matrixRange = document.getElementById('matrix-range').value.trim();
  const legendRange = document.getElementById('legend-range').value.trim();

  if (!sheetId) {
    showToast('Введите ID таблицы', 1500);
    return;
  }

  const settings = { sheetId, matrixRange, legendRange };
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  closeSettings();
  loadDataFromGoogleSheets(settings);
}

function openSettings() {
  const settings = loadSettings();
  if (settings) {
    document.getElementById('sheet-id').value = settings.sheetId || '';
    document.getElementById('matrix-range').value = settings.matrixRange || 'Матрица';
    document.getElementById('legend-range').value = settings.legendRange || 'Легенда с уровнями';
  }
  document.getElementById('settings-modal').classList.add('show');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('show');
}

async function loadDataFromGoogleSheets(settings) {
  showInfo('Загрузка данных из Google Sheets...');
  
  try {
    // Загружаем лист "Легенда"
    const legendUrl = `https://docs.google.com/spreadsheets/d/${settings.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(settings.legendRange)}`;
    const legendData = await fetchGoogleSheet(legendUrl);
    departmentHierarchy = parseLegend(legendData);

    // Загружаем лист "Матрица"
    const matrixUrl = `https://docs.google.com/spreadsheets/d/${settings.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(settings.matrixRange)}`;
    const matrixData = await fetchGoogleSheet(matrixUrl);
    rawRows = parseMatrix(matrixData, departmentHierarchy);

    buildDetailsOptions();
    restoreFilters();
    renderTable();
    hideInfo();
    showToast('Данные загружены успешно', 1200);
  } catch (err) {
    console.error(err);
    showInfo('Ошибка загрузки: ' + err.message + '. Проверьте настройки доступа к таблице.', true);
  }
}

async function fetchGoogleSheet(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Не удалось загрузить данные. Проверьте, что таблица доступна по ссылке.');
  }
  const text = await response.text();
  
  // Google возвращает JSONP, нужно извлечь JSON
  const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
  if (!jsonMatch) {
    throw new Error('Неверный формат ответа от Google Sheets');
  }
  
  return JSON.parse(jsonMatch[1]);
}

function parseLegend(data) {
  // Парсим лист "Легенда с уровнями"
  // Ожидаем: Колонка A = номер, Колонка B = наименование
  const hierarchy = {};
  
  if (!data.table || !data.table.rows) return hierarchy;
  
  data.table.rows.forEach(row => {
    if (!row.c || row.c.length < 2) return;
    
    const code = row.c[0]?.v || row.c[0]?.f || '';
    const name = row.c[1]?.v || row.c[1]?.f || '';
    
    if (code && name) {
      hierarchy[String(code).trim()] = String(name).trim();
    }
  });
  
  return hierarchy;
}

function parseMatrix(data, hierarchy) {
  // Парсим лист "Матрица"
  // Структура: A = №, B = Блок, C = Функция, D = Продукт, E-M = роли с должностями
  
  if (!data.table || !data.table.rows) return [];
  
  const rows = data.table.rows;
  const cols = data.table.cols || [];
  
  // Определяем индексы столбцов ролей (с E по последний)
  const roleStartIndex = 4; // Столбец E (индекс 4)
  
  const result = [];
  
  rows.forEach((row, rowIdx) => {
    if (!row.c || rowIdx === 0) return; // Пропускаем заголовок
    
    const num = getCellValue(row.c[0]);
    const block = getCellValue(row.c[1]);
    const func = getCellValue(row.c[2]);
    const product = getCellValue(row.c[3]);
    
    // Обрабатываем столбцы с ролями
    for (let colIdx = roleStartIndex; colIdx < row.c.length; colIdx++) {
      const cellValue = getCellValue(row.c[colIdx]);
      if (!cellValue) continue;
      
      // Получаем название роли из заголовка
      const roleHeader = cols[colIdx]?.label || '';
      const role = extractRoleFromHeader(roleHeader);
      
      // Парсим ячейку: может быть несколько записей вида "код / должность"
      const entries = parseRoleCell(cellValue);
      
      entries.forEach(entry => {
        const { code, position } = entry;
        const { department, division } = resolveDepartment(code, hierarchy);
        
        result.push({
          num,
          block,
          func,
          product,
          role,
          department,
          division,
          position,
          departmentCode: code
        });
      });
    }
  });
  
  return result;
}

function getCellValue(cell) {
  if (!cell) return '';
  return String(cell.v !== undefined ? cell.v : (cell.f || '')).trim();
}

function extractRoleFromHeader(header) {
  // Извлекаем код роли из заголовка типа "(О) Ответственный" или "О"
  const match = header.match(/\(([А-ЯЁ]+)\)/);
  if (match) return match[1];
  
  // Если просто одна буква
  const trimmed = header.trim();
  if (trimmed.length <= 3 && /^[А-ЯЁ]+$/.test(trimmed)) return trimmed;
  
  return header.trim();
}

function parseRoleCell(cellValue) {
  // Парсим ячейку с несколькими записями вида "1.5.1 / Главный архитектор 1.6.3 / Начальник отдела"
  // или просто "1.5.1 / Главный архитектор"
  
  const entries = [];
  const parts = cellValue.split(/\s+(?=\d+\.)/); // Разделяем по пробелу перед числом
  
  parts.forEach(part => {
    const match = part.match(/^([\d.]+)\s*\/\s*(.+)$/);
    if (match) {
      entries.push({
        code: match[1].trim(),
        position: match[2].trim()
      });
    }
  });
  
  return entries;
}

function resolveDepartment(code, hierarchy) {
  // Разбираем код типа "1.5.1" на департамент (1) и отдел (1.5)
  const parts = code.split('.');
  
  let department = '';
  let division = '';
  
  if (parts.length >= 1) {
    const deptCode = parts[0];
    department = hierarchy[deptCode] || deptCode;
  }
  
  if (parts.length >= 2) {
    const divCode = parts.slice(0, 2).join('.');
    division = hierarchy[divCode] || divCode;
  }
  
  if (parts.length >= 3) {
    // Если есть третий уровень, он считается должностью, но мы уже получили position из ячейки
    // Можно использовать для дополнительной проверки
  }
  
  return { department, division };
}

/* ==================== FILTERS ==================== */

function buildFilterPlaceholders() {
  const container = document.getElementById('controls-compact');
  FILTER_CONFIG.forEach(cfg => {
    const wrapper = document.querySelector(`.filter-compact[data-filter-id="${cfg.id}"]`);
    if (!wrapper) return;
    
    const label = document.createElement('label');
    label.textContent = cfg.label;
    wrapper.appendChild(label);
    
    const details = document.createElement('details');
    details.className = 'details-multi';
    details.dataset.filterId = cfg.id;
    details.dataset.field = cfg.field;
    
    const summary = document.createElement('summary');
    summary.innerHTML = `<div class="details-display"><div class="placeholder">Все</div></div><div class="details-caret">▾</div>`;
    details.appendChild(summary);
    
    const panel = document.createElement('div');
    panel.className = 'details-panel';
    panel.style.display = 'none';
    details.appendChild(panel);

    summary.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.details-multi').forEach(d => { 
        if (d !== details) d.removeAttribute('open'); 
      });
      setTimeout(() => {
        if (details.hasAttribute('open')) panel.style.display = 'block'; 
        else panel.style.display = 'none';
      }, 0);
    });

    panel.addEventListener('click', (e) => e.stopPropagation());
    wrapper.appendChild(details);
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.details-multi').forEach(d => { 
      d.removeAttribute('open'); 
      const p = d.querySelector('.details-panel'); 
      if (p) p.style.display='none'; 
    });
  });
}

function buildDetailsOptions() {
  FILTER_CONFIG.forEach(cfg => {
    const details = document.querySelector(`.details-multi[data-filter-id="${cfg.id}"]`);
    if (!details) return;
    
    const field = details.dataset.field;
    const panel = details.querySelector('.details-panel');
    panel.innerHTML = '';

    const actions = document.createElement('div');
    actions.className = 'panel-actions';
    const btnAll = document.createElement('button'); 
    btnAll.type='button'; 
    btnAll.textContent='Выбрать всё';
    const btnClear = document.createElement('button'); 
    btnClear.type='button'; 
    btnClear.textContent='Очистить';
    actions.appendChild(btnAll); 
    actions.appendChild(btnClear);
    panel.appendChild(actions);

    const options = document.createElement('div');
    options.className = 'options-list';
    panel.appendChild(options);

    const vals = Array.from(new Set(rawRows.map(r => r[field]).filter(Boolean)));
    vals.sort((a,b) => a.localeCompare(b,'ru'));
    
    vals.forEach(v => {
      const row = document.createElement('div'); 
      row.className = 'opt';
      const id = `${cfg.id}___${hashString(v)}`;
      const input = document.createElement('input'); 
      input.type='checkbox'; 
      input.id = id; 
      input.value = v;
      const label = document.createElement('label'); 
      label.htmlFor = id; 
      label.textContent = v;
      input.addEventListener('change', (e) => { 
        e.stopPropagation(); 
        onDetailsSelectionChange(cfg.id); 
      });
      row.appendChild(input); 
      row.appendChild(label);
      options.appendChild(row);
    });

    btnAll.addEventListener('click', (e) => {
      e.stopPropagation();
      options.querySelectorAll('input[type=checkbox]').forEach(i => i.checked = true);
      onDetailsSelectionChange(cfg.id);
    });

    btnClear.addEventListener('click', (e) => {
      e.stopPropagation();
      options.querySelectorAll('input[type=checkbox]').forEach(i => i.checked = false);
      onDetailsSelectionChange(cfg.id);
    });

    renderDetailsDisplay(cfg.id);
  });
}

function onDetailsSelectionChange(filterId) {
  renderDetailsDisplay(filterId);
  saveFilters();
  renderTable();
}

function renderDetailsDisplay(filterId) {
  const details = document.querySelector(`.details-multi[data-filter-id="${filterId}"]`);
  if (!details) return;
  
  const selected = getDetailsSelectedValues(filterId);
  const display = details.querySelector('.details-display');
  if (!display) return;
  
  if (!selected || selected.length === 0) {
    display.innerHTML = '<div class="placeholder">Все</div>';
  } else if (selected.length <= 2) {
    display.innerHTML = selected.map(v => `<div class="chip" title="${escapeHtmlAttr(v)}">${escapeHtml(v)}</div>`).join('');
  } else {
    display.innerHTML = `<div class="chip">Выбрано: ${selected.length}</div>`;
  }
}

function getDetailsSelectedValues(filterId) {
  const details = document.querySelector(`.details-multi[data-filter-id="${filterId}"]`);
  if (!details) return [];
  
  const checked = Array.from(details.querySelectorAll('input[type=checkbox]:checked'));
  return checked.map(i => i.value);
}

function saveFilters() {
  const state = {};
  FILTER_CONFIG.forEach(cfg => {
    state[cfg.id] = getDetailsSelectedValues(cfg.id);
  });
  localStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify(state));
}

function restoreFilters() {
  const stored = localStorage.getItem(STORAGE_KEY_FILTERS);
  if (!stored) return;
  
  try {
    const state = JSON.parse(stored);
    FILTER_CONFIG.forEach(cfg => {
      const vals = state[cfg.id];
      if (!vals || !Array.isArray(vals)) return;
      
      const details = document.querySelector(`.details-multi[data-filter-id="${cfg.id}"]`);
      if (!details) return;
      
      vals.forEach(v => {
        const input = details.querySelector(`input[value="${CSS.escape(v)}"]`);
        if (input) input.checked = true;
      });
      
      renderDetailsDisplay(cfg.id);
    });
  } catch (e) {
    console.error('Failed to restore filters:', e);
  }
}

function onClearFilters() {
  FILTER_CONFIG.forEach(cfg => {
    const details = document.querySelector(`.details-multi[data-filter-id="${cfg.id}"]`);
    if (!details) return;
    
    details.querySelectorAll('input[type=checkbox]').forEach(i => i.checked = false);
    renderDetailsDisplay(cfg.id);
  });
  
  localStorage.removeItem(STORAGE_KEY_FILTERS);
  document.querySelectorAll('.details-multi').forEach(d => { 
    d.removeAttribute('open'); 
    const p = d.querySelector('.details-panel'); 
    if (p) p.style.display='none';
  });
  
  renderTable();
  showToast('Фильтры сброшены', 900);
}

/* ==================== RENDER ==================== */

function renderTable() {
  const tbody = document.querySelector('#matrix tbody');
  if (!tbody) return;

  // Собираем активные фильтры
  const active = {};
  FILTER_CONFIG.forEach(cfg => {
    const details = document.querySelector(`.details-multi[data-filter-id="${cfg.id}"]`);
    const field = details.dataset.field;
    active[field] = getDetailsSelectedValues(cfg.id);
  });

  // Фильтруем строки
  let rows = rawRows.filter(r => {
    return Object.entries(active).every(([field, vals]) => {
      if (!vals || !vals.length) return true;
      return vals.includes(r[field]);
    });
  });

  // Сортировка
  if (sortState.key) {
    rows.sort((a, b) => {
      const va = (a[sortState.key] || '').toString().toLowerCase();
      const vb = (b[sortState.key] || '').toString().toLowerCase();
      if (va < vb) return -1 * sortState.dir;
      if (va > vb) return 1 * sortState.dir;
      return 0;
    });
  }

  lastRenderedRows = rows;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:18px 12px; color:#666">Нет данных по выбранным фильтрам</td></tr>`;
    attachTooltips();
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const roleDesc = ROLE_INFO[row.role] || '';

    return `<tr>
      <td class="col-id">${escapeHtml(row.num)}</td>
      <td class="col-function">${escapeHtml(row.func)}</td>
      <td class="col-text-medium">${escapeHtml(row.product)}</td>
      <td class="col-department">${escapeHtml(row.department)}</td>
      <td class="col-division">${escapeHtml(row.division)}</td>
      <td class="col-position">${escapeHtml(row.position)}</td>
      <td class="col-role"><div class="rolewrap"><span class="role" data-tooltip="${escapeHtmlAttr(roleDesc)}">${escapeHtml(row.role)}</span></div></td>
    </tr>`;
  }).join('');

  attachTooltips();
}

function updateSortIndicators() {
  document.querySelectorAll('th.sortable').forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (!arrow) return;
    
    if (th.dataset.key === sortState.key) {
      arrow.textContent = sortState.dir === 1 ? '↑' : '↓';
      arrow.style.opacity = '1';
    } else {
      arrow.textContent = '';
      arrow.style.opacity = '0.4';
    }
  });
}

/* ==================== TOOLTIPS ==================== */

function attachTooltips() {
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

function positionTooltip(tip, el) {
  const rect = el.getBoundingClientRect();
  tip.style.maxWidth = Math.min(420, window.innerWidth - 40) + 'px';
  const margin = 8;
  let top = rect.top + rect.height/2 - tip.offsetHeight/2;
  if (top < 8) top = 8;
  if (top + tip.offsetHeight > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - 8 - tip.offsetHeight);
  }
  const tipW = tip.offsetWidth || Math.min(420, window.innerWidth - 40);
  const rightX = rect.right + margin;
  const leftX = rect.left - margin - tipW;
  if (rightX + tipW < window.innerWidth - 8) {
    tip.style.left = rightX + 'px';
  } else if (leftX > 8) {
    tip.style.left = leftX + 'px';
  } else {
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tipW - 8, rect.right + margin)) + 'px';
  }
  tip.style.top = top + 'px';
}

/* ==================== EXPORT ==================== */

function onExport() {
  if (!lastRenderedRows || !lastRenderedRows.length) { 
    showToast('Нет данных для экспорта', 1200); 
    return; 
  }
  
  const headers = ["№", "Функция", "Продукт", "Департамент", "Отдел", "Должность", "Роль"];
  const sheetData = lastRenderedRows.map(r => ({
    "№": r.num,
    "Функция": r.func,
    "Продукт": r.product,
    "Департамент": r.department,
    "Отдел": r.division,
    "Должность": r.position,
    "Роль": r.role
  }));
  
  const ws = XLSX.utils.json_to_sheet(sheetData, { header: headers, skipHeader: false });
  ws['!cols'] = [{wch:6},{wch:40},{wch:30},{wch:20},{wch:20},{wch:20},{wch:8}];
  
  const range = XLSX.utils.decode_range(ws['!ref']);
  const thin = { style:"thin", color:{rgb:"FFBFBFBF"} };
  const allB = { top:thin, bottom:thin, left:thin, right:thin };
  
  for (let R=range.s.r; R<=range.e.r; ++R) {
    for (let C=range.s.c; C<=range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({r:R,c:C});
      const cell = ws[addr];
      if (!cell) continue;
      cell.s = cell.s || {};
      cell.s.alignment = Object.assign({}, cell.s.alignment, { 
        wrapText:true, 
        vertical:'top', 
        horizontal:'left' 
      });
      cell.s.border = allB;
    }
  }
  
  const headerRow = range.s.r;
  for (let C=range.s.c; C<=range.e.c; ++C) {
    const addr = XLSX.utils.encode_cell({r:headerRow,c:C});
    if (!ws[addr]) continue;
    ws[addr].s = ws[addr].s || {};
    ws[addr].s.font = Object.assign({}, ws[addr].s.font, { bold:true });
    ws[addr].s.alignment = Object.assign({}, ws[addr].s.alignment, { 
      wrapText:true, 
      vertical:'center', 
      horizontal:'center' 
    });
  }
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Matrix');
  wb.Workbook = wb.Workbook || {};
  wb.Workbook.Views = wb.Workbook.Views || [];
  wb.Workbook.Views[0] = Object.assign(wb.Workbook.Views[0] || {}, { 
    xSplit:0, 
    ySplit:1, 
    topLeftCell:"A2", 
    activeTab:0 
  });
  
  const now = new Date();
  const ts = now.toISOString().replace(/[:\-]/g,'').split('.')[0];
  const fn = `functional-matrix-${ts}.xlsx`;
  XLSX.writeFile(wb, fn);
  showToast('Экспорт завершён: ' + fn, 1500);
}

/* ==================== UTILS ==================== */

function showInfo(msg, important=false) { 
  const el=document.getElementById('info'); 
  if (!el) return; 
  el.classList.remove('hidden'); 
  el.textContent=msg; 
  el.style.border = important ? '1px solid #ffdede' : 'none'; 
}

function hideInfo() { 
  const el=document.getElementById('info'); 
  if (!el) return; 
  el.classList.add('hidden'); 
  el.textContent=''; 
  el.style.border='none'; 
}

function showToast(msg, ms=1200) { 
  const t=document.getElementById('toast'); 
  if (!t) return; 
  t.textContent = msg; 
  t.classList.remove('hidden'); 
  clearTimeout(t._to); 
  t._to = setTimeout(() => t.classList.add('hidden'), ms); 
}

function escapeHtml(s) { 
  if (s==null) return ''; 
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;'); 
}

function escapeHtmlAttr(s) { 
  return escapeHtml(s).replace(/"/g,'&quot;'); 
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
