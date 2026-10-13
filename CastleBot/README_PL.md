# CastleBot by Don v0.3.0

Testowa automatyzacja rozgrywki Castle Busters na Androidzie 11+.
## Nowe funkcje
- Walka rozpoznawana również na ekranie ROUND 5/24 bez POWER/ANGLE.
- Wykrywanie białego znacznika aktywnej własnej jednostki analizą pikseli.
- Gdy znacznik jest niewidoczny, jednorazowy wybór karty i ponowna próba.
- Automatyczna próba gestu strzału z wybranej postaci w stronę przeciwnika maksymalnie raz na rundę.
- Sekwencja menu / wynik / nagrody / następny mecz zachowana.
- Tryb AUTO jest włączony domyślnie w v0.3; można go wyłączyć w głównej aplikacji.
- Diagnostyka zapisuje próby "AUTO gesture" oraz przypadki braku rozpoznanej jednostki.

## Instalacja
1. Otwórz https://github.com/Gruszeczkaoo/PomagierAndroid/actions/workflows/castlebot-build.yml
2. Wybierz zielone uruchomienie z gałęzi castlebot-v0.2.
3. Pobierz ZIP "CastleBot_by_Don_v0.3.0_debug_APK" z sekcji Artifacts.
4. Wypakuj app-debug.apk, zainstaluj, włącz usługę dostępności CastleBot.
5. Uruchom grę przyciskiem "Uruchom grę i START".
6. Przetestuj kilka tur i prześlij dziennik działania, jeśli nie odda strzału.

## Ograniczenia
- To wersja testowa, nie gotowy silnik AI; gest jest orientacyjny, nie szacuje trajektorii.
- Wysłanie gestu nie dowodzi wystrzału ani trafienia. Potrzebne testy na telefonie.
- Detektor został opracowany z przesłanego kadru 1536x695 i nie musi działać w każdej rundzie.
- Nie klika reklam, zakupów ani Double rewards.
- Automatyzacja PvP może naruszać zasady gry.
- APK z GitHub Actions ma podpis DEBUG. Jeśli telefon zgłosi konflikt podpisu, odinstaluj starą aplikację CastleBot (nie Castle Busters), zainstaluj nową i włącz usługę dostępu.
