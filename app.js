/* app.js — Функциональная матрица v2.3 (финальная версия) */

const STORAGE_KEY_FILTERS = 'matrix_filters_v3';
const STORAGE_KEY_SETTINGS = 'matrix_gsheets_settings';

const DEFAULT_SHEET_ID = '1KAAS2yR0hvptF5nwr5UOpLElclUd5ja-HXdl3Yjp4HM';

const ROLE_INFO = {
  'О': 'Ответственный: организует и координирует выполнение функции.',
  'В': 'Выполняющий: непосредственно выполняет работу.',
  'ВО': 'Выполняющий ответственный: самостоятельно выполняет и координирует.',
  'У': 'Утверждающий: принимает и утверждает результат.',
  'К': 'Консультант: даёт экспертные рекомендации.',
  'И': 'Информируемый: получает информацию о ходе или результате.',
  'П': 'Помощник: содействует выполнению функции.',
  'ПК': 'Помощник-консультант: сочетает помощь и экспертизу.',
  'УО': 'Утверждающий ответственный: утверждает и несет ответственность.'
};

const FILTER_CONFIG = [
  { id: 'filter-function', label: 'Функция', field: 'func' },
  { id: 'filter-department', label: 'Подразделение', field: 'department' },
  { id: 'filter-role', label: 'Роль', field: 'role' }
];

// Цвета для разных уровней подразделений
const LEVEL_COLORS = {
  1: '#ba68c8',  // Фиолетовый
  2: '#ce93d8',  // Светлее
  3: '#e1bee7',  // Ещё светлее
  4: '#f3e5f5',  // Еще темнее
  default: '#f5f5f5'
};

let rawRows = [];
let legendMap = {};
let roleColumns = [];
let lastRenderedRows = [];
let sortState = { key: null, dir: 1 };

document.addEventListener('DOMContentLoaded', () => {
  buildFilterPlaceholders();
  
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('cancel-settings').addEventListener('click', closeSettings);
  document.getElementById('legend-btn').addEventListener('click', openLegend);
  document.getElementById('close-legend').addEventListener('click', closeLegend);
  document.getElementById('clear').addEventListener('click', onClearFilters);
  
  const exportToggle = document.getElementById('export-toggle');
  const exportMenu = document.querySelector('.export-menu');
  exportToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('show');
  });
  document.addEventListener('click', () => exportMenu.classList.remove('show'));
  
  document.getElementById('export-excel').addEventListener('click', onExportExcel);
  document.getElementById('export-pdf').addEventListener('click', onExportPDF);

  const settings = loadSettings();
  if (settings && settings.sheetId) {
    loadDataFromGoogleSheets(settings);
  } else if (DEFAULT_SHEET_ID) {
    const defaultSettings = {
      sheetId: DEFAULT_SHEET_ID,
      matrixRange: 'Матрица',
      legendRange: 'Легенда с уровнями'
    };
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(defaultSettings));
    loadDataFromGoogleSheets(defaultSettings);
  } else {
    openSettings();
  }
});

/* ==================== SETTINGS ==================== */

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

/* ==================== LEGEND MODAL ==================== */

function openLegend() {
  const tbody = document.querySelector('#legend-table tbody');
  tbody.innerHTML = '';
  
  const items = Object.values(legendMap).sort((a, b) => 
    a.full.localeCompare(b.full, 'ru')
  );
  
  items.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${escapeHtml(item.short)}</strong></td>
      <td>${escapeHtml(item.full)}</td>
    `;
    tbody.appendChild(row);
  });
  
  document.getElementById('legend-modal').classList.add('show');
}

function closeLegend() {
  document.getElementById('legend-modal').classList.remove('show');
}

/* ==================== GOOGLE SHEETS ==================== */

async function loadDataFromGoogleSheets(settings) {
  showInfo('Загрузка данных из Google Sheets...');
  
  try {
    const legendUrl = `https://docs.google.com/spreadsheets/d/${settings.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(settings.legendRange)}`;
    const legendData = await fetchGoogleSheet(legendUrl);
    legendMap = parseLegend(legendData);
    console.log('✅ Legend entries:', Object.keys(legendMap).length);

    const matrixUrl = `https://docs.google.com/spreadsheets/d/${settings.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(settings.matrixRange)}`;
    const matrixData = await fetchGoogleSheet(matrixUrl);
    
    const parseResult = parseMatrix(matrixData, legendMap);
    rawRows = parseResult.rows;
    roleColumns = parseResult.roles;
    
    console.log('✅ Parsed rows:', rawRows.length);
    console.log('✅ Role columns:', roleColumns);

    buildTable();
    buildDetailsOptions();
    restoreFilters();
    renderTable();
    hideInfo();
    showToast('Данные загружены успешно', 1200);
  } catch (err) {
    console.error('❌ Loading error:', err);
    showInfo('Ошибка загрузки: ' + err.message, true);
  }
}

async function fetchGoogleSheet(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Не удалось загрузить данные. Проверьте доступ к таблице.');
  }
  const text = await response.text();
  
  const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
  if (!jsonMatch) {
    throw new Error('Неверный формат ответа от Google Sheets');
  }
  
  return JSON.parse(jsonMatch[1]);
}

function parseLegend(data) {
  const map = {};
  
  if (!data.table || !data.table.rows) {
    console.warn('No legend data');
    return map;
  }
  
  data.table.rows.forEach((row, idx) => {
    if (idx === 0) return; // Пропускаем заголовок
    if (!row.c || row.c.length < 3) return;
    
    const code = getCellValue(row.c[0]);
    const short = getCellValue(row.c[1]);
    const full = getCellValue(row.c[2]);
    
    if (code && short && full) {
      // Нормализуем код: "1.1." → "1.1"
      const normalizedCode = code.replace(/\.+$/, '');
      map[normalizedCode] = { short, full, level: getHierarchyLevel(normalizedCode) };
    }
  });
  
  console.log('Legend sample:', Object.entries(map).slice(0, 5));
  
  return map;
}

function getHierarchyLevel(code) {
  // "1" → level 1, "1.1" → level 2, "1.1.1" → level 3
  return code.split('.').filter(p => p).length;
}

function parseMatrix(data, legend) {
  if (!data.table || !data.table.rows) {
    throw new Error('No matrix data found');
  }
  
  const rows = data.table.rows;
  
  // Берем заголовки из первой строки
  const headerRow = rows[0];
  if (!headerRow || !headerRow.c) {
    throw new Error('No header row found');
  }
  
  const headers = headerRow.c.map(cell => getCellValue(cell));
  console.log('📋 Headers:', headers);
  
  // Находим столбцы ролей (с 5-го столбца, индекс 4)
  const roleStartIndex = 4;
  const roles = [];
  
  for (let i = roleStartIndex; i < headers.length; i++) {
    const header = headers[i];
    const role = extractRoleFromHeader(header);
    if (role) {
      roles.push(role);
    }
  }
  
  console.log('✅ Found roles:', roles);
  
  const result = [];
  
  // Парсим данные со 2-й строки
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row.c) continue;
    
    const num = getCellValue(row.c[0]);
    const block = getCellValue(row.c[1]);
    const func = getCellValue(row.c[2]);
    const product = getCellValue(row.c[3]);
    
    if (!num && !func) continue;
    
    const rowData = {
      num,
      block,
      func,
      product,
      roles: {},
      roleCodes: {} // Для цветовой кодировки
    };
    
    roles.forEach((role, idx) => {
      const colIdx = roleStartIndex + idx;
      const cellValue = getCellValue(row.c[colIdx]);
      
      if (cellValue && cellValue !== 'null') {
        const parsed = parseCellValue(cellValue, legend);
        rowData.roles[role] = parsed.display;
        rowData.roleCodes[role] = parsed.code; // Сохраняем код для цвета
      } else {
        rowData.roles[role] = '';
        rowData.roleCodes[role] = '';
      }
    });
    
    result.push(rowData);
  }
  
  console.log('✅ Parsed', result.length, 'data rows');
  
  return { rows: result, roles };
}

function getCellValue(cell) {
  if (!cell) return '';
  const value = cell.v !== undefined ? cell.v : (cell.f || '');
  return String(value).trim();
}

function extractRoleFromHeader(header) {
  if (!header) return null;
  
  const trimmed = header.trim();
  
  // (О), (ВО), (И)
  let match = trimmed.match(/\(([А-ЯЁ]+)\)/);
  if (match) return match[1];
  
  // "О", "ВО", "И"
  if (/^[А-ЯЁ]{1,3}$/.test(trimmed)) return trimmed;
  
  // "О - Ответственный"
  match = trimmed.match(/^([А-ЯЁ]+)\s*[-—]/);
  if (match) return match[1];
  
  return null;
}

function parseCellValue(cellValue, legend) {
  // Парсим "1.5.1 / Архитектор" → { display: "АиД / Архитектор", code: "1.5.1" }
  
  if (!cellValue || cellValue === 'null') {
    return { display: '', code: '' };
  }
  
  const parts = String(cellValue).split(/\s+(?=\d)/);
  const results = [];
  let firstCode = '';
  
  parts.forEach((part, idx) => {
    const match = part.match(/^([\d.]+)\s*\/\s*(.+)$/);
    if (match) {
      let code = match[1].trim().replace(/\.+$/, '');
      const position = match[2].trim();
      
      if (idx === 0) firstCode = code; // Сохраняем первый код для цвета
      
      const legendEntry = legend[code];
      if (legendEntry) {
        results.push(`${legendEntry.short} / ${position}`);
      } else {
        // Если код не найден в легенде, оставляем как есть
        console.warn(`Code ${code} not found in legend`);
        results.push(`${code} / ${position}`);
      }
    } else if (part.trim()) {
      results.push(part.trim());
    }
  });
  
  return { 
    display: results.join(', '), 
    code: firstCode // Используем для определения цвета
  };
}

function getCellColor(code) {
  if (!code) return '';
  
  const legendEntry = legendMap[code];
  if (!legendEntry) return '';
  
  const level = legendEntry.level;
  return LEVEL_COLORS[level] || LEVEL_COLORS.default;
}

/* ==================== TABLE ==================== */

function buildTable() {
  const table = document.getElementById('matrix');
  table.innerHTML = '';
  
  const colgroup = document.createElement('colgroup');
  colgroup.innerHTML = `
    <col class="col-num" />
    <col class="col-func" />
    <col class="col-product" />
  `;
  roleColumns.forEach(() => {
    const col = document.createElement('col');
    col.className = 'col-role';
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);
  
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  
  headerRow.innerHTML = `
    <th data-key="num" class="sortable">№ <span class="sort-arrow"></span></th>
    <th data-key="func" class="sortable">Функция <span class="sort-arrow"></span></th>
    <th data-key="product" class="sortable">Продукт <span class="sort-arrow"></span></th>
  `;
  
  roleColumns.forEach(role => {
    const th = document.createElement('th');
    th.className = 'sortable role-header';
    th.dataset.key = `role_${role}`;
    th.innerHTML = `${escapeHtml(role)} <span class="sort-arrow"></span>`;
    th.dataset.tooltip = ROLE_INFO[role] || role;
    th.title = ROLE_INFO[role] || role;
    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  
  table.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (!key) return;
      if (sortState.key === key) sortState.dir = -sortState.dir;
      else { sortState.key = key; sortState.dir = 1; }
      updateSortIndicators();
      renderTable();
    });
  });
  
  attachHeaderTooltips();
}

function attachHeaderTooltips() {
  const tip = document.getElementById('floating-tooltip');
  if (!tip) return;
  
  const headers = document.querySelectorAll('.role-header');
  headers.forEach(th => {
    th.addEventListener('mouseenter', (e) => {
      const text = th.dataset.tooltip || th.title || '';
      if (!text) return;
      const roleText = th.textContent.replace(/[↑↓]/g, '').trim();
      tip.innerHTML = `<strong>${escapeHtml(roleText)}</strong><br>${escapeHtml(text)}`;
      tip.classList.remove('hidden');
      tip.classList.add('show');
      positionTooltip(tip, th);
    });
    
    th.addEventListener('mousemove', (e) => {
      if (!tip.classList.contains('show')) return;
      positionTooltip(tip, th);
    });
    
    th.addEventListener('mouseleave', () => {
      tip.classList.remove('show');
      tip.classList.add('hidden');
    });
  });
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

    let vals = [];
    
    if (field === 'department') {
      // Собираем подразделения по КОДАМ из roleCodes
      const deptSet = new Set();
      rawRows.forEach(row => {
        Object.values(row.roleCodes).forEach(code => {
          if (!code) return;
          const legendEntry = legendMap[code];
          if (legendEntry) {
            deptSet.add(legendEntry.full);
          }
        });
      });
      vals = Array.from(deptSet).sort((a,b) => a.localeCompare(b, 'ru'));
    } else if (field === 'role') {
      vals = roleColumns.sort((a,b) => a.localeCompare(b, 'ru'));
    } else {
      vals = Array.from(new Set(rawRows.map(r => r[field]).filter(Boolean)));
      vals.sort((a,b) => String(a).localeCompare(String(b),'ru'));
    }
    
    console.log(`Filter ${field}: ${vals.length} values`);
    
    vals.forEach(v => {
      const row = document.createElement('div'); 
      row.className = 'opt';
      const id = `${cfg.id}___${hashString(String(v))}`;
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
    display.innerHTML = selected.map(v => `<div class="chip" title="${escapeHtmlAttr(String(v))}">${escapeHtml(String(v))}</div>`).join('');
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
        const inputs = details.querySelectorAll('input[type=checkbox]');
        inputs.forEach(input => {
          if (input.value === v) input.checked = true;
        });
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

  const filters = {};
  FILTER_CONFIG.forEach(cfg => {
    const details = document.querySelector(`.details-multi[data-filter-id="${cfg.id}"]`);
    const field = details.dataset.field;
    filters[field] = getDetailsSelectedValues(cfg.id);
  });

  let rows = rawRows.filter(row => {
    if (filters.func && filters.func.length > 0) {
      if (!filters.func.includes(row.func)) return false;
    }
    
    if (filters.department && filters.department.length > 0) {
      const rowDepts = new Set();
      Object.values(row.roleCodes).forEach(code => {
        if (!code) return;
        const legendEntry = legendMap[code];
        if (legendEntry) {
          rowDepts.add(legendEntry.full);
        }
      });
      
      const hasMatch = filters.department.some(dept => rowDepts.has(dept));
      if (!hasMatch) return false;
    }
    
    if (filters.role && filters.role.length > 0) {
      const hasMatch = filters.role.some(role => row.roles[role]);
      if (!hasMatch) return false;
    }
    
    return true;
  });

  if (sortState.key) {
    rows.sort((a, b) => {
      let va, vb;
      
      if (sortState.key.startsWith('role_')) {
        const role = sortState.key.replace('role_', '');
        va = String(a.roles[role] || '').toLowerCase();
        vb = String(b.roles[role] || '').toLowerCase();
      } else {
        va = String(a[sortState.key] || '').toLowerCase();
        vb = String(b[sortState.key] || '').toLowerCase();
      }
      
      if (va < vb) return -1 * sortState.dir;
      if (va > vb) return 1 * sortState.dir;
      return 0;
    });
  }

  lastRenderedRows = rows;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${3 + roleColumns.length}" style="padding:18px 12px; color:#666; text-align:center;">Нет данных по выбранным фильтрам</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => {
    let html = `<tr>
      <td class="col-num">${escapeHtml(String(row.num))}</td>
      <td class="col-func">${escapeHtml(String(row.func))}</td>
      <td class="col-product">${escapeHtml(String(row.product))}</td>`;
    
    roleColumns.forEach(role => {
      const value = row.roles[role] || '';
      const code = row.roleCodes[role] || '';
      const bgColor = getCellColor(code);
      const style = bgColor ? `style="background-color: ${bgColor}"` : '';
      html += `<td class="col-role-cell" ${style}>${escapeHtml(String(value))}</td>`;
    });
    
    html += `</tr>`;
    return html;
  }).join('');
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

function positionTooltip(tip, el) {
  const rect = el.getBoundingClientRect();
  tip.style.maxWidth = Math.min(420, window.innerWidth - 40) + 'px';
  const margin = 8;
  let top = rect.bottom + margin;
  
  if (top + tip.offsetHeight > window.innerHeight - 8) {
    top = rect.top - margin - tip.offsetHeight;
  }
  
  if (top < 8) top = 8;
  
  const tipW = tip.offsetWidth || Math.min(420, window.innerWidth - 40);
  let left = rect.left + rect.width / 2 - tipW / 2;
  
  if (left < 8) left = 8;
  if (left + tipW > window.innerWidth - 8) left = window.innerWidth - 8 - tipW;
  
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

/* ==================== EXPORT ==================== */

function onExportExcel() {
  if (!lastRenderedRows || !lastRenderedRows.length) { 
    showToast('Нет данных для экспорта', 1200); 
    return; 
  }
  
  const headers = ["№", "Функция", "Продукт", ...roleColumns];
  const sheetData = lastRenderedRows.map(r => {
    const rowData = {
      "№": r.num,
      "Функция": r.func,
      "Продукт": r.product
    };
    
    roleColumns.forEach(role => {
      rowData[role] = r.roles[role] || '';
    });
    
    return rowData;
  });
  
  const ws = XLSX.utils.json_to_sheet(sheetData, { header: headers, skipHeader: false });
  
  const colWidths = [
    {wch: 8},
    {wch: 40},
    {wch: 30},
  ];
  roleColumns.forEach(() => colWidths.push({wch: 20}));
  ws['!cols'] = colWidths;
  
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
  
  const now = new Date();
  const ts = now.toISOString().replace(/[:\-]/g,'').split('.')[0];
  const fn = `functional-matrix-${ts}.xlsx`;
  XLSX.writeFile(wb, fn);
  showToast('Экспорт в Excel завершён', 1500);
}

function onExportPDF() {
  if (!lastRenderedRows || !lastRenderedRows.length) { 
    showToast('Нет данных для экспорта', 1200); 
    return; 
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'mm', 'a4');
  
  const headers = [["№", "Функция", "Продукт", ...roleColumns]];
  const data = lastRenderedRows.map(r => {
    const row = [r.num, r.func, r.product];
    roleColumns.forEach(role => {
      row.push(r.roles[role] || '');
    });
    return row;
  });
  
  doc.autoTable({
    head: headers,
    body: data,
    startY: 20,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2
    },
    headStyles: {
      fillColor: [107, 78, 255],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 60 },
      2: { cellWidth: 50 }
    }
  });
  
  const now = new Date();
  const ts = now.toISOString().replace(/[:\-]/g,'').split('.')[0];
  const fn = `functional-matrix-${ts}.pdf`;
  doc.save(fn);
  showToast('Экспорт в PDF завершён', 1500);
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
