diff --git a/script.js b/script.js
index b17f6e31864edc8f403bf9db211c7c327b72bedf..7f966472977191ba115a34627b575b21d75e6f8d 100644
--- a/script.js
+++ b/script.js
@@ -1,22 +1,645 @@
+(function(){
+  "use strict";
+  const STORAGE_KEY = "pass_j_app_v4_4";
+  const VERSION = 44;
 
-// Feedback visuel sur ajout
-function flashCard(card) {
-    card.style.transition = "background-color 1s";
-    card.style.backgroundColor = "#c8f7c5";
-    setTimeout(() => {
-        card.style.backgroundColor = "";
-    }, 1000);
-}
-
-// Ajout de badges pour chaque carte contenant "cours du"
-document.addEventListener("DOMContentLoaded", () => {
-    const cards = document.querySelectorAll(".revision-card");
-    cards.forEach(card => {
-        if (!card.querySelector(".j-badge")) {
-            const badge = document.createElement("span");
-            badge.className = "j-badge";
-            badge.innerText = "J?";
-            card.insertBefore(badge, card.firstChild);
-        }
-    });
-});
+  const pad = (n) => n.toString().padStart(2, "0");
+  const toDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
+  const parseDateKey = (s) => { const [y,m,dd] = s.split("-").map(Number); return new Date(y, m-1, dd); };
+  const isSameDay = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
+  const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const day = x.getDay(); const diff = (day===0 ? -6 : 1 - day); x.setDate(x.getDate() + diff); return x; };
+  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate()+n); return x; };
+  function todayLocal(){ const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
+
+  function uid(prefix){ return prefix + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }
+
+  const PALETTE = ["#e11d48","#ea580c","#f59e0b","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#a855f7","#14b8a6","#84cc16","#ef4444","#f97316","#facc15","#34d399","#67e8f9","#60a5fa","#c084fc","#f472b6","#10b981","#a3e635"];
+
+  let state = {
+    version: VERSION,
+    theme: "light",
+    colorMode: "border",
+    labels: [],       // {id,name,color}
+    presets: [],      // {id,name,cycles:[]}
+    sessions: [],     // {id,labelId,date,title,total,presetId}
+    reviews: [],      // {id,labelId,sessionId,baseDate,date,j,done,title}
+    ui: { view:"week", filterLabelId:"", filterPresetId:"" }
+  };
+
+  function save(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e){ alert("Erreur de sauvegarde localStorage: " + e.message); } }
+  function load(){
+    const keys = ["pass_j_app_v4_3","pass_j_app_v4_2","pass_j_app_v4_1","pass_j_app_v4"];
+    const current = localStorage.getItem(STORAGE_KEY);
+    if (current){ try { state = Object.assign(state, JSON.parse(current)); } catch(e){} return; }
+    for (const k of keys){
+      const raw = localStorage.getItem(k);
+      if (!raw) continue;
+      try {
+        const old = JSON.parse(raw);
+        state.labels = (old.labels||[]).map((l,i)=> ({...l, color: l.color || PALETTE[i % PALETTE.length]}));
+        state.presets = old.presets || [];
+        state.sessions = (old.sessions||[]).map(s => ({...s}));
+        state.reviews = old.reviews || [];
+        state.theme = old.theme || "light";
+        state.ui = old.ui || state.ui;
+        state.colorMode = old.colorMode || (state.theme==="dark" ? "border" : "fill");
+        break;
+      } catch(e){}
+    }
+    if (state.labels.length===0) state.labels.push({id: uid("lab"), name:"UE Exemple", color: PALETTE[0]});
+    if (state.presets.length===0) state.presets.push({id: uid("pre"), name:"Classique 1-3-7-14", cycles:[1,3,7,14]});
+    save();
+  }
+  function setTheme(t){ state.theme = t; document.documentElement.setAttribute("data-theme", t); save(); }
+  function applyTheme(){ document.documentElement.setAttribute("data-theme", state.theme==="dark" ? "dark" : "light"); }
+
+  function getSession(id){ return state.sessions.find(s=>s.id===id); }
+  function getLabel(id){ return state.labels.find(l=>l.id===id); }
+  function completionOfSession(sessionId){
+    const revs = state.reviews.filter(r => r.sessionId === sessionId);
+    const done = revs.filter(r => r.done).length;
+    const total = revs.length;
+    return {done, total};
+  }
+
+  function progressHue(total, done){
+    const steps = Math.max(1, total);
+    const idx = Math.min(done, steps-1);
+    return steps===1 ? 0 : Math.round(140 * (idx/(steps-1))); // 0 red -> 140 green
+  }
+  function cardStyle(total, done){
+    const h = progressHue(total, done);
+    if (state.colorMode === "border"){
+      return { bg: "var(--panel)", border: `1px solid hsla(${h},70%,45%,.55)`, text: "var(--text)" };
+    } else {
+      const tint1 = `hsla(${h},70%,45%,.10)`;
+      const tint2 = `hsla(${h},70%,45%,.14)`;
+      const fg = (state.theme === "light") ? "#0b1220" : "var(--text)";
+      return { bg: `linear-gradient(135deg, ${tint1}, ${tint2})`, border: `1px solid hsla(${h},45%,35%,.25)`, text: fg };
+    }
+  }
+
+  // Filters
+  function passesFiltersByReview(r){
+    const labelOk = !state.ui.filterLabelId || r.labelId === state.ui.filterLabelId;
+    const presetOk = !state.ui.filterPresetId || (getSession(r.sessionId)?.presetId === state.ui.filterPresetId);
+    return labelOk && presetOk;
+  }
+
+  // Add course now (J0=today)
+  function addCourseNow(title, labelId, presetId){
+    title = (title||"").trim();
+    if (!title){ alert("Titre requis."); return; }
+    if (!labelId){ alert("Choisir une étiquette."); return; }
+    const preset = state.presets.find(p=>p.id===presetId);
+    if (!preset){ alert("Preset introuvable."); return; }
+
+    const baseKey = toDateKey(todayLocal());
+    const ses = { id: uid("ses"), labelId, date: baseKey, title, total: preset.cycles.length, presetId };
+    state.sessions.push(ses);
+    preset.cycles.forEach(j => {
+      const d = toDateKey(addDays(todayLocal(), j));
+      state.reviews.push({ id: uid("rev"), labelId, sessionId: ses.id, baseDate: baseKey, date: d, j: Number(j), done:false, title });
+    });
+    save(); renderAll();
+  }
+
+  function toggleDone(id){ const r = state.reviews.find(x=>x.id===id); if (r){ r.done=!r.done; save(); renderAll(); } }
+  function deleteReview(id){
+    const r = state.reviews.find(x=>x.id===id); if (!r) return;
+    if (!confirm("Supprimer cette révision ?")) return;
+    state.reviews = state.reviews.filter(x=>x.id!==id); save(); renderAll();
+  }
+  function moveReview(id, newDateStr){
+    const r = state.reviews.find(x=>x.id===id); if (!r) return;
+    if (!newDateStr) return;
+    r.date = newDateStr; save(); renderAll();
+  }
+  function moveReviewTomorrow(id){
+    const r = state.reviews.find(x=>x.id===id); if (!r) return;
+    const d = parseDateKey(r.date);
+    const nx = toDateKey(addDays(d, 1));
+    r.date = nx; save(); renderAll();
+  }
+
+  // Export / Import
+  function downloadFile(filename, blob){
+    const url = URL.createObjectURL(blob); const a = document.createElement("a");
+    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
+    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 100);
+  }
+  function exportJson(){ const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"}); downloadFile("pass_j_agenda_export.json", blob); }
+  function exportCsv(){
+    const esc = (s)=> `"${String(s).replace(/"/g,'""')}"`;
+    const labelById = Object.fromEntries(state.labels.map(l=>[l.id,l.name]));
+    const presetById = Object.fromEntries(state.presets.map(p=>[p.id,p.name]));
+    const lines = [];
+    lines.push("type,id,label,date,j,done,session_id,base_date,title,preset");
+    state.reviews.forEach(r=> lines.push(["review", r.id, labelById[r.labelId]||"", r.date, r.j, r.done, r.sessionId, r.baseDate, r.title, presetById[getSession(r.sessionId)?.presetId||""]||""].map(esc).join(",")));
+    lines.push("");
+    lines.push("type,id,label,date,title,total,preset,color");
+    state.sessions.forEach(s=> lines.push(["session", s.id, labelById[s.labelId]||"", s.date, s.title, s.total, presetById[s.presetId]||"", getLabel(s.labelId)?.color||""].map(esc).join(",")));
+    lines.push("");
+    lines.push("type,id,name,color,cycles");
+    state.labels.forEach(l=> lines.push(["label", l.id, l.name, l.color||"", ""].map(esc).join(",")));
+    state.presets.forEach(p=> lines.push(["preset", p.id, p.name, "", p.cycles.join("/")].map(esc).join(",")));
+    const blob = new Blob([lines.join("\n")], {type:"text/csv"});
+    downloadFile("pass_j_agenda_export.csv", blob);
+  }
+  function importJson(file){
+    const reader = new FileReader();
+    reader.onload = (ev)=>{
+      try {
+        const obj = JSON.parse(ev.target.result);
+        if (!obj || typeof obj !== "object") throw new Error("Format JSON invalide.");
+        if (!confirm("Importer ces données et remplacer l'état actuel ?")) return;
+        obj.version = VERSION;
+        obj.theme = (obj.theme==="dark"?"dark":"light");
+        obj.labels = (obj.labels||[]).map((l,i)=> ({...l, color: l.color || PALETTE[i % PALETTE.length]}));
+        obj.presets = Array.isArray(obj.presets)?obj.presets:[];
+        obj.sessions = Array.isArray(obj.sessions)?obj.sessions:[];
+        obj.reviews = Array.isArray(obj.reviews)?obj.reviews:[];
+        obj.ui = obj.ui || {view:"week", filterLabelId:"", filterPresetId:""};
+        obj.colorMode = obj.colorMode || (obj.theme==="dark" ? "border" : "fill");
+        state = obj; save(); applyTheme(); fillSelects(); renderAll();
+        alert("Import effectué.");
+      } catch(e){ alert("Erreur d'import: " + e.message); }
+    };
+    reader.readAsText(file);
+  }
+  function quickBackup(){
+    const ts = new Date();
+    const name = `backup_pass_j_${ts.getFullYear()}-${pad(ts.getMonth()+1)}-${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}.json`;
+    const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
+    downloadFile(name, blob);
+  }
+  function resetAll(){
+    if (!confirm("Réinitialiser toutes les données ?")) return;
+    localStorage.removeItem(STORAGE_KEY);
+    state = { version: VERSION, theme:"light", colorMode:"border", labels:[], presets:[], sessions:[], reviews:[], ui:{view:"week", filterLabelId:"", filterPresetId:""} };
+    state.labels.push({id: uid("lab"), name:"UE Exemple", color: PALETTE[0]});
+    state.presets.push({id: uid("pre"), name:"Classique 1-3-7-14", cycles:[1,3,7,14]});
+    save(); applyTheme(); fillSelects(); renderAll();
+  }
+
+  // UI refs
+  const elTabWeek = document.getElementById("tabWeek");
+  const elTabMonth = document.getElementById("tabMonth");
+  const elTabList = document.getElementById("tabList");
+  const elViewWeek = document.getElementById("viewWeek");
+  const elViewMonth = document.getElementById("viewMonth");
+  const elViewList = document.getElementById("viewList");
+  const elPrev = document.getElementById("prevPeriod");
+  const elNext = document.getElementById("nextPeriod");
+  const elPeriodLabel = document.getElementById("periodLabel");
+  const elToday = document.getElementById("todayBtn");
+  const elThemeBtn = document.getElementById("themeBtn");
+
+  const elFilterLabel = document.getElementById("filterLabel");
+  const elFilterPreset = document.getElementById("filterPreset");
+  const elColorMode = document.getElementById("colorMode");
+  const elClearFilters = document.getElementById("clearFilters");
+
+  const elOpenDrawer = document.getElementById("openDrawer");
+  const elDrawer = document.getElementById("drawer");
+  const elDrawerBackdrop = document.getElementById("drawerBackdrop");
+  const elCloseDrawer = document.getElementById("closeDrawer");
+
+  const elPresetName = document.getElementById("presetName");
+  const elPresetCycles = document.getElementById("presetCycles");
+  const elAddPreset = document.getElementById("addPreset");
+  const elPresetsList = document.getElementById("presetsList");
+
+  const elLabelName = document.getElementById("labelName");
+  const elAddLabel = document.getElementById("addLabel");
+  const elLabelsList = document.getElementById("labelsList");
+  const elPaletteCreate = document.getElementById("paletteCreate");
+
+  const elCourseTitle = document.getElementById("courseTitle");
+  const elCourseLabel = document.getElementById("courseLabel");
+  const elCoursePreset = document.getElementById("coursePreset");
+  const elAddCourse = document.getElementById("addCourse");
+
+  // Global floating menu state
+  const menu = document.getElementById("menu");
+  const miDelete = document.getElementById("miDelete");
+  const miTomorrow = document.getElementById("miTomorrow");
+  const miDate = document.getElementById("miDate");
+  const miMove = document.getElementById("miMove");
+  let currentReviewId = null;
+
+  // Navigation state
+  let weekStart = mondayOf(todayLocal());
+  let monthRef = new Date(todayLocal().getFullYear(), todayLocal().getMonth(), 1);
+
+  function setView(v){
+    state.ui.view = v; save();
+    elTabWeek.classList.toggle("active", v==="week");
+    elTabMonth.classList.toggle("active", v==="month");
+    elTabList.classList.toggle("active", v==="list");
+    elViewWeek.classList.toggle("hidden", v!=="week");
+    elViewMonth.classList.toggle("hidden", v!=="month");
+    elViewList.classList.toggle("hidden", v!=="list");
+    renderAll();
+  }
+
+  // Fill selects
+  function fillSelects(){
+    elFilterLabel.innerHTML = '<option value="">Toutes matières</option>';
+    state.labels.forEach(l => {
+      const opt = document.createElement("option");
+      opt.value = l.id; opt.textContent = l.name;
+      if (state.ui.filterLabelId === l.id) opt.selected = true;
+      elFilterLabel.appendChild(opt);
+    });
+    elFilterPreset.innerHTML = '<option value="">Tous presets</option>';
+    state.presets.forEach(p => {
+      const opt = document.createElement("option");
+      opt.value = p.id; opt.textContent = p.name;
+      if (state.ui.filterPresetId === p.id) opt.selected = true;
+      elFilterPreset.appendChild(opt);
+    });
+
+    elColorMode.value = state.colorMode;
+
+    elCourseLabel.innerHTML = "";
+    state.labels.forEach(l => {
+      const o = document.createElement("option");
+      o.value = l.id; o.textContent = l.name;
+      elCourseLabel.appendChild(o);
+    });
+    elCoursePreset.innerHTML = "";
+    state.presets.forEach(p => {
+      const o = document.createElement("option");
+      o.value = p.id; o.textContent = `${p.name} (${p.cycles.join(",")})`;
+      elCoursePreset.appendChild(o);
+    });
+
+    renderLabels(); renderPresets();
+  }
+
+  // Palette UI for creating a label
+  let selectedCreateColor = "#e11d48";
+  function renderPalette(container, onSelect, selected){
+    container.innerHTML = "";
+    const PAL = ['#e11d48', '#ea580c', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#a855f7', '#14b8a6', '#84cc16', '#ef4444', '#f97316', '#facc15', '#34d399', '#67e8f9', '#60a5fa', '#c084fc', '#f472b6', '#10b981', '#a3e635'];
+    PAL.forEach(c => {
+      const sw = document.createElement("div"); sw.className = "swatch"; sw.style.background = c;
+      if (c===selected) sw.classList.add("selected");
+      sw.addEventListener("click", ()=> { onSelect(c); renderAll(); });
+      container.appendChild(sw);
+    });
+  }
+
+  function renderLabels(){
+    elLabelsList.innerHTML = "";
+    state.labels.forEach(l => {
+      const row = document.createElement("div");
+      row.className = "task";
+      const leftbar = document.createElement("div");
+      leftbar.className = "leftbar";
+      leftbar.style.background = l.color || "#888";
+      row.appendChild(leftbar);
+      const fake = document.createElement("input");
+      fake.type = "checkbox";
+      fake.className = "invisible";
+      row.appendChild(fake);
+      const content = document.createElement("div");
+      content.className = "lbl";
+      const labelRow = document.createElement("div");
+      labelRow.className = "label-row";
+      const colorBox = document.createElement("span");
+      colorBox.className = "label-color-box";
+      colorBox.style.background = l.color || "#888";
+      labelRow.appendChild(colorBox);
+      const strong = document.createElement("strong");
+      strong.textContent = l.name;
+      labelRow.appendChild(strong);
+      content.appendChild(labelRow);
+      row.appendChild(content);
+      const spacer = document.createElement("div");
+      spacer.textContent = "";
+      row.appendChild(spacer);
+      const colorBtn = document.createElement("button");
+      colorBtn.className = "btn";
+      colorBtn.textContent = "Couleur";
+      colorBtn.addEventListener("click", ()=> {
+        const palette = document.createElement("div");
+        palette.className = "palette";
+        row.appendChild(palette);
+        renderPalette(palette, (c)=> { l.color=c; save(); renderAll(); }, l.color);
+      });
+      const del = document.createElement("button");
+      del.className = "btn";
+      del.textContent = "Supprimer";
+      del.addEventListener("click", ()=> { if (!confirm("Supprimer cette étiquette ?")) return; state.labels = state.labels.filter(x=>x.id!==l.id); save(); fillSelects(); renderAll(); });
+      row.appendChild(colorBtn);
+      row.appendChild(del);
+      elLabelsList.appendChild(row);
+    });
+  }
+  function renderPresets(){
+    elPresetsList.innerHTML = "";
+    state.presets.forEach(p => {
+      const row = document.createElement("div");
+      row.className = "task";
+      const fake = document.createElement("input");
+      fake.type = "checkbox";
+      fake.className = "invisible";
+      row.appendChild(fake);
+      const content = document.createElement("div");
+      content.className = "lbl";
+      const strong = document.createElement("strong");
+      strong.textContent = p.name;
+      content.appendChild(strong);
+      content.append(` — cycles: ${p.cycles.join(", ")}`);
+      row.appendChild(content);
+      const spacer = document.createElement("div");
+      spacer.textContent = "";
+      row.appendChild(spacer);
+      const del = document.createElement("button");
+      del.className = "btn";
+      del.textContent = "Supprimer";
+      del.addEventListener("click", ()=> { if (!confirm("Supprimer ce preset ?")) return; state.presets = state.presets.filter(x=>x.id!==p.id); save(); fillSelects(); renderAll(); });
+      row.appendChild(del);
+      elPresetsList.appendChild(row);
+    });
+  }
+
+
+
+  function dayLoadLevel(count){
+    if (count <= 3) return {level:"faible", pct: Math.min(100, count*30), color:"var(--ok)"};
+    if (count <= 7) return {level:"moyenne", pct: Math.min(100, 45 + (count-3)*12), color:"var(--warn)"};
+    return {level:"forte", pct: 100, color:"var(--err)"};
+  }
+
+  function reviewRow(r){
+    const row = document.createElement("div"); row.className = "task";
+    const sess = getSession(r.sessionId) || {total:1};
+    const comp = completionOfSession(r.sessionId);
+    const style = cardStyle(sess.total || comp.total || 1, comp.done);
+    row.style.background = style.bg;
+    row.style.border = style.border;
+    row.style.color = style.text;
+
+    const lblObj = getLabel(r.labelId);
+    const labelColor = lblObj?.color || "#888";
+    const leftbar = document.createElement("div"); leftbar.className="leftbar"; leftbar.style.background=labelColor;
+    row.appendChild(leftbar);
+
+    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!r.done;
+    cb.addEventListener("change", ()=> toggleDone(r.id));
+
+    const lbl = document.createElement("div"); lbl.className = "lbl";
+    const labelName = lblObj?.name || "Matière";
+    lbl.textContent = `${labelName} — ${r.title} (cours du ${r.baseDate})`;
+
+    const j = document.createElement("div"); j.className = "j"; j.textContent = "J" + r.j;
+
+    const menuBtn = document.createElement("button"); menuBtn.className="btn menu-btn"; menuBtn.setAttribute("aria-label","Options"); menuBtn.textContent = "⋯";
+    menuBtn.addEventListener("click", (e)=> openMenuForReview(r.id, e));
+
+    row.appendChild(cb); row.appendChild(lbl); row.appendChild(j); row.appendChild(menuBtn);
+    return row;
+  }
+
+  function openMenuForReview(reviewId, evt){
+    currentReviewId = reviewId;
+    const rect = evt.target.getBoundingClientRect();
+    const vw = window.innerWidth, vh = window.innerHeight;
+    const menu = document.getElementById("menu");
+    menu.style.display = "block"; // allow offsetWidth to be computed
+    const mw = menu.offsetWidth || 260;
+    const mh = menu.offsetHeight || 160;
+    const x = Math.min(rect.left, vw - mw - 12);
+    const y = Math.min(rect.bottom + 6, vh - mh - 12);
+    menu.style.left = x + "px";
+    menu.style.top = y + "px";
+    menu.classList.add("open");
+    menu.setAttribute("aria-hidden","false");
+    document.addEventListener("click", onDocClickOnce, {capture:true, once:true});
+  }
+  function onDocClickOnce(ev){
+    const menu = document.getElementById("menu");
+    if (!menu.contains(ev.target)) closeMenu();
+  }
+  function closeMenu(){
+    const menu = document.getElementById("menu");
+    menu.classList.remove("open"); menu.setAttribute("aria-hidden","true");
+    menu.style.display = "none";
+  }
+  miDelete.addEventListener("click", ()=> { if (currentReviewId) deleteReview(currentReviewId); closeMenu(); });
+  miTomorrow.addEventListener("click", ()=> { if (currentReviewId) moveReviewTomorrow(currentReviewId); closeMenu(); });
+  miMove.addEventListener("click", ()=> { if (currentReviewId && miDate.value) moveReview(currentReviewId, miDate.value); closeMenu(); });
+
+  function renderWeek(){
+    elViewWeek.innerHTML = "";
+    const today = todayLocal();
+    const dowNames = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
+    const map = new Map();
+    state.reviews.filter(passesFiltersByReview).forEach(r => {
+      const arr = map.get(r.date) || []; arr.push(r); map.set(r.date, arr);
+    });
+
+    for (let i=0; i<7; i++){
+      const d = addDays(weekStart, i);
+      const key = toDateKey(d);
+      const reviews = (map.get(key) || []).sort((a,b)=> a.j-b.j || a.baseDate.localeCompare(b.baseDate));
+
+      const card = document.createElement("div");
+      card.className = "day";
+      if (isSameDay(d, today)) card.classList.add("today");
+
+      const head = document.createElement("div"); head.className = "head";
+      const left = document.createElement("div");
+      left.innerHTML = `<div class="dow">${dowNames[i]}</div><div class="date">${pad(d.getDate())}/${pad(d.getMonth()+1)}</div>`;
+      const right = document.createElement("div"); right.style.minWidth = "40%";
+      const lb = document.createElement("div"); lb.className = "loadbar";
+      const fill = document.createElement("div"); fill.className = "fill";
+      const info = dayLoadLevel(reviews.length);
+      fill.style.width = info.pct + "%"; fill.style.background = (info.color);
+      lb.appendChild(fill); right.appendChild(lb);
+      head.appendChild(left); head.appendChild(right);
+      card.appendChild(head);
+
+      const loadtxt = document.createElement("div"); loadtxt.className = "loadtxt";
+      loadtxt.textContent = `${reviews.length} révision(s) — charge ${info.level}`;
+      card.appendChild(loadtxt);
+
+      const list = document.createElement("div"); list.className = "list";
+      reviews.forEach(r => list.appendChild(reviewRow(r)));
+      card.appendChild(list);
+
+      elViewWeek.appendChild(card);
+    }
+    elPeriodLabel.textContent = weekLabelText(weekStart);
+  }
+
+  function weekLabelText(start){
+    const end = addDays(start, 6);
+    const fmt = (d) => `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
+    return `${fmt(start)} → ${fmt(end)}`;
+  }
+
+  function renderMonth(){
+    elViewMonth.innerHTML = "";
+    const today = todayLocal();
+    const first = new Date(monthRef.getFullYear(), monthRef.getMonth(), 1);
+    const start = mondayOf(first);
+    const cells = Array.from({length: 42}, (_,i)=> addDays(start,i));
+
+    const map = new Map();
+    state.reviews.filter(passesFiltersByReview).forEach(r => {
+      const arr = map.get(r.date) || []; arr.push(r); map.set(r.date, arr);
+    });
+
+    cells.forEach((d,i)=>{
+      const key = toDateKey(d);
+      const reviews = (map.get(key) || []).sort((a,b)=> a.j-b.j || a.baseDate.localeCompare(b.baseDate));
+      const card = document.createElement("div"); card.className = "day";
+      if (isSameDay(d, today)) card.classList.add("today");
+
+      const head = document.createElement("div"); head.className = "head";
+      const left = document.createElement("div");
+      left.innerHTML = `<div class="dow">${["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"][d.getDay()===0?6:d.getDay()-1]}</div><div class="date">${pad(d.getDate())}/${pad(d.getMonth()+1)}</div>`;
+      const right = document.createElement("div"); right.style.minWidth = "40%";
+      const lb = document.createElement("div"); lb.className = "loadbar";
+      const fill = document.createElement("div"); fill.className = "fill";
+      const info = dayLoadLevel(reviews.length);
+      fill.style.width = info.pct + "%"; fill.style.background = (info.color);
+      lb.appendChild(fill); right.appendChild(lb);
+      head.appendChild(left); head.appendChild(right);
+      card.appendChild(head);
+
+      const loadtxt = document.createElement("div"); loadtxt.className = "loadtxt";
+      loadtxt.textContent = `${reviews.length} révision(s) — ${info.level}`;
+      card.appendChild(loadtxt);
+
+      const list = document.createElement("div"); list.className = "list";
+      reviews.slice(0,3).forEach(r => list.appendChild(reviewRow(r)));
+      if (reviews.length > 3){
+        const more = document.createElement("div"); more.className="muted"; more.style.fontSize="12px";
+        more.textContent = `+ ${reviews.length-3} autre(s)`;
+        list.appendChild(more);
+      }
+      card.appendChild(list);
+
+      elViewMonth.appendChild(card);
+    });
+
+    const label = `${pad(first.getMonth()+1)}/${first.getFullYear()}`;
+    elPeriodLabel.textContent = label;
+  }
+
+  function renderList(){
+    elViewList.innerHTML = "";
+    const todayKey = toDateKey(todayLocal());
+    const upcoming = state.reviews
+      .filter(passesFiltersByReview)
+      .sort((a,b)=> a.date.localeCompare(b.date) || a.j-b.j);
+
+    let lastDate = "";
+    upcoming.forEach(r => {
+      if (r.date !== lastDate){
+        const h = document.createElement("div");
+        h.className = "badge";
+        const tag = (r.date===todayKey) ? "Aujourd'hui" : r.date;
+        h.textContent = tag;
+        elViewList.appendChild(h);
+        lastDate = r.date;
+      }
+      elViewList.appendChild(reviewRow(r));
+    });
+
+    elPeriodLabel.textContent = "Fil chronologique";
+  }
+
+  function renderAll(){
+    applyTheme();
+    fillSelects();
+    renderPalette(elPaletteCreate, (c)=> { selectedCreateColor = c; }, selectedCreateColor);
+    if (state.ui.view === "week") renderWeek();
+    else if (state.ui.view === "month") renderMonth();
+    else renderList();
+  }
+
+  // Events
+  document.getElementById("prevPeriod").addEventListener("click", ()=> {
+    if (state.ui.view==="week"){ weekStart = addDays(weekStart, -7); renderWeek(); }
+    else if (state.ui.view==="month"){ monthRef = new Date(monthRef.getFullYear(), monthRef.getMonth()-1, 1); renderMonth(); }
+  });
+  document.getElementById("nextPeriod").addEventListener("click", ()=> {
+    if (state.ui.view==="week"){ weekStart = addDays(weekStart, 7); renderWeek(); }
+    else if (state.ui.view==="month"){ monthRef = new Date(monthRef.getFullYear(), monthRef.getMonth()+1, 1); renderMonth(); }
+  });
+  document.getElementById("todayBtn").addEventListener("click", ()=> {
+    weekStart = mondayOf(todayLocal());
+    monthRef = new Date(todayLocal().getFullYear(), todayLocal().getMonth(), 1);
+    renderAll();
+  });
+
+  document.getElementById("tabWeek").addEventListener("click", ()=> setView("week"));
+  document.getElementById("tabMonth").addEventListener("click", ()=> setView("month"));
+  document.getElementById("tabList").addEventListener("click", ()=> setView("list"));
+  document.getElementById("themeBtn").addEventListener("click", ()=> setTheme(state.theme==="light"?"dark":"light"));
+
+  elFilterLabel.addEventListener("change", ()=> { state.ui.filterLabelId = elFilterLabel.value; save(); renderAll(); });
+  elFilterPreset.addEventListener("change", ()=> { state.ui.filterPresetId = elFilterPreset.value; save(); renderAll(); });
+  elColorMode.addEventListener("change", ()=> { state.colorMode = elColorMode.value; save(); renderAll(); });
+  document.getElementById("clearFilters").addEventListener("click", ()=> { state.ui.filterLabelId=""; state.ui.filterPresetId=""; save(); renderAll(); });
+
+  function openDrawer(){ document.getElementById("drawer").classList.add("open"); document.getElementById("drawerBackdrop").classList.add("open"); }
+  function closeDrawer(){ document.getElementById("drawer").classList.remove("open"); document.getElementById("drawerBackdrop").classList.remove("open"); }
+  document.getElementById("openDrawer").addEventListener("click", openDrawer);
+  document.getElementById("closeDrawer").addEventListener("click", closeDrawer);
+  document.getElementById("drawerBackdrop").addEventListener("click", closeDrawer);
+  document.addEventListener("keydown", (e)=>{
+    if (e.key==="Escape") { closeDrawer(); const m=document.getElementById("menu"); if(m) {m.classList.remove("open"); m.style.display="none";} }
+    else if (e.key==="ArrowLeft"){ if (state.ui.view==="week"){ weekStart = addDays(weekStart, -7); renderWeek(); } else if (state.ui.view==="month"){ monthRef = new Date(monthRef.getFullYear(), monthRef.getMonth()-1, 1); renderMonth(); } }
+    else if (e.key==="ArrowRight"){ if (state.ui.view==="week"){ weekStart = addDays(weekStart, 7); renderWeek(); } else if (state.ui.view==="month"){ monthRef = new Date(monthRef.getFullYear(), monthRef.getMonth()+1, 1); renderMonth(); } }
+    else if (e.key==="1"){ setView("week"); } else if (e.key==="2"){ setView("month"); } else if (e.key==="3"){ setView("list"); }
+  });
+
+  // Add preset/label/course
+  document.getElementById("addPreset").addEventListener("click", ()=> {
+    const name = elPresetName.value?.trim();
+    const cycles = elPresetCycles.value.split(",").map(s=>Number(s.trim())).filter(n=>!isNaN(n)&&n>0);
+    if (!name || cycles.length===0){ alert("Nom et cycles requis."); return; }
+    state.presets.push({id: uid("pre"), name, cycles: cycles.sort((a,b)=>a-b)});
+    save(); fillSelects();
+    elPresetName.value=""; elPresetCycles.value="";
+  });
+
+  document.getElementById("addLabel").addEventListener("click", ()=> {
+    const name = elLabelName.value?.trim();
+    if (!name){ alert("Nom d'étiquette requis."); return; }
+    if (state.labels.some(l=>l.name.toLowerCase()===name.toLowerCase())){ alert("Cette étiquette existe déjà."); return; }
+    state.labels.push({id: uid("lab"), name, color: selectedCreateColor});
+    save(); elLabelName.value=""; renderAll();
+  });
+
+  document.getElementById("addCourse").addEventListener("click", ()=> {
+    const title = elCourseTitle.value;
+    const labelId = elCourseLabel.value;
+    const presetId = elCoursePreset.value;
+    addCourseNow(title, labelId, presetId);
+    elCourseTitle.value = "";
+  });
+
+  document.getElementById("exportJson").addEventListener("click", exportJson);
+  document.getElementById("exportCsv").addEventListener("click", exportCsv);
+  document.getElementById("importBtn").addEventListener("click", ()=> {
+    const f = document.getElementById("importFile").files?.[0];
+    if (!f) { alert("Choisir un fichier JSON."); return; }
+    importJson(f);
+    document.getElementById("importFile").value = "";
+  });
+  document.getElementById("backupBtn").addEventListener("click", quickBackup);
+  document.getElementById("resetBtn").addEventListener("click", resetAll);
+
+  // Init
+  load(); setView(state.ui.view);
+
+
+})();
