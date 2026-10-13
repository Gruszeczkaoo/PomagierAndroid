# CastleBot by Don v0.3.2
Aktualizacja na podstawie logu 22:54–22:57.

## Co poprawiono
- OCR odczytuje dwukrotnie: cały ekran oraz dwukrotnie powiększony obszar ROUND u góry.
- RoundTracker pamięta potwierdzoną rundę, odrzuca cofanie oraz wymaga dwóch zgodnych odczytów dla nieoczekiwanych skoków, np. 3 → 8.
- Detektor białej strzałki ignoruje zbyt duże/jasne obiekty w dolnej części i na obrzeżach ekranu. Wymaga kształtu zbliżonego do białej strzałki.
- Diagnostyka: RUNDA ZATWIERDZONA, OCR rundy odrzucone, CEL z pozycją i pewnością, AUTO gesture, GEST Android ZAKOŃCZONY/ANULOWANY i KONTROLA.
- Jedna próba strzału na zatwierdzoną rundę, ochrona przed losowymi gestami.

## Ważne
To nadal WERSJA TESTOWA. Gest zaakceptowany przez Androida może nie oddać strzału. Nie potwierdzamy działania celowania w samej grze. Potrzebne nagranie **manualnego** celowania i strzału, jeżeli nadal nie działa.

## Instalacja
1. Otwórz https://github.com/Gruszeczkaoo/PomagierAndroid/actions/workflows/castlebot-build.yml
2. Wybierz najnowszy zielony build na gałęzi castlebot-v0.2.
3. Pobierz CastleBot_by_Don_v0.3.2_debug_APK (ZIP), wypakuj app-debug.apk i zainstaluj.
4. Jeśli pojawi się konflikt podpisu DEBUG, usuń tylko poprzedniego CastleBota, po instalacji ponownie włącz dostępność.

Nie automatyzujemy zakupów i reklam. Bot może naruszać regulamin PvP.
