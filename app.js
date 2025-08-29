// ===== Configuration =====
const CONFIG = {
  APPS_SCRIPT_LIST_URL: "https://script.google.com/macros/s/AKfycby7jNNklK8ADkb-vzLu-ERuybad8cnGVJOvXS24DBbCnCnSzLqITIlz-mefXbEBno2v0g/exec?mode=list",
  SHEET_ID: "1HoLTXsFVLIF9Q1dNLCK5aoOgQ8nECepHK4OmveNezzc",
  SHEET_NAME: "영어 회화 공부",
  VOICE_LANG: "en-US",
  VOICE_RATE: parseFloat(localStorage.getItem("rate") || "0.85"),
};

// ===== Utilities =====
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const state = {
  items: [],
  filtered: [],
  selectedTags: new Set(),
  srs: JSON.parse(localStorage.getItem("srs") || "{}"),
  starred: JSON.parse(localStorage.getItem("starred") || "{}"),
};

function saveLocal() {
  localStorage.setItem("srs", JSON.stringify(state.srs));
  localStorage.setItem("starred", JSON.stringify(state.starred));
  localStorage.setItem("rate", String(CONFIG.VOICE_RATE));
}

// ===== Data fetching =====
async function fetchFromAppsScript() {
  const url = CONFIG.APPS_SCRIPT_LIST_URL;
  if (!url || url.startsWith("REPLACE_WITH")) throw new Error("Please set CONFIG.APPS_SCRIPT_LIST_URL in app.js");
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error("Fetch failed: " + res.status);
  const data = await res.json(); // expects { ok:true, items:[...] }
  if (!data.ok || !Array.isArray(data.items)) throw new Error("Bad payload shape");
  return data.items;
}

async function fetchFromGViz() {
  const id = CONFIG.SHEET_ID;
  const sheet = CONFIG.SHEET_NAME;
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheet)}`;
  const text = await (await fetch(url)).text();
  const json = JSON.parse(text.replace(/^[^{]+/, "").replace(/;?\s*$/, ""));
  const cols = json.table.cols.map(c => c.label);
  const items = json.table.rows.map(r => {
    const obj = {};
    r.c.forEach((cell, i) => { obj[cols[i]] = cell ? cell.v : ""; });
    return normalizeRow(obj);
  });
  return items;
}

// ===== Normalization (patched) =====
function toBreakdownArray(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  const lines = String(input).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return lines.map(line => {
    // Try to parse "part → meaning — note" (supports '->' and '--' fallbacks)
    const arr = line.split(/→|->/);
    if (arr.length >= 2) {
      const part = arr.shift().trim();
      const rest = arr.join('→').trim();
      const [meaning, noteRaw] = rest.split(/—|--/);
      const meaning_ko = (meaning || '').trim();
      const note = (noteRaw || '').trim();
      const obj = { part, meaning_ko };
      if (note) obj.note = note;
      return obj;
    }
    return { text: line };
  });
}

function buildExamples(enStr, koStr) {
  const ens = enStr ? enStr.split(/\r?\n/).map(s => s.replace(/^•\s*/, "").trim()).filter(Boolean) : [];
  const kos = koStr ? koStr.split(/\r?\n/).map(s => s.replace(/^•\s*/, "").trim()).filter(Boolean) : [];
  const out = [];
  const n = Math.max(ens.length, kos.length);
  for (let i=0;i<n;i++) out.push({ en: ens[i] || "", ko: kos[i] || "" });
  return out;
}

function normalizeRow(obj) {
  // Prefer raw_json, but keep any already‑normalized arrays from obj
  let base = {};
  if (obj.raw_json) {
    try { base = typeof obj.raw_json === "string" ? JSON.parse(obj.raw_json) : obj.raw_json; } catch {}
  }

  // tags can be array or comma‑string
  const tagsSrc = obj.tags ?? base.tags ?? [];
  const tags = Array.isArray(tagsSrc) ? tagsSrc : String(tagsSrc).split(",").map(s=>s.trim()).filter(Boolean);

  // breakdown: accept array from obj/base, otherwise parse string
  let breakdown;
  if (Array.isArray(obj.breakdown)) breakdown = obj.breakdown;
  else if (Array.isArray(base.breakdown)) breakdown = base.breakdown;
  else breakdown = toBreakdownArray(obj.breakdown || base.breakdown || "");

  // examples: accept array from obj/base, otherwise build from columns
  let examples;
  if (Array.isArray(obj.examples)) examples = obj.examples;
  else if (Array.isArray(base.examples)) examples = base.examples;
  else examples = buildExamples(obj.examples_en || "", obj.examples_ko || "");

  return {
    phrase: obj.phrase ?? base.phrase ?? "",
    translation_ko: obj.translation_ko ?? base.translation_ko ?? "",
    register: obj.register ?? base.register ?? "",
    category: obj.category ?? base.category ?? "",
    tags,
    breakdown,
    examples,
    analysis_md: obj.analysis_md ?? base.analysis_md ?? "",
    timestamp: obj.timestamp ?? obj.created_at ?? base.timestamp ?? "",
    id: obj.id ?? obj.row ?? base.id ?? ""
  };
}

// ===== Rendering =====
function render(items) {
  const cards = $("#cards");
  cards.innerHTML = "";
  const tmpl = $("#cardTmpl");
  items.forEach((it, idx) => {
    const node = tmpl.content.cloneNode(true);
    $(".phrase", node).textContent = it.phrase;
    $(".translation", node).textContent = it.translation_ko;
    $(".register", node).textContent = it.register || "—";
    $(".category", node).textContent = it.category || "—";

    const tagsWrap = $(".tags", node);
    (it.tags || []).forEach(t => {
      const span = document.createElement("span");
      span.className = "chip";
      span.textContent = t;
      tagsWrap.appendChild(span);
    });

    const breakdown = $(".breakdown", node);
    (it.breakdown || []).forEach(b => {
      const li = document.createElement("li");
      if (b.part) {
        li.innerHTML = `<strong>${esc(b.part)}</strong> → ${esc(b.meaning_ko || "")}${b.note ? ` — ${esc(b.note)}` : ""}`;
      } else {
        li.textContent = b.text || "";
      }
      breakdown.appendChild(li);
    });

    const examples = $(".examples", node);
    (it.examples || []).forEach(ex => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="ex-en">${esc(ex.en)}</span> — <span class="ex-ko">${esc(ex.ko)}</span>`;
      examples.appendChild(li);
    });

    const analysis = $(".analysis", node);
    if (it.analysis_md && it.analysis_md.trim() && !/^\(사람이\s*읽기\s*좋은\s*전체\s*분석\s*본문\)$/u.test(it.analysis_md.trim())) {
      analysis.textContent = it.analysis_md;
    } else {
      analysis.remove(); // hide placeholder
    }

    // actions
    $(".speak", node).addEventListener("click", () => speak(it.phrase));
    const starBtn = $(".star", node);
    toggleStarVisual(starBtn, !!state.starred[it.phrase]);
    starBtn.addEventListener("click", () => {
      state.starred[it.phrase] = !state.starred[it.phrase];
      if (!state.starred[it.phrase]) delete state.starred[it.phrase];
      toggleStarVisual(starBtn, !!state.starred[it.phrase]);
      saveLocal();
    });
    $(".copy", node).addEventListener("click", () => {
      const text = JSON.stringify(it, null, 2);
      navigator.clipboard?.writeText(text);
      toast("Copied JSON");
    });

    // review buttons
    $(".again", node).addEventListener("click", () => review(it, false));
    $(".good", node).addEventListener("click", () => review(it, true));

    cards.appendChild(node);
    if (idx === 0 && $("#autoSpeak").checked) speak(it.phrase);
  });
}

function toggleStarVisual(btn, on) { btn.textContent = on ? "★" : "☆"; }

function toast(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.position = "fixed";
  el.style.left = "50%";
  el.style.bottom = "24px";
  el.style.transform = "translateX(-50%)";
  el.style.background = "#0b6cff";
  el.style.color = "#fff";
  el.style.padding = "8px 12px";
  el.style.borderRadius = "10px";
  el.style.boxShadow = "0 6px 18px rgba(0,0,0,.2)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

// ===== Filters/Search =====
function allTags(items) {
  const set = new Set();
  items.forEach(it => (it.tags || []).forEach(t => set.add(t)));
  return Array.from(set).sort();
}

function renderTags(items) {
  const bar = $("#tagBar");
  bar.innerHTML = "";
  const makeChip = (txt) => {
    const span = document.createElement("span");
    span.className = "chip";
    span.textContent = txt;
    span.addEventListener("click", () => {
      if (txt === "All") state.selectedTags.clear();
      else {
        if (state.selectedTags.has(txt)) state.selectedTags.delete(txt);
        else state.selectedTags.add(txt);
      }
      updateFilter();
      render(state.filtered);
      renderDueInfo();
      updateChipActiveStates();
    });
    return span;
  };
  bar.appendChild(makeChip("All"));
  allTags(items).forEach(t => bar.appendChild(makeChip(t)));
  updateChipActiveStates();
}

function updateChipActiveStates() {
  $$("#tagBar .chip").forEach(ch => {
    const t = ch.textContent;
    if (t === "All") ch.classList.toggle("active", state.selectedTags.size === 0);
    else ch.classList.toggle("active", state.selectedTags.has(t));
  });
}

function updateFilter() {
  const q = $("#searchInput").value.toLowerCase().trim();
  state.filtered = state.items.filter(it => {
    const matchesQ = !q || [it.phrase, it.translation_ko, it.register, it.category, ...(it.tags||[])]
      .filter(Boolean).some(s => s.toLowerCase().includes(q));
    const matchesTag = state.selectedTags.size === 0 ||
      (it.tags || []).some(t => state.selectedTags.has(t));
    return matchesQ && matchesTag;
  });
}

// ===== Voice =====
function speak(text) {
  if (!("speechSynthesis" in window)) return toast("TTS not supported");
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = CONFIG.VOICE_LANG;
  u.rate = CONFIG.VOICE_RATE;
  window.speechSynthesis.speak(u);
}

// ===== SRS (Leitner) =====
const BOX_INTERVALS = [0, 1, 3, 7, 14, 30];
function review(it, good) {
  const now = Date.now();
  const rec = state.srs[it.phrase] || { box: 1, due: now };
  if (good) rec.box = Math.min(5, rec.box + 1);
  else rec.box = 1;
  const days = BOX_INTERVALS[rec.box];
  rec.due = now + days * 86400000;
  state.srs[it.phrase] = rec;
  saveLocal();
  renderDueInfo();
  toast(good ? "Scheduled ✅" : "Reset 🔁");
}

function dueItems() {
  const now = Date.now();
  return state.filtered.filter(it => {
    const rec = state.srs[it.phrase];
    return !rec || (rec && rec.due <= now);
  });
}

function renderDueInfo() {
  const n = dueItems().length;
  $("#dueInfo").textContent = `${n} due`;
}

// ===== PWA install prompt =====
let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("#installBtn").style.display = "inline-block";
});
$("#installBtn").addEventListener("click", async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("#installBtn").style.display = "none";
  }
});

// ===== Init =====
async function init() {
  $("#rateInput").value = CONFIG.VOICE_RATE.toFixed(2);
  $("#rateVal").textContent = `${CONFIG.VOICE_RATE.toFixed(2)}×`;
  $("#rateInput").addEventListener("input", (e) => {
    CONFIG.VOICE_RATE = parseFloat(e.target.value);
    $("#rateVal").textContent = `${CONFIG.VOICE_RATE.toFixed(2)}×`;
    saveLocal();
  });

  $("#searchInput").addEventListener("input", () => {
    updateFilter();
    render(state.filtered);
    renderDueInfo();
  });

  $("#studyBtn").addEventListener("click", () => {
    const list = dueItems();
    if (!list.length) return toast("No items due");
    const first = list[0];
    const el = Array.from($$("#cards .card")).find(c => $(".phrase", c).textContent === first.phrase);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    if ($("#autoSpeak").checked) speak(first.phrase);
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }

  try {
    let items;
    try {
      items = await fetchFromAppsScript();
      items = items.map(normalizeRow);
    } catch (e) {
      console.warn("Apps Script fetch failed, trying GViz…", e);
      items = await fetchFromGViz();
    }
    state.items = items;
    updateFilter();
    renderTags(state.items);
    render(state.filtered);
    renderDueInfo();
    localStorage.setItem("cachedItems", JSON.stringify(state.items));
  } catch (err) {
    console.error(err);
    const cached = localStorage.getItem("cachedItems");
    if (cached) {
      state.items = JSON.parse(cached);
      updateFilter();
      renderTags(state.items);
      render(state.filtered);
      renderDueInfo();
      toast("Offline cache used");
    } else {
      $("#cards").innerHTML = "<p style='padding:16px'>Failed to load data. Check configuration.</p>";
    }
  }
}

document.addEventListener("DOMContentLoaded", init);
