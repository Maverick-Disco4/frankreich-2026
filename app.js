
let trip, map, routeLine, markers = [], liveTrackLine = null;
let watchId = null;
let state = JSON.parse(localStorage.getItem("fr2026-state") || "{}");
state.currentLegId ||= "leg-01";
state.logs ||= [];
state.customPois ||= [];
state.timer ||= {active:false, startedAt:null, accumulatedMs:0};
state.completedTracks ||= [];
state.gps ||= {active:false, startedAt:null, accumulatedMs:0, distanceM:0, points:[], lastPoint:null};

const $ = id => document.getElementById(id);
const save = () => localStorage.setItem("fr2026-state", JSON.stringify(state));
const legById = id => trip.legs.find(l => l.id === id);
const fmtTime = ms => {
  const m = Math.floor(ms/60000), h = Math.floor(m/60), mm = String(m%60).padStart(2,"0");
  return `${h}:${mm}`;
};
const elapsedMs = () => state.timer.accumulatedMs + (state.timer.active ? Date.now() - state.timer.startedAt : 0);
const gpsElapsedMs = () => state.gps.accumulatedMs + (state.gps.active ? Date.now() - state.gps.startedAt : 0);

function mapsSearchUrl(query, lat, lon) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query + " near " + lat + "," + lon)}`; }
function mapsNavUrl(lat, lon) { return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`; }
function park4nightUrl(lat, lon, name) { return `https://www.google.com/search?q=${encodeURIComponent("site:park4night.com " + name + " " + lat + "," + lon)}`; }
function campspaceUrl(lat, lon, name) { return `https://campspace.com/de/s/${encodeURIComponent(name)}`; }
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

function categorySymbol(category){
  return {"Stellplatz":"🏕","Aussicht":"📷","Kajak-Einstieg":"🚣","Badestelle":"🏊","Lebensmittel":"🛒","Restaurant/Café":"☕","Diesel/Wasser":"⛽","Werkstatt":"🔧","Geheimtipp":"⭐","Sonstiges":"🚙"}[category] || "🚙";
}
function stars(rating){
  const r = Number(rating || 0);
  return r ? "★".repeat(r) + "☆".repeat(5-r) : "ohne Bewertung";
}
function discoveryIconFor(category){
  return L.divIcon({html:`<div class="discovery-marker">${categorySymbol(category)}</div>`, className:"", iconSize:[34,34], iconAnchor:[17,17], popupAnchor:[0,-17]});
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
  renderCustomPois();
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
    <div class="log-item"><strong>${new Date(l.createdAt).toLocaleString("de-DE")}</strong> · ${l.legTitle}<br>${Number(l.km||0).toFixed(1)} km · ${fmtTime(Number(l.ms||0))} · ${l.note || ""}</div>
  `).join("") : `<div class="log-item">Noch keine Fahrten dokumentiert.</div>`;
}

async function fileToSmallDataUrl(file){
  if(!file) return null;
  const dataUrl = await new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = document.createElement("img");
  img.src = dataUrl;
  await new Promise(resolve => img.onload = resolve);
  const canvas = document.createElement("canvas");
  const max = 1200;
  let width = img.width, height = img.height;
  if(width > height && width > max){ height = Math.round(height * max / width); width = max; }
  if(height >= width && height > max){ width = Math.round(width * max / height); height = max; }
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d").drawImage(img,0,0,width,height);
  return canvas.toDataURL("image/jpeg",0.78);
}

function renderCustomPois(){
  if(!state.customPois) state.customPois = [];
  if(map){
    state.customPois.forEach(p => {
      if(!p._rendered){
        const marker = L.marker([p.lat, p.lon], {icon: discoveryIconFor(p.category)}).addTo(map);
        marker.bindPopup(`
          <strong>${categorySymbol(p.category)} ${p.name}</strong><br>
          ${p.category} · ${stars(p.rating)}<br>
          ${new Date(p.createdAt).toLocaleString("de-DE")}<br>
          ${p.note || ""}<br>
          ${p.photo ? `<img src="${p.photo}" style="width:180px;max-height:130px;object-fit:cover;border-radius:8px;margin-top:6px">` : ""}<br>
          <a target="_blank" rel="noopener" href="${mapsNavUrl(p.lat, p.lon)}">Navigation starten</a>
        `);
        p._rendered = true;
      }
    });
  }
  const list = $("poiList");
  if(!list) return;
  const filter = $("poiFilter")?.value || "Alle";
  const query = ($("poiSearch")?.value || "").toLowerCase().trim();
  const pois = state.customPois.filter(p => {
    const filterOk = filter === "Alle" || p.category === filter;
    const q = `${p.name} ${p.category} ${p.note || ""}`.toLowerCase();
    return filterOk && (!query || q.includes(query));
  });
  list.innerHTML = pois.length ? pois.slice().reverse().map(p => `
    <div class="poi-item">
      <div class="poi-head"><div class="poi-symbol">${categorySymbol(p.category)}</div><div><div class="poi-title">${p.name}</div><div>${p.category} · <span class="stars">${stars(p.rating)}</span></div></div></div>
      ${p.photo ? `<img class="poi-photo" src="${p.photo}" alt="Foto zu ${p.name}">` : ""}
      <div>${new Date(p.createdAt).toLocaleString("de-DE")} · ${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)}</div>
      <div>${p.note || ""}</div>
      <div class="poi-actions"><a class="link-btn secondary" target="_blank" rel="noopener" href="${mapsNavUrl(p.lat, p.lon)}">Navigation</a><button class="danger-btn" onclick="deleteCustomPoi('${p.id}')">Löschen</button></div>
    </div>`).join("") : `<div class="poi-item">Noch keine passenden POIs gespeichert.</div>`;
}

window.deleteCustomPoi = function(id){
  if(!confirm("Diesen POI löschen?")) return;
  state.customPois = (state.customPois || []).filter(p => p.id !== id);
  save(); location.reload();
};

function setupJournal(){
  let pendingPhoto = null;
  const form = $("poiForm"), preview = $("photoPreview");
  function openPoiForm(lat=null, lon=null){
    form.hidden = false;
    const leg = currentLeg();
    $("poiLat").value = lat ?? leg.lat;
    $("poiLon").value = lon ?? leg.lon;
    $("poiName").focus();
  }
  $("addManualPoiBtn").onclick = () => openPoiForm();
  $("addCurrentPoiBtn").onclick = () => {
    if(!navigator.geolocation){ alert("GPS-Ortung wird auf diesem Gerät/Browser nicht unterstützt."); openPoiForm(); return; }
    navigator.geolocation.getCurrentPosition(
      pos => openPoiForm(pos.coords.latitude, pos.coords.longitude),
      () => { alert("Position konnte nicht ermittelt werden. Du kannst den POI manuell setzen."); openPoiForm(); },
      {enableHighAccuracy:true, timeout:12000, maximumAge:60000}
    );
  };
  $("cancelPoiBtn").onclick = () => { form.hidden = true; form.reset(); pendingPhoto = null; preview.hidden = true; preview.innerHTML = ""; };
  $("poiPhoto").onchange = async () => {
    pendingPhoto = await fileToSmallDataUrl($("poiPhoto").files[0]);
    if(pendingPhoto){ preview.hidden = false; preview.innerHTML = `<img src="${pendingPhoto}" alt="Vorschau">`; }
  };
  form.onsubmit = e => {
    e.preventDefault();
    const poi = {id:"poi-"+Date.now(), name:$("poiName").value, category:$("poiCategory").value, rating:Number($("poiRating").value||0), lat:Number($("poiLat").value), lon:Number($("poiLon").value), note:$("poiNote").value, photo:pendingPhoto, legId:state.currentLegId, createdAt:new Date().toISOString()};
    if(!Number.isFinite(poi.lat) || !Number.isFinite(poi.lon)){ alert("Bitte gültige Koordinaten eintragen."); return; }
    state.customPois.push(poi); save();
    pendingPhoto = null; form.reset(); form.hidden = true; preview.hidden = true; preview.innerHTML = "";
    renderCustomPois(); if(map) map.setView([poi.lat, poi.lon], 14);
  };
  $("poiFilter").onchange = renderCustomPois;
  $("poiSearch").oninput = renderCustomPois;
  $("exportPoisBtn").onclick = () => {
    const clean = state.customPois.map(({_rendered, ...p}) => p);
    const blob = new Blob([JSON.stringify(clean, null, 2)], {type:"application/json"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "frankreich-2026-discovery-journal.json"; a.click();
  };
  $("importPoisInput").onchange = e => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const incoming = JSON.parse(reader.result);
        if(!Array.isArray(incoming)) throw new Error("Kein POI-Array");
        const existingIds = new Set(state.customPois.map(p => p.id));
        incoming.forEach(p => { if(!existingIds.has(p.id)) state.customPois.push(p); });
        save(); alert("POIs importiert."); location.reload();
      }catch(err){ alert("Import fehlgeschlagen: ungültige JSON-Datei."); }
    };
    reader.readAsText(file);
  };
  $("clearPoisBtn").onclick = () => { if(confirm("Eigene POIs wirklich löschen?")){ state.customPois = []; save(); location.reload(); } };
  renderCustomPois();
}

function setupTracking() {
  $("startPauseBtn").onclick = () => {
    if (state.timer.active) { state.timer.accumulatedMs += Date.now() - state.timer.startedAt; state.timer.active = false; state.timer.startedAt = null; }
    else { state.timer.active = true; state.timer.startedAt = Date.now(); }
    save(); updateHeader();
  };
  $("resumeBtn").onclick = () => { if (!state.timer.active) { state.timer.active = true; state.timer.startedAt = Date.now(); save(); updateHeader(); } };
  $("finishBtn").onclick = () => {
    const leg = currentLeg(), ms = elapsedMs();
    state.logs.push({createdAt:new Date().toISOString(), legId:leg.id, legTitle:leg.title, km:leg.km, ms, note:"Etappe abgeschlossen"});
    state.timer = {active:false, startedAt:null, accumulatedMs:0};
    const idx = trip.legs.findIndex(l=>l.id===leg.id);
    if (idx >= 0 && idx < trip.legs.length-1) state.currentLegId = trip.legs[idx+1].id;
    save(); $("regionSelect").value = state.currentLegId; updateHeader(); renderLegs(); renderLogs();
  };
  $("manualLog").onsubmit = e => {
    e.preventDefault(); const leg = currentLeg();
    state.logs.push({createdAt:new Date().toISOString(), legId:leg.id, legTitle:leg.title, km:Number($("manualKm").value || 0), ms:Number($("manualMinutes").value || 0)*60000, note:$("manualNote").value || "Manueller Eintrag"});
    e.target.reset(); save(); updateHeader(); renderLogs();
  };
  $("exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "frankreich-2026-fahrtenlog.json"; a.click();
  };
  $("resetBtn").onclick = () => { if(confirm("Reise wirklich zurücksetzen? Fahrtenlog und Pausenstatus werden gelöscht.")){ localStorage.removeItem("fr2026-state"); location.reload(); } };
  $("plusBtn").onclick = () => showView("journal");
  setInterval(()=>{ if(state.timer.active) updateHeader(); }, 1000);
}

function showView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active", v.id===id));
  document.querySelectorAll(".tab,.footer-tab").forEach(t=>t.classList.toggle("active", t.dataset.view===id));
  if(id==="mapView" && map) setTimeout(()=>map.invalidateSize(), 150);
}
document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));

let deferredPrompt;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; $("installBtn").hidden = false; });
$("installBtn").onclick = async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $("installBtn").hidden = true; };

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");

fetch("trip-data.json").then(r=>r.json()).then(data => {
  trip = data;
  initMap(); renderRegions(); setupTracking(); setupJournal(); setupGpsTracking(); updateHeader(); renderLegs(); renderLogs(); renderCustomPois(); renderTracks(); updateGpsUi();
});


/* ===== GPS Tracking v3 ===== */
function haversineM(a,b){
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLon=toRad(b.lon-a.lon);
  const lat1=toRad(a.lat), lat2=toRad(b.lat);
  const h=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function redrawLiveTrack(){
  if(!map) return;
  if(liveTrackLine) map.removeLayer(liveTrackLine);
  const coords = (state.gps.points||[]).map(p => [p.lat,p.lon]);
  if(coords.length >= 2) liveTrackLine = L.polyline(coords, {weight:5, color:'#8ee48e'}).addTo(map);
}
function updateGpsUi(){
  if(!state.gps) return;
  const km = state.gps.distanceM/1000;
  const pts = state.gps.points.length;
  const last = state.gps.points[pts-1];
  const acc = last?.accuracy ? `±${Math.round(last.accuracy)} m` : '–';
  const speed = last?.speed && last.speed > 0 ? Math.round(last.speed*3.6) : '–';
  ['gpsKm','gpsKmMini'].forEach(id => { const el=$(id); if(el) el.textContent = km.toFixed(2); });
  ['gpsPoints','gpsPointsMini'].forEach(id => { const el=$(id); if(el) el.textContent = pts; });
  ['gpsAccuracy','gpsAccuracyMini'].forEach(id => { const el=$(id); if(el) el.textContent = acc; });
  const d=$('gpsDuration'); if(d) d.textContent = fmtTime(gpsElapsedMs());
  const sp=$('gpsSpeed'); if(sp) sp.textContent = speed;
  const st=$('gpsStatus'); if(st) st.textContent = state.gps.active ? 'läuft' : (pts ? 'pausiert' : 'bereit');
}
function handleGpsPosition(pos){
  const c = pos.coords;
  const p = {lat:c.latitude, lon:c.longitude, accuracy:c.accuracy, altitude:c.altitude, speed:c.speed, time:new Date(pos.timestamp).toISOString()};
  const last = state.gps.lastPoint;
  let accept = true;
  if(last){
    const d = haversineM(last, p);
    if(d < 8) accept = false;
    if(p.accuracy && p.accuracy > 80) accept = false;
    if(accept) state.gps.distanceM += d;
  }
  if(accept || !last){
    state.gps.points.push(p); state.gps.lastPoint = p; save(); redrawLiveTrack();
    if(map && state.gps.active) map.panTo([p.lat,p.lon], {animate:true});
  }
  updateGpsUi();
}
function startGps(){
  if(!navigator.geolocation){ alert('GPS wird von diesem Browser nicht unterstützt.'); return; }
  if(state.gps.active) return;
  state.gps.active = true; state.gps.startedAt = Date.now(); save();
  watchId = navigator.geolocation.watchPosition(handleGpsPosition, err => { const st=$('gpsStatus'); if(st) st.textContent='Fehler'; alert('GPS-Fehler: '+err.message); }, {enableHighAccuracy:true, maximumAge:5000, timeout:15000});
  updateGpsUi();
}
function pauseGps(){
  if(watchId !== null){ navigator.geolocation.clearWatch(watchId); watchId = null; }
  if(state.gps.active){ state.gps.accumulatedMs += Date.now() - state.gps.startedAt; state.gps.active=false; state.gps.startedAt=null; save(); }
  updateGpsUi();
}
function finishGpsTrack(){
  pauseGps();
  if(state.gps.points.length < 2){ alert('Noch zu wenige GPS-Punkte für einen Track.'); return; }
  const leg = currentLeg();
  const track = {id:'track-'+Date.now(), legId:leg.id, legTitle:leg.title, createdAt:new Date().toISOString(), km:state.gps.distanceM/1000, ms:state.gps.accumulatedMs, points:state.gps.points};
  state.completedTracks.push(track);
  state.logs.push({createdAt:new Date().toISOString(), legId:leg.id, legTitle:leg.title, km:track.km, ms:track.ms, note:'GPS-Track abgeschlossen'});
  state.gps = {active:false, startedAt:null, accumulatedMs:0, distanceM:0, points:[], lastPoint:null};
  save(); redrawLiveTrack(); updateHeader(); renderLogs(); renderTracks(); updateGpsUi();
  alert('GPS-Track abgeschlossen und im Fahrtenlog gespeichert.');
}
function gpxForTrack(track){
  const pts = track.points.map(p => `<trkpt lat="${p.lat}" lon="${p.lon}">${p.altitude ? `<ele>${p.altitude}</ele>` : ''}<time>${p.time}</time></trkpt>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Frankreich 2026 Reiseapp" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${track.legTitle}</name><time>${track.createdAt}</time></metadata><trk><name>${track.legTitle}</name><trkseg>${pts}</trkseg></trk></gpx>`;
}
function exportCurrentGpx(){
  const leg = currentLeg();
  const track = {legTitle:leg.title, createdAt:new Date().toISOString(), points:state.gps.points};
  if(track.points.length < 2){ alert('Noch kein exportierbarer GPS-Track vorhanden.'); return; }
  const blob = new Blob([gpxForTrack(track)], {type:'application/gpx+xml'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `frankreich-2026-${leg.id}-live-track.gpx`; a.click();
}
function renderTracks(){
  const el=$('trackList'); if(!el) return;
  el.innerHTML = state.completedTracks.length ? state.completedTracks.slice().reverse().map(t => `<div class="track-item"><strong>${new Date(t.createdAt).toLocaleString('de-DE')}</strong><br>${t.legTitle}<br><span class="track-line">${Number(t.km).toFixed(2)} km · ${fmtTime(t.ms)} · ${t.points.length} Punkte</span><br><button class="secondary-btn" onclick="downloadTrack('${t.id}')">GPX herunterladen</button></div>`).join('') : `<div class="track-item">Noch keine abgeschlossenen GPS-Tracks.</div>`;
}
window.downloadTrack = function(id){
  const t = state.completedTracks.find(x => x.id === id); if(!t) return;
  const blob = new Blob([gpxForTrack(t)], {type:'application/gpx+xml'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${t.id}.gpx`; a.click();
};
function setupGpsTracking(){
  const s=$('gpsStartBtn'), p=$('gpsPauseBtn'), f=$('gpsFinishBtn'), e=$('exportGpxBtn'), c=$('clearTrackBtn');
  if(s) s.onclick=startGps; if(p) p.onclick=pauseGps; if(f) f.onclick=finishGpsTrack; if(e) e.onclick=exportCurrentGpx;
  if(c) c.onclick=()=>{ if(confirm('Aktuellen Live-Track löschen?')){ pauseGps(); state.gps={active:false,startedAt:null,accumulatedMs:0,distanceM:0,points:[],lastPoint:null}; save(); redrawLiveTrack(); updateGpsUi(); } };
  setInterval(()=>{ if(state.gps.active) updateGpsUi(); }, 1000);
  setTimeout(()=>{ redrawLiveTrack(); updateGpsUi(); renderTracks(); }, 500);
}


/* ===== Route Editor v6 reliable mobile editor ===== */
function plannerCleanLeg(leg, i){
  return {
    ...leg,
    id: leg.id || "leg-" + Date.now() + "-" + i,
    date: leg.date || "",
    title: leg.title || `${leg.from || ""} → ${leg.to || ""}`,
    from: leg.from || "",
    to: leg.to || "",
    km: Number(leg.km || 0),
    time: leg.time || "",
    lat: Number(leg.lat || 0),
    lon: Number(leg.lon || 0),
    overnight: leg.overnight || "",
    notes: leg.notes || "",
    tags: Array.isArray(leg.tags) ? leg.tags : [],
    groceries: Array.isArray(leg.groceries) ? leg.groceries : []
  };
}
function plannerHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function plannerGet(){
  const saved = localStorage.getItem("fr2026-plan-v6");
  if(saved){
    try { return JSON.parse(saved).map(plannerCleanLeg); } catch(e){}
  }
  return trip.legs.map(plannerCleanLeg);
}
function plannerSet(legs){
  const clean = legs.map(plannerCleanLeg);
  localStorage.setItem("fr2026-plan-v6", JSON.stringify(clean));
  trip.legs = clean;
  if(!trip.legs.find(l => l.id === state.currentLegId)){
    state.currentLegId = trip.legs[0]?.id || "leg-01";
  }
  if(typeof save === "function") save();
  plannerSyncApp();
}
function plannerSyncApp(){
  if(typeof renderRegions === "function"){
    const sel = document.getElementById("regionSelect");
    if(sel){
      sel.innerHTML = trip.legs.map(l => `<option value="${l.id}">${plannerHtml(l.date)} · ${plannerHtml(l.to)}</option>`).join("");
      sel.value = state.currentLegId;
    }
  }
  if(typeof renderLegs === "function") renderLegs();
  if(typeof updateHeader === "function") updateHeader();
  if(map && routeLine){
    try{ map.removeLayer(routeLine); }catch(e){}
    const coords = trip.legs.map(l => [Number(l.lat), Number(l.lon)]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    routeLine = L.polyline(coords, {weight:4, color:"#29a545"}).addTo(map);
  }
}
function plannerRender(){
  const list = document.getElementById("plannerList");
  if(!list || typeof trip === "undefined") return;
  const legs = plannerGet();
  trip.legs = legs;
  list.innerHTML = legs.map((l, i) => `
    <article class="planner-row ${l.id === state.currentLegId ? "active" : ""}" data-id="${l.id}">
      <div class="planner-num">${i+1}</div>
      <div class="planner-main" onclick="plannerOpen('${l.id}')">
        <strong>${plannerHtml(l.date)} · ${plannerHtml(l.title || l.to)}</strong>
        <span>${plannerHtml(l.from)} → ${plannerHtml(l.to)}</span>
        <span>${Number(l.km || 0)} km · ${plannerHtml(l.time)} · ${plannerHtml(l.overnight || "")}</span>
      </div>
      <div class="planner-row-actions">
        <button class="secondary-btn" onclick="plannerOpen('${l.id}')">Edit</button>
        <button class="secondary-btn" onclick="plannerMove('${l.id}',-1)">↑</button>
        <button class="secondary-btn" onclick="plannerMove('${l.id}',1)">↓</button>
        <button class="danger-btn" onclick="plannerDelete('${l.id}')">×</button>
      </div>
    </article>
  `).join("") + `<p class="planner-help">Route Editor v6 aktiv. Auf Android: Etappe antippen → ändern → „Etappe speichern“.</p>`;
}
function plannerOpen(id){
  const legs = plannerGet();
  const leg = legs.find(l => l.id === id);
  const box = document.getElementById("plannerEditor");
  if(!leg || !box) return;
  state.currentLegId = id;
  if(typeof save === "function") save();
  box.hidden = false;
  box.innerHTML = `
    <h3>Etappe bearbeiten</h3>
    <div class="planner-form">
      <label>Datum <input id="pe-date" value="${plannerHtml(leg.date)}"></label>
      <label>Titel <input id="pe-title" value="${plannerHtml(leg.title)}"></label>
      <label>Start / Von <input id="pe-from" value="${plannerHtml(leg.from)}"></label>
      <label>Ziel / Etappenziel <input id="pe-to" value="${plannerHtml(leg.to)}"></label>
      <div class="planner-two">
        <label>Entfernung km <input id="pe-km" type="number" step="1" value="${Number(leg.km || 0)}"></label>
        <label>Fahrtzeit <input id="pe-time" value="${plannerHtml(leg.time)}"></label>
      </div>
      <div class="planner-two">
        <label>Breitengrad <input id="pe-lat" type="number" step="0.000001" value="${Number(leg.lat || 0)}"></label>
        <label>Längengrad <input id="pe-lon" type="number" step="0.000001" value="${Number(leg.lon || 0)}"></label>
      </div>
      <label>Übernachtung / Suchgebiet <input id="pe-overnight" value="${plannerHtml(leg.overnight)}"></label>
      <label>Notizen <textarea id="pe-notes">${plannerHtml(leg.notes)}</textarea></label>
      <div class="planner-editor-actions">
        <button class="planner-save" onclick="plannerSaveOpen('${id}')">Etappe speichern</button>
        <button class="secondary-btn" onclick="plannerCloseEditor()">Abbrechen</button>
      </div>
      <div class="planner-editor-actions">
        <button class="secondary-btn" onclick="plannerDuplicate('${id}')">Etappe duplizieren</button>
        <button class="danger-btn" onclick="plannerDelete('${id}')">Etappe löschen</button>
      </div>
    </div>
  `;
  plannerRender();
  setTimeout(() => box.scrollIntoView({behavior:"smooth", block:"start"}), 100);
}
function plannerCloseEditor(){
  const box = document.getElementById("plannerEditor");
  if(box) box.hidden = true;
}
function plannerSaveOpen(id){
  const legs = plannerGet();
  const idx = legs.findIndex(l => l.id === id);
  if(idx < 0) return;
  legs[idx] = {
    ...legs[idx],
    date: document.getElementById("pe-date").value,
    title: document.getElementById("pe-title").value,
    from: document.getElementById("pe-from").value,
    to: document.getElementById("pe-to").value,
    km: Number(document.getElementById("pe-km").value || 0),
    time: document.getElementById("pe-time").value,
    lat: Number(document.getElementById("pe-lat").value || 0),
    lon: Number(document.getElementById("pe-lon").value || 0),
    overnight: document.getElementById("pe-overnight").value,
    notes: document.getElementById("pe-notes").value
  };
  plannerSet(legs);
  plannerCloseEditor();
  plannerRender();
  alert("Etappe gespeichert.");
}
function plannerMove(id, delta){
  const legs = plannerGet();
  const i = legs.findIndex(l => l.id === id);
  const j = i + delta;
  if(i < 0 || j < 0 || j >= legs.length) return;
  [legs[i], legs[j]] = [legs[j], legs[i]];
  plannerSet(legs);
  plannerRender();
}
function plannerDuplicate(id){
  const legs = plannerGet();
  const i = legs.findIndex(l => l.id === id);
  if(i < 0) return;
  const copy = JSON.parse(JSON.stringify(legs[i]));
  copy.id = "leg-custom-" + Date.now();
  copy.title = copy.title + " (Kopie)";
  legs.splice(i + 1, 0, copy);
  plannerSet(legs);
  plannerRender();
}
function plannerDelete(id){
  if(!confirm("Diese Etappe wirklich löschen?")) return;
  const legs = plannerGet().filter(l => l.id !== id);
  plannerSet(legs);
  plannerCloseEditor();
  plannerRender();
}
function plannerAdd(){
  const legs = plannerGet();
  const prev = legs[legs.length - 1] || {to:"", lat:0, lon:0};
  const newLeg = {
    id:"leg-custom-" + Date.now(),
    date:"",
    title:"Neue Etappe",
    from:prev.to || "",
    to:"Neues Ziel",
    km:0,
    time:"",
    lat:Number(prev.lat || 0),
    lon:Number(prev.lon || 0),
    overnight:"",
    notes:"",
    tags:["Neu"],
    groceries:[]
  };
  legs.push(newLeg);
  plannerSet(legs);
  plannerRender();
  plannerOpen(newLeg.id);
}
function plannerReset(){
  if(!confirm("Originalplanung wiederherstellen? Alle Änderungen an Etappen werden gelöscht.")) return;
  localStorage.removeItem("fr2026-plan-v6");
  trip.legs = JSON.parse(localStorage.getItem("fr2026-original-legs-v6") || JSON.stringify(trip.legs));
  plannerSyncApp();
  plannerCloseEditor();
  plannerRender();
}
function plannerExport(){
  const blob = new Blob([JSON.stringify(plannerGet(), null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "frankreich-2026-etappenplanung.json";
  a.click();
}
function plannerImportFile(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const legs = JSON.parse(reader.result).map(plannerCleanLeg);
      if(!legs.length) throw new Error();
      plannerSet(legs);
      plannerRender();
      alert("Planung importiert.");
    }catch(e){
      alert("Import fehlgeschlagen.");
    }
  };
  reader.readAsText(file);
}
function plannerInit(){
  if(typeof trip === "undefined" || !trip?.legs?.length) return false;
  if(!localStorage.getItem("fr2026-original-legs-v6")){
    localStorage.setItem("fr2026-original-legs-v6", JSON.stringify(trip.legs));
  }
  const saved = localStorage.getItem("fr2026-plan-v6");
  if(saved){
    try{ trip.legs = JSON.parse(saved).map(plannerCleanLeg); }catch(e){}
  }
  const add = document.getElementById("plannerAddLegBtn");
  const reset = document.getElementById("plannerResetBtn");
  const exp = document.getElementById("plannerExportBtn");
  const imp = document.getElementById("plannerImportInput");
  if(add) add.onclick = plannerAdd;
  if(reset) reset.onclick = plannerReset;
  if(exp) exp.onclick = plannerExport;
  if(imp) imp.onchange = e => plannerImportFile(e.target.files[0]);
  plannerSyncApp();
  plannerRender();
  return true;
}
(function waitPlanner(){
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if(plannerInit() || tries > 20) clearInterval(t);
  }, 500);
})();


/* ===== Version 7: permanent driven route + archive photo upload ===== */
let drivenTrackLayers = [];
let liveDiscoveryMarker = null;

function v7DistanceKmForTrack(t){
  return Number(t.km || (t.distanceM ? t.distanceM/1000 : 0));
}
function liveDiscoveryIcon(){
  return L.divIcon({html:`<div class="live-discovery-marker">🚙</div>`,className:"",iconSize:[34,34],iconAnchor:[17,17],popupAnchor:[0,-17]});
}
function drawCompletedDrivenTracks(){
  if(!map || !state.completedTracks) return;
  drivenTrackLayers.forEach(layer => { try{ map.removeLayer(layer); }catch(e){} });
  drivenTrackLayers = [];
  state.completedTracks.forEach((track) => {
    if(!track.points || track.points.length < 2) return;
    const coords = track.points.map(p => [p.lat, p.lon]);
    const layer = L.polyline(coords, {weight:4, color:"#8ee48e", opacity:0.8}).addTo(map);
    layer.bindPopup(`<strong>Gefahrene Route</strong><br>${track.legTitle || "Track"}<br>${v7DistanceKmForTrack(track).toFixed(2)} km · ${fmtTime(track.ms || 0)}<br>${track.points.length} GPS-Punkte`);
    drivenTrackLayers.push(layer);
  });
}
function updateLiveDiscoveryMarker(point){
  if(!map || !point) return;
  const pos = [point.lat, point.lon];
  if(!liveDiscoveryMarker){
    liveDiscoveryMarker = L.marker(pos, {icon: liveDiscoveryIcon()}).addTo(map);
    liveDiscoveryMarker.bindPopup("🚙 Aktuelle Position");
  } else {
    liveDiscoveryMarker.setLatLng(pos);
  }
}
function updatePlannedRouteBlue(){
  if(!map || !routeLine || !trip?.legs) return;
  try{ map.removeLayer(routeLine); }catch(e){}
  const coords = trip.legs.map(l => [Number(l.lat), Number(l.lon)]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  routeLine = L.polyline(coords, {weight:4, color:"#6fa8ff", opacity:0.85}).addTo(map);
}
const originalInitMapV7 = typeof initMap === "function" ? initMap : null;
if(originalInitMapV7){
  initMap = function(){
    originalInitMapV7();
    setTimeout(() => { updatePlannedRouteBlue(); drawCompletedDrivenTracks(); if(state.gps?.lastPoint) updateLiveDiscoveryMarker(state.gps.lastPoint); }, 300);
  };
}
const originalHandleGpsPositionV7 = typeof handleGpsPosition === "function" ? handleGpsPosition : null;
if(originalHandleGpsPositionV7){
  handleGpsPosition = function(pos){
    originalHandleGpsPositionV7(pos);
    const last = state.gps?.lastPoint;
    if(last) updateLiveDiscoveryMarker(last);
  };
}
const originalFinishGpsTrackV7 = typeof finishGpsTrack === "function" ? finishGpsTrack : null;
if(originalFinishGpsTrackV7){
  finishGpsTrack = function(){
    originalFinishGpsTrackV7();
    setTimeout(() => { drawCompletedDrivenTracks(); updatePlannedRouteBlue(); }, 500);
  };
}
const originalRedrawLiveTrackV7 = typeof redrawLiveTrack === "function" ? redrawLiveTrack : null;
if(originalRedrawLiveTrackV7){
  redrawLiveTrack = function(){
    originalRedrawLiveTrackV7();
    if(liveTrackLine){ try{ liveTrackLine.setStyle({color:"#8ee48e", weight:5, opacity:0.95}); }catch(e){} }
  };
}
function setupArchivePhotoInputV7(){
  const archiveInput = document.getElementById("poiPhotoArchive");
  const cameraInput = document.getElementById("poiPhoto");
  if(!archiveInput || !cameraInput) return false;
  if(archiveInput.__v7Ready) return true;
  archiveInput.__v7Ready = true;
  const attach = (input) => {
    input.addEventListener("change", async () => {
      if(!input.files || !input.files[0]) return;
      if(typeof fileToSmallDataUrl !== "function") return;
      const data = await fileToSmallDataUrl(input.files[0]);
      const preview = document.getElementById("photoPreview");
      if(preview){
        preview.hidden = false;
        preview.innerHTML = `<img src="${data}" alt="Vorschau">`;
      }
      window.__fr2026PendingArchivePhoto = data;
    });
  };
  attach(archiveInput);
  attach(cameraInput);
  return true;
}
function patchJournalSubmitV7(){
  const form = document.getElementById("poiForm");
  if(!form || form.__v7Patched) return false;
  form.__v7Patched = true;
  form.addEventListener("submit", () => {
    setTimeout(() => {
      if(window.__fr2026PendingArchivePhoto && state.customPois?.length){
        const last = state.customPois[state.customPois.length - 1];
        if(last && !last.photo){
          last.photo = window.__fr2026PendingArchivePhoto;
          window.__fr2026PendingArchivePhoto = null;
          save();
          if(typeof renderCustomPois === "function") renderCustomPois();
        }
      }
    }, 250);
  });
  return true;
}
function renderTracksV7Summary(){
  const el = document.getElementById("trackList");
  if(!el || !state.completedTracks) return;
  const totalKm = state.completedTracks.reduce((s,t) => s + v7DistanceKmForTrack(t), 0);
  if(state.completedTracks.length && !document.getElementById("v7TrackSummary")){
    el.insertAdjacentHTML("beforebegin", `<div id="v7TrackSummary" class="track-summary">Dauerhaft gespeicherte gefahrene Route: <strong>${totalKm.toFixed(2)} km</strong> in ${state.completedTracks.length} Track(s).</div>`);
  } else if(document.getElementById("v7TrackSummary")){
    document.getElementById("v7TrackSummary").innerHTML = `Dauerhaft gespeicherte gefahrene Route: <strong>${totalKm.toFixed(2)} km</strong> in ${state.completedTracks.length} Track(s).`;
  }
}
const originalRenderTracksV7 = typeof renderTracks === "function" ? renderTracks : null;
if(originalRenderTracksV7){
  renderTracks = function(){ originalRenderTracksV7(); renderTracksV7Summary(); };
}
(function initV7(){
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    setupArchivePhotoInputV7();
    patchJournalSubmitV7();
    if(map){
      updatePlannedRouteBlue();
      drawCompletedDrivenTracks();
      if(state.gps?.lastPoint) updateLiveDiscoveryMarker(state.gps.lastPoint);
    }
    if(tries > 12) clearInterval(t);
  }, 500);
})();

/* ===== Version 8: real road routing with OSRM / ORS avoid highways ===== */
let plannedRoadRouteLayer = null;
let plannedRoadRouteStats = {distanceM:0, durationS:0, source:""};
const ROUTE_CACHE_PREFIX = "fr2026-road-route-cache:";
function routeSettingsV8(){const s=JSON.parse(localStorage.getItem("fr2026-route-settings-v8")||"{}");return{provider:s.provider||"osrm",orsKey:s.orsKey||""};}
function saveRouteSettingsV8(s){localStorage.setItem("fr2026-route-settings-v8",JSON.stringify(s));}
function legsHashV8(){return (trip?.legs||[]).map(l=>[Number(l.lon).toFixed(5),Number(l.lat).toFixed(5),l.id].join(",")).join("|")+"|"+routeSettingsV8().provider;}
function cacheKeyV8(){return ROUTE_CACHE_PREFIX+legsHashV8();}
function setRouteStatusV8(text){let el=document.getElementById("routeStatusV8");const tb=document.getElementById("mapLegendV8")||document.getElementById("mapLegendV7");if(!el&&tb){el=document.createElement("div");el.id="routeStatusV8";el.className="route-status";tb.appendChild(el);} if(el) el.textContent=text;}
function clearPlannedRoutesV8(){if(plannedRoadRouteLayer&&map){try{map.removeLayer(plannedRoadRouteLayer)}catch(e){}} plannedRoadRouteLayer=null;if(routeLine&&map){try{map.removeLayer(routeLine)}catch(e){}}}
function drawPlannedRoadRouteV8(coords,stats){if(!map||!coords?.length)return;clearPlannedRoutesV8();plannedRoadRouteLayer=L.polyline(coords.map(p=>[p[1],p[0]]),{weight:4,color:"#6fa8ff",opacity:.9}).addTo(map);plannedRoadRouteStats=stats||{};const km=((stats?.distanceM||0)/1000).toFixed(1);const h=Math.floor((stats?.durationS||0)/3600);const m=Math.round(((stats?.durationS||0)%3600)/60);plannedRoadRouteLayer.bindPopup(`<strong>Geplante Straßenroute</strong><br>${km} km · ${h}:${String(m).padStart(2,"0")} h<br>${stats?.source||""}`);try{map.fitBounds(plannedRoadRouteLayer.getBounds(),{padding:[20,20]})}catch(e){}}
function drawFallbackStraightRouteV8(){if(!map||!trip?.legs)return;clearPlannedRoutesV8();const coords=trip.legs.map(l=>[Number(l.lat),Number(l.lon)]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));routeLine=L.polyline(coords,{weight:3,color:"#6fa8ff",opacity:.45,dashArray:"8 8"}).addTo(map);}
async function fetchOsrmLegV8(a,b){const url=`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=false`;const r=await fetch(url);if(!r.ok)throw new Error("OSRM Fehler "+r.status);const d=await r.json();if(!d.routes||!d.routes[0])throw new Error("OSRM: keine Route");return{coords:d.routes[0].geometry.coordinates,distanceM:d.routes[0].distance||0,durationS:d.routes[0].duration||0};}
async function fetchOrsLegV8(a,b,key){const body={coordinates:[[a.lon,a.lat],[b.lon,b.lat]],options:{avoid_features:["highways"]}};const r=await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson",{method:"POST",headers:{"Authorization":key,"Content-Type":"application/json"},body:JSON.stringify(body)});if(!r.ok)throw new Error("OpenRouteService Fehler "+r.status);const d=await r.json();const f=d.features&&d.features[0];if(!f)throw new Error("ORS: keine Route");const s=f.properties?.summary||{};return{coords:f.geometry.coordinates,distanceM:s.distance||0,durationS:s.duration||0};}
async function buildRoadRouteV8(force=false){if(!trip?.legs||trip.legs.length<2||!map)return;const settings=routeSettingsV8();const cached=localStorage.getItem(cacheKeyV8());if(cached&&!force){try{const p=JSON.parse(cached);drawPlannedRoadRouteV8(p.coords,p.stats);setRouteStatusV8(`Straßenroute aus Cache: ${(p.stats.distanceM/1000).toFixed(1)} km`);return;}catch(e){}} if(settings.provider==="ors-avoid"&&!settings.orsKey){setRouteStatusV8("Für „Autobahnen vermeiden“ OpenRouteService API-Key eintragen. Fallback: Luftlinie.");drawFallbackStraightRouteV8();return;} setRouteStatusV8("Straßenroute wird berechnet …");const all=[];let dist=0,dur=0;try{const pts=trip.legs.map(l=>({lat:Number(l.lat),lon:Number(l.lon)})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));for(let i=0;i<pts.length-1;i++){const res=settings.provider==="ors-avoid"?await fetchOrsLegV8(pts[i],pts[i+1],settings.orsKey):await fetchOsrmLegV8(pts[i],pts[i+1]);if(i===0)all.push(...res.coords);else all.push(...res.coords.slice(1));dist+=res.distanceM;dur+=res.durationS;setRouteStatusV8(`Straßenroute ${i+1}/${pts.length-1} berechnet …`);}const stats={distanceM:dist,durationS:dur,source:settings.provider==="ors-avoid"?"OpenRouteService · Autobahnen vermeiden":"OSRM · normale Straßenroute"};localStorage.setItem(cacheKeyV8(),JSON.stringify({coords:all,stats,createdAt:new Date().toISOString()}));drawPlannedRoadRouteV8(all,stats);setRouteStatusV8(`Geplante Straßenroute: ${(dist/1000).toFixed(1)} km · ${Math.floor(dur/3600)}:${String(Math.round((dur%3600)/60)).padStart(2,"0")} h`);}catch(err){console.error(err);setRouteStatusV8("Straßenroute konnte nicht berechnet werden: "+err.message);drawFallbackStraightRouteV8();}}
function setupRoadRoutingControlsV8(){const provider=document.getElementById("routingProviderSelect"),key=document.getElementById("orsApiKeyInput"),rebuild=document.getElementById("routeRebuildBtn"),clear=document.getElementById("routeClearCacheBtn");if(!provider||provider.__v8Ready)return false;provider.__v8Ready=true;const s=routeSettingsV8();provider.value=s.provider;if(key)key.value=s.orsKey||"";provider.onchange=()=>{const s=routeSettingsV8();s.provider=provider.value;saveRouteSettingsV8(s);buildRoadRouteV8(true)};if(key)key.onchange=()=>{const s=routeSettingsV8();s.orsKey=key.value.trim();saveRouteSettingsV8(s)};if(rebuild)rebuild.onclick=()=>buildRoadRouteV8(true);if(clear)clear.onclick=()=>{Object.keys(localStorage).filter(k=>k.startsWith(ROUTE_CACHE_PREFIX)).forEach(k=>localStorage.removeItem(k));setRouteStatusV8("Routencache gelöscht.");buildRoadRouteV8(true)};return true;}
if(typeof updatePlannedRouteBlue==="function"){updatePlannedRouteBlue=function(){buildRoadRouteV8(false);};}
(function initRoadRoutingV8(){let tries=0;const t=setInterval(()=>{tries++;setupRoadRoutingControlsV8();if(map&&trip?.legs?.length){buildRoadRouteV8(false);clearInterval(t);}if(tries>20)clearInterval(t);},700);})();
