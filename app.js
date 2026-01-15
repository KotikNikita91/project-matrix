let data = [];
const selects = ["function", "department", "division", "position"];

fetch("data/matrix.csv")
  .then(r => r.text())
  .then(text => {
    data = parseCSV(text);
    initFilters();
    render();
  });

function parseCSV(text) {
  const [header, ...rows] = text.split("\n");
  const keys = header.split(",");
  return rows
    .map(r => r.split(","))
    .filter(r => r.length === keys.length)
    .map(r =>
      Object.fromEntries(keys.map((k, i) => [k, r[i]]))
    );
}

function initFilters() {
  selects.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener("change", render);
  });
  updateSelects(data);
}

function getFilters() {
  return {
    function: document.getElementById("function").value,
    department: document.getElementById("department").value,
    division: document.getElementById("division").value,
    position: document.getElementById("position").value
  };
}

function filterData() {
  const f = getFilters();
  return data.filter(r =>
    (!f.function || r.function === f.function) &&
    (!f.department || r.department === f.department) &&
    (!f.division || r.division === f.division) &&
    (!f.position || r.position === f.position)
  );
}

function updateSelects(filtered) {
  selects.forEach(id => {
    const el = document.getElementById(id);
    const current = el.value;
    const values = [...new Set(filtered.map(r => r[id]).filter(Boolean))];
    el.innerHTML =
      `<option value="">Все</option>` +
      values.map(v => `<option>${v}</option>`).join("");
    el.value = values.includes(current) ? current : "";
  });
}

function render() {
  const filtered = filterData();
  updateSelects(filtered);

  const tbody = document.querySelector("#result tbody");
  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.number}</td>
      <td>${r.function}</td>
      <td>${r.product}</td>
      <td>${r.department}</td>
      <td>${r.division}</td>
      <td>${r.position}</td>
      <td>${r.role}</td>
    </tr>
  `).join("");
}
