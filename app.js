const ROLE_INFO = {
  "О": "Ответственный: организует и координирует выполнение функции.",
  "В": "Выполняющий: непосредственно выполняет работу.",
  "У": "Утверждающий: принимает и утверждает результат.",
  "К": "Консультант: даёт экспертную консультацию.",
  "И": "Информируемый: получает информацию.",
  "П": "Помощник: содействует выполнению.",
  "ПК": "Помощник, консультант: объединённая роль."
};

let data = [];

fetch("data.csv")
  .then(r => r.text())
  .then(parseCSV)
  .then(rows => {
    data = rows;
    initFilters();
    render();
  });

function parseCSV(text) {
  const rows = text.trim().split(/\r?\n/);
  const headers = rows[0].split(",").map(h => h.trim());

  return rows.slice(1).map(row => {
    const values = row.split(",");
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] || "");
    return obj;
  });
}

function unique(field, filtered = data) {
  return [...new Set(filtered.map(r => r[field]).filter(Boolean))];
}

function initFilters() {
  fill("filter-function", "Функция");
  fill("filter-department", "Департамент");
  fill("filter-division", "Отдел");
  fill("filter-position", "Должность");
  fill("filter-role", "Роль");

  document.querySelectorAll("select").forEach(s =>
    s.addEventListener("change", render)
  );

  document.getElementById("clear").onclick = () => {
    document.querySelectorAll("select").forEach(s => s.value = "");
    render();
  };
}

function fill(id, field) {
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">Все</option>`;
  unique(field).forEach(v =>
    el.innerHTML += `<option value="${v}">${v}</option>`
  );
}

function render() {
  const f = id => document.getElementById(id).value;

  const filtered = data.filter(r =>
    (!f("filter-function") || r["Функция"] === f("filter-function")) &&
    (!f("filter-department") || r["Департамент"] === f("filter-department")) &&
    (!f("filter-division") || r["Отдел"] === f("filter-division")) &&
    (!f("filter-position") || r["Должность"] === f("filter-position")) &&
    (!f("filter-role") || r["Роль"] === f("filter-role"))
  );

  const tbody = document.querySelector("tbody");
  tbody.innerHTML = "";

  filtered.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-id">${r["№"]}</td>
      <td class="col-function">${r["Функция"]}</td>
      <td>${r["Продукт"]}</td>
      <td>${r["Департамент"]}</td>
      <td>${r["Отдел"]}</td>
      <td>${r["Должность"]}</td>
      <td class="col-role role" data-tooltip="${ROLE_INFO[r["Роль"]] || ""}">
        ${r["Роль"]}
      </td>
      <td>${r["Вход"]}</td>
      <td>${r["От кого / как"]}</td>
      <td>${r["Выход"]}</td>
      <td>${r["Кому"]}</td>
      <td>${r["ПО"]}</td>
      <td>${r["Метрика"]}</td>
      <td>${r["Как цифруем"]}</td>
      <td>${r["Комментарий"]}</td>
    `;
    tbody.appendChild(tr);
  });
}
