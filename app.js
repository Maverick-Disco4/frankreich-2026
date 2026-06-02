
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
