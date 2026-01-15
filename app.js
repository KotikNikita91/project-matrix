const DATA_URL = 'data/matrix.csv';

const ROLE_INFO = {
  'О': 'Ответственный: организует и координирует выполнение функции, назначает исполнителей, контролирует сроки и качество, обеспечивает достижение результата.',
  'В': 'Выполняющий: непосредственно выполняет работу по поручению ответственного.',
  'У': 'Утверждающий: постановщик задач и финально ответственный за результат.',
  'К': 'Консультант: дает экспертные рекомендации.',
  'И': 'Информируемый: получает информацию о ходе или результате.',
  'П': 'Помощник: содействует выполнению функции ресурсами.',
  'ПК': 'Помощник-консультант: сочетает экспертную поддержку и помощь ресурсами.'
};

let data = [];
const filters = ['function', 'department', 'division', 'position'];

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  document.getElementById('clear').onclick = resetFilters;
});

function loadData() {
  fetch(DATA_URL)
    .then(r => r.text())
    .then(text => {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      data = parsed.data.map(normalize);
      initFilters();
      render();
      initResizers();
    });
}

function normalize(r) {
  return {
    number: r.number || '',
    function: r.function || '',
    product: r.product || '',
    department: r.department || '',
    division: r.division || '',
    position: r.position || '',
    role: r.role || '',
    input: r.input || '',
    from_how: r.from_how || '',
    output: r.output || '',
    to_whom: r.to_whom || '',
    software: r.software || '',
    metric: r.metric || '',
    how_to_digitize: r.how_to_digitize || '',
    comment: r.comment || ''
  };
}

function initFilters() {
  filters.forEach(f => {
    const el = document.getElementById('filter-' + f);
    el.onchange = render;
  });
  updateFilters(data);
}

function getActiveFilters() {
  const f = {};
  filters.forEach(k => f[k] = document.getElementById('filter-' + k).value);
  return f;
}

function updateFilters(source) {
  const active = getActiveFilters();
  filters.forEach(k => {
    const sel = document.getElementById('filter-' + k);
    const values = [...new Set(source.map(r => r[k]).filter(Boolean))];
    sel.innerHTML = '<option value="">Все</option>' +
      values.map(v => `<option value="${v}">${v}</option>`).join('');
    if (values.includes(active[k])) sel.value = active[k];
  });
}

function filteredData() {
  const f = getActiveFilters();
  return data.filter(r =>
    (!f.function || r.function === f.function) &&
    (!f.department || r.department === f.department) &&
    (!f.division || r.division === f.division) &&
    (!f.position || r.position === f.position)
  );
}

function render() {
  const rows = filteredData();
  updateFilters(rows);
  const tbody = document.querySelector('#result tbody');

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="15">Нет данных</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.number}</td>
      <td class="function" title="${r.function}">${r.function}</td>
      <td>${r.product}</td>
      <td>${r.department}</td>
      <td>${r.division}</td>
      <td>${r.position}</td>
      <td class="role" data-tooltip="${ROLE_INFO[r.role] || ''}">${r.role}</td>
      <td>${r.input}</td>
      <td>${r.from_how}</td>
      <td>${r.output}</td>
      <td>${r.to_whom}</td>
      <td>${r.software}</td>
      <td>${r.metric}</td>
      <td>${r.how_to_digitize}</td>
      <td>${r.comment}</td>
    </tr>
  `).join('');
}

function resetFilters() {
  filters.forEach(f => document.getElementById('filter-' + f).value = '');
  render();
}

/* Column resize */
function initResizers() {
  document.querySelectorAll('.resizer').forEach(resizer => {
    let startX, startWidth, th;
    resizer.addEventListener('mousedown', e => {
      th = e.target.parentElement;
      startX = e.pageX;
      startWidth = th.offsetWidth;
      document.onmousemove = e => {
        th.style.width = startWidth + (e.pageX - startX) + 'px';
      };
      document.onmouseup = () => {
        document.onmousemove = null;
        document.onmouseup = null;
      };
    });
  });
}
