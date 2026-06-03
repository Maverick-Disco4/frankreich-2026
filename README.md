# Frankreich 2026 Reiseapp – Discovery Journal v2

Private mobile PWA für den Urlaubstrip.

## Funktionen
- Etappenübersicht
- Interaktive Karte mit Route und POIs
- Region suchen
- Links zu Park4Night, Campspace, Camping, Lebensmittel, Tankstelle und Navigation
- Etappe starten, pausieren, fortsetzen, abschließen
- Fahrtenlog mit Kilometern und Fahrzeit
- Log-Export als JSON
- Discovery-Journal mit eigenen POIs
- Eigene POIs mit Kategorie, Bewertung, Notiz und Foto
- Eigene POIs auf Karte mit Kategorie-Symbolen
- POI-Filter und Suche
- POI-Export und POI-Import als JSON

## GitHub Pages Update
Diese Dateien im Repository ersetzen:
- index.html
- app.js
- styles.css
- trip-data.json
- manifest.webmanifest
- sw.js
- README.md

Danach lädt GitHub Pages automatisch neu.


## GPS v3
- Live-GPS-Tracking pro Etappe
- tatsächliche Distanz per GPS-Punkten
- Live-Anzeige von km, Zeit, Punkten, Geschwindigkeit und Genauigkeit
- grüne Live-Tracklinie auf der Karte
- Track abschließen und ins Fahrtenlog übernehmen
- GPX-Export für Live-Track und abgeschlossene Tracks

Hinweis: Auf Android Standortberechtigung erlauben, Energiesparen für Browser/App deaktivieren und Display möglichst aktiv lassen.

## Route Editor v6
- Eigener Planungsbutton in der unteren Navigation
- Etappen antippen und in separatem Formular bearbeiten
- Ziel, Start, Datum, km, Fahrtzeit, Koordinaten, Übernachtung und Notizen überschreibbar
- Expliziter Button „Etappe speichern“
- Sortieren über ↑/↓
- Neue Etappen hinzufügen
- Etappen duplizieren/löschen
- Planung exportieren/importieren

## Version 7
- Live-Karte mit geplanter Route in Blau
- tatsächlich gefahrene Route dauerhaft in Grün
- abgeschlossene GPS-Tracks bleiben auf der Karte sichtbar
- aktuelle Position als Discovery-Marker
- Fotos können beim POI entweder aufgenommen oder aus dem Archiv/Galerie hochgeladen werden

## Version 8 – echte Straßenroute
- geplante Etappen werden nicht mehr nur per Luftlinie verbunden
- normale Straßenroute über OSRM/OpenStreetMap
- Option „Autobahnen vermeiden“ über OpenRouteService
- OpenRouteService API-Key kann in der Karte eingetragen werden
- Routencache lokal im Browser
