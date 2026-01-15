/* app.js
   Robust client-side CSV loader + cascading filters + role tooltip
   Expected CSV headers (any language but matching by keywords):
   number, function, product, department, division, position, role,
   input, from_how, output, to_whom, software, metric, how_to_digitize, comment
*/

const DATA_URL = 'data/matrix.csv'; // put matrix.csv into data/ folder

// role descriptions (tooltip)
const ROLE_INFO = {
  'О': 'Ответственный: отвечает за организацию и координацию выполнения функции. Назначает исполнителей, контролирует сроки и качество, координирует выполнение и регулирует рабочий процесс. Может выполнить работу сам или назначить исполнителей. Обеспечивает достижение результата.',
  'В': 'Выполняющий: непосредственно выполняет работу по поручению ответственного: готовит документы, проводит расчеты, взаимодействует с системами, формирует отчеты и т.д.',
  'У': 'Утверждающий: постановщик задач и финально ответственный за результат. Принимает и утверждает выполненную работу.',
  'К': 'Консультант: дает экспертную консультацию — как лучше выполнить задачу; вовлекается при необходимости.',
  'И': 'Информируемый: получает информацию о ходе или результате выполнения функции. Не участвует в выполнении, но должен быть осведомлен.',
  'П': 'Помощник: содействует выполнению функции за счет предоставления дополнительных ресурсов: временных, технических.',
  'ПК': 'Помощник-консультант: обеспечивает экспертную поддержку и ресурсы, отвечает за качество выполнения.'
};

let rawRows = []; // array of normalized row objects

// which filters to render and cascade
const FILTER_KEYS = ['function', 'department', 'division', 'position', 'role'];

document.addEventListener('DOMContentLoaded', () => {
  setupUI();
  loadCSV();
});

function setupUI(){
  document.getElementById('clear').addEventListener('click', () => {
    FILTER_KEYS.forEach(k => {
      const el = document.getElementById('filter-' + k);
      if (el) el.value = '';
    });
    render();
  });

  // handle filter change events
  FILTER_KEYS.forEach(k => {
    const el = document.getElementById('filter-' + k);
    if (el) el.addEventListener('change', onFilterChange);
  });
}

function onFilterChange(){
  // when a filter changes we want to update the other selects to show only compatible options
  updateFilterOptions(); 
  render();
}

function loadCSV(){
  showInfo('Загрузка данных...');
  fetch(DATA_URL)
    .then(r => {
      if (!r.ok) throw new Error(`Не удалось получить CSV: ${r.status} ${r.statusText}`);
      return r.text();
    })
    .then(text => {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
      if (parsed.errors && parsed.errors.length){
        console.warn('PapaParse errors (first 5):', parsed.errors.slice(0,5));
      }
      if (!parsed.data || !parsed.data.length){
        showInfo('Данные не найдены в CSV. Проверьте файл в data/matrix.csv', true);
        return;
      }
      rawRows = parsed.data.map(normalizeRow);
      hideInfo();
      initializeFiltersFromData();
      render();
    })
    .catch(err => {
      console.error(err);
      showInfo('Ошибка при загрузке данных: ' + err.message, true);
    });
}

// try to map arbitrary CSV header names to our internal keys
function normalizeRow(row){
  // create a new object with keys we expect
  const out = {
    number: '',
    function: '',
    product: '',
    department: '',
    division: '',
    position: '',
    role: '',
    input: '',
    from_how: '',
    output: '',
    to_whom: '',
    software: '',
    metric: '',
    how_to_digitize: '',
    comment: ''
  };
  // create normalized headers map from parsed row keys
  Object.keys(row).forEach(k => {
    const v = row[k] == null ? '' : String(row[k]).trim();
    const kn = normalizeKey(k);
    // match to closest internal field by contains
    if (kn.includes('num') || kn === 'no' || kn === 'number') out.number = v;
    else if (kn.includes('funct') || kn === 'function' || kn.includes('функ')) out['function'] = v;
    else if (kn.includes('product') || kn.includes('проду')) out.product = v;
    else if (kn.includes('depart') || kn.includes('департ') || kn.includes('department')) out.department = v;
    else if (kn.includes('div') || kn.includes('отдел')) out.division = v;
    else if (kn.includes('position') || kn.includes('долж')) out.position = v;
    else if (kn === 'role' || kn.includes('роль')) out.role = v;
    else if (kn.includes('input') || kn.includes('вход')) out.input = v;
    else if (kn.includes('from') || kn.includes('отк') || kn.includes('от_кого') || kn.includes('how')) out.from_how = v;
    else if (kn.includes('output') || kn.includes('выход')) out.output = v;
    else if (kn.includes('to') || kn.includes('to_whom') || kn.includes('кому')) out.to_whom = v;
    else if (kn.includes('soft') || kn.includes('прог') || kn.includes('поо')) out.software = v;
    else if (kn.includes('metric') || kn.includes('метрик')) out.metric = v;
    else if (kn.includes('digit') || kn.includes('цыф') || kn.includes('циф')) out.how_to_digitize = v;
    else if (kn.includes('comment') || kn.includes('комме')) out.comment = v;
    else {
      // fallback: if some internal still empty, try to fill
      // not strict — we don't override filled fields
      if (!out.comment) out.comment = (out.comment ? out.comment + ' ' : '') + v;
    }
  });
  return out;
}

function normalizeKey(k){
  return String(k || '').toLowerCase().replace(/\s+/g,'_').replace(/[^a-zа-я0-9_]/gi,'');
}

/* UI helpers */

function showInfo(msg, important = false){
  const el = document.getElementById('info');
  el.classList.remove('hidden');
  el.textContent = msg;
  if (important) el.style.border = `1px solid #ffdede`; else el.style.border = 'none';
}

function hideInfo(){
  const el = document.getElementById('info');
  el.classList.add('hidden');
  el.textContent = '';
  el.style.border = 'none';
}

/* Filters initialization and cascading behavior */

// populate filters initially with all possible values
function initializeFiltersFromData(){
  FILTER_KEYS.forEach(k => {
    const sel = document.getElementById('filter-' + k);
    if (!sel) return;
    // unique values sorted
    const vals = Array.from(new Set(rawRows.map(r => r[k]).filter(Boolean))).sort((a,b)=> a.localeCompare(b,'ru'));
    sel.innerHTML = '<option value="">Все</option>' + vals.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join('');
  });
  // attach listeners already done in setupUI
}

// when updating options, make each select show only values compatible with other active filters
function updateFilterOptions(){
  const current = getActiveFilters();
  FILTER_KEYS.forEach(k => {
    const sel = document.getElementById('filter-' + k);
    if (!sel) return;
    // build subset where other filters (excluding this key) are applied
    const subset = rawRows.filter(r => {
      return FILTER_KEYS.every(otherKey => {
        if (otherKey === k) return true; // skip current
        const val = current[otherKey];
        return !val || r[otherKey] === val;
      });
    });
    const values = Array.from(new Set(subset.map(r=>r[k]).filter(Boolean))).sort((a,b)=> a.localeCompare(b,'ru'));
    const prev = sel.value;
    sel.innerHTML = '<option value="">Все</option>' + values.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join('');
    if (prev && values.includes(prev)) sel.value = prev; else sel.value = '';
  });
}

function getActiveFilters(){
  const res = {};
  FILTER_KEYS.forEach(k => {
    const el = document.getElementById('filter-' + k);
    res[k] = el ? el.value : '';
  });
  return res;
}

/* Filtering + rendering */

function filterRows(){
  const f = getActiveFilters();
  return rawRows.filter(r => {
    return FILTER_KEYS.every(k => {
      if (!f[k]) return true;
      return r[k] === f[k];
    });
  });
}

function render(){
  // update selects to be dependent
  updateFilterOptions();

  const rows = filterRows();
  const tbody = document.querySelector('#result tbody');
  if (!rows.length){
    tbody.innerHTML = '<tr><td colspan="15">Нет данных по выбранным фильтрам</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => {
    // tooltip for role (lookup by exact role symbol)
    const roleDesc = (r.role && ROLE_INFO[r.role]) ? ROLE_INFO[r.role] : '';
    return `<tr>
      <td>${escapeHtml(r.number)}</td>
      <td class="function-col" title="${escapeHtmlAttr(r['function'])}">${escapeHtml(r['function'])}</td>
      <td>${escapeHtml(r.product)}</td>
      <td>${escapeHtml(r.department)}</td>
      <td>${escapeHtml(r.division)}</td>
      <td>${escapeHtml(r.position)}</td>
      <td class="role" data-tooltip="${escapeHtmlAttr(roleDesc)}">${escapeHtml(r.role)}</td>
      <td>${escapeHtml(r.input)}</td>
      <td>${escapeHtml(r.from_how)}</td>
      <td>${escapeHtml(r.output)}</td>
      <td>${escapeHtml(r.to_whom)}</td>
      <td>${escapeHtml(r.software)}</td>
      <td>${escapeHtml(r.metric)}</td>
      <td>${escapeHtml(r.how_to_digitize)}</td>
      <td>${escapeHtml(r.comment)}</td>
    </tr>`;
  }).join('');
}

/* Utility: basic HTML escape (for insertion into text nodes) */
function escapeHtml(s){
  if (s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function escapeHtmlAttr(s){
  // similar but ensure quotes are escaped for attributes
  return escapeHtml(s).replace(/"/g,'&quot;');
}
