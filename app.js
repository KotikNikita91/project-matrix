/* ==========================
   НАСТРОЙКИ
========================== */

const DATA_URL = "data.csv";

/* Описания ролей для tooltip */
const ROLE_INFO = {
  "О": "Ответственный: отвечает за организацию и координацию выполнения функции. Назначает исполнителей, контролирует сроки и качество.",
  "В": "Выполняющий: непосредственно выполняет работу по заданию ответственного.",
  "У": "Утверждающий: принимает и утверждает результат, несёт финальную ответственность.",
  "К": "Консультант: даёт экспертную консультацию.",
  "И": "Информируемый: получает информацию о ходе или результате.",
  "П": "Помощник: содействует выполнению функции дополнительными ресурсами.",
  "ПК": "Помощник, консультант: объединённая роль помощника и консультанта."
};

let rawRows = [];
let filteredRows = [];

/* ==========================
   ЗАГРУЗКА CSV
========================== */

document.addEventListener("DOMContentLoaded", () => {
  loadCSV();
});

function loadCSV() {
  fetch(DATA_URL)
    .then(resp => {
      if (!resp.ok) {
        throw new Error(`CSV не найден (${resp.status})`);
      }
      return resp.text();
    })
    .then(text => {
      console.log("CSV RAW (preview):", text.slice(0, 800));

      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false
      });

      if (parsed.errors.length) {
        console.warn("PapaParse errors:", parsed.errors);
      }

      rawRows = parsed.data.map(row => normalizeRow(row));

      console.log("PARSED rows sample:", rawRows.slice(0, 3));

      initFilters();
      render();
    })
    .catch(err => {
      console.error("Ошибка загрузки CSV:", err);
      alert("Не удалось загрузить данные. Проверь data.csv");
    });
}

/* ==========================
   НОРМАЛИЗАЦИЯ
========================== */

function normalizeRow(row) {
  const out = {};
  Object.keys(row).forEach(key => {
    const cleanKey = String(key)
      .replace(/^\uFEFF/, "")
      .trim();

    const val = row[key] == null
      ? ""
      : String(row[key]).replace(/\r/g, "").trim();

    out[cleanKey] = val;
  });
  return out;
}

/* ==========================
   ФИЛЬТРЫ
========================== */

function initFilters() {
  fillFilter("filter-function", "function");
  fillFilter("filter-department", "department");
  fillFilter("filter-division", "division");
  fillFilter("filter-position", "position");
  fillFilter("filter-role", "role");

  document.querySelectorAll(".controls select")
    .forEach(sel => sel.addEventListener("change", render));

  document.getElementById("clear")
    .addEventListener("click", () => {
      document.querySelectorAll(".controls select")
        .forEach(sel => sel.value = "");
      render();
    });
}

function fillFilter(id, field) {
  const select = document.getElementById(id);
  select.innerHTML = `<option value="">Все</option>`;

  [...new Set(rawRows.map(r => r[field]).filter(Boolean))]
    .sort()
    .forEach(val => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    });
}

/* ==========================
   РЕНДЕР
========================== */

function render() {
  const f = id => document.getElementById(id).value;

  filteredRows = rawRows.filter(r =>
    (!f("filter-function")   || r.function   === f("filter-function")) &&
    (!f("filter-department") || r.department === f("filter-department")) &&
    (!f("filter-division")   || r.division   === f("filter-division")) &&
    (!f("filter-position")   || r.position   === f("filter-position")) &&
    (!f("filter-role")       || r.role       === f("filter-role"))
  );

  renderTable(filteredRows);
}

function renderTable(rows) {
  const tbody = document.querySelector("#matrix tbody");
  tbody.innerHTML = "";

  rows.forEach(r => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="col-id">${r.number}</td>
      <td class="col-function">${r.function}</td>
      <td class="col-text-medium">${r.product}</td>
      <td>${r.department}</td>
      <td>${r.division}</td>
      <td>${r.position}</td>
      <td class="col-role role" data-tooltip="${ROLE_INFO[r.role] || ""}">
        ${r.role}
      </td>
      <td class="col-text-medium">${r.input}</td>
      <td class="col-text-medium">${r.from_how}</td>
      <td class="col-text-medium">${r.output}</td>
      <td class="col-text-medium">${r.to_whom}</td>
      <td class="col-text-medium">${r.software}</td>
      <td class="col-text-medium">${r.metric}</td>
      <td class="col-text-medium">${r.how_to_digitize}</td>
      <td class="col-text-wide">${r.comment}</td>
    `;

    tbody.appendChild(tr);
  });
}
