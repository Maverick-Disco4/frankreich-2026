
let trip, map, routeLine, markers = [];
let state = JSON.parse(localStorage.getItem("fr2026-state") || "{}");
state.currentLegId ||= "leg-01";
state.logs ||= [];
state.customPois ||= [];
state.timer ||= {active:false, startedAt:null, accumulatedMs:0};

const $ = id => document.getElementById(id);
const save = () => localStorage.setItem("fr2026-state", JSON.stringify(state));
const legById = id => trip.legs.find(l => l.id === id);
const fmtTime = ms => {
  const m = Math.floor(ms/60000), h = Math.floor(m/60), mm = String(m%60).padStart(2,"0");
  return `${h}:${mm}`;
};
const elapsedMs = () => state.timer.accumulatedMs + (state.timer.active ? Date.now() - state.timer.startedAt : 0);

function mapsSearchUrl(query, lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query + " near " + lat + "," + lon)}`;
}
function mapsNavUrl(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
}
function park4nightUrl(lat, lon, name) {
  return `https://www.google.com/search?q=${encodeURIComponent("site:park4night.com " + name + " " + lat + "," + lon)}`;
}
function campspaceUrl(lat, lon, name) {
  return `https://campspace.com/de/s/${encodeURIComponent(name)}`;
}

function currentLeg(){ return legById(state.currentLegId); }

function setRegion(leg) {
  const groceries = (leg.groceries && leg.groceries.length) ? leg.groceries.join(", ") : leg.to;
  $("park4nightLink").href = park4nightUrl(leg.lat, leg.lon, leg.to);
  $("campspaceLink").href = campspaceUrl(leg.lat, leg.lon, leg.to);
  $("googleCampingLink").href = mapsSearchUrl("camping", leg.lat, leg.lon);
  $("googleGroceriesLink").href = mapsSearchUrl("supermarket grocery Lebensmittel Supermarkt " + groceries, leg.lat, leg.lon);
  $("googleFuelLink").href = mapsSearchUrl("diesel fuel station tankstelle", leg.lat, leg.lon);
  $("googleNavLink").href = mapsNavUrl(leg.lat, leg.lon);
  $("quickPark4Night").href = $("park4nightLink").href;
  $("quickCampspace").href = $("campspaceLink").href;
  $("quickGroceries").href = $("googleGroceriesLink").href;
  $("quickNav").href = $("googleNavLink").href;
  $("regionInfo").innerHTML = `<strong>${leg.date} · ${leg.to}</strong><br>${leg.km} km · ${leg.time}<br>${leg.overnight}<br><br>${leg.notes}`;
  if (map) map.setView([leg.lat, leg.lon], 10);
}

function updateHeader() {
  const leg = currentLeg();
  $("currentLegTitle").textContent = `${leg.date} · ${leg.title}`;
  $("currentLegMeta").textContent = `${leg.km} km · ${leg.time} · ${leg.overnight}`;
  const totalKm = state.logs.reduce((s,l)=>s + Number(l.km||0),0);
  const totalMs = state.logs.reduce((s,l)=>s + Number(l.ms||0),0) + elapsedMs();
  $("totalKm").textContent = totalKm.toFixed(1);
  $("totalTime").textContent = fmtTime(totalMs);
  $("activeState").textContent = state.timer.active ? "läuft" : (state.timer.accumulatedMs ? "pausiert" : "bereit");
  $("startPauseBtn").textContent = state.timer.active ? "Pausieren" : "Etappe starten";
  setRegion(leg);
}

function renderRegions() {
  $("regionSelect").innerHTML = trip.legs.map(l => `<option value="${l.id}">${l.date} · ${l.to}</option>`).join("");
  $("regionSelect").value = state.currentLegId;
  $("regionSelect").addEventListener("change", e => {
    state.currentLegId = e.target.value; save(); updateHeader(); renderLegs();
  });
  $("useCurrentRegion").onclick = () => setRegion(currentLeg());
}

function initMap() {
  map = L.map("map").setView([46.5,3.0], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, attribution:"© OpenStreetMap"}).addTo(map);
  const coords = trip.legs.map(l => [l.lat,l.lon]);
  routeLine = L.polyline(coords, {weight:4, color:"#29a545"}).addTo(map);
  trip.legs.forEach((l, idx) => {
    const m = L.marker([l.lat,l.lon]).addTo(map);
    m.bindPopup(`<strong>${idx+1}. ${l.date} · ${l.to}</strong><br>${l.km} km · ${l.time}<br>${l.overnight}<br><br><button onclick="selectLeg('${l.id}')">Etappe wählen</button>`);
    markers.push(m);
  });
  trip.pois.forEach(p => L.circleMarker([p.lat,p.lon], {radius:6, color:"#d5a94d"}).addTo(map).bindPopup(`<strong>${p.name}</strong><br>${p.type}`));
  map.fitBounds(routeLine.getBounds(), {padding:[20,20]});
}

window.selectLeg = id => {
  state.currentLegId = id; save();
  $("regionSelect").value = id;
  updateHeader(); renderLegs();
  const l = currentLeg(); if (map) map.setView([l.lat,l.lon],10);
};

function renderLegs() {
  $("legsList").innerHTML = trip.legs.map((l,idx) => `
    <article class="card ${l.id===state.currentLegId ? "active" : ""}" onclick="selectLeg('${l.id}')">
      <h3>${idx+1}. ${l.date} · ${l.title}</h3>
      <div class="meta">${l.km} km · ${l.time}<br>${l.overnight}<br>${l.notes}</div>
      <div>${l.tags.map(t=>`<span class="tag">${t}</span>`).join("")}</div>
    </article>
  `).join("");
}

function renderLogs() {
  $("logList").innerHTML = state.logs.length ? state.logs.slice().reverse().map(l => `
    <div class="log-item">
      <strong>${new Date(l.createdAt).toLocaleString("de-DE")}</strong> · ${l.legTitle}<br>
      ${Number(l.km||0).toFixed(1)} km · ${fmtTime(Number(l.ms||0))} · ${l.note || ""}
    </div>
  `).join("") : `<div class="log-item">Noch keine Fahrten dokumentiert.</div>`;
}


function discoveryIcon(){
  return L.divIcon({
    html: `<div class="discovery-marker">🚙</div>`,
    className: "",
    iconSize: [30,30],
    iconAnchor: [15,15],
    popupAnchor: [0,-15]
  });
}

function addCustomPoiMarker(poi){
  if(!map) return;
  const marker = L.marker([poi.lat, poi.lon], {icon: discoveryIcon()}).addTo(map);
  marker.bindPopup(`
    <strong>🚙 ${poi.name}</strong><br>
    ${poi.category}<br>
    ${new Date(poi.createdAt).toLocaleString("de-DE")}<br>
    ${poi.note || ""}<br><br>
    <a target="_blank" rel="noopener" href="${mapsNavUrl(poi.lat, poi.lon)}">Navigation starten</a>
  `);
  markers.push(marker);
}

function renderCustomPois(){
  if(map){
    state.customPois.forEach(p => {
      if(!p._rendered){ addCustomPoiMarker(p); p._rendered = true; }
    });
  }
  $("poiList").innerHTML = state.customPois.length ? state.customPois.slice().reverse().map(p => `
    <div class="poi-item">
      <strong>🚙 ${p.name}</strong><br>
      ${p.category} · ${new Date(p.createdAt).toLocaleString("de-DE")}<br>
      ${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)}<br>
      ${p.note || ""}
    </div>
  `).join("") : `<div class="poi-item">Noch keine eigenen POIs gespeichert.</div>`;
}

function openPoiForm(lat=null, lon=null){
  $("poiForm").hidden = false;
  const leg = currentLeg();
  $("poiLat").value = lat ?? leg.lat;
  $("poiLon").value = lon ?? leg.lon;
  $("poiName").focus();
}

function setupJournal(){
  $("addManualPoiBtn").onclick = () => openPoiForm();
  $("addCurrentPoiBtn").onclick = () => {
    if(!navigator.geolocation){
      alert("GPS-Ortung wird auf diesem Gerät/Browser nicht unterstützt.");
      openPoiForm();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => openPoiForm(pos.coords.latitude, pos.coords.longitude),
      () => {
        alert("Position konnte nicht ermittelt werden. Du kannst den POI manuell setzen.");
        openPoiForm();
      },
      {enableHighAccuracy:true, timeout:10000, maximumAge:60000}
    );
  };
  $("cancelPoiBtn").onclick = () => { $("poiForm").hidden = true; $("poiForm").reset(); };
  $("poiForm").onsubmit = e => {
    e.preventDefault();
    const poi = {
      id: "poi-" + Date.now(),
      name: $("poiName").value,
      category: $("poiCategory").value,
      lat: Number($("poiLat").value),
      lon: Number($("poiLon").value),
      note: $("poiNote").value,
      legId: state.currentLegId,
      createdAt: new Date().toISOString()
    };
    if(!Number.isFinite(poi.lat) || !Number.isFinite(poi.lon)){
      alert("Bitte gültige Koordinaten eintragen.");
      return;
    }
    state.customPois.push(poi);
    save();
    $("poiForm").reset();
    $("poiForm").hidden = true;
    renderCustomPois();
    if(map) map.setView([poi.lat, poi.lon], 14);
  };
  $("exportPoisBtn").onclick = () => {
    const clean = state.customPois.map(({_rendered, ...p}) => p);
    const blob = new Blob([JSON.stringify(clean, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "frankreich-2026-eigene-pois-reisetagebuch.json";
    a.click();
  };
  $("clearPoisBtn").onclick = () => {
    if(confirm("Eigene POIs wirklich löschen?")){
      state.customPois = [];
      save();
      location.reload();
    }
  };
  renderCustomPois();
}


function setupTracking() {
  $("startPauseBtn").onclick = () => {
    if (state.timer.active) {
      state.timer.accumulatedMs += Date.now() - state.timer.startedAt;
      state.timer.active = false;
      state.timer.startedAt = null;
    } else {
      state.timer.active = true;
      state.timer.startedAt = Date.now();
    }
    save(); updateHeader();
  };
  $("resumeBtn").onclick = () => {
    if (!state.timer.active) {
      state.timer.active = true; state.timer.startedAt = Date.now(); save(); updateHeader();
    }
  };
  $("finishBtn").onclick = () => {
    const leg = currentLeg();
    const ms = elapsedMs();
    state.logs.push({createdAt:new Date().toISOString(), legId:leg.id, legTitle:leg.title, km:leg.km, ms, note:"Etappe abgeschlossen"});
    state.timer = {active:false, startedAt:null, accumulatedMs:0};
    const idx = trip.legs.findIndex(l=>l.id===leg.id);
    if (idx >= 0 && idx < trip.legs.length-1) state.currentLegId = trip.legs[idx+1].id;
    save(); $("regionSelect").value = state.currentLegId; updateHeader(); renderLegs(); renderLogs();
  };
  $("manualLog").onsubmit = e => {
    e.preventDefault();
    const leg = currentLeg();
    state.logs.push({
      createdAt:new Date().toISOString(),
      legId:leg.id,
      legTitle:leg.title,
      km:Number($("manualKm").value || 0),
      ms:Number($("manualMinutes").value || 0) * 60000,
      note:$("manualNote").value || "Manueller Eintrag"
    });
    e.target.reset(); save(); updateHeader(); renderLogs();
  };
  $("exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "frankreich-2026-fahrtenlog.json";
    a.click();
  };
  $("resetBtn").onclick = () => {
    if(confirm("Reise wirklich zurücksetzen? Fahrtenlog und Pausenstatus werden gelöscht.")){
      localStorage.removeItem("fr2026-state"); location.reload();
    }
  };
  $("plusBtn").onclick = () => showView("logbook");
  setInterval(()=>{ if(state.timer.active) updateHeader(); }, 1000);
}

function showView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active", v.id===id));
  document.querySelectorAll(".tab,.footer-tab").forEach(t=>t.classList.toggle("active", t.dataset.view===id));
  if(id==="mapView" && map) setTimeout(()=>map.invalidateSize(), 150);
}
document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));

let deferredPrompt;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); deferredPrompt = e; $("installBtn").hidden = false;
});
$("installBtn").onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null; $("installBtn").hidden = true;
};

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");

fetch("trip-data.json").then(r=>r.json()).then(data => {
  trip = data;
  initMap(); renderRegions(); setupTracking(); setupJournal(); updateHeader(); renderLegs(); renderLogs(); renderCustomPois();
});
