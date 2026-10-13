# CastleBot by Don v0.2
Wersja rozwojowa Android 11+ (bez roota). Zastosowano AccessibilityService.takeScreenshot + ML Kit OCR oraz dispatchGesture. Pakiet oryginalnej gry: com.epicoro.castleclashers.

## Automatyka
- Menu: Battle (potwierdzone OCR ARENA/FORGE/RANKING, ewentualnie próbkowanie żółtego przycisku).
- Bitwa: wykrycie napisów ROUND + POWER/ANGLE. Brak sztucznej inteligencji strzelania; automatyczne strzały wyłączone, do kalibracji.
- Ekran wyników: BATTLE SUCCESSFUL / VICTORY / DEFEAT, kliknięcie Continue (nie Double rewards).
- Nagrody: Tap to continue, potem powrót do menu.
- Dwa zgodne odczyty przed kliknięciem, opóźnienia akcji, maks. 3 powtórzenia tego samego ekranu, ochrona przed klikaniem poza grą.
- Opcjonalny zapis gestu poprzez KAL (dwa punkty), przycisk TEST, eksperymentalnie jeden strzał na wykrytą rundę.
- Dziennik zdarzeń i możliwość udostępnienia logów.

## Pobieranie APK
1. https://github.com/Gruszeczkaoo/PomagierAndroid/actions/workflows/castlebot-build.yml
2. Otwórz zielone uruchomienie dla gałęzi castlebot-v0.2.
3. W sekcji Artifacts pobierz CastleBot_by_Don_v0.2_debug_APK (ZIP).
4. Rozpakuj ZIP na telefonie i zainstaluj plik app-debug.apk.
5. Włącz usługę CastleBot w Android -> Ułatwienia dostępu, uruchom CastleBot, naciśnij START.

Jeżeli build jest czerwony albo nie ma artefaktu, APK nie zostało zbudowane. Projekt można także otworzyć w Android Studio (folder CastleBot) i zbudować przez gradle :app:assembleDebug (JDK 17, SDK 35).

## Ograniczenia
- Przetestowano projekt logicznie na podstawie czterech zrzutów 1536x695, nie przeprowadzono testu urządzeniowego.
- Nie jest to jeszcze bot inteligentnie celujący. Nie wykonuj automatycznych strzałów bez uprzedniego TEST.
- OCR może mylić się przy animacjach, rozpoznawanie nieznanych ekranów zatrzymuje automatyczne klikanie.
- Nie klikamy reklam i zakupów.
- Automatyzacja PvP może naruszać regulamin gry.
- APK z workflow jest wersją DEBUG i może wymagać odinstalowania wcześniejszego APK podpisanego innym kluczem.
