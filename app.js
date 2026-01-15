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
const filters = ['function', 'department', 'division', 'position', 'role'];

document.addEventListener('DOMContentLoaded', loadData);

function loadData() {
  fetch(DATA_URL)
    .then(r => r.text())
    .then(text => {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      data = parsed.data.map(r => ({
        ...r,
        role: r.role || ''
      }));
      initFilters();
      render();
      initResizers();
    });
}

function initFilters() {
  filters.forEach(f => {
    const el = document.getElementById('filter-' + f);
    el.onchange = render;
  });
  document.getElementById('clear').onclick = () => {
    filters.forEach(f => document.getElementById('filter-' + f).value = '');
    render();
  };
  updateFilters(data);
}

function updateFilters(source) {
  filters.forEach(k => {
    const sel = document.getElementById('filter-' + k);
    const values = [...new Set(source.map(r => r[k]).filter(Boolean))];
    sel.innerHTML =
      '<option value="">Все</option>' +
      values.map(v => `<option value="${v}">${v}</option>`).join('');
  });
}

function filteredData() {
  return data.filter(r =>
    filters.every(f => {
      const v = document.getElementById('filter-' + f).value;
      return !v || r[f] === v;
    })
  );
}

function render() {
  const rows = filteredData();
  updateFilters(rows);

  const tbody = document.querySelector('#result tbody');
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.number || ''}</td>
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

/* REAL column resize */
function initResizers() {
  document.querySelectorAll('th.resizable').forEach((th, index) => {
    const resizer = th.querySelector('.resizer');
    let startX, startWidth;

    resizer.addEventListener('mousedown', e => {
      startX = e.pageX;
      startWidth = th.offsetWidth;

      document.onmousemove = e => {
        const width = startWidth + (e.pageX - startX);
        th.style.width = width + 'px';
        document.querySelectorAll(`#result tr td:nth-child(${index + 1})`)
          .forEach(td => td.style.width = width + 'px');
      };

      document.onmouseup = () => {
        document.onmousemove = null;
        document.onmouseup = null;
      };
    });
  });
}

