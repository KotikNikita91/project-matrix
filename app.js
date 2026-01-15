// app.js — robust client-side CSV loader and interdependent filters
const DATA_URL = 'data/matrix.csv'; // убедись, что файл лежит в data/matrix.csv

let rawData = []; // массив объектов
const filterIds = ['function','department','division','position'];

document.addEventListener('DOMContentLoaded', () => {
  // установить слушатели
  document.getElementById('clear').addEventListener('click', clearFilters);
  filterIds.forEach(id => {
    document.getElementById('filter-' + id).addEventListener('change', onFilterChange);
  });

  loadData();
});

function loadData() {
  fetch(DATA_URL)
    .then(resp => {
      if (!resp.ok) throw new Error('Не удалось загрузить CSV: ' + resp.status);
      return resp.text();
    })
    .then(text => {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      if (parsed.errors && parsed.errors.length) {
        console.warn('PapaParse ошибки:', parsed.errors.slice(0,5));
      }
      rawData = parsed.data.map(normalizeRow);
      initFiltersUI();
      render();
    })
    .catch(err => {
      console.error(err);
      alert('Ошибка загрузки данных: ' + err.message + '. Смотри консоль (F12).');
    });
}

function normalizeRow(r) {
  // Переименуй ключи, если в CSV они иные, но ожидание — именно такие имена:
  // number,function,product,department,division,position,role,input,from_how,output,to_whom,software,metric,how_to_digitize,comment
  // Приводим все поля к строкам и trim
  const keys = ['number','function','product','department','division','position','role',
                'input','from_how','output','to_whom','software','metric','how_to_digitize','comment'];
  const out = {};
  keys.forEach(k => { out[k] = (r[k] || '').toString().trim(); });
  return out;
}

function initFiltersUI() {
  // Заполнить все селекты всеми уникальными значениями на старте
  updateAllFilterOptions();
}

function getCurrentFilters() {
  const f = {};
  filterIds.forEach(id => {
    f[id] = document.getElementById('filter-' + id).value || '';
  });
  return f;
}

function onFilterChange() {
  // при каждом изменении фильтра — обновляем опции в селектах с учётом текущего состояния (каскад)
  updateAllFilterOptions();
  render();
}

function clearFilters() {
  filterIds.forEach(id => { document.getElementById('filter-'+id).value = ''; });
  updateAllFilterOptions();
  render();
}

function updateAllFilterOptions() {
  // Для каждой опции показываем значения, доступные при фиксированных остальных фильтрах
  const current = getCurrentFilters();
  filterIds.forEach(id => {
    // создаём фильтр, исключая текущий id (чтобы он показывал варианты, совместимые с остальными)
    const otherFilters = Object.entries(current).filter(([k]) => k !== id);
    const subset = rawData.filter(row => {
      return otherFilters.every(([k,v]) => !v || row[k] === v);
    });
    const values = Array.from(new Set(subset.map(r => r[id]).filter(Boolean))).sort();
    const sel = document.getElementById('filter-' + id);
    const prev = sel.value;
    sel.innerHTML = '<option value="">Все</option>' + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    // если прежнее значение всё ещё доступно — оставляем, иначе сбрасываем
    if (prev && values.includes(prev)) sel.value = prev; else sel.value = '';
  });
}

function filterData() {
  const f = getCurrentFilters();
  return rawData.filter(r =>
    (!f.function || r.function === f.function) &&
    (!f.department || r.department === f.department) &&
    (!f.division || r.division === f.division) &&
    (!f.position || r.position === f.position)
  );
}

function render() {
  const body = document.querySelector('#result tbody');
  const rows = filterData();
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="15">Нет данных по выбранным фильтрам</td></tr>';
    return;
  }
  body.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.number)}</td>
      <td>${escapeHtml(r.function)}</td>
      <td>${escapeHtml(r.product)}</td>
      <td>${escapeHtml(r.department)}</td>
      <td>${escapeHtml(r.division)}</td>
      <td>${escapeHtml(r.position)}</td>
      <td>${escapeHtml(r.role)}</td>
      <td>${escapeHtml(r.input)}</td>
      <td>${escapeHtml(r.from_how)}</td>
      <td>${escapeHtml(r.output)}</td>
      <td>${escapeHtml(r.to_whom)}</td>
      <td>${escapeHtml(r.software)}</td>
      <td>${escapeHtml(r.metric)}</td>
      <td>${escapeHtml(r.how_to_digitize)}</td>
      <td>${escapeHtml(r.comment)}</td>
    </tr>
  `).join('');
}

// небольшая защита от XSS при вставке в DOM
function escapeHtml(s){ return (s+'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
