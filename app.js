/* app.js — простой, надёжный:
   - загружает data.csv (PapaParse)
   - создаёт фильтры (каскадные)
   - рендерит таблицу (rolewrap + tooltip)
   - экспорт в Excel (SheetJS)
   - фильтры сохраняются в localStorage
   НИКАК не меняет ширины колонок — это делает только style.css (переменные).
*/

const DATA_URL = 'data.csv';
const STORAGE_FILTERS = 'matrix_filters_v1';
const ROLE_INFO = {
  'О': 'Ответственный: организует и координирует выполнение функции. Назначает исполнителей, контролирует сроки и качество.',
  'В': 'Выполняющий: непосредственно выполняет работу по поручению ответственного.',
  'У': 'Утверждающий: принимает и утверждает результат.',
  'К': 'Консультант: даёт экспертные рекомендации.',
  'И': 'Информируемый: получает информацию о ходе или результате.',
  'П': 'Помощник: содействует выполнению функции ресурсами.',
  'ПК': 'Помощник-консультант: сочетает помощь и экспертизу.'
};

let rawRows = [];
let lastRenderedRows = [];
const FILTER_IDS = ['filter-function','filter-department','filter-division','filter-position','filter-role'];

document.addEventListener('DOMContentLoaded', () => {
  loadCSV();
  document.getElementById('clear').addEventListener('click', onClearClick);
  document.getElementById('export').addEventListener('click', onExportClick);
});

/* Load CSV with PapaParse */
function loadCSV(){
  showInfo('Загрузка данных...');
  fetch(DATA_URL)
    .then(r => { if (!r.ok) throw new Error('CSV не найден: ' + r.status); return r.text(); })
    .then(text => {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      if (parsed.errors && parsed.errors.length) console.warn('PapaParse errors:', parsed.errors.slice(0,10));
      rawRows = parsed.data.map(r => normalizeRow(r));
      initFilters();
      restoreFiltersFromStorage();
      renderTable();

      // Спрячем строку "Загрузка данных..." — данные успешно отрисованы
      hideInfo();

      showToast('Данные загружены', 900);
    })
    .catch(err => {
      console.error('Load CSV error:', err);
      // Оставляем сообщение об ошибке видимым — пользователь должен его увидеть
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

/* Filters */
function initFilters(){
  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
  fillSelect('filter-function', headers, ['function','функция','Функция','Function','name','Наименование']);
  fillSelect('filter-department', headers, ['department','департамент','Департамент','dept']);
  fillSelect('filter-division', headers, ['division','отдел','Отдел']);
  fillSelect('filter-position', headers, ['position','должность','Должность']);
  fillSelect('filter-role', headers, ['role','роль','Роль']);

  FILTER_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.removeEventListener('change', onFilterChange);
      el.addEventListener('change', onFilterChange);
    }
  });
}

function fillSelect(id, headers, candidates){
  const sel = document.getElementById(id);
  if (!sel) return;
  let header = findHeader(headers, candidates);
  if (!header) header = headers[0] || '';
  sel.dataset.csvHeader = header;
  const vals = header ? Array.from(new Set(rawRows.map(r => r[header]).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ru')) : [];
  sel.innerHTML = '<option value="">Все</option>' + vals.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join('');
}

function findHeader(headers, candidates){
  const low = headers.map(h => h.toLowerCase().replace(/\s+/g,''));
  for (let c of candidates){
    const cc = c.toLowerCase().replace(/\s+/g,'');
    const idx = low.indexOf(cc);
    if (idx !== -1) return headers[idx];
  }
  for (let c of candidates){
    for (let h of headers){
      if (h.toLowerCase().includes(c.toLowerCase().replace(/\s+/g,''))) return h;
    }
  }
  return null;
}

function onFilterChange(){
  saveFiltersToStorage();
  cascadeFilters();
  renderTable();
}

function cascadeFilters(){
  FILTER_IDS.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const header = sel.dataset.csvHeader;
    const subset = rawRows.filter(row => {
      return FILTER_IDS.every(otherId => {
        if (otherId === selId) return true;
        const other = document.getElementById(otherId);
        if (!other) return true;
        const val = other.value;
        const hdr = other.dataset.csvHeader;
        if (!val) return true;
        return row[hdr] === val;
      });
    });
    const vals = header ? Array.from(new Set(subset.map(r => r[header]).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ru')) : [];
    const prev = sel.value;
    sel.innerHTML = '<option value="">Все</option>' + vals.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join('');
    if (prev && vals.includes(prev)) sel.value = prev; else sel.value = '';
  });
}

function onClearClick(){
  FILTER_IDS.forEach(id => { const s = document.getElementById(id); if (s) s.value = ''; });
  FILTER_IDS.forEach(id => {
    const s = document.getElementById(id);
    if (!s) return;
    const header = s.dataset.csvHeader;
    const vals = header ? Array.from(new Set(rawRows.map(r => r[header]).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ru')) : [];
    s.innerHTML = '<option value="">Все</option>' + vals.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join('');
    s.value = '';
  });
  localStorage.removeItem(STORAGE_FILTERS);
  renderTable();
  showToast('Фильтры сброшены', 1000);
}

function saveFiltersToStorage(){
  const obj = {};
  FILTER_IDS.forEach(id => {
    const s = document.getElementById(id);
    if (s) obj[id] = s.value || '';
  });
  localStorage.setItem(STORAGE_FILTERS, JSON.stringify(obj));
}

function restoreFiltersFromStorage(){
  const raw = localStorage.getItem(STORAGE_FILTERS);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    FILTER_IDS.forEach(id => {
      const s = document.getElementById(id);
      if (s && obj[id] !== undefined){
        const exists = Array.from(s.options).some(o => o.value === obj[id]);
        if (obj[id] === '' || exists) s.value = obj[id];
      }
    });
    cascadeFilters();
  } catch(e){ console.warn('restore filters parse error', e); }
}

/* Render table rows */
function renderTable(){
  const tbody = document.querySelector('#matrix tbody');
  if (!tbody) return;
  const active = {};
  FILTER_IDS.forEach(id => {
    const s = document.getElementById(id);
    if (s && s.dataset.csvHeader) active[s.dataset.csvHeader] = s.value;
  });

  const rows = rawRows.filter(row => {
    return Object.entries(active).every(([hdr,val]) => !val || row[hdr] === val);
  });

  lastRenderedRows = rows;

  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="15" style="padding:18px 12px; color:#666">Нет данных по выбранным фильтрам</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const getValue = (possibleKeys) => {
      for (let k of possibleKeys) if (row[k] !== undefined) return row[k];
      return row[Object.keys(row)[0]] || '';
    };

    const num = getValue(['№','number','No','no','id']);
    const func = getValue(['Функция','function','Function','name']);
    const product = getValue(['Продукт','product']);
    const department = getValue(['Департамент','department']);
    const division = getValue(['Отдел','division']);
    const position = getValue(['Должность','position']);
    const roleKey = getValue(['Роль','role']);
    const input = getValue(['Вход','input']);
    const from_how = getValue(['От кого','from_how','from']);
    const output = getValue(['Выход','output']);
    const to_whom = getValue(['Кому','to_whom','to']);
    const software = getValue(['ПО','software']);
    const metric = getValue(['Метрика','metric']);
    const how_to_digitize = getValue(['Как цифруем','how_to_digitize']);
    const comment = getValue(['Комментарий','comment']);

    const roleDesc = ROLE_INFO[roleKey] || '';
    return `<tr>
      <td class="col-id">${escapeHtml(num)}</td>
      <td class="col-function">${escapeHtml(func)}</td>
      <td class="col-text-medium">${escapeHtml(product)}</td>
      <td class="col-department">${escapeHtml(department)}</td>
      <td class="col-division">${escapeHtml(division)}</td>
      <td class="col-position">${escapeHtml(position)}</td>
      <td class="col-role"><div class="rolewrap"><span class="role" data-tooltip="${escapeHtmlAttr(roleDesc)}">${escapeHtml(roleKey)}</span></div></td>
      <td class="col-text-medium">${escapeHtml(input)}</td>
      <td class="col-fromhow col-text-medium">${escapeHtml(from_how)}</td>
      <td class="col-text-medium">${escapeHtml(output)}</td>
      <td class="col-text-medium">${escapeHtml(to_whom)}</td>
      <td class="col-text-medium">${escapeHtml(software)}</td>
      <td class="col-text-medium">${escapeHtml(metric)}</td>
      <td class="col-text-medium">${escapeHtml(how_to_digitize)}</td>
      <td class="col-text-wide">${escapeHtml(comment)}</td>
    </tr>`;
  }).join('');
}

/* Export to Excel (SheetJS) */
function onExportClick(){
  if (!lastRenderedRows || !lastRenderedRows.length){
    showToast('Нет данных для экспорта', 1500);
    return;
  }

  const headers = ["№","Функция","Продукт","Департамент","Отдел","Должность","Роль","Вход","От кого / как","Выход","Кому","Используемое ПО","Метрика","Как цифруем","Комментарий"];

  const sheetData = lastRenderedRows.map(row => {
    const get = (candidates) => { for (let k of candidates) if (row[k] !== undefined) return row[k]; return ''; };
    return {
      "№": get(['№','number','No','no','id']),
      "Функция": get(['Функция','function','Function','name']),
      "Продукт": get(['Продукт','product']),
      "Департамент": get(['Департамент','department']),
      "Отдел": get(['Отдел','division']),
      "Должность": get(['Должность','position']),
      "Роль": get(['Роль','role']),
      "Вход": get(['Вход','input']),
      "От кого / как": get(['От кого','from_how','from']),
      "Выход": get(['Выход','output']),
      "Кому": get(['Кому','to_whom','to']),
      "Используемое ПО": get(['ПО','software']),
      "Метрика": get(['Метрика','metric']),
      "Как цифруем": get(['Как цифруем','how_to_digitize']),
      "Комментарий": get(['Комментарий','comment'])
    };
  });

  const ws = XLSX.utils.json_to_sheet(sheetData, { header: headers, skipHeader: false });
  ws['!cols'] = [
    {wch:6},{wch:50},{wch:30},{wch:18},{wch:18},{wch:22},{wch:10},{wch:28},{wch:28},{wch:28},{wch:20},{wch:20},{wch:16},{wch:20},{wch:60}
  ];

  const range = XLSX.utils.decode_range(ws['!ref']);
  const thinBorder = { style: "thin", color: { rgb: "FFBFBFBF" } };
  const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  for (let R = range.s.r; R <= range.e.r; ++R){
    for (let C = range.s.c; C <= range.e.c; ++C){
      const addr = XLSX.utils.encode_cell({r:R,c:C});
      const cell = ws[addr];
      if (!cell) continue;
      cell.s = cell.s || {};
      cell.s.alignment = Object.assign({}, cell.s.alignment, { wrapText: true, vertical: "top", horizontal: "left" });
      cell.s.border = allBorders;
    }
  }
  const headerRow = range.s.r;
  for (let C = range.s.c; C <= range.e.c; ++C){
    const addr = XLSX.utils.encode_cell({r: headerRow, c: C});
    if (!ws[addr]) continue;
    ws[addr].s = ws[addr].s || {};
    ws[addr].s.font = Object.assign({}, ws[addr].s.font, { bold: true });
    ws[addr].s.alignment = Object.assign({}, ws[addr].s.alignment, { wrapText: true, vertical: "center", horizontal: "center" });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Matrix');
  wb.Workbook = wb.Workbook || {};
  wb.Workbook.Views = wb.Workbook.Views || [];
  wb.Workbook.Views[0] = Object.assign(wb.Workbook.Views[0] || {}, { xSplit: 0, ySplit: 1, topLeftCell: "A2", activeTab: 0 });

  const now = new Date();
  const ts = now.toISOString().replace(/[:\-]/g,'').split('.')[0];
  const filename = `functional-matrix-${ts}.xlsx`;
  XLSX.writeFile(wb, filename);
  showToast('Экспорт завершён: ' + filename, 1500);
}

/* small UI helpers */
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
function escapeHtml(s){ if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escapeHtmlAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
