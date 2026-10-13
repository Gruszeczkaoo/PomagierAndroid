# CastleBot by Don v0.3.1 — poprawka z logów
Wykryty błąd: MATCH -> UNKNOWN po około 2 sekundach, bez próby AUTO gesture.

## Zmiany
- ROUND HUD nie musi być prawidłowo odczytany w dwóch kolejnych screenshotach.
- Zapis ostatniego rozpoznanego numeru rundy na 30 sekund.
- Stan MATCH pozostaje aktywny przez krótki czas przy błędnym OCR (do 30 sekund), jeśli nie pojawi się rozpoznany HOME/RESULT/REWARD.
- Doprecyzowanie wykrywania aktywnej jednostki: gest rozpoczyna się niżej, na postaci, zamiast na białej strzałce.
- Dodatkowe wpisy OCR, WYBÓR, CEL, AUTO gesture i GEST Android ZAKOŃCZONY / ANULOWANY.
- Zachowana zasada maksymalnie jednej próby strzału na numer rundy i przycisk STOP.

## Test
1. Otwórz https://github.com/Gruszeczkaoo/PomagierAndroid/actions/workflows/castlebot-build.yml
2. Pobierz APK z ostatniego zielonego buildu CastleBot_by_Don_v0.3.1_debug_APK.
3. Zainstaluj i włącz usługę dostępności, a następnie uruchom grę i START.
4. Po jednej lub dwóch rundach otwórz CastleBot > Wyświetl dziennik działania.
5. Wklej log (najlepiej z momentów MATCH OCR, WYBÓR, CEL, AUTO gesture, GEST).
6. Jeżeli nadal brak strzału, potrzebne będzie krótkie wideo ręcznego celowania i puszczenia palca. Bez niego nie można potwierdzić, że kierunek gestu odpowiada mechanice Castle Busters.

## Ograniczenia
- Przyjęcie gestu przez system Android nie oznacza, że gra oddała strzał.
- Wykrywanie białej strzałki i trajektoria są heurystykami, a nie wytrenowanym modelem trafień.
- Automatyczne granie w PvP może naruszać regulamin.
- Bot nie klika reklam ani zakupów.
- Pakiet źródłowy zostaje w gałęzi castlebot-v0.2, nie zmienia Pomagiera main.
