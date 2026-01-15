/* app.js — прочитает data.csv (PapaParse), отрисует таблицу и каскадные фильтры.
   Дополнительно: вычисляет смещение шапки таблицы, чтобы sticky header не прятался.
*/

const DATA_URL = 'data.csv'; // файл с данными — положи в корень сайта/репо

const ROLE_INFO = {
  'О': 'Ответственный: организует и координирует выполнение функции. Назначает исполнителей, контролирует сроки и качество.',
  'В': 'Выполняющий: непосредственно выполняет работу по поручению ответственного.',
  'У': 'Утверждающий: принимает и утверждает результат, несёт финальную ответственность.',
  'К': 'Консультант: даёт экспертные рекомендации.',
  'И': 'Информируемый: получает информацию о ходе или результате.',
  'П': 'Помощник: содействует выполнению функции ресурсами.',
  'ПК': 'Помощник-консультант: сочетает помощь и экспертность.'
};

let rawRows = [];

// фильтры — id селектов в HTML / и ключи в данных (нормализованные)
const FILTER_CONFIG = [
  { id: 'filter-function', keyCandidates: ['function','Функция','function_name'] },
  { id: 'filter-department', keyCandidates: ['department','Департамент','dept'] },
  { id: 'filter-division', keyCandidates: ['division','Отдел','division_name'] },
  { id: 'filter-position', keyCandidates: ['position','Должность','position_name'] },
  { id: 'filter-role', keyCandidates: ['role','Роль'] }
];

// вычисленные реальные ключи (будут установлены после парсинга)
let dataKeysMap = {}; // map logicalKey -> actualCsvHeader

document.addEventListener('DOMContentLoaded', () => {
  // 1) загрузка данных
  loadCSV();

  // 2) set up resize listener to recompute sticky offset
  window.addEventListener('resize', setTableTopOffset);
});

/* --------------------
   CSV загрузка + парсинг
   -------------------- */
function loadCSV(){
  showInfo('Загружаем данные...');
  fetch(DATA_URL)
    .then(r => {
      if (!r.ok) throw new Error(`Не удалось загрузить CSV (${r.status})`);
      return r.text();
    })
    .then(text => {
      console.log('CSV preview:', text.slice(0,800));
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false
      });

      if (parsed.errors && parsed.errors.length){
        console.warn('PapaParse errors:', parsed.errors.slice(0,10));
      }

      if (!parsed.data || !parsed.data.length){
        showInfo('CSV пуст или нераспознан. Проверьте файл data.csv', true);
        return;
      }

      // определим соответствие заголовков — удобная нормализация
      const headers = Object.keys(parsed.data[0]).map(h => h.replace(/^\uFEFF/,'').trim());
      buildDataKeysMap(headers);

      // нормализуем строки в объект с удобными ключами (используем реальные заголовки)
      rawRows = parsed.data.map(row => {
        const norm = {};
        headers.forEach(h => {
          const v = row[h] == null ? '' : String(row[h]).replace(/\r/g,'').trim();
          norm[h] = v;
        });
        return norm;
      });

      hideInfo();
      initFiltersUI(headers);
      renderTable();
      setTableTopOffset();
    })
    .catch(err => {
      console.error('Ошибка загрузки CSV', err);
      showInfo('Ошибка при загрузке данных: ' + err.message, true);
    });
}

/* Map logical keys to actual CSV headers by searching candidates in CSV headers */
function buildDataKeysMap(headers){
  // prepare small helper that finds header ignoring case and spaces
  const findHeader = candidates => {
    const lowered = headers.map(h => h.toLowerCase().replace(/\s+/g,''));
    for (let c of candidates){
      const key = c.toLowerCase().replace(/\s+/g,'');
      const idx = lowered.indexOf(key);
      if (idx !== -1) return headers[idx];
    }
    return null;
  };

  // logical keys we need for rendering/filters. We'll find actual CSV header names.
  const needed = {
    number: ['number','№','no','id'],
    function: ['function','функция','name'],
    product: ['product','продукт','productname'],
    department: ['department','департамент','dept'],
    division: ['division','отдел'],
    position: ['position','должность'],
    role: ['role','роль'],
    input: ['input','вход'],
    from_how: ['from_how','от_кого','откого','как'],
    output: ['output','выход'],
    to_whom: ['to_whom','кому','to_whom'],
    software: ['software','по','программ'],
    metric: ['metric','метрика'],
    how_to_digitize: ['how_to_digitize','как_цифруем','как_цифруем'],
    comment: ['comment','комментарий','примечание']
  };

  dataKeysMap = {};
  for (let logical in needed){
    const found = findHeader(needed[logical]);
    dataKeysMap[logical] = found; // may be null if not found; code handles missing fields gracefully
  }

  console.log('dataKeysMap:', dataKeysMap);
}

/* --------------------
   UI: Filters initialization & cascading behavior
   -------------------- */
function initFiltersUI(headers){
  // populate each select with unique values from the CSV (for its mapped header)
  FILTER_CONFIG.forEach(cfg => {
    const sel = document.getElementById(cfg.id);
    if (!sel) return;
    // find corresponding CSV header, try candidates
    const logicalKey = cfg.keyCandidates[0]; // first candidate isn't used directly; use dataKeysMap
    // determine which CSV header we should use for this filter
    // we map by searching dataKeysMap values that match any candidate in keyCandidates
    let csvHeader = null;
    for (let cand of cfg.keyCandidates){
      // find logical in dataKeysMap whose mapped header matches cand? simpler: use mapping by known logical names
      // fallback: search headers by name
      const match = Object.entries(dataKeysMap).find(([lk, hdr]) => {
        if (!hdr) return false;
        return hdr.toLowerCase().includes(cand.toLowerCase().replace(/\s+/g,''));
      });
      if (match){
        csvHeader = match[1];
        break;
      }
    }
    // if still not found, try to find header by the first candidate directly in headers
    if (!csvHeader){
      const lowerCandidates = cfg.keyCandidates.map(c => c.toLowerCase().replace(/\s+/g,''));
      for (let h of headers){
        const low = h.toLowerCase().replace(/\s+/g,'');
        if (lowerCandidates.some(c => low.includes(c))) { csvHeader = h; break; }
      }
    }
    // final fallback: try common names in dataKeysMap (logical mapping)
    if (!csvHeader){
      // pick from dataKeysMap by known logical keys
      const logical = cfg.keyCandidates[0].toLowerCase();
      for (let lk in dataKeysMap){
        if (lk.includes(logical) && dataKeysMap[lk]) { csvHeader = dataKeysMap[lk]; break; }
      }
    }
    // If still null — try to pick any header that seems close
    if (!csvHeader) csvHeader = headers[0];

    // store csvHeader in cfg for later use
    cfg._csvHeader = csvHeader;

    // collect unique values
    const vals = Array.from(new Set(rawRows.map(r => r[csvHeader]).filter(Boolean))).sort((a,b)=> a.localeCompare(b,'ru'));
    sel.innerHTML = '<option value="">Все</option>' + vals.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join('');
  });

  // attach events for cascading and render
  document.querySelectorAll('.controls select').forEach(s => s.addEventListener('change', onFilterChange));
  document.getElementById('clear').addEventListener('click', () => {
    document.querySelectorAll('.controls select').forEach(s => s.value = '');
    renderTable();
  });
}

function onFilterChange(){
  // update options to be dependent (cascading)
  updateFilterOptions();
  renderTable();
}

function updateFilterOptions(){
  // for each filter, recompute allowed values given other filter choices
  const activeFilters = getActiveFilters();
  FILTER_CONFIG.forEach(cfg => {
    const sel = document.getElementById(cfg.id);
    const csvHeader = cfg._csvHeader || Object.values(dataKeysMap)[0];
    // compute subset where other filters (excluding current) are applied
    const subset = rawRows.filter(row => {
      return FILTER_CONFIG.every(other => {
        if (other.id === cfg.id) return true;
        const val = document.getElementById(other.id).value;
        if (!val) return true;
        const hdr = other._csvHeader || Object.values(dataKeysMap)[0];
        return row[hdr] === val;
      });
    });
    const vals = Array.from(new Set(subset.map(r => r[csvHeader]).filter(Boolean))).sort((a,b)=> a.localeCompare(b,'ru'));
    const prev = sel.value;
    sel.innerHTML = '<option value="">Все</option>' + vals.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join('');
    if (prev && vals.includes(prev)) sel.value = prev; else sel.value = '';
  });
}

function getActiveFilters(){
  const obj = {};
  FILTER_CONFIG.forEach(cfg => {
    const sel = document.getElementById(cfg.id);
    const hdr = cfg._csvHeader;
    obj[cfg.id] = { header: hdr, value: sel ? sel.value : '' };
  });
  return obj;
}

/* --------------------
   Rendering table with current filters
   -------------------- */
function renderTable(){
  const tbody = document.querySelector('#matrix tbody');
  if (!tbody) return;

  // build filter predicate
  const active = {};
  FILTER_CONFIG.forEach(cfg => {
    const sel = document.getElementById(cfg.id);
    active[cfg.id] = sel ? sel.value : '';
  });

  // determine CSV header names for commonly used logical fields (fallbacks)
  const h = key => {
    // try to find mapping in dataKeysMap (logical), else use cfg._csvHeader for matching cfg.id
    if (dataKeysMap[key]) return dataKeysMap[key];
    // else search in FILTER_CONFIG for matching logical
    const found = FILTER_CONFIG.find(cfg => cfg.id.includes(key.replace(/_/g,'')));
    return found && found._csvHeader ? found._csvHeader : Object.keys(rawRows[0]||{})[0];
  };

  const rows = rawRows.filter(r => {
    // function filter
    const fVal = document.getElementById('filter-function')?.value || '';
    if (fVal && r[(FILTER_CONFIG[0]._csvHeader)] !== fVal) return false;
    // department
    const dVal = document.getElementById('filter-department')?.value || '';
    if (dVal && r[FILTER_CONFIG[1]._csvHeader] !== dVal) return false;
    // division
    const dvVal = document.getElementById('filter-division')?.value || '';
    if (dvVal && r[FILTER_CONFIG[2]._csvHeader] !== dvVal) return false;
    // position
    const pVal = document.getElementById('filter-position')?.value || '';
    if (pVal && r[FILTER_CONFIG[3]._csvHeader] !== pVal) return false;
    // role
    const roleVal = document.getElementById('filter-role')?.value || '';
    if (roleVal && r[FILTER_CONFIG[4]._csvHeader] !== roleVal) return false;
    return true;
  });

  // render
  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="15" style="padding:18px 12px; color:#666">Нет данных по выбранным фильтрам</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => {
    // use mapping if available else try reasonable header names
    const get = logical => {
      const map = dataKeysMap[logical];
      if (map && row[map] !== undefined) return row[map];
      // fallback: try some possible header names in row
      const candidates = {
        number: ['№','number','no','id'],
        function: ['Функция','function','name'],
        product: ['Продукт','product'],
        department: ['Департамент','department'],
        division: ['Отдел','division'],
        position: ['Должность','position'],
        role: ['Роль','role'],
        input: ['Вход','input'],
        from_how: ['От кого','from_how','from'],
        output: ['Выход','output'],
        to_whom: ['Кому','to_whom'],
        software: ['ПО','software'],
        metric: ['Метрика','metric'],
        how_to_digitize: ['Как цифруем','how_to_digitize'],
        comment: ['Комментарий','comment']
      }[logical] || [];
      for (let c of candidates){
        if (row[c] !== undefined) return row[c];
      }
      // last fallback: first column
      return row[Object.keys(row)[0]] || '';
    };

    const roleKey = get('role');
    const roleDesc = ROLE_INFO[roleKey] || '';

    return `<tr>
      <td class="col-id">${escapeHtml(get('number'))}</td>
      <td class="col-function">${escapeHtml(get('function'))}</td>
      <td class="col-text-medium">${escapeHtml(get('product'))}</td>
      <td>${escapeHtml(get('department'))}</td>
      <td>${escapeHtml(get('division'))}</td>
      <td>${escapeHtml(get('position'))}</td>
      <td class="col-role role" data-tooltip="${escapeHtmlAttr(roleDesc)}">${escapeHtml(roleKey)}</td>
      <td class="col-text-medium">${escapeHtml(get('input'))}</td>
      <td class="col-text-medium">${escapeHtml(get('from_how'))}</td>
      <td class="col-text-medium">${escapeHtml(get('output'))}</td>
      <td class="col-text-medium">${escapeHtml(get('to_whom'))}</td>
      <td class="col-text-medium">${escapeHtml(get('software'))}</td>
      <td class="col-text-medium">${escapeHtml(get('metric'))}</td>
      <td class="col-text-medium">${escapeHtml(get('how_to_digitize'))}</td>
      <td class="col-text-wide">${escapeHtml(get('comment'))}</td>
    </tr>`;
  }).join('');
}

/* --------------------
   Sticky header offset: compute combined header+controls height and set CSS var
   -------------------- */
function setTableTopOffset(){
  const header = document.querySelector('header');
  const controls = document.querySelector('.controls');
  let offset = 0;
  if (header) offset += header.getBoundingClientRect().height;
  if (controls) offset += controls.getBoundingClientRect().height;
  // add tiny margin
  offset += 6;
  document.documentElement.style.setProperty('--table-top-offset', offset + 'px');
}

/* --------------------
   Utilities
   -------------------- */
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

function escapeHtml(s){
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeHtmlAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
