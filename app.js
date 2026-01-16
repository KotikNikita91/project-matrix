const DATA_URL = 'data.csv';
const STORAGE_KEY = 'matrix_filters_v1';

const ROLE_INFO = {
  'О': 'Ответственный: организует и координирует выполнение функции. Назначает исполнителей, контролирует сроки и качество.',
  'В': 'Выполняющий: непосредственно выполняет работу по поручению ответственного.',
  'У': 'Утверждающий: принимает и утверждает результат, несёт финальную ответственность.',
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
  const exportBtn = document.getElementById('export');
  if (exportBtn) exportBtn.addEventListener('click', onExportClick);
});

function loadCSV(){
  fetch(DATA_URL)
    .then(resp => {
      if (!resp.ok) throw new Error('CSV not found: ' + resp.status);
      return resp.text();
    })
    .then(text => {
      console.log('CSV preview:', text.slice(0,800));
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      if (parsed.errors && parsed.errors.length) console.warn('PapaParse errors:', parsed.errors.slice(0,10));
      rawRows = parsed.data.map(r => normalizeRow(r));
      initFilters();
      restoreFiltersFromStorage();
      renderTable();
      showToast('Данные загружены', 1500);
    })
    .catch(err => {
      console.error('Load CSV error:', err);
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

function initFilters(){
  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
  fillSelect('filter-function', headers, ['function','функция','Функция','Function','name','Наименование','Наим']);
  fillSelect('filter-department', headers, ['department','департамент','Департамент','dept']);
  fillSelect('filter-division', headers, ['division','отдел','Отдел']);
  fillSelect('filter-position', headers, ['position','должность','Должность']);
  fillSelect('filter-role', headers, ['role','роль','Роль']);

  FILTER_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.removeEventListener('change', onFilterChange);
    el.addEventListener('change', onFilterChange);
  });

  const clearBtn = document.getElementById('clear');
  if (clearBtn) {
    clearBtn.removeEventListener('click', onClearClick);
    clearBtn.addEventListener('click', onClearClick);
  }
}

function findHeaderByCandidates(headers, candidates){
  const lowered = headers.map(h => h.toLowerCase().replace(/\s+/g,''));
  for (let cand of candidates){
    const key = cand.toLowerCase().replace(/\s+/g,'');
    const idx = lowered.indexOf(key);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function fillSelect(selectId, headers, candidates){
  const sel = document.getElementById(selectId);
  if (!sel) return;
  let header = findHeaderByCandidates(headers, candidates);
  if (!header){
    for (let cand of candidates){
      for (let h of headers){
        if (h.toLowerCase().includes(cand.toLowerCase().replace(/\s+/g,''))){
          header = h; break;
        }
      }
      if (header) break;
    }
  }
  if (!header) header = headers[0] || null;
  sel.dataset.csvHeader = header || '';

  const vals = header ? Array.from(new Set(rawRows.map(r=>r[header]).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ru')) : [];
  sel.innerHTML = '<option value="">Все</option>' + vals.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join('');
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
  localStorage.removeItem(STORAGE_KEY);
  renderTable();
  showToast('Фильтры сброшены', 1200);
}

function saveFiltersToStorage(){
  const obj = {};
  FILTER_IDS.forEach(id => {
    const s = document.getElementById(id);
    if (s) obj[id] = s.value || '';
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function restoreFiltersFromStorage(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    let applied = false;
    FILTER_IDS.forEach(id => {
      const s = document.getElementById(id);
      if (s && obj[id] !== undefined){
        const optExists = Array.from(s.options).some(o => o.value === obj[id]);
        if (obj[id] === '' || optExists) { s.value = obj[id]; applied = true; }
      }
    });
    if (applied) cascadeFilters();
  } catch(e){
    console.warn('restore filters parse error', e);
  }
}

function renderTable(){
  const tbody = document.querySelector('#matrix tbody');
  if (!tbody) return;

  const active = {};
  FILTER_IDS.forEach(id => {
    const sel = document.getElementById(id);
    if (sel && sel.dataset.csvHeader) active[sel.dataset.csvHeader] = sel.value;
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
      <td>${escapeHtml(department)}</td>
      <td>${escapeHtml(division)}</td>
      <td>${escapeHtml(position)}</td>
      <td class="col-role"><div class="rolewrap"><span class="role" data-tooltip="${escapeHtmlAttr(roleDesc)}">${escapeHtml(roleKey)}</span></div></td>
      <td class="col-text-medium">${escapeHtml(input)}</td>
      <td class="col-text-medium">${escapeHtml(from_how)}</td>
      <td class="col-text-medium">${escapeHtml(output)}</td>
      <td class="col-text-medium">${escapeHtml(to_whom)}</td>
      <td class="col-text-medium">${escapeHtml(software)}</td>
      <td class="col-text-medium">${escapeHtml(metric)}</td>
      <td class="col-text-medium">${escapeHtml(how_to_digitize)}</td>
      <td class="col-text-wide">${escapeHtml(comment)}</td>
    </tr>`;
  }).join('');
}

function onExportClick(){
  if (!lastRenderedRows || !lastRenderedRows.length){
    showToast('Нет данных для экспорта', 1500);
    return;
  }

  const headers = ["№","Функция","Продукт","Департамент","Отдел","Должность","Роль","Вход","От кого / как","Выход","Кому","Используемое ПО","Метрика","Как цифруем","Комментарий"];

  const sheetData = lastRenderedRows.map(row => {
    const get = (candidates) => {
      for (let k of candidates) if (row[k] !== undefined) return row[k];
      return '';
    };
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

  const ws = XLSX.utils.json_to_sheet(sheetData, { header: headers });
  const colWidths = headers.map(h => ({ wch: Math.max(10, Math.min(40, h.length + 8)) }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Matrix');

  const now = new Date();
  const ts = now.toISOString().replace(/[:\-]/g,'').split('.')[0];
  const filename = `functional-matrix-${ts}.xlsx`;
  XLSX.writeFile(wb, filename);

  showToast('Экспорт завершён: ' + filename, 1800);
}

function showToast(text, ms = 1500){
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.remove('hidden');
  t.classList.remove('toast-hidden');
  t.style.opacity = '1';
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(()=> {
    t.style.opacity = '0';
    t.classList.add('hidden');
  }, ms);
}

function showInfo(msg, important=false){
  const el = document.getElementById('info');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = msg;
  el.style.border = important ? '1px solid #ffdede' : 'none';
}

function escapeHtml(s){
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeHtmlAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
