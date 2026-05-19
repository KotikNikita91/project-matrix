/* app.js — Функциональная матрица v3.0 */

const STORAGE_KEY_FILTERS = 'matrix_filters_v5';
const STORAGE_KEY_SETTINGS = 'matrix_gsheets_settings';

const DEFAULT_SHEET_ID = '1KAAS2yR0hvptF5nwr5UOpLElclUd5ja-HXdl3Yjp4HM';

/**
 * GAS-прокси URL — заполнить после деплоя Proxy_GAS.gs как Web App.
 * Оставить пустой строкой '' если используется GitHub Pages (прямой доступ работает).
 * Пример: 'https://script.google.com/macros/s/AKfycbxXXXXXXX/exec'
 */
const GAS_PROXY_URL = 'https://script.google.com/macros/s/AKfycbzmJS_VRnFQPJanUXvs5cAI4QI2Yx3Et8cy49IIqy4cUY2G9dD2dZl8EXlbLFGuM5VoRA/exec';

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
  { id: 'filter-block',      label: 'Блок функций', field: 'block' },
  { id: 'filter-function',   label: 'Функция',       field: 'func' },
  { id: 'filter-department', label: 'Подразделение', field: 'department' },
  { id: 'filter-position',   label: 'Должность',     field: 'position' },
  { id: 'filter-role',       label: 'Роль',          field: 'role' }
];

const DEPARTMENT_COLORS = {
  '0': '#e1bee7', '1': '#a5d6a7', '2': '#90caf9', '3': '#ffcc80',
  '4': '#ef9a9a', '5': '#fff59d', '6': '#bcaaa4', '7': '#80deea',
  '8': '#ffab91', '9': '#b39ddb', '10': '#c5e1a5', '11': '#ffe082',
  default: '#f5f5f5'
};

let rawRows = [];
let legendMap = {};
let roleColumns = [];
let lastRenderedRows = [];
let sortState = { key: null, dir: 1 };
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
  buildFilterPlaceholders();
  initTabs();

  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('cancel-settings').addEventListener('click', closeSettings);
  document.getElementById('legend-btn').addEventListener('click', openLegend);
  document.getElementById('close-legend').addEventListener('click', closeLegend);
  document.getElementById('clear')?.addEventListener('click', onClearFilters);

  const exportToggle = document.getElementById('export-toggle');
  const exportMenu = document.querySelector('.export-menu');
  exportToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('show');
  });
  document.addEventListener('click', () => exportMenu.classList.remove('show'));

  document.getElementById('export-excel').addEventListener('click', onExportExcel);
  document.getElementById('export-pdf').addEventListener('click', onExportPDF);

  // === УМНЫЙ ПОИСК ===
  const searchInput = document.getElementById('smart-search');
  const clearSearchBtn = document.getElementById('clear-search');

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    clearSearchBtn.style.display = searchQuery ? 'flex' : 'none';
    renderTable();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    document.getElementById('search-status').textContent = '';
    renderTable();
  });

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

  // Счётчик — сразу при загрузке страницы
  initVisitCounter();
});

/* ==================== SETTINGS ==================== */

function loadSettings() {
  const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
  if (!stored) return null;
  try { return JSON.parse(stored); } catch (e) { return null; }
}

function saveSettings() {
  const sheetId = document.getElementById('sheet-id').value.trim();
  const matrixRange = document.getElementById('matrix-range').value.trim();
  const legendRange = document.getElementById('legend-range').value.trim();
  if (!sheetId) { showToast('Введите ID таблицы', 1500); return; }
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

  const items = Object.values(legendMap).sort((a, b) => {
    const partsA = a.code.split('.').map(Number);
    const partsB = b.code.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA !== numB) return numA - numB;
    }
    return 0;
  });

  items.forEach(item => {
    const row = document.createElement('tr');
    const level = item.level;
    const indent = (level - 1) * 20;
    const dept = getDepartmentCode(item.code);
    const color = DEPARTMENT_COLORS[dept] || DEPARTMENT_COLORS.default;
    row.innerHTML = `
      <td style="padding-left: ${indent + 12}px;">
        <div style="width:20px;height:20px;background:${color};border-radius:4px;display:inline-block;margin-right:8px;vertical-align:middle;"></div>
        <strong>${escapeHtml(item.short)}</strong>
      </td>
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
    const legendData = await fetchSheet(settings.sheetId, settings.legendRange);
    legendMap = parseLegend(legendData);

    const matrixData = await fetchSheet(settings.sheetId, settings.matrixRange);

    const parseResult = parseMatrix(matrixData, legendMap);
    rawRows = parseResult.rows;
    roleColumns = parseResult.roles;

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

/**
 * Универсальная загрузка листа:
 *   1. Если задан GAS_PROXY_URL — использует его (работает с любого домена)
 *   2. Иначе — прямой запрос к gviz/tq (работает на github.io)
 *   3. Если прямой не прошёл — пробует публичные CORS-прокси
 */
async function fetchSheet(sheetId, sheetName) {
  // === Режим 1: GAS-прокси ===
  if (GAS_PROXY_URL) {
    const url = `${GAS_PROXY_URL}?sheet=${encodeURIComponent(sheetName)}`;
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.error) throw new Error('GAS error: ' + json.error);
      // Конвертируем плоский массив значений в формат gviz для parseMatrix/parseLegend
      return convertGasToGviz(json.values);
    } catch (err) {
      throw new Error('GAS-прокси недоступен: ' + err.message +
        '. Проверьте GAS_PROXY_URL и настройки деплоя (Execute as: Me, Access: Anyone).');
    }
  }

  // === Режим 2: прямой запрос gviz/tq (github.io и др.) ===
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;

  // Сначала пробуем напрямую
  try {
    const resp = await fetch(gvizUrl, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
    if (!match) throw new Error('Неверный формат ответа');
    return JSON.parse(match[1]);
  } catch (directErr) {
    console.warn('⚠️ Прямой запрос не прошёл:', directErr.message);
  }

  // Публичные CORS-прокси как крайний запасной вариант
  const publicProxies = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
  ];
  for (const proxy of publicProxies) {
    try {
      const resp = await fetch(proxy + encodeURIComponent(gvizUrl), { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
      if (!match) throw new Error('Неверный формат ответа');
      console.log('✅ Загружено через публичный прокси:', proxy);
      return JSON.parse(match[1]);
    } catch (err) {
      console.warn('⚠️ Прокси не сработал:', proxy, err.message);
    }
  }

  throw new Error(
    'Не удалось загрузить данные. ' +
    'Если сайт размещён не на GitHub Pages — задайте GAS_PROXY_URL в app.js. ' +
    'Инструкция: см. Proxy_GAS.gs в архиве проекта.'
  );
}

/**
 * Конвертирует плоский массив строк (из GAS-прокси) в формат gviz-объекта,
 * который ожидают parseMatrix() и parseLegend().
 */
function convertGasToGviz(values) {
  if (!values || values.length === 0) return { table: { rows: [] } };
  const rows = values.map(row => ({
    c: row.map(cell => ({ v: cell !== null && cell !== undefined ? String(cell) : '' }))
  }));
  return { table: { rows } };
}

function parseLegend(data) {
  const map = {};
  if (!data.table || !data.table.rows) return map;
  data.table.rows.forEach((row, idx) => {
    if (idx === 0) return;
    if (!row.c || row.c.length < 3) return;
    const code = getCellValue(row.c[0]);
    const short = getCellValue(row.c[1]);
    const full = getCellValue(row.c[2]);
    if (code && short && full) {
      const normalizedCode = code.replace(/\.+$/, '');
      map[normalizedCode] = {
        code: normalizedCode, short, full,
        level: getHierarchyLevel(normalizedCode),
        department: getDepartmentCode(normalizedCode)
      };
    }
  });
  return map;
}

function getHierarchyLevel(code) { return code.split('.').filter(p => p).length; }
function getDepartmentCode(code) { return code.split('.')[0]; }

function parseMatrix(data, legend) {
  if (!data.table || !data.table.rows) throw new Error('No matrix data found');
  const rows = data.table.rows;
  const headerRow = rows[0];
  if (!headerRow || !headerRow.c) throw new Error('No header row found');
  const headers = headerRow.c.map(cell => getCellValue(cell));
  const roleStartIndex = 4;
  const roles = [];
  for (let i = roleStartIndex; i < headers.length; i++) {
    const role = extractRoleFromHeader(headers[i]);
    if (role) roles.push(role);
  }
  const result = [];
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    if (!row.c) continue;
    const num = getCellValue(row.c[0]);
    const block = getCellValue(row.c[1]);
    const func = getCellValue(row.c[2]);
    const product = getCellValue(row.c[3]);
    if (!num && !func) continue;
    const rowData = { num, block, func, product, roles: {}, roleCodes: {}, positions: [] };
    roles.forEach((role, idx) => {
      const colIdx = roleStartIndex + idx;
      const cellValue = getCellValue(row.c[colIdx]);
      if (cellValue && cellValue !== 'null') {
        const parsed = parseCellValue(cellValue, legend);
        rowData.roles[role] = parsed.display;
        rowData.roleCodes[role] = parsed.code;
        rowData.positions.push(...parsed.positions);
      } else {
        rowData.roles[role] = '';
        rowData.roleCodes[role] = '';
      }
    });
    result.push(rowData);
  }
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
  let match = trimmed.match(/\(([А-ЯЁ]+)\)/);
  if (match) return match[1];
  if (/^[А-ЯЁ]{1,3}$/.test(trimmed)) return trimmed;
  match = trimmed.match(/^([А-ЯЁ]+)\s*[-—]/);
  if (match) return match[1];
  return null;
}

function parseCellValue(cellValue, legend) {
  if (!cellValue || cellValue === 'null') return { display: '', code: '', positions: [] };

  // Разбиваем на сегменты по разделителю " | " (GAS v2 объединяет должности так)
  const segments = String(cellValue).split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);

  const allResults = [];
  const allPositions = [];
  let firstCode = '';

  segments.forEach((segment, segIdx) => {
    // Внутри сегмента — разбивка по пробелу перед цифрой (старый формат без |)
    const parts = segment.split(/\s+(?=\d)/);
    parts.forEach((part, partIdx) => {
      part = part.trim();
      if (!part) return;

      // Формат А: "1.2.3 / Должность" — числовой код легенды
      const numericMatch = part.match(/^([\d.]+)\s*\/\s*(.+)$/);
      if (numericMatch) {
        const code = numericMatch[1].trim().replace(/\.+$/, '');
        const position = numericMatch[2].trim();
        if (segIdx === 0 && partIdx === 0) firstCode = code;
        allPositions.push(position);
        const entry = legend[code] || legend[code + '.'] || legend[code.replace(/\.$/, '')];
        allResults.push(entry ? `${entry.short} / ${position}` : `${code} / ${position}`);
        return;
      }

      // Формат Б: "БУКВЕННЫЙ_КОД / Должность" или "Что-то / Должность"
      const slashMatch = part.match(/^(.+?)\s*\/\s*(.+)$/);
      if (slashMatch) {
        const deptPart = slashMatch[1].trim();
        const position = slashMatch[2].trim();
        if (segIdx === 0 && partIdx === 0) {
          // Попробуем найти код по short-имени
          const entry = Object.values(legend).find(l => l.short === deptPart);
          if (entry) firstCode = entry.code;
        }
        allPositions.push(position);
        allResults.push(part); // Оставляем как есть — уже читаемый формат
        return;
      }

      // Без слеша — просто текст
      allResults.push(part);
    });
  });

  return { display: allResults.join(' | '), code: firstCode, positions: allPositions };
}

function getCellColor(code) {
  if (!code) return '';
  const dept = getDepartmentCode(code);
  return DEPARTMENT_COLORS[dept] || DEPARTMENT_COLORS.default;
}

/**
 * Извлекает цвет из одного сегмента вида "КОД / Должность" или "ШРТ / Должность".
 * Поддерживает числовые коды ("1.2.3") и буквенные короткие имена ("ОП", "МТО").
 */
function getColorFromSegment(segment) {
  if (!segment) return '';

  // Формат А: числовой код "1.2.3 / Должность"
  const numMatch = segment.match(/^([\d.]+)\s*\//);
  if (numMatch) {
    const code = numMatch[1].replace(/\.+$/, '');
    return getCellColor(code);
  }

  // Формат Б: буквенный короткий код "ОП / Должность"
  const txtMatch = segment.match(/^([^\s/]+)\s*\//);
  if (txtMatch) {
    const shortName = txtMatch[1].trim();
    // Ищем в легенде по short-имени
    const entry = Object.values(legendMap).find(l => l.short === shortName);
    if (entry) return getCellColor(entry.code);
  }

  return '';
}

/* ==================== УМНЫЙ ПОИСК ==================== */

/**
 * Нормализация строки для поиска
 */
function normalizeStr(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

/**
 * Расстояние Левенштейна между двумя строками
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Используем два массива вместо матрицы — экономим память
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Проверка одного слова против текста.
 * Сначала — прямое вхождение подстроки.
 * Если не найдено и слово >= 4 символов — нечёткое сравнение:
 *   для каждой позиции в тексте смотрим подстроку той же длины, расстояние <= 1.
 */
function matchWord(word, text) {
  // Прямое вхождение (substring)
  if (text.includes(word)) return true;

  // Нечёткий поиск для слов от 4 символов
  if (word.length >= 4) {
    const wLen = word.length;
    // Проверяем подстроки текста длиной wLen-1, wLen, wLen+1
    for (let delta = -1; delta <= 1; delta++) {
      const sLen = wLen + delta;
      if (sLen < 2) continue;
      for (let i = 0; i <= text.length - sLen; i++) {
        if (levenshtein(word, text.slice(i, i + sLen)) <= 1) return true;
      }
    }
  }

  return false;
}

/**
 * Основная функция нечёткого поиска.
 * Делит запрос на слова; каждое слово должно совпасть (substring или 1 опечатка).
 */
function fuzzyMatch(query, text) {
  if (!query || !query.trim()) return true;
  if (!text) return false;
  const q = normalizeStr(query);
  const t = normalizeStr(text);
  const words = q.split(' ').filter(Boolean);
  return words.every(word => matchWord(word, t));
}

/* ==================== TABLE ==================== */

function buildTable() {
  const table = document.getElementById('matrix');
  table.innerHTML = '';
  const colgroup = document.createElement('colgroup');
  colgroup.innerHTML = `
    <col class="col-num" />
    <col class="col-block" />
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
    <th data-key="block" class="sortable">Блок <span class="sort-arrow"></span></th>
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
  document.querySelectorAll('.role-header').forEach(th => {
    th.addEventListener('mouseenter', () => {
      const text = th.dataset.tooltip || th.title || '';
      if (!text) return;
      const roleText = th.textContent.replace(/[↑↓]/g, '').trim();
      tip.innerHTML = `<strong>${escapeHtml(roleText)}</strong><br>${escapeHtml(text)}`;
      tip.classList.remove('hidden');
      tip.classList.add('show');
      positionTooltip(tip, th);
    });
    th.addEventListener('mousemove', () => {
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
        if (details.hasAttribute('open')) panel.style.display = 'flex';
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
      if (p) p.style.display = 'none';
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
    btnAll.type = 'button'; btnAll.textContent = 'Выбрать всё';
    const btnClear = document.createElement('button');
    btnClear.type = 'button'; btnClear.textContent = 'Очистить';
    actions.appendChild(btnAll); actions.appendChild(btnClear);
    panel.appendChild(actions);

    const options = document.createElement('div');
    options.className = 'options-list';
    panel.appendChild(options);

    // Поиск внутри выпадашки (для всех кроме role — там мало пунктов)
    const searchWrap = document.createElement('div');
    searchWrap.className = 'panel-search-wrap';
    const searchIn = document.createElement('input');
    searchIn.type = 'text';
    searchIn.placeholder = 'Поиск...';
    searchIn.className = 'panel-search-input';
    searchIn.addEventListener('input', (e) => {
      e.stopPropagation();
      filterPanelOptions(options, searchIn.value);
    });
    searchIn.addEventListener('click', e => e.stopPropagation());
    searchWrap.appendChild(searchIn);
    panel.insertBefore(searchWrap, options);

    if (field === 'department') {
      buildHierarchicalDepartments(options, details);
      btnAll.addEventListener('click', (e) => {
        e.stopPropagation();
        options.querySelectorAll('.opt:not([style*="display: none"]) input[type=checkbox], .opt:not([style*="display:none"]) input[type=checkbox]').forEach(i => i.checked = true);
        onDetailsSelectionChange(cfg.id);
      });
      btnClear.addEventListener('click', (e) => {
        e.stopPropagation();
        options.querySelectorAll('input[type=checkbox]').forEach(i => i.checked = false);
        searchIn.value = '';
        filterPanelOptions(options, '');
        onDetailsSelectionChange(cfg.id);
      });
      renderDetailsDisplay(cfg.id);
      return;
    }

    let vals = getAvailableFilterValues(field);

    vals.forEach(v => {
      const row = document.createElement('div');
      row.className = 'opt';
      const id = `${cfg.id}___${hashString(String(v))}`;
      const input = document.createElement('input');
      input.type = 'checkbox'; input.id = id; input.value = v;
      const label = document.createElement('label');
      label.htmlFor = id; label.textContent = v;
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        onDetailsSelectionChange(cfg.id);
      });
      row.appendChild(input); row.appendChild(label);
      options.appendChild(row);
    });

    btnAll.addEventListener('click', (e) => {
      e.stopPropagation();
      // Выбираем только видимые элементы (с учётом поиска в панели)
      options.querySelectorAll('.opt').forEach(opt => {
        if (opt.style.display !== 'none') {
          const inp = opt.querySelector('input[type=checkbox]');
          if (inp) inp.checked = true;
        }
      });
      onDetailsSelectionChange(cfg.id);
    });
    btnClear.addEventListener('click', (e) => {
      e.stopPropagation();
      // Снимаем все чекбоксы + очищаем поле поиска + показываем все варианты
      options.querySelectorAll('input[type=checkbox]').forEach(i => i.checked = false);
      searchIn.value = '';
      filterPanelOptions(options, '');
      onDetailsSelectionChange(cfg.id);
    });

    renderDetailsDisplay(cfg.id);
  });
}

function getAvailableFilterValues(field) {
  const filteredRows = getFilteredRowsExcluding(field);
  let vals = [];

  if (field === 'block') {
    // Уникальные блоки с полным названием, отсортированные по порядковому номеру
    const blockSet = new Set();
    filteredRows.forEach(r => { if (r.block) blockSet.add(r.block); });
    vals = Array.from(blockSet)
      .filter(Boolean)
      .sort((a, b) => {
        // Извлекаем ведущее число для сортировки
        const numA = parseFloat(String(a).match(/^[\d.]+/)?.[0] ?? '');
        const numB = parseFloat(String(b).match(/^[\d.]+/)?.[0] ?? '');
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return String(a).localeCompare(String(b), 'ru');
      });
  } else if (field === 'position') {
    const selectedDepts = getDetailsSelectedCodes('filter-department');
    const positionMap = new Map();
    filteredRows.forEach(row => {
      roleColumns.forEach(role => {
        const cellValue = row.roles[role];
        if (!cellValue) return;
        // Делим и по " | " (новый GAS-формат) и по ", " (старый)
        const parts = cellValue.split(/\s*\|\s*|,\s*/).map(p => p.trim()).filter(Boolean);
        parts.forEach(part => {
          const match = part.match(/^(.+?)\s*\/\s*(.+)$/);
          if (match) {
            const deptOrCode = match[1].trim();
            const position = match[2].trim();
            let deptCode = null;
            const legendEntry = Object.values(legendMap).find(l => l.short === deptOrCode);
            if (legendEntry) deptCode = legendEntry.code;
            else deptCode = deptOrCode;
            if (!positionMap.has(position)) positionMap.set(position, new Set());
            if (deptCode) positionMap.get(position).add(deptCode);
          }
        });
      });
    });
    if (selectedDepts && selectedDepts.length > 0) {
      const filteredPositions = [];
      positionMap.forEach((codes, position) => {
        const belongsToDept = Array.from(codes).some(code =>
          selectedDepts.some(filterCode => code === filterCode || code.startsWith(filterCode + '.'))
        );
        if (belongsToDept) filteredPositions.push(position);
      });
      vals = filteredPositions.sort((a, b) => a.localeCompare(b, 'ru'));
    } else {
      vals = Array.from(positionMap.keys()).sort((a, b) => a.localeCompare(b, 'ru'));
    }
  } else if (field === 'role') {
    vals = roleColumns.slice().sort((a, b) => a.localeCompare(b, 'ru'));
  } else {
    vals = Array.from(new Set(filteredRows.map(r => r[field]).filter(Boolean)));
    vals.sort((a, b) => String(a).localeCompare(String(b), 'ru'));
  }

  return vals;
}

function getFilteredRowsExcluding(excludeField) {
  const filters = {};
  FILTER_CONFIG.forEach(cfg => {
    if (cfg.field === excludeField) return;
    if (cfg.field === 'department') {
      filters[cfg.field] = getDetailsSelectedCodes(cfg.id);
    } else {
      filters[cfg.field] = getDetailsSelectedValues(cfg.id);
    }
  });

  return rawRows.filter(row => applyFilters(row, filters));
}

/** Применяет набор фильтров к строке */
function applyFilters(row, filters) {
  if (filters.block && filters.block.length > 0) {
    if (!filters.block.includes(row.block)) return false;
  }
  if (filters.func && filters.func.length > 0) {
    if (!filters.func.includes(row.func)) return false;
  }
  if (filters.department && filters.department.length > 0) {
    const rowCodes = Object.values(row.roleCodes).filter(Boolean);
    const hasMatch = rowCodes.some(code =>
      filters.department.some(fc => code === fc || code.startsWith(fc + '.'))
    );
    if (!hasMatch) return false;
  }
  if (filters.position && filters.position.length > 0) {
    if (!row.positions.some(pos => filters.position.includes(pos))) return false;
  }
  if (filters.role && filters.role.length > 0) {
    if (!filters.role.some(role => row.roles[role])) return false;
  }
  return true;
}

function buildHierarchicalDepartments(container, details) {
  const tree = {};
  Object.values(legendMap).forEach(item => {
    const parts = item.code.split('.');
    const key = parts[0];
    if (!tree[key]) tree[key] = { code: key, item, children: {} };
    if (parts.length > 1) {
      const level2Key = parts.slice(0, 2).join('.');
      if (!tree[key].children[level2Key]) {
        const level2Item = legendMap[level2Key];
        if (level2Item) tree[key].children[level2Key] = { code: level2Key, item: level2Item, children: {} };
      }
      if (parts.length > 2) {
        const level3Key = parts.slice(0, 3).join('.');
        const parent = tree[key].children[level2Key];
        if (parent && !parent.children[level3Key]) {
          const level3Item = legendMap[level3Key];
          if (level3Item) parent.children[level3Key] = { code: level3Key, item: level3Item, children: {} };
        }
      }
    }
  });
  const sortedKeys = Object.keys(tree).sort((a, b) => parseInt(a) - parseInt(b));
  sortedKeys.forEach(key => renderDepartmentNode(container, tree[key], 0, details));
}

function renderDepartmentNode(container, node, level, details) {
  const indent = level * 20;
  const id = `${details.dataset.filterId}___${node.code}`;
  const row = document.createElement('div');
  row.className = 'opt dept-opt';
  row.style.paddingLeft = `${indent + 6}px`;
  const hasChildren = Object.keys(node.children).length > 0;

  if (hasChildren) {
    const toggle = document.createElement('span');
    toggle.className = 'dept-toggle';
    toggle.textContent = '▸';
    toggle.style.cssText = 'cursor:pointer;margin-right:4px;display:inline-block;width:12px;';
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = toggle.textContent === '▾';
      toggle.textContent = isExpanded ? '▸' : '▾';
      let nextEl = row.nextElementSibling;
      while (nextEl && nextEl.classList.contains('dept-child')) {
        nextEl.style.display = isExpanded ? 'none' : 'flex';
        nextEl = nextEl.nextElementSibling;
      }
    });
    row.appendChild(toggle);
  } else {
    const spacer = document.createElement('span');
    spacer.style.cssText = 'display:inline-block;width:16px;';
    row.appendChild(spacer);
  }

  const input = document.createElement('input');
  input.type = 'checkbox'; input.id = id;
  input.value = node.item.full;
  input.dataset.code = node.code;
  input.addEventListener('change', (e) => {
    e.stopPropagation();
    if (input.checked && hasChildren) {
      let nextEl = row.nextElementSibling;
      while (nextEl && nextEl.classList.contains('dept-child')) {
        const childInput = nextEl.querySelector('input[type=checkbox]');
        if (childInput) childInput.checked = true;
        nextEl = nextEl.nextElementSibling;
      }
    }
    onDetailsSelectionChange(details.dataset.filterId);
  });

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = `${node.item.short} - ${node.item.full}`;
  row.appendChild(input); row.appendChild(label);
  container.appendChild(row);

  if (hasChildren) {
    const sortedChildKeys = Object.keys(node.children).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    sortedChildKeys.forEach(childKey => {
      const childRow = renderDepartmentNode(container, node.children[childKey], level + 1, details);
      if (childRow) {
        childRow.classList.add('dept-child');
        childRow.style.display = 'none';
      }
    });
  }

  return row;
}

function onDetailsSelectionChange(filterId) {
  renderDetailsDisplay(filterId);
  saveFilters();
  updateRelatedFilters(filterId);
  renderTable();
}

function updateRelatedFilters(changedFilterId) {
  FILTER_CONFIG.forEach(cfg => {
    if (cfg.id === changedFilterId) return;
    if (cfg.field === 'department') return;
    const details = document.querySelector(`.details-multi[data-filter-id="${cfg.id}"]`);
    if (!details) return;
    const panel = details.querySelector('.options-list');
    if (!panel) return;
    const currentSelected = getDetailsSelectedValues(cfg.id);
    const newVals = getAvailableFilterValues(cfg.field);
    panel.innerHTML = '';
    // Сбрасываем поиск внутри панели
    const si = details.querySelector('.panel-search-input');
    if (si) si.value = '';
    newVals.forEach(v => {
      const row = document.createElement('div');
      row.className = 'opt';
      const id = `${cfg.id}___${hashString(String(v))}`;
      const input = document.createElement('input');
      input.type = 'checkbox'; input.id = id; input.value = v;
      if (currentSelected.includes(v)) input.checked = true;
      const label = document.createElement('label');
      label.htmlFor = id; label.textContent = v;
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        onDetailsSelectionChange(cfg.id);
      });
      row.appendChild(input); row.appendChild(label);
      panel.appendChild(row);
    });
    renderDetailsDisplay(cfg.id);
  });
}

/** Фильтрует опции в панели дропдауна по строке поиска */
function filterPanelOptions(optionsEl, query) {
  const q = query.trim().toLowerCase().replace(/ё/g, 'е');
  const items = optionsEl.querySelectorAll('.opt');
  items.forEach(item => {
    const label = item.querySelector('label');
    const text = (label ? label.textContent : '').toLowerCase().replace(/ё/g, 'е');
    item.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
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
  return Array.from(details.querySelectorAll('input[type=checkbox]:checked')).map(i => i.value);
}

function getDetailsSelectedCodes(filterId) {
  const details = document.querySelector(`.details-multi[data-filter-id="${filterId}"]`);
  if (!details) return [];
  return Array.from(details.querySelectorAll('input[type=checkbox]:checked')).map(i => i.dataset.code || i.value);
}

function saveFilters() {
  const state = {};
  FILTER_CONFIG.forEach(cfg => { state[cfg.id] = getDetailsSelectedValues(cfg.id); });
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
        details.querySelectorAll('input[type=checkbox]').forEach(input => {
          if (input.value === v) input.checked = true;
        });
      });
      renderDetailsDisplay(cfg.id);
    });
  } catch (e) { console.error('Failed to restore filters:', e); }
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
    if (p) p.style.display = 'none';
  });

  // Сбрасываем поиск
  const searchInput = document.getElementById('smart-search');
  if (searchInput) searchInput.value = '';
  searchQuery = '';
  const clearBtn = document.getElementById('clear-search');
  if (clearBtn) clearBtn.style.display = 'none';
  const status = document.getElementById('search-status');
  if (status) status.textContent = '';

  buildDetailsOptions();

  // Сбрасываем сортировку
  sortState = { key: null, dir: 1 };
  updateSortIndicators();

  renderTable();
  showToast('Фильтры сброшены', 900);

  // Возвращаемся в начало страницы + сбрасываем скролл таблицы
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const tw = document.getElementById('table-wrapper');
  if (tw) { tw.scrollTop = 0; tw.scrollLeft = 0; }
}

/* ==================== RENDER ==================== */

function renderTable() {
  const tbody = document.querySelector('#matrix tbody');
  if (!tbody) return;

  const filters = {};
  FILTER_CONFIG.forEach(cfg => {
    const details = document.querySelector(`.details-multi[data-filter-id="${cfg.id}"]`);
    const field = details.dataset.field;
    if (field === 'department') {
      filters[field] = getDetailsSelectedCodes(cfg.id);
    } else {
      filters[field] = getDetailsSelectedValues(cfg.id);
    }
  });

  let rows = rawRows.filter(row => applyFilters(row, filters));

  // === УМНЫЙ ПОИСК — применяем поверх фильтров ===
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim();
    rows = rows.filter(row => {
      const searchTarget = [row.block, row.func].filter(Boolean).join(' ');
      return fuzzyMatch(q, searchTarget);
    });

    // Обновляем статус поиска
    const status = document.getElementById('search-status');
    if (status) {
      status.textContent = rows.length
        ? `Найдено: ${rows.length} ${pluralize(rows.length, 'запись', 'записи', 'записей')}`
        : 'Ничего не найдено';
      status.className = 'search-status ' + (rows.length ? 'search-found' : 'search-empty');
    }
  } else {
    const status = document.getElementById('search-status');
    if (status) { status.textContent = ''; status.className = 'search-status'; }
  }

  if (sortState.key) {
    rows.sort((a, b) => {
      let va, vb;
      if (sortState.key.startsWith('role_')) {
        const role = sortState.key.replace('role_', '');
        va = String(a.roles[role] || '').toLowerCase();
        vb = String(b.roles[role] || '').toLowerCase();
      } else if (sortState.key === 'num') {
        // Числовая сортировка для колонки №
        const na = parseFloat(String(a.num).replace(',', '.')) || 0;
        const nb = parseFloat(String(b.num).replace(',', '.')) || 0;
        return (na - nb) * sortState.dir;
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
    tbody.innerHTML = `<tr><td colspan="${4 + roleColumns.length}" style="padding:18px 12px; color:#666; text-align:center;">Нет данных по выбранным фильтрам</td></tr>`;
    return;
  }

  const selectedPositions = filters.position || [];
  const highlightQuery = searchQuery && searchQuery.trim();

  tbody.innerHTML = rows.map(row => {
    let html = `<tr>
      <td class="col-num">${escapeHtml(String(row.num))}</td>
      <td class="col-block">${highlightQuery ? highlightText(String(row.block), searchQuery) : escapeHtml(String(row.block))}</td>
      <td class="col-func">${highlightQuery ? highlightText(String(row.func), searchQuery) : escapeHtml(String(row.func))}</td>
      <td class="col-product">${escapeHtml(String(row.product))}</td>`;

    roleColumns.forEach(role => {
      const value = row.roles[role] || '';
      const isHighlighted = selectedPositions.length > 0 && selectedPositions.some(pos => value.includes(`/ ${pos}`));
      const highlightClass = isHighlighted ? 'highlighted-position' : '';

      let displayHtml = '';
      if (value) {
        const segments = value.split(' | ');
        displayHtml = segments.map((v, i) => {
          v = v.trim();
          if (!v) return '';
          // Извлекаем цвет для каждого сегмента отдельно по его коду
          const segColor = getColorFromSegment(v);
          const bgAttr = segColor ? ` style="background:${segColor}"` : '';
          const sep = i > 0 ? '<span class="pos-sep">·</span>' : '';
          return `${sep}<span class="pos-entry"><span class="pos-bg"${bgAttr}>${escapeHtml(v)}</span></span>`;
        }).join('');
      }

      html += `<td class="col-role-cell ${highlightClass}">${displayHtml}</td>`;
    });

    html += `</tr>`;
    return html;
  }).join('');
}

/**
 * Подсвечивает найденные слова в тексте
 */
function highlightText(text, query) {
  if (!query || !text) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const words = normalizeStr(query).split(' ').filter(Boolean);
  let result = escaped;
  words.forEach(word => {
    if (!word) return;
    // Экранируем спецсимволы для RegExp
    const safeWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const re = new RegExp(`(${safeWord})`, 'gi');
      result = result.replace(re, '<mark class="search-highlight">$1</mark>');
    } catch (e) {}
  });
  return result;
}

function pluralize(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return few;
  return many;
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
  if (top + tip.offsetHeight > window.innerHeight - 8) top = rect.top - margin - tip.offsetHeight;
  if (top < 8) top = 8;
  const tipW = tip.offsetWidth || Math.min(420, window.innerWidth - 40);
  let left = rect.left + rect.width / 2 - tipW / 2;
  if (left < 8) left = 8;
  if (left + tipW > window.innerWidth - 8) left = window.innerWidth - 8 - tipW;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

/* ==================== EXPORT EXCEL ==================== */

function onExportExcel() {
  if (!lastRenderedRows || !lastRenderedRows.length) {
    showToast('Нет данных для экспорта', 1200);
    return;
  }
  const headers = ['№', 'Блок', 'Функция', 'Продукт', ...roleColumns];
  const sheetData = lastRenderedRows.map(r => {
    const rowData = { '№': r.num, 'Блок': r.block, 'Функция': r.func, 'Продукт': r.product };
    roleColumns.forEach(role => { rowData[role] = r.roles[role] || ''; });
    return rowData;
  });
  const ws = XLSX.utils.json_to_sheet(sheetData, { header: headers });
  const colWidths = [{ wch: 8 }, { wch: 25 }, { wch: 40 }, { wch: 30 }];
  roleColumns.forEach(() => colWidths.push({ wch: 20 }));
  ws['!cols'] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Matrix');
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  XLSX.writeFile(wb, `Матрица_${dd}.${mm}.${yyyy}.xlsx`);
  showToast('Экспорт в Excel завершён', 1500);
}

/* ==================== EXPORT PDF (print window) ==================== */

function onExportPDF() {
  if (!lastRenderedRows || !lastRenderedRows.length) {
    showToast('Нет данных для экспорта', 1200);
    return;
  }
  document.querySelector('.export-menu').classList.remove('show');

  // Формируем заголовки столбцов
  const colDefs = [
    { key: 'num',     label: '№',       width: '40px' },
    { key: 'block',   label: 'Блок',    width: '130px' },
    { key: 'func',    label: 'Функция', width: '260px' },
    { key: 'product', label: 'Продукт', width: '180px' },
    ...roleColumns.map(r => ({ key: `role_${r}`, label: r, width: '80px', role: r }))
  ];

  // Строим HTML таблицы
  const thead = `<tr>${colDefs.map(c =>
    `<th style="width:${c.width};min-width:${c.width}">${escapeHtml(c.label)}</th>`
  ).join('')}</tr>`;

  const tbody = lastRenderedRows.map(row => {
    const cells = colDefs.map(c => {
      if (c.role !== undefined) {
        const value = row.roles[c.role] || '';
        if (!value) return '<td></td>';
        const segments = value.split(' | ');
        const cellHtml = segments.map((v, i) => {
          v = v.trim();
          const bg = getColorFromSegment(v);
          const bgStyle = bg ? ` style="background:${bg};border-radius:3px;padding:1px 3px;display:inline-block;width:100%;box-sizing:border-box"` : '';
          const inner = `<span${bgStyle}>${escapeHtml(v)}</span>`;
          return i === 0
            ? `<span class="pos-entry">${inner}</span>`
            : `<span class="pos-sep">·</span><span class="pos-entry">${inner}</span>`;
        }).join('');
        return `<td>${cellHtml}</td>`;
      }
      return `<td>${escapeHtml(String(row[c.key] ?? ''))}</td>`;
    });
    return `<tr>${cells.join('')}</tr>`;
  }).join('');

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const date = `${dd}.${mm}.${yyyy}`;
  const pdfTitle = `Матрица_${dd}.${mm}.${yyyy}`;

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<title>${pdfTitle}</title>
<style>
  @page { size: A3 landscape; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 8pt; color: #111; background: #fff; }
  .pdf-header { display: flex; justify-content: space-between; align-items: baseline;
    padding-bottom: 6px; border-bottom: 2px solid #6b4eff; margin-bottom: 8px; }
  .pdf-header h1 { font-size: 13pt; color: #6b4eff; font-weight: 700; }
  .pdf-header .date { font-size: 8pt; color: #888; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { background: #6b4eff; color: #fff; font-size: 7.5pt; font-weight: 600;
    padding: 5px 3px; text-align: center; border: 1px solid #5a3ee0;
    white-space: nowrap; overflow: hidden; }
  td { font-size: 7pt; padding: 4px 3px; border: 1px solid #ddd;
    vertical-align: top; word-break: break-word; line-height: 1.3; }
  .pos-entry { display: block; padding: 1px 0; }
  .pos-sep { display: block; border-top: 1px dashed #b0a0ff;
    margin: 2px 0; padding-top: 2px; font-size: 7px;
    color: #9b80ff; text-align: center; line-height: 1; }
  tr:nth-child(even) td { background-color: #fafafa; }
  tr:hover td { background-color: #f0ecff !important; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr:hover td { background-color: inherit !important; }
  }
</style>
</head>
<body>
<div class="pdf-header">
  <h1>Функциональная матрица</h1>
  <span class="date">${date}</span>
</div>
<table>
  <thead>${thead}</thead>
  <tbody>${tbody}</tbody>
</table>
<script>
  window.onload = function() {
    window.print();
  };
<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) {
    showToast('Разрешите всплывающие окна для экспорта PDF', 3000);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/* ==================== UTILS ==================== */

function showInfo(msg, important = false) {
  const el = document.getElementById('info');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = msg;
  el.style.border = important ? '1px solid #ffdede' : 'none';
}

function hideInfo() {
  const el = document.getElementById('info');
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
  el.style.border = 'none';
}

function showToast(msg, ms = 1200) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.add('hidden'), ms);
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}


/* ============================================================
   ВКЛАДКИ
   ============================================================ */

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + tab).classList.add('active');

      const searchRow = document.getElementById('search-bar-row');
      const controlsRow = document.getElementById('controls-compact');
      const exportDropdown = document.querySelector('.export-dropdown');
      const legendBtn = document.getElementById('legend-btn');

      if (tab === 'matrix') {
        if (searchRow) searchRow.style.display = '';
        if (controlsRow) controlsRow.style.display = '';
        if (exportDropdown) exportDropdown.style.display = '';
        if (legendBtn) legendBtn.style.display = '';
      } else {
        if (searchRow) searchRow.style.display = 'none';
        if (controlsRow) controlsRow.style.display = 'none';
        if (exportDropdown) exportDropdown.style.display = 'none';
        if (legendBtn) legendBtn.style.display = 'none';
      }

      if (tab === 'report') renderReport();
    });
  });
}

/* ============================================================
   КОНСТРУКТОР — «По должностям»
   Строки: функции | Колонки: выбранные должности | Ячейки: роль
   ============================================================ */

let reportSelectedPositions = new Set();

/**
 * Строит индекс rowIdx → Map<posKey, role>
 */
function buildPositionRoleIndex() {
  const index = new Map();
  rawRows.forEach((row, ri) => {
    const rowMap = new Map();
    roleColumns.forEach(role => {
      const value = row.roles[role] || '';
      if (!value) return;
      value.split(' | ').forEach(seg => {
        seg = seg.trim();
        if (seg) rowMap.set(seg, role);
      });
    });
    index.set(ri, rowMap);
  });
  return index;
}

/**
 * Строит иерархическую карту: topDeptKey → { short, full, color, children: Map, positions: Set }
 * children: subCode → { short, full, color, positions: Set }
 * Правильно обрабатывает числовые коды (1.2.3) и буквенные (1С, ИТ)
 */
function buildDeptHierarchy() {
  const top = new Map();   // top-level key → dept info

  rawRows.forEach(row => {
    roleColumns.forEach(role => {
      const value = row.roles[role] || '';
      if (!value) return;
      value.split(' | ').forEach(seg => {
        seg = seg.trim();
        if (!seg) return;

        const shortMatch = seg.match(/^([^\s/]+)\s*\//);
        if (!shortMatch) return;
        const deptShort = shortMatch[1].trim();

        // Ищем в легенде
        const entry = Object.values(legendMap).find(l => l.short === deptShort);
        if (!entry) {
          // Неизвестный - в отдельную группу
          const key = deptShort;
          if (!top.has(key)) {
            top.set(key, { short: deptShort, full: deptShort, color: '#e0e0e0',
              children: new Map(), positions: new Set(), sortKey: 9999 });
          }
          top.get(key).positions.add(seg);
          return;
        }

        const code = entry.code;
        const parts = code.split('.');
        const topCode = parts[0];  // числовой или текстовый верхний уровень
        const color = DEPARTMENT_COLORS[topCode] || DEPARTMENT_COLORS.default;

        // Найти top-level запись в легенде
        const topEntry = legendMap[topCode] || Object.values(legendMap).find(l => l.code === topCode);
        const topShort = topEntry ? topEntry.short : topCode;
        const topFull  = topEntry ? topEntry.full  : topCode;

        if (!top.has(topCode)) {
          top.set(topCode, {
            short: topShort, full: topFull, color,
            children: new Map(), positions: new Set(),
            sortKey: isNaN(parseInt(topCode)) ? 9000 : parseInt(topCode)
          });
        }
        const topDept = top.get(topCode);

        if (parts.length === 1) {
          // Сама верхнеуровневая должность
          topDept.positions.add(seg);
        } else {
          // Дочернее подразделение
          const subCode = parts.slice(0, 2).join('.');
          const subEntry = legendMap[subCode];
          if (subEntry && !topDept.children.has(subCode)) {
            const subColor = DEPARTMENT_COLORS[topCode] || color;
            topDept.children.set(subCode, {
              short: subEntry.short, full: subEntry.full,
              color: subColor, positions: new Set(),
              sortKey: parseFloat(subCode) || 0
            });
          }
          if (topDept.children.has(subCode)) {
            topDept.children.get(subCode).positions.add(seg);
          } else {
            topDept.positions.add(seg);
          }
        }
      });
    });
  });

  // Сортируем
  return new Map([...top.entries()].sort((a, b) => a[1].sortKey - b[1].sortKey));
}

/* ---------- КОНСТРУКТОР UI (дропдауны) ---------- */

let reportDropdowns = [];  // хранит DOM-ссылки для «Выбрать/Снять все»

function buildReportConstructor() {
  const row = document.getElementById('report-dept-row');
  if (!row || rawRows.length === 0) return;
  row.innerHTML = '';
  reportDropdowns = [];

  const hierarchy = buildDeptHierarchy();

  hierarchy.forEach((dept, topCode) => {
    // Собираем все должности этого top-dept (свои + дочерних)
    const allPositions = new Set(dept.positions);
    dept.children.forEach(child => child.positions.forEach(p => allPositions.add(p)));
    if (allPositions.size === 0) return;

    // Создаём дропдаун-контейнер
    const wrap = document.createElement('div');
    wrap.className = 'rdrop-wrap';

    // Кнопка-триггер
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'rdrop-trigger';
    trigger.dataset.code = topCode;

    const dot = document.createElement('span');
    dot.className = 'rdrop-dot';
    dot.style.background = dept.color;

    const label = document.createElement('span');
    label.className = 'rdrop-label';
    label.textContent = `${dept.short}`;
    label.title = dept.full;

    const badge = document.createElement('span');
    badge.className = 'rdrop-badge';
    badge.textContent = '0';

    const arrow = document.createElement('span');
    arrow.className = 'rdrop-arrow';
    arrow.textContent = '▾';

    trigger.appendChild(dot);
    trigger.appendChild(label);
    trigger.appendChild(badge);
    trigger.appendChild(arrow);
    wrap.appendChild(trigger);

    // Панель
    const panel = document.createElement('div');
    panel.className = 'rdrop-panel';
    panel.style.display = 'none';

    // Поиск внутри
    const searchWrap = document.createElement('div');
    searchWrap.className = 'rdrop-search-wrap';
    const searchIn = document.createElement('input');
    searchIn.type = 'text';
    searchIn.placeholder = 'Поиск...';
    searchIn.className = 'rdrop-search';
    searchIn.addEventListener('input', e => {
      e.stopPropagation();
      filterRdropOptions(panel, searchIn.value);
    });
    searchIn.addEventListener('click', e => e.stopPropagation());
    searchWrap.appendChild(searchIn);
    panel.appendChild(searchWrap);

    // Кнопки все/очистить
    const panelActions = document.createElement('div');
    panelActions.className = 'rdrop-panel-actions';
    const btnAll = document.createElement('button');
    btnAll.type = 'button'; btnAll.textContent = 'Все';
    const btnNone = document.createElement('button');
    btnNone.type = 'button'; btnNone.textContent = 'Снять';
    btnAll.addEventListener('click', e => {
      e.stopPropagation();
      panel.querySelectorAll('.rdrop-opt:not([style*="display: none"]):not([style*="display:none"]) input').forEach(cb => {
        cb.checked = true;
        reportSelectedPositions.add(cb.dataset.pos);
      });
      updateReportColCount();
      updateDropdownBadge(trigger, badge, allPositions);
      renderReport();
    });
    btnNone.addEventListener('click', e => {
      e.stopPropagation();
      panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = false;
        reportSelectedPositions.delete(cb.dataset.pos);
      });
      searchIn.value = '';
      filterRdropOptions(panel, '');
      updateReportColCount();
      updateDropdownBadge(trigger, badge, allPositions);
      renderReport();
    });
    panelActions.appendChild(btnAll);
    panelActions.appendChild(btnNone);
    panel.appendChild(panelActions);

    // Список опций — с группировкой по дочерним подразделениям
    const optList = document.createElement('div');
    optList.className = 'rdrop-options';

    function addPositions(positions, indent, groupLabel) {
      if (positions.size === 0) return;
      if (groupLabel) {
        const gl = document.createElement('div');
        gl.className = 'rdrop-group-label';
        gl.textContent = groupLabel;
        optList.appendChild(gl);
      }
      [...positions].sort((a, b) => a.localeCompare(b, 'ru')).forEach(posKey => {
        const posLabel = posKey.includes('/') ? posKey.split('/').slice(1).join('/').trim() : posKey;
        const opt = document.createElement('div');
        opt.className = 'rdrop-opt';
        opt.style.paddingLeft = indent + 'px';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'rc_' + hashString(posKey);
        cb.dataset.pos = posKey;
        if (reportSelectedPositions.has(posKey)) { cb.checked = true; }
        cb.addEventListener('change', e => {
          e.stopPropagation();
          if (cb.checked) reportSelectedPositions.add(posKey);
          else reportSelectedPositions.delete(posKey);
          updateReportColCount();
          updateDropdownBadge(trigger, badge, allPositions);
          renderReport();
        });
        const lbl = document.createElement('label');
        lbl.htmlFor = cb.id;
        lbl.textContent = posLabel;
        lbl.title = posKey;
        opt.appendChild(cb);
        opt.appendChild(lbl);
        optList.appendChild(opt);
      });
    }

    // Должности без подгруппы
    if (dept.positions.size > 0) addPositions(dept.positions, 8, null);

    // Дочерние подразделения
    const sortedChildren = [...dept.children.entries()].sort((a, b) => a[1].sortKey - b[1].sortKey);
    sortedChildren.forEach(([subCode, child]) => {
      if (child.positions.size > 0) {
        addPositions(child.positions, 18, `${child.short} — ${child.full}`);
      }
    });

    panel.appendChild(optList);
    wrap.appendChild(panel);

    // Клики внутри панели не должны всплывать до document
    panel.addEventListener('click', e => e.stopPropagation());

    // Открытие/закрытие
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = panel.style.display !== 'none';
      // Закрываем все
      document.querySelectorAll('.rdrop-panel').forEach(p => p.style.display = 'none');
      document.querySelectorAll('.rdrop-arrow').forEach(a => a.textContent = '▾');
      if (!isOpen) {
        // Позиционируем через fixed — не зависит от скролла страницы
        const rect = trigger.getBoundingClientRect();
        panel.style.display = 'flex';
        panel.style.left = rect.left + 'px';
        // Открываем вниз или вверх — в зависимости от места на экране
        const spaceBelow = window.innerHeight - rect.bottom;
        const panelH = Math.min(320, window.innerHeight * 0.5);
        if (spaceBelow >= panelH || spaceBelow >= 180) {
          panel.style.top = (rect.bottom + 4) + 'px';
          panel.style.bottom = 'auto';
        } else {
          panel.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
          panel.style.top = 'auto';
        }
        arrow.textContent = '▴';
        searchIn.focus();
      }
    });

    updateDropdownBadge(trigger, badge, allPositions);
    reportDropdowns.push({ trigger, badge, allPositions, panel });
    row.appendChild(wrap);
  });

  // Клик вне — закрываем все
  document.addEventListener('click', () => {
    document.querySelectorAll('.rdrop-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.rdrop-arrow').forEach(a => a.textContent = '▾');
  });

  buildReportBlockFilter();
  updateReportColCount();
}

function filterRdropOptions(panel, query) {
  const q = query.trim().toLowerCase().replace(/ё/g, 'е');
  panel.querySelectorAll('.rdrop-opt').forEach(opt => {
    const lbl = opt.querySelector('label');
    const text = (lbl ? lbl.textContent : '').toLowerCase().replace(/ё/g, 'е');
    opt.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}

function updateDropdownBadge(trigger, badge, allPositions) {
  const selected = [...allPositions].filter(p => reportSelectedPositions.has(p)).length;
  badge.textContent = selected > 0 ? selected : '';
  badge.style.display = selected > 0 ? '' : 'none';
  trigger.classList.toggle('rdrop-has-selection', selected > 0);
}

function buildReportBlockFilter() {
  const sel = document.getElementById('report-block-filter');
  if (!sel) return;
  const cur = sel.value;
  const newSel = sel.cloneNode(false);
  newSel.innerHTML = '<option value="">Все блоки</option>';
  sel.parentNode.replaceChild(newSel, sel);

  const blocks = new Set(rawRows.map(r => r.block).filter(Boolean));
  const sorted = [...blocks].sort((a, b) => {
    const na = parseFloat(String(a).match(/^[\d.]+/)?.[0] ?? '');
    const nb = parseFloat(String(b).match(/^[\d.]+/)?.[0] ?? '');
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b), 'ru');
  });
  sorted.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    newSel.appendChild(opt);
  });
  if (cur) newSel.value = cur;

  newSel.addEventListener('change', () => {
    const selectedBlock = newSel.value;
    if (selectedBlock) {
      // Находим все должности, участвующие в функциях выбранного блока
      const blockRows = rawRows.filter(r => r.block === selectedBlock);
      const blockPositions = new Set();
      const posIndex = buildPositionRoleIndex();
      blockRows.forEach(row => {
        const ri = rawRows.indexOf(row);
        const rowMap = posIndex.get(ri) || new Map();
        rowMap.forEach((role, posKey) => blockPositions.add(posKey));
      });

      // Снимаем все, потом выбираем только участников блока
      reportSelectedPositions.clear();
      blockPositions.forEach(p => reportSelectedPositions.add(p));

      // Обновляем чекбоксы в дропдаунах
      document.querySelectorAll('.rdrop-opt input[type=checkbox]').forEach(cb => {
        cb.checked = reportSelectedPositions.has(cb.dataset.pos);
      });
      // Обновляем бейджи
      reportDropdowns.forEach(d => updateDropdownBadge(d.trigger, d.badge, d.allPositions));
    }
    updateReportColCount();
    renderReport();
  });
}

function updateReportColCount() {
  const el = document.getElementById('report-col-count');
  const n = reportSelectedPositions.size;
  if (el) {
    if (n > 8) {
      el.innerHTML = `Выбрано: ${n} <span class="report-col-info" title="При >8 столбцах включается компактный режим с вертикальными заголовками">📐 компакт</span>`;
    } else {
      el.textContent = `Выбрано: ${n}`;
    }
  }
}

/* ---------- РЕНДЕР ТАБЛИЦЫ ОТЧЁТА ---------- */

function renderReport() {
  const tableEl = document.getElementById('report-table');
  if (!tableEl) return;

  if (reportSelectedPositions.size === 0) {
    tableEl.innerHTML = `<tr><td colspan="3" class="report-empty">
      ☝️ выберите должности, чтобы построить таблицу
    </td></tr>`;
    return;
  }

  const blockFilter = document.getElementById('report-block-filter')?.value || '';
  const rows = blockFilter ? rawRows.filter(r => r.block === blockFilter) : rawRows;
  const posIndex = buildPositionRoleIndex();

  // Сортируем выбранные должности по подразделению, затем по имени
  const selPos = [...reportSelectedPositions].sort((a, b) => a.localeCompare(b, 'ru'));

  // Компактный режим при большом количестве столбцов
  const COMPACT_THRESHOLD = 8;
  const isCompact = selPos.length > COMPACT_THRESHOLD;
  const wrapper = document.getElementById('report-table-wrapper');
  if (wrapper) wrapper.classList.toggle('report-compact-mode', isCompact);

  // === ШАПКА ===
  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');

  const fixedHeaders = [
    { label: '№',       cls: 'rth-num' },
    { label: 'Блок',    cls: 'rth-block' },
    { label: 'Функция', cls: 'rth-func' }
  ];
  fixedHeaders.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h.label;
    th.className = h.cls;
    hrow.appendChild(th);
  });

  selPos.forEach(pos => {
    const th = document.createElement('th');
    th.className = isCompact ? 'rth-pos rth-pos-compact' : 'rth-pos';
    const shortMatch = pos.match(/^([^\s/]+)\s*\//);
    const deptShort = shortMatch ? shortMatch[1].trim() : '';
    const posLabel  = pos.includes('/') ? pos.split('/').slice(1).join('/').trim() : pos;
    th.innerHTML = deptShort
      ? `<span class="rth-dept-badge">${escapeHtml(deptShort)}</span><span class="${isCompact ? 'rth-pos-text' : ''}">${escapeHtml(posLabel)}</span>`
      : `<span class="${isCompact ? 'rth-pos-text' : ''}">${escapeHtml(posLabel)}</span>`;
    th.title = pos;
    const bg = getColorFromSegment(pos);
    if (bg) { th.style.background = bg; th.style.color = '#222'; }
    hrow.appendChild(th);
  });
  thead.appendChild(hrow);

  // === ТЕЛО ===
  const tbody = document.createElement('tbody');
  let renderedRows = 0;

  rows.forEach(row => {
    const ri = rawRows.indexOf(row);
    const rowMap = posIndex.get(ri) || new Map();
    if (!selPos.some(p => rowMap.has(p))) return;

    const tr = document.createElement('tr');
    const fixedData = [
      { val: row.num,   cls: 'rtd-num' },
      { val: row.block, cls: 'rtd-block' },
      { val: row.func,  cls: 'rtd-func' }
    ];
    fixedData.forEach(f => {
      const td = document.createElement('td');
      td.textContent = String(f.val ?? '');
      td.className = f.cls;
      tr.appendChild(td);
    });

    selPos.forEach(pos => {
      const td = document.createElement('td');
      td.className = 'rtd-role';
      const role = rowMap.get(pos) || '';
      if (role) {
        const roleCssKey = role.replace(/[^А-ЯЁA-Z]/g, '') || 'default';
        const bg = ROLE_COLORS[role] || '#757575';
        const badge = document.createElement('span');
        badge.className = `role-badge role-${roleCssKey}`;
        badge.style.background = bg;  // инлайн-стиль для PDF
        badge.textContent = role;
        badge.title = ROLE_INFO[role] || role;
        td.appendChild(badge);
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
    renderedRows++;
  });

  if (renderedRows === 0) {
    tbody.innerHTML = `<tr><td colspan="${3 + selPos.length}" class="report-empty">Нет строк с выбранными должностями</td></tr>`;
  }

  tableEl.innerHTML = '';
  tableEl.appendChild(thead);
  tableEl.appendChild(tbody);
}

// Цвета ролей как JS-объект (нужен для инлайн-стилей в PDF)
const ROLE_COLORS = {
  'О': '#5c6bc0', 'В': '#43a047', 'ВО': '#00897b',
  'У': '#e53935', 'К': '#fb8c00', 'И': '#8e24aa',
  'П': '#546e7a', 'ПК': '#6d4c41', 'УО': '#c62828'
};

/* ---------- ЛЕГЕНДА ДЛЯ КОНСТРУКТОРА ---------- */

/* ---------- ЭКСПОРТ ---------- */

function initReportExport() {
  document.getElementById('report-export-excel')?.addEventListener('click', exportReportExcel);
  document.getElementById('report-export-pdf')?.addEventListener('click', exportReportPDF);

  document.getElementById('report-select-all')?.addEventListener('click', () => {
    document.querySelectorAll('.rdrop-opt input[type=checkbox]').forEach(cb => {
      cb.checked = true;
      reportSelectedPositions.add(cb.dataset.pos);
    });
    // Обновляем все бейджи
    reportDropdowns.forEach(d => updateDropdownBadge(d.trigger, d.badge, d.allPositions));
    updateReportColCount();
    renderReport();
  });

  document.getElementById('report-clear-all')?.addEventListener('click', () => {
    document.querySelectorAll('.rdrop-opt input[type=checkbox]').forEach(cb => cb.checked = false);
    reportSelectedPositions.clear();
    reportDropdowns.forEach(d => updateDropdownBadge(d.trigger, d.badge, d.allPositions));
    updateReportColCount();
    renderReport();
  });
}

function exportReportExcel() {
  if (reportSelectedPositions.size === 0) { showToast('Выберите должности', 1200); return; }
  const tableEl = document.getElementById('report-table');
  if (!tableEl) return;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.table_to_sheet(tableEl);
  XLSX.utils.book_append_sheet(wb, ws, 'Конструктор');
  const now = new Date();
  const d = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
  XLSX.writeFile(wb, `Матрица_конструктор_${d}.xlsx`);
  showToast('Excel сохранён ✓', 1500);
}

function exportReportPDF() {
  if (reportSelectedPositions.size === 0) { showToast('Выберите должности', 1200); return; }

  const now = new Date();
  const date = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;

  // Собираем данные из DOM — с инлайн-цветами для бейджей
  const tableEl = document.getElementById('report-table');
  if (!tableEl) return;

  const thEls = [...tableEl.querySelectorAll('thead th')];
  const trEls = [...tableEl.querySelectorAll('tbody tr')];

  const roleBgMap = {};
  Object.entries(ROLE_COLORS).forEach(([r, c]) => roleBgMap[r] = c);

  const headerHtml = thEls.map((th, i) => {
    const bg = th.style.background ? ` style="background:${th.style.background};color:#222"` : '';
    const cls = i === 2 ? ' class="func"' : '';
    return `<th${cls}${bg}>${th.textContent.trim()}</th>`;
  }).join('');

  const bodyHtml = trEls.map(tr => {
    const cells = [...tr.querySelectorAll('td')].map((td, i) => {
      const badge = td.querySelector('.role-badge');
      if (badge) {
        const bg = badge.style.background || roleBgMap[badge.textContent.trim()] || '#757575';
        return `<td style="text-align:center"><span style="display:inline-block;padding:2px 6px;border-radius:4px;background:${bg};color:#fff;font-weight:700;font-size:7pt">${badge.textContent.trim()}</span></td>`;
      }
      return `<td>${escapeHtml(td.textContent.trim())}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/>
<title>Матрица_конструктор_${date}</title>
<style>
@page { size: A3 landscape; margin: 10mm; }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:Arial,sans-serif; font-size:8pt; }
.pdf-header { display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid #6b4eff; padding-bottom:5px; margin-bottom:8px; }
.pdf-header h1 { font-size:12pt; color:#6b4eff; font-weight:700; }
.pdf-header .dt { font-size:8pt; color:#888; }
table { width:100%; border-collapse:collapse; table-layout:fixed; }
th { background:#6b4eff; color:#fff; padding:5px 3px; font-size:7pt; border:1px solid #5a3ee0; text-align:center; word-break:break-word; vertical-align:bottom; }
th.func { background:#3d2ab0; text-align:left; min-width:200px; }
td { padding:4px 3px; border:1px solid #ddd; font-size:7.5pt; vertical-align:top; word-break:break-word; }
td.rtd-num { font-size:7pt; color:#888; white-space:nowrap; width:50px; }
td.rtd-block { width:120px; }
td.rtd-func { font-size:7.5pt; }
tr:nth-child(even) td { background:#fafafa; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head><body>
<div class="pdf-header"><h1>Матрица — конструктор по должностям</h1><span class="dt">${date}</span></div>
<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
<script>window.onload=function(){window.print()};<\/script>
</body></html>`;

  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) { showToast('Разрешите всплывающие окна', 3000); return; }
  win.document.write(html);
  win.document.close();
}

/* ============================================================
   СЧЁТЧИК ПОСЕЩЕНИЙ
   ============================================================ */

function initVisitCounter() {
  const el = document.getElementById('visit-counter');
  if (!el || el.dataset.initialized) return;
  el.dataset.initialized = '1';

  // Генерируем или берём существующий уникальный ID браузера
  let clientId = localStorage.getItem('matrix_client_id');
  if (!clientId) {
    clientId = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('matrix_client_id', clientId);
  }

  // Локальный счётчик (запасной, если нет GAS)
  const localTotal = parseInt(localStorage.getItem('matrix_my_visits') || '0') + 1;
  localStorage.setItem('matrix_my_visits', localTotal);

  if (GAS_PROXY_URL) {
    const url = `${GAS_PROXY_URL}?action=counter&uid=${encodeURIComponent(clientId)}`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d && d.total !== undefined) {
          el.textContent = `👁 ${d.total.toLocaleString('ru')}`;
          el.title = `Всего посещений: ${d.total} | Уникальных: ${d.unique}`;
        }
      })
      .catch(() => {
        el.textContent = `👁 ${localTotal}`;
        el.title = 'Локальный счётчик (нет связи с GAS)';
      });
  } else {
    el.textContent = `👁 ${localTotal}`;
    el.title = 'Мои посещения (локально). Для общего счётчика — настройте GAS_PROXY_URL';
  }
}

// Инициализируем конструктор после загрузки данных
const _origBuildTable = buildTable;
buildTable = function() {
  _origBuildTable();
  buildReportConstructor();
  initReportExport();

};
