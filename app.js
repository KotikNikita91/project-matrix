/* app.js — улучшённая версия
   - PapaParse парсит CSV
   - каскадные фильтры
   - ячейки теперь переносятся (wrap)
   - динамический DOM-tooltip вместо ::after (более надёжно)
*/

const DATA_URL = 'data/matrix.csv';

// role descriptions
const ROLE_INFO = {
  'О': 'Ответственный: отвечает за организацию и координацию выполнения функции. Назначает исполнителей, контролирует сроки и качество, координирует выполнение и регулирует рабочий процесс. Может выполнить работу сам или назначить исполнителей. Обеспечивает достижение результата.',
  'В': 'Выполняющий: непосредственно выполняет работу по поручению ответственного: готовит документы, проводит расчеты, взаимодействует с системами, формирует отчеты и т.д.',
  'У': 'Утверждающий: постановщик задач и финально ответственный за результат. Принимает и утверждает выполненную работу.',
  'К': 'Консультант: дает экспертную консультацию — как лучше выполнить задачу; вовлекается при необходимости.',
  'И': 'Информируемый: получает информацию о ходе или результате выполнения функции. Не участвует в выполнении, но должен быть осведомлен.',
  'П': 'Помощник: содействует выполнению функции за счет предоставления дополнительных ресурсов: временных, технических.',
  'ПК': 'Помощник-консультант: обеспечивает экспертную поддержку и ресурсы, отвечает за качество выполнения.'
};

let rawRows = [];
const FILTER_KEYS = ['function','department','division','position','role'];
let tooltipEl = null; // element used for dynamic tooltip

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

  FILTER_KEYS.forEach(k => {
    const el = document.getElementById('filter-' + k);
    if (el) el.addEventListener('change', onFilterChange);
  });

  // create tooltip element once
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'tooltip';
  tooltipEl.style.opacity = '0';
  tooltipEl.style.pointerEvents = 'none';
  document.body.appendChild(tooltipEl);
}

function onFilterChange(){
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
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      if (parsed.errors && parsed.errors.length) {
        console.warn('PapaParse errors (first 5):', parsed.errors.slice(0,5));
      }
      if (!parsed.data || !parsed.data.length) {
        showInfo('CSV пуст или не распознан. Проверьте файл data/matrix.csv', true);
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

function normalizeRow(row){
  const out = {
    number:'', function:'', product:'', department:'', division:'', position:'', role:'',
    input:'', from_how:'', output:'', to_whom:'', software:'', metric:'', how_to_digitize:'', comment:''
  };
  Object.keys(row).forEach(k => {
    const v = row[k] == null ? '' : String(row[k]).trim();
    const kn = String(k || '').toLowerCase().replace(/\s+/g,'_').replace(/[^a-zа-я0-9_]/gi,'');
    if (kn.includes('num') || kn === 'no' || kn === 'number') out.number = v;
    else if (kn.includes('funct') || kn === 'function' || kn.includes('функ')) out['function'] = v;
    else if (kn.includes('product') || kn.includes('проду')) out.product = v;
    else if (kn.includes('depart') || kn.includes('департ')) out.department = v;
    else if (kn.includes('div') || kn.includes('отдел')) out.division = v;
    else if (kn.includes('position') || kn.includes('долж')) out.position = v;
    else if (kn === 'role' || kn.includes('роль')) out.role = v;
    else if (kn.includes('input') || kn.includes('вход')) out.input = v;
    else if (kn.includes('from') || kn.includes('от_кого') || kn.includes('how')) out.from_how = v;
    else if (kn.includes('output') || kn.includes('выход')) out.output = v;
    else if (kn.includes('to') || kn.includes('кому') || kn.includes('to_whom')) out.to_whom = v;
    else if (kn.includes('soft') || kn.includes('прог') || kn.includes('поо')) out.software = v;
    else if (kn.includes('metric') || kn.includes('метрик')) out.metric = v;
    else if (kn.includes('digit') || kn.includes('цыф') || kn.includes('циф')) out.how_to_digitize = v;
    else if (kn.includes('comment') || kn.includes('комме')) out.comment = v;
    else {
      // fallback: append to comment if nothing matched
      if (!out.comment) out.comment = v; else out.comment += (v ? ' | ' + v : '');
    }
  });
  return out;
}

function showInfo(msg, important=false){
  const el = document.getElementById('info');
  el.classList.remove('hidden');
  el.textContent = msg;
  if (important) el.style.border = '1px solid #ffdede'; else el.style.border = 'none';
}

function hideInfo(){
  const el = document.getElementById('info');
  el.classList.add('hidden');
  el.textContent = '';
  el.style.border = 'none';
}

/* Filters */
function initializeFiltersFromData(){
  FILTER_KEYS.forEach(k => {
    const sel = document.getElementById('filter-' + k);
    if (!sel) return;
    const vals = Array.from(new Set(rawRows.map(r => r[k]).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ru'));
    sel.innerHTML = '<option value="">Все</option>' + vals.map(v => `<option value="${escapeHtmlAttr(v)}">${escapeHtml(v)}</option>`).join('');
  });
}

function updateFilterOptions(){
  const current = getActiveFilters();
  FILTER_KEYS.forEach(k => {
    const sel = document.getElementById('filter-' + k);
    if (!sel) return;
    const subset = rawRows.filter(r => {
      return FILTER_KEYS.every(other => {
        if (other === k) return true;
        const val = current[other];
        return !val || r[other] === val;
      });
    });
    const values = Array.from(new Set(subset.map(r=>r[k]).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ru'));
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

/* Rendering */
function filterRows(){
  const f = getActiveFilters();
  return rawRows.filter(r => FILTER_KEYS.every(k => !f[k] || r[k] === f[k]));
}

function render(){
  updateFilterOptions();
  const rows = filterRows();
  const tbody = document.querySelector('#result tbody');
  if (!rows.length){
    tbody.innerHTML = '<tr><td colspan="15">Нет данных по выбранным фильтрам</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const roleDesc = (r.role && ROLE_INFO[r.role]) ? ROLE_INFO[r.role] : '';
    // escape attributes
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

  // attach listeners for tooltip after rows inserted
  attachTooltipListeners();
}

/* Tooltip handling: dynamic element (robust, not clipped) */
function attachTooltipListeners(){
  // remove previously attached listeners by cloning nodes (cheap reset)
  document.querySelectorAll('#result tbody .role').forEach(td => {
    td.onmouseenter = td.onmousemove = td.onmouseleave = null;
  });

  document.querySelectorAll('#result tbody .role').forEach(td => {
    td.addEventListener('mouseenter', e => {
      const txt = td.getAttribute('data-tooltip') || '';
      if (!txt) return; // nothing to show
      showTooltip(txt, td);
    });
    td.addEventListener('mousemove', e => {
      // update position while mouse moves
      moveTooltip(e, td);
    });
    td.addEventListener('mouseleave', () => {
      hideTooltip();
    });
  });
}

function showTooltip(text, anchorEl){
  tooltipEl.innerText = text;
  tooltipEl.style.opacity = '1';
  tooltipEl.style.display = 'block';
  // initial position
  positionTooltipForElement(anchorEl);
}

function moveTooltip(mouseEvent, anchorEl){
  // keep tooltip near mouse on large screens: position relative to anchor's bounding rect center
  positionTooltipForElement(anchorEl);
}

function hideTooltip(){
  tooltipEl.style.opacity = '0';
  tooltipEl.style.display = 'none';
}

function positionTooltipForElement(el){
  const rect = el.getBoundingClientRect();
  const tt = tooltipEl.getBoundingClientRect();
  const margin = 8;

  // try to position to the right
  let left = rect.right + margin;
  let top = rect.top;

  // if overflow right, put left side
  if (left + tt.width > window.innerWidth - 8) {
    left = rect.left - tt.width - margin;
  }
  // if still out of bounds on left, clamp to window
  if (left < 8) left = 8;

  // if top overflow bottom, move up
  if (top + tt.height > window.innerHeight - 8) {
    top = window.innerHeight - tt.height - 8;
  }
  // if top < 8 clamp
  if (top < 8) top = 8;

  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = top + 'px';
}

/* Utility escaping */
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
  return escapeHtml(s).replace(/"/g,'&quot;');
}
