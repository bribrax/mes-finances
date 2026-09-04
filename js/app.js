/* ═══════════════════════════════════════════════════════════
   Mes Finances — application 100% locale.
   Toutes les données sont stockées dans localStorage,
   rien n'est jamais envoyé sur Internet.
   ═══════════════════════════════════════════════════════════ */

"use strict";

/* ─── État & persistance ─────────────────────────────────── */

const STORAGE_KEY = "mesfinances.v1";
let firstRun = false;

const DEFAULT_CATEGORIES = [
  "Alimentation", "Logement", "Transports", "Santé", "Loisirs",
  "Restaurants", "Shopping", "Abonnements", "Assurances", "Impôts",
  "Vacances", "Frais bancaires", "Sorties", "Épargne", "Cadeaux",
  "Salaire", "Virements", "Autre"
];

const DEFAULT_RULES = [
  { keyword: "migros", category: "Alimentation" },
  { keyword: "coop", category: "Alimentation" },
  { keyword: "denner", category: "Alimentation" },
  { keyword: "lidl", category: "Alimentation" },
  { keyword: "aldi", category: "Alimentation" },
  { keyword: "sbb", category: "Transports" },
  { keyword: "cff", category: "Transports" },
  { keyword: "tpg", category: "Transports" },
  { keyword: "pharmacie", category: "Santé" },
  { keyword: "netflix", category: "Abonnements" },
  { keyword: "spotify", category: "Abonnements" },
  { keyword: "swisscom", category: "Abonnements" },
  { keyword: "loyer", category: "Logement" },
  { keyword: "salaire", category: "Salaire" },
  { keyword: "restaurant", category: "Restaurants" },
  { keyword: "mcdonald", category: "Restaurants" }
];

let state = loadState();

function loadState() {
  let s = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) firstRun = true;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.transactions)) s = parsed;
    }
  } catch (e) { /* données corrompues → on repart proprement */ }
  if (!s) s = {
    transactions: [],           // {id, date:'YYYY-MM-DD', label, amount, category}
    categories: [...DEFAULT_CATEGORIES],
    rules: [...DEFAULT_RULES]
  };
  // Migration : portefeuille d'investissement
  if (!s.invest) s.invest = { assets: [], taxRate: 0, fx: {} };
  if (!Array.isArray(s.invest.assets)) s.invest.assets = [];
  if (typeof s.invest.taxRate !== "number") s.invest.taxRate = 0;
  if (!s.invest.fx || typeof s.invest.fx !== "object") s.invest.fx = {};
  if (typeof s.invest.tdKey !== "string") s.invest.tdKey = "";
  if (typeof s.invest.eodKey !== "string") s.invest.eodKey = "";
  if (typeof s.invest.refCurrency !== "string") s.invest.refCurrency = "CHF";
  if (typeof s.currency !== "string") s.currency = s.invest.refCurrency;
  // Migration : ajouter les catégories par défaut manquantes (« Autre » reste en dernier)
  if (Array.isArray(s.categories)) {
    for (const c of DEFAULT_CATEGORIES) {
      if (!s.categories.includes(c)) {
        const i = s.categories.indexOf("Autre");
        if (i >= 0) s.categories.splice(i, 0, c);
        else s.categories.push(c);
      }
    }
  }
  return s;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ─── Utilitaires ────────────────────────────────────────── */

const money = (n) => moneyIn(n, state.currency || "CHF");

const MONTHS_FR = ["janvier","février","mars","avril","mai","juin",
  "juillet","août","septembre","octobre","novembre","décembre"];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}

/** Convertit "1'234.56", "1 234,56", "(12.30)", "-12,3" … en nombre. */
function parseAmount(v) {
  if (typeof v === "number") return v;
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[^0-9.,\-+]/g, "");            // enlève CHF, espaces, apostrophes…
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Le dernier séparateur est le séparateur décimal
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // Une seule virgule avec 1-2 décimales → décimal, sinon milliers
    const dec = s.length - lastComma - 1;
    s = (dec <= 2 && s.split(",").length === 2) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot > -1) {
    const dec = s.length - lastDot - 1;
    if (dec === 3 && s.split(".").length > 2) s = s.replace(/\./g, "");
  }
  let n = parseFloat(s);
  if (negative) n = -Math.abs(n);
  return n;
}

/** Convertit diverses écritures de dates en 'YYYY-MM-DD' (ou null). */
function parseDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return toISO(v);
  if (typeof v === "number") {                   // date "série" Excel
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : toISO(d);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);            // 2026-01-31
  if (m) return iso(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);        // 31.01.2026 / 31/01/2026
  if (m) return iso(m[3], m[2], m[1]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/);       // 31.01.26
  if (m) return iso("20" + m[3], m[2], m[1]);
  const d = new Date(s);
  return isNaN(d) ? null : toISO(d);
}
function iso(y, mo, d) {
  const yy = +y, mm = +mo, dd = +d;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function categorize(label) {
  const l = label.toLowerCase();
  for (const r of state.rules) {
    if (r.keyword && l.includes(r.keyword.toLowerCase())) return r.category;
  }
  return "Autre";
}

/* ─── Navigation entre pages ─────────────────────────────── */

function showPage(name) {
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.page === name));
  document.querySelectorAll(".page").forEach(p =>
    p.classList.toggle("active", p.id === "page-" + name));
  if (name === "dashboard") renderDashboard();
  if (name === "transactions") renderTransactions();
  if (name === "invest") renderInvestPage();
  if (name === "data") renderRules();
}

document.querySelectorAll(".tab").forEach(t =>
  t.addEventListener("click", () => showPage(t.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(b =>
  b.addEventListener("click", () => showPage(b.dataset.goto)));

/* ─── Tableau de bord ────────────────────────────────────── */

let period = { mode: "month", date: new Date() };
let chartCategories = null, chartEvolution = null;

document.querySelectorAll(".pill").forEach(p =>
  p.addEventListener("click", () => {
    document.querySelectorAll(".pill").forEach(x => x.classList.remove("active"));
    p.classList.add("active");
    period.mode = p.dataset.period;
    renderDashboard();
  }));

document.getElementById("period-prev").addEventListener("click", () => shiftPeriod(-1));
document.getElementById("period-next").addEventListener("click", () => shiftPeriod(1));

function shiftPeriod(dir) {
  const d = period.date;
  if (period.mode === "month") d.setMonth(d.getMonth() + dir);
  else d.setFullYear(d.getFullYear() + dir);
  renderDashboard();
}

function periodTransactions() {
  const y = period.date.getFullYear();
  const m = period.date.getMonth();
  return state.transactions.filter(t => {
    const [ty, tm] = t.date.split("-").map(Number);
    return period.mode === "month" ? (ty === y && tm === m + 1) : (ty === y);
  });
}

function renderDashboard() {
  const has = state.transactions.length > 0;
  document.getElementById("dash-empty").classList.toggle("hidden", has);
  document.getElementById("dash-content").classList.toggle("hidden", !has);

  const y = period.date.getFullYear();
  document.getElementById("period-label").textContent =
    period.mode === "month" ? `${MONTHS_FR[period.date.getMonth()]} ${y}` : String(y);

  if (!has) return;

  const txs = periodTransactions();
  const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const balance = income + expense;

  const kb = document.getElementById("kpi-balance");
  kb.textContent = money(balance);
  kb.classList.toggle("negative", balance < 0);
  kb.classList.toggle("positive", balance > 0);
  document.getElementById("kpi-income").textContent = money(income);
  document.getElementById("kpi-expense").textContent = money(expense);
  document.getElementById("kpi-count").textContent = txs.length;

  renderCategoryChart(txs);
  renderEvolutionChart(txs);
  renderCategoryTable(txs);
}

const PALETTE = ["#1f6f4f","#b8432c","#b98b1e","#3b6ea5","#7a4f9e",
  "#2f9c72","#d97b4f","#5c6b63","#93482f","#4a8f8c","#8a6d3b","#5a5f9e","#a8a29e"];

function expensesByCategory(txs) {
  const map = new Map();
  txs.filter(t => t.amount < 0).forEach(t => {
    map.set(t.category, (map.get(t.category) || 0) + Math.abs(t.amount));
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function renderCategoryChart(txs) {
  const data = expensesByCategory(txs);
  if (chartCategories) chartCategories.destroy();
  chartCategories = new Chart(document.getElementById("chart-categories"), {
    type: "doughnut",
    data: {
      labels: data.map(d => d[0]),
      datasets: [{ data: data.map(d => d[1]), backgroundColor: PALETTE, borderWidth: 2, borderColor: "#fff" }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, font: { family: "Public Sans" } } },
        tooltip: { callbacks: { label: c => ` ${c.label} : ${money(c.parsed)}` } }
      }
    }
  });
}

function renderEvolutionChart(txs) {
  let labels, spend, earn;
  if (period.mode === "month") {
    document.getElementById("evolution-title").textContent = "Dépenses jour par jour";
    const days = new Date(period.date.getFullYear(), period.date.getMonth() + 1, 0).getDate();
    labels = Array.from({ length: days }, (_, i) => String(i + 1));
    spend = new Array(days).fill(0);
    earn = null;
    txs.forEach(t => {
      const d = +t.date.split("-")[2] - 1;
      if (t.amount < 0) spend[d] += Math.abs(t.amount);
    });
  } else {
    document.getElementById("evolution-title").textContent = "Entrées et dépenses par mois";
    labels = MONTHS_FR.map(m => m.slice(0, 3) + ".");
    spend = new Array(12).fill(0);
    earn = new Array(12).fill(0);
    txs.forEach(t => {
      const m = +t.date.split("-")[1] - 1;
      if (t.amount < 0) spend[m] += Math.abs(t.amount);
      else earn[m] += t.amount;
    });
  }
  if (chartEvolution) chartEvolution.destroy();
  const datasets = [{ label: "Dépenses", data: spend, backgroundColor: "#b8432c" }];
  if (earn) datasets.unshift({ label: "Entrées", data: earn, backgroundColor: "#1f6f4f" });
  chartEvolution = new Chart(document.getElementById("chart-evolution"), {
    type: "bar",
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
      plugins: {
        legend: { display: !!earn, position: "bottom", labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label} : ${money(c.parsed.y)}` } }
      }
    }
  });
}

function renderCategoryTable(txs) {
  const data = expensesByCategory(txs);
  const total = data.reduce((s, d) => s + d[1], 0);
  const el = document.getElementById("cat-table");
  if (!data.length) { el.innerHTML = '<p class="muted">Aucune dépense sur cette période.</p>'; return; }
  el.innerHTML = data.map(([cat, amt], i) => `
    <div class="cat-row">
      <span>${esc(cat)} <span class="muted">${(amt / total * 100).toFixed(0)} %</span></span>
      <span class="amount">${money(amt)}</span>
      <div class="bar-bg"><div class="bar" style="width:${(amt / total * 100).toFixed(1)}%;background:${PALETTE[i % PALETTE.length]}"></div></div>
    </div>`).join("");
}

/* ─── Transactions ───────────────────────────────────────── */

const txSearch = document.getElementById("tx-search");
const txFilterCat = document.getElementById("tx-filter-cat");
const txFilterMonth = document.getElementById("tx-filter-month");
[txSearch, txFilterCat, txFilterMonth].forEach(el =>
  el.addEventListener("input", renderTransactions));

function renderTransactions() {
  const has = state.transactions.length > 0;
  document.getElementById("tx-empty").classList.toggle("hidden", has);
  document.querySelector("#page-transactions .table-scroll").classList.toggle("hidden", !has);
  document.querySelector("#page-transactions .toolbar").classList.toggle("hidden", !has);
  if (!has) { document.getElementById("tx-count-info").textContent = ""; return; }

  // Filtres : catégories et mois disponibles
  fillSelect(txFilterCat, ["", ...state.categories],
    v => v === "" ? "Toutes catégories" : v, txFilterCat.value);
  const months = [...new Set(state.transactions.map(t => t.date.slice(0, 7)))].sort().reverse();
  fillSelect(txFilterMonth, ["", ...months],
    v => v === "" ? "Toutes périodes" : monthLabel(v), txFilterMonth.value);

  const q = txSearch.value.trim().toLowerCase();
  let txs = state.transactions
    .filter(t => !q || t.label.toLowerCase().includes(q))
    .filter(t => !txFilterCat.value || t.category === txFilterCat.value)
    .filter(t => !txFilterMonth.value || t.date.startsWith(txFilterMonth.value))
    .sort((a, b) => b.date.localeCompare(a.date));

  const LIMIT = 400;
  const shown = txs.slice(0, LIMIT);
  const catOptions = state.categories.map(c => `<option>${esc(c)}</option>`).join("");

  document.getElementById("tx-body").innerHTML = shown.map(t => `
    <tr data-id="${t.id}">
      <td>${t.date.split("-").reverse().join(".")}</td>
      <td>${esc(t.label)}</td>
      <td class="amount ${t.amount < 0 ? "neg" : "pos"}">${money(t.amount)}</td>
      <td><select class="tx-cat" data-id="${t.id}">${catOptions}</select></td>
      <td><button class="tx-del" data-id="${t.id}" title="Supprimer">✕</button></td>
    </tr>`).join("");

  // Sélectionner la bonne catégorie dans chaque menu
  document.querySelectorAll(".tx-cat").forEach(sel => {
    const t = state.transactions.find(x => x.id === sel.dataset.id);
    if (t) sel.value = t.category;
    sel.addEventListener("change", () => changeCategory(sel.dataset.id, sel.value));
  });
  document.querySelectorAll(".tx-del").forEach(b =>
    b.addEventListener("click", () => deleteTx(b.dataset.id)));

  document.getElementById("tx-count-info").textContent =
    txs.length > LIMIT
      ? `${txs.length} transactions trouvées — les ${LIMIT} plus récentes sont affichées, affinez avec les filtres.`
      : `${txs.length} transaction${txs.length > 1 ? "s" : ""}.`;
}

function fillSelect(sel, values, labelFn, keep) {
  sel.innerHTML = values.map(v => `<option value="${esc(v)}">${esc(labelFn(v))}</option>`).join("");
  if (values.includes(keep)) sel.value = keep;
}

function monthLabel(ym) {
  const [y, m] = ym.split("-");
  return `${MONTHS_FR[+m - 1]} ${y}`;
}

function changeCategory(id, cat) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  t.category = cat;
  // Proposer une règle automatique pour l'avenir
  const word = t.label.toLowerCase().split(/[\s,;:*]+/).find(w => w.length >= 4);
  if (word && !state.rules.some(r => r.keyword === word) &&
      confirm(`Appliquer automatiquement « ${cat} » à toutes les futures opérations contenant « ${word} » ?`)) {
    state.rules.push({ keyword: word, category: cat });
    let n = 0;
    state.transactions.forEach(x => {
      if (x.category === "Autre" && x.label.toLowerCase().includes(word)) { x.category = cat; n++; }
    });
    if (n) renderTransactions();
  }
  saveState();
}

function deleteTx(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`Supprimer « ${t.label} » du ${t.date.split("-").reverse().join(".")} ?`)) return;
  state.transactions = state.transactions.filter(x => x.id !== id);
  saveState();
  renderTransactions();
}

/* ─── Import de fichiers ─────────────────────────────────── */

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") fileInput.click(); });
dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", e => {
  e.preventDefault(); dropzone.classList.remove("drag");
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
  fileInput.value = "";
});

function importStatus(msg, ok) {
  const el = document.getElementById("import-status");
  el.textContent = msg;
  el.className = "import-status " + (ok ? "ok" : "err");
}

async function handleFile(file) {
  try {
    let rows;
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    } else {
      const text = await file.text();
      rows = parseCSV(text);
    }
    rows = rows.filter(r => r.some(c => String(c).trim() !== ""));
    if (rows.length < 2) throw new Error("Le fichier semble vide ou illisible.");
    openMappingDialog(rows);
  } catch (err) {
    importStatus("Impossible de lire le fichier : " + err.message, false);
  }
}

/** Parseur CSV maison : détecte ; , ou tabulation, gère les guillemets. */
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const firstLine = text.slice(0, text.indexOf("\n") + 1 || text.length);
  const counts = { ";": (firstLine.match(/;/g) || []).length,
                   ",": (firstLine.match(/,/g) || []).length,
                   "\t": (firstLine.match(/\t/g) || []).length };
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ─── Fenêtre de mappage des colonnes ────────────────────── */

const mapDialog = document.getElementById("map-dialog");
let pendingRows = null, pendingHeaderIdx = 0;

function openMappingDialog(rows) {
  // Trouver la ligne d'en-tête : première ligne dont au moins 2 cellules sont du texte
  pendingHeaderIdx = rows.findIndex(r =>
    r.filter(c => typeof c === "string" && c.trim() && isNaN(parseAmount(c)) && !parseDate(c)).length >= 2);
  if (pendingHeaderIdx < 0) pendingHeaderIdx = 0;
  pendingRows = rows;

  const header = rows[pendingHeaderIdx].map((c, i) => String(c).trim() || `Colonne ${i + 1}`);
  const opts = header.map((h, i) => `<option value="${i}">${esc(h)}</option>`).join("");
  const optsEmpty = `<option value="">(aucune)</option>` + opts;

  const g = guessColumns(header, rows.slice(pendingHeaderIdx + 1, pendingHeaderIdx + 10));
  setSelect("map-date", opts, g.date);
  setSelect("map-label", opts, g.label);
  setSelect("map-amount", optsEmpty, g.amount);
  setSelect("map-debit", optsEmpty, g.debit);
  setSelect("map-credit", optsEmpty, g.credit);

  renderMapPreview();
  ["map-date","map-label","map-amount","map-debit","map-credit"].forEach(id =>
    document.getElementById(id).onchange = renderMapPreview);

  mapDialog.showModal();
}

function setSelect(id, html, value) {
  const el = document.getElementById(id);
  el.innerHTML = html;
  if (value != null && value !== "") el.value = String(value);
  else if (el.querySelector('option[value=""]')) el.value = "";
}

function guessColumns(header, sample) {
  const h = header.map(x => x.toLowerCase());
  const find = (...words) => h.findIndex(x => words.some(w => x.includes(w)));
  let date = find("date", "valuta", "valeur");
  let label = find("libell", "description", "texte", "détail", "detail", "beneficiaire", "bénéficiaire", "communication", "booking text", "motif");
  let amount = find("montant", "amount", "betrag", "somme");
  let debit = find("débit", "debit", "sortie", "charge");
  let credit = find("crédit", "credit", "entrée", "entree");
  if (debit === amount) debit = -1;
  if (credit === amount) credit = -1;

  // Déductions à partir du contenu si les intitulés n'ont rien donné
  if (date < 0) date = header.findIndex((_, i) => sample.some(r => parseDate(r[i])));
  if (amount < 0 && debit < 0 && credit < 0) {
    amount = header.findIndex((_, i) =>
      sample.filter(r => !isNaN(parseAmount(r[i])) && !parseDate(r[i])).length >= sample.length / 2 && i !== date);
  }
  if (label < 0) {
    label = header.findIndex((_, i) =>
      i !== date && i !== amount &&
      sample.some(r => typeof r[i] === "string" && r[i].trim().length > 3 && isNaN(parseAmount(r[i]))));
  }
  return {
    date: date < 0 ? 0 : date,
    label: label < 0 ? 0 : label,
    amount: amount < 0 ? "" : amount,
    debit: debit < 0 ? "" : debit,
    credit: credit < 0 ? "" : credit
  };
}

function currentMapping() {
  const v = id => {
    const x = document.getElementById(id).value;
    return x === "" ? null : +x;
  };
  return { date: v("map-date"), label: v("map-label"),
           amount: v("map-amount"), debit: v("map-debit"), credit: v("map-credit") };
}

function extractTransactions() {
  const m = currentMapping();
  const out = [];
  for (const r of pendingRows.slice(pendingHeaderIdx + 1)) {
    const date = parseDate(r[m.date]);
    if (!date) continue;
    let amount = NaN;
    if (m.amount != null) amount = parseAmount(r[m.amount]);
    if (isNaN(amount) && (m.debit != null || m.credit != null)) {
      const d = m.debit != null ? parseAmount(r[m.debit]) : NaN;
      const c = m.credit != null ? parseAmount(r[m.credit]) : NaN;
      if (!isNaN(d) && d !== 0) amount = -Math.abs(d);
      else if (!isNaN(c)) amount = Math.abs(c);
    }
    if (isNaN(amount)) continue;
    const label = String(r[m.label] ?? "").trim().replace(/\s+/g, " ") || "Sans libellé";
    out.push({ date, label, amount });
  }
  return out;
}

function renderMapPreview() {
  const txs = extractTransactions().slice(0, 8);
  document.getElementById("map-preview").innerHTML =
    "<thead><tr><th>Date</th><th>Libellé</th><th class='num'>Montant</th><th>Catégorie détectée</th></tr></thead><tbody>" +
    txs.map(t => `<tr>
      <td>${t.date.split("-").reverse().join(".")}</td>
      <td>${esc(t.label.slice(0, 60))}</td>
      <td class="amount ${t.amount < 0 ? "neg" : "pos"}">${money(t.amount)}</td>
      <td>${esc(categorize(t.label))}</td></tr>`).join("") + "</tbody>";
  const total = extractTransactions().length;
  document.getElementById("map-info").textContent =
    total ? `${total} opérations lisibles dans ce fichier.`
          : "Aucune opération lisible avec ce mappage — vérifiez les colonnes choisies.";
}

document.getElementById("map-cancel").addEventListener("click", () => mapDialog.close());
document.getElementById("map-confirm").addEventListener("click", () => {
  const txs = extractTransactions();
  if (!txs.length) return;
  const existing = new Set(state.transactions.map(t => t.date + "|" + t.label + "|" + t.amount));
  let added = 0, skipped = 0;
  for (const t of txs) {
    const key = t.date + "|" + t.label + "|" + t.amount;
    if (existing.has(key)) { skipped++; continue; }
    existing.add(key);
    state.transactions.push({ id: uid(), ...t, category: categorize(t.label) });
    added++;
  }
  saveState();
  mapDialog.close();
  importStatus(
    `${added} opération${added > 1 ? "s" : ""} importée${added > 1 ? "s" : ""}` +
    (skipped ? ` (${skipped} déjà présente${skipped > 1 ? "s" : ""}, ignorées)` : "") + ".",
    true);
  if (added) showPage("dashboard");
});

/* ─── Règles de catégorisation ───────────────────────────── */

function renderRules() {
  const list = document.getElementById("rules-list");
  list.innerHTML = state.rules.map((r, i) => `
    <div class="rule-item">
      <span class="kw">${esc(r.keyword)}</span>
      <span class="arrow">→</span>
      <span>${esc(r.category)}</span>
      <button class="tx-del" data-i="${i}" title="Supprimer la règle">✕</button>
    </div>`).join("") || '<p class="muted">Aucune règle pour l\'instant.</p>';
  list.querySelectorAll(".tx-del").forEach(b =>
    b.addEventListener("click", () => {
      state.rules.splice(+b.dataset.i, 1);
      saveState(); renderRules();
    }));
  document.getElementById("rule-category").innerHTML =
    state.categories.map(c => `<option>${esc(c)}</option>`).join("");
}

document.getElementById("btn-add-rule").addEventListener("click", () => {
  const kw = document.getElementById("rule-keyword").value.trim().toLowerCase();
  const cat = document.getElementById("rule-category").value;
  if (!kw) return;
  state.rules.push({ keyword: kw, category: cat });
  let n = 0;
  state.transactions.forEach(t => {
    if (t.category === "Autre" && t.label.toLowerCase().includes(kw)) { t.category = cat; n++; }
  });
  saveState();
  document.getElementById("rule-keyword").value = "";
  renderRules();
  if (n) importStatus(`Règle ajoutée — ${n} transaction${n > 1 ? "s" : ""} recatégorisée${n > 1 ? "s" : ""}.`, true);
});

/* ─── Sauvegarde / restauration / effacement ─────────────── */

document.getElementById("btn-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mes-finances-${toISO(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

const restoreInput = document.getElementById("restore-input");
document.getElementById("btn-restore").addEventListener("click", () => restoreInput.click());
restoreInput.addEventListener("change", async () => {
  if (!restoreInput.files.length) return;
  try {
    const s = JSON.parse(await restoreInput.files[0].text());
    if (!Array.isArray(s.transactions)) throw new Error("format inattendu");
    if (!confirm(`Restaurer cette sauvegarde (${s.transactions.length} transactions) ? Les données actuelles seront remplacées.`)) return;
    applyBackup(s);
    importStatus("Sauvegarde restaurée.", true);
    renderRules();
    showPage("dashboard");
  } catch (e) {
    importStatus("Ce fichier n'est pas une sauvegarde valide.", false);
  }
  restoreInput.value = "";
});

document.getElementById("btn-clear").addEventListener("click", () => {
  if (!confirm("Effacer définitivement toutes vos données de ce navigateur ? Cette action est irréversible.")) return;
  if (!confirm("Dernière confirmation : tout supprimer ?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadState();
  renderRules();
  showPage("dashboard");
});

function applyBackup(s) {
  state = {
    transactions: s.transactions,
    categories: Array.isArray(s.categories) && s.categories.length ? s.categories : [...DEFAULT_CATEGORIES],
    rules: Array.isArray(s.rules) ? s.rules : [...DEFAULT_RULES],
    currency: typeof s.currency === "string" ? s.currency : "CHF",
    invest: (s.invest && Array.isArray(s.invest.assets))
      ? s.invest : { assets: [], taxRate: 0, fx: {}, tdKey: "", refCurrency: "CHF" }
  };
  if (typeof state.invest.refCurrency !== "string") state.invest.refCurrency = state.currency;
  if (typeof state.invest.tdKey !== "string") state.invest.tdKey = "";
  if (!state.invest.fx || typeof state.invest.fx !== "object") state.invest.fx = {};
  if (typeof state.invest.taxRate !== "number") state.invest.taxRate = 0;
  saveState();
}

/* ─── Simulateur d'investissement ────────────────────────── */

let chartInvest = null;
["inv-initial","inv-monthly","inv-rate","inv-years"].forEach(id =>
  document.getElementById(id).addEventListener("input", renderInvest));

function renderInvest() {
  const initial = Math.max(0, +document.getElementById("inv-initial").value || 0);
  const monthly = Math.max(0, +document.getElementById("inv-monthly").value || 0);
  const rate = Math.max(0, +document.getElementById("inv-rate").value || 0) / 100;
  const years = Math.min(60, Math.max(1, +document.getElementById("inv-years").value || 1));
  const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;

  let value = initial, invested = initial;
  const values = [initial], investedSeries = [initial];
  for (let m = 1; m <= years * 12; m++) {
    value = value * (1 + monthlyRate) + monthly;
    invested += monthly;
    if (m % 12 === 0) { values.push(value); investedSeries.push(invested); }
  }

  document.getElementById("inv-final").textContent = money(value);
  document.getElementById("inv-invested").textContent = money(invested);
  document.getElementById("inv-gains").textContent = money(value - invested);

  const labels = Array.from({ length: years + 1 }, (_, i) => i === 0 ? "Départ" : `An ${i}`);
  if (chartInvest) chartInvest.destroy();
  chartInvest = new Chart(document.getElementById("chart-invest"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Valeur du portefeuille", data: values,
          borderColor: "#1f6f4f", backgroundColor: "rgba(31,111,79,.12)", fill: true, tension: .25, pointRadius: 0 },
        { label: "Total versé", data: investedSeries,
          borderColor: "#5c6b63", borderDash: [5, 4], fill: false, tension: 0, pointRadius: 0 }
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: { y: { beginAtZero: true, ticks: { callback: v => new Intl.NumberFormat("fr-CH", { notation: "compact" }).format(v) } } },
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label} : ${money(c.parsed.y)}` } }
      }
    }
  });

  // Étapes clés
  const steps = [5, 10, 15, 20, 25, 30, 40, 50].filter(s => s <= years);
  if (!steps.includes(years)) steps.push(years);
  document.getElementById("inv-milestones").innerHTML = steps.map(s => {
    const v = values[s], inv = investedSeries[s];
    return `<div class="cat-row">
      <span>Après ${s} an${s > 1 ? "s" : ""} <span class="muted">dont ${money(v - inv)} de gains</span></span>
      <span class="amount">${money(v)}</span>
      <div class="bar-bg"><div class="bar" style="width:${(v / values[values.length - 1] * 100).toFixed(1)}%;background:#1f6f4f"></div></div>
    </div>`;
  }).join("");
}

/* ═══════════════════════════════════════════════════════════
   PORTEFEUILLE D'INVESTISSEMENT
   Actifs (BTC, ETF, fonds…), transactions d'achat/vente,
   historique de cours à la demi-journée, importable
   depuis Excel (HISTORIQUE.ACTIONS) ou CSV.
   ═══════════════════════════════════════════════════════════ */

function refCur() { return inv().refCurrency || "CHF"; }
let selectedAssetId = null;
let chartPfTotal = null, chartPfAssets = null, chartAsset = null;

/* ─── Aides ──────────────────────────────────────────────── */

const inv = () => state.invest;

function moneyIn(n, cur) {
  try {
    return new Intl.NumberFormat("fr-CH", { style: "currency", currency: cur }).format(n);
  } catch (e) {
    return n.toFixed(2) + " " + cur;
  }
}

function fxRate(cur) {
  if (cur === refCur()) return 1;
  const r = inv().fx[cur];
  return (typeof r === "number" && r > 0) ? r : 1;
}

const moneyRef = (n) => moneyIn(n, refCur());

const tsOf = (date, half) => date + "|" + half;

function tsLabel(ts) {
  const [date, half] = ts.split("|");
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y.slice(2)} ${half === "AM" ? "mat." : "a-m."}`;
}

/** Points de cours d'un actif : historique importé/saisi + prix des transactions,
    fusionnés et triés. Un cours explicite prime sur un prix de transaction. */
function pricePoints(asset) {
  const map = new Map();
  for (const t of asset.transactions) map.set(t.ts, t.price);
  for (const p of asset.prices) map.set(p.ts, p.price);
  return [...map.entries()].map(([ts, price]) => ({ ts, price }))
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

function qtyAt(asset, ts) {
  return asset.transactions.reduce((q, t) =>
    t.ts <= ts ? q + (t.type === "buy" ? t.qty : -t.qty) : q, 0);
}

function priceAt(points, ts) {
  let p = null;
  for (const pt of points) { if (pt.ts <= ts) p = pt.price; else break; }
  return p;
}

/** Trésorerie d'une opération : montant réellement payé (achat) ou reçu (vente),
    dans sa devise. Si non renseigné, calcul classique dans la devise de l'actif. */
function cashOf(t, asset) {
  if (typeof t.paid === "number") {
    return { amount: t.paid, currency: t.paidCur || asset.currency };
  }
  const amount = t.type === "buy"
    ? t.qty * t.price + (t.fees || 0)
    : t.qty * t.price - (t.fees || 0);
  return { amount, currency: asset.currency };
}

/** Trésorerie d'un actif convertie dans la devise de référence. */
function assetCashRef(asset) {
  let investedRef = 0, buyCashRef = 0;
  for (const t of asset.transactions) {
    const c = cashOf(t, asset);
    const v = c.amount * fxRate(c.currency);
    if (t.type === "buy") { investedRef += v; buyCashRef += v; }
    else investedRef -= v;
  }
  return { investedRef, buyCashRef };
}

/** Argent réellement décaissé (converti en devise de référence) jusqu'à un instant donné. */
function investedRefAt(asset, ts) {
  let total = 0;
  for (const t of asset.transactions) {
    if (t.ts > ts) continue;
    const c = cashOf(t, asset);
    const v = c.amount * fxRate(c.currency);
    total += t.type === "buy" ? v : -v;
  }
  return total;
}

/** Toutes les devises en jeu (actifs + paiements), hors devise de référence. */
function usedCurrencies() {
  const set = new Set(inv().assets.map(a => a.currency));
  for (const a of inv().assets)
    for (const t of a.transactions)
      if (typeof t.paid === "number" && t.paidCur) set.add(t.paidCur);
  set.delete(refCur());
  return [...set];
}

/** Statistiques d'un actif dans sa devise. */
function assetStats(asset) {
  const pts = pricePoints(asset);
  const last = pts.length ? pts[pts.length - 1] : null;
  let qty = 0, buyQty = 0, buyCost = 0, invested = 0, fees = 0;
  for (const t of asset.transactions) {
    fees += t.fees || 0;
    if (t.type === "buy") {
      qty += t.qty; buyQty += t.qty;
      buyCost += t.qty * t.price + (t.fees || 0);
      invested += t.qty * t.price;
    } else {
      qty -= t.qty;
      invested -= t.qty * t.price;
    }
  }
  const pru = buyQty > 0 ? buyCost / buyQty : 0;
  const value = last ? qty * last.price : 0;
  return { qty, pru, last, value, invested, fees, buyCostTotal: buyCost, pv: value - invested };
}

/* ─── Navigation des sous-onglets ────────────────────────── */

function showSub(name) {
  document.querySelectorAll(".subtab").forEach(t =>
    t.classList.toggle("active", t.dataset.sub === name));
  document.querySelectorAll(".subpage").forEach(p =>
    p.classList.toggle("active", p.id === "sub-" + name));
  if (name === "portfolio") renderPortfolio();
  if (name === "assets") renderAssets();
  if (name === "sim") renderInvest();
}

document.querySelectorAll(".subtab").forEach(t =>
  t.addEventListener("click", () => showSub(t.dataset.sub)));
document.querySelectorAll("[data-gosub]").forEach(b =>
  b.addEventListener("click", () => showSub(b.dataset.gosub)));

let pfRange = "all", assetRange = "all";

function rangeCutoff(r) {
  if (r === "all") return "";
  const d = new Date(Date.now() - (+r) * 86400 * 1000);
  return toISO(d) + "|AM";
}

function wireRangeBar(id, get, set) {
  document.querySelectorAll(`#${id} .pill`).forEach(p => {
    p.classList.toggle("active", p.dataset.r === get());
    p.onclick = () => { set(p.dataset.r); };
  });
}

function renderInvestPage() {
  const current = document.querySelector(".subtab.active");
  showSub(current ? current.dataset.sub : "portfolio");
}

/* ─── Sous-page Portefeuille ─────────────────────────────── */

function renderPortfolio() {
  const assets = inv().assets;
  const has = assets.some(a => a.transactions.length || a.prices.length);
  document.getElementById("pf-empty").classList.toggle("hidden", has);
  document.getElementById("pf-content").classList.toggle("hidden", !has);
  renderPfSettings();
  if (!has) return;

  // Indicateurs globaux : l'investi est l'argent réellement décaissé,
  // converti dans la devise de référence (les frais sont donc déjà inclus).
  let invested = 0, value = 0, buyCashTotal = 0;
  for (const a of assets) {
    const s = assetStats(a);
    const c = assetCashRef(a);
    invested += c.investedRef;
    buyCashTotal += c.buyCashRef;
    value += s.value * fxRate(a.currency);
  }
  const pv = value - invested;
  let pvNet = pv;
  if (pvNet > 0) pvNet *= 1 - (inv().taxRate || 0) / 100;
  const pvPct = buyCashTotal > 0 ? pv / buyCashTotal * 100 : 0;

  setKpi("pf-invested", moneyRef(invested));
  setKpi("pf-value", moneyRef(value));
  setKpi("pf-pv", moneyRef(pv), pv);
  setKpi("pf-pvnet", moneyRef(pvNet), pvNet);
  setKpi("pf-pvpct", (pvPct >= 0 ? "+" : "") + pvPct.toFixed(1) + " %", pvPct);

  wireRangeBar("pf-range", () => pfRange, r => { pfRange = r; renderPortfolio(); });

  // Chronologie commune : tous les instants connus, à la demi-journée
  const cutoff = rangeCutoff(pfRange);
  const allTs = [...new Set(assets.flatMap(a =>
    [...pricePoints(a).map(p => p.ts), ...a.transactions.map(t => t.ts)]))]
    .filter(ts => ts >= cutoff).sort();

  const perAsset = assets.map(a => {
    const pts = pricePoints(a), r = fxRate(a.currency);
    return {
      name: a.name,
      data: allTs.map(ts => {
        const p = priceAt(pts, ts);
        return p == null ? 0 : qtyAt(a, ts) * p * r;
      })
    };
  });
  const totals = allTs.map((_, i) => perAsset.reduce((s, a) => s + a.data[i], 0));
  const pvSeries = allTs.map((ts, i) =>
    totals[i] - assets.reduce((s, a) => s + investedRefAt(a, ts), 0));
  const labels = allTs.map(tsLabel);

  if (chartPfTotal) chartPfTotal.destroy();
  chartPfTotal = new Chart(document.getElementById("chart-pf-total"), {
    type: "line",
    data: { labels, datasets: [
      { label: "Valeur totale (" + refCur() + ")", data: totals,
        borderColor: "#1f6f4f", backgroundColor: "rgba(31,111,79,.12)",
        fill: true, tension: .2, pointRadius: 0, yAxisID: "y" },
      { label: "Plus-value (" + refCur() + ")", data: pvSeries,
        borderColor: "#b98b1e", borderDash: [6, 4],
        fill: false, tension: .2, pointRadius: 0, yAxisID: "y2" }
    ]},
    options: dualAxisOptions(v => moneyRef(v))
  });

  if (chartPfAssets) chartPfAssets.destroy();
  chartPfAssets = new Chart(document.getElementById("chart-pf-assets"), {
    type: "line",
    data: { labels, datasets: perAsset.map((a, i) => ({
      label: a.name, data: a.data,
      borderColor: PALETTE[i % PALETTE.length], fill: false, tension: .2, pointRadius: 0
    }))},
    options: lineOptions(v => moneyRef(v), true)
  });
}

function setKpi(id, text, signed) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.remove("pos", "neg");
  if (typeof signed === "number") el.classList.add(signed >= 0 ? "pos" : "neg");
}

function lineOptions(fmt, legend = false) {
  return {
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: {
      x: { ticks: { autoSkip: true, maxTicksLimit: 10, maxRotation: 0 } },
      y: { beginAtZero: true,
           ticks: { callback: v => new Intl.NumberFormat("fr-CH", { notation: "compact" }).format(v) } }
    },
    plugins: {
      legend: { display: legend, position: "bottom", labels: { boxWidth: 12 } },
      tooltip: { callbacks: { label: c => ` ${c.dataset.label} : ${fmt(c.parsed.y)}` } }
    }
  };
}

function dualAxisOptions(fmt) {
  return {
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    scales: {
      x: { ticks: { autoSkip: true, maxTicksLimit: 10, maxRotation: 0 } },
      y: { position: "left", beginAtZero: true,
           ticks: { callback: v => new Intl.NumberFormat("fr-CH", { notation: "compact" }).format(v) } },
      y2: { position: "right", grid: { drawOnChartArea: false },
            ticks: { callback: v => new Intl.NumberFormat("fr-CH", { notation: "compact" }).format(v) } }
    },
    plugins: {
      legend: { display: true, position: "bottom", labels: { boxWidth: 12 } },
      tooltip: { callbacks: { label: c => ` ${c.dataset.label} : ${fmt(c.parsed.y)}` } }
    }
  };
}

function renderPfSettings() {
  const taxInput = document.getElementById("pf-tax");
  taxInput.value = inv().taxRate;
  taxInput.oninput = () => {
    inv().taxRate = Math.min(100, Math.max(0, +taxInput.value || 0));
    saveState(); renderPortfolio();
  };
  const currencies = usedCurrencies();
  document.getElementById("pf-fx").innerHTML = currencies.map(c => `
    <label>1 ${esc(c)} =
      <div class="input-suffix">
        <input type="number" step="any" min="0" data-fx="${esc(c)}" value="${fxRate(c)}">
        <span>${refCur()}</span>
      </div>
    </label>`).join("");
  document.querySelectorAll("[data-fx]").forEach(i =>
    i.addEventListener("change", () => {
      inv().fx[i.dataset.fx] = Math.max(0, +i.value || 1);
      saveState(); renderPortfolio();
    }));

  const refSel = document.getElementById("pf-ref");
  refSel.value = refCur();
  refSel.onchange = () => {
    inv().refCurrency = refSel.value;
    saveState();
    renderPortfolio();
    // Les taux de change dépendent de la référence : on les réactualise
    document.getElementById("btn-update-fx").click();
  };

  const tdInput = document.getElementById("pf-tdkey");
  tdInput.value = inv().tdKey || "";
  tdInput.onchange = () => { inv().tdKey = tdInput.value.trim(); saveState(); };

  const eodInput = document.getElementById("pf-eodkey");
  eodInput.value = inv().eodKey || "";
  eodInput.onchange = () => { inv().eodKey = eodInput.value.trim(); saveState(); };
}

function pfApiStatus(msg, ok) {
  const el = document.getElementById("pf-api-status");
  el.textContent = msg;
  el.className = "import-status " + (ok ? "ok" : "err");
}

document.getElementById("btn-update-fx").addEventListener("click", async () => {
  const currencies = usedCurrencies();
  if (!currencies.length) { pfApiStatus("Tout votre portefeuille est déjà en " + refCur() + ".", true); return; }
  pfApiStatus("Récupération des taux…", true);
  const done = [], failed = [];
  for (const c of currencies) {
    try {
      const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(c)}&to=${refCur()}`);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const rate = data && data.rates && data.rates[refCur()];
      if (!(rate > 0)) throw new Error("taux absent");
      inv().fx[c] = rate;
      done.push(`1 ${c} = ${rate.toFixed(4)} ${refCur()}`);
    } catch (e) { failed.push(c); }
  }
  saveState();
  pfApiStatus(
    (done.length ? "Taux mis à jour : " + done.join(" · ") + "." : "") +
    (failed.length ? " Impossible pour : " + failed.join(", ") + "." : ""),
    failed.length === 0);
  renderPortfolio();
});

/* ─── Sous-page Mes actifs ───────────────────────────────── */

function renderAssets() {
  const list = document.getElementById("asset-list");
  const assets = inv().assets;
  list.innerHTML = assets.map(a => {
    const s = assetStats(a);
    return `<button class="asset-item ${a.id === selectedAssetId ? "active" : ""}" data-id="${a.id}">
      <span class="name">${esc(a.name)}</span>
      <span class="cur">${s.qty ? moneyIn(s.value, a.currency) : esc(a.currency)}</span>
    </button>`;
  }).join("") || '<p class="muted">Aucun actif pour l\'instant.</p>';
  list.querySelectorAll(".asset-item").forEach(b =>
    b.addEventListener("click", () => {
      if (b.dataset.id !== selectedAssetId) {
        selectedAssetId = b.dataset.id;
        document.getElementById("txf-price").value = "";   // le cours de l'actif sélectionné sera pré-rempli
        document.getElementById("txf-qty").value = "";
        document.getElementById("txf-paid").value = "";
        document.getElementById("txf-paidcur").value = refCur();
      }
      renderAssets();
    }));

  const asset = assets.find(a => a.id === selectedAssetId);
  document.getElementById("asset-empty").classList.toggle("hidden", !!asset);
  document.getElementById("asset-detail").classList.toggle("hidden", !asset);
  if (asset) renderAssetDetail(asset);
}

document.getElementById("btn-add-asset").addEventListener("click", () => {
  const name = document.getElementById("new-asset-name").value.trim();
  if (!name) return;
  const currency = document.getElementById("new-asset-currency").value;
  const a = { id: uid(), name, currency, prices: [], transactions: [] };
  inv().assets.push(a);
  selectedAssetId = a.id;
  saveState();
  document.getElementById("new-asset-name").value = "";
  renderAssets();
});

document.getElementById("btn-del-asset").addEventListener("click", () => {
  const a = inv().assets.find(x => x.id === selectedAssetId);
  if (!a) return;
  if (!confirm(`Supprimer « ${a.name} » avec ses ${a.transactions.length} opérations et ${a.prices.length} cours ?`)) return;
  inv().assets = inv().assets.filter(x => x.id !== selectedAssetId);
  selectedAssetId = null;
  saveState(); renderAssets();
});

function renderAssetDetail(asset) {
  wireAssetApi(asset);
  wireTxForm(asset);
  const s = assetStats(asset);
  document.getElementById("asset-title").textContent = `${asset.name} · ${asset.currency}`;
  document.getElementById("as-qty").textContent =
    s.qty.toLocaleString("fr-CH", { maximumFractionDigits: 8 });
  document.getElementById("as-last").textContent = s.last ? moneyIn(s.last.price, asset.currency) : "—";
  document.getElementById("as-last-date").textContent = s.last ? tsLabel(s.last.ts) : "aucun cours";
  document.getElementById("as-value").textContent = moneyIn(s.value, asset.currency);
  const cash = assetCashRef(asset);
  const valueRef = s.value * fxRate(asset.currency);
  const pvRef = valueRef - cash.investedRef;
  document.getElementById("as-realinv").textContent = moneyRef(cash.investedRef);
  setKpi("as-pv", moneyRef(pvRef), pvRef);
  document.getElementById("as-pv-note").textContent =
    asset.currency !== refCur() ? "en " + refCur() + ", change actuel" : "";
  const pvPct = cash.buyCashRef > 0 ? pvRef / cash.buyCashRef * 100 : 0;
  setKpi("as-pvpct", (pvPct >= 0 ? "+" : "") + pvPct.toFixed(1) + " %", pvPct);

  // Graphique : cours (axe gauche, devise de l'actif), plus-value (axe droit,
  // devise de référence) et marqueurs achat/vente, avec échelle de temps
  wireRangeBar("asset-range", () => assetRange, r => { assetRange = r; renderAssets(); });
  const cutoff = rangeCutoff(assetRange);
  const pts = pricePoints(asset).filter(p => p.ts >= cutoff);
  const labels = pts.map(p => tsLabel(p.ts));
  const idxOf = new Map(pts.map((p, i) => [p.ts, i]));
  const marker = type => asset.transactions
    .filter(t => t.type === type && idxOf.has(t.ts))
    .map(t => ({ x: labels[idxOf.get(t.ts)], y: t.price }));
  const fxA = fxRate(asset.currency);
  const pvData = pts.map(p => qtyAt(asset, p.ts) * p.price * fxA - investedRefAt(asset, p.ts));

  if (chartAsset) chartAsset.destroy();
  chartAsset = new Chart(document.getElementById("chart-asset"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Cours (" + asset.currency + ")", data: pts.map(p => p.price),
          borderColor: "#3b6ea5", backgroundColor: "rgba(59,110,165,.1)",
          fill: true, tension: .2, pointRadius: 0, order: 2, yAxisID: "y" },
        { label: "Plus-value (" + refCur() + ")", data: pvData,
          borderColor: "#b98b1e", borderDash: [6, 4],
          fill: false, tension: .2, pointRadius: 0, order: 2, yAxisID: "y2" },
        { label: "Achats", data: marker("buy"), type: "scatter", showLine: false,
          pointStyle: "triangle", radius: 7, hoverRadius: 9,
          backgroundColor: "#1f6f4f", borderColor: "#1f6f4f", order: 1, yAxisID: "y" },
        { label: "Ventes", data: marker("sell"), type: "scatter", showLine: false,
          pointStyle: "triangle", rotation: 180, radius: 7, hoverRadius: 9,
          backgroundColor: "#b8432c", borderColor: "#b8432c", order: 1, yAxisID: "y" }
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 10, maxRotation: 0 } },
        y: { position: "left", beginAtZero: false,
             ticks: { callback: v => new Intl.NumberFormat("fr-CH", { notation: "compact" }).format(v) } },
        y2: { position: "right", grid: { drawOnChartArea: false },
              ticks: { callback: v => new Intl.NumberFormat("fr-CH", { notation: "compact" }).format(v) } }
      },
      plugins: {
        legend: { display: true, position: "bottom", labels: { boxWidth: 12 } },
        tooltip: { callbacks: { label: c =>
          ` ${c.dataset.label} : ${c.dataset.yAxisID === "y2" ? moneyRef(c.parsed.y) : moneyIn(c.parsed.y, asset.currency)}` } }
      }
    }
  });

  // Liste des opérations
  const txs = [...asset.transactions].sort((a, b) => b.ts.localeCompare(a.ts));
  document.getElementById("asset-tx-list").innerHTML = txs.map(t => `
    <div class="mini-row">
      <span class="tag ${t.type}">${t.type === "buy" ? "Achat" : "Vente"}</span>
      <span class="grow">${tsLabel(t.ts)} — ${t.qty.toLocaleString("fr-CH", { maximumFractionDigits: 8 })} × ${moneyIn(t.price, asset.currency)}${t.fees ? ` <span class="muted">(+${moneyIn(t.fees, asset.currency)} frais)</span>` : ""}${typeof t.paid === "number" ? ` <span class="muted">· ${t.type === "buy" ? "payé" : "reçu"} ${moneyIn(t.paid, t.paidCur || asset.currency)}</span>` : ""}</span>
      <span class="amount">${moneyIn(t.qty * t.price, asset.currency)}</span>
      <button class="tx-del" data-id="${t.id}" title="Supprimer">✕</button>
    </div>`).join("") || '<p class="muted">Aucune opération enregistrée.</p>';
  document.querySelectorAll("#asset-tx-list .tx-del").forEach(b =>
    b.addEventListener("click", () => {
      asset.transactions = asset.transactions.filter(t => t.id !== b.dataset.id);
      saveState(); renderAssets();
    }));

  // Derniers cours enregistrés
  const prices = [...asset.prices].sort((a, b) => b.ts.localeCompare(a.ts));
  const shown = prices.slice(0, 8);
  document.getElementById("asset-price-list").innerHTML = shown.map(p => `
    <div class="mini-row">
      <span class="grow">${tsLabel(p.ts)}</span>
      <span class="amount">${moneyIn(p.price, asset.currency)}</span>
      <button class="tx-del" data-ts="${p.ts}" title="Supprimer">✕</button>
    </div>`).join("") +
    (prices.length > shown.length
      ? `<p class="muted">${prices.length} cours enregistrés au total — les 8 plus récents sont affichés.</p>` : "");
  document.querySelectorAll("#asset-price-list .tx-del").forEach(b =>
    b.addEventListener("click", () => {
      asset.prices = asset.prices.filter(p => p.ts !== b.dataset.ts);
      saveState(); renderAssets();
    }));
}

/* ─── Ajout d'opérations et de cours ─────────────────────── */

document.getElementById("btn-add-tx").addEventListener("click", () => {
  const asset = inv().assets.find(a => a.id === selectedAssetId);
  if (!asset) return;
  const date = document.getElementById("txf-date").value;
  const qty = +document.getElementById("txf-qty").value;
  const price = +document.getElementById("txf-price").value;
  if (!date || !(qty > 0) || !(price >= 0)) {
    alert("Renseignez au moins la date, la quantité et le prix unitaire."); return;
  }
  const tx = {
    id: uid(),
    ts: tsOf(date, document.getElementById("txf-half").value),
    type: document.getElementById("txf-type").value,
    qty, price,
    fees: Math.max(0, +document.getElementById("txf-fees").value || 0)
  };
  const paidRaw = document.getElementById("txf-paid").value;
  if (paidRaw !== "") {                     // 0 est une valeur valable (actions offertes)
    tx.paid = Math.max(0, +paidRaw || 0);
    tx.paidCur = document.getElementById("txf-paidcur").value;
  }
  asset.transactions.push(tx);
  saveState();
  document.getElementById("txf-qty").value = "";
  document.getElementById("txf-paid").value = "";
  renderAssets();
});

document.getElementById("btn-add-price").addEventListener("click", () => {
  const asset = inv().assets.find(a => a.id === selectedAssetId);
  if (!asset) return;
  const date = document.getElementById("pricef-date").value;
  const price = +document.getElementById("pricef-value").value;
  if (!date || !(price >= 0)) { alert("Renseignez la date et le cours."); return; }
  const ts = tsOf(date, document.getElementById("pricef-half").value);
  asset.prices = asset.prices.filter(p => p.ts !== ts);
  asset.prices.push({ ts, price });
  saveState();
  document.getElementById("pricef-value").value = "";
  renderAssets();
});

/* ─── Import d'un fichier de cours (Excel / CSV) ─────────── */

const priceDropzone = document.getElementById("price-dropzone");
const priceFileInput = document.getElementById("price-file-input");

priceDropzone.addEventListener("click", () => priceFileInput.click());
priceDropzone.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") priceFileInput.click(); });
priceDropzone.addEventListener("dragover", e => { e.preventDefault(); priceDropzone.classList.add("drag"); });
priceDropzone.addEventListener("dragleave", () => priceDropzone.classList.remove("drag"));
priceDropzone.addEventListener("drop", e => {
  e.preventDefault(); priceDropzone.classList.remove("drag");
  if (e.dataTransfer.files.length) handlePriceFile(e.dataTransfer.files[0]);
});
priceFileInput.addEventListener("change", () => {
  if (priceFileInput.files.length) handlePriceFile(priceFileInput.files[0]);
  priceFileInput.value = "";
});

function priceStatus(msg, ok) {
  const el = document.getElementById("price-status");
  el.textContent = msg;
  el.className = "import-status " + (ok ? "ok" : "err");
}

async function handlePriceFile(file) {
  const asset = inv().assets.find(a => a.id === selectedAssetId);
  if (!asset) return;
  try {
    let rows;
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    } else {
      rows = parseCSV(await file.text());
    }
    rows = rows.filter(r => r.some(c => String(c).trim() !== ""));
    if (!rows.length) throw new Error("fichier vide");

    // Colonne date : celle qui contient le plus de dates lisibles
    const width = Math.max(...rows.map(r => r.length));
    const dateCol = bestColumn(rows, width, v => parseDate(v) != null);
    if (dateCol < 0) throw new Error("aucune colonne de dates reconnue");

    // Colonne de cours : en-tête « clôture/close/cours/prix », sinon 1re colonne numérique ≠ date
    const header = rows[0].map(c => String(c).toLowerCase());
    let priceCol = header.findIndex(h =>
      ["clôture", "cloture", "close", "cours", "prix", "price"].some(w => h.includes(w)));
    if (priceCol < 0 || priceCol === dateCol)
      priceCol = bestColumn(rows, width, (v, i) => i !== dateCol && !isNaN(parseAmount(v)) && !parseDate(v), dateCol);
    if (priceCol < 0) throw new Error("aucune colonne de cours reconnue");

    const entries = [];
    for (const r of rows) {
      const date = parseDate(r[dateCol]);
      const price = parseAmount(r[priceCol]);
      if (date && !isNaN(price)) entries.push({ ts: tsOf(date, "PM"), price }); // clôture de journée
    }
    const { added, replaced } = upsertPrices(asset, entries);
    if (!added && !replaced) throw new Error("aucune ligne date + cours lisible");
    saveState();
    priceStatus(`${added} cours ajoutés${replaced ? `, ${replaced} mis à jour` : ""} pour ${asset.name}.`, true);
    renderAssets();
  } catch (err) {
    priceStatus("Import impossible : " + err.message, false);
  }
}

function bestColumn(rows, width, test, exclude = -1) {
  let best = -1, bestScore = 0;
  for (let i = 0; i < width; i++) {
    if (i === exclude) continue;
    const score = rows.filter(r => test(r[i], i)).length;
    if (score > bestScore && score >= Math.max(2, rows.length / 3)) { best = i; bestScore = score; }
  }
  return best;
}

/** Insère ou met à jour des cours {ts, price} dans un actif. */
function upsertPrices(asset, entries) {
  let added = 0, replaced = 0;
  const byTs = new Map(asset.prices.map(p => [p.ts, p]));
  for (const e of entries) {
    if (!e.ts || !(e.price >= 0)) continue;
    if (byTs.has(e.ts)) { byTs.get(e.ts).price = e.price; replaced++; }
    else { byTs.set(e.ts, { ts: e.ts, price: e.price }); added++; }
  }
  asset.prices = [...byTs.values()];
  return { added, replaced };
}

/* ─── Cours automatiques via API gratuites ───────────────── */

const API_HELP = {
  "": "Les cours sont saisis à la main ou importés par fichier.",
  coingecko: "Identifiant CoinGecko de la crypto : bitcoin, ethereum, solana, cardano… (gratuit, sans clé). En cas de doute, tapez le nom et l'outil vous proposera les identifiants proches.",
  eodhd: "Symbole au format TICKER.BOURSE : WSP.TO (Toronto), MC.PA (Euronext Paris), AAPL.US, CW8.PA… Nécessite une clé gratuite EODHD (Portefeuille → Paramètres). Le plan gratuit couvre toutes les bourses, avec un an d'historique et 20 requêtes par jour.",
  twelvedata: "Symbole de l'action, du forex ou de la crypto, ex. AAPL, BTC/USD, EUR/USD. Nécessite une clé gratuite Twelve Data (Portefeuille → Paramètres). Attention : le plan gratuit couvre les bourses américaines, le forex et les cryptos, mais pas les places européennes (Euronext…) — pour un ETF européen, préférez l'import Excel/CSV ou la saisie manuelle."
};

function wireAssetApi(asset) {
  const srcSel = document.getElementById("api-source");
  const symInput = document.getElementById("api-symbol");
  srcSel.value = asset.source || "";
  symInput.value = asset.symbol || "";
  document.getElementById("api-help").textContent = API_HELP[srcSel.value] || "";
  srcSel.onchange = () => {
    asset.source = srcSel.value;
    document.getElementById("api-help").textContent = API_HELP[srcSel.value] || "";
    saveState();
  };
  symInput.onchange = () => { asset.symbol = symInput.value.trim(); saveState(); };
}

/* Pré-remplit le prix unitaire de l'opération avec le cours connu
   à la date/demi-journée choisie ; sinon, demande une saisie. */
function prefillTxPrice(asset, force) {
  const dateEl = document.getElementById("txf-date");
  const priceEl = document.getElementById("txf-price");
  if (!force && priceEl.value !== "") return;   // ne pas écraser une saisie en cours
  const date = dateEl.value;
  if (!date) return;
  const ts = tsOf(date, document.getElementById("txf-half").value);
  const p = priceAt(pricePoints(asset), ts);
  if (p != null) {
    priceEl.value = p;
    priceEl.placeholder = "";
    priceEl.title = "Cours enregistré le plus proche avant cette date — modifiable";
  } else {
    priceEl.value = "";
    priceEl.placeholder = "aucun cours connu — à saisir";
    priceEl.title = "";
  }
}

function wireTxForm(asset) {
  const refresh = () => prefillTxPrice(asset, true);
  document.getElementById("txf-date").onchange = refresh;
  document.getElementById("txf-half").onchange = refresh;
  const typeSel = document.getElementById("txf-type");
  typeSel.onchange = () => {
    document.getElementById("txf-paid-label").textContent =
      typeSel.value === "buy" ? "Montant réellement payé" : "Montant réellement reçu";
  };
  prefillTxPrice(asset, false);
}

document.getElementById("btn-fetch-prices").addEventListener("click", async () => {
  const asset = inv().assets.find(a => a.id === selectedAssetId);
  if (!asset) return;
  asset.source = document.getElementById("api-source").value;
  asset.symbol = document.getElementById("api-symbol").value.trim();
  saveState();
  if (!asset.source) { priceStatus("Choisissez d'abord une source de cours automatique.", false); return; }
  if (!asset.symbol) { priceStatus("Indiquez l'identifiant ou le symbole de l'actif.", false); return; }
  priceStatus("Récupération des cours…", true);
  try {
    const entries = asset.source === "coingecko" ? await fetchCoinGecko(asset)
      : asset.source === "eodhd" ? await fetchEODHD(asset)
      : await fetchTwelveData(asset);
    const { added, replaced } = upsertPrices(asset, entries);
    saveState();
    priceStatus(`${added} cours ajoutés, ${replaced} mis à jour pour ${asset.name}.`, true);
    renderAssets();
  } catch (err) {
    const msg = err instanceof TypeError
      ? "La requête n'a pas pu partir (connexion coupée, bloqueur de publicité, ou blocage CORS). Vérifiez votre connexion et vos extensions, puis réessayez."
      : err.message;
    priceStatus(msg, false);
  }
});

async function fetchCoinGecko(asset) {
  const id = asset.symbol.toLowerCase();
  const cur = asset.currency.toLowerCase();
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${encodeURIComponent(cur)}&days=365&interval=daily`;
  const res = await fetch(url);
  if (res.status === 404) {
    // L'identifiant n'existe pas → proposer les plus proches
    let hint = "";
    try {
      const s = await (await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(id)}`)).json();
      const ids = (s.coins || []).slice(0, 4).map(c => c.id);
      if (ids.length) hint = " Identifiants proches : " + ids.join(", ") + ".";
    } catch (e) { /* pas grave */ }
    throw new Error(`CoinGecko ne connaît pas « ${id} ».${hint}`);
  }
  if (res.status === 429) throw new Error("CoinGecko limite les requêtes : patientez une minute puis réessayez.");
  if (!res.ok) throw new Error("CoinGecko a répondu avec une erreur (" + res.status + ").");
  const data = await res.json();
  if (!data.prices || !data.prices.length) throw new Error("CoinGecko n'a renvoyé aucun cours pour cette devise.");
  const entries = data.prices.map(([ms, price]) => {
    const d = new Date(ms);
    return { ts: tsOf(toISO(d), d.getHours() < 12 ? "AM" : "PM"), price };
  });
  // Un point par demi-journée : le plus récent gagne
  const dedup = new Map(entries.map(e => [e.ts, e]));
  return [...dedup.values()];
}

async function fetchEODHD(asset) {
  const key = (inv().eodKey || "").trim();
  if (!key) throw new Error("Renseignez d'abord votre clé EODHD gratuite dans Portefeuille → Paramètres (inscription sur eodhd.com).");
  const base = (window.EODHD_PROXY || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("EODHD bloque les appels directs depuis un navigateur (CORS). Le propriétaire du site doit déployer le petit relais gratuit fourni (fichier worker-eodhd.js) sur Cloudflare Workers et coller son adresse dans js/config.js — mode d'emploi dans le README.");
  const url = `${base}/eod/${encodeURIComponent(asset.symbol)}?api_token=${encodeURIComponent(key)}&period=d&fmt=json`;
  const res = await fetch(url);
  if (res.status === 401 || res.status === 403)
    throw new Error("EODHD refuse la clé API (" + res.status + ") — vérifiez-la dans Portefeuille → Paramètres, ou votre quota de 20 requêtes/jour est peut-être épuisé.");
  if (res.status === 404)
    throw new Error(`EODHD ne connaît pas « ${asset.symbol} ». Format attendu : TICKER.BOURSE, ex. WSP.TO, MC.PA, AAPL.US. Cherchez le bon code sur eodhd.com.`);
  if (res.status === 402)
    throw new Error("EODHD : ces données ne sont pas incluses dans le plan gratuit.");
  if (!res.ok) throw new Error("EODHD a répondu avec une erreur (" + res.status + ").");
  const data = await res.json();
  if (!Array.isArray(data) || !data.length)
    throw new Error("EODHD n'a renvoyé aucun cours pour ce symbole.");
  return data.map(v => {
    const date = parseDate(v.date);
    const price = parseAmount(v.close ?? v.adjusted_close);
    return date && !isNaN(price) ? { ts: tsOf(date, "PM"), price } : null;
  }).filter(Boolean);
}

async function fetchTwelveData(asset) {
  const key = (inv().tdKey || "").trim();
  if (!key) throw new Error("Renseignez d'abord votre clé Twelve Data gratuite dans Portefeuille → Paramètres.");
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(asset.symbol)}&interval=1day&outputsize=500&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  let data = null;
  try { data = await res.json(); } catch (e) { /* réponse non JSON */ }
  if (data && data.status === "error") {
    let msg = data.message || "symbole ou clé invalide.";
    if (/plan|grow|pro|not available|available with/i.test(msg)) {
      msg += " → Le plan gratuit couvre les bourses américaines, le forex (EUR/USD…) et les cryptos (BTC/USD…), mais pas les places européennes comme Euronext Paris. Pour un ETF européen : import Excel/CSV, saisie manuelle, ou suivez son équivalent coté aux États-Unis.";
    } else if (/symbol/i.test(msg)) {
      msg += " → Vérifiez l'écriture du symbole, ex. AAPL, BTC/USD, EUR/USD.";
    }
    throw new Error("Twelve Data : " + msg);
  }
  if (!res.ok) throw new Error(`Twelve Data a répondu avec une erreur (${res.status}). Vérifiez le symbole et votre clé — et notez que le plan gratuit ne couvre pas les bourses européennes (Euronext…).`);
  if (!data || !Array.isArray(data.values) || !data.values.length)
    throw new Error("Twelve Data n'a renvoyé aucun cours pour ce symbole.");
  return data.values.map(v => {
    const date = parseDate(v.datetime);
    const price = parseAmount(v.close);
    return date && !isNaN(price) ? { ts: tsOf(date, "PM"), price } : null;
  }).filter(Boolean);
}

/* ─── Devise du site & premier lancement ─────────────────── */

function wireGlobalCurrency() {
  const sel = document.getElementById("global-currency");
  sel.value = state.currency || "CHF";
  sel.onchange = () => {
    state.currency = sel.value;
    inv().refCurrency = sel.value;
    saveState();
    renderRules();
    renderDashboard();
  };
}

document.getElementById("setup-ok").addEventListener("click", () => {
  const cur = document.getElementById("setup-currency").value;
  state.currency = cur;
  inv().refCurrency = cur;
  saveState();
  wireGlobalCurrency();
  document.getElementById("setup-dialog").close();
  renderDashboard();
});

/* ─── Synchronisation Google Drive ───────────────────────── */
/* Chaque utilisateur enregistre son fichier dans SON Drive via OAuth.
   Nécessite un identifiant client (gratuit) dans js/config.js — voir README. */

const GD_FILENAME = "mes-finances-donnees.json";
let gdToken = null;

function gdStatus(msg, ok) {
  const el = document.getElementById("gdrive-status");
  el.textContent = msg;
  el.className = "import-status " + (ok ? "ok" : "err");
}

function gdConfigured() {
  if (!window.GOOGLE_CLIENT_ID) {
    gdStatus("Synchronisation non configurée : le propriétaire du site doit créer un identifiant Google gratuit et le coller dans js/config.js (mode d'emploi dans le README).", false);
    return false;
  }
  if (!window.google || !google.accounts) {
    gdStatus("Le service Google ne s'est pas chargé — vérifiez votre connexion puis réessayez.", false);
    return false;
  }
  return true;
}

function gdAuth() {
  return new Promise((resolve, reject) => {
    if (gdToken) return resolve(gdToken);
    const client = google.accounts.oauth2.initTokenClient({
      client_id: window.GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (t) => {
        if (t.error) reject(new Error("Connexion Google refusée (" + t.error + ")."));
        else { gdToken = t.access_token; resolve(gdToken); }
      }
    });
    client.requestAccessToken();
  });
}

async function gdFetch(url, options = {}) {
  options.headers = { ...(options.headers || {}), Authorization: "Bearer " + gdToken };
  const res = await fetch(url, options);
  if (res.status === 401) { gdToken = null; throw new Error("Session Google expirée — cliquez à nouveau pour vous reconnecter."); }
  return res;
}

async function gdFindFile() {
  const q = encodeURIComponent(`name='${GD_FILENAME}' and trashed=false`);
  const res = await gdFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)`);
  if (!res.ok) throw new Error("Google Drive a répondu avec une erreur (" + res.status + ").");
  const data = await res.json();
  return (data.files && data.files[0]) || null;
}

document.getElementById("btn-gdrive-save").addEventListener("click", async () => {
  if (!gdConfigured()) return;
  try {
    gdStatus("Connexion à Google…", true);
    await gdAuth();
    gdStatus("Enregistrement en cours…", true);
    const existing = await gdFindFile();
    const content = JSON.stringify(state);
    let res;
    if (existing) {
      res = await gdFetch(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: content });
    } else {
      const boundary = "mfb" + Date.now();
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: GD_FILENAME, mimeType: "application/json" }) +
        `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
        content + `\r\n--${boundary}--`;
      res = await gdFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
    }
    if (!res.ok) throw new Error("l'envoi a échoué (" + res.status + ").");
    gdStatus(`Données enregistrées sur votre Drive (« ${GD_FILENAME} ») — ${state.transactions.length} transactions, ${inv().assets.length} actifs.`, true);
  } catch (err) {
    gdStatus("Enregistrement impossible : " + err.message, false);
  }
});

document.getElementById("btn-gdrive-load").addEventListener("click", async () => {
  if (!gdConfigured()) return;
  try {
    gdStatus("Connexion à Google…", true);
    await gdAuth();
    const file = await gdFindFile();
    if (!file) { gdStatus("Aucune sauvegarde trouvée sur ce compte Drive — enregistrez d'abord depuis l'appareil qui contient vos données.", false); return; }
    const res = await gdFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
    if (!res.ok) throw new Error("le téléchargement a échoué (" + res.status + ").");
    const s = await res.json();
    if (!Array.isArray(s.transactions)) throw new Error("le fichier ne ressemble pas à une sauvegarde valide.");
    if (!confirm(`Remplacer les données de cet appareil par celles du Drive (${s.transactions.length} transactions) ?`)) return;
    applyBackup(s);
    gdStatus("Données chargées depuis votre Drive.", true);
    renderRules();
    wireGlobalCurrency();
    showPage("dashboard");
  } catch (err) {
    gdStatus("Chargement impossible : " + err.message, false);
  }
});

/* ─── Démarrage ──────────────────────────────────────────── */

const today = toISO(new Date());
document.getElementById("txf-date").value = today;
document.getElementById("pricef-date").value = today;

wireGlobalCurrency();
renderDashboard();
renderInvest();
renderRules();
if (firstRun) document.getElementById("setup-dialog").showModal();
