# CastleBot by Don v0.3.3

## Poprawki
- Wykrywanie ofert takich jak PYRO/LEGENDARY UNIT/GET A NEW i wyszukiwanie ciemnego przycisku z białym X w prawej górnej części okna.
- Oferty sprawdzane przed ekranem HOME, aby tekst menu znajdującego się pod okienkiem nie wywoływał przypadkowego Battle.
- Gdy program nie potwierdzi lokalizacji krzyżyka, nie dotyka żadnego przycisku i zapisuje zdarzenie OFERTA w logach.
- Automatyczne strzały korzystają z kierunku/długości wcześniej zapisanej kalibracji KAL, przeliczając wektor względem pozycji wykrytej jednostki.
- Każdy strzał zapisuje informację profil=KALIBRACJA lub profil=HEURYSTYKA.
- Po START panel sterowania zostaje zwinięty, dzięki czemu mniej zasłania ważny tekst ROUND.
- Dotychczasowa stabilizacja rundy i dziennik działania pozostały.

## Ważne ograniczenia
- Po obecnym zgłoszeniu nie ma nowego logu — udostępniono zdjęcie reklamy, więc celowanie nie mogło zostać niezależnie zweryfikowane.
- Zapisany gest jest oparty na DWÓCH punktach kalibracji. Nie jest automatycznym rozpoznaniem sposobu przeciągania palca w grze. Jeśli kierunek strzału w Castle Busters jest odwrotny, potrzebne jest nagranie ręcznego celowania.
- Program nie otwiera zakupów, nie wciska ceny i nie klika reklam w celu zdobycia bonusu. Dotyka wyłącznie rozpoznanego X okienka.
- Detektor działa na obrazach z gry w orientacji poziomej, ale nie ma gwarancji wykrywania wszystkich ofert.
- "GEST Android ZAKOŃCZONY" oznacza gest systemu, a nie potwierdzony strzał lub trafienie.
- Automatyzacja PvP może naruszać regulamin gry.

## Pobieranie
1. Otwórz https://github.com/Gruszeczkaoo/PomagierAndroid/actions/workflows/castlebot-build.yml
2. Wybierz najnowszy ZIELONY build gałęzi castlebot-v0.2.
3. Pobierz CastleBot_by_Don_v0.3.3_debug_APK, wypakuj app-debug.apk i zainstaluj na Androidzie.
4. W razie konfliktu podpisu debug odinstaluj jedynie starszego CastleBota, po instalacji przyznaj uprawnienie dostępności ponownie.

## Co wysłać do dalszej diagnozy
- Eksport logu podczas jednej walki, szczególnie RUNDA ZATWIERDZONA / CEL / AUTO gesture / GEST.
- Krótkie nagranie jednej ręcznej próby strzału od dotknięcia jednostki do wypuszczenia pocisku.
