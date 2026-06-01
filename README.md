# Frankreich 2026 Reiseapp – finale MVP-Version

Private mobile PWA für den Urlaubstrip.

## Funktionen
- Etappenübersicht
- Interaktive Karte mit Route und POIs
- Region suchen
- Weiterleitung zu Park4Night
- Weiterleitung zu Campspace
- Google-Suche für Campingplätze
- Google-Suche für Lebensmittelgeschäft/Supermarkt
- Google-Suche für Tankstelle/Diesel
- Google-Navigation zur Etappe
- Etappe starten, pausieren, fortsetzen, abschließen
- Fahrtenlog mit Kilometern und Fahrzeit
- Manueller Log-Eintrag
- JSON-Export des Fahrtenlogs
- Lokaler Gerätespeicher via localStorage
- PWA-Grundstruktur für Smartphone/Home-Screen

## Installation lokal
1. ZIP entpacken.
2. Ordner in ein Terminal öffnen.
3. Starten mit:
   python -m http.server 8000
4. Browser öffnen:
   http://localhost:8000/frankreich-2026-reiseapp-final/

## Mobil nutzen
Am besten auf GitHub Pages, Netlify, Vercel oder eigenem Webspace hochladen.
Dann auf dem Smartphone öffnen und "Zum Home-Bildschirm hinzufügen".

## Hinweise
- Park4Night wird bewusst nur verlinkt, nicht per API ausgelesen.
- Campspace wird per Regionssuche geöffnet.
- Die Kilometer/Fahrzeiten sind Planungswerte, nicht Live-Navigation.
- Automatische GPS-Distanzmessung ist noch nicht aktiviert; aktuelle Version dokumentiert geplante und manuelle Werte.


## Neu: Reisetagebuch / eigene POIs
- Eigene Fundpunkte unterwegs speichern
- GPS-Position oder manuelle Koordinaten
- Kategorien: Stellplatz, Aussicht, Kajak-Einstieg, Badestelle, Lebensmittel, Restaurant/Café, Diesel/Wasser, Werkstatt, Sonstiges
- Notizen pro POI
- Anzeige auf der Karte mit schwarzem Discovery-Symbol
- Export als JSON
