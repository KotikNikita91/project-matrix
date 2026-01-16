const DATA_URL = 'data.csv';

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

const FILTER_IDS = ['filter-function','filter-department','filter-division','filter-position','filter-role'];

document.addEventListener('DOMContentLoaded', () => {
  loadCSV();
});

/* Load & parse CSV with PapaParse (handles quotes/newlines) */
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
      renderTable();
    })
    .catch(err => {
      console.error('Load CSV error:', err);
      const info = document.getElementById('info');
      if (info) { info.classList.remove('hidden'); info.textContent = 'Ошибка при загрузке данных: ' + err.message; }
    });
}

function normalizeRow(row){
  // trim keys and values; remove BOM
  const out = {};
  Object.keys(row).forEach(k => {
    const key = String(k).replace(/^\uFEFF/, '').trim();
    const val = row[k] == null ? '' : String(row[k]).replace(/\r/g,'').trim();
    out[key] = val;
  });
  return out;
}

/* Initialize filter selects */
function initFilters(){
  // gather headers (first row) keys
  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
  // Fill selects by finding probable header names in CSV
  fillSelect('filter-function', headers, ['function','функция','Функция','Function','name','Наименование','Наим']);
  fillSelect('filter-department', headers, ['department','департамент','Департамент','dept']);
  fillSelect('filter-division', headers, ['division','отдел','Отдел']);
  fillSelect('filter-position', headers, ['position','должность','Должность']);
  fillSelect('filter-role', headers, ['role','роль','Роль']);

  // attach change handlers (ensure no duplicate handlers)
  FILTER_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.removeEventListener('change', onFilterChange);
      el.addEventListener('change', onFilterChange);
    }
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
  // fuzzy fallback
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
  // final fallback
  if (!header) header = headers[0] || null;

  // collect unique values
  const vals = header ? Array.from(new Set(rawRows.map(r=>r[header]).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ru')) : [];
  sel.innerHTML = '<option value="">Все</option>' + vals.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join('');
  // store mapped header name on element for later filtering
  sel.dataset.csvHeader = header || '';
}

/* Handler for filter change */
function onFilterChange(){
  cascadeFilters();
  renderTable();
}

/* Cascade: recompute options for all selects based on other selected values */
function cascadeFilters(){
  FILTER_IDS.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const header = sel.dataset.csvHeader;
    // subset filtered by other selects (excluding this one)
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

/* Clear button behavior: now fully resets options and values */
function onClearClick(){
  // 1) clear values
  FILTER_IDS.forEach(id => { const s = document.getElementById(id); if (s) s.value = ''; });
  // 2) restore full option lists for each select (no filters applied)
  //    easiest: recompute full unique lists based on rawRows and dataset csvHeader
  FILTER_IDS.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const header = sel.dataset.csvHeader;
    const vals = header ? Array.from(new Set(rawRows.map(r => r[header]).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ru')) : [];
    sel.innerHTML = '<option value="">Все</option>' + vals.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join('');
    sel.value = '';
  });
  // 3) render table with no filters
  renderTable();
}

/* Render table using mapped headers stored in selects */
function renderTable(){
  const tbody = document.querySelector('#matrix tbody');
  if (!tbody) return;
  // build active filters map {header: value}
  const active = {};
  FILTER_IDS.forEach(id => {
    const sel = document.getElementById(id);
    if (sel && sel.dataset.csvHeader) active[sel.dataset.csvHeader] = sel.value;
  });

  const rows = rawRows.filter(row => {
    return Object.entries(active).every(([hdr,val]) => !val || row[hdr] === val);
  });

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

/* small helpers */
function escapeHtml(s){
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeHtmlAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
