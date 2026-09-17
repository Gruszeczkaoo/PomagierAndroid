// ==UserScript==
// @name         Pomagier by Don
// @namespace    local.menelgame.tools
// @version      8.8.13
// @description  Pomagier by Don: PvP Lab REAL 1:1 + Boss Lab 15T HP-FIRST; hotfix cache V6 i wymuszone świeże przeliczanie przed eksportem.
// @match        https://menelgame.online/*
// @grant        none
// @run-at       document-start
// @sandbox      raw
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '8.8.13';
  const ANDROID_APP = typeof window.AndroidBridge !== 'undefined';
  const BOSS_OPTIMIZER_METHOD = 'BOSS_TIMEOUT_AWARE_HP_FIRST_V6';
  // v8.8.13 ALCOHOL AUTO LEARN:
  // - dodaje niezależny automat produkcji alkoholu w Melinie, bez sprzedaży za Złote Zęby,
  // - profil uczy się z jednego ręcznego cyklu: Odbierz -> dokup brakujące -> Wytwarzaj (x1/x2),
  // - zapisuje bezpieczne szablony requestów bez nagłówków autoryzacji i potrafi je odtwarzać po zakończeniu czasu,
  // - można nauczyć kilka profili i wybrać aktywny w Pomagierze; zakupy braków można wyłączyć osobno.
  // v8.8.12 MENEL PENDING-ONLY FIX:
  // - naprawia pętlę po zakończonym MenelMode, gdy status ma pendingCompletion=true i lastMenelModeResult=null,
  // - jeśli wynik istnieje w character.pending_activity_result, Pomagier wykonuje zwykły /clear-result zamiast żądać ręcznej nauki,
  // - ręcznie nauczona sekwencja pozostaje fallbackiem tylko przy faktycznym braku payloadu wyniku.
  // v8.8.11 BOSS TIMEOUT CACHE FIX:
  // - wykrywa i unieważnia zapisane wyniki optimizerów starszych niż V6 (np. BOSS_BUFF_AWARE_WIN_FIRST_V5),
  // - stary BEST BUILD nie może już pozostać aktywny po aktualizacji skryptu,
  // - Synchronizuj zawsze przelicza bossy z walkami aktualnym silnikiem V6,
  // - Eksport Boss JSON przed zapisem wymusza aktualny V6 dla ostatnio walczonego bossa,
  // - eksport zapisuje także optimizerMethod/optimizerSchema, aby od razu było widać czy cache jest świeży.
  // v8.8.10 BOSS TIMEOUT-AWARE / 15T HP-FIRST:
  // - naprawa kluczowej reguły: boss nie musi paść przed nami — po 15 turach liczy się bezwzględne HP pozostałe obu stron,
  // - optimizer symuluje 15 tur z eskalacją obrażeń, narastającym ATK/turę, execute, regenem i lifestealem,
  // - BEST BUILD jest wybierany po przewidywanym wyniku i fightHpMargin (HP przy rozstrzygnięciu), a nie po survivalTurns-killTurns,
  // - osobno raportuje BEST RESULT, BEST TIMEOUT HP, MAX SURVIVAL, MAX DAMAGE i FASTEST KILL,
  // - minimalne boss-only ATK/DEF/HP są liczone do faktycznej przewidywanej wygranej (kill lub timeout HP), nie do starego marginTurns >= 0,
  // - model pozostaje ostrożny: przy jednej walce kalibracyjnej ATAKUJ wymaga dodatniego bufora HP.
  // v8.8.9 BOSS BUFF AWARE:
  // - Boss Lab pobiera /api/character/{id}/active-modifiers i wykrywa dedykowane boss-only buffy: atak, obrona i maks. HP,
  // - aktywne boss buffy są dodawane do każdej symulowanej konfiguracji, ale nigdy nie mieszają się z PvP Lab,
  // - przy braku wygrywającego buildu kalkulator podaje minimalny dodatkowy płaski boss ATK / DEF / HP potrzebny (osobno) do marginTurns >= 0,
  // - replay zapisuje snapshot wykrytych boss buffów, żeby kolejne kalibracje wiedziały, z jakim wsparciem wykonano próbę.
  // v8.8.8 BOSS WIN-FIRST:
  // - BEST BUILD bossa jest wybierany przede wszystkim po marginTurns = survivalTurns - killTurns, a nie po ogólnym metaScore,
  // - szeroki multi-start: breakpointy + 2 pkt, plany greedy/all-A/all-B oraz osobne pule MAX MARGIN / MAX SURVIVAL / MAX DAMAGE / FASTEST KILL / MAX WIN INDEX,
  // - lokalne przesuwanie punktów zachowuje wybory A/B, a koordynacyjny flip skilli optymalizuje dokładnie wybrany cel,
  // - raportuje najlepszy margines, maksymalne przeżycie, maksymalny damage, najszybsze zabicie i szacowany brakujący boost/redukcję,
  // - werdykt ATAKUJ wymaga faktycznie dodatniego zapasu po kalibracji replay; boss nadal nie wpływa na PvP Lab.
  // v8.8.7 BOSS CALIBRATED:
  // - symulator bossa jest kalibrowany do faktycznych replayów: osobno obrażenia zadawane, przyjmowane i leczenie obu stron,
  // - bieżący build musi po kalibracji odtwarzać realny przebieg walki zamiast opierać się wyłącznie na formule teoretycznej,
  // - BEST BUILD pokazuje werdykt ATAKUJ / RYZYKO / NIE ATAKUJ oraz margines killTurns vs survivalTurns,
  // - kalibracja jest liczona per boss i nie wpływa na PvP Lab; dane pozostają w istniejącym storage Boss Lab v8.8.5+.
  // v8.8.6 BOSS SIM:
  // - naprawiony optimizer bossa: używa realnego ATK/DEF/HP i pełnych statystyk bossa z replaya,
  // - estymuje obrażenia, przeżywalność, czas zabicia i indeks zwycięstwa zamiast używać ogólnego score PvP,
  // - uwzględnia trafienie/unik, pancerz, redukcję, crit, double, counter, bleed, lifesteal, regen i execute,
  // - deduplikuje TOP buildów i pokazuje szacowane TTK / przeżycie.
  // v8.8.5 BOSS LAB:
  // - osobna baza walk bossów z /api/boss-combat/.../attack i /rematch, niezależna od PvP Meta,
  // - zapis pełnych eventów, surowych fighterów, obserwowanych statystyk i buildu użytego w chwili walki,
  // - osobny optimizer 132 pkt + A/B liczony dla konkretnego bossa; dane bossów NIGDY nie wpływają na PvP Lab,
  // - lista bossów /api/boss-combat/{characterId}/bosses jest przechwytywana i archiwizowana.
  // v8.8.4 REAL PVP 1:1:
  // - pojedynki o PRESTIŻ oraz normalne ATAKI/OBRONY PvP są TAK SAMO WAŻNE: każda walka ma wagę 1,
  // - normalny ATAK i normalna OBRONA również mają identyczną wagę 1,
  // - BEST BUILD, profil przeciwników i empiryczny ranking użytych buildów korzystają z obu źródeł 1:1,
  // - nie pomniejszamy wagi przy wielokrotnych walkach z tym samym przeciwnikiem,
  // - Arena i Arena TEST nadal mają wpływ = 0 na BEST BUILD.
  // v8.8.3 PRESTIGE + NORMAL RECON: normalne PvP służyło tylko pomocniczo do rozpoznania mety.
  // v8.8.2 PRESTIGE-ONLY: BEST BUILD i ranking buildów używały wyłącznie pojedynków o prestiż.
  // v8.8.1 PVP LAB META: naprawa merge/detail/404/czasu, pełniejsze wydobywanie danych z eventów,
  // snapshoty obronne oraz PRESTIGE META OPTIMIZER. Rekomendacja buildu jest liczona bez zmiany buildu postaci.
  // v8.7.8 TRAVEL + ORPHAN CRAFT FIX: automatycznie odbiera zakończoną podróż (pendingArrival) zwykłym
  // /api/travel/complete z instant:false, więc postać nie zawisa w autobusie przy 0 s.
  // Gotowy craft z serwerowego READY może zostać bezpiecznie zaadoptowany do profitJobs, nawet jeśli lokalny job zniknął,
  // a następnie odebrany i przekazany do normalnej kolejki sprzedaży.
  // v8.7.7 POTATO GARDEN PRIORITY: Młode ziemniaki (plantId 2, Sadzeniaczek itemId 804) mają pierwszeństwo.
  // Ogród kupuje ZA PIENIĄDZE dokładnie brakującą liczbę sadzeniaków do wolnych grządek, a potem je obsadza.
  // Naprawia też stary hardcode cebuli: API mogło pokazywać ziemniaki w availableSeeds, a Pomagier raportował 0 i nic nie siał.
  // v8.7.6 SALE PIPELINE FIX: limit 2 aktywnych ofert tego samego produktu jest spójny z ekspozycją 2.
  // Czyści osierocone wpisy saleQueue, gdy ten sam inventoryId już fizycznie jest aktywną ofertą.
  // Dodatkowo bezpiecznie obniża stare, mocno zawyżone oferty produktów Pomagiera, nigdy nie podnosząc ceny.
  // v8.7.5 HOTFIX: przywraca inicjalizację pamięci self-learning (learner), przypadkowo usuniętą w v8.7.4.
  // Bez niej render zakładki Pomagier kończył się ReferenceError i panel pozostawał pusty.
  // v8.7.4 SESSION HISTORY: archiwizuje 10 ostatnich zakończonych sesji START→STOP.
  // Nowa zakładka SESJE pokazuje przychód, faktyczne wydatki, wynik na czysto, marżę sprzedaży i czas sesji.
  // Historia przetrwa odświeżenie/restart; STOP zapisuje sesję, a przycisk pozwala wyczyścić tylko historię sesji.
  // v8.7.3 ZOMBIE CRAFT FIX: jeśli lokalny job nadal ma status crafting, ale świeża kolejka/READY serwera
  // nie zawiera już queueId, Pomagier szuka fizycznego produktu w plecaku/rupieciarni/ofercie.
  // Produkt znaleziony w plecaku odzyskuje inventoryId, trafia do saleQueue i może zostać od razu wystawiony.
  // Zachowuje PIPELINE TRUTH FIX v8.7.2 i przekazywanie wyniku MenelMode do Brain v3.2.6.
  // v8.7.1 NPC OFF pozostaje aktywne: automatyczne ataki na NPC są tymczasowo twardo wyłączone.
  // MenelMode/Kombinowanie i ogród działają bez zmian; ogród nadal może zbierać/siać równolegle.
  // Podróż pozostaje osobnym blokującym stanem. Zachowuje MENEL SPACE FIX: MenelMode wymaga min. 1 wolnego slotu.
  // Pełna rupieciarnia sama w sobie nie blokuje MenelMode ani ogrodu — liczy się faktyczne miejsce w plecaku.
  // Zachowuje GARDEN TRUTH FIX, COIN PERMISSIONS i trwałe statystyki sesji.
  // Receptury bez monet są zawsze dozwolone; zaznaczone monety mogą być użyte tylko wtedy, gdy opłacalna receptura ich wymaga.
  // Sesja zysku pozostaje aktywna przez zwykłe odświeżenie strony aż do ręcznego STOP.
  const NPC_AUTO_ENABLED = false; // v8.7.1: tymczasowy twardy kill-switch NPC
  const LOCAL_AI_URL = 'http://127.0.0.1:8765';
  const LOCAL_AI_TOKEN = "cReAmap0WBb6Sj6cGa5S_1shC-BRzY_x";
  const RESOURCE_KEYS = ['zlom','odpady','tworzywa','tekstylia','elektrosmieci','komponenty_hq'];
  const RESOURCE_LABELS = {
    zlom:'Złom', odpady:'Odpady', tworzywa:'Tworzywa', tekstylia:'Tekstylia',
    elektrosmieci:'Elektrośmieci', komponenty_hq:'Komponenty HQ'
  };
  const STATIC_DISMANTLE = [{"id":34,"name":"Srebrne sztućce","baseTime":6000,"y":{"zlom":2},"paser":20,"collections":[{"name":"Niedzielna zastawa","tier":4,"repeatable":false}]},{"id":35,"name":"Zepsuty antyczny zegarek","baseTime":6000,"y":{"zlom":1,"elektrosmieci":1},"paser":22,"collections":[{"name":"Rodzinne pamiątki","tier":4,"repeatable":false}]},{"id":36,"name":"Stary zepsuty telewizor.","baseTime":10800,"y":{"zlom":1,"tworzywa":2,"elektrosmieci":2},"paser":25,"collections":[{"name":"Salon z odzysku","tier":4,"repeatable":false}]},{"id":37,"name":"Poniszczony antyczny fotel","baseTime":6000,"y":{"zlom":1,"tekstylia":5},"paser":50,"collections":[{"name":"Antyki","tier":2,"repeatable":false}]},{"id":39,"name":"Złoty pierścionek","baseTime":6000,"y":{"komponenty_hq":1},"paser":220,"collections":[{"name":"Elegancik spod wiaduktu","tier":4,"repeatable":false},{"name":"Skarb pirata","tier":4,"repeatable":false}]},{"id":43,"name":"Zapleśniała kanapa","baseTime":18000,"y":{"zlom":1,"odpady":2,"tekstylia":3},"paser":40,"collections":[{"name":"Salon z innej epoki","tier":4,"repeatable":false}]},{"id":44,"name":"Zabytkowe radio","baseTime":6000,"y":{"zlom":1,"tworzywa":1,"elektrosmieci":1},"paser":80,"collections":[{"name":"Carski salon","tier":4,"repeatable":false}]},{"id":45,"name":"Farelka","baseTime":18000,"y":{"zlom":1,"elektrosmieci":1},"paser":90,"collections":[{"name":"Nocleg w terenie","tier":4,"repeatable":false}]},{"id":46,"name":"Pralka","baseTime":9000,"y":{"zlom":4,"tworzywa":2,"elektrosmieci":2},"paser":150,"collections":[{"name":"RTV AGD","tier":2,"repeatable":false}]},{"id":47,"name":"Przenośna lodówka","baseTime":18000,"y":{"zlom":1,"tworzywa":1,"elektrosmieci":1},"paser":100,"collections":[{"name":"Król zimnego browara","tier":5,"repeatable":false}]},{"id":75,"name":"Stara lampa naftowa","baseTime":6000,"y":{"zlom":2,"tworzywa":1},"paser":12,"collections":[{"name":"Starocie","tier":1,"repeatable":false},{"name":"Komunalka","tier":3,"repeatable":true},{"name":"Carski salon","tier":4,"repeatable":false},{"name":"Światło sacrum i profanum","tier":4,"repeatable":false}]},{"id":76,"name":"Porcelanowy talerz","baseTime":6000,"y":{"komponenty_hq":1},"paser":10,"collections":[{"name":"Zestaw grillowy","tier":1,"repeatable":false},{"name":"Niedzielna zastawa","tier":4,"repeatable":false},{"name":"Salon z odzysku","tier":4,"repeatable":false}]},{"id":77,"name":"Mosiężny świecznik","baseTime":6000,"y":{"zlom":2},"paser":15,"collections":[{"name":"Carski salon","tier":4,"repeatable":false}]},{"id":78,"name":"Stara walizka","baseTime":6000,"y":{"zlom":1,"tekstylia":2},"paser":18,"collections":[{"name":"Zestaw podróżny","tier":1,"repeatable":false},{"name":"Komunalka","tier":3,"repeatable":true},{"name":"Nocleg w terenie","tier":4,"repeatable":false},{"name":"Rodzinne pamiątki","tier":4,"repeatable":false}]},{"id":79,"name":"Gramofon bez igły","baseTime":6000,"y":{"zlom":1,"tworzywa":1,"elektrosmieci":2},"paser":25,"collections":[{"name":"Starocie 2","tier":1,"repeatable":false},{"name":"Salon z innej epoki","tier":4,"repeatable":false},{"name":"Skarby ze strychu","tier":4,"repeatable":false}]},{"id":80,"name":"Zestaw kluczy","baseTime":6000,"y":{"zlom":1},"paser":12,"collections":[{"name":"Ślusarz jubilera","tier":4,"repeatable":false}]},{"id":81,"name":"Stara maszyna do pisania","baseTime":7200,"y":{"zlom":3,"tworzywa":1,"elektrosmieci":1},"paser":30,"collections":[{"name":"Starocie 2","tier":1,"repeatable":false},{"name":"Komunalka","tier":3,"repeatable":true},{"name":"Skarby ze strychu","tier":4,"repeatable":false}]},{"id":82,"name":"Mosiężna popielniczka","baseTime":6000,"y":{"zlom":1,"odpady":1,"tworzywa":1},"paser":10,"collections":[{"name":"Zestaw grillowy","tier":1,"repeatable":false},{"name":"Komunalka","tier":3,"repeatable":true},{"name":"Światło sacrum i profanum","tier":4,"repeatable":false}]},{"id":83,"name":"Stary aparat fotograficzny","baseTime":6000,"y":{"zlom":1,"tworzywa":1,"elektrosmieci":1},"paser":45,"collections":[{"name":"Sztuka ulicy","tier":4,"repeatable":false}]},{"id":84,"name":"Kryształowy wazon","baseTime":6000,"y":{"tworzywa":2},"paser":35,"collections":[{"name":"Salon z odzysku","tier":4,"repeatable":false}]},{"id":85,"name":"Skórzana torba","baseTime":6000,"y":{"tekstylia":5},"paser":30,"collections":[{"name":"Zestaw podróżny","tier":1,"repeatable":false},{"name":"Skarb pirata","tier":4,"repeatable":false}]},{"id":86,"name":"Stary zegarek kieszonkowy","baseTime":6000,"y":{"zlom":1,"komponenty_hq":1},"paser":55,"collections":[{"name":"Czasomierze","tier":2,"repeatable":false},{"name":"Rodzinne pamiątki","tier":4,"repeatable":false}]},{"id":87,"name":"Mosiężny kompas","baseTime":6000,"y":{"zlom":2,"tworzywa":1},"paser":38,"collections":[{"name":"Kolekcja podróżnika","tier":2,"repeatable":true}]},{"id":88,"name":"Porcelanowa figurka","baseTime":7200,"y":{"komponenty_hq":1},"paser":32,"collections":[{"name":"Skarby ze strychu","tier":4,"repeatable":false}]},{"id":89,"name":"Stary walkman","baseTime":6000,"y":{"zlom":1,"tworzywa":2,"elektrosmieci":2},"paser":50,"collections":[{"name":"Starocie 2","tier":1,"repeatable":false},{"name":"Komunalka","tier":3,"repeatable":true},{"name":"Salon z innej epoki","tier":4,"repeatable":false}]},{"id":90,"name":"Srebrna ramka na zdjęcia","baseTime":6000,"y":{"zlom":2},"paser":30,"collections":[{"name":"Rodzinne pamiątki","tier":4,"repeatable":false}]},{"id":91,"name":"Vintage krawat jedwabny","baseTime":6000,"y":{"tekstylia":2},"paser":35,"collections":[{"name":"Elegancik spod wiaduktu","tier":4,"repeatable":false}]},{"id":92,"name":"Stara lornetka","baseTime":6000,"y":{"zlom":2,"tworzywa":2},"paser":60,"collections":[{"name":"Myśliwy","tier":2,"repeatable":false},{"name":"Podróżnik","tier":3,"repeatable":false},{"name":"Nocleg w terenie","tier":4,"repeatable":false},{"name":"Skarb pirata","tier":4,"repeatable":false}]},{"id":93,"name":"Antyczny zegar ścienny","baseTime":6000,"y":{"zlom":1,"odpady":1,"komponenty_hq":1},"paser":85,"collections":[{"name":"Czasomierze","tier":2,"repeatable":false}]},{"id":94,"name":"Stara ikona prawosławna","baseTime":6000,"y":{"odpady":1,"tworzywa":1,"tekstylia":1},"paser":130,"collections":[{"name":"Światło sacrum i profanum","tier":4,"repeatable":false}]},{"id":95,"name":"Srebrna papierośnica","baseTime":6000,"y":{"zlom":2,"tworzywa":1},"paser":75,"collections":[{"name":"Osiedlowy kombinator","tier":4,"repeatable":false}]},{"id":96,"name":"Stary globus","baseTime":6000,"y":{"zlom":1,"tworzywa":2},"paser":65,"collections":[{"name":"Nocleg w terenie","tier":4,"repeatable":false}]},{"id":97,"name":"Porcelanowy serwis do kawy","baseTime":10800,"y":{"komponenty_hq":1},"paser":80,"collections":[{"name":"Niedzielna zastawa","tier":4,"repeatable":false}]},{"id":98,"name":"Mosiężny teleskop","baseTime":6000,"y":{"zlom":5},"paser":90,"collections":[{"name":"Skarb pirata","tier":4,"repeatable":false}]},{"id":99,"name":"Skórzany kufer podróżny","baseTime":6000,"y":{"zlom":1,"tworzywa":2,"tekstylia":3},"paser":70,"collections":[{"name":"Zestaw podróżny","tier":1,"repeatable":false}]},{"id":100,"name":"Stara mapa w ramie","baseTime":6000,"y":{"zlom":1,"tworzywa":2},"paser":100,"collections":[{"name":"Kolekcja podróżnika","tier":2,"repeatable":true}]},{"id":101,"name":"Kryształowa karafka","baseTime":6000,"y":{"tworzywa":2},"paser":60,"collections":[{"name":"Zestaw grillowy","tier":1,"repeatable":false},{"name":"Niedzielna zastawa","tier":4,"repeatable":false},{"name":"Salon z odzysku","tier":4,"repeatable":false},{"name":"Skarb pirata","tier":4,"repeatable":false}]},{"id":102,"name":"Vintage radio lampowe","baseTime":6000,"y":{"zlom":2,"tworzywa":1,"elektrosmieci":2},"paser":88,"collections":[{"name":"Salon z innej epoki","tier":4,"repeatable":false}]},{"id":103,"name":"Antyczna szkatułka na biżuterię","baseTime":6000,"y":{"zlom":1,"tworzywa":1,"tekstylia":1},"paser":120,"collections":[{"name":"Antyki","tier":2,"repeatable":false},{"name":"Komunalka","tier":3,"repeatable":true},{"name":"Niedzielna zastawa","tier":4,"repeatable":false}]},{"id":104,"name":"Srebrny świecznik kandelabrowy","baseTime":7200,"y":{"zlom":3,"tworzywa":1},"paser":140,"collections":[{"name":"Światło sacrum i profanum","tier":4,"repeatable":false}]},{"id":105,"name":"Stary saksofon","baseTime":7200,"y":{"zlom":4,"komponenty_hq":1},"paser":320,"collections":[]},{"id":106,"name":"Perski dywanik","baseTime":6000,"y":{"tekstylia":5},"paser":150,"collections":[{"name":"Wystrój wnętrz","tier":2,"repeatable":false},{"name":"Carski salon","tier":4,"repeatable":false}]},{"id":107,"name":"Zestaw srebrnych sztućców","baseTime":6000,"y":{"zlom":1,"komponenty_hq":1},"paser":200,"collections":[{"name":"Niedzielna zastawa","tier":4,"repeatable":false}]},{"id":108,"name":"Stara mandolina","baseTime":6000,"y":{"zlom":1,"odpady":1,"tekstylia":1},"paser":130,"collections":[{"name":"Kolekcja muzyczna","tier":2,"repeatable":false},{"name":"Sztuka ulicy","tier":4,"repeatable":false}]},{"id":109,"name":"Porcelanowa waza chińska","baseTime":10800,"y":{"tworzywa":1,"komponenty_hq":2},"paser":160,"collections":[{"name":"Salon z innej epoki","tier":4,"repeatable":false}]},{"id":110,"name":"Antyczny sekretarzyk","baseTime":6000,"y":{"zlom":1,"tworzywa":2,"tekstylia":1},"paser":190,"collections":[{"name":"Antyki","tier":2,"repeatable":false},{"name":"Rodzinne pamiątki","tier":4,"repeatable":false}]},{"id":111,"name":"Stary gramofon","baseTime":6000,"y":{"zlom":3,"tworzywa":2,"tekstylia":1,"elektrosmieci":3,"komponenty_hq":2},"paser":175,"collections":[]},{"id":112,"name":"Kolekcja monet","baseTime":6000,"y":{"zlom":1},"paser":110,"collections":[{"name":"Kolekcje","tier":2,"repeatable":false},{"name":"Komunalka","tier":3,"repeatable":true}]},{"id":113,"name":"Antyczny zegar kominkowy","baseTime":10800,"y":{"zlom":2,"odpady":1,"tworzywa":1,"tekstylia":1},"paser":250,"collections":[{"name":"Czasomierze","tier":2,"repeatable":false},{"name":"Skarby ze strychu","tier":4,"repeatable":false}]},{"id":114,"name":"Srebrna tabakiera z herbem","baseTime":6000,"y":{"zlom":2},"paser":280,"collections":[{"name":"Ślusarz jubilera","tier":4,"repeatable":false}]},{"id":115,"name":"Stare skrzypce","baseTime":6000,"y":{"zlom":1,"tworzywa":1,"tekstylia":1},"paser":350,"collections":[{"name":"Kolekcja muzyczna","tier":2,"repeatable":false},{"name":"Carski salon","tier":4,"repeatable":false}]},{"id":116,"name":"Obraz olejny w złoconej ramie","baseTime":6000,"y":{"tworzywa":1,"tekstylia":1,"komponenty_hq":1},"paser":300,"collections":[{"name":"Sztuka ulicy","tier":4,"repeatable":false}]},{"id":117,"name":"Antyczna broszka z kamieniami","baseTime":6000,"y":{"zlom":1,"tworzywa":1,"komponenty_hq":1},"paser":220,"collections":[{"name":"Antyki","tier":2,"repeatable":false}]},{"id":118,"name":"Komplet porcelany Miśnia","baseTime":7200,"y":{"tworzywa":1,"komponenty_hq":1},"paser":400,"collections":[{"name":"Salon z odzysku","tier":4,"repeatable":false}]},{"id":119,"name":"Stary samowar rosyjski","baseTime":10800,"y":{"zlom":3,"tworzywa":1,"komponenty_hq":1},"paser":320,"collections":[{"name":"Carski salon","tier":4,"repeatable":false}]},{"id":121,"name":"Złoty medalion","baseTime":6000,"y":{"komponenty_hq":1},"paser":500,"collections":[{"name":"Rodzinne pamiątki","tier":4,"repeatable":false},{"name":"Gorączka złota","tier":5,"repeatable":false}]},{"id":122,"name":"Antyczny fortepian","baseTime":10800,"y":{"zlom":4,"tworzywa":1,"tekstylia":1,"komponenty_hq":5},"paser":1000,"collections":[{"name":"Kolekcja ekskluzywna","tier":3,"repeatable":false},{"name":"Rodzinne pamiątki","tier":4,"repeatable":false},{"name":"Skarby ze strychu","tier":4,"repeatable":false},{"name":"Trasa koncertowa","tier":5,"repeatable":false}]},{"id":135,"name":"Zagrzybiały materac","baseTime":6000,"y":{"odpady":3,"tekstylia":2},"paser":5,"collections":[{"name":"Nocleg w terenie","tier":4,"repeatable":false}]},{"id":141,"name":"Jabol \"Smaczny\"","baseTime":1800,"y":{"odpady":1,"tworzywa":1},"paser":3,"collections":[{"name":"Kolekcja win","tier":1,"repeatable":false}]},{"id":142,"name":"Jabol \"Mocny\"","baseTime":1800,"y":{"odpady":1,"tworzywa":1},"paser":3,"collections":[{"name":"Kolekcja win","tier":1,"repeatable":false}]},{"id":143,"name":"Tani Kwiaśniak","baseTime":1800,"y":{"odpady":1,"tworzywa":1},"paser":3,"collections":[{"name":"Kolekcja win","tier":1,"repeatable":false},{"name":"Kolekcja winiarska","tier":1,"repeatable":true}]},{"id":144,"name":"Zgniłe Jabłko","baseTime":1200,"y":{"odpady":2},"paser":null,"collections":[]},{"id":145,"name":"Guma do żucia","baseTime":1200,"y":{"odpady":1},"paser":null,"collections":[]},{"id":146,"name":"Baton orzechowy","baseTime":1200,"y":{"odpady":1,"tworzywa":1},"paser":1,"collections":[{"name":"Zestaw śniadaniowy","tier":1,"repeatable":false}]},{"id":147,"name":"Baton proteinowy","baseTime":1200,"y":{"odpady":1,"tworzywa":1},"paser":1,"collections":[]},{"id":158,"name":"Teczka z aktami","baseTime":6000,"y":{"tworzywa":2,"tekstylia":3},"paser":300,"collections":[{"name":"Tajne archiwum PRL","tier":4,"repeatable":false}]},{"id":161,"name":"Stary materac","baseTime":6000,"y":{"odpady":1,"tekstylia":3},"paser":20,"collections":[{"name":"Starocie","tier":1,"repeatable":false},{"name":"Nocleg w terenie","tier":4,"repeatable":false}]},{"id":162,"name":"Materac dla dzieci","baseTime":6000,"y":{"tworzywa":2,"tekstylia":3},"paser":30,"collections":[]},{"id":163,"name":"Materac do pływania","baseTime":6000,"y":{"tworzywa":5},"paser":60,"collections":[]},{"id":164,"name":"Stary telewizor","baseTime":7200,"y":{"zlom":1,"tworzywa":2,"elektrosmieci":4},"paser":150,"collections":[{"name":"Starocie 2","tier":1,"repeatable":false},{"name":"Salon z innej epoki","tier":4,"repeatable":false},{"name":"Salon z odzysku","tier":4,"repeatable":false}]},{"id":165,"name":"Kominek elektryczny","baseTime":14400,"y":{"zlom":3,"elektrosmieci":2,"komponenty_hq":2},"paser":500,"collections":[{"name":"RTV AGD","tier":2,"repeatable":false},{"name":"Światło sacrum i profanum","tier":4,"repeatable":false}]},{"id":172,"name":"Ziemniaki \"Irga\"","baseTime":3600,"y":{"odpady":1},"paser":null,"collections":[]},{"id":173,"name":"Ziemniaki \"Vineta\"","baseTime":3600,"y":{"odpady":1},"paser":null,"collections":[]},{"id":175,"name":"Argentyński kaktus","baseTime":6000,"y":{"odpady":3},"paser":200,"collections":[]},{"id":176,"name":"Złoty łańcuch","baseTime":6000,"y":{"komponenty_hq":3},"paser":500,"collections":[]},{"id":177,"name":"Stara pralka","baseTime":7200,"y":{"zlom":4,"tworzywa":1,"elektrosmieci":1},"paser":80,"collections":[]},{"id":178,"name":"Dywan","baseTime":6000,"y":{"tekstylia":5},"paser":200,"collections":[{"name":"Kolekcja podróżnika","tier":2,"repeatable":true},{"name":"Wystrój wnętrz","tier":2,"repeatable":false}]},{"id":179,"name":"Zestaw garnków","baseTime":6000,"y":{"zlom":4,"tworzywa":2},"paser":400,"collections":[]},{"id":180,"name":"Zestaw perfum","baseTime":6000,"y":{"tworzywa":1,"komponenty_hq":1},"paser":300,"collections":[]},{"id":181,"name":"Akordeon","baseTime":6000,"y":{"zlom":2,"tekstylia":1,"komponenty_hq":1},"paser":200,"collections":[{"name":"Kolekcja muzyczna","tier":2,"repeatable":false},{"name":"Sztuka ulicy","tier":4,"repeatable":false}]},{"id":185,"name":"Kolekcja płyt Disco Polo","baseTime":7200,"y":{"tworzywa":3},"paser":200,"collections":[{"name":"AC/CD","tier":2,"repeatable":true},{"name":"Kolekcje","tier":2,"repeatable":false}]},{"id":186,"name":"Zestaw noży kuchennych","baseTime":6000,"y":{"zlom":4},"paser":200,"collections":[]},{"id":187,"name":"Zestaw pościeli","baseTime":7200,"y":{"tekstylia":8},"paser":200,"collections":[]},{"id":191,"name":"Kukła do żebrania","baseTime":6000,"y":{"odpady":1,"tekstylia":3},"paser":20,"collections":[]},{"id":193,"name":"Flet prosty","baseTime":6000,"y":{"tworzywa":1},"paser":25,"collections":[{"name":"Kolekcja muzyczna","tier":2,"repeatable":false},{"name":"Sztuka ulicy","tier":4,"repeatable":false}]},{"id":195,"name":"3 kubki i piłeczka","baseTime":6000,"y":{"tworzywa":1},"paser":1,"collections":[{"name":"Osiedlowy kombinator","tier":4,"repeatable":false}]},{"id":197,"name":"Karton fajek","baseTime":6000,"y":{"odpady":2,"tworzywa":1},"paser":60,"collections":[{"name":"Zestaw śniadaniowy","tier":1,"repeatable":false}]},{"id":202,"name":"Stary laptop","baseTime":7200,"y":{"zlom":1,"tworzywa":2,"elektrosmieci":4,"komponenty_hq":1},"paser":200,"collections":[]},{"id":203,"name":"Laptop","baseTime":10800,"y":{"zlom":1,"tworzywa":2,"elektrosmieci":5,"komponenty_hq":1},"paser":400,"collections":[{"name":"Jaskinia gracza","tier":5,"repeatable":false}]},{"id":204,"name":"Hulajnoga","baseTime":6000,"y":{"zlom":4,"tworzywa":1},"paser":200,"collections":[{"name":"Skóra, fura i komóra","tier":2,"repeatable":false},{"name":"Osiedlowy kombinator","tier":4,"repeatable":false}]},{"id":205,"name":"E-papieros Premium","baseTime":6000,"y":{"tworzywa":1,"elektrosmieci":1,"komponenty_hq":1},"paser":170,"collections":[]},{"id":206,"name":"E-papieros","baseTime":6000,"y":{"tworzywa":1,"elektrosmieci":1},"paser":40,"collections":[]},{"id":207,"name":"Okulary przeciwsłoneczne","baseTime":6000,"y":{"tworzywa":1},"paser":100,"collections":[]},{"id":208,"name":"Torba sportowa","baseTime":6000,"y":{"tworzywa":2,"tekstylia":5},"paser":100,"collections":[]},{"id":209,"name":"Markowe słuchawki","baseTime":7200,"y":{"tworzywa":2,"tekstylia":1,"elektrosmieci":2,"komponenty_hq":1},"paser":200,"collections":[{"name":"AC/CD","tier":2,"repeatable":true}]},{"id":210,"name":"Łancuszek","baseTime":6000,"y":{"zlom":1},"paser":60,"collections":[]},{"id":211,"name":"Stary telefon","baseTime":6000,"y":{"zlom":1,"tworzywa":2,"elektrosmieci":2},"paser":50,"collections":[{"name":"Starocie","tier":1,"repeatable":false},{"name":"Skóra, fura i komóra","tier":2,"repeatable":false}]},{"id":212,"name":"Tani zegarek","baseTime":6000,"y":{"elektrosmieci":1},"paser":40,"collections":[]},{"id":213,"name":"Ładny zegarek","baseTime":6000,"y":{"zlom":1,"komponenty_hq":2},"paser":600,"collections":[{"name":"Czasomierze","tier":2,"repeatable":false},{"name":"Kolekcja bez sensu","tier":3,"repeatable":false}]},{"id":216,"name":"Mocna kawa","baseTime":1800,"y":{"odpady":1,"tworzywa":1},"paser":null,"collections":[{"name":"Zestaw śniadaniowy","tier":1,"repeatable":false}]},{"id":217,"name":"Napój \"Turbo Boost\"","baseTime":1800,"y":{"zlom":1},"paser":null,"collections":[]},{"id":219,"name":"Obierki po ziemniakach","baseTime":1200,"y":{"odpady":2},"paser":null,"collections":[{"name":"Kolekcja bimbrownika","tier":1,"repeatable":false}]},{"id":220,"name":"Obierki po jabłkach","baseTime":1200,"y":{"odpady":2},"paser":null,"collections":[{"name":"Kolekcja bimbrownika","tier":1,"repeatable":false},{"name":"Kolekcja winiarska","tier":1,"repeatable":true}]},{"id":222,"name":"Drożdże winiarskie","baseTime":1800,"y":{"odpady":1},"paser":10,"collections":[{"name":"Kolekcja bimbrownika","tier":1,"repeatable":false},{"name":"Kolekcja winiarska","tier":1,"repeatable":true}]},{"id":224,"name":"Obraz baby z Kuną","baseTime":7200,"y":{"tekstylia":1,"komponenty_hq":3},"paser":1000,"collections":[]},{"id":225,"name":"Bezcenny argentyński kaktus","baseTime":6000,"y":{"odpady":6},"paser":200,"collections":[{"name":"Wystrój wnętrz","tier":2,"repeatable":false}]},{"id":226,"name":"Hamak","baseTime":6000,"y":{"tekstylia":4},"paser":200,"collections":[]},{"id":227,"name":"Ładna kanapa","baseTime":7200,"y":{"zlom":2,"tworzywa":1,"tekstylia":5,"komponenty_hq":1},"paser":600,"collections":[]},{"id":228,"name":"Uszkodzona lodówka premium","baseTime":10800,"y":{"zlom":6,"tworzywa":2,"elektrosmieci":2,"komponenty_hq":1},"paser":500,"collections":[{"name":"RTV AGD","tier":2,"repeatable":false},{"name":"Król zimnego browara","tier":5,"repeatable":false}]},{"id":229,"name":"Telewizor 32 cale","baseTime":14400,"y":{"zlom":2,"tworzywa":3,"elektrosmieci":5,"komponenty_hq":1},"paser":400,"collections":[{"name":"RTV AGD","tier":2,"repeatable":false},{"name":"Salon z innej epoki","tier":4,"repeatable":false}]},{"id":235,"name":"Nieznana substancja","baseTime":6000,"y":{"odpady":2,"komponenty_hq":1},"paser":null,"collections":[]},{"id":236,"name":"Markowy zegarek","baseTime":6000,"y":{"zlom":1,"tworzywa":1,"komponenty_hq":3},"paser":1200,"collections":[{"name":"Kolekcja ekskluzywna","tier":3,"repeatable":false},{"name":"Rodzinne pamiątki","tier":4,"repeatable":false}]},{"id":237,"name":"Monstera Adansonii Variegata","baseTime":7200,"y":{"odpady":8,"komponenty_hq":1},"paser":500,"collections":[{"name":"Wystrój wnętrz","tier":2,"repeatable":false}]},{"id":238,"name":"Porcelanowy wazon","baseTime":7200,"y":{"komponenty_hq":3},"paser":900,"collections":[]},{"id":239,"name":"Lodówka Premium","baseTime":18000,"y":{"zlom":7,"tworzywa":3,"elektrosmieci":3,"komponenty_hq":2},"paser":1200,"collections":[{"name":"Król zimnego browara","tier":5,"repeatable":false}]},{"id":240,"name":"Pralko-suszarka","baseTime":14400,"y":{"zlom":6,"tworzywa":2,"elektrosmieci":3,"komponenty_hq":2},"paser":900,"collections":[]},{"id":241,"name":"Łoże małżeńskie","baseTime":10800,"y":{"zlom":3,"tekstylia":5,"komponenty_hq":2},"paser":1000,"collections":[]},{"id":242,"name":"Smart TV 55 cali","baseTime":18000,"y":{"zlom":2,"tworzywa":3,"elektrosmieci":6,"komponenty_hq":3},"paser":1000,"collections":[]},{"id":244,"name":"Drogi alkohol","baseTime":6000,"y":{"tworzywa":1,"komponenty_hq":1},"paser":300,"collections":[]},{"id":270,"name":"Znaczone karty","baseTime":6000,"y":{"tworzywa":1},"paser":60,"collections":[]},{"id":271,"name":"Zestaw wytrychów","baseTime":6000,"y":{"zlom":2,"tworzywa":2},"paser":100,"collections":[{"name":"Szemrany interes","tier":5,"repeatable":false}]},{"id":272,"name":"Sztuczna ręka","baseTime":6000,"y":{"zlom":1,"tworzywa":3},"paser":30,"collections":[]},{"id":280,"name":"Cebula","baseTime":1200,"y":{"odpady":1},"paser":null,"collections":[]},{"id":281,"name":"Pospolity pas","baseTime":6000,"y":{"tekstylia":1},"paser":30,"collections":[]},{"id":282,"name":"Rzadki pas","baseTime":6000,"y":{"tekstylia":2},"paser":60,"collections":[]},{"id":283,"name":"Epicki pas","baseTime":6000,"y":{"tworzywa":2,"tekstylia":3},"paser":90,"collections":[]},{"id":284,"name":"Legendarny pas","baseTime":6000,"y":{"tworzywa":2,"tekstylia":4,"komponenty_hq":1},"paser":120,"collections":[]},{"id":286,"name":"Pospolite okulary","baseTime":6000,"y":{"tworzywa":1},"paser":15,"collections":[]},{"id":287,"name":"Rzadkie okulary","baseTime":6000,"y":{"tworzywa":1},"paser":30,"collections":[]},{"id":288,"name":"Epickie okulary","baseTime":6000,"y":{"tworzywa":1,"komponenty_hq":1},"paser":90,"collections":[]},{"id":289,"name":"Legendarne okulary","baseTime":6000,"y":{"tworzywa":1,"komponenty_hq":2},"paser":120,"collections":[]},{"id":290,"name":"Pospolita Bandana","baseTime":6000,"y":{"tekstylia":1},"paser":30,"collections":[]},{"id":291,"name":"Rzadka bandana","baseTime":6000,"y":{"tekstylia":2},"paser":60,"collections":[]},{"id":292,"name":"Epicka bandana","baseTime":6000,"y":{"tekstylia":3},"paser":90,"collections":[]},{"id":293,"name":"Legendarna bandana","baseTime":6000,"y":{"tekstylia":4,"komponenty_hq":1},"paser":120,"collections":[]},{"id":294,"name":"Pospolity sygnet","baseTime":6000,"y":{"tworzywa":1},"paser":30,"collections":[]},{"id":295,"name":"Rzadki sygnet","baseTime":6000,"y":{"tworzywa":2},"paser":60,"collections":[]},{"id":296,"name":"Epicki sygnet","baseTime":6000,"y":{"tworzywa":2,"komponenty_hq":1},"paser":90,"collections":[]},{"id":297,"name":"Legendarny sygnet","baseTime":6000,"y":{"tworzywa":2,"komponenty_hq":2},"paser":120,"collections":[]},{"id":318,"name":"Drogie skrzypce","baseTime":6000,"y":{"komponenty_hq":4},"paser":1200,"collections":[{"name":"Kolekcja ekskluzywna","tier":3,"repeatable":false},{"name":"Kombinowanie","tier":3,"repeatable":false},{"name":"Skarby ze strychu","tier":4,"repeatable":false},{"name":"Sztuka ulicy","tier":4,"repeatable":false}]},{"id":319,"name":"Terminal płatniczy","baseTime":10800,"y":{"tworzywa":2,"elektrosmieci":4,"komponenty_hq":2},"paser":600,"collections":[{"name":"Kombinowanie","tier":3,"repeatable":false},{"name":"Osiedlowy kombinator","tier":4,"repeatable":false}]},{"id":320,"name":"Zestaw hazardzisty","baseTime":6000,"y":{"zlom":1,"tworzywa":2,"tekstylia":1},"paser":800,"collections":[{"name":"Kombinowanie","tier":3,"repeatable":false},{"name":"Osiedlowy kombinator","tier":4,"repeatable":false}]},{"id":321,"name":"Zestaw handlarza","baseTime":6000,"y":{"zlom":1,"tworzywa":2,"tekstylia":2},"paser":1000,"collections":[{"name":"Kombinowanie","tier":3,"repeatable":false}]},{"id":322,"name":"Fletnia Pana","baseTime":6000,"y":{"tworzywa":1,"komponenty_hq":1},"paser":300,"collections":[]},{"id":323,"name":"Magnes neodymowy","baseTime":6000,"y":{"zlom":3},"paser":150,"collections":[]},{"id":324,"name":"Mały zestaw hazardzisty","baseTime":6000,"y":{"tworzywa":1,"tekstylia":1},"paser":250,"collections":[]},{"id":325,"name":"Mały zestaw handlarza","baseTime":6000,"y":{"zlom":1,"tekstylia":1},"paser":300,"collections":[]},{"id":326,"name":"Pakiet zupek chińskich","baseTime":6000,"y":{"odpady":2,"tworzywa":2},"paser":80,"collections":[]},{"id":327,"name":"Globus Polski","baseTime":6000,"y":{"zlom":1,"tworzywa":2},"paser":100,"collections":[{"name":"Kolekcja podróżnika","tier":2,"repeatable":true}]},{"id":328,"name":"Bezprzewodowy przedłużacz","baseTime":7200,"y":{"zlom":1,"tworzywa":1,"elektrosmieci":2},"paser":80,"collections":[{"name":"AC/CD","tier":2,"repeatable":true}]},{"id":368,"name":"Klocki Lego","baseTime":7200,"y":{"tworzywa":5,"komponenty_hq":1},"paser":1000,"collections":[{"name":"Niebezpieczeństwo","tier":3,"repeatable":false}]},{"id":369,"name":"Markowy Smartwatch","baseTime":14400,"y":{"tworzywa":1,"elektrosmieci":4,"komponenty_hq":4},"paser":1000,"collections":[{"name":"Luksus","tier":3,"repeatable":false},{"name":"Podróżnik","tier":3,"repeatable":false},{"name":"Elegancik spod wiaduktu","tier":4,"repeatable":false}]},{"id":370,"name":"Air Fryer","baseTime":14400,"y":{"zlom":2,"tworzywa":2,"elektrosmieci":2,"komponenty_hq":3},"paser":1000,"collections":[{"name":"Luksus","tier":3,"repeatable":false},{"name":"Salon z odzysku","tier":4,"repeatable":false}]},{"id":371,"name":"iRobot","baseTime":10800,"y":{"zlom":1,"tworzywa":2,"elektrosmieci":4,"komponenty_hq":3},"paser":1000,"collections":[{"name":"Kolekcja bez sensu","tier":3,"repeatable":false},{"name":"Luksus","tier":3,"repeatable":false},{"name":"Salon z innej epoki","tier":4,"repeatable":false}]},{"id":372,"name":"Piecyk elektryczny premium","baseTime":18000,"y":{"zlom":4,"tworzywa":1,"elektrosmieci":3,"komponenty_hq":2},"paser":800,"collections":[]},{"id":378,"name":"Mina przeciwpancerna","baseTime":18000,"y":{"zlom":9,"elektrosmieci":2,"komponenty_hq":2},"paser":1500,"collections":[{"name":"Historyk","tier":3,"repeatable":false},{"name":"Niebezpieczeństwo","tier":3,"repeatable":false}]},{"id":379,"name":"Kolekcja medali","baseTime":10800,"y":{"zlom":3,"komponenty_hq":2},"paser":1800,"collections":[{"name":"Historyk","tier":3,"repeatable":false},{"name":"Tajne archiwum PRL","tier":4,"repeatable":false},{"name":"Pamiątki oficera","tier":5,"repeatable":false}]},{"id":380,"name":"Zabytkowa radiostacja","baseTime":14400,"y":{"zlom":2,"elektrosmieci":5,"komponenty_hq":2},"paser":1500,"collections":[{"name":"Historyk","tier":3,"repeatable":false},{"name":"Tajne archiwum PRL","tier":4,"repeatable":false}]},{"id":381,"name":"Pocisk artyleryjski","baseTime":14400,"y":{"zlom":9,"komponenty_hq":2},"paser":1600,"collections":[{"name":"Historyk","tier":3,"repeatable":false},{"name":"Kolekcja 4 pory roku","tier":3,"repeatable":false},{"name":"Niebezpieczeństwo","tier":3,"repeatable":false},{"name":"Światło sacrum i profanum","tier":4,"repeatable":false}]},{"id":382,"name":"Obraz \"Bitwa pod Grunwaldem\"","baseTime":10800,"y":{"tworzywa":2,"tekstylia":2,"komponenty_hq":4},"paser":3000,"collections":[]},{"id":383,"name":"Antyczne szable","baseTime":14400,"y":{"zlom":3,"tworzywa":1,"tekstylia":1,"komponenty_hq":5},"paser":2200,"collections":[{"name":"Pamiątki oficera","tier":5,"repeatable":false}]},{"id":384,"name":"Thermocook","baseTime":14400,"y":{"zlom":3,"tworzywa":2,"elektrosmieci":3,"komponenty_hq":2},"paser":1500,"collections":[{"name":"Majówka","tier":3,"repeatable":false},{"name":"Niedzielna zastawa","tier":4,"repeatable":false},{"name":"Salon z odzysku","tier":4,"repeatable":false}]},{"id":385,"name":"Smartfon premium","baseTime":14400,"y":{"tworzywa":1,"elektrosmieci":4,"komponenty_hq":4},"paser":1500,"collections":[{"name":"Luksus","tier":3,"repeatable":false}]},{"id":386,"name":"Hulajnoga premium","baseTime":10800,"y":{"zlom":5,"tworzywa":1,"elektrosmieci":3,"komponenty_hq":2},"paser":1600,"collections":[{"name":"Majster","tier":3,"repeatable":false},{"name":"Niebezpieczeństwo","tier":3,"repeatable":false}]},{"id":387,"name":"Grill elektryczny","baseTime":10800,"y":{"zlom":3,"tworzywa":1,"elektrosmieci":2,"komponenty_hq":1},"paser":800,"collections":[{"name":"Majówka","tier":3,"repeatable":false},{"name":"Niedzielna zastawa","tier":4,"repeatable":false}]},{"id":390,"name":"Krwisty stek","baseTime":1800,"y":{"odpady":6},"paser":250,"collections":[]},{"id":412,"name":"Krasnal ogrodowy","baseTime":6000,"y":{"zlom":2,"tworzywa":3,"komponenty_hq":1},"paser":300,"collections":[]},{"id":435,"name":"Rama od roweru","baseTime":3600,"y":{"zlom":2},"paser":10,"collections":[{"name":"Sztuka ulicy","tier":4,"repeatable":false}]},{"id":436,"name":"Dziurawe wiadro","baseTime":3600,"y":{"zlom":2},"paser":9,"collections":[{"name":"Warsztat pancerny","tier":4,"repeatable":false}]},{"id":437,"name":"Stare żelazko","baseTime":5400,"y":{"zlom":2,"elektrosmieci":1},"paser":12,"collections":[{"name":"Skarby ze strychu","tier":4,"repeatable":false}]},{"id":438,"name":"Antena TV","baseTime":5400,"y":{"zlom":2},"paser":12,"collections":[{"name":"Tajne archiwum PRL","tier":4,"repeatable":false}]},{"id":439,"name":"Podkowa","baseTime":3600,"y":{"zlom":2},"paser":8,"collections":[{"name":"Komunalka","tier":3,"repeatable":true}]},{"id":440,"name":"Masywne imadło","baseTime":7200,"y":{"zlom":8},"paser":22,"collections":[{"name":"Warsztat pancerny","tier":4,"repeatable":false}]},{"id":441,"name":"Kowadło","baseTime":5400,"y":{"zlom":8},"paser":20,"collections":[{"name":"Ślusarz jubilera","tier":4,"repeatable":false}]},{"id":442,"name":"Stara wiertarka","baseTime":7200,"y":{"zlom":5,"elektrosmieci":2},"paser":30,"collections":[{"name":"Osiedlowy kombinator","tier":4,"repeatable":false}]},{"id":443,"name":"Wiadro ze złomem","baseTime":300,"y":{"zlom":16},"paser":50,"collections":[]},{"id":451,"name":"Fejkowy Katalizator","baseTime":14400,"y":{"zlom":4},"paser":500,"collections":[{"name":"Majster","tier":3,"repeatable":false},{"name":"Ślusarz jubilera","tier":4,"repeatable":false},{"name":"Warsztat turbo","tier":5,"repeatable":false}]},{"id":452,"name":"Chip mocy","baseTime":10800,"y":{"zlom":2,"elektrosmieci":2},"paser":500,"collections":[{"name":"Majster","tier":3,"repeatable":false},{"name":"Ślusarz jubilera","tier":4,"repeatable":false}]},{"id":455,"name":"Skrzynia z narzędziami","baseTime":14400,"y":{"zlom":10,"tworzywa":1,"tekstylia":1,"elektrosmieci":3,"komponenty_hq":1},"paser":1000,"collections":[]},{"id":456,"name":"Używana opona do Stara","baseTime":18000,"y":{"tworzywa":12},"paser":300,"collections":[{"name":"Majster","tier":3,"repeatable":false},{"name":"Warsztat pancerny","tier":4,"repeatable":false}]},{"id":481,"name":"Lodówka Ultra-Premium","baseTime":60,"y":{"zlom":9,"tworzywa":5,"elektrosmieci":6,"komponenty_hq":5},"paser":3000,"collections":[{"name":"Kolekcja 4 pory roku","tier":3,"repeatable":false},{"name":"Król zimnego browara","tier":5,"repeatable":false}]},{"id":497,"name":"Komponenty HQ 20 szt.","baseTime":120,"y":{"komponenty_hq":20},"paser":1000,"collections":[{"name":"Miszmasz","tier":3,"repeatable":false}]},{"id":562,"name":"Elektrośmieci 30 szt.","baseTime":3600,"y":{"elektrosmieci":30},"paser":1000,"collections":[]},{"id":563,"name":"Odpady 40 szt.","baseTime":3600,"y":{"odpady":40},"paser":1000,"collections":[]},{"id":564,"name":"Tekstylia 30 szt.","baseTime":3600,"y":{"tekstylia":30},"paser":1000,"collections":[]},{"id":565,"name":"Tworzywa sztuczne 30 szt.","baseTime":3600,"y":{"tworzywa":30},"paser":1000,"collections":[]},{"id":566,"name":"Złom 40 szt.","baseTime":3600,"y":{"zlom":40},"paser":1000,"collections":[]}];

  const DEFAULTS = {
    characterId: 462,
    refreshSeconds: 60,
    listingFeeRate: 0.05,
    noSilverGold: true, // legacy — zachowane dla migracji starych ustawień
    coinProductionMode: 'safe', // legacy — zachowane do migracji/snapshotów
    coinAllowBronze: true,
    coinAllowSilver: false,
    coinAllowGold: false,
    onlyLearned: true,
    onlyProfitable: true,
    rankingMetric: 'cashProfitHour',
    resourceFocus: 'odpady',
    alertBestProfit: 2500,
    maxHistoryRows: 5000,
    compact: false,
    watch: [
      {id:620,name:'Dopalacz: Krokodyl',above:null,below:null},
      {id:621,name:'Dopalacz: Mocarz',above:null,below:null},
      {id:622,name:'Dopalacz: Tajfun',above:null,below:null}
    ]
  };

  const K = {
    settings:'mg_mp_settings_v2',
    history:'mg_mp_history_v2',
    pos:'mg_mp_pos_v2',
    tab:'mg_mp_tab_v2',
    nativeCache:'mg_mp_native_cache_v22',
    autoSettings:'mg_mp_auto_settings_v3',
    autoLog:'mg_mp_auto_log_v3',
    autoSpend:'mg_mp_auto_spend_v3',
    manualPrefs:'pomagier_manual_prefs_v33',
    profitJobs:'pomagier_profit_jobs_v4',
    saleQueue:'pomagier_sale_queue_v4',
    profitStats:'pomagier_profit_stats_v4',
    sessionStats:'pomagier_session_stats_v866',
    sessionHistory:'pomagier_session_history_v874',
    lastSeenPrices:'pomagier_last_seen_prices_v412',
    strategicSpend:'pomagier_strategic_spend_v43',
    recoveryTicket:'pomagier_recovery_ticket_v45',
    learner:'pomagier_self_learning_v5',
    localAiEvents:'pomagier_local_ai_events_v7',
    menelCloseLearned:'pomagier_menel_close_learned_v82',
    melinaAddLearned:'pomagier_melina_add_learned_v84',
    localAiPersistent:'pomagier_local_ai_persistent_v84',
    pvpLab:'pomagier_pvp_lab_v880',
    pvpLabCfg:'pomagier_pvp_lab_cfg_v880',
    bossLab:'pomagier_boss_lab_v885',
    bossLabCfg:'pomagier_boss_lab_cfg_v885',
    alcoholAuto:'pomagier_alcohol_auto_v1'
  };

  function loadJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
    catch { return fallback; }
  }
  function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  const __savedSettings = loadJSON(K.settings, {}) || {};
  const settings = Object.assign({}, DEFAULTS, __savedSettings);
  const __coinModes = new Set(['safe','none','bronze','silver','gold','coins','all']);
  if(!__coinModes.has(String(settings.coinProductionMode||''))){
    // Migracja v8.6.4 i starszych: zachowujemy dotychczasowe zachowanie.
    settings.coinProductionMode = settings.noSilverGold===false ? 'all' : 'safe';
  }
  // v8.6.7: stare tryby zamieniamy na NIEZALEŻNE uprawnienia monet.
  // Najważniejsza zmiana: receptura bez monet jest zawsze dopuszczona.
  const __hasCoinPermissions = ['coinAllowBronze','coinAllowSilver','coinAllowGold'].every(k=>Object.prototype.hasOwnProperty.call(__savedSettings,k));
  if(!__hasCoinPermissions){
    const legacy=String(settings.coinProductionMode||'safe');
    settings.coinAllowBronze = ['safe','bronze','coins','all'].includes(legacy);
    settings.coinAllowSilver = ['silver','coins','all'].includes(legacy);
    settings.coinAllowGold = ['gold','coins','all'].includes(legacy);
  }
  if (!Array.isArray(settings.watch)) settings.watch = DEFAULTS.watch;

  // Android v1.0.5 AUTO ACCOUNT ID:
  // ID postaci jest pobierane bezpośrednio z danych aktualnie zalogowanego konta gry.
  // Dzięki temu instalacja APK u innej osoby nie dziedziczy domyślnego ID 462.
  // Token nigdy nie jest zapisywany przez Pomagiera ani wysyłany do AndroidBridge.
  let __autoCharacterInfo = { id:Number(settings.characterId||0), nickname:'', detected:false };
  function clearAccountScopedLocalState(){
    [
      K.history,K.nativeCache,K.autoLog,K.autoSpend,K.profitJobs,K.saleQueue,K.profitStats,
      K.sessionStats,K.sessionHistory,K.lastSeenPrices,K.strategicSpend,K.recoveryTicket,
      K.learner,K.localAiEvents,K.menelCloseLearned,K.melinaAddLearned,K.localAiPersistent,
      K.pvpLab,K.bossLab
    ].forEach(key=>{ try{ localStorage.removeItem(key); }catch{} });
  }
  function syncCharacterIdFromGameAuth(){
    try{
      const raw=localStorage.getItem('menelgame_user');
      if(!raw) return false;
      const auth=JSON.parse(raw);
      const id=Number(auth?.character?.id||0);
      if(!Number.isFinite(id) || id<=0) return false;
      const nickname=String(auth?.character?.nickname||'').trim();
      const oldId=Number(settings.characterId||0);
      const changed=oldId!==id;
      __autoCharacterInfo={id,nickname,detected:true};
      if(changed){
        // Przy zmianie konta wyczyść WYŁĄCZNIE dane robocze zależne od postaci.
        // Preferencje użytkownika (monety, tryby, limity) zostają zachowane.
        if(oldId>0) clearAccountScopedLocalState();
        settings.characterId=id;
        saveJSON(K.settings,settings);
        console.log('[Pomagier by Don] AUTO ACCOUNT ID', {oldId,newId:id,nickname:nickname||'—'});
      }
      return changed;
    }catch(e){
      return false;
    }
  }

  // Jeżeli gra jest już zalogowana w chwili startu skryptu, popraw ID zanim wczytamy cache.
  syncCharacterIdFromGameAuth();

  let history = loadJSON(K.history, []);
  if (!Array.isArray(history)) history = [];


  const PVP_LAB_DEFAULTS = {
    enabled:true,
    passiveCapture:true,
    autoSync:true,
    autoSyncMinutes:15,
    maxBattles:1200,
    backfillLimit:120,
    detailFetchPerSync:90,
    includeArenaTest:true,
    // REALNE PvP: PRESTIŻ i normalne ATAKI/OBRONY mają identyczną wagę 1. Arena/Arena TEST = 0.
    sourceWeights:{prestige:1,normal:1,arena:0,arena_test:0},
    optimizerEnabled:true,
    optimizerPrestigeOnly:false,
    optimizerMinRealPvp:8,
    optimizerMinPrestige:8,
    normalMetaEnabled:true,
    normalMetaAttackWeight:1.00,
    normalMetaDefenseWeight:1.00,
    normalMetaMaxAgeDays:60,
    normalMetaDeduplicateOpponents:false,
    skillTreeRefreshHours:12,
    opponentModelMaxAgeDays:60
  };

  const pvpLabCfg = Object.assign({}, PVP_LAB_DEFAULTS, loadJSON(K.pvpLabCfg, {}) || {});
  pvpLabCfg.sourceWeights = Object.assign({}, PVP_LAB_DEFAULTS.sourceWeights, pvpLabCfg.sourceWeights || {});
  // v8.8.4: PRESTIŻ i normalne ATAKI/OBRONY PvP są równorzędne (1:1). Arena/Arena TEST = 0.
  // Wymuszamy te wartości także po aktualizacji ze starszej konfiguracji.
  pvpLabCfg.sourceWeights.prestige = 1;
  pvpLabCfg.sourceWeights.normal = 1;
  pvpLabCfg.sourceWeights.arena = 0;
  pvpLabCfg.sourceWeights.arena_test = 0;
  pvpLabCfg.optimizerPrestigeOnly = false;
  pvpLabCfg.optimizerMinRealPvp = Math.max(3,Number(pvpLabCfg.optimizerMinRealPvp ?? pvpLabCfg.optimizerMinPrestige ?? 8));
  pvpLabCfg.normalMetaEnabled = true;
  pvpLabCfg.normalMetaAttackWeight = 1;
  pvpLabCfg.normalMetaDefenseWeight = 1;
  pvpLabCfg.normalMetaMaxAgeDays = Math.max(1,Math.min(365,Number(pvpLabCfg.normalMetaMaxAgeDays ?? 60)));
  pvpLabCfg.normalMetaDeduplicateOpponents = false;

  let pvpLab = loadJSON(K.pvpLab, null);
  if(!pvpLab || typeof pvpLab!=='object') pvpLab={};
  if(!Array.isArray(pvpLab.battles)) pvpLab.battles=[];
  if(!pvpLab.current || typeof pvpLab.current!=='object') pvpLab.current={};
  if(!Array.isArray(pvpLab.errors)) pvpLab.errors=[];
  if(!Array.isArray(pvpLab.opponentRolls)) pvpLab.opponentRolls=[];
  if(!pvpLab.skillTrees || typeof pvpLab.skillTrees!=='object') pvpLab.skillTrees={};
  if(!pvpLab.skillTreesAt || typeof pvpLab.skillTreesAt!=='object') pvpLab.skillTreesAt={};
  if(!Array.isArray(pvpLab.defenseSnapshots)) pvpLab.defenseSnapshots=[];
  if(!pvpLab.capabilities || typeof pvpLab.capabilities!=='object') pvpLab.capabilities={};
  if(!pvpLab.optimizer || typeof pvpLab.optimizer!=='object') pvpLab.optimizer={status:'CZEKA'};
  // Migracja v8.8.0: część pełnych replayów była później nadpisywana detailLoaded=false.
  for(const b of pvpLab.battles){
    if(b && b.eventSummary && b.totalTurns!=null && b.me && b.opponent) b.detailLoaded=true;
    if(b && b.detailLoaded) b.detailState='loaded';
  }
  pvpLab.version=3;
  pvpLab.startedAt=Number(pvpLab.startedAt||Date.now());
  pvpLab.updatedAt=Number(pvpLab.updatedAt||0);
  pvpLab.lastSyncAt=Number(pvpLab.lastSyncAt||0);
  pvpLab.syncStatus=String(pvpLab.syncStatus||'CZEKA');
  pvpLab.syncing=false;

  function savePvpLabCfg(){ saveJSON(K.pvpLabCfg,pvpLabCfg); }
  function pvpLabSave(){
    const max=Math.max(100,Math.min(2000,Number(pvpLabCfg.maxBattles||800)));
    if(pvpLab.battles.length>max){
      pvpLab.battles=pvpLab.battles
        .slice()
        .sort((a,b)=>Number(a.capturedAt||a.createdAt||0)-Number(b.capturedAt||b.createdAt||0))
        .slice(-max);
    }
    if(pvpLab.opponentRolls.length>200) pvpLab.opponentRolls=pvpLab.opponentRolls.slice(-200);
    if(pvpLab.defenseSnapshots.length>120) pvpLab.defenseSnapshots=pvpLab.defenseSnapshots.slice(-120);
    if(pvpLab.errors.length>40) pvpLab.errors=pvpLab.errors.slice(-40);
    pvpLab.updatedAt=Date.now();
    // Flaga runtime nie trafia do trwałego zapisu.
    const runtimeSync=!!pvpLab.syncing;
    pvpLab.syncing=false;
    try{ saveJSON(K.pvpLab,pvpLab); } finally { pvpLab.syncing=runtimeSync; }
  }


  // =========================
  // Boss LAB v8.8.5 — całkowicie oddzielony od PvP Lab
  // =========================
  const BOSS_LAB_DEFAULTS={
    enabled:true,
    passiveCapture:true,
    maxBattles:50,
    fullEventBattles:14,
    optimizerEnabled:true,
    autoOptimizeAfterFight:true
  };
  const bossLabCfg=Object.assign({},BOSS_LAB_DEFAULTS,loadJSON(K.bossLabCfg,{})||{});
  bossLabCfg.maxBattles=Math.max(10,Math.min(100,Number(bossLabCfg.maxBattles||50)));
  bossLabCfg.fullEventBattles=Math.max(3,Math.min(30,Number(bossLabCfg.fullEventBattles||14)));
  let bossLab=loadJSON(K.bossLab,null);
  if(!bossLab||typeof bossLab!=='object') bossLab={};
  if(!bossLab.bosses||typeof bossLab.bosses!=='object') bossLab.bosses={};
  if(!Array.isArray(bossLab.battles)) bossLab.battles=[];
  if(!bossLab.optimizers||typeof bossLab.optimizers!=='object') bossLab.optimizers={};
  if(!Array.isArray(bossLab.errors)) bossLab.errors=[];
  const __bossStaleOptimizerIds=[];
  for(const [__bossKey,__bossOpt] of Object.entries(bossLab.optimizers)){
    if(!__bossOpt || __bossOpt.method!==BOSS_OPTIMIZER_METHOD){
      __bossStaleOptimizerIds.push(__bossKey);
      bossLab.optimizers[__bossKey]={
        status:'WYMAGA PRZELICZENIA V6',
        at:0,
        method:'STALE',
        staleMethod:String(__bossOpt?.method||'BRAK'),
        staleAt:Number(__bossOpt?.at||0)
      };
    }
  }
  bossLab.version=4;
  bossLab.optimizerSchema=6;
  bossLab.optimizerMethod=BOSS_OPTIMIZER_METHOD;
  bossLab.startedAt=Number(bossLab.startedAt||Date.now());
  bossLab.updatedAt=Number(bossLab.updatedAt||0);
  bossLab.lastBossListAt=Number(bossLab.lastBossListAt||0);
  bossLab.lastCaptureAt=Number(bossLab.lastCaptureAt||0);
  bossLab.activeModifiers=(bossLab.activeModifiers&&typeof bossLab.activeModifiers==='object')?bossLab.activeModifiers:{};
  bossLab.activeModifiersAt=Number(bossLab.activeModifiersAt||0);
  bossLab.syncStatus=String(bossLab.syncStatus||'CZEKA NA WALKĘ');
  bossLab.syncing=false;
  function bossLabClone(v){ try{return JSON.parse(JSON.stringify(v));}catch{return null;} }
  function bossLabSaveCfg(){ saveJSON(K.bossLabCfg,bossLabCfg); }
  function bossLabSave(){
    const max=Number(bossLabCfg.maxBattles||50);
    if(bossLab.battles.length>max) bossLab.battles=bossLab.battles.slice().sort((a,b)=>Number(a.createdAt||a.capturedAt||0)-Number(b.createdAt||b.capturedAt||0)).slice(-max);
    const full=Math.max(3,Number(bossLabCfg.fullEventBattles||14));
    const ordered=bossLab.battles.slice().sort((a,b)=>Number(b.createdAt||b.capturedAt||0)-Number(a.createdAt||a.capturedAt||0));
    for(const row of ordered.slice(full)){ if(Array.isArray(row.events)&&row.events.length){ row.events=[]; row.eventsArchived=true; } if(row.rawResponse) delete row.rawResponse; }
    if(bossLab.errors.length>40) bossLab.errors=bossLab.errors.slice(-40);
    bossLab.updatedAt=Date.now();
    const runtime=!!bossLab.syncing; bossLab.syncing=false;
    try{ saveJSON(K.bossLab,bossLab); }
    catch(e){
      // Ochrona przed limitem localStorage: zachowujemy modele/statystyki, a odchudzamy stare eventy.
      for(const row of ordered.slice(5)){ row.events=[]; row.eventsArchived=true; delete row.rawResponse; delete row.rawFighters; }
      try{ saveJSON(K.bossLab,bossLab); }catch{}
    } finally { bossLab.syncing=runtime; }
  }
  if(__bossStaleOptimizerIds.length){
    bossLab.optimizerMigration={
      at:Date.now(),
      to:BOSS_OPTIMIZER_METHOD,
      invalidatedBossIds:__bossStaleOptimizerIds.slice(),
      reason:'optimizer_method_changed'
    };
    bossLabSave();
  }

  const AUTO_DEFAULTS = {
    enabled: false,
    dryRun: true,
    cycleSeconds: 30,
    priceRefreshSeconds: 30,
    actionDelayMs: 1800,
    maxCostPerOdpady: 100,
    maxSpendPerCycle: 2000,
    maxSpendPerDay: 12000,
    profitAwareCycleOverride: true,
    profitAwareMaxSingleBuy: 15000,
    purchaseStallLimit: 3,
    purchaseStallMinutes: 10,
    maxBuysPerCycle: 2,
    minProfitPerCraft: 1200,
    minProfitPerHour: 1200,
    targetMetric: 'profitHour',
    autoBuy: true,
    autoDismantle: true,
    autoCraft: true,
    autoCollect: true,
    autoSell: true,
    reserveOdpady: 0,
    maxInputPriceDriftPct: 20,
    listingStrategy: 'smart',
    maxSameProductListings: 2,
    maxSameProductExposure: 2,
    listingPolicyVersion: 2,
    autoRepriceListings: true,
    repriceOverMarketPct: 12,
    repriceMinAgeMinutes: 20,
    repriceCooldownMinutes: 30,
    reserveListingSlots: 1,
    maxTrackedJobs: 3,
    optimizerBeamWidth: 240,
    optimizerCandidateLimit: 18,
    optimizerShortlist: 6,
    optimizerUseDismantleTime: true,
    historicalPriceMaxAgeDays: 30,
    autoUseInventoryDismantle: true,
    maxInventoryDismantleValue: 3000,
    maxInventoryAddsPerCycle: 4,
    strategicStockEnabled: true,
    strategicStockCycles: 4,
    strategicTopRecipes: 3,
    strategicMinRatio: 0.50,
    strategicMaxRatio: 1.50,
    strategicSpendPerCycle: 1200,
    strategicSpendPerDay: 5000,
    strategicBargainPct: 0.85,
    strategicExtraIngredients: true,
    preferFastDismantle: true,
    dismantleTimeWeight: 0.60,
    avoidSurplusYields: true,
    strategicStockLevelsMode: 'auto',
    strategicManualLevels: {},
    recoveryEnabled: true,
    recoveryBaseSeconds: 45,
    recoveryMaxSeconds: 300,
    recoveryReloadAfterFailures: 3,
    recoveryMaxReloads: 3,
    recoveryTicketMinutes: 15,
    requestTimeoutSeconds: 25,
    writeSafetyHoldSeconds: 60,
    selfLearningEnabled: true,
    learningStrength: 0.55,
    learningMinSamples: 3,
    learningExplorationPct: 3,
    learningMaxAdjustmentPct: 35,
    learningMarketAlpha: 0.18,
    learningOutcomeAlpha: 0.30,
    learningAuditMissingChecks: 2,
    learningMaxEvents: 400,
    localAiEnabled: true,
    localAiInfluenceEconomy: true,
    localAiAllowGameActions: true,
    localAiIntervalSeconds: 30,
    localAiTimeoutSeconds: 7,
    localAiWorldRefreshSeconds: 60,
    localAiMenelMode: true,
    localAiMenelCompleteNow: false,
    localAiHustling: true,
    localAiHustleSessionMinutes: 60,
    localAiNpc: true,
    localAiNpcEnergyReserve: 100,
    localAiTravel: true,
    localAiDistrictSweep: true,
    localAiFreeTravelSpeedup: true,
    localAiSellCans: true,
    localAiSellCansMin: 1000,
    localAiCanTargetPrice: 0.15,
    localAiTravelMinCanGain: 250,
    localAiExploreDistricts: true,
    localAiCollections: true,
    localAiCollectionMaxItemValue: 300,
    localAiFavors: true,
    localAiFavorMaxPremiumValue: 10,
    localAiObserveRaids: true,
    localAiTasks: true,
    localAiActionErrorCooldownSeconds: 30,
    localAiInventoryGuardian: true,
    localAiInventoryReserveSlots: 4,
    localAiDismantleDistrictLoot: true,
    localAiMoveOverflowToMelina: true,
    localAiMelinaFirst: true,
    localAiMelinaReserveSlots: 0,
    localAiMelinaReturnForCraft: true,
    localAiMelinaReturnForSale: true,
    localAiMelinaReturnForCollections: true,
    localAiRepeatErrorLimit: 3,
    localAiIdleRecoveryMinutes: 12,
    localAiGarden: true,
    localAiGardenResearch: true,
    localAiGardenAutoSow: true,
    localAiGardenAutoBuySeeds: true,
    localAiGardenAutoHarvest: true,
    localAiGardenPollSeconds: 60,
    alcoholAutoEnabled: false,
    alcoholAutoBuyMissing: true,
    alcoholProfileKey: '',
    alcoholPollSeconds: 30,
    localAiUseLocalLlmAdvice: true
  };
  const __savedAutoCfg = loadJSON(K.autoSettings, {}) || {};
  const autoCfg = Object.assign({}, AUTO_DEFAULTS, __savedAutoCfg);
  // v8.7.6: jednorazowa migracja starej polityki 1 oferta / produkt -> 2 oferty / produkt.
  // Po migracji użytkownik może ręcznie wrócić do 1 i nie zostanie to nadpisane przy kolejnym starcie.
  if(Number(__savedAutoCfg.listingPolicyVersion||0)<2){
    autoCfg.listingPolicyVersion=2;
    if(!Object.prototype.hasOwnProperty.call(__savedAutoCfg,'maxSameProductListings') || Number(__savedAutoCfg.maxSameProductListings||0)<=1){
      autoCfg.maxSameProductListings=2;
    }
  }
  if(!autoCfg.strategicManualLevels || typeof autoCfg.strategicManualLevels!=='object'){
    autoCfg.strategicManualLevels={};
  }

  // ============================================================
  // ALKOHOL AUTO v8.8.13 — samouczący profil destylacji
  // ============================================================
  let alcoholAuto = loadJSON(K.alcoholAuto, null);
  if(!alcoholAuto || typeof alcoholAuto!=='object') alcoholAuto={};
  if(!alcoholAuto.profiles || typeof alcoholAuto.profiles!=='object') alcoholAuto.profiles={};
  if(!alcoholAuto.learning || typeof alcoholAuto.learning!=='object'){
    alcoholAuto.learning={armed:false,name:'',sequence:[],pendingIntent:null,durationMs:0,status:'BRAK — naucz jeden ręczny cykl'};
  }
  if(!Array.isArray(alcoholAuto.learning.sequence)) alcoholAuto.learning.sequence=[];
  alcoholAuto.runtimeBusy=false;
  alcoholAuto.lastAction=String(alcoholAuto.lastAction||'—');
  alcoholAuto.lastError=String(alcoholAuto.lastError||'');
  alcoholAuto.nextAt=Number(alcoholAuto.nextAt||0);

  function alcoholSave(){
    const busy=!!alcoholAuto.runtimeBusy;
    alcoholAuto.runtimeBusy=false;
    try{ saveJSON(K.alcoholAuto,alcoholAuto); }finally{ alcoholAuto.runtimeBusy=busy; }
  }

  function alcoholProfileList(){
    return Object.entries(alcoholAuto.profiles||{}).map(([key,p])=>({
      key,
      name:String(p?.name||key),
      durationMs:Number(p?.durationMs||0),
      learnedAt:Number(p?.learnedAt||0),
      sequence:Array.isArray(p?.sequence)?p.sequence:[]
    })).sort((a,b)=>a.name.localeCompare(b.name,'pl'));
  }

  function alcoholProfileSelected(){
    const key=String(autoCfg.alcoholProfileKey||'');
    if(key && alcoholAuto.profiles?.[key]) return alcoholAuto.profiles[key];
    const first=alcoholProfileList()[0];
    if(first && alcoholAuto.profiles?.[first.key]){
      autoCfg.alcoholProfileKey=first.key;
      return alcoholAuto.profiles[first.key];
    }
    return null;
  }

  function alcoholProfileKey(name){
    const base=String(name||'alkohol').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'alkohol';
    let key=base, n=2;
    while(alcoholAuto.profiles[key]) key=`${base}-${n++}`;
    return key;
  }

  function alcoholStartLearning(name){
    const label=String(name||'').trim();
    if(!label) return false;
    alcoholAuto.learning={
      armed:true,
      name:label,
      sequence:[],
      pendingIntent:null,
      durationMs:0,
      status:'UCZENIE: czekam na ODBIERZ -> dokup brakujące -> WYTWARZAJ'
    };
    alcoholAuto.lastError='';
    alcoholAuto.lastAction=`Uczenie profilu: ${label}`;
    alcoholSave();
    try{ if(typeof render==='function') render(); }catch{}
    return true;
  }

  function alcoholStopLearning(reason='Uczenie zatrzymane'){
    alcoholAuto.learning.armed=false;
    alcoholAuto.learning.pendingIntent=null;
    alcoholAuto.learning.status=String(reason||'Uczenie zatrzymane');
    alcoholAuto.lastAction=alcoholAuto.learning.status;
    alcoholSave();
    try{ if(typeof render==='function') render(); }catch{}
  }

  function alcoholArmIntent(type,meta={}){
    if(!alcoholAuto.learning?.armed) return;
    alcoholAuto.learning.pendingIntent={
      type:String(type||''),
      at:Date.now(),
      durationMs:Number(meta.durationMs||0),
      note:String(meta.note||'')
    };
    if(Number(meta.durationMs||0)>0) alcoholAuto.learning.durationMs=Number(meta.durationMs);
    alcoholAuto.learning.status=`UCZENIE: klik ${String(type||'').toUpperCase()} — czekam na request gry`;
    alcoholSave();
  }

  function alcoholClickText(el){
    const raw=String(el?.innerText||el?.textContent||el?.value||'').replace(/\s+/g,' ').trim();
    return raw.slice(0,180);
  }

  function alcoholParseDurationMs(text){
    const m=String(text||'').match(/(?:\(|\b)(\d{1,2}):(\d{2}):(\d{2})(?:\)|\b)/);
    if(!m) return 0;
    return (Number(m[1])*3600+Number(m[2])*60+Number(m[3]))*1000;
  }

  function installAlcoholLearningClickBridge(){
    if(window.__MG_ALCOHOL_CLICK_BRIDGE__) return;
    window.__MG_ALCOHOL_CLICK_BRIDGE__=true;
    document.addEventListener('click',ev=>{
      try{
        if(!alcoholAuto.learning?.armed) return;
        const el=ev.target?.closest?.('button,[role="button"],input[type="button"],input[type="submit"],label,a') || ev.target;
        const txt=alcoholClickText(el);
        if(!txt) return;
        const bodyText=String(document.body?.innerText||'').replace(/\s+/g,' ');
        const onAlcohol=/Melina-Wytwarzanie|Kolejka destylacji|Użyj receptury|Wytwarzaj/i.test(bodyText);
        if(!onAlcohol) return;
        if(/odbierz/i.test(txt)){
          alcoholArmIntent('collect',{note:txt});
          return;
        }
        if(/^tak$/i.test(txt) && /dokupi|brakuje składnik/i.test(bodyText)){
          alcoholArmIntent('buy',{note:bodyText.match(/.{0,80}(?:dokupi|brakuje składnik).{0,180}/i)?.[0]||'dokup brakujące'});
          return;
        }
        if(/wytwarzaj/i.test(txt)){
          alcoholArmIntent('start',{durationMs:alcoholParseDurationMs(txt),note:txt});
          return;
        }
      }catch(e){
        console.warn('[MG Alcohol Learner] click bridge',e);
      }
    },true);
  }

  function alcoholCapturedPath(url){
    try{
      const u=new URL(String(url||''),location.href);
      return `${u.pathname}${u.search||''}`;
    }catch{
      return String(url||'');
    }
  }

  function alcoholRecordLearnRequest(req){
    try{
      const learn=alcoholAuto.learning;
      if(!learn?.armed) return false;
      const intent=learn.pendingIntent;
      if(!intent || Date.now()-Number(intent.at||0)>5000) return false;
      const status=Number(req?.status||0);
      if(status<200 || status>=300) return false;
      const response=req?.response;
      if(response && typeof response==='object' && response.success===false) return false;

      const step={
        type:String(intent.type||''),
        method:String(req?.method||'POST').toUpperCase(),
        path:alcoholCapturedPath(req?.url||''),
        bodyRaw:req?.body==null?null:String(req.body),
        contentType:String(req?.contentType||''),
        capturedAt:Date.now()
      };
      if(!step.path || !step.type) return false;
      learn.sequence.push(step);
      learn.pendingIntent=null;

      const counts=learn.sequence.reduce((a,x)=>(a[x.type]=(a[x.type]||0)+1,a),{});
      learn.status=`NAUCZONE: odbiór ${counts.collect||0} • dokup ${counts.buy||0} • start ${counts.start||0}`;

      if(step.type==='start'){
        const key=alcoholProfileKey(learn.name);
        const durationMs=Math.max(0,Number(learn.durationMs||0));
        alcoholAuto.profiles[key]={
          key,
          name:String(learn.name||key),
          characterId:Number(settings.characterId||0),
          durationMs,
          sequence:learn.sequence.slice(),
          learnedAt:Date.now(),
          lastStartedAt:Date.now(),
          nextAt:durationMs>0?Date.now()+durationMs+5000:Date.now()+Math.max(30,Number(autoCfg.alcoholPollSeconds||30))*1000,
          lastStatus:'NAUCZONY — produkcja wystartowała'
        };
        autoCfg.alcoholProfileKey=key;
        learn.armed=false;
        learn.status=`GOTOWE: profil "${learn.name}" zapisany`;
        alcoholAuto.lastAction=`Nauczono profil ${learn.name}`;
        try{ saveJSON(K.autoSettings,autoCfg); }catch{}
      }
      alcoholSave();
      try{ if(typeof render==='function') render(); }catch{}
      return true;
    }catch(e){
      console.warn('[MG Alcohol Learner] record',e);
      return false;
    }
  }

  let localAiEvents = loadJSON(K.localAiEvents, []);
  if(!Array.isArray(localAiEvents)) localAiEvents=[];
  localAiEvents=localAiEvents.slice(-250);

  let menelCloseLearned = loadJSON(K.menelCloseLearned, null);
  if(
    !menelCloseLearned ||
    !Array.isArray(menelCloseLearned.sequence) ||
    !menelCloseLearned.sequence.length
  ){
    menelCloseLearned=null;
  }

  let melinaAddLearned = loadJSON(K.melinaAddLearned, null);
  if(
    !melinaAddLearned ||
    !melinaAddLearned.safe ||
    !melinaAddLearned.method ||
    !melinaAddLearned.path
  ){
    melinaAddLearned=null;
  }

  let localAiPersistent=loadJSON(K.localAiPersistent,{});
  if(!localAiPersistent || typeof localAiPersistent!=='object'){
    localAiPersistent={};
  }

  // v8.6.9: stary wyuczony limit pochodził z polityki 4/3 wolnych slotów.
  // Czyścimy go raz, bo od teraz MenelMode startuje przy >=1 wolnym slocie,
  // a podróż nie wymaga sztucznego zapasu. Jeśli serwer realnie odrzuci akcję,
  // próg nauczy się ponownie z faktycznej odpowiedzi serwera.
  if(Number(localAiPersistent.inventoryPolicyVersion||0)<2){
    localAiPersistent.inventoryPolicyVersion=2;
    localAiPersistent.inventoryServerSafeLimit=null;
    localAiPersistent.inventoryServerRejectedAt=0;
    localAiPersistent.inventoryServerRejectedAction='';
    saveJSON(K.localAiPersistent,localAiPersistent);
  }

  function saveLocalAiEvents(){
    if(localAiEvents.length>250) localAiEvents=localAiEvents.slice(-250);
    saveJSON(K.localAiEvents,localAiEvents);
  }

  function localAiPushEvent(type,data={}){
    const ev={
      id:`${Date.now()}-${Math.random().toString(36).slice(2,10)}`,
      ts:Date.now(),
      type:String(type||'event'),
      ...data
    };
    localAiEvents.push(ev);
    saveLocalAiEvents();
    return ev;
  }

  function localAiAckEvents(ids){
    if(!Array.isArray(ids) || !ids.length) return;
    const set=new Set(ids.map(String));
    localAiEvents=localAiEvents.filter(e=>!set.has(String(e.id)));
    saveLocalAiEvents();
  }

  let recoveryTicket = loadJSON(K.recoveryTicket, null);
  if(
    !recoveryTicket ||
    typeof recoveryTicket!=='object' ||
    Number(recoveryTicket.expiresAt||0)<=Date.now()
  ){
    recoveryTicket=null;
    localStorage.removeItem(K.recoveryTicket);
  }

  // Fail-safe nadal obowiązuje przy ZWYKŁYM ręcznym odświeżeniu strony.
  // Jedyny wyjątek: krótko żyjący bilet recovery utworzony przez samego Pomagiera
  // po błędzie sieci/sesji. Sam bilet NIE zawiera tokenów, cookies ani nagłówków.
  let recoveryResumePending=!!(
    recoveryTicket &&
    recoveryTicket.resume===true &&
    autoCfg.recoveryEnabled
  );

  autoCfg.enabled = false;
  autoCfg.dryRun = true;
  saveJSON(K.autoSettings, autoCfg);
  let autoLog = loadJSON(K.autoLog, []);
  if (!Array.isArray(autoLog)) autoLog = [];
  let autoSpend = loadJSON(K.autoSpend, {date:'', amount:0, purchases:0});
  if (!autoSpend || typeof autoSpend !== 'object') autoSpend = {date:'', amount:0, purchases:0};

  let profitJobs = loadJSON(K.profitJobs, []);
  if (!Array.isArray(profitJobs)) profitJobs = [];
  let saleQueue = loadJSON(K.saleQueue, []);
  if (!Array.isArray(saleQueue)) saleQueue = [];
  let profitStats = loadJSON(K.profitStats, {listed:0, listingFees:0, collected:0, crafted:0});
  if (!profitStats || typeof profitStats !== 'object') profitStats = {listed:0, listingFees:0, collected:0, crafted:0};

  let sessionStats = loadJSON(K.sessionStats, null);
  if(!sessionStats || typeof sessionStats!=='object'){
    sessionStats={active:false,sessionId:'',startedAt:0,endedAt:0,purchases:0,purchaseSpend:0,listingFees:0,totalSpent:0,soldCount:0,soldRevenue:0,realizedProfit:0,soldKeys:[]};
  }
  if(!Array.isArray(sessionStats.soldKeys)) sessionStats.soldKeys=[];
  if(!sessionStats.sessionId && Number(sessionStats.startedAt||0)>0) sessionStats.sessionId=`session-${Number(sessionStats.startedAt)}`;

  let sessionHistory = loadJSON(K.sessionHistory, []);
  if(!Array.isArray(sessionHistory)) sessionHistory=[];

  // v8.6.7: zwykłe odświeżenie/restart strony NIE kończy sesji statystyk.
  // v8.7.4: zakończona sesja jest archiwizowana przy ręcznym STOP i przechowujemy maks. 10 rekordów.

  function normalizeSessionRecord(raw){
    const r=(raw && typeof raw==='object')?raw:{};
    const startedAt=Number(r.startedAt||0);
    const endedAt=Number(r.endedAt||startedAt||0);
    const purchaseSpend=Number(r.purchaseSpend||0);
    const listingFees=Number(r.listingFees||0);
    const totalSpent=Number(r.totalSpent ?? (purchaseSpend+listingFees));
    const soldRevenue=Number(r.soldRevenue||0);
    const realizedProfit=Number(r.realizedProfit||0);
    const netProfit=Number(r.netProfit ?? (soldRevenue-totalSpent));
    return {
      id:String(r.id||r.sessionId||`session-${startedAt}`),
      sessionId:String(r.sessionId||r.id||`session-${startedAt}`),
      startedAt,
      endedAt,
      durationMs:Number(r.durationMs ?? Math.max(0,endedAt-startedAt)),
      purchases:Number(r.purchases||0),
      purchaseSpend,
      listingFees,
      totalSpent,
      soldCount:Number(r.soldCount||0),
      soldRevenue,
      realizedProfit,
      netProfit,
      reason:String(r.reason||'stop'),
      archivedAt:Number(r.archivedAt||Date.now())
    };
  }

  sessionHistory=sessionHistory
    .filter(x=>x && typeof x==='object' && Number(x.startedAt||0)>0)
    .map(normalizeSessionRecord)
    .sort((a,b)=>Number(a.startedAt)-Number(b.startedAt))
    .slice(-10);

  function saveSessionHistory(){
    sessionHistory=sessionHistory
      .filter(x=>x && Number(x.startedAt||0)>0)
      .map(normalizeSessionRecord)
      .sort((a,b)=>Number(a.startedAt)-Number(b.startedAt))
      .slice(-10);
    saveJSON(K.sessionHistory,sessionHistory);
  }

  function saveSessionStats(){
    sessionStats.totalSpent=Number(sessionStats.purchaseSpend||0)+Number(sessionStats.listingFees||0);
    if(!Array.isArray(sessionStats.soldKeys)) sessionStats.soldKeys=[];
    if(sessionStats.soldKeys.length>250) sessionStats.soldKeys=sessionStats.soldKeys.slice(-250);
    if(!sessionStats.sessionId && Number(sessionStats.startedAt||0)>0) sessionStats.sessionId=`session-${Number(sessionStats.startedAt)}`;
    saveJSON(K.sessionStats,sessionStats);
  }

  function sessionNetProfit(stats=sessionStats){
    return Number(stats?.soldRevenue||0) - (Number(stats?.purchaseSpend||0)+Number(stats?.listingFees||0));
  }

  function archiveSessionStats(reason='stop'){
    if(!sessionStats || !Number(sessionStats.startedAt||0)) return null;
    const startedAt=Number(sessionStats.startedAt||0);
    const endedAt=Number(sessionStats.endedAt||Date.now());
    const id=String(sessionStats.sessionId||`session-${startedAt}`);
    const record=normalizeSessionRecord({
      id,
      sessionId:id,
      startedAt,
      endedAt,
      durationMs:Math.max(0,endedAt-startedAt),
      purchases:Number(sessionStats.purchases||0),
      purchaseSpend:Number(sessionStats.purchaseSpend||0),
      listingFees:Number(sessionStats.listingFees||0),
      totalSpent:Number(sessionStats.purchaseSpend||0)+Number(sessionStats.listingFees||0),
      soldCount:Number(sessionStats.soldCount||0),
      soldRevenue:Number(sessionStats.soldRevenue||0),
      realizedProfit:Number(sessionStats.realizedProfit||0),
      netProfit:sessionNetProfit(sessionStats),
      reason,
      archivedAt:Date.now()
    });
    const idx=sessionHistory.findIndex(x=>String(x.id||x.sessionId)===id);
    if(idx>=0) sessionHistory[idx]=record;
    else sessionHistory.push(record);
    saveSessionHistory();
    sessionStats.archivedAt=record.archivedAt;
    sessionStats.archiveId=id;
    saveSessionStats();
    return record;
  }

  function startSessionStats(){
    // Nie zerujemy aktywnej sesji po ponownym kliknięciu START / recovery.
    if(sessionStats.active && Number(sessionStats.startedAt||0)>0) return false;
    // Migracja/bezpiecznik: poprzednia zakończona sesja sprzed v8.7.4 trafia do historii przed nową.
    if(!sessionStats.active && Number(sessionStats.startedAt||0)>0 && Number(sessionStats.endedAt||0)>0){
      archiveSessionStats(sessionStats.archivedAt?'stop':'migrated');
    }
    const startedAt=Date.now();
    sessionStats={
      active:true,
      sessionId:`session-${startedAt}-${Math.random().toString(36).slice(2,8)}`,
      startedAt,
      endedAt:0,
      purchases:0,
      purchaseSpend:0,
      listingFees:0,
      totalSpent:0,
      soldCount:0,
      soldRevenue:0,
      realizedProfit:0,
      soldKeys:[]
    };
    saveSessionStats();
    return true;
  }

  function stopSessionStats(){
    if(!sessionStats.startedAt) return null;
    if(sessionStats.active || !sessionStats.endedAt) sessionStats.endedAt=Date.now();
    sessionStats.active=false;
    saveSessionStats();
    return archiveSessionStats('stop');
  }

  function sessionRecordPurchase(amount){
    if(!sessionStats.active) return;
    const v=Number(amount||0);
    if(!Number.isFinite(v) || v<=0) return;
    sessionStats.purchases=Number(sessionStats.purchases||0)+1;
    sessionStats.purchaseSpend=Number(sessionStats.purchaseSpend||0)+v;
    saveSessionStats();
  }

  function sessionRecordListingFee(amount){
    if(!sessionStats.active) return;
    const v=Number(amount||0);
    if(!Number.isFinite(v) || v<=0) return;
    sessionStats.listingFees=Number(sessionStats.listingFees||0)+v;
    saveSessionStats();
  }

  function realizedJobNumbers(job){
    const price=Number(job?.listPrice||0);
    const fee=Number(job?.listingFee ?? feeFor(price));
    const cost=Number(job?.costBasis||0);
    return {price,fee,cost,profit:price-fee-cost};
  }

  function sessionRecordSale(job){
    if(!sessionStats.active || !job) return null;
    const key=String(job.listingId ? `listing:${job.listingId}` : `queue:${job.queueId||0}`);
    if(sessionStats.soldKeys.includes(key)) return realizedJobNumbers(job);
    const out=realizedJobNumbers(job);
    sessionStats.soldKeys.push(key);
    sessionStats.soldCount=Number(sessionStats.soldCount||0)+1;
    sessionStats.soldRevenue=Number(sessionStats.soldRevenue||0)+Number(out.price||0);
    sessionStats.realizedProfit=Number(sessionStats.realizedProfit||0)+Number(out.profit||0);
    saveSessionStats();
    return out;
  }

  function durationTextMs(ms){
    const mins=Math.floor(Math.max(0,Number(ms||0))/60000);
    const d=Math.floor(mins/1440), rem=mins%1440;
    const h=Math.floor(rem/60), m=rem%60;
    if(d>0) return `${d} d ${h} h ${m} min`;
    if(h>0) return `${h} h ${m} min`;
    return `${m} min`;
  }

  function sessionDurationText(){
    if(!sessionStats.startedAt) return 'sesja jeszcze nie rozpoczęta';
    const end=sessionStats.active ? Date.now() : Number(sessionStats.endedAt||Date.now());
    return durationTextMs(Math.max(0,end-Number(sessionStats.startedAt)));
  }

  // Po instalacji v8.7.4 odzyskaj ostatnią zakończoną sesję v8.7.3, jeśli jeszcze nie była archiwizowana.
  if(sessionStats.startedAt && !sessionStats.active && sessionStats.endedAt){
    archiveSessionStats(sessionStats.archivedAt?'stop':'migrated');
  }else{
    saveSessionHistory();
  }

  // Self-learning core — przywrócone w v8.7.5 (regresja z v8.7.4).
  let learner = loadJSON(K.learner, {
    version:1,
    startedAt:Date.now(),
    recipes:{},
    items:{},
    events:[],
    totals:{decisions:0,sold:0,returned:0,marketObservations:0}
  });
  if(!learner || typeof learner!=='object') learner={};
  if(!learner.recipes || typeof learner.recipes!=='object') learner.recipes={};
  if(!learner.items || typeof learner.items!=='object') learner.items={};
  if(!Array.isArray(learner.events)) learner.events=[];
  if(!learner.totals || typeof learner.totals!=='object') learner.totals={decisions:0,sold:0,returned:0,marketObservations:0};
  if(!learner.startedAt) learner.startedAt=Date.now();

  function learnerSave(){
    const max=Math.max(50,Number(autoCfg.learningMaxEvents||400));
    if(learner.events.length>max) learner.events=learner.events.slice(-max);
    saveJSON(K.learner,learner);
  }

  function learnerReset(){
    learner={
      version:1,
      startedAt:Date.now(),
      recipes:{},
      items:{},
      events:[],
      totals:{decisions:0,sold:0,returned:0,marketObservations:0}
    };
    learnerSave();
  }

  function learnEwma(prev,value,alpha){
    const v=Number(value);
    if(!Number.isFinite(v)) return prev==null?null:Number(prev);
    if(prev==null || !Number.isFinite(Number(prev))) return v;
    const a=Math.max(0.01,Math.min(1,Number(alpha||0.3)));
    return Number(prev)*(1-a)+v*a;
  }

  function learningEvent(type,data={}){
    learner.events.push({ts:Date.now(),type,...data});
    learnerSave();
  }

  function recipeLearnRow(recipeId,name=''){
    const key=String(Number(recipeId));
    if(!learner.recipes[key]){
      learner.recipes[key]={
        recipeId:Number(recipeId),
        name:String(name||''),
        decisions:0,
        crafts:0,
        collected:0,
        sold:0,
        returned:0,
        ewmaCraftMinutes:null,
        ewmaSaleMinutes:null,
        ewmaProfit:null,
        ewmaRealizedProfitHour:null,
        ewmaPredictionRatio:null,
        lastOutcome:null,
        updatedAt:0
      };
    }
    if(name) learner.recipes[key].name=String(name);
    return learner.recipes[key];
  }

  function itemLearnRow(itemId,name=''){
    const key=String(Number(itemId));
    if(!learner.items[key]){
      learner.items[key]={
        itemId:Number(itemId),
        name:String(name||''),
        samples:0,
        lastPrice:null,
        lastObservedAt:0,
        ewmaPrice:null,
        ewmaTrendPct:0,
        ewmaAbsMovePct:0,
        minSeen:null,
        maxSeen:null,
        updatedAt:0
      };
    }
    if(name) learner.items[key].name=String(name);
    return learner.items[key];
  }

  function learnMarketObservation(itemId,name,price,now=Date.now()){
    if(!autoCfg.selfLearningEnabled) return;
    const p=Number(price);
    if(!Number.isFinite(p) || p<=0) return;

    const row=itemLearnRow(itemId,name);
    const last=Number(row.lastPrice||0);

    // Nie nabijamy próbek co 30 s przy identycznej cenie.
    if(last===p && now-Number(row.lastObservedAt||0)<5*60*1000) return;

    let movePct=0;
    if(last>0) movePct=(p-last)/last;

    const a=Math.max(0.03,Math.min(0.8,Number(autoCfg.learningMarketAlpha||0.18)));
    row.samples=Number(row.samples||0)+1;
    row.ewmaPrice=learnEwma(row.ewmaPrice,p,a);
    row.ewmaTrendPct=learnEwma(row.ewmaTrendPct,movePct,a);
    row.ewmaAbsMovePct=learnEwma(row.ewmaAbsMovePct,Math.abs(movePct),a);
    row.minSeen=row.minSeen==null?p:Math.min(Number(row.minSeen),p);
    row.maxSeen=row.maxSeen==null?p:Math.max(Number(row.maxSeen),p);
    row.lastPrice=p;
    row.lastObservedAt=now;
    row.updatedAt=now;
    learner.totals.marketObservations=Number(learner.totals.marketObservations||0)+1;
  }

  function learnCraftStart(job){
    if(!autoCfg.selfLearningEnabled || !job) return;
    const r=recipeLearnRow(job.recipeId,job.name);
    r.decisions=Number(r.decisions||0)+1;
    r.crafts=Number(r.crafts||0)+1;
    r.updatedAt=Date.now();
    learner.totals.decisions=Number(learner.totals.decisions||0)+1;
    learningEvent('craft_start',{
      recipeId:Number(job.recipeId),
      name:job.name,
      predictedProfit:Number(job.predictedProfitAtStart||job.expectedProfit||0),
      predictedProfitHour:Number(job.predictedProfitHourAtStart||job.expectedProfitHour||0)
    });
  }

  function learnCraftCollected(job){
    if(!autoCfg.selfLearningEnabled || !job?.startedAt || !job?.collectedAt) return;
    const r=recipeLearnRow(job.recipeId,job.name);
    const mins=Math.max(0,(Number(job.collectedAt)-Number(job.startedAt))/60000);
    r.collected=Number(r.collected||0)+1;
    r.ewmaCraftMinutes=learnEwma(
      r.ewmaCraftMinutes,
      mins,
      Math.max(0.05,Math.min(0.8,Number(autoCfg.learningOutcomeAlpha||0.30)))
    );
    r.updatedAt=Date.now();
    learningEvent('craft_collected',{recipeId:Number(job.recipeId),name:job.name,minutes:mins});
  }

  function learnSaleOutcome(job,outcome){
    if(!autoCfg.selfLearningEnabled || !job) return;

    const now=Date.now();
    const r=recipeLearnRow(job.recipeId,job.name);
    const alpha=Math.max(0.05,Math.min(0.8,Number(autoCfg.learningOutcomeAlpha||0.30)));

    if(outcome==='sold'){
      const fee=Number(job.listingFee ?? feeFor(job.listPrice||0));
      const net=Number(job.listPrice||0)-fee;
      const profit=net-Number(job.costBasis||0);
      const totalHours=Math.max(1/60,(now-Number(job.startedAt||now))/3600000);
      const realizedPH=profit/totalHours;
      const saleMinutes=Math.max(0,(now-Number(job.listedAt||now))/60000);
      const predicted=Number(job.predictedProfitAtStart||job.expectedProfitAtList||job.expectedProfit||0);
      const ratio=predicted>0?profit/predicted:null;

      r.sold=Number(r.sold||0)+1;
      r.ewmaProfit=learnEwma(r.ewmaProfit,profit,alpha);
      r.ewmaRealizedProfitHour=learnEwma(r.ewmaRealizedProfitHour,realizedPH,alpha);
      r.ewmaSaleMinutes=learnEwma(r.ewmaSaleMinutes,saleMinutes,alpha);
      if(ratio!=null) r.ewmaPredictionRatio=learnEwma(r.ewmaPredictionRatio,ratio,alpha);
      r.lastOutcome='sold';
      learner.totals.sold=Number(learner.totals.sold||0)+1;

      learningEvent('sold',{
        recipeId:Number(job.recipeId),
        name:job.name,
        listPrice:Number(job.listPrice||0),
        profit,
        realizedProfitHour:realizedPH,
        saleMinutes,
        predictionRatio:ratio
      });

      return {profit,realizedPH,saleMinutes};
    }

    if(outcome==='returned'){
      r.returned=Number(r.returned||0)+1;
      r.lastOutcome='returned';
      learner.totals.returned=Number(learner.totals.returned||0)+1;
      learningEvent('returned',{recipeId:Number(job.recipeId),name:job.name});
    }

    r.updatedAt=now;
    learnerSave();
    return null;
  }

  function learningConfidence(recipeRow){
    const sold=Number(recipeRow?.sold||0);
    const returned=Number(recipeRow?.returned||0);
    const n=sold+returned;
    if(n<=0) return 0;
    // Wolny wzrost: 1 wynik nie przejmuje sterowania.
    return Math.min(1,n/(n+Math.max(2,Number(autoCfg.learningMinSamples||3))));
  }

  function learningAdjustmentForRanking(x){
    if(!autoCfg.selfLearningEnabled || !x?.recipe){
      return {factor:1,confidence:0,score:x?.profitHour??null,reason:'OFF'};
    }

    const rr=recipeLearnRow(x.recipe.id,x.recipe.item_name);
    const ir=itemLearnRow(x.recipe.result_item_id,x.recipe.item_name);
    const conf=learningConfidence(rr);
    const strength=Math.max(0,Math.min(1,Number(autoCfg.learningStrength||0.55)));
    const maxAdj=Math.max(0,Math.min(0.90,Number(autoCfg.learningMaxAdjustmentPct||35)/100));

    let factor=1;
    const reasons=[];

    // Najważniejsza lekcja: ile zł/h naprawdę dała cała droga craft→sprzedaż.
    if(Number.isFinite(Number(rr.ewmaRealizedProfitHour)) && Number(x.profitHour)>0){
      const ratio=Math.max(0.45,Math.min(1.55,Number(rr.ewmaRealizedProfitHour)/Number(x.profitHour)));
      const learned=1+(ratio-1)*conf*strength;
      factor*=learned;
      reasons.push(`real ${fmt(rr.ewmaRealizedProfitHour,0)}/h`);
    }

    // Prawdopodobieństwo, że wystawienie faktycznie schodzi.
    const sold=Number(rr.sold||0), returned=Number(rr.returned||0);
    if(sold+returned>0){
      // Prior 4 sukcesy / 1 porażka: mało próbek = łagodna kara.
      const success=(sold+4)/(sold+returned+5);
      const sellFactor=1-(1-success)*0.45*conf*strength;
      factor*=sellFactor;
      reasons.push(`sprz. ${fmt(success*100,0)}%`);
    }

    // Trend rynku: delikatny wpływ. To nie ma zastępować twardej bieżącej ceny.
    const trend=Math.max(-0.20,Math.min(0.20,Number(ir.ewmaTrendPct||0)));
    if(Math.abs(trend)>0.001){
      factor*=1+trend*0.50*strength;
      reasons.push(`trend ${trend>=0?'+':''}${fmt(trend*100,1)}%`);
    }

    // Zmienny rynek = mały dyskont ryzyka.
    const vol=Math.max(0,Math.min(0.40,Number(ir.ewmaAbsMovePct||0)));
    if(vol>0.01){
      factor*=1-Math.min(0.15,vol*0.40)*strength;
      reasons.push(`zmienność ${fmt(vol*100,1)}%`);
    }

    factor=Math.max(1-maxAdj,Math.min(1+maxAdj,factor));

    // Mały bonus eksploracyjny dla niedotestowanych receptur.
    const outcomes=sold+returned;
    const minSamples=Math.max(1,Number(autoCfg.learningMinSamples||3));
    const exploreBase=Math.max(0,Number(autoCfg.learningExplorationPct||3))/100;
    const explore=outcomes<minSamples
      ? exploreBase*(1-outcomes/minSamples)
      : 0;

    const learnedProfitHour=x.profitHour==null?null:Number(x.profitHour)*factor;
    const score=learnedProfitHour==null?null:learnedProfitHour*(1+explore);

    return {
      factor,
      confidence:conf,
      exploration:explore,
      learnedProfitHour,
      learnedProfit:x.profit==null?null:Number(x.profit)*factor,
      learnedCashProfit:x.cashProfit==null?null:Number(x.cashProfit)*factor,
      score,
      reason:reasons.join(' • ')||'zbieram dane',
      recipeStats:rr,
      itemStats:ir
    };
  }

  function applyLearningToRankings(rows){
    for(const x of (rows||[])){
      const l=learningAdjustmentForRanking(x);
      x.learningFactor=l.factor;
      x.learningConfidence=l.confidence;
      x.learningExploration=l.exploration;
      x.learnedProfitHour=l.learnedProfitHour;
      x.learnedProfit=l.learnedProfit;
      x.learnedCashProfit=l.learnedCashProfit;
      x.aiScore=l.score;
      x.learningReason=l.reason;
      x.learningRecipeStats=l.recipeStats;
      x.learningItemStats=l.itemStats;
    }
    learnerSave();
    return rows;
  }

  function learningSummary(){
    const recipes=Object.values(learner.recipes||{});
    const tested=recipes.filter(x=>Number(x.sold||0)+Number(x.returned||0)>0).length;
    const sold=Number(learner.totals?.sold||0);
    const returned=Number(learner.totals?.returned||0);
    const decisions=Number(learner.totals?.decisions||0);

    const best=recipes
      .filter(x=>Number.isFinite(Number(x.ewmaRealizedProfitHour)))
      .sort((a,b)=>Number(b.ewmaRealizedProfitHour)-Number(a.ewmaRealizedProfitHour))[0]||null;

    return {recipes,tested,sold,returned,decisions,best};
  }

  function localAiMarketValue(itemId){
    const id=Number(itemId);
    if(!id) return null;

    const live=getPrice(id,0);
    const livePrice=Number(live?.min_price ?? live?.price ?? live?.lowest_price ?? 0);
    if(Number.isFinite(livePrice) && livePrice>0) return livePrice;

    const hist=getHistoricalPrice(id,0);
    if(Number.isFinite(Number(hist)) && Number(hist)>0) return Number(hist);

    const staticMeta=STATIC_DISMANTLE.find(x=>Number(x.id)===id);
    if(Number(staticMeta?.paser)>0) return Number(staticMeta.paser);

    return null;
  }

  function localAiWorldItemValues(items){
    const out={};
    for(const x of (items||[])){
      const id=Number(x?.item_id ?? x?.itemId ?? x?.id);
      if(!id || out[id]!=null) continue;
      const v=localAiMarketValue(id);
      if(v!=null) out[id]=v;
    }
    return out;
  }

  async function localAiSafeGet(path, fallback=null){
    try{
      return await apiActive(path);
    }catch(e){
      state.localAI.error=`${path}: ${String(e?.message||e)}`;
      return fallback;
    }
  }

  async function localAiGetAllCooldowns(id, fallback=null){
    const path=`/api/scavenging/${id}/all-cooldowns`;

    try{
      const data=await apiActive(path);
      if(data?.success){
        return {data,source:'SESSION_BRIDGE',error:''};
      }
      throw new Error('all-cooldowns bez success=true');
    }catch(firstErr){
      try{
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),12000);
        __mgInternalApiDepth++;
        let r;
        try{
          r=await window.fetch(path,{
            method:'GET',
            credentials:'include',
            cache:'no-store',
            headers:{'Accept':'application/json'},
            signal:controller.signal
          });
        }finally{
          clearTimeout(timer);
          __mgInternalApiDepth=Math.max(0,__mgInternalApiDepth-1);
        }

        let j=null;
        try{ j=await r.json(); }catch{}
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        if(!j?.success) throw new Error(j?.message||'success=false');

        return {
          data:j,
          source:'COOKIE_GET_FALLBACK',
          error:String(firstErr?.message||firstErr)
        };
      }catch(secondErr){
        return {
          data:fallback,
          source:'ERROR',
          error:`bridge: ${String(firstErr?.message||firstErr)} • fallback: ${String(secondErr?.message||secondErr)}`
        };
      }
    }
  }

  async function localAiRefreshWorld({force=false}={}){
    if(!__mgSessionTemplate) return state.localAI.world;
    if(!force && state.localAI.world && Date.now()<Number(state.localAI.worldNextAt||0)){
      return state.localAI.world;
    }

    const id=Number(settings.characterId);
    const world=state.localAI.world || {};

    // GET-y są celowo rozłożone w czasie, żeby nie walić serwera salwą.
    world.character=await localAiSafeGet(`/api/character/${id}`,world.character);
    await sleep(70);
    world.menel=await localAiSafeGet(`/api/scavenging/${id}/menel-mode/status`,world.menel);
    await sleep(70);

    const cdFetch=await localAiGetAllCooldowns(id,world.allCooldowns);
    world.allCooldowns=cdFetch.data;
    world.allCooldownsSource=cdFetch.source;
    world.allCooldownsError=cdFetch.error||'';
    if(cdFetch.source==='ERROR'){
      state.localAI.error=`all-cooldowns: ${cdFetch.error}`;
    }
    await sleep(70);
    world.hustling=await localAiSafeGet(`/api/hustling/${id}/status`,world.hustling);
    await sleep(70);
    world.npcList=await localAiSafeGet('/api/npc-combat/npcs',world.npcList);
    await sleep(70);
    world.npcStatus=await localAiSafeGet(`/api/npc-combat/${id}/status`,world.npcStatus);
    await sleep(70);
    world.travelTimes=await localAiSafeGet(`/api/locations/travel-times/${id}`,world.travelTimes);
    await sleep(70);
    world.travelStatus=await localAiSafeGet(`/api/travel/status/${id}`,world.travelStatus);
    await sleep(70);

    if(autoCfg.localAiCollections){
      world.collections=await localAiSafeGet(`/api/collections/${id}`,world.collections);
      await sleep(70);
    }

    if(autoCfg.localAiFavors){
      world.favorActive=await localAiSafeGet(`/api/favors/${id}/active`,world.favorActive);
      await sleep(70);
      world.favorOwned=await localAiSafeGet(`/api/favors/${id}/owned`,world.favorOwned);
      await sleep(70);
    }

    if(autoCfg.localAiObserveRaids){
      world.raidLocations=await localAiSafeGet(`/api/gangs/${id}/raid-locations`,world.raidLocations);
      await sleep(70);
      world.activeRaid=await localAiSafeGet(`/api/gangs/${id}/active-raid`,world.activeRaid);
      await sleep(70);
    }

    if(autoCfg.localAiTasks){
      world.dailyTasks=await localAiSafeGet(`/api/tasks/${id}/daily`,world.dailyTasks);
      await sleep(70);
      world.weeklyTasks=await localAiSafeGet(`/api/tasks/${id}/weekly`,world.weeklyTasks);
    }

    const newDistrictId=Number(
      (world.character?.character||world.character||{}).current_district_id ||
      world.travelStatus?.currentDistrictId || 0
    );
    if(
      state.localAI.lastDistrictId && newDistrictId &&
      newDistrictId!==Number(state.localAI.lastDistrictId) &&
      !world.travelStatus?.traveling
    ){
      localAiPushEvent('travel_complete',{
        fromDistrictId:Number(state.localAI.lastDistrictId),
        districtId:newDistrictId,
        districtName:String((world.character?.character||world.character||{}).district_name||world.menel?.districtName||'')
      });
    }
    if(newDistrictId) state.localAI.lastDistrictId=newDistrictId;

    state.localAI.world=world;
    state.localAI.worldLastAt=Date.now();

    const refreshSec=world.travelStatus?.traveling
      ? 15
      : Math.max(30,Number(autoCfg.localAiWorldRefreshSeconds||60));

    state.localAI.worldNextAt=Date.now()+refreshSec*1000;
    state.localAI.menelStatus=world.menel;

    return world;
  }

  function localAiCharacter(world=state.localAI.world){
    return world?.character?.character || world?.character || null;
  }

  function localAiIsTraveling(world=state.localAI.world){
    return !!(world?.travelStatus?.traveling || localAiCharacter(world)?.traveling_to_district_id);
  }

  async function localAiClaimPendingTravelIfNeeded({source='watchdog'}={}){
    const ts=state.localAI.world?.travelStatus||{};
    const remaining=Number(ts?.travelTimeRemaining||0);
    if(!autoCfg.localAiEnabled || !autoCfg.localAiTravel) return false;
    if(!autoCfg.localAiAllowGameActions || !autoCfg.enabled || autoCfg.dryRun) return false;
    if(!ts?.traveling || !ts?.pendingArrival || remaining>0) return false;

    // Zakończenie dojazdu jest obowiązkowym potwierdzeniem, nie płatnym speedupem.
    // Front gry używa dokładnie instant:false dla przycisku „Wysiądź z autobusu”.
    const result=await apiActive('/api/travel/complete',{
      method:'POST',
      body:{characterId:Number(settings.characterId),instant:false}
    });
    if(result?.success===false){
      throw new Error(result?.message||result?.error||'Nie udało się zakończyć podróży');
    }

    localAiPushEvent('travel_arrival_claimed',{
      source:String(source||'watchdog'),
      districtId:Number(result?.currentDistrictId||ts?.targetDistrictId||0),
      districtName:String(result?.districtName||ts?.targetDistrictName||''),
      pendingArrivalBefore:true
    });

    state.localAI.worldLastWriteAt=Date.now();
    state.localAI.worldActionGate='OK • WYSIADŁEM Z AUTOBUSU';
    state.localAI.worldActionGateAt=Date.now();
    state.localAI.worldNextAt=0;
    state.localAI.nextAt=Date.now()+1200;
    return true;
  }

  function localAiHustleActive(world=state.localAI.world){
    return world?.hustling?.activeSession || null;
  }

  function localAiMenelActive(world=state.localAI.world){
    return world?.menel?.activeActivity || world?.menel?.currentActivity || null;
  }

  function localAiCollectionValue(itemId){
    const v=localAiMarketValue(itemId);
    return v==null?Infinity:Number(v);
  }

  function localAiPendingMenelResult(){
    const world=state.localAI.world||{};
    const st=world.menel||{};
    const ch=localAiCharacter(world)||{};

    if(st.lastMenelModeResult){
      return {
        districtName:String(st.districtName||ch.district_name||''),
        estimatedDuration:Number(st.estimatedDuration||0),
        result:st.lastMenelModeResult,
        source:'status'
      };
    }

    if(st.pendingCompletion && ch.pending_activity_result){
      try{
        const parsed=typeof ch.pending_activity_result==='string'
          ? JSON.parse(ch.pending_activity_result)
          : ch.pending_activity_result;

        if(parsed && (parsed.type==='menel_mode' || parsed.collecting || parsed.begging || parsed.dumpster)){
          return {
            districtName:String(st.districtName||ch.district_name||''),
            estimatedDuration:Number(st.estimatedDuration||0),
            result:parsed,
            source:'character.pending_activity_result'
          };
        }
      }catch(e){
        state.localAI.error=`Nie mogę odczytać pending_activity_result: ${String(e?.message||e)}`;
      }
    }

    return null;
  }

  function localAiMenelPendingFingerprint(pending=localAiPendingMenelResult()){
    if(!pending) return '';
    try{
      return JSON.stringify({
        districtName:String(pending.districtName||''),
        source:String(pending.source||''),
        result:pending.result||null
      });
    }catch{
      return `${pending.districtName||''}|${pending.source||''}`;
    }
  }

  async function localAiResyncMenelAfterClear({attempts=4}={}){
    const id=Number(settings.characterId);
    let last={cleared:false,status:null,character:null,pending:null};

    for(let i=0;i<Math.max(1,Number(attempts||4));i++){
      if(i>0) await sleep(250 + i*250);

      // Kolejność zgodna z ręcznym flow: po zamknięciu wyniku
      // odświeżamy postać i dopiero status MenelMode.
      const chResp=await apiActive(`/api/character/${id}`);
      await sleep(80);
      const st=await apiActive(`/api/scavenging/${id}/menel-mode/status`);

      if(!state.localAI.world) state.localAI.world={};
      state.localAI.world.character=chResp;
      state.localAI.world.menel=st;
      state.localAI.menelStatus=st;
      state.localAI.worldLastAt=Date.now();

      const pending=localAiPendingMenelResult();

      // Dla decyzji Brain najważniejszym sygnałem jest pendingCompletion.
      // Jeżeli serwer już ustawił false, stary pending_activity_result w character
      // nie ma prawa ponownie blokować planera.
      const cleared =
        !st?.pendingCompletion &&
        !st?.lastMenelModeResult &&
        !st?.activeActivity &&
        !st?.currentActivity;

      last={cleared,status:st,character:chResp,pending};

      if(cleared){
        state.localAI.menelClearSync={
          confirmed:true,
          confirmedAt:Date.now(),
          statusPending:false
        };
        state.localAI.worldActionGate='OK • MENELMODE ODEBRANY';
        state.localAI.worldActionGateAt=Date.now();

        // Następna decyzja świata ma nastąpić szybko, a nie dopiero za 30 s.
        state.localAI.worldNextAt=0;
        state.localAI.nextAt=Date.now()+1200;
        return last;
      }
    }

    state.localAI.menelClearSync={
      confirmed:false,
      checkedAt:Date.now(),
      pendingFingerprint:localAiMenelPendingFingerprint(last.pending),
      statusPending:!!last.status?.pendingCompletion
    };
    state.localAI.worldActionGate='MENELMODE: CZEKAM NA POTWIERDZENIE';
    state.localAI.worldActionGateAt=Date.now();
    state.localAI.worldNextAt=0;
    state.localAI.nextAt=Date.now()+3000;
    return last;
  }

  function localAiSavePersistent(){
    try{
      localAiPersistent={
        version:1,
        inventoryPolicyVersion:2,
        savedAt:Date.now(),
        preMenelSnapshot:state.localAI.inventoryGuardian?.preMenelSnapshot||null,
        inventoryLastAction:String(state.localAI.inventoryGuardian?.lastAction||'—'),
        inventoryServerSafeLimit:Number.isFinite(Number(state.localAI.inventoryGuardian?.serverSafeLimit))
          ? Number(state.localAI.inventoryGuardian.serverSafeLimit)
          : null,
        inventoryServerRejectedAt:Number(state.localAI.inventoryGuardian?.serverRejectedAt||0),
        inventoryServerRejectedAction:String(state.localAI.inventoryGuardian?.serverRejectedAction||''),
        melinaSlotsUsed:Number(state.localAI.inventoryGuardian?.melinaSlotsUsed||0),
        melinaCapacity:Number(state.localAI.inventoryGuardian?.melinaCapacity||0),
        melinaLastAction:String(state.localAI.inventoryGuardian?.melinaLastAction||'—'),
        lastLoot:Array.isArray(state.localAI.inventoryGuardian?.lastLoot)
          ? state.localAI.inventoryGuardian.lastLoot.slice(-20)
          : [],
        actionGuard:{
          key:String(state.localAI.actionGuard?.key||''),
          failures:Number(state.localAI.actionGuard?.failures||0),
          lastError:String(state.localAI.actionGuard?.lastError||''),
          lastAt:Number(state.localAI.actionGuard?.lastAt||0),
          lastProgressAt:Number(state.localAI.actionGuard?.lastProgressAt||Date.now())
        },
        garden:{
          trials:Array.isArray(state.localAI.garden?.trials)
            ? state.localAI.garden.trials.slice(-80)
            : [],
          best:state.localAI.garden?.best||null,
          lastAction:String(state.localAI.garden?.lastAction||'—'),
          lastActionAt:Number(state.localAI.garden?.lastActionAt||0)
        }
      };
      saveJSON(K.localAiPersistent,localAiPersistent);
    }catch{}
  }

  function localAiActionKey(action){
    if(!action || typeof action!=='object') return 'none';
    return JSON.stringify({
      type:String(action.type||''),
      districtId:Number(action.districtId||0),
      npcId:Number(action.npcId||0),
      collectionId:Number(action.collectionId||0),
      itemId:Number(action.itemId||0),
      hustlingTypeId:Number(action.hustlingTypeId||0)
    });
  }

  function localAiResetActionGuard(action=null){
    state.localAI.actionGuard.key=action?localAiActionKey(action):'';
    state.localAI.actionGuard.failures=0;
    state.localAI.actionGuard.lastError='';
    state.localAI.actionGuard.lastAt=Date.now();
    state.localAI.actionGuard.lastProgressAt=Date.now();
    localAiSavePersistent();
  }

  function localAiRegisterActionFailure(action,msg){
    const key=localAiActionKey(action);
    const normalized=String(msg||'').slice(0,400);
    const g=state.localAI.actionGuard;

    if(g.key===key && g.lastError===normalized){
      g.failures=Number(g.failures||0)+1;
    }else{
      g.key=key;
      g.failures=1;
      g.lastError=normalized;
    }

    g.lastAt=Date.now();
    localAiSavePersistent();

    const limit=Math.max(2,Number(autoCfg.localAiRepeatErrorLimit||3));
    if(g.failures>=limit){
      state.localAI.worldActionGate=`ANTYPĘTLA: ${g.failures}× ${String(action?.type||'akcja')} — pełny resync`;
      state.localAI.worldActionGateAt=Date.now();
      state.localAI.worldNextAt=0;
      state.localAI.nextAt=Date.now()+60000;

      localAiPushEvent('anti_loop',{
        actionType:String(action?.type||'unknown'),
        label:String(action?.label||''),
        failures:g.failures,
        error:normalized
      });

      autoLogMsg(
        'warn',
        `ANTYPĘTLA: ${g.failures} razy ten sam błąd (${String(action?.type||'akcja')}). Zatrzymuję powtarzanie i wymuszam resync.`
      );
      return true;
    }

    return false;
  }

  function localAiCompactInventory(invData){
    return {
      at:Date.now(),
      capacity:Number(invData?.capacity||0),
      slotsUsed:Number(invData?.slotsUsed||0),
      isOverloaded:!!invData?.isOverloaded,
      items:(invData?.inventory||[]).map(x=>({
        inventoryId:Number(x.inventory_id||0),
        itemId:Number(x.id||x.item_id||0),
        name:String(x.name||x.item_name||''),
        quantity:Number(x.quantity||1),
        enhancement:Number(x.enhancement_level||0),
        rarity:String(x.rarity||''),
        isBulky:Number(x.is_bulky||0),
        categoryId:Number(x.category_id||0)
      }))
    };
  }

  async function localAiFreshInventory(){
    const id=Number(settings.characterId);
    const inv=await apiActive(`/api/character/${id}/inventory`);
    if(!inv?.success || !Array.isArray(inv?.inventory)){
      throw new Error('Nie udało się pobrać świeżego ekwipunku.');
    }

    const g=state.localAI.inventoryGuardian;
    g.lastCheckAt=Date.now();
    g.slotsUsed=Number(inv.slotsUsed||0);
    g.capacity=Number(inv.capacity||0);
    g.overloaded=!!inv.isOverloaded;
    g.reserve=Math.max(0,Number(autoCfg.localAiInventoryReserveSlots ?? 4));

    // Samonaprawa starego/błędnego progu (np. ≤0 z poprzedniej wersji).
    const cap=Number(inv.capacity||0);
    let learned=(
      Number.isFinite(Number(g.serverSafeLimit)) &&
      Number(g.serverSafeLimit)>0 &&
      (!cap || Number(g.serverSafeLimit)<cap)
    )
      ? Number(g.serverSafeLimit)
      : null;

    if(learned==null && g.serverSafeLimit!=null){
      g.serverSafeLimit=null;
      localAiSavePersistent();
    }

    const learnedText=learned!=null ? ` • limit akcji ≤${learned}` : '';
    g.status=`${g.slotsUsed}/${g.capacity}${g.overloaded?' • PRZECIĄŻONY':' • OK'}${learnedText}`;
    return inv;
  }

  function localAiInventoryDiff(beforeCompact,afterInv){
    const before=new Map();
    for(const x of (beforeCompact?.items||[])){
      before.set(Number(x.inventoryId),Number(x.quantity||1));
    }

    const out=[];
    for(const x of (afterInv?.inventory||[])){
      const iid=Number(x.inventory_id||0);
      const qty=Number(x.quantity||1);
      const prev=before.get(iid);

      if(!before.has(iid)){
        out.push({...x,__newQuantity:qty,__newSlot:true});
      }else if(qty>Number(prev||0)){
        out.push({...x,__newQuantity:qty-Number(prev||0),__newSlot:false});
      }
    }

    return out;
  }

  async function localAiSnapshotBeforeMenel(){
    if(!autoCfg.localAiInventoryGuardian) return null;
    try{
      const inv=await localAiFreshInventory();
      const compact=localAiCompactInventory(inv);
      state.localAI.inventoryGuardian.preMenelSnapshot=compact;
      state.localAI.inventoryGuardian.lastAction='Snapshot EQ przed MenelMode';
      localAiSavePersistent();
      return compact;
    }catch(e){
      autoLogMsg('warn',`PLECAK: nie udało się zrobić snapshotu przed MenelMode: ${String(e?.message||e)}`);
      return null;
    }
  }

  async function localAiQueueNewLootForDismantle(newRows){
    if(!autoCfg.localAiDismantleDistrictLoot) return 0;
    if(!Array.isArray(newRows) || !newRows.length) return 0;

    try{
      const q=await apiActive(`/api/workshop/${settings.characterId}/queue`);
      parseQueue(q);
    }catch{}

    if(dismantleFreeSlots()<=0) return 0;

    const dis=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
    state.manual.dismantlableItems=Array.isArray(dis?.items)?dis.items:[];

    const wantedIds=new Set(newRows.map(x=>Number(x.inventory_id||0)).filter(Boolean));
    const candidates=(state.manual.dismantlableItems||[])
      .filter(x=>wantedIds.has(Number(x.inventory_id)))
      .map(inv=>{
        const pol=inventoryDismantlePolicy(inv);
        if(!pol.allowed) return null;

        const plan=strategicStockPlan();
        const need=strategicNeedObject(plan,'target');
        const calc=usefulReplacementValueForInventory(inv,need);

        // Demontujemy automatycznie tylko wtedy, gdy materiały są faktycznie potrzebne
        // i ich koszt odtworzenia jest >= wartości przedmiotu.
        if(calc.useful<=0 || calc.replacementValue<=0) return null;
        if(Number(pol.value||Infinity)>Number(calc.replacementValue||0)) return null;

        return {
          inv,
          policy:pol,
          useful:calc.useful,
          replacementValue:calc.replacementValue,
          score:Number(pol.value||0)/Math.max(0.01,calc.replacementValue)
        };
      })
      .filter(Boolean)
      .sort((a,b)=>a.score-b.score || Number(a.policy.value||0)-Number(b.policy.value||0));

    let added=0;

    for(const c of candidates){
      if(dismantleFreeSlots()<=0) break;

      const q=await apiActive(`/api/workshop/${settings.characterId}/queue/add`,{
        method:'POST',
        body:{inventoryId:Number(c.inv.inventory_id)}
      });
      parseQueue(q);
      added++;

      state.localAI.inventoryGuardian.lastAction=
        `Łup → demontaż: ${c.inv.item_name||c.inv.name||c.policy.name}`;

      localAiPushEvent('inventory_loot_dismantle',{
        inventoryId:Number(c.inv.inventory_id),
        itemId:Number(c.inv.item_id||c.inv.id||0),
        name:String(c.inv.item_name||c.inv.name||c.policy.name||''),
        value:Number(c.policy.value||0),
        replacementValue:Number(c.replacementValue||0)
      });

      await sleep(250);
    }

    if(added) localAiSavePersistent();
    return added;
  }

  function localAiMelinaFillBody(body,inventoryId){
    if(body==null) return {inventoryId:Number(inventoryId)};

    const walk=(value,key='')=>{
      if(value===null || value===undefined) return value;

      if(Array.isArray(value)){
        return value.map(v=>walk(v,key));
      }

      if(typeof value==='object'){
        const out={};
        for(const [k,v] of Object.entries(value)){
          if(/inventory.?id/i.test(k)){
            out[k]=Number(inventoryId);
          }else{
            out[k]=walk(v,k);
          }
        }
        return out;
      }

      if(value==='{inventoryId}') return Number(inventoryId);
      return value;
    };

    return walk(body);
  }

  async function localAiReplayMelinaAdd(inventoryId){
    if(!melinaAddLearned?.safe){
      return {ok:false,reason:'brak nauczonego przenoszenia do rupieciarni'};
    }

    const id=Number(settings.characterId);
    const path=String(melinaAddLearned.path||'')
      .replace('{id}',String(id))
      .replace('{inventoryId}',String(Number(inventoryId)));

    if(!/^\/api\/character\/\d+\/melina-storage(?:\/[^?]*)?$/.test(path)){
      throw new Error(`Nauczona ścieżka rupieciarni jest nieprawidłowa: ${path}`);
    }

    if(path.endsWith('/remove')){
      throw new Error('Blokada bezpieczeństwa: sekwencja REMOVE nie może służyć do odkładania do rupieciarni.');
    }

    const before=await localAiFreshInventory();
    const beforeSlots=Number(before.slotsUsed||0);

    const response=await apiActive(path,{
      method:String(melinaAddLearned.method||'POST').toUpperCase(),
      body:localAiMelinaFillBody(melinaAddLearned.body,inventoryId)
    });

    if(response?.success===false){
      throw new Error(response?.message||'Rupieciarnia odrzuciła przeniesienie.');
    }

    await sleep(180);
    const after=await localAiFreshInventory();

    const stillThere=(after.inventory||[]).some(x=>Number(x.inventory_id)===Number(inventoryId));
    const improved=Number(after.slotsUsed||0)<beforeSlots || !stillThere;

    if(!improved){
      throw new Error('Przeniesienie do rupieciarni nie zmniejszyło obciążenia plecaka.');
    }

    localAiPushEvent('inventory_move_melina',{
      inventoryId:Number(inventoryId),
      beforeSlots,
      afterSlots:Number(after.slotsUsed||0)
    });

    return {ok:true,response,after};
  }

  async function localAiFreshMelina(){
    const data=await apiActive(`/api/character/${settings.characterId}/melina-storage`);
    if(!data?.success || !Array.isArray(data?.storageItems)){
      throw new Error('Nie udało się pobrać stanu rupieciarni.');
    }

    const g=state.localAI.inventoryGuardian;
    g.melinaSlotsUsed=Number(data.slotsUsed||0);
    g.melinaCapacity=Number(data.capacity||0);
    return data;
  }

  async function localAiReplayMelinaRemove(inventoryId){
    const iid=Number(inventoryId||0);
    if(!iid) return {ok:false,reason:'brak inventoryId'};

    const before=await localAiFreshMelina();
    const row=(before.storageItems||[]).find(x=>Number(x.inventory_id)===iid);
    if(!row) return {ok:false,reason:'przedmiotu nie ma w rupieciarni'};

    // Przed wyjęciem musi być miejsce w plecaku.
    const bag=await localAiGuardInventory({
      reason:'miejsce na wyjęcie z rupieciarni',
      processLoot:false,
      minimumReserve:1
    });
    if(!bag.ok) return {ok:false,reason:'brak miejsca w plecaku na wyjęcie'};

    const response=await apiActive(`/api/character/${settings.characterId}/melina-storage/remove`,{
      method:'POST',
      body:{inventoryId:iid}
    });

    if(response?.success===false){
      throw new Error(response?.message||'Rupieciarnia odrzuciła wyjęcie.');
    }

    await sleep(180);

    const after=await localAiFreshMelina();
    const stillThere=(after.storageItems||[]).some(x=>Number(x.inventory_id)===iid);
    if(stillThere){
      throw new Error('Wyjęcie z rupieciarni nie zostało potwierdzone.');
    }

    const g=state.localAI.inventoryGuardian;
    g.melinaLastAction=`Rupieciarnia → plecak: ${row.name||row.item_name||'przedmiot'}`;
    localAiSavePersistent();

    localAiPushEvent('inventory_move_from_melina',{
      inventoryId:iid,
      itemId:Number(row.id||row.item_id||0),
      name:String(row.name||row.item_name||''),
      beforeSlots:Number(before.slotsUsed||0),
      afterSlots:Number(after.slotsUsed||0)
    });

    return {ok:true,row,response,after};
  }

  function localAiMelinaFirstCandidate(row,equippedIds){
    const iid=Number(row?.inventory_id||0);
    if(!iid) return false;
    if(equippedIds.has(iid)) return false;

    // MELINA-FIRST v8.5.4: odkładamy KAŻDY przedmiot z plecaka,
    // który nie jest aktualnie założony i którego serwer pozwoli przenieść.
    // Składniki craftu, kolekcje i produkty na sprzedaż też mogą tam trafić,
    // bo Pomagier potrafi je później automatycznie wyjąć.
    if(Number(row?.is_in_melina_storage||0)===1) return false;
    return true;
  }

  async function localAiRelieveBackpackByDismantle({reason='melina-full',targetSlots=null}={}){
    if(!autoCfg.localAiInventoryGuardian || !autoCfg.autoDismantle){
      return {ok:false,moved:0,reason:'auto demontaż wyłączony'};
    }

    try{
      const q=await apiActive(`/api/workshop/${settings.characterId}/queue`);
      parseQueue(q);
    }catch{}

    if(dismantleFreeSlots()<=0){
      return {ok:false,moved:0,reason:'kolejka demontażu pełna'};
    }

    const inv=await localAiFreshInventory();
    const target=Number.isFinite(Number(targetSlots))
      ? Number(targetSlots)
      : Math.max(0,Number(inv.capacity||0)-Math.max(4,Number(autoCfg.localAiInventoryReserveSlots ?? 4)));

    if(Number(inv.slotsUsed||0)<=target){
      return {ok:true,moved:0,inventory:inv};
    }

    const eq=await apiActive(`/api/character/${settings.characterId}/equipment`);
    const equippedIds=new Set(
      (eq?.equipment||[]).map(x=>Number(x.inventory_id||0)).filter(Boolean)
    );

    const dis=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
    const rows=Array.isArray(dis?.items)?dis.items:[];

    const candidates=rows
      .filter(row=>{
        const iid=Number(row.inventory_id||0);
        const itemId=Number(row.item_id||row.id||0);
        if(!iid || !itemId) return false;
        if(equippedIds.has(iid)) return false;
        if(localAiIsProfitProductProtected(iid)) return false;
        if(isCraftIngredientProtected(itemId)) return false;
        if(isCollectionItemProtected(itemId)) return false;

        const pol=inventoryDismantlePolicy(row);
        return !!pol.allowed;
      })
      .map(row=>{
        const pol=inventoryDismantlePolicy(row);
        return {
          row,
          value:Number(pol.value??Number.POSITIVE_INFINITY),
          name:String(row.item_name||row.name||pol.name||'przedmiot')
        };
      })
      .sort((a,b)=>a.value-b.value || Number(a.row.inventory_id)-Number(b.row.inventory_id));

    let moved=0;

    for(const c of candidates){
      if(dismantleFreeSlots()<=0) break;

      const fresh=await localAiFreshInventory();
      if(Number(fresh.slotsUsed||0)<=target) break;

      // Jeśli w międzyczasie w rupieciarni zwolnił się slot, nie niszczymy
      // przedmiotu. Następny krok Guardiana wróci do MELINA-FIRST.
      try{
        const storage=await localAiFreshMelina();
        if(Number(storage.slotsUsed||0)<Number(storage.capacity||0)) break;
      }catch{}

      const still=(fresh.inventory||[]).some(
        x=>Number(x.inventory_id)===Number(c.row.inventory_id)
      );
      if(!still) continue;

      const qres=await apiActive(`/api/workshop/${settings.characterId}/queue/add`,{
        method:'POST',
        body:{inventoryId:Number(c.row.inventory_id)}
      });
      parseQueue(qres);
      moved++;

      state.localAI.inventoryGuardian.lastAction=
        `Melina pełna → demontaż: ${c.name}`;

      localAiPushEvent('inventory_relief_dismantle',{
        reason,
        inventoryId:Number(c.row.inventory_id),
        itemId:Number(c.row.item_id||c.row.id||0),
        name:c.name,
        value:Number.isFinite(c.value)?c.value:null
      });

      await sleep(220);
    }

    const after=await localAiFreshInventory();
    localAiSavePersistent();

    return {
      ok:Number(after.slotsUsed||0)<=target,
      moved,
      inventory:after,
      reason:moved ? '' : 'brak bezpiecznych kandydatów do demontażu'
    };
  }

  async function localAiEmergencyReliefWhenMelinaFull({reason='akcja',targetSlots=null}={}){
    let inv=await localAiFreshInventory();
    const target=Number.isFinite(Number(targetSlots))
      ? Math.max(0,Number(targetSlots))
      : Math.max(0,Number(inv.capacity||0)-1);

    if(Number(inv.slotsUsed||0)<=target){
      return {ok:true,inventory:inv,listed:0,dismantled:0};
    }

    // Zanim sprzedamy albo rozmontujemy COKOLWIEK, zawsze świeżo sprawdzamy
    // rupieciarnię. Jeżeli zwolnił się choć jeden slot, wracamy do odkładania.
    let storage=await localAiFreshMelina();
    if(Number(storage.slotsUsed||0)<Number(storage.capacity||0)){
      await localAiStoreBackpackToMelina({reason:`${reason}: pojawiło się miejsce`});
      inv=await localAiFreshInventory();
      storage=await localAiFreshMelina();
      if(Number(inv.slotsUsed||0)<=target){
        return {ok:true,inventory:inv,storage,listed:0,dismantled:0};
      }
      if(Number(storage.slotsUsed||0)<Number(storage.capacity||0)){
        return {ok:false,inventory:inv,storage,listed:0,dismantled:0,reason:'rupieciarnia ma wolne miejsce — nie uruchamiam destrukcyjnego fallbacku'};
      }
    }

    let listed=0;
    const maxSales=Math.max(0,Math.min(10,Number(inv.slotsUsed||0)-target));

    while(Number(inv.slotsUsed||0)>target && listed<maxSales){
      storage=await localAiFreshMelina();
      if(Number(storage.slotsUsed||0)<Number(storage.capacity||0)){
        await localAiStoreBackpackToMelina({reason:`${reason}: slot zwolnił się przed sprzedażą`});
        inv=await localAiFreshInventory();
        break;
      }

      let sold=false;
      try{
        // Najpierw normalny produkt z pipeline (jeśli nadal spełnia próg zysku).
        sold=await sellOneBackpackProfitItemForSpace();

        // Jeżeli pipeline nie ma nic do wystawienia, a konkretna akcja świata
        // naprawdę potrzebuje slotu i rupieciarnia jest 100% pełna, wystawiamy
        // najtańszy BEZPIECZNY przedmiot z plecaka. Chronione: wyposażenie,
        // składniki craftu, kolekcje, monety, nasiona i produkty pipeline.
        if(!sold){
          sold=await sellOneSafeBackpackItemForSpace({reason});
        }
      }catch(e){
        autoLogMsg('warn',`48/48 → SPRZEDAŻ awaryjna: ${String(e?.message||e)}`);
        break;
      }
      if(!sold) break;
      listed++;
      await sleep(220);
      inv=await localAiFreshInventory();
    }

    if(Number(inv.slotsUsed||0)>target){
      storage=await localAiFreshMelina();
      if(Number(storage.slotsUsed||0)>=Number(storage.capacity||0)){
        const relief=await localAiRelieveBackpackByDismantle({
          reason:`${reason}: rupieciarnia pełna`,
          targetSlots:target
        });
        inv=relief.inventory||inv;

        state.localAI.inventoryGuardian.melinaLastAction=
          `48/48 fallback • sprzedaż ${listed} • demontaż ${Number(relief.moved||0)} • plecak ${Number(inv.slotsUsed||0)}/${Number(inv.capacity||0)}`;
        localAiSavePersistent();

        return {
          ok:Number(inv.slotsUsed||0)<=target,
          inventory:inv,
          storage,
          listed,
          dismantled:Number(relief.moved||0),
          reason:relief.reason||''
        };
      }
    }

    state.localAI.inventoryGuardian.melinaLastAction=
      `48/48 fallback • sprzedaż ${listed} • plecak ${Number(inv.slotsUsed||0)}/${Number(inv.capacity||0)}`;
    localAiSavePersistent();

    return {
      ok:Number(inv.slotsUsed||0)<=target,
      inventory:inv,
      storage,
      listed,
      dismantled:0
    };
  }

  async function localAiStoreBackpackToMelina({reason='melina-first'}={}){
    if(!autoCfg.localAiInventoryGuardian || !autoCfg.localAiMelinaFirst){
      return {ok:true,disabled:true,moved:0};
    }

    if(!melinaAddLearned?.safe){
      return {ok:false,reason:'brak nauczonej rupieciarni',moved:0};
    }

    let inv=await localAiFreshInventory();
    let storage=await localAiFreshMelina();

    // v8.5.5: zero sztucznego zapasu w rupieciarni.
    // Jeśli jest choć 1 wolny slot, Pomagier ma odkładać rzeczy aż do realnego limitu serwera.
    const reserve=0;
    const freeStorage=Math.max(
      0,
      Number(storage.capacity||0)-Number(storage.slotsUsed||0)
    );

    if(freeStorage<=0){
      // NIGHT-SAFE v8.5.5: samo stwierdzenie "48/48" NIE uruchamia już
      // hurtowej sprzedaży ani demontażu. Destrukcyjne zwalnianie miejsca
      // wykonuje wyłącznie Inventory Guardian i tylko wtedy, gdy konkretna
      // akcja naprawdę potrzebuje wolnych slotów albo plecak jest przeciążony.
      state.localAI.inventoryGuardian.melinaLastAction=
        `Rupieciarnia pełna ${Number(storage.slotsUsed||0)}/${Number(storage.capacity||0)} • czekam na realną potrzebę miejsca`;
      localAiSavePersistent();
      return {
        ok:true,
        moved:0,
        listed:0,
        full:true,
        inventory:inv,
        storage
      };
    }

    const eq=await apiActive(`/api/character/${settings.characterId}/equipment`);
    const equippedIds=new Set(
      (eq?.equipment||[]).map(x=>Number(x.inventory_id||0)).filter(Boolean)
    );

    const rows=(inv.inventory||[])
      .filter(x=>localAiMelinaFirstCandidate(x,equippedIds))
      .sort((a,b)=>Number(a.inventory_id||0)-Number(b.inventory_id||0));

    let moved=0;
    let failures=0;

    for(const row of rows){
      storage=await localAiFreshMelina();
      const free=Math.max(
        0,
        Number(storage.capacity||0)-Number(storage.slotsUsed||0)
      );
      if(free<=0) break;

      inv=await localAiFreshInventory();
      const still=(inv.inventory||[]).find(
        x=>Number(x.inventory_id)===Number(row.inventory_id)
      );
      if(!still) continue;

      try{
        const res=await localAiReplayMelinaAdd(Number(row.inventory_id));
        if(res.ok){
          moved++;
          state.localAI.inventoryGuardian.melinaLastAction=
            `Plecak → rupieciarnia: ${row.name||row.item_name||'przedmiot'}`;
        }
      }catch(e){
        failures++;
        autoLogMsg(
          'warn',
          `MELINA-FIRST: pomijam ${row.name||row.item_name||row.inventory_id}: ${String(e?.message||e)}`
        );

        // NIGHT-SAFE: jeden lub kilka nieprzenoszalnych przedmiotów nie może
        // zatrzymać napełniania rupieciarni. Lista jest skończona, więc po prostu
        // próbujemy kolejnych pozycji i kończymy po jednym pełnym przebiegu.
      }

      await sleep(160);
    }

    inv=await localAiFreshInventory();
    storage=await localAiFreshMelina();

    const g=state.localAI.inventoryGuardian;
    g.melinaSlotsUsed=Number(storage.slotsUsed||0);
    g.melinaCapacity=Number(storage.capacity||0);
    g.melinaLastAction=
      moved
        ? `${reason}: przeniesiono ${moved} • melina ${g.melinaSlotsUsed}/${g.melinaCapacity}`
        : `${reason}: nic do przeniesienia • melina ${g.melinaSlotsUsed}/${g.melinaCapacity}`;

    localAiSavePersistent();

    localAiPushEvent('inventory_melina_first',{
      reason,
      moved,
      backpackSlotsUsed:Number(inv.slotsUsed||0),
      backpackCapacity:Number(inv.capacity||0),
      melinaSlotsUsed:Number(storage.slotsUsed||0),
      melinaCapacity:Number(storage.capacity||0)
    });

    return {ok:true,moved,inventory:inv,storage};
  }

  async function localAiTakeItemFromMelinaByItemId(itemId){
    const id=Number(itemId||0);
    if(!id) return {ok:false,reason:'brak itemId'};

    const storage=await localAiFreshMelina();
    const row=(storage.storageItems||[]).find(x=>Number(x.id||x.item_id||0)===id);
    if(!row) return {ok:false,reason:'brak w rupieciarni'};

    return localAiReplayMelinaRemove(Number(row.inventory_id));
  }

  async function localAiTakeInventoryFromMelina(inventoryId){
    const iid=Number(inventoryId||0);
    if(!iid) return {ok:false,reason:'brak inventoryId'};

    const storage=await localAiFreshMelina();
    const row=(storage.storageItems||[]).find(x=>Number(x.inventory_id)===iid);
    if(!row) return {ok:false,reason:'brak w rupieciarni'};

    return localAiReplayMelinaRemove(iid);
  }

  function localAiIsProfitProductProtected(inventoryId){
    const iid=Number(inventoryId||0);
    if(!iid) return false;

    if((saleQueue||[]).some(x=>Number(x.inventoryId||0)===iid)){
      return true;
    }

    if((profitJobs||[]).some(j=>
      Number(j.inventoryId||0)===iid &&
      !['sold','returned','abandoned','storage'].includes(String(j.status||''))
    )){
      return true;
    }

    return false;
  }

  function localAiSafeStorageCandidate(row,equippedIds){
    const iid=Number(row?.inventory_id||0);
    const itemId=Number(row?.id||row?.item_id||0);
    if(!iid || !itemId) return false;
    if(equippedIds.has(iid)) return false;
    if(localAiIsProfitProductProtected(iid)) return false;
    if(isCraftIngredientProtected(itemId)) return false;
    if(isCollectionItemProtected(itemId)) return false;
    return true;
  }

  function localAiRequiredFreeSlots(actionType='',minimumReserve=0){
    const type=String(actionType||'');
    const requested=Math.max(0,Number(minimumReserve||0));

    // Twarda polityka v8.6.9:
    // - MenelMode: przed START musi istnieć co najmniej 1 wolny slot.
    // - Podróż / sprzątanie po MenelMode: brak sztucznego zapasu;
    //   blokuje tylko realne przeciążenie (> capacity).
    // - Pozostałe operacje nadal mogą korzystać z ustawienia ogólnego.
    if(type==='menel_start') return Math.max(1,requested);
    if(type==='travel' || type==='post_menel') return requested;

    return Math.max(
      0,
      Number(autoCfg.localAiInventoryReserveSlots ?? 4),
      requested
    );
  }

  async function localAiGuardInventory({
    reason='check',
    processLoot=true,
    forceRelief=false,
    minimumReserve=0,
    targetSlots=null,
    actionType=''
  }={}){
    if(!autoCfg.localAiInventoryGuardian){
      return {ok:true,disabled:true};
    }

    const g=state.localAI.inventoryGuardian;
    let inv=await localAiFreshInventory();

    const before=g.preMenelSnapshot;
    let newRows=before ? localAiInventoryDiff(before,inv) : [];
    g.lastLoot=newRows.map(x=>({
      inventoryId:Number(x.inventory_id||0),
      itemId:Number(x.id||x.item_id||0),
      name:String(x.name||x.item_name||''),
      quantity:Number(x.__newQuantity||x.quantity||1)
    })).slice(-20);

    if(processLoot && newRows.length){
      await localAiQueueNewLootForDismantle(newRows);
      inv=await localAiFreshInventory();
      newRows=before ? localAiInventoryDiff(before,inv) : [];
    }

    const reserve=localAiRequiredFreeSlots(actionType,minimumReserve);

    const learnedLimit=(
      actionType &&
      String(g.serverRejectedAction||'')===String(actionType) &&
      g.serverSafeLimit !== null &&
      g.serverSafeLimit !== undefined &&
      Number.isFinite(Number(g.serverSafeLimit)) &&
      Number(g.serverSafeLimit)>0
    )
      ? Number(g.serverSafeLimit)
      : Number.POSITIVE_INFINITY;

    const explicitTarget=(
      targetSlots !== null &&
      targetSlots !== undefined &&
      Number.isFinite(Number(targetSlots))
    )
      ? Number(targetSlots)
      : Number.POSITIVE_INFINITY;

    const safeLimit=Math.max(
      0,
      Math.min(
        Number(inv.capacity||0)-reserve,
        learnedLimit,
        explicitTarget
      )
    );

    const actionCritical=forceRelief || Number(minimumReserve||0)>0;

    // Serwer jest źródłem prawdy. Jeśli wcześniej odrzucił akcję przy np. 30/32,
    // zapamiętany safeLimit może być niższy niż inventory.isOverloaded.
    if(!forceRelief && !inv.isOverloaded && Number(inv.slotsUsed||0)<=safeLimit){
      g.status=`${inv.slotsUsed}/${inv.capacity} • OK • cel ≤${safeLimit}`;
      g.lastAction=processLoot && g.lastLoot.length
        ? 'Segregacja łupu zakończona'
        : `Kontrola plecaka: ${reason}`;
      g.preMenelSnapshot=null;
      localAiSavePersistent();
      return {ok:true,inventory:inv};
    }

    // Jeżeli tylko kończy się zapas slotów, ale nie ma overloadu i nie mamy
    // nauczonej rupieciarni, nie blokujemy podróży.
    if(!inv.isOverloaded && !melinaAddLearned?.safe){
      g.status=`${inv.slotsUsed}/${inv.capacity} • MAŁO MIEJSCA • cel ≤${safeLimit} • naucz rupieciarnię`;
      g.lastAction='Brak nauczonego przenoszenia do rupieciarni';
      localAiSavePersistent();
      return actionCritical
        ? {ok:false,inventory:inv,lowSpace:true,reason:'za mało wolnych slotów dla akcji'}
        : {ok:true,inventory:inv,lowSpace:true};
    }

    if(!autoCfg.localAiMoveOverflowToMelina){
      g.status=`${inv.slotsUsed}/${inv.capacity} • PRZECIĄŻONY • AUTO-RUPIECIARNIA OFF`;
      g.lastAction='Przeciążenie blokuje podróż';
      localAiSavePersistent();
      return {ok:false,reason:'przeciążony plecak'};
    }

    if(!melinaAddLearned?.safe){
      g.status=`${inv.slotsUsed}/${inv.capacity} • PRZECIĄŻONY • NAUCZ RUPIECIARNIĘ`;
      g.lastAction='Potrzebna jednorazowa nauka przenoszenia do rupieciarni';
      state.localAI.worldActionGate='PLECAK PRZECIĄŻONY — NAUCZ RUPIECIARNIĘ';
      state.localAI.worldActionGateAt=Date.now();
      localAiSavePersistent();
      return {ok:false,reason:'brak nauczonej rupieciarni'};
    }

    const eq=await apiActive(`/api/character/${settings.characterId}/equipment`);
    const equippedIds=new Set(
      (eq?.equipment||[]).map(x=>Number(x.inventory_id||0)).filter(Boolean)
    );

    // Priorytet: nowe przedmioty z ostatniego MenelMode.
    const newIds=new Set(newRows.map(x=>Number(x.inventory_id||0)).filter(Boolean));
    const allRows=(inv.inventory||[]).filter(x=>localAiSafeStorageCandidate(x,equippedIds));

    const marketVal=x=>{
      const mv=inventoryItemMarketValue(
        Number(x.id||x.item_id||0),
        Number(x.enhancement_level||0)
      );
      return mv.value==null ? Number.POSITIVE_INFINITY : Number(mv.value);
    };

    allRows.sort((a,b)=>{
      const an=newIds.has(Number(a.inventory_id))?0:1;
      const bn=newIds.has(Number(b.inventory_id))?0:1;
      return an-bn || marketVal(a)-marketVal(b);
    });

    let moved=0;

    for(const row of allRows){
      inv=await localAiFreshInventory();
      const nowSafe=
        !inv.isOverloaded &&
        Number(inv.slotsUsed||0)<=safeLimit;

      if(nowSafe && moved>0) break;
      if(nowSafe && !forceRelief) break;

      // Nie wysyłamy bezsensownego POST /add, jeżeli świeży GET już mówi 48/48.
      // To ogranicza błędy serwera podczas wielogodzinnej pracy.
      try{
        const storage=await localAiFreshMelina();
        if(
          Number(storage.capacity||0)>0 &&
          Number(storage.slotsUsed||0)>=Number(storage.capacity||0)
        ) break;
      }catch{}

      const still=(inv.inventory||[]).find(x=>Number(x.inventory_id)===Number(row.inventory_id));
      if(!still) continue;

      try{
        const res=await localAiReplayMelinaAdd(Number(row.inventory_id));
        if(res.ok){
          moved++;
          g.lastAction=`Plecak → rupieciarnia: ${row.name||row.item_name||'przedmiot'}`;
          await sleep(180);

          // W trybie recovery serwer odrzucił poprzednią akcję. Po każdym
          // przeniesieniu pobieramy świeży stan i zatrzymujemy się natychmiast,
          // gdy osiągniemy wyuczony cel.
          if(forceRelief){
            const check=await localAiFreshInventory();
            if(!check.isOverloaded && Number(check.slotsUsed||0)<=safeLimit) break;
          }
        }
      }catch(e){
        autoLogMsg('warn',`RUPIECIARNIA: ${String(e?.message||e)}`);
        break;
      }
    }

    inv=await localAiFreshInventory();

    let ok=
      !inv.isOverloaded &&
      Number(inv.slotsUsed||0)<=safeLimit;

    let relief=null;

    // NIGHT-SAFE: sprzedaż/demontaż jest ostatnią deską ratunku i wolno ją
    // uruchomić dopiero po świeżym potwierdzeniu, że rupieciarnia jest realnie
    // pełna. Przy zwykłej kontroli niczego nie sprzedajemy "na zapas".
    if(!ok && (actionCritical || inv.isOverloaded)){
      try{
        const storage=await localAiFreshMelina();
        const melinaFull=
          Number(storage.capacity||0)>0 &&
          Number(storage.slotsUsed||0)>=Number(storage.capacity||0);

        if(melinaFull){
          relief=await localAiEmergencyReliefWhenMelinaFull({
            reason,
            targetSlots:safeLimit
          });
          inv=relief.inventory||await localAiFreshInventory();
          ok=
            !inv.isOverloaded &&
            Number(inv.slotsUsed||0)<=safeLimit;
        }else{
          // Jest miejsce: zero sprzedaży i zero demontażu. Jeszcze jeden pełny
          // przebieg MELINA-FIRST ma pierwszeństwo przed każdą destrukcyjną akcją.
          await localAiStoreBackpackToMelina({reason:`${reason}: guardian retry`});
          inv=await localAiFreshInventory();
          ok=
            !inv.isOverloaded &&
            Number(inv.slotsUsed||0)<=safeLimit;
        }
      }catch(e){
        autoLogMsg('warn',`GUARDIAN FALLBACK: ${String(e?.message||e)}`);
      }
    }

    g.status=`${inv.slotsUsed}/${inv.capacity} • ${ok?'OK':'NADAL ZA PEŁNY'} • cel ≤${safeLimit} • do meliny ${moved}${relief?` • sprzedaż ${Number(relief.listed||0)} • demontaż ${Number(relief.dismantled||0)}`:''}`;
    if(ok) g.preMenelSnapshot=null;

    localAiSavePersistent();
    return {ok,inventory:inv,moved,relief};
  }

  async function localAiRecoverServerOverload(action,msg){
    const g=state.localAI.inventoryGuardian;
    const inv=await localAiFreshInventory();

    const slots=Number(inv.slotsUsed||0);
    const capacity=Number(inv.capacity||0);

    // v8.6.9: bazowa polityka to 1 wolny slot dla MenelMode i 0 dla podróży.
    // Jeśli serwer mimo to odrzuci akcję, byRejection (slots-1) automatycznie
    // nauczy bardziej konserwatywny limit dla tej konkretnej akcji.
    const actionReserve=action?.type==='menel_start' ? 1 : 0;
    const byReserve=Math.max(0,capacity-actionReserve);
    const byRejection=Math.max(0,slots-1);
    const oldLimit=(
      Number.isFinite(Number(g.serverSafeLimit)) &&
      Number(g.serverSafeLimit)>0
    )
      ? Number(g.serverSafeLimit)
      : Number.POSITIVE_INFINITY;

    // Nie pozwalamy zapisać bezsensownego progu 0 przy prawidłowej pojemności.
    const rawLearned=Math.min(oldLimit,byReserve,byRejection);
    const learned=capacity>0
      ? Math.max(1,Math.min(capacity-1,rawLearned))
      : Math.max(1,rawLearned);

    g.serverSafeLimit=learned;
    g.serverRejectedAt=slots;
    g.serverRejectedAction=String(action?.type||'unknown');
    g.overloaded=true;
    g.status=`${slots}/${capacity} • SERWER ODRZUCIŁ • uczę limit ≤${learned}`;
    g.lastAction=`Recovery przeciążenia po ${String(action?.type||'akcji')}`;
    localAiSavePersistent();

    autoLogMsg(
      'warn',
      `PLECAK: serwer odrzucił ${String(action?.type||'akcję')} przy ${slots}/${capacity}. ` +
      `Uczę bezpieczny limit ≤${learned} i zwalniam miejsce.`
    );

    const bag=await localAiGuardInventory({
      reason:`server overload: ${String(action?.type||'akcja')}`,
      processLoot:true,
      forceRelief:true,
      minimumReserve:actionReserve,
      targetSlots:learned,
      actionType:String(action?.type||'')
    });

    if(bag.ok){
      state.localAI.worldActionGate=`PLECAK NAPRAWIONY ${bag.inventory?.slotsUsed}/${bag.inventory?.capacity} — PONAWIAM ${String(action?.type||'AKCJĘ')}`;
      state.localAI.worldActionGateAt=Date.now();
      state.localAI.worldNextAt=0;
      state.localAI.nextAt=Date.now()+1500;

      localAiPushEvent('inventory_server_overload_recovered',{
        actionType:String(action?.type||'unknown'),
        rejectedAt:slots,
        capacity,
        learnedSafeLimit:learned,
        afterSlots:Number(bag.inventory?.slotsUsed||0),
        moved:Number(bag.moved||0),
        error:String(msg||'')
      });

      return {ok:true,bag,learned};
    }

    state.localAI.worldActionGate='PLECAK: NIE UDAŁO SIĘ ZWOLNIĆ WYSTARCZAJĄCO MIEJSCA';
    state.localAI.worldActionGateAt=Date.now();
    return {ok:false,bag,learned};
  }

  async function localAiReplayLearnedMenelClose(){
    if(!menelCloseLearned?.safe || !Array.isArray(menelCloseLearned.sequence)){
      return {ok:false,reason:'brak bezpiecznej nauczonej sekwencji'};
    }

    const id=Number(settings.characterId);
    const st0=await apiActive(`/api/scavenging/${id}/menel-mode/status`);

    if(!st0?.pendingCompletion || st0?.activeActivity || st0?.currentActivity){
      return {ok:false,reason:'stan nie jest naturalnym pendingCompletion'};
    }

    const results=[];

    for(const step of menelCloseLearned.sequence){
      const method=String(step.method||'POST').toUpperCase();
      if(method==='GET') continue;

      const path=String(step.path||'').replace('{id}',String(id));

      if(!/^\/api\/scavenging\/\d+\/menel-mode(?:\/[^?]*)?$/.test(path)){
        throw new Error(`Nauczona ścieżka poza MenelMode: ${path}`);
      }

      if(path.includes('/complete-now')){
        const observed=Number(step.observedResponse?.premiumCost);
        if(!Number.isFinite(observed) || observed!==0){
          throw new Error('Blokada bezpieczeństwa: complete-now nie miał potwierdzonego kosztu 0.');
        }

        const fresh=await apiActive(`/api/scavenging/${id}/menel-mode/status`);
        if(!fresh?.pendingCompletion || fresh?.activeActivity || fresh?.currentActivity){
          throw new Error('Blokada bezpieczeństwa: complete-now tylko dla ukończonego pendingCompletion.');
        }
      }

      const response=await apiActive(path,{method,body:step.body});

      if(path.includes('/complete-now') && Number(response?.premiumCost||0)>0){
        autoCfg.enabled=false;
        autoSaveCfg();
        throw new Error(`STOP: serwer naliczył premiumCost=${response.premiumCost}. Autopilot wyłączony.`);
      }

      results.push({path,response});
      await sleep(180);
    }

    const verify=await localAiResyncMenelAfterClear({attempts:5});
    return {ok:!!verify.cleared,results,verify};
  }

  async function localAiExecuteWorldAction(action){
    if(!action || typeof action!=='object') return false;

    const gate=(reason,retryMs=0)=>{
      state.localAI.worldActionGate=String(reason||'odroczona');
      state.localAI.worldActionGateAt=Date.now();
      if(retryMs>0){
        state.localAI.nextAt=Math.min(
          Number(state.localAI.nextAt||Infinity),
          Date.now()+retryMs
        );
      }
      return false;
    };

    const type=String(action.type||'none');
    if(state.localAI.menelLearn?.armed) return gate('NAUKA MENELMODE — CZEKAM NA RĘCZNE ZAMKNIĘCIE',1500);
    if(state.localAI.melinaLearn?.armed) return gate('NAUKA RUPIECIARNI — CZEKAM NA RĘCZNE PRZENIESIENIE',1500);
    if(!autoCfg.localAiAllowGameActions) return gate('AKCJE AI WYŁĄCZONE');
    if(!autoCfg.enabled || autoCfg.dryRun) return gate('TRYB NIE-LIVE');
    if(state.auto.recovery.active || recoveryResumePending) return gate('RECOVERY',5000);
    if(state.auto.inCycle) return gate('CZEKA NA CYKL EKONOMII',2000);
    if(state.manual.semi.inCycle) return gate('CZEKA NA PÓŁAUTOMAT',2000);
    if(Date.now()<Number(state.auto.writeHoldUntil||0)) return gate('WRITE HOLD',3000);
    // v8.7.0: NPC jest niezależnym torem i może wejść natychmiast obok MenelMode/Kombinowania.
    // Pozostałe akcje głównego toru nadal mają wspólny antyspam 10 s.
    if(type!=='npc_attack' && Date.now()-Number(state.localAI.worldLastWriteAt||0)<10000) return gate('COOLDOWN AKCJI',2000);

    state.localAI.worldActionGate='WYKONUJĘ';
    state.localAI.worldActionGateAt=Date.now();

    const id=Number(settings.characterId);
    if(type==='none') return false;

    let result=null;

    // --------------------------------------------------------
    // MENELMODE
    // --------------------------------------------------------
    if(type==='menel_clear_result'){
      if(!autoCfg.localAiMenelMode) return false;

      const st=await apiActive(`/api/scavenging/${id}/menel-mode/status`);
      if(!state.localAI.world) state.localAI.world={};
      state.localAI.world.menel=st;

      const chResp=await apiActive(`/api/character/${id}`);
      state.localAI.world.character=chResp;
      state.localAI.menelStatus=st;

      const pending=localAiPendingMenelResult();

      // v8.8.12 MENEL PENDING-ONLY FIX:
      // Gdy status ma pendingCompletion=true, ale lastMenelModeResult=null,
      // wynik może nadal poprawnie siedzieć w character.pending_activity_result.
      // W takim przypadku NIE blokujemy się na ręcznym uczeniu — poniżej używamy
      // normalnego /clear-result i potwierdzamy czysty stan świeżymi GET-ami.
      // Nauczona sekwencja pozostaje fallbackiem tylko wtedy, gdy naprawdę nie
      // mamy żadnego payloadu wyniku do bezpiecznego zapisania.
      if(st?.pendingCompletion && !st?.lastMenelModeResult && !pending){
        if(menelCloseLearned?.safe){
          state.localAI.worldActionGate='MENELMODE: ODTWARZAM NAUCZONĄ SEKWENCJĘ';
          const replay=await localAiReplayLearnedMenelClose();

          if(replay.ok){
            result=replay.results?.at?.(-1)?.response || {success:true,learnedReplay:true};
            state.localAI.worldActionGate='OK • MENELMODE ODEBRANY (NAUCZONE)';
            state.localAI.worldActionGateAt=Date.now();
            autoLogMsg('info','MenelMode: wykonano nauczoną ręcznie sekwencję i potwierdzono czysty stan.');

            try{
              await localAiGuardInventory({reason:'po MenelMode',processLoot:true});
              await localAiStoreBackpackToMelina({reason:'po MenelMode'});
            }catch(e){
              autoLogMsg('warn',`PLECAK po MenelMode: ${String(e?.message||e)}`);
            }

            return true;
          }

          state.localAI.worldActionGate='MENELMODE: NAUCZONA SEKWENCJA NIE POTWIERDZIŁA STANU';
          state.localAI.nextAt=Date.now()+3000;
          return false;
        }

        state.localAI.worldActionGate='MENELMODE: BRAK PAYLOADU — NAUCZ RĘCZNIE 1 RAZ';
        state.localAI.worldActionGateAt=Date.now();
        state.localAI.nextAt=Date.now()+15000;
        return false;
      }

      // Jeżeli świeży GET już pokazuje, że wynik jest odebrany,
      // nie wysyłamy ponownie clear-result.
      if(!st?.pendingCompletion && !st?.lastMenelModeResult){
        state.localAI.menelClearSync={confirmed:true,confirmedAt:Date.now()};
        state.localAI.worldActionGate='OK • MENELMODE JUŻ CZYSTY';
        state.localAI.worldNextAt=0;
        state.localAI.nextAt=Date.now()+1200;
        return true;
      }

      if(!pending){
        state.localAI.worldActionGate='MENELMODE: BRAK WYNIKU DO ZAPISU';
        state.localAI.worldNextAt=0;
        state.localAI.nextAt=Date.now()+3000;
        return false;
      }

      const fingerprint=localAiMenelPendingFingerprint(pending);
      const previous=state.localAI.menelClearSync;

      // Jeżeli poprzedni POST clear-result zakończył się sukcesem, a serwer
      // jeszcze przez chwilę zwraca stary stan, najpierw robimy resync.
      // Nie bombardujemy tego samego POST-em co 30 s.
      if(
        previous &&
        previous.postedAt &&
        previous.pendingFingerprint===fingerprint &&
        Date.now()-Number(previous.postedAt)<20000
      ){
        const verify=await localAiResyncMenelAfterClear({attempts:3});
        if(verify.cleared) return true;

        state.localAI.worldActionGate='MENELMODE: RESYNC PO CLEAR';
        state.localAI.nextAt=Date.now()+3000;
        return false;
      }

      // Wynik zapisujemy do pamięci PRZED zamknięciem, tak jak dotychczas.
      localAiPushEvent('menel_result',{
        districtName:pending.districtName,
        estimatedDuration:pending.estimatedDuration,
        result:pending.result,
        source:pending.source
      });

      result=await apiActive(`/api/scavenging/${id}/menel-mode/clear-result`,{
        method:'POST',body:{}
      });

      state.localAI.menelClearSync={
        confirmed:false,
        postedAt:Date.now(),
        pendingFingerprint:fingerprint
      };

      // KRYTYCZNE: po sukcesie POST nie uznajemy sprawy za zakończoną,
      // dopóki świeże GET-y nie potwierdzą pendingCompletion=false.
      const verify=await localAiResyncMenelAfterClear({attempts:4});

      if(!verify.cleared){
        autoLogMsg(
          'warn',
          'MenelMode: clear-result odpowiedział OK, ale świeży status nadal pokazuje pending. Robię resync zamiast ponawiać POST.'
        );
        return false;
      }

      autoLogMsg('info','MenelMode: wynik zapisany, zamknięty i potwierdzony świeżym statusem.');

      try{
        await localAiGuardInventory({
          reason:'po MenelMode',
          processLoot:true,
          minimumReserve:0,
          actionType:'post_menel'
        });
        await localAiStoreBackpackToMelina({reason:'po MenelMode'});
      }catch(e){
        autoLogMsg('warn',`PLECAK po MenelMode: ${String(e?.message||e)}`);
      }
    }

    else if(type==='menel_start'){
      if(!autoCfg.localAiMenelMode) return false;
      const st=await apiActive(`/api/scavenging/${id}/menel-mode/status`);
      if(!st?.canStart || st?.activeActivity || st?.currentActivity || st?.pendingCompletion) return false;

      const hs=await apiActive(`/api/hustling/${id}/status`);
      if(hs?.activeSession) return false;

      if(autoCfg.localAiInventoryGuardian){
        if(autoCfg.localAiMelinaFirst){
          await localAiStoreBackpackToMelina({reason:'przed MenelMode'});
        }

        const bag=await localAiGuardInventory({
          reason:'przed MenelMode',
          processLoot:true,
          minimumReserve:1,
          actionType:'menel_start'
        });

        if(!bag.ok){
          state.localAI.worldActionGate='MENELMODE CZEKA — NAJPIERW ZWOLNIJ PLECAK';
          state.localAI.worldActionGateAt=Date.now();
          state.localAI.nextAt=Date.now()+5000;
          return false;
        }
      }

      await localAiSnapshotBeforeMenel();

      result=await apiActive(`/api/scavenging/${id}/menel-mode`,{
        method:'POST',body:{style:'neutral'}
      });

      localAiPushEvent('menel_start',{
        districtName:String(st.districtName||''),
        duration:Number(result?.totalDuration||st.estimatedDuration||0)
      });
    }

    else if(type==='menel_complete_now'){
      if(!autoCfg.localAiMenelMode || !autoCfg.localAiMenelCompleteNow) return false;
      const st=await apiActive(`/api/scavenging/${id}/menel-mode/status`);
      if(!st?.activeActivity && !st?.currentActivity) return false;

      result=await apiActive(`/api/scavenging/${id}/menel-mode/complete-now`,{
        method:'POST',body:{}
      });

      localAiPushEvent('menel_complete_now',{
        premiumCost:Number(result?.premiumCost||0),
        results:result?.results||null
      });
    }

    // --------------------------------------------------------
    // HUSTLING
    // --------------------------------------------------------
    else if(type==='hustle_start'){
      if(!autoCfg.localAiHustling) return false;
      const hs=await apiActive(`/api/hustling/${id}/status`);
      if(hs?.activeSession || hs?.interruptedSession || hs?.isBusy) return false;

      const mm=await apiActive(`/api/scavenging/${id}/menel-mode/status`);
      if(mm?.activeActivity || mm?.currentActivity || mm?.pendingCompletion) return false;

      const typeId=Number(action.hustlingTypeId);
      const row=(hs?.types||[]).find(x=>Number(x.id)===typeId);
      if(!row) return false;

      result=await apiActive(`/api/hustling/${id}/start`,{
        method:'POST',body:{hustlingTypeId:typeId}
      });

      localAiPushEvent('hustle_start',{
        hustlingTypeId:typeId,
        name:String(row.displayName||row.name||''),
        minEarningPerHour:Number(row.minEarningPerHour||0),
        maxEarningPerHour:Number(row.maxEarningPerHour||0)
      });
    }

    else if(type==='hustle_stop'){
      if(!autoCfg.localAiHustling) return false;
      const hs=await apiActive(`/api/hustling/${id}/status`);
      const active=hs?.activeSession;
      if(!active) return false;

      result=await apiActive(`/api/hustling/${id}/stop`,{method:'POST'});

      localAiPushEvent('hustle_stop',{
        hustlingTypeId:Number(active.hustlingTypeId||0),
        name:String(result?.hustlingTypeName||active.hustlingTypeName||''),
        earnings:Number(result?.earnings||0),
        elapsedMinutes:Number(result?.elapsedMinutes||0),
        wasInterrupted:!!result?.wasInterrupted,
        equipmentDestroyed:!!result?.equipmentDestroyed,
        districtName:String(localAiCharacter()?.district_name||state.localAI.world?.menel?.districtName||'')
      });
    }

    // --------------------------------------------------------
    // NPC
    // --------------------------------------------------------
    else if(type==='npc_attack'){
      if(!NPC_AUTO_ENABLED || !autoCfg.localAiNpc) return false;

      const npcId=Number(action.npcId);
      const list=await apiActive('/api/npc-combat/npcs');
      const status=await apiActive(`/api/npc-combat/${id}/status`);
      const npc=(list?.npcs||[]).find(x=>Number(x.id)===npcId);

      if(!npc) return false;
      if(status?.canStartAttack===false) return false;
      if(status?.returnCooldown?.active) return false;

      const ownCd=(status?.npcCooldowns||[]).find(x=>Number(x.npcId)===npcId);
      if(ownCd && Number(ownCd.remainingMs||0)>0) return false;

      // Aktualne /npc-combat/npcs nie zawsze zwraca canAttack/hasEnoughEnergy.
      // Jawne false respektujemy, brak pola nie blokuje.
      if('canAttack' in npc && npc.canAttack===false) return false;
      if('hasEnoughEnergy' in npc && npc.hasEnoughEnergy===false) return false;

      const playerAttack=Number(status?.playerAttack||0);
      const defense=Number(npc.defense||0);
      if(playerAttack>0 && defense>playerAttack) return false;

      const favorRed=Number(status?.favorBonuses?.menelpowerReduction||0);
      const buffRed=Number(status?.buffBonuses?.menelpowerReduction||0);
      const cost=npc.effectiveEnergyCost!=null
        ? Math.max(1,Number(npc.effectiveEnergyCost||1))
        : Math.max(1,defense-favorRed-buffRed);

      const energyNow=Number(status?.energy ?? localAiCharacter()?.energy ?? 0);
      if(energyNow<cost) return false;
      if(energyNow-cost<Number(autoCfg.localAiNpcEnergyReserve||100)) return false;

      result=await apiActive(`/api/npc-combat/${id}/attack/${npcId}`,{method:'POST'});

      // Od razu odśwież 20-min globalny cooldown i osobny cooldown tego NPC.
      try{
        const freshNpcStatus=await apiActive(`/api/npc-combat/${id}/status`);
        if(!state.localAI.world) state.localAI.world={};
        state.localAI.world.npcStatus=freshNpcStatus;
        state.localAI.worldLastAt=Date.now();
      }catch{}
      state.localAI.worldNextAt=0;
      state.localAI.nextAt=Date.now()+1200;

      let itemValue=0;
      for(const drop of (result?.droppedItems||[])){
        const value=localAiMarketValue(drop.item_id);
        if(value!=null) itemValue+=Number(value)*Math.max(1,Number(drop.quantity||1));
      }

      localAiPushEvent('npc_attack',{
        npcId,
        name:String(result?.npcName||npc.name||''),
        won:!!result?.won,
        money:Number(result?.moneyEarned||0),
        itemValue,
        energyUsed:Number(result?.energyUsed||cost||0),
        districtName:String(localAiCharacter()?.district_name||state.localAI.world?.menel?.districtName||''),
        droppedItems:(result?.droppedItems||[]).map(x=>({
          itemId:Number(x.item_id),
          name:String(x.name||''),
          quantity:Number(x.quantity||1),
          marketValue:localAiMarketValue(x.item_id)
        }))
      });
    }

    // --------------------------------------------------------
    // PUSZKI / PODRÓŻ
    // --------------------------------------------------------
    else if(type==='sell_cans'){
      if(!autoCfg.localAiSellCans) return false;

      const ch=await apiActive(`/api/character/${id}`);
      const sc=await apiActive(`/api/scavenging/${id}/status`);
      const c=ch?.character||ch||{};
      const cans=Math.floor(Number(c.cans||0));
      const requested=Math.floor(Number(action.cans||cans));

      if(cans<Number(autoCfg.localAiSellCansMin||1000)) return false;
      const qty=Math.max(1,Math.min(cans,requested));

      result=await apiActive(`/api/scavenging/${id}/sell-cans`,{
        method:'POST',body:{cans:qty}
      });

      localAiPushEvent('sell_cans',{
        cans:Number(result?.sold?.cans||qty),
        earnings:Number(result?.earnings||0),
        canPrice:Number(result?.canPrice||sc?.canPrice||0),
        districtName:String(result?.districtName||c.district_name||'')
      });
    }

    else if(type==='travel_complete_arrival'){
      if(!autoCfg.localAiTravel) return false;

      // Świeży status rozstrzyga, czy autobus naprawdę czeka na potwierdzenie wysiadki.
      const ts=await apiActive(`/api/travel/status/${id}`);
      const remaining=Number(ts?.travelTimeRemaining||0);
      if(!ts?.traveling || !ts?.pendingArrival || remaining>0) return false;

      if(!state.localAI.world) state.localAI.world={};
      state.localAI.world.travelStatus=ts;
      result=await apiActive('/api/travel/complete',{
        method:'POST',
        body:{characterId:id,instant:false}
      });
      if(result?.success===false){
        throw new Error(result?.message||result?.error||'Zakończenie podróży nie powiodło się');
      }

      localAiPushEvent('travel_arrival_claimed',{
        source:'brain_action',
        districtId:Number(result?.currentDistrictId||ts?.targetDistrictId||0),
        districtName:String(result?.districtName||ts?.targetDistrictName||''),
        pendingArrivalBefore:true
      });

      state.localAI.worldNextAt=0;
      state.localAI.nextAt=Date.now()+1200;
    }

    else if(type==='travel_complete_free'){
      if(!autoCfg.localAiTravel || !autoCfg.localAiFreeTravelSpeedup) return false;

      const ts=await apiActive(`/api/travel/status/${id}`);
      const remaining=Number(ts?.travelTimeRemaining||0);
      const threshold=Number(ts?.vipFreeSpeedupThreshold||0);

      if(!ts?.traveling) return false;
      if(!(threshold>0) || remaining<=0 || remaining>threshold) return false;

      const premiumBefore=Number(ts?.premiumCurrency);
      result=await apiActive('/api/travel/complete',{
        method:'POST',
        body:{characterId:id,instant:true}
      });
      if(result?.success===false){
        throw new Error(result?.message||'Darmowe zakończenie podróży nie powiodło się');
      }
      const premiumAfter=Number(result?.premiumCurrency);

      if(
        Number.isFinite(premiumBefore) &&
        Number.isFinite(premiumAfter) &&
        premiumAfter<premiumBefore
      ){
        autoCfg.localAiFreeTravelSpeedup=false;
        autoSaveCfg();
        state.localAI.worldActionGate='STOP: darmowe przyspieszenie pobrało premium — funkcja wyłączona';
        throw new Error(
          `Travel complete pobrał premium (${premiumBefore}→${premiumAfter}). Darmowe przyspieszanie zostało wyłączone.`
        );
      }

      if(result?.freeVipSpeedup===false){
        autoCfg.localAiFreeTravelSpeedup=false;
        autoSaveCfg();
        state.localAI.worldActionGate='Darmowe przyspieszenie niepotwierdzone — funkcja wyłączona';
      }

      localAiPushEvent('travel_free_complete',{
        districtId:Number(result?.currentDistrictId||0),
        districtName:String(result?.districtName||''),
        remainingBefore:remaining,
        threshold,
        freeVipSpeedup:result?.freeVipSpeedup===true
      });

      state.localAI.worldNextAt=0;
      state.localAI.nextAt=Date.now()+1200;
    }

    else if(type==='travel'){
      if(!autoCfg.localAiTravel) return false;

      const target=Number(action.districtId);
      if(!target) return false;

      const ts=await apiActive(`/api/travel/status/${id}`);
      const hs=await apiActive(`/api/hustling/${id}/status`);
      const mm=await apiActive(`/api/scavenging/${id}/menel-mode/status`);
      const ch=await apiActive(`/api/character/${id}`);
      const c=ch?.character||ch||{};

      if(ts?.traveling || hs?.activeSession || mm?.activeActivity || mm?.currentActivity || mm?.pendingCompletion) return false;
      if(Number(ts?.currentDistrictId||c.current_district_id)===target) return false;

      if(autoCfg.localAiInventoryGuardian){
        if(autoCfg.localAiMelinaFirst){
          await localAiStoreBackpackToMelina({reason:'przed podróżą'});
        }

        const bag=await localAiGuardInventory({
          reason:'przed podróżą',
          processLoot:true,
          minimumReserve:0,
          actionType:'travel'
        });
        if(!bag.ok){
          state.localAI.worldActionGate='PODRÓŻ CZEKA — NAJPIERW PLECAK';
          state.localAI.worldActionGateAt=Date.now();
          state.localAI.nextAt=Date.now()+5000;
          return false;
        }
      }

      result=await apiActive('/api/travel/travel',{
        method:'POST',
        body:{characterId:id,districtId:target,travelType:'sneak'}
      });

      if(result?.success===false || result?.traveling===false){
        throw new Error(result?.message||'Podróż nie wystartowała');
      }

      localAiPushEvent('travel_start',{
        fromDistrictId:Number(ts?.currentDistrictId||c.current_district_id||0),
        districtId:target,
        targetDistrictName:String(result?.targetDistrictName||action.districtName||''),
        travelTimeRemaining:Number(result?.travelTimeRemaining||0),
        travelType:'sneak'
      });

      if(!state.localAI.world) state.localAI.world={};
      state.localAI.world.travelStatus={
        ...(state.localAI.world.travelStatus||{}),
        success:true,
        traveling:true,
        travelTimeRemaining:Number(result?.travelTimeRemaining||0),
        targetDistrictId:Number(result?.targetDistrictId||target),
        targetDistrictName:String(result?.targetDistrictName||action.districtName||'')
      };
      state.localAI.worldNextAt=0;
      state.localAI.nextAt=Date.now()+10000;
    }

    // --------------------------------------------------------
    // KOLEKCJE
    // --------------------------------------------------------
    else if(type==='collection_deposit'){
      if(!autoCfg.localAiCollections) return false;

      const collectionId=Number(action.collectionId);
      const itemId=Number(action.itemId);
      if(!collectionId || !itemId) return false;

      // Twarda ochrona: składnik craftu nigdy nie idzie do kolekcji automatycznie.
      if(isCraftIngredientProtected(itemId)) return false;

      const value=localAiCollectionValue(itemId);
      if(!Number.isFinite(value) || value>Number(autoCfg.localAiCollectionMaxItemValue||300)) return false;

      if(autoCfg.localAiMelinaFirst && autoCfg.localAiMelinaReturnForCollections){
        try{
          const storage=await localAiFreshMelina();
          const stored=(storage.storageItems||[]).find(
            x=>Number(x.id||x.item_id||0)===itemId
          );

          if(stored){
            const bag=await localAiGuardInventory({
              reason:'miejsce na przedmiot do kolekcji',
              processLoot:false,
              minimumReserve:1
            });
            if(!bag.ok) return false;

            const take=await localAiReplayMelinaRemove(Number(stored.inventory_id));
            if(take.ok){
              state.localAI.worldNextAt=0;
              await sleep(180);
            }
          }
        }catch(e){
          autoLogMsg('warn',`RUPIECIARNIA → KOLEKCJA: ${String(e?.message||e)}`);
        }
      }

      const all=await apiActive(`/api/collections/${id}`);
      let valid=false;
      let collectionName='';
      let itemName='';
      for(const tier of (all?.tiers||[])){
        const col=(tier.collections||[]).find(x=>Number(x.id)===collectionId);
        if(!col || col.isCompleted&&!col.isRepeatable) continue;
        const req=(col.requiredItems||[]).find(x=>
          Number(x.itemId)===itemId &&
          Number(x.owned||0)>0 &&
          Number(x.deposited||0)<Number(x.required||0)
        );
        if(req){
          valid=true;
          collectionName=String(col.name||'');
          itemName=String(req.name||'');
          break;
        }
      }
      if(!valid) return false;

      result=await apiActive(`/api/collections/${id}/deposit/${collectionId}/${itemId}`,{
        method:'POST'
      });

      localAiPushEvent('collection_deposit',{
        collectionId,itemId,collectionName,itemName,value
      });
    }

    // --------------------------------------------------------
    // PRZYSŁUGI / BUFFY
    // --------------------------------------------------------
    else if(type==='favor_activate'){
      if(!autoCfg.localAiFavors) return false;

      const favorOwnedId=Number(action.favorOwnedId);
      if(!favorOwnedId) return false;

      const active=await apiActive(`/api/favors/${id}/active`);
      if(active?.active) return false;

      const owned=await apiActive(`/api/favors/${id}/owned`);
      const card=(owned?.favors||[]).find(x=>Number(x.id)===favorOwnedId);
      if(!card) return false;

      const premiumValue=Number(card.premium_price||Infinity);
      if(premiumValue>Number(autoCfg.localAiFavorMaxPremiumValue||10)) return false;

      result=await apiActive(`/api/favors/${id}/activate/${favorOwnedId}`,{
        method:'POST',body:{}
      });

      localAiPushEvent('favor_activate',{
        favorOwnedId,
        favorTypeId:Number(card.favor_type_id||0),
        name:String(card.name||''),
        premiumValue
      });
    }

    else{
      return false;
    }

    state.localAI.lastGameActionAt=Date.now();
    if(type!=='npc_attack') state.localAI.worldLastWriteAt=state.localAI.lastGameActionAt;
    state.localAI.lastGameAction=String(action.label||type);
    state.localAI.lastGameActionResult=result||null;
    if(type!=='menel_clear_result'){
      state.localAI.worldActionGate='OK';
      state.localAI.worldActionGateAt=Date.now();
    }
    state.localAI.worldNextAt=0;
    localAiResetActionGuard(action);

    localAiPushEvent('action_success',{
      actionType:type,
      label:String(action.label||type),
      districtName:String(localAiCharacter()?.district_name||state.localAI.world?.menel?.districtName||'')
    });
    autoLogMsg('info',`LOCAL AI v8: ${state.localAI.lastGameAction}`);
    return true;
  }

  function localAiCandidatePayload(){
    computeRankings();

    return sanitizeRankings()
      .filter(x =>
        x?.recipe &&
        x.learned &&
        !x.forbidden &&
        !x.unknown &&
        x.outPrice!=null &&
        Number(x.outPrice)>0 &&
        x.profit!=null &&
        Number(x.profit)>=Number(autoCfg.minProfitPerCraft||0) &&
        x.profitHour!=null &&
        Number(x.profitHour)>=Number(autoCfg.minProfitPerHour||0) &&
        productExposure(x.recipe.result_item_id)<Number(autoCfg.maxSameProductExposure||2)
      )
      .sort((a,b)=>Number(b.aiScore??b.profitHour??0)-Number(a.aiScore??a.profitHour??0))
      .slice(0,16)
      .map(x=>({
        recipeId:Number(x.recipe.id),
        name:String(x.recipe.item_name||''),
        resultItemId:Number(x.recipe.result_item_id),
        profit:Number(x.profit||0),
        cashProfit:Number(x.cashProfit||0),
        profitHour:Number(x.profitHour||0),
        cashProfitHour:Number(x.cashProfitHour||0),
        localLearningScore:Number(x.aiScore??x.profitHour??0),
        localLearningFactor:Number(x.learningFactor||1),
        localLearningConfidence:Number(x.learningConfidence||0),
        outPrice:Number(x.outPrice||0),
        craftSec:Number(x.craftSec||0),
        economicSec:Number(x.economicSec||0),
        bundleCost:Number(x.fullBundle?.cost||0),
        bundleDecisionCost:Number(x.fullBundle?.decisionCost??x.fullBundle?.cost??0),
        exposure:Number(productExposure(x.recipe.result_item_id)||0)
      }));
  }

  function localAiMemoryEvents(){
    return (learner.events||[]).slice(-120).map(e=>({
      ts:Number(e.ts||0),
      type:String(e.type||''),
      recipeId:e.recipeId==null?null:Number(e.recipeId),
      name:e.name==null?'':String(e.name),
      profit:e.profit==null?null:Number(e.profit),
      realizedProfitHour:e.realizedProfitHour==null?null:Number(e.realizedProfitHour),
      saleMinutes:e.saleMinutes==null?null:Number(e.saleMinutes),
      predictionRatio:e.predictionRatio==null?null:Number(e.predictionRatio)
    }));
  }

  function localAiPayload(){
    const strategic=state.auto.strategicPlan || strategicStockPlan();
    const resources={};

    for(const key of RESOURCE_KEYS){
      const row=strategic.resources?.[key];
      resources[key]={
        actual:Number(row?.actual??currentResourceAmount(key)),
        pending:Number(row?.pending??pendingResource(key)),
        future:Number(row?.have??futureResourceHave(key)),
        critical:Number(row?.critical||0),
        min:Number(row?.min||0),
        target:Number(row?.target||0),
        max:Number(row?.max||0)
      };
    }

    const ls=learningSummary();
    const world=state.localAI.world||{};
    const ch=localAiCharacter(world)||{};

    // v8.7.2: status MenelMode nie zawsze zwraca lastMenelModeResult.
    // Gdy wynik siedzi w character.pending_activity_result, normalizujemy go
    // wyłącznie do odczytu/uczenia Braina. Nie zmieniamy właściwego stanu gry.
    const pendingMenel=localAiPendingMenelResult();
    const menelForBrain=(world.menel && typeof world.menel==='object')
      ? {...world.menel}
      : {};
    if(pendingMenel?.result){
      menelForBrain.learningResult=pendingMenel.result;
      menelForBrain.learningResultSource=String(pendingMenel.source||'');
      menelForBrain.learningDistrictName=String(
        pendingMenel.districtName||menelForBrain.districtName||ch.district_name||''
      );
      menelForBrain.learningEstimatedDuration=Number(
        pendingMenel.estimatedDuration||menelForBrain.estimatedDuration||0
      );
    }

    // Wyceny przedmiotów przydatne dla NPC/kolekcji.
    const ids=[];
    for(const npc of (world?.npcList?.npcs||[])){
      for(const d of (npc.potentialDrops||[])) ids.push(d);
    }
    for(const tier of (world?.collections?.tiers||[])){
      for(const col of (tier.collections||[])){
        for(const ri of (col.requiredItems||[])) ids.push({itemId:ri.itemId});
      }
    }

    return {
      bridgeToken:LOCAL_AI_TOKEN,
      protocol:2,
      scriptVersion:VERSION,
      now:Date.now(),
      characterId:Number(settings.characterId),
      mode:autoCfg.enabled?(autoCfg.dryRun?'dry':'live'):'off',
      limits:{
        minProfit:Number(autoCfg.minProfitPerCraft||0),
        minProfitHour:Number(autoCfg.minProfitPerHour||0),
        maxSpendCycle:Number(autoCfg.maxSpendPerCycle||0),
        maxSpendDay:Number(autoCfg.maxSpendPerDay||0),
        npcEnergyReserve:Number(autoCfg.localAiNpcEnergyReserve||100),
        hustleSessionMinutes:Number(autoCfg.localAiHustleSessionMinutes||60),
        sellCansMin:Number(autoCfg.localAiSellCansMin||1000),
        canTargetPrice:Number(autoCfg.localAiCanTargetPrice||0.15),
        travelMinCanGain:Number(autoCfg.localAiTravelMinCanGain||250),
        collectionMaxItemValue:Number(autoCfg.localAiCollectionMaxItemValue||300),
        favorMaxPremiumValue:Number(autoCfg.localAiFavorMaxPremiumValue||10),
        exploreDistricts:!!autoCfg.localAiExploreDistricts
      },
      modules:{
        economy:!!autoCfg.localAiInfluenceEconomy,
        menel:!!autoCfg.localAiMenelMode,
        hustling:!!autoCfg.localAiHustling,
        npc:!!(NPC_AUTO_ENABLED && autoCfg.localAiNpc),
        travel:!!autoCfg.localAiTravel,
        districtSweep:!!autoCfg.localAiDistrictSweep,
        freeTravelSpeedup:!!autoCfg.localAiFreeTravelSpeedup,
        cans:!!autoCfg.localAiSellCans,
        collections:!!autoCfg.localAiCollections,
        favors:!!autoCfg.localAiFavors,
        raids:!!autoCfg.localAiObserveRaids,
        tasks:!!autoCfg.localAiTasks,
        localLlmAdvice:!!autoCfg.localAiUseLocalLlmAdvice
      },
      candidates:localAiCandidatePayload(),
      resources,
      queue:{
        dismantleUsed:Number(state.dismantleQueue?.length||0),
        dismantleMax:Number(state.dismantleMaxQueueSize||0),
        craftUsed:Number(state.craftQueue?.length||0)+Number(state.craftReady?.length||0),
        craftMax:Number(state.craftMaxQueueSize||0)
      },
      character:{
        money:Number(ch.money||0),
        cans:Number(ch.cans||0),
        energy:Number(ch.energy||0),
        maxEnergy:Number(ch.max_hp?world?.npcStatus?.maxEnergy||1000:world?.npcStatus?.maxEnergy||1000),
        menelPower:Number(ch.menel_power||0),
        currentDistrictId:Number(ch.current_district_id||world?.travelStatus?.currentDistrictId||0),
        districtName:String(ch.district_name||world?.menel?.districtName||''),
        premiumCurrency:Number(ch.premium_currency??ch.premiumCurrency??0)
      },
      world:{
        menel:Object.keys(menelForBrain).length?menelForBrain:null,
        allCooldowns:world.allCooldowns||null,
        allCooldownsSource:world.allCooldownsSource||'',
        allCooldownsError:world.allCooldownsError||'',
        hustling:world.hustling||null,
        npcList:world.npcList||null,
        npcStatus:world.npcStatus||null,
        travelTimes:world.travelTimes||null,
        travelStatus:world.travelStatus||null,
        collections:world.collections||null,
        favorActive:world.favorActive||null,
        favorOwned:world.favorOwned||null,
        raidLocations:world.raidLocations||null,
        activeRaid:world.activeRaid||null,
        dailyTasks:world.dailyTasks||null,
        weeklyTasks:world.weeklyTasks||null
      },
      itemValues:localAiWorldItemValues(ids),
      activeListings:Number(state.auto.activeListingCount||0),
      maxListings:Number(state.auto.maxListings||0),
      learnerEvents:localAiMemoryEvents(),
      gameEvents:localAiEvents.slice(-200),
      selfLearningSummary:{
        decisions:Number(ls.decisions||0),
        sold:Number(ls.sold||0),
        returned:Number(ls.returned||0),
        tested:Number(ls.tested||0)
      }
    };
  }

  async function localAiRequest(payload){
    // ANDROID v0.2.0: Brain 3.2.7 działa wewnątrz APK przez bezpośredni most JS -> Kotlin -> Python.
    // Nie ma localhost HTTP, CORS, mieszanej zawartości ani potrzeby uruchamiania programu na komputerze.
    if(ANDROID_APP && window.AndroidBridge && typeof window.AndroidBridge.brainDecide === 'function'){
      const started=Date.now();
      state.localAI.brainRequestTimeout=0;
      try{
        const raw=window.AndroidBridge.brainDecide(JSON.stringify(payload));
        const j=JSON.parse(String(raw||'{}'));
        if(!j?.ok) throw new Error(j?.error||'Android Brain zwrócił błąd');
        state.localAI.brainDecisionMs=Math.max(0,Date.now()-started);
        return j;
      }catch(e){
        throw new Error(`Android Brain: ${String(e?.message||e)}`);
      }
    }

    const configuredTimeout=Math.max(2,Number(autoCfg.localAiTimeoutSeconds||7));
    const effectiveTimeout=Math.max(
      configuredTimeout,
      autoCfg.localAiUseLocalLlmAdvice ? 35 : 12
    );

    state.localAI.brainRequestTimeout=effectiveTimeout;

    // NIGHT-SAFE v8.5.5: krótki restart Braina / chwilowy WinError 10053
    // nie może od razu oznaczać OFFLINE na cały cykl. Każda próba ma własny
    // AbortController, więc timeout jednej próby nie zatruwa następnej.
    const maxAttempts=3;
    let lastError=null;

    for(let attempt=1; attempt<=maxAttempts; attempt++){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),effectiveTimeout*1000);

      try{
        const r=await fetch(`${LOCAL_AI_URL}/v1/decide`,{
          method:'POST',
          mode:'cors',
          cache:'no-store',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload),
          signal:controller.signal
        });

        if(!r.ok){
          const detail=await r.text().catch(()=> '');
          throw new Error(`Local AI HTTP ${r.status}${detail?`: ${detail.slice(0,180)}`:''}`);
        }

        const j=await r.json();
        if(!j?.ok) throw new Error(j?.error||'Local AI zwróciło błąd');
        return j;
      }catch(e){
        lastError=e;
        const msg=String(e?.message||e);
        const retryable=
          e?.name==='AbortError' ||
          /Failed to fetch|NetworkError|Load failed|ERR_|HTTP 5\d\d|timed? ?out|abort/i.test(msg);

        if(!retryable || attempt>=maxAttempts) throw e;

        state.localAI.error=`Brain retry ${attempt}/${maxAttempts}: ${msg}`;
        await sleep(600*attempt);
      }finally{
        clearTimeout(timer);
      }
    }

    throw lastError||new Error('Local AI: brak odpowiedzi');
  }

  // ========================================================
  // OGRÓD AI — v8.6.0 GARDEN LAB
  // ========================================================
  // Frontend gry tylko wysyła warunki uprawy, a serwer zwraca status + atlasFrame 0..9.
  // Pomagier nie próbuje zgadywać tajnej formuły backendu. Zamiast tego prowadzi
  // kontrolowane eksperymenty i mierzy realne przejścia klatek wzrostu.
  // WAŻNE: moduł używa wyłącznie nasion już znajdujących się w plecaku.
  // Nie kupuje nasion i nie wydaje automatycznie Złotych Zębów.
  const LOCAL_AI_GARDEN_INITIAL_PLANS = Object.freeze({
    1:{sunlight:40,water:30,ph:5.5},
    2:{sunlight:40,water:70,ph:8.5},
    3:{sunlight:80,water:30,ph:8.5},
    4:{sunlight:80,water:70,ph:5.5}
  });

  const LOCAL_AI_GARDEN_PRIORITY_PLANT_ID = 2;
  const LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME = 'Młode ziemniaki';
  const LOCAL_AI_GARDEN_PRIORITY_SEED_ITEM_ID = 804; // Sadzeniaczek
  const LOCAL_AI_GARDEN_SHOP_TYPES = ['spozywczy','monopolowy','szmatex','agd_rtv','militarny'];

  function localAiGardenPrioritySeed(data){
    return (Array.isArray(data?.availableSeeds)?data.availableSeeds:[]).find(x=>
      Number(x?.plantId||0)===LOCAL_AI_GARDEN_PRIORITY_PLANT_ID || /ziemni/i.test(String(x?.plantName||''))
    ) || null;
  }

  function localAiGardenClamp(v,min,max){
    return Math.max(min,Math.min(max,Number(v)));
  }

  function localAiGardenConditions(raw={}){
    return {
      sunlight:Math.round(localAiGardenClamp(raw.sunlight,0,100)),
      water:Math.round(localAiGardenClamp(raw.water,0,100)),
      ph:Math.round(localAiGardenClamp(raw.ph,0,14)*10)/10
    };
  }

  function localAiGardenSig(raw={}){
    const c=localAiGardenConditions(raw);
    return `${c.sunlight}/${c.water}/${c.ph.toFixed(1)}`;
  }

  function localAiGardenTrialScore(trial){
    if(!trial || typeof trial!=='object') return null;
    const ev=(Array.isArray(trial.frameEvents)?trial.frameEvents:[])
      .filter(x=>Number.isFinite(Number(x?.frame)) && Number.isFinite(Number(x?.ts)))
      .sort((a,b)=>Number(a.ts)-Number(b.ts));

    // Znany dokładny moment zasiania: możemy liczyć od startu już od pierwszej zmiany klatki.
    if(trial.startKnown && Number(trial.startedAt)>0){
      if(Number(trial.readyAt)>Number(trial.startedAt)){
        return Math.max(1,(Number(trial.readyAt)-Number(trial.startedAt))/9/1000);
      }
      const last=[...ev].reverse().find(x=>Number(x.frame)>0);
      if(last){
        return Math.max(1,(Number(last.ts)-Number(trial.startedAt))/Number(last.frame)/1000);
      }
    }

    // Uprawa zastana po instalacji skryptu ma nieznany start. Pierwszy zaobserwowany
    // odcinek jest niepełny, więc porównujemy dopiero pełne przejścia od drugiej zmiany.
    const unique=[];
    for(const x of ev){
      if(!unique.length || Number(unique.at(-1).frame)!==Number(x.frame)) unique.push(x);
    }
    if(unique.length>=3){
      const first=unique[1];
      const last=unique.at(-1);
      const df=Number(last.frame)-Number(first.frame);
      if(df>0 && Number(last.ts)>Number(first.ts)){
        return Math.max(1,(Number(last.ts)-Number(first.ts))/df/1000);
      }
    }
    return null;
  }

  function localAiGardenTrialQuality(trial){
    if(!trial || typeof trial!=='object') return 0;
    const started=Number(trial.startedAt||0);
    const ready=Number(trial.readyAt||0);
    // Najwyższa jakość: znamy dokładny siew i dokładną gotowość — pełny cykl.
    if(trial.startKnown && started>0 && trial.complete && ready>started) return 3;
    // Następnie: znamy dokładny start, ale próba jeszcze trwa.
    if(trial.startKnown && started>0) return 2;
    // Najmniej wiarygodne: uprawa zastana po uruchomieniu Garden Lab.
    return 1;
  }

  function localAiGardenPruneDuplicateTrials(){
    const g=state.localAI.garden;
    if(!Array.isArray(g?.trials) || g.trials.length<2) return 0;

    const ordered=[...g.trials].sort((a,b)=>
      Number(a?.firstSeenAt||a?.startedAt||a?.readyAt||0)-Number(b?.firstSeenAt||b?.startedAt||b?.readyAt||0)
    );
    const kept=[];
    let removed=0;

    for(const t of ordered){
      const sig=localAiGardenSig(t?.conditions||{});
      const slot=Number(t?.slot||0);
      const plant=String(t?.plantName||'Cebula');
      const readyAt=Number(t?.readyAt||0);
      const ev=Array.isArray(t?.frameEvents)?t.frameEvents:[];
      const phantomReady=
        !t?.startKnown &&
        t?.complete &&
        readyAt>0 &&
        ev.length<=1 &&
        Number(ev[0]?.frame)===9;

      if(phantomReady){
        const canonical=[...kept].reverse().find(x=>{
          if(Number(x?.slot||0)!==slot) return false;
          if(String(x?.plantName||'Cebula')!==plant) return false;
          if(localAiGardenSig(x?.conditions||{})!==sig) return false;
          if(!x?.complete || Number(x?.readyAt||0)<=0) return false;
          // Te same gotowe cebule były ponownie importowane co polling przed zbiorem.
          return Math.abs(readyAt-Number(x.readyAt||0))<=30*60*1000;
        });
        if(canonical){
          // Jeżeli właśnie ten sztuczny wpis dostał harvestedAt przez starą logikę,
          // przenosimy znacznik zbioru do prawdziwej próby przed usunięciem duplikatu.
          if(Number(t?.harvestedAt||0)>0 && !Number(canonical?.harvestedAt||0)){
            canonical.harvestedAt=Number(t.harvestedAt);
          }
          removed++;
          continue;
        }
      }
      kept.push(t);
    }

    if(removed){
      // Zachowujemy pierwotną kolejność czasową po migracji.
      g.trials=kept;
    }
    return removed;
  }

  function localAiGardenRecomputeBest(plantName=LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME){
    const g=state.localAI.garden;
    localAiGardenPruneDuplicateTrials();
    const wanted=String(plantName||LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME).toLowerCase();

    const scored=[];
    for(const t of (g.trials||[])){
      if(String(t?.plantName||'').toLowerCase()!==wanted) continue;
      const score=localAiGardenTrialScore(t);
      if(score==null || !Number.isFinite(score)) continue;
      scored.push({trial:t,score:Number(score),quality:localAiGardenTrialQuality(t)});
    }

    // Nie porównujemy niepełnego fragmentu wzrostu z pełnym cyklem.
    // Gdy tylko mamy choć jeden pełny cykl o znanym starcie, tylko takie próby
    // mogą zostać BEST i sterować kolejnymi eksperymentami.
    const maxQuality=scored.reduce((m,x)=>Math.max(m,x.quality),0);
    const pool=scored.filter(x=>x.quality===maxQuality);
    pool.sort((a,b)=>a.score-b.score);
    const row=pool[0]||null;

    if(!row){
      g.best=null;
      return null;
    }

    const t=row.trial;
    const started=Number(t.startedAt||0);
    const ready=Number(t.readyAt||0);
    g.best={
      trialId:String(t.id||''),
      slot:Number(t.slot||0),
      plantName:String(t.plantName||'Cebula'),
      conditions:localAiGardenConditions(t.conditions||{}),
      scoreSecondsPerFrame:Number(row.score),
      durationSeconds:(t.startKnown && t.complete && ready>started) ? (ready-started)/1000 : null,
      scoreType:row.quality===3?'full_cycle':(row.quality===2?'known_start_partial':'observed_partial'),
      reliability:row.quality===3?'HIGH':(row.quality===2?'MEDIUM':'LOW'),
      complete:!!t.complete,
      startKnown:!!t.startKnown,
      updatedAt:Date.now()
    };
    return g.best;
  }

  function localAiGardenInitialCovered(plantName=LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME){
    const trials=state.localAI.garden?.trials||[];
    const wanted=String(plantName||LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME).toLowerCase();
    return [1,2,3,4].every(slot=>{
      const sig=localAiGardenSig(LOCAL_AI_GARDEN_INITIAL_PLANS[slot]);
      return trials.some(t=>String(t?.plantName||'').toLowerCase()===wanted && localAiGardenSig(t?.conditions||{})===sig);
    });
  }

  function localAiGardenPlanForSlot(slot,plantName=LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME){
    const nr=Math.max(1,Math.min(4,Number(slot)||1));
    const wanted=String(plantName||LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME);
    if(!autoCfg.localAiGardenResearch){
      return {sunlight:60,water:50,ph:7};
    }

    if(!localAiGardenInitialCovered(wanted)){
      return {...LOCAL_AI_GARDEN_INITIAL_PLANS[nr]};
    }

    const best=localAiGardenRecomputeBest(wanted);
    if(!best?.conditions){
      return {...LOCAL_AI_GARDEN_INITIAL_PLANS[nr]};
    }

    const scored=(state.localAI.garden.trials||[])
      .filter(t=>String(t?.plantName||'').toLowerCase()===wanted.toLowerCase() && localAiGardenTrialScore(t)!=null).length;
    const round=Math.max(1,Math.floor(scored/4)+1);
    const ds=Math.max(3,Math.round(18/Math.pow(1.45,round-1)));
    const dw=Math.max(3,Math.round(18/Math.pow(1.45,round-1)));
    const dp=Math.max(.2,Math.round((1.5/Math.pow(1.5,round-1))*10)/10);
    const patterns={
      1:[-1,-1,-1],
      2:[-1, 1, 1],
      3:[ 1,-1, 1],
      4:[ 1, 1,-1]
    };
    const p=patterns[nr];
    return localAiGardenConditions({
      sunlight:Number(best.conditions.sunlight)+p[0]*ds,
      water:Number(best.conditions.water)+p[1]*dw,
      ph:Number(best.conditions.ph)+p[2]*dp
    });
  }

  function localAiGardenObserve(data,{source='poll'}={}){
    const g=state.localAI.garden;
    const now=Date.now();
    g.data=data||null;
    g.unlocked=!!data?.unlocked;
    g.lastCheckAt=now;
    g.slots=Array.isArray(data?.slots)?data.slots.map(x=>({
      slotNumber:Number(x?.slotNumber||0),
      status:String(x?.status||'empty'),
      plantId:Number(x?.plantId||0)||null,
      plantName:String(x?.plantName||''),
      atlasFrame:Number.isFinite(Number(x?.atlasFrame))?Number(x.atlasFrame):null,
      conditions:localAiGardenConditions(x?.conditions||{})
    })):[];

    const prioritySeed=localAiGardenPrioritySeed(data);
    g.availableSeeds=Number(prioritySeed?.quantity||0);
    g.plantId=LOCAL_AI_GARDEN_PRIORITY_PLANT_ID;
    g.plantName=LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME;

    if(!Array.isArray(g.trials)) g.trials=[];

    for(const slot of g.slots){
      const slotNo=Number(slot.slotNumber||0);
      const status=String(slot.status||'empty');
      const cond=localAiGardenConditions(slot.conditions||{});
      const sig=localAiGardenSig(cond);
      const plantName=String(slot.plantName||'Cebula');

      if(status==='growing' || status==='ready'){
        let trial=[...g.trials].reverse().find(t=>
          t?.active &&
          Number(t.slot)===slotNo &&
          localAiGardenSig(t.conditions||{})===sig &&
          String(t.plantName||'Cebula')===plantName
        );

        // READY FIX v8.6.8: po oznaczeniu próby jako complete/active=false kolejne
        // pollingi tej SAMEJ, jeszcze niezebranej rośliny nie mogą tworzyć nowych
        // "imported trials". Wracamy do ostatniej kompletnej próby aż do harvest.
        if(!trial && status==='ready'){
          trial=[...g.trials].reverse().find(t=>
            Number(t.slot)===slotNo &&
            localAiGardenSig(t.conditions||{})===sig &&
            String(t.plantName||'Cebula')===plantName &&
            !!t?.complete &&
            Number(t?.readyAt||0)>0 &&
            !Number(t?.harvestedAt||0)
          );
        }

        if(!trial){
          trial={
            id:`garden-${now}-${slotNo}-${Math.random().toString(36).slice(2,8)}`,
            slot:slotNo,
            plantId:Number(slot?.plantId||0)||LOCAL_AI_GARDEN_PRIORITY_PLANT_ID,
            plantName,
            conditions:cond,
            startedAt:null,
            firstSeenAt:now,
            startKnown:false,
            source:'imported',
            frameEvents:[],
            active:true,
            complete:false,
            readyAt:null,
            harvestedAt:null
          };
          g.trials.push(trial);
        }

        const frame=Number.isFinite(Number(slot.atlasFrame))?Number(slot.atlasFrame):null;
        const last=Array.isArray(trial.frameEvents)?trial.frameEvents.at(-1):null;
        if(frame!=null && (!last || Number(last.frame)!==frame)){
          if(!Array.isArray(trial.frameEvents)) trial.frameEvents=[];
          trial.frameEvents.push({frame,ts:now,source});
          trial.frameEvents=trial.frameEvents.slice(-15);
          localAiPushEvent('garden_frame',{
            slot:slotNo,
            plantName,
            frame,
            conditions:cond,
            startKnown:!!trial.startKnown
          });
        }

        if(status==='ready' && !trial.readyAt){
          trial.readyAt=now;
          trial.complete=true;
          trial.active=false;
          localAiPushEvent('garden_ready',{
            slot:slotNo,
            plantName,
            conditions:cond,
            scoreSecondsPerFrame:localAiGardenTrialScore(trial)
          });
        }
      }else if(status==='empty'){
        const active=[...g.trials].reverse().find(t=>t?.active && Number(t.slot)===slotNo);
        if(active && active.source!=='auto_sow_pending'){
          active.active=false;
          active.endedAt=active.endedAt||now;
        }
      }
    }

    // Ograniczamy pamięć; aktywne próby zawsze zostają.
    if(g.trials.length>80){
      const active=g.trials.filter(t=>t?.active);
      const old=g.trials.filter(t=>!t?.active).slice(-(80-active.length));
      g.trials=[...old,...active].slice(-80);
    }

    localAiGardenRecomputeBest(LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME);
    const growing=g.slots.filter(x=>x.status==='growing').length;
    const ready=g.slots.filter(x=>x.status==='ready').length;
    g.status=g.unlocked
      ? `${growing}/4 rośnie${ready?` • ${ready} gotowe`:''} • nasiona ${g.availableSeeds}`
      : 'OGRÓD NIEDOSTĘPNY';
    localAiSavePersistent();
    return g;
  }

  async function localAiRefreshGarden({force=false}={}){
    if(!autoCfg.localAiGarden || !__mgSessionTemplate) return null;
    const g=state.localAI.garden;
    const every=Math.max(30,Number(autoCfg.localAiGardenPollSeconds||60))*1000;
    if(!force && g.data && Date.now()<Number(g.nextAt||0)) return g.data;

    try{
      const data=await localAiSafeGet(`/api/character/${settings.characterId}/garden`,g.data);
      if(data){
        localAiGardenObserve(data,{source:'poll'});
        if(!state.localAI.world) state.localAI.world={};
        state.localAI.world.garden=data;
      }
      g.nextAt=Date.now()+every;
      return data;
    }catch(e){
      g.status=`BŁĄD: ${String(e?.message||e)}`;
      g.nextAt=Date.now()+every;
      return g.data;
    }
  }

  function localAiGardenPendingAction(data=state.localAI.garden?.data){
    if(!autoCfg.localAiGarden || !data?.unlocked) return null;
    const slots=Array.isArray(data?.slots)?data.slots:[];

    if(autoCfg.localAiGardenAutoHarvest){
      const ready=slots.find(x=>String(x?.status||'')==='ready');
      if(ready){
        return {type:'garden_harvest',slot:Number(ready.slotNumber||0),label:`Ogród: zbierz #${Number(ready.slotNumber||0)}`};
      }
    }

    if(autoCfg.localAiGardenAutoSow){
      const emptySlots=slots.filter(x=>String(x?.status||'')==='empty');
      if(!emptySlots.length) return null;

      const seed=localAiGardenPrioritySeed(data);
      const owned=Math.max(0,Number(seed?.quantity||0));
      const missing=Math.max(0,emptySlots.length-owned);

      // Ziemniaki mają bezwzględne pierwszeństwo. Najpierw uzupełniamy sadzeniaki
      // dokładnie do liczby wolnych grządek, zamiast siać inną roślinę albo czekać.
      if(missing>0 && autoCfg.localAiGardenAutoBuySeeds){
        return {
          type:'garden_buy_seeds',
          quantity:missing,
          plantId:LOCAL_AI_GARDEN_PRIORITY_PLANT_ID,
          plantName:LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME,
          seedItemId:Number(seed?.seedItemId||seed?.seed_item_id||LOCAL_AI_GARDEN_PRIORITY_SEED_ITEM_ID),
          label:`Ogród: kup ${missing} sadzeniak${missing===1?'':'i'}`
        };
      }

      if(owned>0){
        const empty=emptySlots[0];
        const slot=Number(empty.slotNumber||0);
        return {
          type:'garden_sow',
          slot,
          plantId:LOCAL_AI_GARDEN_PRIORITY_PLANT_ID,
          plantName:LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME,
          conditions:localAiGardenPlanForSlot(slot,LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME),
          label:`Ogród: ziemniaki #${slot}`
        };
      }
    }
    return null;
  }

  function localAiGardenCanWrite(){
    if(!autoCfg.localAiGarden || !autoCfg.localAiAllowGameActions) return false;
    if(!autoCfg.enabled || autoCfg.dryRun) return false;
    if(state.auto.recovery.active || recoveryResumePending) return false;
    if(state.auto.inCycle || state.manual.semi.inCycle) return false;
    if(Date.now()<Number(state.auto.writeHoldUntil||0)) return false;
    // v8.7.0: ogród ma własny tor zapisu. MenelMode, Kombinowanie i NPC nie blokują harvest/sow.
    // Antyspam dotyczy wyłącznie kolejnych zapisów ogrodu, a nie innych aktywności świata.
    if(Date.now()-Number(state.localAI.garden?.lastActionAt||0)<1200) return false;
    return true;
  }

  async function localAiExecuteGardenAction(action){
    if(!action || !localAiGardenCanWrite()) return false;
    const g=state.localAI.garden;
    const id=Number(settings.characterId);

    // Świeży GET jest źródłem prawdy przed każdym POST-em.
    const fresh=await apiActive(`/api/character/${id}/garden`);
    localAiGardenObserve(fresh,{source:'prewrite'});

    if(action.type==='garden_harvest'){
      const slot=(fresh?.slots||[]).find(x=>Number(x?.slotNumber)===Number(action.slot));
      if(String(slot?.status||'')!=='ready') return false;

      // Zbiór może dołożyć przedmiot do plecaka. Jeśli nie ma wolnego slotu,
      // używamy istniejącego strażnika zamiast ryzykować błąd serwera.
      try{
        const inv=await localAiFreshInventory();
        if(Number(inv.slotsUsed||0)>=Number(inv.capacity||0)){
          const guard=await localAiGuardInventory({
            reason:'przed zbiorem ogrodu',
            processLoot:false,
            forceRelief:true,
            minimumReserve:1,
            actionType:'garden_harvest'
          });
          if(!guard?.ok) return false;
        }
      }catch(e){
        autoLogMsg('warn',`OGRÓD: nie udało się przygotować plecaka do zbioru: ${String(e?.message||e)}`);
        return false;
      }

      const res=await apiActive(`/api/character/${id}/garden/${Number(action.slot)}/harvest`,{
        method:'POST',body:{}
      });
      const now=Date.now();
      const harvestedSlot=(fresh?.slots||[]).find(x=>Number(x?.slotNumber)===Number(action.slot));
      const harvestedSig=localAiGardenSig(harvestedSlot?.conditions||{});
      const trial=[...g.trials].reverse().find(t=>
        Number(t.slot)===Number(action.slot) &&
        localAiGardenSig(t.conditions||{})===harvestedSig &&
        !Number(t.harvestedAt||0) &&
        (t.complete || t.active)
      );
      if(trial){
        trial.harvestedAt=now;
        trial.active=false;
        trial.complete=true;
      }
      g.lastAction=`Zebrano grządkę #${Number(action.slot)}`;
      g.lastActionAt=now;
      state.localAI.lastGameAction=g.lastAction;
      state.localAI.lastGameActionAt=now;
      state.localAI.actionGuard.lastProgressAt=now;
      localAiPushEvent('garden_harvest',{slot:Number(action.slot),response:res||null});
      localAiSavePersistent();
      g.nextAt=0;
      state.localAI.worldNextAt=0;
      return true;
    }

    if(action.type==='garden_buy_seeds'){
      const freshSlots=Array.isArray(fresh?.slots)?fresh.slots:[];
      const emptyCount=freshSlots.filter(x=>String(x?.status||'')==='empty').length;
      if(emptyCount<=0) return false;

      const currentSeed=localAiGardenPrioritySeed(fresh);
      const owned=Math.max(0,Number(currentSeed?.quantity||0));
      const needed=Math.max(0,emptyCount-owned);
      if(needed<=0){
        g.nextAt=0;
        return false;
      }

      const itemId=Number(action.seedItemId||currentSeed?.seedItemId||currentSeed?.seed_item_id||LOCAL_AI_GARDEN_PRIORITY_SEED_ITEM_ID);
      let shopType='';
      let shopItem=null;
      for(const candidate of LOCAL_AI_GARDEN_SHOP_TYPES){
        try{
          const shop=await apiActive(`/api/shops/${candidate}`);
          const items=Array.isArray(shop?.items)?shop.items:[];
          const found=items.find(x=>Number(x?.id||x?.item_id||x?.itemId||0)===itemId);
          if(found){ shopType=candidate; shopItem=found; break; }
        }catch(_e){}
      }
      if(!shopType){
        g.lastAction=`Nie znaleziono Sadzeniaczka #${itemId} w sklepach — nie kupuję w ciemno`;
        g.lastActionAt=Date.now();
        localAiSavePersistent();
        return false;
      }

      const res=await apiActive(`/api/character/${id}/purchase`,{
        method:'POST',
        body:{itemId,shopType,quantity:needed}
      });
      const now=Date.now();
      const added=Math.max(0,Number(res?.quantityAdded||needed));
      g.lastAction=`Kupiono ${added||needed} × Sadzeniaczek na ${emptyCount} wolne grządki`;
      g.lastActionAt=now;
      state.localAI.lastGameAction=g.lastAction;
      state.localAI.lastGameActionAt=now;
      state.localAI.actionGuard.lastProgressAt=now;
      localAiPushEvent('garden_seed_buy',{
        itemId,shopType,requested:needed,quantityAdded:added||needed,shopItemName:String(shopItem?.name||'Sadzeniaczek'),response:res||null
      });
      localAiSavePersistent();
      g.nextAt=0;
      state.localAI.worldNextAt=0;
      return true;
    }

    if(action.type==='garden_sow'){
      const slot=(fresh?.slots||[]).find(x=>Number(x?.slotNumber)===Number(action.slot));
      if(String(slot?.status||'')!=='empty') return false;
      const seed=localAiGardenPrioritySeed(fresh);
      if(!seed || Number(seed.quantity||0)<=0){
        g.lastAction='Brak sadzeniaków ziemniaka — przy następnym obiegu kupię brakującą liczbę';
        g.lastActionAt=Date.now();
        localAiSavePersistent();
        return false;
      }

      const cond=localAiGardenConditions(action.conditions||localAiGardenPlanForSlot(action.slot,LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME));
      const res=await apiActive(`/api/character/${id}/garden/${Number(action.slot)}/sow`,{
        method:'POST',
        body:{
          plantId:Number(action.plantId||LOCAL_AI_GARDEN_PRIORITY_PLANT_ID),
          sunlight:cond.sunlight,
          water:cond.water,
          ph:cond.ph
        }
      });
      const now=Date.now();
      // Zamykamy ewentualny stary wpis tego slotu i tworzymy próbę ze ZNANYM startem.
      for(const t of g.trials){
        if(t?.active && Number(t.slot)===Number(action.slot)) t.active=false;
      }
      g.trials.push({
        id:`garden-${now}-${Number(action.slot)}-${Math.random().toString(36).slice(2,8)}`,
        slot:Number(action.slot),
        plantId:Number(action.plantId||LOCAL_AI_GARDEN_PRIORITY_PLANT_ID),
        plantName:String(action.plantName||LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME),
        conditions:cond,
        startedAt:now,
        firstSeenAt:now,
        startKnown:true,
        source:'auto_sow',
        frameEvents:[{frame:0,ts:now,source:'sow'}],
        active:true,
        complete:false,
        readyAt:null,
        harvestedAt:null
      });
      g.lastAction=`Zasiano ziemniaki #${Number(action.slot)} • ${cond.sunlight}% / ${cond.water}% / pH ${cond.ph}`;
      g.lastActionAt=now;
      state.localAI.lastGameAction=g.lastAction;
      state.localAI.lastGameActionAt=now;
      state.localAI.actionGuard.lastProgressAt=now;
      localAiPushEvent('garden_sow',{
        slot:Number(action.slot),plantId:Number(action.plantId||LOCAL_AI_GARDEN_PRIORITY_PLANT_ID),conditions:cond,response:res||null
      });
      localAiSavePersistent();
      g.nextAt=0;
      state.localAI.worldNextAt=0;
      return true;
    }

    return false;
  }

  function localAiHardEligible(recipeId){
    const id=Number(recipeId);
    if(!id) return false;

    return sanitizeRankings().some(x =>
      x?.recipe &&
      Number(x.recipe.id)===id &&
      x.learned &&
      !x.forbidden &&
      !x.unknown &&
      x.outPrice!=null &&
      Number(x.outPrice)>0 &&
      x.profit!=null &&
      Number(x.profit)>=Number(autoCfg.minProfitPerCraft||0) &&
      x.profitHour!=null &&
      Number(x.profitHour)>=Number(autoCfg.minProfitPerHour||0) &&
      productExposure(x.recipe.result_item_id)<Number(autoCfg.maxSameProductExposure||2)
    );
  }

  async function localAiGetMenelStatus(){
    if(!__mgSessionTemplate || !autoCfg.localAiMenelMode) return null;

    try{
      return await apiActive(`/api/scavenging/${settings.characterId}/menel-mode/status`);
    }catch(e){
      state.localAI.error=`MenelMode status: ${String(e?.message||e)}`;
      return state.localAI.menelStatus;
    }
  }

  async function localAiExecuteMenelDecision(decision){
    // Kompatybilność z v6: stary format menelAction tłumaczymy na v7 action.
    const m=String(decision?.menelAction||'none');
    if(m==='start') return localAiExecuteWorldAction({type:'menel_start',label:'MenelMode START'});
    if(m==='clear_result') return localAiExecuteWorldAction({type:'menel_clear_result',label:'MenelMode wynik'});
    if(m==='complete_now') return localAiExecuteWorldAction({type:'menel_complete_now',label:'MenelMode complete-now'});
    return false;
  }

  async function localAiTick({force=false}={}){
    if(!autoCfg.localAiEnabled) return;
    if(state.localAI.busy) return;
    if(!force && Date.now()<Number(state.localAI.nextAt||0)) return;

    state.localAI.busy=true;
    state.localAI.nextAt=Date.now()+Math.max(10,Number(autoCfg.localAiIntervalSeconds||30))*1000;

    try{
      await localAiRefreshWorld({force});
      state.localAI.menelStatus=state.localAI.world?.menel||null;

      // v8.7.8: serwer potrafi pozostawić traveling=true + pendingArrival=true przy 0 s.
      // To wymaga osobnego POST-u „Wysiądź z autobusu”. Robimy go jako obowiązkowy watchdog,
      // zanim poprosimy Brain o kolejną decyzję, żeby MenelMode nie stał godzinami.
      if(await localAiClaimPendingTravelIfNeeded({source:'userscript_watchdog'})){
        await sleep(350);
        await localAiRefreshWorld({force:true});
        state.localAI.menelStatus=state.localAI.world?.menel||null;
        localAiSavePersistent();
        return;
      }

      try{
        await localAiRefreshGarden({force});
      }catch(gardenErr){
        state.localAI.garden.status=`BŁĄD: ${String(gardenErr?.message||gardenErr)}`;
      }

      const world=state.localAI.world||{};
      const idleNow=
        !world.travelStatus?.traveling &&
        !world.hustling?.activeSession &&
        !world.menel?.activeActivity &&
        !world.menel?.currentActivity &&
        !world.menel?.pendingCompletion;

      const idleLimit=Math.max(5,Number(autoCfg.localAiIdleRecoveryMinutes||12))*60*1000;
      if(
        idleNow &&
        Date.now()-Number(state.localAI.actionGuard?.lastProgressAt||Date.now())>idleLimit
      ){
        state.localAI.worldNextAt=0;
        state.localAI.actionGuard.failures=0;
        state.localAI.actionGuard.lastError='';
        state.localAI.actionGuard.lastProgressAt=Date.now();
        localAiSavePersistent();

        autoLogMsg('warn','WATCHDOG: dłuższa bezczynność przy wolnej postaci — pełny resync świata.');
        localAiPushEvent('idle_recovery',{minutes:Number(autoCfg.localAiIdleRecoveryMinutes||12)});
      }

      const response=await localAiRequest(localAiPayload());

      state.localAI.connected=true;
      state.localAI.lastSeenAt=Date.now();
      state.localAI.error=null;
      state.localAI.decision=response.decision||null;
      state.localAI.brainStats=response.memory||null;
      state.localAI.confidence=Number(response.decision?.confidence||0);
      state.localAI.reason=String(response.decision?.reason||'—');
      state.localAI.raidRecommendation=String(response.decision?.raidRecommendation||'—');
      state.localAI.taskHint=String(response.decision?.taskHint||'—');
      state.localAI.advisorNote=String(response.decision?.advisorNote||'—');
      state.localAI.plannerMode=String(response.brainStatus?.plannerMode||'adaptive-bandit');
      state.localAI.localLlmStatus=String(response.brainStatus?.localLlm?.status||'OFF');
      state.localAI.localLlmModel=String(response.brainStatus?.localLlm?.model||'—');
      state.localAI.brainHealth=String(response.brainStatus?.health||'OK');
      state.localAI.brainDecisionMs=Number(response.brainStatus?.decisionMs||0);
      state.localAI.districtSweep=response.brainStatus?.districtSweep||null;

      localAiAckEvents(response.ackEventIds||[]);

      const preferred=Number(response.decision?.preferredRecipeId||0);
      if(
        autoCfg.localAiInfluenceEconomy &&
        preferred &&
        localAiHardEligible(preferred)
      ){
        state.localAI.preferredRecipeId=preferred;
        state.localAI.preferredRecipeName=String(response.decision?.preferredRecipeName||'');
      }else{
        state.localAI.preferredRecipeId=null;
        state.localAI.preferredRecipeName='';
      }

      // v8.7.0 PARALLEL LANES:
      // - główny tor: podróż / MenelMode / Kombinowanie / pozostałe akcje świata,
      // - tor NPC: może działać równolegle z MenelMode i Kombinowaniem,
      // - tor ogrodu: harvest/sow może działać podczas MenelMode, Kombinowania i NPC.
      // Podróż pozostaje blokująca dla torów równoległych, bo nie została potwierdzona jako kompatybilna.
      const action=response.decision?.nextAction||null;
      const sideActions=Array.isArray(response.decision?.sideActions)
        ? response.decision.sideActions.filter(Boolean).slice(0,2)
        : [];
      try{
        let primaryWrite=false;
        let sideWrites=0;
        let gardenWrite=false;

        if(action){
          primaryWrite=await localAiExecuteWorldAction(action);
        }else{
          primaryWrite=await localAiExecuteMenelDecision(response.decision||{});
        }

        const primaryType=String(action?.type||'');
        const travelBlocking=
          !!world.travelStatus?.traveling ||
          ['travel','travel_complete_free','travel_complete_arrival'].includes(primaryType);

        if(!travelBlocking){
          for(const sideAction of sideActions){
            if(String(sideAction?.type||'')!=='npc_attack') continue;
            if(primaryType==='npc_attack' && Number(sideAction?.npcId||0)===Number(action?.npcId||0)) continue;
            if(primaryWrite || sideWrites) await sleep(180);
            if(await localAiExecuteWorldAction(sideAction)) sideWrites++;
          }

          // v8.7.7: opróżniamy kolejkę ogrodu w jednym obiegu (max 10 zapisów),
          // dzięki czemu 4 wolne grządki nie czekają po 30 s na każdą akcję.
          // Każdy kolejny POST poprzedza świeży GET, a 1350 ms zachowuje antyspam ogrodu.
          let gardenAction=localAiGardenPendingAction();
          let gardenOps=0;
          while(gardenAction && gardenOps<10){
            if(primaryWrite || sideWrites || gardenOps>0) await sleep(gardenOps>0?1350:180);
            const didGardenWrite=await localAiExecuteGardenAction(gardenAction);
            if(!didGardenWrite) break;
            gardenWrite=true;
            gardenOps++;
            const refreshedGarden=await localAiRefreshGarden({force:true});
            gardenAction=localAiGardenPendingAction(refreshedGarden);
          }
        }

        if(primaryWrite || sideWrites || gardenWrite){
          state.localAI.actionGuard.lastProgressAt=Date.now();
        }
      }catch(actionError){
        const msg=String(actionError?.message||actionError);

        localAiPushEvent('action_error',{
          actionType:String(action?.type||response.decision?.menelAction||'unknown'),
          label:String(action?.label||''),
          error:msg,
          districtName:String(localAiCharacter()?.district_name||state.localAI.world?.menel?.districtName||'')
        });

        state.localAI.error=`Akcja gry: ${msg}`;

        let overloadRecovered=false;

        if(
          ['travel','menel_start'].includes(String(action?.type||'')) &&
          /przeciąż|przeciaz|overload|plecak|nadmiarowe przedmioty/i.test(msg) &&
          autoCfg.localAiInventoryGuardian
        ){
          try{
            const recovery=await localAiRecoverServerOverload(action,msg);
            overloadRecovered=!!recovery.ok;

            if(overloadRecovered){
              localAiResetActionGuard(action);
            }
          }catch(e){
            autoLogMsg('warn',`PLECAK recovery: ${String(e?.message||e)}`);
          }
        }

        if(!overloadRecovered){
          const looped=localAiRegisterActionFailure(action,msg);

          if(!looped){
            state.localAI.nextAt=Math.max(
              Number(state.localAI.nextAt||0),
              Date.now()+Math.max(10,Number(autoCfg.localAiActionErrorCooldownSeconds||30))*1000
            );
          }
        }

        autoLogMsg('warn',`LOCAL AI: akcja odrzucona/błąd: ${msg}`);
      }
    }catch(e){
      state.localAI.connected=false;
      state.localAI.error=String(
        e?.name==='AbortError'
          ? `timeout połączenia z AI (${Number(state.localAI.brainRequestTimeout||0)} s)`
          : e?.message||e
      );
      state.localAI.preferredRecipeId=null;
      state.localAI.preferredRecipeName='';
    }finally{
      state.localAI.busy=false;
      if(typeof render==='function') render();
    }
  }

  let lastSeenPrices = loadJSON(K.lastSeenPrices, {});
  if (!lastSeenPrices || typeof lastSeenPrices !== 'object') lastSeenPrices = {};

  function marketHistoryKey(itemId,enh=0){ return `${Number(itemId)}:${Number(enh||0)}`; }

  function rememberMarketPrices(items){
    const now=Date.now();
    let changed=false;
    for(const x of (items||[])){
      if(x?.min_price==null) continue;
      const price=Number(x.min_price);
      if(!Number.isFinite(price) || price<=0) continue;

      learnMarketObservation(
        Number(x.item_id),
        x.item_name || x.name || `ID ${x.item_id}`,
        price,
        now
      );

      const key=marketHistoryKey(x.item_id,x.enhancement_level||0);
      const prev=lastSeenPrices[key];
      if(!prev || Number(prev.price)!==price){
        lastSeenPrices[key]={price,ts:now};
        changed=true;
      }else if(now-Number(prev.ts||0)>6*60*60*1000){
        prev.ts=now;
        changed=true;
      }
    }
    if(changed) saveJSON(K.lastSeenPrices,lastSeenPrices);
    if(autoCfg.selfLearningEnabled) learnerSave();
  }

  function getHistoricalPrice(itemId,enh=0){
    const row=lastSeenPrices[marketHistoryKey(itemId,enh)];
    if(!row || !Number.isFinite(Number(row.price))) return null;
    const maxAge=Math.max(1,Number(autoCfg.historicalPriceMaxAgeDays||30))*86400000;
    if(Date.now()-Number(row.ts||0)>maxAge) return null;
    return Number(row.price);
  }

  let strategicSpend = loadJSON(K.strategicSpend, {date:'',amount:0,purchases:0});
  if(!strategicSpend || typeof strategicSpend!=='object') strategicSpend={date:'',amount:0,purchases:0};

  function resetStrategicSpendIfNeeded(){
    const day=localDayKey();
    if(strategicSpend.date!==day){
      strategicSpend={date:day,amount:0,purchases:0};
      saveJSON(K.strategicSpend,strategicSpend);
    }
  }

  function normalizeProfitPipeline(){
    let changed=false;

    // queueId jest unikalnym identyfikatorem jednego craftu. Gdy po recovery
    // ten sam job trafił do pamięci dwa razy, zostawiamy bardziej zaawansowany zapis.
    const statusRank={
      crafting:1,
      collected:2,
      storage:2,
      unresolved:2,
      listed:3,
      returned:4,
      sold:5,
      abandoned:5
    };
    const byQueue=new Map();
    const noQueue=[];

    for(const raw of (profitJobs||[])){
      if(!raw || typeof raw!=='object') {
        changed=true;
        continue;
      }
      const qid=Number(raw.queueId||0);
      if(!qid){
        noQueue.push(raw);
        continue;
      }

      const prev=byQueue.get(qid);
      if(!prev){
        byQueue.set(qid,raw);
        continue;
      }

      changed=true;
      const prevRank=Number(statusRank[String(prev.status||'').toLowerCase()]||0);
      const nextRank=Number(statusRank[String(raw.status||'').toLowerCase()]||0);
      const prevTs=Math.max(
        Number(prev.soldDetectedAt||0),
        Number(prev.returnedAt||0),
        Number(prev.listedAt||0),
        Number(prev.collectedAt||0),
        Number(prev.startedAt||0)
      );
      const nextTs=Math.max(
        Number(raw.soldDetectedAt||0),
        Number(raw.returnedAt||0),
        Number(raw.listedAt||0),
        Number(raw.collectedAt||0),
        Number(raw.startedAt||0)
      );

      if(nextRank>prevRank || (nextRank===prevRank && nextTs>=prevTs)){
        byQueue.set(qid,{...prev,...raw});
      }else{
        byQueue.set(qid,{...raw,...prev});
      }
    }

    profitJobs=[...noQueue,...byQueue.values()];

    const jobByQueue=new Map(
      profitJobs
        .filter(j=>Number(j?.queueId||0)>0)
        .map(j=>[Number(j.queueId),j])
    );
    const seenJobQueueIds=new Set();
    const cleanedSale=[];

    for(const raw of (saleQueue||[])){
      if(!raw || typeof raw!=='object'){
        changed=true;
        continue;
      }

      const qid=Number(raw.jobQueueId||0);
      const linked=qid ? jobByQueue.get(qid) : null;
      const linkedStatus=String(linked?.status||'').toLowerCase();

      // Jeśli job jest już wystawiony albo zakończony, wpis saleQueue jest stary.
      if(linked && ['listed','sold','returned','abandoned'].includes(linkedStatus)){
        changed=true;
        continue;
      }

      // Jeden craft może mieć tylko jeden wpis kolejki sprzedaży.
      if(qid && seenJobQueueIds.has(qid)){
        changed=true;
        continue;
      }
      if(qid) seenJobQueueIds.add(qid);

      const entry={...raw};
      if(linked){
        if(Number(entry.itemId||0)!==Number(linked.itemId||0)){
          entry.itemId=Number(linked.itemId||0);
          changed=true;
        }
        if(!entry.name && linked.name){
          entry.name=linked.name;
          changed=true;
        }
      }
      cleanedSale.push(entry);
    }

    saleQueue=cleanedSale;
    return changed;
  }

  function profitJobEvidenceTime(job){
    return Math.max(
      Number(job?.soldDetectedAt||0),
      Number(job?.returnedAt||0),
      Number(job?.listedAt||0),
      Number(job?.unresolvedAt||0),
      Number(job?.collectedAt||0),
      Number(job?.createdAt||0),
      Number(job?.startedAt||0)
    );
  }

  function pipelinePhysicalRows(inventory,storage,listings){
    const byInv=new Map();

    const add=(raw,location)=>{
      const iid=Number(raw?.inventory_id ?? raw?.inventoryId ?? 0);
      const itemId=Number(raw?.item_id ?? raw?.itemId ?? raw?.id ?? 0);
      const qty=Math.max(1,Number(raw?.quantity||1));
      if(!iid || !itemId) return;

      const prev=byInv.get(iid);
      if(!prev){
        byInv.set(iid,{inventoryId:iid,itemId,quantity:qty,locations:new Set([location])});
      }else{
        // Ten sam inventoryId nie powinien jednocześnie istnieć w dwóch miejscach.
        // Używamy MAX zamiast SUM, żeby nie podwajać chwilowo zdublowanych GET-ów.
        prev.quantity=Math.max(Number(prev.quantity||1),qty);
        if(!prev.itemId) prev.itemId=itemId;
        prev.locations.add(location);
      }
    };

    for(const x of (inventory?.inventory||[])) add(x,'backpack');
    for(const x of (storage?.storageItems||[])) add(x,'melina');
    for(const x of (listings||[])){
      if(String(x?.status||'active').toLowerCase()!=='active') continue;
      add(x,'listing');
    }

    return byInv;
  }

  async function reconcileProfitPipelineTruth(){
    const now=Date.now();
    const srv=serverCraftState();

    // v8.7.3: "zombie crafting" = lokalny job nadal ma status crafting,
    // ale świeża prawda serwera nie zawiera już jego queueId ani w queue, ani w READY.
    // Taki job NIE może wiecznie blokować ekspozycji ani sprzedaży fizycznego produktu.
    const zombieCrafts=srv.fresh
      ? (profitJobs||[]).filter(j=>{
          if(String(j?.status||'').toLowerCase()!=='crafting') return false;
          const qid=Number(j?.queueId||0);
          return qid>0 && !srv.queueIds.has(qid) && !srv.readyIds.has(qid);
        })
      : [];

    const suspicious=(profitJobs||[]).filter(j=>{
      const s=String(j?.status||'').toLowerCase();
      return ['collected','storage','unresolved','listed'].includes(s) && Number(j?.inventoryId||0)>0;
    });

    const duplicateInv=new Set();
    const seen=new Set();
    for(const j of suspicious){
      const key=`${Number(j.itemId||0)}:${Number(j.inventoryId||0)}`;
      if(seen.has(key)) duplicateInv.add(key);
      seen.add(key);
    }

    const hasOldUnresolved=suspicious.some(j=>
      String(j.status||'').toLowerCase()==='unresolved' &&
      now-profitJobEvidenceTime(j) > 2*60*60*1000
    );

    if(!duplicateInv.size && !hasOldUnresolved && !zombieCrafts.length){
      return {changed:false,abandoned:0,remapped:0,recoveredCrafting:0};
    }

    // Do kasowania/porządkowania wymagamy pełnej prawdy:
    // świeży plecak + rupieciarnia + świeże activeListings z refreshProfitMarketState().
    // Jeśli GET zawiedzie, nie zgadujemy i niczego nie usuwamy.
    let inventory,storage;
    try{
      [inventory,storage]=await Promise.all([
        localAiFreshInventory(),
        localAiFreshMelina()
      ]);
    }catch(e){
      autoLogMsg('warn',`PIPELINE: nie udało się uzgodnić starej historii — ${String(e?.message||e)}`);
      return {
        changed:false,
        abandoned:0,
        remapped:0,
        recoveredCrafting:0,
        error:String(e?.message||e)
      };
    }

    const physical=pipelinePhysicalRows(inventory,storage,state.auto.activeListings||[]);
    const byItem=new Map();
    for(const row of physical.values()){
      if(!byItem.has(row.itemId)) byItem.set(row.itemId,[]);
      byItem.get(row.itemId).push(row);
    }

    const assigned=new Map();
    const active=suspicious.slice().sort((a,b)=>{
      const rank={listed:4,collected:3,storage:3,unresolved:2};
      const ar=Number(rank[String(a.status||'').toLowerCase()]||0);
      const br=Number(rank[String(b.status||'').toLowerCase()]||0);
      return br-ar || profitJobEvidenceTime(b)-profitJobEvidenceTime(a);
    });

    const unresolved=[];
    for(const job of active){
      const iid=Number(job.inventoryId||0);
      const itemId=Number(job.itemId||0);
      const row=physical.get(iid);
      const used=Number(assigned.get(iid)||0);

      if(row && Number(row.itemId)===itemId && used<Number(row.quantity||1)){
        assigned.set(iid,used+1);
      }else{
        unresolved.push(job);
      }
    }

    let changed=false;
    let abandoned=0;
    let remapped=0;
    let recoveredCrafting=0;
    const abandonedQueueIds=new Set();

    const candidateRowsForItem=(itemId)=>(
      (byItem.get(Number(itemId))||[])
        .filter(row=>Number(assigned.get(row.inventoryId)||0)<Number(row.quantity||1))
        .sort((a,b)=>{
          // Sprzedaż z plecaka jest najważniejsza, potem rupieciarnia, na końcu aktywna oferta.
          const al=a.locations.has('backpack')?0:a.locations.has('melina')?1:2;
          const bl=b.locations.has('backpack')?0:b.locations.has('melina')?1:2;
          return al-bl || Number(a.inventoryId)-Number(b.inventoryId);
        })
    );

    const ensureSaleEntry=(job,inventoryId,{recoveredZombie=false}={})=>{
      const qid=Number(job?.queueId||0);
      let entry=(saleQueue||[]).find(e=>Number(e?.jobQueueId||0)===qid);

      if(!entry){
        entry={
          inventoryId:Number(inventoryId),
          itemId:Number(job.itemId||0),
          quantity:1,
          name:job.name,
          costBasis:Number(job.costBasis||0),
          recipeId:Number(job.recipeId||0),
          jobQueueId:qid,
          startedAt:Number(job.startedAt||Date.now()),
          predictedProfitAtStart:Number(job.predictedProfitAtStart||job.expectedProfit||0),
          createdAt:Date.now(),
          retryAfter:0,
          missingChecks:0
        };
        if(recoveredZombie) entry.recoveredZombieCraft=true;
        saleQueue.push(entry);
      }else{
        entry.inventoryId=Number(inventoryId);
        entry.itemId=Number(job.itemId||entry.itemId||0);
        entry.name=job.name||entry.name;
        entry.retryAfter=0;
        entry.missingChecks=0;
        if(recoveredZombie) entry.recoveredZombieCraft=true;
      }
      return entry;
    };

    const activeListingForRow=(row,itemId)=>{
      return (state.auto.activeListings||[]).find(x=>
        String(x?.status||'active').toLowerCase()==='active' &&
        Number(x?.item_id ?? x?.itemId ?? 0)===Number(itemId) &&
        Number(x?.inventory_id ?? x?.inventoryId ?? 0)===Number(row.inventoryId)
      )||null;
    };

    const recoverJobFromPhysical=(job,row,{zombie=false}={})=>{
      const itemId=Number(job.itemId||0);
      const oldIid=Number(job.inventoryId||0);
      job.inventoryId=Number(row.inventoryId);
      job.reconciledAt=Date.now();

      const listing=activeListingForRow(row,itemId);
      if(row.locations.has('listing') && listing){
        job.status='listed';
        job.listingId=Number(listing.id ?? listing.listing_id ?? listing.listingId ?? 0)||null;
        job.listPrice=Number(listing.price_per_unit ?? listing.price ?? job.listPrice ?? 0)||job.listPrice||null;
        job.listedAt=Number(job.listedAt||Date.now());
        job.reconcileReason=zombie
          ? `zombie crafting → aktywna oferta inventoryId ${row.inventoryId}`
          : `inventoryId ${oldIid} → ${row.inventoryId} (aktywna oferta)`;

        saleQueue=saleQueue.filter(e=>Number(e?.jobQueueId||0)!==Number(job.queueId||0));
      }else if(row.locations.has('backpack')){
        job.status='collected';
        // To jest czas ODKRYCIA przegapionego odbioru, a nie prawdziwy czas craftu.
        // Nie wywołujemy learnCraftCollected(), żeby nie zepsuć uczenia czasu produkcji.
        if(!Number(job.collectedAt||0)) job.collectedAt=Date.now();
        job.recoveredAt=Date.now();
        job.reconcileReason=zombie
          ? `zombie crafting → produkt znaleziony w plecaku • inventoryId ${row.inventoryId}`
          : `inventoryId ${oldIid} → ${row.inventoryId} (fizyczny towar w plecaku)`;
        ensureSaleEntry(job,row.inventoryId,{recoveredZombie:zombie});
      }else if(row.locations.has('melina')){
        job.status='storage';
        job.recoveredAt=Date.now();
        job.reconcileReason=zombie
          ? `zombie crafting → produkt znaleziony w rupieciarni • inventoryId ${row.inventoryId}`
          : `inventoryId ${oldIid} → ${row.inventoryId} (fizyczny towar w rupieciarni)`;
        saleQueue=saleQueue.filter(e=>Number(e?.jobQueueId||0)!==Number(job.queueId||0));
      }else{
        return false;
      }

      delete job.zombieMissingSince;
      delete job.zombieMissingChecks;
      assigned.set(row.inventoryId,Number(assigned.get(row.inventoryId)||0)+1);
      return true;
    };

    // Najpierw napraw stare collected/storage/unresolved z błędnym inventoryId.
    for(const job of unresolved){
      const status=String(job.status||'').toLowerCase();
      if(status==='listed'){
        // Listed rozstrzyga auditListedProfitJobs; nie zgadujemy sprzedaży/powrotu tutaj.
        continue;
      }

      const candidates=candidateRowsForItem(Number(job.itemId||0));
      if(candidates.length){
        if(recoverJobFromPhysical(job,candidates[0],{zombie:false})){
          changed=true;
          remapped++;
          continue;
        }
      }

      const age=Date.now()-profitJobEvidenceTime(job);
      if(age < 2*60*60*1000) continue;

      job.status='abandoned';
      job.abandonedAt=Date.now();
      job.reconciledAt=Date.now();
      job.reconcileReason='brak fizycznego towaru w plecaku/rupieciarni/ofercie przez >2h';
      abandonedQueueIds.add(Number(job.queueId||0));
      changed=true;
      abandoned++;
    }

    // v8.7.3: odzysk przegapionych odbiorów.
    // Wymagamy świeżego snapshotu serwera, dlatego zombieCrafts jest puste,
    // gdy crafting-recipes nie został właśnie poprawnie odświeżony.
    for(const job of zombieCrafts.slice().sort((a,b)=>Number(a.startedAt||0)-Number(b.startedAt||0))){
      const candidates=candidateRowsForItem(Number(job.itemId||0));

      if(candidates.length){
        if(recoverJobFromPhysical(job,candidates[0],{zombie:true})){
          changed=true;
          recoveredCrafting++;
          autoLogMsg(
            'warn',
            `PIPELINE RECOVERY: ${job.name} nie istnieje już w kolejce serwera, ale produkt znaleziono fizycznie — przywracam sprzedaż.`
          );
          continue;
        }
      }

      // Brak w queue/READY + brak w plecaku/rupieciarni/ofercie.
      // Nie kasujemy po jednym odczycie; wymagamy dwóch świeżych potwierdzeń
      // rozdzielonych co najmniej 30 sekundami.
      if(!Number(job.zombieMissingSince||0)) job.zombieMissingSince=Date.now();
      job.zombieMissingChecks=Number(job.zombieMissingChecks||0)+1;
      job.reconciledAt=Date.now();
      job.reconcileReason=
        `zombie crafting: brak queue/READY i brak fizycznego produktu • potwierdzenie ${job.zombieMissingChecks}/2`;
      changed=true;

      if(
        Number(job.zombieMissingChecks||0)>=2 &&
        Date.now()-Number(job.zombieMissingSince||Date.now())>=30000
      ){
        job.status='abandoned';
        job.abandonedAt=Date.now();
        job.reconcileReason='zombie crafting potwierdzony: brak na serwerze i brak fizycznego produktu';
        abandonedQueueIds.add(Number(job.queueId||0));
        abandoned++;
      }
    }

    if(abandonedQueueIds.size){
      const before=saleQueue.length;
      saleQueue=saleQueue.filter(e=>!abandonedQueueIds.has(Number(e?.jobQueueId||0)));
      if(saleQueue.length!==before) changed=true;
    }

    if(changed){
      autoLogMsg(
        'info',
        `PIPELINE TRUTH: remap ${remapped} • odzyskane zombie-crafty ${recoveredCrafting} • usunięte stare/duplikaty ${abandoned}.`
      );
      saveProfitPipeline();
    }

    return {changed,abandoned,remapped,recoveredCrafting};
  }

  function saveProfitPipeline(){
    normalizeProfitPipeline();

    // Nie pozwalamy, żeby wielomiesięczna historia gotowych jobów rosła bez końca.
    const active=profitJobs.filter(x=>!['sold','returned','abandoned'].includes(String(x.status||'').toLowerCase()));
    const completed=profitJobs.filter(x=>['sold','returned','abandoned'].includes(String(x.status||'').toLowerCase())).slice(-200);
    profitJobs=[...completed,...active];

    saveJSON(K.profitJobs, profitJobs);
    saveJSON(K.saleQueue, saleQueue);
    saveJSON(K.profitStats, profitStats);
  }

  // Jednorazowo czyścimy ewentualne stare duplikaty już przy starcie.
  if(normalizeProfitPipeline()){
    saveJSON(K.profitJobs, profitJobs);
    saveJSON(K.saleQueue, saleQueue);
  }

  const manualPrefs = Object.assign({
    marketSearch:'',
    inventorySearch:'',
    sort:'costPerWaste',
    view:'market',
    semiMode:'market',
    semiItemId:null,
    semiInventoryItemId:null,
    semiInventoryEnhancement:0,
    semiInventoryName:'',
    semiQty:10,
    semiMaxPrice:100,
    semiIntervalSeconds:5
  }, loadJSON(K.manualPrefs, {}));

  function saveManualPrefs(){ saveJSON(K.manualPrefs, manualPrefs); }

  function localDayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function resetAutoSpendIfNeeded() {
    const day = localDayKey();
    if (autoSpend.date !== day) {
      autoSpend = {date:day, amount:0, purchases:0};
      saveJSON(K.autoSpend, autoSpend);
    }
  }
  resetAutoSpendIfNeeded();

  const state = {
    busy:false,
    lastUpdated:null,
    nextRefreshAt:0,
    activeTab:localStorage.getItem(K.tab) || 'dashboard',
    prices:new Map(),
    prevPrices:new Map(),
    recipes:[],
    parts:{},
    toolsLevel:null,
    craftSpeed:null,
    dismantleSpeed:2,
    purchaseLimit:null,
    rateLimitRemaining:null,
    rankings:[],
    resourceOptions:{},
    optimizerCache:new Map(),
    marketRevision:0,
    dismantlePriceSignature:'',
    optimizerLastMs:0,
    optimizerLastRecipes:0,
    lastUpgradeFetch:0,
    endpointStatus:{},
    nativeMode:true,
    nativeEvents:0,
    lastNativeUrl:null,
    errors:[],
    dismantleQueue:[],
    dismantleMaxQueueSize:9,
    craftQueue:[],
    craftReady:[],
    craftMaxQueueSize:10,
    craftSnapshotAt:0,
    auto:{
      inCycle:false,
      nextCycleAt:0,
      lastCycleAt:0,
      connection:'nie testowano',
      target:null,
      source:null,
      lastAction:'—',
      lastPlanKey:'',
      error:null,
      stage:'STOP',
      stageDetail:'—',
      lockedRecipeId:null,
      purchaseStalls:{},
      strategicPlan:null,
      strategicLastAction:'—',
      lastDismantleDecision:'',
      writeHoldUntil:0,
      recovery:{
        active:recoveryResumePending,
        inTick:false,
        kind:recoveryResumePending?'resume':'',
        reason:recoveryResumePending?String(recoveryTicket?.reason||'Wznowienie po awaryjnym odświeżeniu'):'',
        failures:Number(recoveryTicket?.failures||0),
        nextAt:recoveryResumePending ? Date.now()+8000 : 0,
        lastError:'',
        reloadScheduled:false,
        waitingForSession:recoveryResumePending,
        resumedAt:0
      },
      activeListings:[],
      activeListingCount:0,
      maxListings:10
    },
    marketNextAt:0,
    marketRefreshing:false,
    localAI:{
      connected:false,
      busy:false,
      lastSeenAt:0,
      nextAt:0,
      error:null,
      decision:null,
      preferredRecipeId:null,
      preferredRecipeName:'',
      confidence:0,
      reason:'—',
      menelStatus:null,
      menelLastAction:'—',
      menelLastActionAt:0,
      brainStats:null,
      world:null,
      worldNextAt:0,
      worldLastAt:0,
      lastGameAction:'—',
      lastGameActionAt:0,
      worldLastWriteAt:0,
      lastGameActionResult:null,
      raidRecommendation:'—',
      taskHint:'—',
      advisorNote:'—',
      plannerMode:'adaptive-bandit',
      localLlmStatus:'—',
      localLlmModel:'—',
      brainHealth:'—',
      brainDecisionMs:0,
      brainRequestTimeout:0,
      lastDistrictId:0,
      worldActionGate:'—',
      worldActionGateAt:0,
      menelClearSync:null,
      districtSweep:null,
      inventoryGuardian:{
        status:'—',
        lastCheckAt:0,
        slotsUsed:0,
        capacity:0,
        overloaded:false,
        reserve:Number(autoCfg.localAiInventoryReserveSlots ?? 4),
        serverSafeLimit:(
          Number.isFinite(Number(localAiPersistent.inventoryServerSafeLimit)) &&
          Number(localAiPersistent.inventoryServerSafeLimit)>0
        )
          ? Number(localAiPersistent.inventoryServerSafeLimit)
          : null,
        serverRejectedAt:Number(localAiPersistent.inventoryServerRejectedAt||0),
        serverRejectedAction:String(localAiPersistent.inventoryServerRejectedAction||''),
        lastAction:String(localAiPersistent.inventoryLastAction||'—'),
        lastLoot:Array.isArray(localAiPersistent.lastLoot)?localAiPersistent.lastLoot:[],
        preMenelSnapshot:localAiPersistent.preMenelSnapshot||null,
        melinaSlotsUsed:Number(localAiPersistent.melinaSlotsUsed||0),
        melinaCapacity:Number(localAiPersistent.melinaCapacity||0),
        melinaLastAction:String(localAiPersistent.melinaLastAction||'—')
      },
      garden:{
        status:'—',
        data:null,
        unlocked:false,
        lastCheckAt:0,
        nextAt:0,
        slots:[],
        availableSeeds:0,
        plantId:LOCAL_AI_GARDEN_PRIORITY_PLANT_ID,
        plantName:LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME,
        trials:Array.isArray(localAiPersistent.garden?.trials)
          ? localAiPersistent.garden.trials.slice(-80)
          : [],
        best:localAiPersistent.garden?.best||null,
        lastAction:String(localAiPersistent.garden?.lastAction||'—'),
        lastActionAt:Number(localAiPersistent.garden?.lastActionAt||0)
      },
      melinaLearn:{
        armed:false,
        until:0,
        status:melinaAddLearned
          ? `NAUCZONY • ${melinaAddLearned.method} ${melinaAddLearned.path}`
          : 'BRAK — naucz 1 przeniesienie',
        lastCapture:null
      },
      actionGuard:{
        key:String(localAiPersistent.actionGuard?.key||''),
        failures:Number(localAiPersistent.actionGuard?.failures||0),
        lastError:String(localAiPersistent.actionGuard?.lastError||''),
        lastAt:Number(localAiPersistent.actionGuard?.lastAt||0),
        lastProgressAt:Number(localAiPersistent.actionGuard?.lastProgressAt||Date.now())
      },
      menelLearn:{
        armed:false,
        until:0,
        trace:[],
        status:menelCloseLearned
          ? `NAUCZONY • ${menelCloseLearned.sequence.length} kroków`
          : 'BRAK — można nauczyć ręcznie',
        lastCapture:null
      }
    },
    manual:{
      busy:false,
      dismantlableItems:[],
      lastRefreshAt:0,
      lastMessage:'—',
      lastError:null,
      semi:{
        enabled:false,
        inCycle:false,
        nextAt:0,
        remaining:0,
        bought:0,
        queued:0,
        spent:0,
        lastAction:'—',
        error:null
      }
    }
  };

  const fmt = (n, digits=0) => {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    return new Intl.NumberFormat('pl-PL', {maximumFractionDigits:digits}).format(Number(n));
  };
  const money = n => n == null || Number.isNaN(Number(n)) ? '—' : `${fmt(n,0)} zł`;
  const pct = n => n == null || Number.isNaN(Number(n)) ? '—' : `${fmt(n,1)}%`;
  const esc = s => String(s ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const nowIso = () => new Date().toISOString();
  const pkey = (id, enh=0) => `${Number(id)}:${Number(enh||0)}`;
  const feeFor = price => Math.floor(Number(price||0) * Number(settings.listingFeeRate||0));
  const netAfterFee = price => price == null ? null : Number(price) - feeFor(price);

  function secondsText(sec) {
    if (sec == null || !Number.isFinite(Number(sec))) return '—';
    sec = Math.round(Number(sec));
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function getPrice(id, enh=0) {
    return state.prices.get(pkey(id, enh)) || null;
  }

  class MgApiError extends Error {
    constructor(message, opts={}){
      super(message);
      this.name='MgApiError';
      this.status=Number(opts.status||0);
      this.path=String(opts.path||'');
      this.method=String(opts.method||'GET').toUpperCase();
      this.retryAfterMs=Math.max(0,Number(opts.retryAfterMs||0));
      this.network=!!opts.network;
      this.timeout=!!opts.timeout;
      this.ambiguousWrite=!!opts.ambiguousWrite;
    }
  }

  function parseRetryAfterMs(value){
    if(value==null || value==='') return 0;
    const n=Number(value);
    if(Number.isFinite(n)) return Math.max(0,n*1000);
    const ts=Date.parse(String(value));
    return Number.isFinite(ts) ? Math.max(0,ts-Date.now()) : 0;
  }

  function recoveryErrorInfo(e){
    const msg=String(e?.message||e||'');
    const status=Number(e?.status||((msg.match(/HTTP\s+(\d{3})/i)||[])[1])||0);

    let kind='fatal';
    if(status===401 || status===403 || /Brak wzorca sesji/i.test(msg)) kind='session';
    else if(status===429) kind='ratelimit';
    else if(status===408 || status>=500 || e?.network || e?.timeout || /Failed to fetch|NetworkError|Load failed|ERR_/i.test(msg)) kind='transient';

    return {
      kind,
      status,
      msg,
      retryAfterMs:Number(e?.retryAfterMs||0),
      ambiguousWrite:!!e?.ambiguousWrite
    };
  }

  function recoveryDelayMs(failures, retryAfterMs=0){
    const base=Math.max(10,Number(autoCfg.recoveryBaseSeconds||45))*1000;
    const max=Math.max(base,Number(autoCfg.recoveryMaxSeconds||300)*1000);
    const exp=Math.min(max,base*Math.pow(2,Math.max(0,Number(failures||1)-1)));
    return Math.max(exp,Number(retryAfterMs||0));
  }

  function clearRecoveryTicket(){
    recoveryTicket=null;
    recoveryResumePending=false;
    localStorage.removeItem(K.recoveryTicket);
  }

  function recoveryTicketValid(){
    return !!(
      recoveryTicket &&
      recoveryTicket.resume===true &&
      Number(recoveryTicket.expiresAt||0)>Date.now()
    );
  }

  function saveRecoveryTicket(reason, mode=null){
    const now=Date.now();
    const existing=loadJSON(K.recoveryTicket,{})||{};
    const lifetime=Math.max(5,Number(autoCfg.recoveryTicketMinutes||15))*60000;

    const windowStart=
      Number(existing.windowStartedAt||0)>0 &&
      now-Number(existing.windowStartedAt)<30*60000
        ? Number(existing.windowStartedAt)
        : now;

    recoveryTicket={
      resume:true,
      mode:mode || (autoCfg.dryRun?'dry':'live'),
      createdAt:Number(existing.createdAt||now),
      expiresAt:now+lifetime,
      windowStartedAt:windowStart,
      reloads:Number(existing.reloads||0),
      failures:Number(state.auto?.recovery?.failures||0),
      reason:String(reason||'Awaryjne wznowienie Pomagiera')
    };
    saveJSON(K.recoveryTicket,recoveryTicket);
    return recoveryTicket;
  }

  function notifyRecovery(title, body){
    try{
      if(typeof Notification!=='undefined' && Notification.permission==='granted'){
        new Notification(title,{body:String(body||'')});
      }
    }catch{}
  }

  function resetRecoveryState(){
    state.auto.recovery.active=false;
    state.auto.recovery.inTick=false;
    state.auto.recovery.kind='';
    state.auto.recovery.reason='';
    state.auto.recovery.failures=0;
    state.auto.recovery.nextAt=0;
    state.auto.recovery.lastError='';
    state.auto.recovery.reloadScheduled=false;
    state.auto.recovery.waitingForSession=false;
    state.auto.recovery.resumedAt=Date.now();
  }

  function beginRecovery(e, {fromResume=false}={}){
    const info=recoveryErrorInfo(e);

    if(!autoCfg.recoveryEnabled || info.kind==='fatal'){
      return false;
    }

    state.auto.recovery.active=true;
    state.auto.recovery.kind=info.kind;
    state.auto.recovery.failures=Math.max(1,Number(state.auto.recovery.failures||0)+1);
    state.auto.recovery.reason=info.msg;
    state.auto.recovery.lastError=info.msg;
    state.auto.recovery.waitingForSession=info.kind==='session';

    if(info.ambiguousWrite){
      // Jeśli odpowiedź na POST zginęła w sieci, serwer MÓGŁ wykonać akcję.
      // Nie powtarzamy jej "w ciemno". Najpierw pełna synchronizacja i chwila ciszy.
      state.auto.writeHoldUntil=Math.max(
        Number(state.auto.writeHoldUntil||0),
        Date.now()+Math.max(20,Number(autoCfg.writeSafetyHoldSeconds||60))*1000
      );
      autoLogMsg('warn','RECOVERY: wynik ostatniego POST-a jest niepewny — blokuję kolejne zapisy do czasu synchronizacji.');
    }

    if(info.kind==='session'){
      // Nie przechowujemy starego wzorca. Gra albo sama wykona świeży GET,
      // albo po kontrolowanym reloadzie wygeneruje nowy.
      __mgSessionTemplate=null;
      __mgSessionTemplateAt=0;
    }

    const delay=recoveryDelayMs(state.auto.recovery.failures,info.retryAfterMs);
    state.auto.recovery.nextAt=Date.now()+delay;
    state.auto.stage=
      info.kind==='ratelimit' ? 'RECOVERY: LIMIT API' :
      info.kind==='session' ? 'RECOVERY: SESJA' :
      'RECOVERY: SERWER/SIEĆ';
    state.auto.stageDetail=`${info.msg} • ponowna próba za ${Math.ceil(delay/1000)} s`;
    state.auto.connection='RECOVERY';

    if(!fromResume && autoCfg.enabled){
      saveRecoveryTicket(info.msg,autoCfg.dryRun?'dry':'live');
    }

    autoLogMsg('warn',`SAMONAPRAWA: ${state.auto.stageDetail}`);
    return true;
  }

  function recoveryCanReload(){
    if(!autoCfg.recoveryEnabled) return false;
    if(!navigator.onLine) return false;

    const threshold=Math.max(1,Number(autoCfg.recoveryReloadAfterFailures||3));
    if(Number(state.auto.recovery.failures||0)<threshold) return false;

    const t=recoveryTicketValid()
      ? recoveryTicket
      : saveRecoveryTicket(state.auto.recovery.reason||'Recovery',autoCfg.dryRun?'dry':'live');

    const now=Date.now();
    if(now-Number(t.windowStartedAt||now)>=30*60000){
      t.windowStartedAt=now;
      t.reloads=0;
    }

    return Number(t.reloads||0)<Math.max(0,Number(autoCfg.recoveryMaxReloads||3));
  }

  function scheduleRecoveryReload(reason){
    if(state.auto.recovery.reloadScheduled) return false;
    if(!recoveryCanReload()) return false;

    const t=saveRecoveryTicket(reason, recoveryTicket?.mode || (autoCfg.dryRun?'dry':'live'));
    t.reloads=Number(t.reloads||0)+1;
    t.failures=Number(state.auto.recovery.failures||0);
    t.expiresAt=Date.now()+Math.max(5,Number(autoCfg.recoveryTicketMinutes||15))*60000;
    saveJSON(K.recoveryTicket,t);
    recoveryTicket=t;
    recoveryResumePending=true;

    state.auto.recovery.reloadScheduled=true;
    state.auto.stage='RECOVERY: RELOAD';
    state.auto.stageDetail=`Odświeżam grę awaryjnie (${t.reloads}/${autoCfg.recoveryMaxReloads})`;
    autoLogMsg('warn',`${state.auto.stageDetail} • ${reason}`);
    notifyRecovery('Pomagier by Don',state.auto.stageDetail);

    setTimeout(()=>{
      try{ location.reload(); }catch{}
    },1800);

    return true;
  }

  async function recoveryProbe(){
    // Tylko bezpieczne GET-y. Żadnych zakupów / craftu / sprzedaży.
    await autoRefreshLiveData();
    return true;
  }

  async function recoveryTick(){
    if(state.auto.recovery.inTick) return;
    if(!state.auto.recovery.active && !recoveryResumePending) return;

    state.auto.recovery.inTick=true;
    try{
      if(!navigator.onLine){
        state.auto.stage='RECOVERY: OFFLINE';
        state.auto.stageDetail='Brak połączenia z internetem — czekam na powrót sieci';
        state.auto.connection='OFFLINE';
        state.auto.recovery.nextAt=Date.now()+15000;
        return;
      }

      if(Date.now()<Number(state.auto.recovery.nextAt||0)) return;

      if(!__mgSessionTemplate){
        state.auto.recovery.waitingForSession=true;
        state.auto.stage='RECOVERY: CZEKAM NA SESJĘ';
        state.auto.stageDetail='Czekam na świeży natywny request gry';

        // Po kilku nieudanych oczekiwaniach kontrolowany reload strony.
        state.auto.recovery.failures=Math.max(1,Number(state.auto.recovery.failures||0)+1);
        state.auto.recovery.nextAt=Date.now()+recoveryDelayMs(state.auto.recovery.failures);

        if(recoveryCanReload()){
          scheduleRecoveryReload('Nie udało się przechwycić świeżej sesji');
        }else if(
          Number(state.auto.recovery.failures||0)>=
          Math.max(1,Number(autoCfg.recoveryReloadAfterFailures||3))+
          Math.max(0,Number(autoCfg.recoveryMaxReloads||3))+3
        ){
          clearRecoveryTicket();
          recoveryResumePending=false;
          state.auto.recovery.active=false;
          autoCfg.enabled=false;
          autoCfg.dryRun=true;
          autoSaveCfg();
          state.auto.stage='CZEKA NA LOGOWANIE';
          state.auto.stageDetail='Nie udało się odzyskać sesji automatycznie. Potrzebne ręczne zalogowanie.';
          state.auto.connection='SESJA WYGASŁA';
          autoLogMsg('error','SAMONAPRAWA zatrzymana: potrzebne ręczne logowanie.');
          notifyRecovery('Pomagier wymaga logowania','Automatyczne odzyskanie sesji nie powiodło się.');
        }
        return;
      }

      state.auto.stage='RECOVERY: TEST';
      state.auto.stageDetail='Sprawdzam bazar i warsztat bez wykonywania akcji';
      await recoveryProbe();

      // Po awaryjnym reloadzie wznowienie wyłącznie, jeżeli bilet był ważny.
      if(recoveryResumePending){
        if(!recoveryTicketValid()){
          clearRecoveryTicket();
          throw new Error('Bilet awaryjnego wznowienia wygasł.');
        }

        autoCfg.enabled=true;
        autoCfg.dryRun=recoveryTicket.mode==='dry';
        autoSaveCfg();
        recoveryResumePending=false;
        clearRecoveryTicket();
      }

      resetRecoveryState();
      state.auto.connection='OK — sesja odzyskana';
      state.auto.stage='RECOVERY: OK';
      state.auto.stageDetail='Połączenie odzyskane — wracam do pracy';
      state.auto.nextCycleAt=Date.now()+2500;
      autoLogMsg('info','SAMONAPRAWA OK: sesja/API działają, Pomagier wznawia pracę.');
      notifyRecovery('Pomagier wrócił do pracy','Sesja i API zostały odzyskane.');
    }catch(e){
      const recovered=beginRecovery(e,{fromResume:recoveryResumePending});
      if(!recovered){
        state.auto.recovery.active=false;
        recoveryResumePending=false;
        clearRecoveryTicket();
        autoCfg.enabled=false;
        autoCfg.dryRun=true;
        autoSaveCfg();
        state.auto.stage='BŁĄD RECOVERY';
        state.auto.stageDetail=String(e?.message||e);
        autoLogMsg('error',`SAMONAPRAWA: ${state.auto.stageDetail}`);
      }else if(recoveryCanReload() && recoveryErrorInfo(e).kind==='session'){
        scheduleRecoveryReload(String(e?.message||e));
      }
    }finally{
      state.auto.recovery.inTick=false;
      if(typeof render==='function') render();
    }
  }

  const BRIDGE_EVENT = '__MG_MP_NATIVE_API_V22__';

  function isMenelNativeUrl(url){
    try{
      const u=new URL(url,location.href);
      return /^\/api\/scavenging\/\d+\/menel-mode(?:\/[^?]*)?$/.test(u.pathname);
    }catch{
      return false;
    }
  }

  function normalizeMenelLearnPath(url){
    try{
      const u=new URL(url,location.href);
      const id=Number(settings.characterId);
      return (u.pathname+u.search).replace(
        new RegExp(`/api/scavenging/${id}/`),
        '/api/scavenging/{id}/'
      );
    }catch{
      return String(url||'');
    }
  }

  function parseMenelLearnBody(raw){
    if(raw==null || raw==='') return null;
    if(typeof raw==='object' && !(raw instanceof Blob) && !(raw instanceof FormData)){
      try{ return JSON.parse(JSON.stringify(raw)); }catch{ return null; }
    }
    const text=String(raw||'');
    if(!text || text.length>4000) return null;
    try{ return JSON.parse(text); }catch{ return null; }
  }

  function summarizeMenelLearnResponse(data){
    if(!data || typeof data!=='object') return {};
    const out={};
    for(const key of ['success','cleared','premiumCost','message','style']){
      if(data[key]!==undefined) out[key]=data[key];
    }
    if(data.results) out.hasResults=true;
    return out;
  }

  async function localAiTryFinalizeMenelLearning(){
    const learn=state.localAI.menelLearn;
    if(!learn?.armed) return false;

    if(Date.now()>Number(learn.until||0)){
      learn.armed=false;
      learn.status='CZAS MINĄŁ — spróbuj jeszcze raz';
      state.localAI.worldActionGate='NAUKA MENELMODE: PRZERWANA';
      render();
      return false;
    }

    if(!learn.trace.length) return false;

    try{
      const id=Number(settings.characterId);
      const chResp=await apiActive(`/api/character/${id}`);
      await sleep(100);
      const st=await apiActive(`/api/scavenging/${id}/menel-mode/status`);

      if(!state.localAI.world) state.localAI.world={};
      state.localAI.world.character=chResp;
      state.localAI.world.menel=st;
      state.localAI.menelStatus=st;
      state.localAI.worldLastAt=Date.now();

      const cleared=
        !st?.pendingCompletion &&
        !st?.lastMenelModeResult &&
        !st?.activeActivity &&
        !st?.currentActivity;

      if(!cleared) return false;

      const sequence=learn.trace
        .filter(x =>
          x &&
          x.method!=='GET' &&
          x.status>=200 &&
          x.status<300 &&
          x.response?.success!==false
        )
        .map(x => ({
          method:String(x.method||'POST').toUpperCase(),
          path:String(x.path||''),
          body:x.body??null,
          observedResponse:x.response||{}
        }));

      if(!sequence.length){
        learn.armed=false;
        learn.status='BRAK POST-ów DO NAUKI';
        state.localAI.worldActionGate='NAUKA: BRAK NATYWNEJ SEKWENCJI';
        render();
        return false;
      }

      let safe=true;
      let unsafeReason='';
      for(const step of sequence){
        if(step.path.includes('/complete-now')){
          const cost=Number(step.observedResponse?.premiumCost);
          if(!Number.isFinite(cost) || cost!==0){
            safe=false;
            unsafeReason=`complete-now miał koszt premium ${step.observedResponse?.premiumCost ?? '?'}`;
            break;
          }
        }
      }

      menelCloseLearned={
        version:1,
        learnedAt:Date.now(),
        safe,
        unsafeReason,
        sequence
      };
      saveJSON(K.menelCloseLearned,menelCloseLearned);

      learn.armed=false;
      learn.status=safe
        ? `NAUCZONY • ${sequence.length} kroków • BEZ PREMIUM`
        : `NAUCZONY, ALE ZABLOKOWANY • ${unsafeReason}`;
      learn.lastCapture=menelCloseLearned;

      state.localAI.worldActionGate=safe
        ? 'MENELMODE: SEKWENCJA NAUCZONA'
        : 'MENELMODE: SEKWENCJA NIEBEZPIECZNA';
      state.localAI.worldActionGateAt=Date.now();
      state.localAI.worldNextAt=0;
      state.localAI.nextAt=Date.now()+1500;

      autoLogMsg(
        safe?'info':'warn',
        safe
          ? `MenelMode: nauczyłem się ręcznej sekwencji zamknięcia (${sequence.length} kroków).`
          : `MenelMode: wykryłem sekwencję, ale nie włączę jej automatycznie: ${unsafeReason}.`
      );

      render();
      return true;
    }catch(e){
      learn.status=`SPRAWDZAM… ${String(e?.message||e)}`;
      return false;
    }
  }

  function recordNativeMenelLearn({method,url,body,status,response}){
    const learn=state.localAI.menelLearn;
    if(!learn?.armed) return;
    if(Date.now()>Number(learn.until||0)) return;

    const step={
      at:Date.now(),
      method:String(method||'GET').toUpperCase(),
      path:normalizeMenelLearnPath(url),
      body:parseMenelLearnBody(body),
      status:Number(status||0),
      response:summarizeMenelLearnResponse(response)
    };

    learn.trace.push(step);
    if(learn.trace.length>12) learn.trace=learn.trace.slice(-12);
    learn.lastCapture=step;
    learn.status=`PRZECHWYCONO: ${step.method} ${step.path}`;
    render();

    setTimeout(()=>localAiTryFinalizeMenelLearning(),700);
    setTimeout(()=>localAiTryFinalizeMenelLearning(),1600);
  }

  function startMenelCloseLearning(){
    const learn=state.localAI.menelLearn;
    learn.armed=true;
    learn.until=Date.now()+45000;
    learn.trace=[];
    learn.lastCapture=null;
    learn.status='CZEKAM — ZAMKNIJ WYNIK RĘCZNIE';
    state.localAI.worldActionGate='NAUKA MENELMODE: ZAMKNIJ RĘCZNIE';
    state.localAI.worldActionGateAt=Date.now();
    state.localAI.nextAt=Date.now()+45000;

    autoLogMsg(
      'warn',
      'NAUKA MenelMode: przez 45 s nie wykonuję akcji świata. Otwórz wynik MenelMode i kliknij ręcznie „Zamknij”.'
    );
    render();

    alert(
      'NAUKA MENELMODE WŁĄCZONA\\n\\n' +
      'Masz 45 sekund.\\n' +
      'Teraz w grze otwórz gotowy wynik MenelMode i kliknij ręcznie „Zamknij”.\\n\\n' +
      'Pomagier zapisze TYLKO metodę/ścieżkę/body requestów MenelMode. ' +
      'Nie zapisuje cookies, Authorization ani danych logowania.'
    );
  }

  function isMelinaAddNativeUrl(url){
    try{
      const u=new URL(url,location.href);
      if(!/^\/api\/character\/\d+\/melina-storage(?:\/[^?]*)?$/.test(u.pathname)) return false;
      if(u.pathname.endsWith('/remove')) return false;
      return true;
    }catch{
      return false;
    }
  }

  function normalizeMelinaLearnPath(url,body){
    try{
      const u=new URL(url,location.href);
      const id=Number(settings.characterId);
      let path=(u.pathname+u.search).replace(
        new RegExp(`/api/character/${id}/`),
        '/api/character/{id}/'
      );

      const invId=Number(body?.inventoryId||body?.inventory_id||0);
      if(invId){
        path=path.replace(new RegExp(`/${invId}(?=/|\\?|$)`), '/{inventoryId}');
      }
      return path;
    }catch{
      return String(url||'');
    }
  }

  function templateMelinaBody(raw){
    const body=parseMenelLearnBody(raw);
    if(!body || typeof body!=='object') return body;

    const walk=(value,key='')=>{
      if(Array.isArray(value)) return value.map(v=>walk(v,key));
      if(value && typeof value==='object'){
        const out={};
        for(const [k,v] of Object.entries(value)){
          if(/inventory.?id/i.test(k)) out[k]='{inventoryId}';
          else out[k]=walk(v,k);
        }
        return out;
      }
      return value;
    };

    return walk(body);
  }

  function recordNativeMelinaLearn({method,url,body,status,response}){
    const learn=state.localAI.melinaLearn;
    if(!learn?.armed) return;
    if(Date.now()>Number(learn.until||0)) return;

    const parsedBody=parseMenelLearnBody(body);
    const methodUp=String(method||'GET').toUpperCase();

    if(methodUp==='GET') return;
    if(!isMelinaAddNativeUrl(url)) return;
    if(Number(status||0)<200 || Number(status||0)>=300) return;
    if(response?.success===false) return;

    const path=normalizeMelinaLearnPath(url,parsedBody);
    const templated=templateMelinaBody(body);

    const bodyText=JSON.stringify(templated||{});
    if(!/inventory.?id/i.test(bodyText) && !path.includes('{inventoryId}')){
      learn.status='PRZECHWYCONO, ALE BRAK inventoryId — spróbuj innym przyciskiem';
      render();
      return;
    }

    melinaAddLearned={
      version:1,
      learnedAt:Date.now(),
      safe:true,
      method:methodUp,
      path,
      body:templated,
      observedResponse:{
        success:response?.success,
        message:response?.message
      }
    };

    saveJSON(K.melinaAddLearned,melinaAddLearned);

    learn.armed=false;
    learn.lastCapture=melinaAddLearned;
    learn.status=`NAUCZONY • ${methodUp} ${path}`;

    state.localAI.worldActionGate='RUPIECIARNIA: SEKWENCJA NAUCZONA';
    state.localAI.worldActionGateAt=Date.now();
    state.localAI.nextAt=Date.now()+1200;

    autoLogMsg('info',`RUPIECIARNIA: nauczono przenoszenia (${methodUp} ${path}).`);
    render();
  }

  function startMelinaAddLearning(){
    const learn=state.localAI.melinaLearn;
    learn.armed=true;
    learn.until=Date.now()+45000;
    learn.lastCapture=null;
    learn.status='CZEKAM — PRZENIEŚ 1 PRZEDMIOT RĘCZNIE';

    state.localAI.worldActionGate='NAUKA RUPIECIARNI: PRZENIEŚ 1 PRZEDMIOT';
    state.localAI.worldActionGateAt=Date.now();
    state.localAI.nextAt=Date.now()+45000;

    autoLogMsg(
      'warn',
      'NAUKA rupieciarni: przez 45 s akcje świata czekają. Przenieś ręcznie jeden przedmiot z plecaka do rupieciarni.'
    );

    render();

    alert(
      'NAUKA RUPIECIARNI WŁĄCZONA\\n\\n' +
      'Masz 45 sekund.\\n' +
      'Przenieś ręcznie JEDEN przedmiot z plecaka do rupieciarni.\\n\\n' +
      'Pomagier zapisze tylko metodę/ścieżkę/body tej konkretnej operacji. ' +
      'Nie zapisuje cookies, Authorization ani hasła.'
    );
  }

  function endpointLabelFromPath(path) {
    path = String(path || '');
    if (/\/api\/bazaar\/\d+\/index(?:\?|$)/.test(path)) return 'bazar';
    if (/\/api\/workshop\/\d+\/crafting-recipes(?:\?|$)/.test(path)) return 'receptury';
    if (/\/api\/workshop\/\d+\/queue(?:\?|$)/.test(path)) return 'kolejka';
    if (/\/api\/workshop\/\d+\/upgrades(?:\?|$)/.test(path)) return 'upgrades';
    if (/\/api\/bazaar\/\d+\/item\/\d+(?:\?|$)/.test(path)) return 'bazar-item';
    if (/\/api\/workshop\/\d+\/dismantlable(?:\?|$)/.test(path)) return 'dismantlable';
    if (/\/api\/bazaar\/\d+\/queue\/\d+\/\d+(?:\?|$)/.test(path)) return 'orderbook';
    return null;
  }

  function isInterestingNativeUrl(url) {
    try {
      const u = new URL(url, location.href);
      return !!endpointLabelFromPath(u.pathname + u.search);
    } catch {
      return false;
    }
  }


  // =========================
  // PvP LAB v8.8.4 META — REALNE PvP 1:1 (PRESTIŻ + ATAKI/OBRONY), Arena=0
  // =========================
  function pvpLabUrl(url){
    try{ return new URL(String(url||''),location.href); }catch{return null;}
  }

  function isSameOriginApiUrl(url){
    const u=pvpLabUrl(url);
    return !!(u && u.origin===location.origin && u.pathname.startsWith('/api/'));
  }

  function pvpLabApiKind(url){
    const u=pvpLabUrl(url); if(!u || u.origin!==location.origin) return null;
    const p=u.pathname;
    if(/\/api\/duels\/\d+\/status$/.test(p)) return 'duel_status';
    if(/\/api\/duels\/\d+\/roll-opponents$/.test(p)) return 'duel_roll';
    if(/\/api\/duels\/\d+\/fight$/.test(p)) return 'duel_fight';
    if(/\/api\/combat\/\d+\/history$/.test(p)) return 'combat_history';
    if(/\/api\/combat\/\d+\/attack\/\d+$/.test(p)) return 'normal_fight';
    if(/\/api\/pvp\/\d+\/battle-history$/.test(p)) return 'pvp_battle_history';
    if(/\/api\/pvp\/battle\//.test(p)) return 'battle_detail';
    if(/\/api\/pvp\/\d+\/attributes$/.test(p)) return 'pvp_attributes';
    if(/\/api\/pvp\/\d+\/summary$/.test(p)) return 'pvp_summary';
    if(/\/api\/pvp\/\d+\/build$/.test(p)) return 'pvp_build';
    if(/\/api\/pvp\/\d+\/skill-tree\/(?:str|end|agi|vit|prc)$/.test(p)) return 'pvp_skill_tree';
    if(/\/api\/pvp\/\d+\/apply-build$/.test(p)) return 'pvp_apply_build';
    if(/\/api\/pvp\/\d+\/(?:reset-attributes|free-reset-attributes|paid-reset-attributes)$/.test(p)) return 'pvp_reset';
    if(/\/api\/pvp\/\d+\/(?:upgrade-attribute|choose-skill)$/.test(p)) return 'pvp_mutation';
    return null;
  }

  function pvpLabOwnId(){ return Number(settings.characterId||0); }
  function pvpLabNum(v, fallback=null){ const n=Number(v); return Number.isFinite(n)?n:fallback; }
  function pvpLabClamp(v,a,b){ return Math.max(a,Math.min(b,Number(v)||0)); }
  function pvpLabMedian(arr, fallback=null){
    const a=(arr||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);
    if(!a.length) return fallback;
    const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2;
  }
  function pvpLabWeightedMedian(items, fallback=null){
    const a=(items||[])
      .map(x=>({v:Number(x?.value ?? x?.v),w:Math.max(0,Number(x?.weight ?? x?.w ?? 0))}))
      .filter(x=>Number.isFinite(x.v) && Number.isFinite(x.w) && x.w>0)
      .sort((x,y)=>x.v-y.v);
    if(!a.length) return fallback;
    const total=a.reduce((n,x)=>n+x.w,0);
    if(!(total>0)) return fallback;
    let acc=0;
    for(const x of a){ acc+=x.w; if(acc>=total/2) return x.v; }
    return a[a.length-1].v;
  }
  function pvpLabParseServerTime(v){
    if(v==null || v==='') return Date.now();
    if(typeof v==='number' || /^\d{10,13}$/.test(String(v))){
      const n=Number(v); return n<1e12?n*1000:n;
    }
    let x=String(v).trim();
    // Backend historii zwraca UTC bez sufiksu. Bez Z przeglądarka traktowała to jako czas lokalny (v8.8.0: przesunięcie ~2 h).
    if(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(x)) x=x.replace(' ','T')+'Z';
    const t=Date.parse(x); return Number.isFinite(t)?t:Date.now();
  }
  function pvpLabIsUnknownBuildKey(k){ return !k || String(k).includes('?/?/?/?/?') || String(k).includes('skills?'); }
  function pvpLabIsExpiredError(e){ return /(?:HTTP\s*404|wygasły|wygasl|replay.*ograniczony|nie został znaleziony)/i.test(String(e?.message||e||'')); }

  function pvpLabAttrs(raw){
    if(!raw || typeof raw!=='object') return null;
    const src=raw.attributes || raw.pvpAttributes || raw;
    const get=(...keys)=>{
      for(const k of keys){
        const v=src?.[k];
        if(v && typeof v==='object' && v.level!=null) return pvpLabNum(v.level,0);
        if(v!=null && Number.isFinite(Number(v))) return Number(v);
      }
      return 0;
    };
    const out={str:get('str'),end:get('end','endurance'),agi:get('agi'),vit:get('vit'),prc:get('prc')};
    return Object.values(out).some(x=>x>0)?out:null;
  }

  const PVP_FIGHTER_STAT_KEYS=[
    'attack','defense','baseAttack','baseDefense','baseHp','maxHp','startHp','finalHp','endHp',
    'critChance','critDamage','executeThreshold','evasion','evasionDR','accuracy','lifesteal','armorPen',
    'doubleStrike','counterAttack','damageTakenMult','damageTakenReduction','hpRegen','healingReduction',
    'bleedResist','stunResist','initiative','critResist','firstStrikeBonus','stunChance','bleedChance','bleedDamage'
  ];

  function pvpLabFighter(raw){
    if(!raw || typeof raw!=='object') return null;
    const f={
      id:pvpLabNum(raw.id ?? raw.characterId ?? raw.character_id,0),
      nickname:String(raw.nickname ?? raw.name ?? ''),
      level:pvpLabNum(raw.level,null),
      attributes:pvpLabAttrs(raw)
    };
    for(const k of PVP_FIGHTER_STAT_KEYS){
      let v=raw[k];
      if(k==='finalHp' && v==null) v=raw.endHp;
      if(k==='startHp' && v==null) v=raw.maxHp;
      if(v!=null && Number.isFinite(Number(v))) f[k]=Number(v);
    }
    if(f.maxHp==null && raw.hp!=null) f.maxHp=pvpLabNum(raw.hp,null);
    if(f.finalHp==null && raw.hpAfter!=null) f.finalHp=pvpLabNum(raw.hpAfter,null);
    if(raw.skillBonusPercent && typeof raw.skillBonusPercent==='object') f.skillBonusPercent={...raw.skillBonusPercent};
    const skills=Array.isArray(raw.pvpSkills)?raw.pvpSkills:Array.isArray(raw.skills)?raw.skills:[];
    if(skills.length){
      f.pvpSkills=skills.map(x=>({
        id:pvpLabNum(x?.id,null),name:String(x?.name||''),attribute:String(x?.attribute||''),
        tier:pvpLabNum(x?.tier,null),option:String(x?.option||''),bonuses:x?.bonuses&&typeof x.bonuses==='object'?{...x.bonuses}:undefined
      })).filter(x=>x.name);
    }
    return f;
  }

  function pvpLabBattleShape(raw){
    if(!raw || typeof raw!=='object') return null;
    if(raw.battleData && typeof raw.battleData==='object') raw=raw.battleData;
    let a=raw.attacker, d=raw.defender;
    if(!a && raw.fighter1) a=raw.fighter1;
    if(!d && raw.fighter2) d=raw.fighter2;
    if(!a || !d) return null;
    const attacker=pvpLabFighter(a), defender=pvpLabFighter(d);
    let winner=String(raw.winner||'');
    if(!winner && raw.winnerId!=null) winner=Number(raw.winnerId)===Number(attacker?.id)?'attacker':Number(raw.winnerId)===Number(defender?.id)?'defender':'draw';
    if(!winner || !['attacker','defender','draw'].includes(winner)){
      const ah=pvpLabNum(attacker?.finalHp ?? a?.endHp,null), dh=pvpLabNum(defender?.finalHp ?? d?.endHp,null);
      winner=ah>0 && dh===0?'attacker':dh>0 && ah===0?'defender':'draw';
    }
    return {battleId:String(raw.battleId||raw.id||''),winner,totalTurns:pvpLabNum(raw.totalTurns ?? raw.turns,null),attacker,defender,events:Array.isArray(raw.events)?raw.events:[],engine:String(raw.engine||''),exhaustion:!!(raw.exhaustion ?? raw.fatiguedSide)};
  }

  function pvpLabSide(shape){
    const me=pvpLabOwnId();
    if(Number(shape?.attacker?.id)===me) return 'attacker';
    if(Number(shape?.defender?.id)===me) return 'defender';
    return null;
  }

  function pvpLabEventSummary(events, meSide){
    const out={
      attacks:0,hits:0,enemyAttacks:0,enemyHits:0,crits:0,enemyCrits:0,damageDealt:0,damageTaken:0,evades:0,misses:0,
      doubles:0,enemyDoubles:0,counters:0,enemyCounters:0,counterDamage:0,stunsGiven:0,stunsTaken:0,
      bleedApplied:0,bleedResisted:0,enemyBleedApplied:0,enemyBleedResisted:0,bleedDamageDealt:0,bleedDamageTaken:0,
      regen:0,enemyRegen:0,lifesteal:0,enemyLifesteal:0,executes:0,executedByEnemy:0,firstStrike:0,enemyFirstStrike:0,momentumMax:0,enemyMomentumMax:0
    };
    if(!meSide) return out;
    const other=meSide==='attacker'?'defender':'attacker';
    for(const e of (events||[])){
      const type=String(e?.type||''), actor=String(e?.actor||''), target=String(e?.target||'');
      const dmg=Math.max(0,Number(e?.damage ?? e?.bleedDamage ?? 0)||0), amount=Math.max(0,Number(e?.amount ?? e?.healAmount ?? e?.lifestealAmount ?? 0)||0);
      if(type==='attack'){
        if(actor===meSide){ out.attacks++; out.hits++; out.damageDealt+=dmg; if(e?.isCrit) out.crits++; }
        else if(actor===other){ out.enemyAttacks++; out.enemyHits++; out.damageTaken+=dmg; if(e?.isCrit) out.enemyCrits++; }
      }else if(type==='evade'){
        // actor = unikający; atak wykonała druga strona.
        if(actor===meSide){ out.evades++; out.enemyAttacks++; }
        else if(actor===other){ out.misses++; out.attacks++; }
      }else if(type==='double_strike'){
        if(actor===meSide) out.doubles++; else if(actor===other) out.enemyDoubles++;
      }else if(type==='counter_attack_trigger'){
        if(actor===meSide) out.counters++; else if(actor===other) out.enemyCounters++;
      }else if(type==='counter_attack_damage'){
        if(actor===meSide){ out.counterDamage+=dmg; out.damageDealt+=dmg; }
        else if(actor===other) out.damageTaken+=dmg;
      }else if(type==='stun_apply'){
        const t=target || (actor==='attacker'?'defender':'attacker');
        if(t===other) out.stunsGiven++; else if(t===meSide) out.stunsTaken++;
      }else if(type==='bleed_apply'){
        const t=target || (actor==='attacker'?'defender':'attacker');
        if(actor===meSide){ if(e?.resisted) out.bleedResisted++; else out.bleedApplied++; }
        else if(actor===other){ if(e?.resisted) out.enemyBleedResisted++; else out.enemyBleedApplied++; }
      }else if(type==='bleed_tick'){
        const t=actor || target;
        if(t===other){ out.bleedDamageDealt+=dmg; out.damageDealt+=dmg; }
        else if(t===meSide){ out.bleedDamageTaken+=dmg; out.damageTaken+=dmg; }
      }else if(type==='regen' || type==='low_hp_regen'){
        if(actor===meSide) out.regen+=amount; else if(actor===other) out.enemyRegen+=amount;
      }else if(type==='lifesteal'){
        if(actor===meSide) out.lifesteal+=amount; else if(actor===other) out.enemyLifesteal+=amount;
      }else if(type==='execute'){
        if(actor===meSide) out.executes++; else if(actor===other) out.executedByEnemy++;
      }else if(type==='first_strike'){
        if(actor===meSide) out.firstStrike=Math.max(out.firstStrike,Number(e?.bonus||0)); else if(actor===other) out.enemyFirstStrike=Math.max(out.enemyFirstStrike,Number(e?.bonus||0));
      }else if(type==='momentum'){
        if(actor===meSide) out.momentumMax=Math.max(out.momentumMax,Number(e?.bonus||0)); else if(actor===other) out.enemyMomentumMax=Math.max(out.enemyMomentumMax,Number(e?.bonus||0));
      }
    }
    return out;
  }

  function pvpLabObservedStats(events, meSide){
    if(!meSide) return {me:{},opponent:{},samples:0};
    const other=meSide==='attacker'?'defender':'attacker';
    const bag={attacker:{},defender:{}};
    const add=(side,key,v)=>{ const n=Number(v); if(!['attacker','defender'].includes(side)||!Number.isFinite(n)) return; (bag[side][key] ||= []).push(n); };
    for(const e of (events||[])){
      const type=String(e?.type||''), actor=String(e?.actor||''), target=String(e?.target||'');
      const opposite=actor==='attacker'?'defender':actor==='defender'?'attacker':'';
      if(type==='battle_start'){
        add('attacker','initiative',e?.attackerInitiative); add('defender','initiative',e?.defenderInitiative);
      }else if(type==='evade'){
        add(actor,'evasion',e?.evasion); add(opposite,'accuracy',e?.accuracy); add(opposite,'hitChance',e?.hitChance);
      }else if(type==='double_strike') add(actor,'doubleStrike',e?.chance);
      else if(type==='counter_attack_trigger') add(actor,'counterAttack',e?.chance);
      else if(type==='first_strike') add(actor,'firstStrikeBonus',e?.bonus);
      else if(type==='execute') add(actor,'executeThreshold',e?.threshold);
      else if(type==='regen' || type==='low_hp_regen') add(actor,'hpRegen',e?.amount);
      else if(type==='lifesteal'){
        add(opposite,'healingReduction',e?.reducedBy);
      }else if(type==='bleed_apply'){
        if(e?.chance!=null) add(actor,'bleedChance',e?.chance);
        const t=target || opposite; if(e?.resist!=null) add(t,'bleedResist',e?.resist);
      }else if(type==='stun_apply'){
        if(e?.chance!=null) add(actor,'stunChance',e?.chance);
        const t=target || opposite; if(e?.resist!=null) add(t,'stunResist',e?.resist);
      }else if(type==='hp_update'){
        add('attacker','maxHp',e?.attackerMaxHp); add('defender','maxHp',e?.defenderMaxHp);
      }
    }
    const collapse=side=>{
      const o={}; for(const [k,v] of Object.entries(bag[side])){ const m=pvpLabMedian(v,null); if(m!=null) o[k]=m; }
      return o;
    };
    const me=collapse(meSide), opponent=collapse(other);
    return {me,opponent,samples:Object.values(bag.attacker).reduce((n,a)=>n+a.length,0)+Object.values(bag.defender).reduce((n,a)=>n+a.length,0)};
  }

  function pvpLabBuildKey(fighter, exactBuild=''){
    if(exactBuild) return `code:${String(exactBuild).trim()}`;
    const a=fighter?.attributes, hasAttrs=!!a;
    const attr=hasAttrs?`${a.str||0}/${a.end||0}/${a.agi||0}/${a.vit||0}/${a.prc||0}`:'?/?/?/?/?';
    const skills=(fighter?.pvpSkills||[]).slice().sort((x,y)=>String(x.attribute).localeCompare(String(y.attribute))||Number(x.tier||0)-Number(y.tier||0)).map(x=>`${x.attribute}${x.tier}:${x.option||x.name}`).join('|');
    if(hasAttrs || skills) return `${attr}:${skills||'skills?'}`;
    return `${attr}:skills?`;
  }
  function pvpLabBuildLabel(rec){ if(rec?.buildCode) return rec.buildCode; const a=rec?.me?.attributes; return a?`${a.str||0}/${a.end||0}/${a.agi||0}/${a.vit||0}/${a.prc||0}`:'build nieznany'; }
  function pvpLabHpPct(f){ const max=Number(f?.maxHp||0), fin=Number(f?.finalHp ?? f?.endHp ?? 0); return max>0?Math.max(0,Math.min(100,fin/max*100)):null; }
  function pvpLabArchetype(f,obs={}){
    const ev=Number(f?.evasion ?? obs?.evasion ?? 0), def=Number(f?.defense||0), hp=Number(f?.maxHp ?? obs?.maxHp ?? 0), atk=Number(f?.attack||0), pen=Number(f?.armorPen ?? obs?.armorPen ?? 0), acc=Number(f?.accuracy ?? obs?.accuracy ?? 0);
    if(ev>=38 || (f?.attributes?.agi||0)>=35) return 'UNIK';
    if(def>=1050 || hp>=3000 || Number(f?.damageTakenMult||100)<=50) return 'TANK';
    if(atk>=850 || pen>=42) return 'DMG';
    if(acc>=120 || (f?.attributes?.prc||0)>=30) return 'PRC';
    return 'MIX';
  }

  function pvpLabFind(id){ return pvpLab.battles.find(x=>String(x.battleId)===String(id)); }
  function pvpLabMergeFighter(oldF,newF){
    if(!oldF) return newF; if(!newF) return oldF;
    const out={...oldF,...newF};
    if(oldF.attributes && !newF.attributes) out.attributes=oldF.attributes;
    if(oldF.pvpSkills?.length && !newF.pvpSkills?.length) out.pvpSkills=oldF.pvpSkills;
    if(oldF.skillBonusPercent && !newF.skillBonusPercent) out.skillBonusPercent=oldF.skillBonusPercent;
    return out;
  }
  function pvpLabUpsert(rec){
    if(!rec?.battleId) return null;
    const id=String(rec.battleId); let row=pvpLabFind(id);
    if(!row){ row={battleId:id,capturedAt:Date.now()}; pvpLab.battles.push(row); }
    const old={...row}, oldMe=row.me, oldOpp=row.opponent;
    Object.assign(row,rec);
    row.me=pvpLabMergeFighter(oldMe,rec.me);
    row.opponent=pvpLabMergeFighter(oldOpp,rec.opponent);
    if(!rec.buildCode && old.buildCode) row.buildCode=old.buildCode;
    if(!rec.buildKey && old.buildKey) row.buildKey=old.buildKey;
    row.detailLoaded=!!(old.detailLoaded || rec.detailLoaded || (row.eventSummary && row.totalTurns!=null && row.me && row.opponent));
    if(row.detailLoaded){ row.detailExpired=false; row.detailState='loaded'; }
    else if(old.detailExpired || rec.detailExpired){ row.detailExpired=true; row.detailState='expired'; }
    else row.detailState='missing';
    row.capturedAt=Number(old.capturedAt||rec.capturedAt||Date.now());
    if(row.me && (!row.buildKey || pvpLabIsUnknownBuildKey(row.buildKey)) && row.buildCode) row.buildKey=pvpLabBuildKey(row.me,row.buildCode);
    if(row.opponent) row.opponentArchetype=pvpLabArchetype(row.opponent,row.opponentObserved||{});
    pvpLabSave(); return row;
  }

  function pvpLabCurrentBuild(){ return String(pvpLab.current?.build||'').trim(); }
  function pvpLabRememberDefenseSnapshot(at=Date.now(),reason='attack'){
    const build=pvpLabCurrentBuild(); if(!build) return;
    const last=pvpLab.defenseSnapshots[pvpLab.defenseSnapshots.length-1];
    if(last && last.build===build && Math.abs(Number(last.at||0)-Number(at||0))<60000) return;
    pvpLab.defenseSnapshots.push({at:Number(at||Date.now()),build,reason:String(reason||'attack')});
  }
  function pvpLabBuildAt(ts){
    const t=Number(ts||0); let best=null;
    for(const x of pvpLab.defenseSnapshots){ if(Number(x.at||0)<=t && (!best || Number(x.at)>Number(best.at))) best=x; }
    return best?.build||'';
  }

  function pvpLabMetaRecord(meta={}){
    const id=String(meta.battleId||''); if(!id) return null;
    const old=pvpLabFind(id)||{};
    const createdAt=pvpLabParseServerTime(meta.createdAt ?? old.createdAt ?? Date.now());
    let buildCode=meta.buildCode?String(meta.buildCode).trim():String(old.buildCode||'');
    if(!buildCode && meta.direction==='defense') buildCode=pvpLabBuildAt(createdAt);
    return pvpLabUpsert({
      battleId:id,source:(meta.source && meta.source!=='unknown')?meta.source:(old.source||meta.source||'unknown'),direction:(meta.direction && meta.direction!=='unknown')?meta.direction:(old.direction||meta.direction||'unknown'),
      won:typeof meta.won==='boolean'?meta.won:old.won,createdAt,
      prestigeChange:pvpLabNum(meta.prestigeChange ?? old.prestigeChange,null),xpGained:pvpLabNum(meta.xpGained ?? old.xpGained,null),
      opponent:meta.opponent?{id:pvpLabNum(meta.opponent.id ?? meta.opponent.characterId,0),nickname:String(meta.opponent.nickname||meta.opponent.name||''),level:pvpLabNum(meta.opponent.level,null)}:undefined,
      buildCode:buildCode||undefined,buildKey:buildCode?`code:${buildCode}`:old.buildKey,detailLoaded:!!old.detailLoaded,detailExpired:!!old.detailExpired
    });
  }

  function pvpLabIngestDuelStatus(data){
    if(!data || typeof data!=='object') return;
    for(const [key,direction] of [['attackHistory','attack'],['defenseHistory','defense']]){
      for(const x of (Array.isArray(data[key])?data[key]:[])) pvpLabMetaRecord({battleId:x.battleId,source:'prestige',direction,won:!!x.won,createdAt:x.createdAt,prestigeChange:x.prestigeChange,xpGained:x.xpGained,opponent:x.opponent||{},buildCode:direction==='attack'?'':undefined});
    }
  }
  function pvpLabIngestCombatHistory(data){
    const list=Array.isArray(data?.history)?data.history:Array.isArray(data)?data:[];
    for(const x of list){ if(x?.battleId) pvpLabMetaRecord({battleId:x.battleId,source:'normal',direction:x.wasAttacker===false?'defense':'attack',won:!!x.won,createdAt:x.createdAt,opponent:{id:x.opponentId,nickname:x.opponentNickname,level:x.opponentLevel}}); }
  }
  function pvpLabIngestBattleHistory(data){
    const list=Array.isArray(data?.history)?data.history:Array.isArray(data?.battles)?data.battles:Array.isArray(data)?data:[];
    for(const x of list){
      if(!x?.battleId && !x?.id) continue;
      const direction=x.direction || (x.wasAttacker===false?'defense':x.wasAttacker===true?'attack':'unknown');
      const source=x.source||x.type||'unknown';
      pvpLabMetaRecord({battleId:x.battleId||x.id,source:/duel|prestige/i.test(source)?'prestige':/arena/i.test(source)?'arena':/normal|combat/i.test(source)?'normal':'unknown',direction,won:typeof x.won==='boolean'?x.won:undefined,createdAt:x.createdAt||x.date,prestigeChange:x.prestigeChange,opponent:x.opponent||{id:x.opponentId,nickname:x.opponentNickname,level:x.opponentLevel}});
    }
  }

  function pvpLabRecordBattle(raw, meta={}){
    const shape=pvpLabBattleShape(raw); if(!shape) return null;
    const meSide=pvpLabSide(shape); if(!meSide) return null;
    const me=meSide==='attacker'?shape.attacker:shape.defender, opponent=meSide==='attacker'?shape.defender:shape.attacker;
    const winner=shape.winner, won=winner==='draw'?null:winner===meSide, old=pvpLabFind(shape.battleId)||{};
    const source=meta.source||old.source||(shape.engine==='v4'?'arena_test':'unknown');
    const direction=meta.direction||old.direction||(source.startsWith('arena')?'arena':meSide==='attacker'?'attack':'defense');
    let exactBuild=String(meta.buildCode||old.buildCode||'').trim();
    const createdAt=Number(old.createdAt||meta.createdAt||Date.now());
    if(!exactBuild && direction==='defense') exactBuild=pvpLabBuildAt(createdAt);
    const observed=pvpLabObservedStats(shape.events,meSide);
    const rec={battleId:shape.battleId,source,direction,engine:shape.engine||old.engine||'',won,winner,totalTurns:shape.totalTurns,createdAt,
      prestigeChange:pvpLabNum(meta.prestigeChange ?? old.prestigeChange,null),xpGained:pvpLabNum(meta.xpGained ?? old.xpGained,null),
      me,opponent,meObserved:observed.me,opponentObserved:observed.opponent,observationSamples:observed.samples,
      meHpPct:pvpLabHpPct(me),opponentHpPct:pvpLabHpPct(opponent),eventSummary:pvpLabEventSummary(shape.events,meSide),
      buildCode:exactBuild||undefined,detailLoaded:true,detailExpired:false,detailLoadedAt:Date.now(),exhaustion:shape.exhaustion,capturedAt:Number(old.capturedAt||Date.now())};
    rec.buildKey=exactBuild?`code:${exactBuild}`:pvpLabBuildKey(me,'');
    rec.opponentArchetype=pvpLabArchetype(opponent,observed.opponent);
    return pvpLabUpsert(rec);
  }

  function pvpLabSetCurrent(kind,data){
    const now=Date.now();
    if(kind==='pvp_attributes'){ pvpLab.current.attributes=data?.attributes||data||null; pvpLab.current.attributesAt=now; }
    else if(kind==='pvp_summary'){ pvpLab.current.summary=data||null; pvpLab.current.summaryAt=now; }
    else if(kind==='pvp_build'){ const b=String(data?.build||'').trim(); if(b) pvpLab.current.build=b; pvpLab.current.buildAt=now; }
    pvpLabSave();
  }
  function pvpLabStoreSkillTree(attr,data){
    if(!['str','end','agi','vit','prc'].includes(attr) || !data || typeof data!=='object') return;
    pvpLab.skillTrees[attr]=data; pvpLab.skillTreesAt[attr]=Date.now(); pvpLabSave();
  }
  function pvpLabRecordError(where,e){
    const msg=String(e?.message||e||'');
    const last=pvpLab.errors[pvpLab.errors.length-1];
    if(last && last.where===String(where||'') && last.error===msg && Date.now()-Number(last.at||0)<3600000) return;
    pvpLab.errors.push({at:Date.now(),where:String(where||''),error:msg}); pvpLabSave();
  }
  function pvpLabParseRequestBody(raw){ if(raw==null) return null; if(typeof raw==='object' && !(raw instanceof String)) return raw; try{return JSON.parse(String(raw));}catch{return null;} }

  function pvpLabObserveApi(url,data,meta={}){
    if(!pvpLabCfg.enabled || !pvpLabCfg.passiveCapture) return;
    const kind=pvpLabApiKind(url); if(!kind) return;
    try{
      if(kind==='pvp_attributes' || kind==='pvp_summary' || kind==='pvp_build'){ pvpLabSetCurrent(kind,data); return; }
      if(kind==='pvp_skill_tree'){ const m=pvpLabUrl(url)?.pathname.match(/skill-tree\/(str|end|agi|vit|prc)$/); if(m) pvpLabStoreSkillTree(m[1],data); return; }
      if(kind==='pvp_apply_build'){
        const body=pvpLabParseRequestBody(meta.requestBody); if(body?.build){ pvpLab.current.build=String(body.build).trim(); pvpLab.current.buildAt=Date.now(); }
        pvpLabSave(); return;
      }
      if(kind==='pvp_reset' || kind==='pvp_mutation'){ pvpLab.current.build=''; pvpLab.current.buildAt=Date.now(); pvpLabSave(); return; }
      if(kind==='duel_status'){ pvpLabIngestDuelStatus(data); return; }
      if(kind==='combat_history'){ pvpLabIngestCombatHistory(data); return; }
      if(kind==='pvp_battle_history'){ pvpLabIngestBattleHistory(data); return; }
      if(kind==='duel_roll'){
        const opponents=Array.isArray(data?.opponents)?data.opponents:[];
        pvpLab.opponentRolls.push({at:Date.now(),opponents:opponents.map(x=>({id:x.id,nickname:x.nickname,level:x.level,prestige:x.prestige,expectedGain:x.expectedGain,expectedLoss:x.expectedLoss}))}); pvpLabSave(); return;
      }
      if(kind==='duel_fight'){
        pvpLabRememberDefenseSnapshot(Date.now(),'prestige_attack');
        const opp=data?.opponent||{};
        pvpLabMetaRecord({battleId:data?.battleId,source:'prestige',direction:'attack',won:!!data?.won,prestigeChange:data?.prestigeChange,xpGained:data?.xpGained,opponent:opp,buildCode:pvpLabCurrentBuild()});
        if(data?.attacker && data?.defender) pvpLabRecordBattle(data,{source:'prestige',direction:'attack',buildCode:pvpLabCurrentBuild(),prestigeChange:data?.prestigeChange,xpGained:data?.xpGained});
        return;
      }
      if(kind==='normal_fight'){
        pvpLabRememberDefenseSnapshot(Date.now(),'normal_attack');
        const u=pvpLabUrl(url), m=u?.pathname.match(/\/attack\/(\d+)$/), oppId=m?Number(m[1]):0;
        pvpLabMetaRecord({battleId:data?.battleId,source:'normal',direction:'attack',won:!!data?.won,opponent:{id:oppId,nickname:data?.opponentNickname||data?.opponent?.nickname||''},buildCode:pvpLabCurrentBuild()});
        if(data?.attacker && data?.defender) pvpLabRecordBattle(data,{source:'normal',direction:'attack',buildCode:pvpLabCurrentBuild()}); return;
      }
      if(kind==='battle_detail'){
        const id=String(data?.battleId||pvpLabUrl(url)?.pathname.split('/').pop()||''), old=pvpLabFind(id)||{};
        pvpLabRecordBattle(data,{source:old.source||'unknown',direction:old.direction||undefined,buildCode:old.buildCode||''});
      }
    }catch(e){ pvpLabRecordError(`observe:${kind}`,e); }
  }

  function pvpLabParseSocketPacket(data){ if(typeof data!=='string' || !data.startsWith('42')) return null; const i=data.indexOf('['); if(i<0) return null; try{return JSON.parse(data.slice(i));}catch{return null;} }
  function pvpLabObserveSocketMessage(data){
    if(!pvpLabCfg.enabled || !pvpLabCfg.passiveCapture) return;
    const pkt=pvpLabParseSocketPacket(data); if(!Array.isArray(pkt) || pkt[0]!=='arena:battle_result') return;
    const battle=pkt?.[1]?.battleData; if(!battle) return;
    const source=(battle?.engine==='v4')?'arena_test':'arena'; if(source==='arena_test' && !pvpLabCfg.includeArenaTest) return;
    pvpLabRecordBattle(battle,{source,direction:'arena',buildCode:pvpLabCurrentBuild()});
  }
  function installPvpLabWebSocketBridge(){
    if(window.__MG_PVP_LAB_WS_V2__ || typeof window.WebSocket!=='function') return;
    window.__MG_PVP_LAB_WS_V2__=true; const Native=window.WebSocket;
    try{ class PvpLabWebSocket extends Native{ constructor(...args){ super(...args); try{ this.addEventListener('message',ev=>{ try{ pvpLabObserveSocketMessage(ev?.data); }catch{} }); }catch{} } } window.WebSocket=PvpLabWebSocket; }
    catch(e){ pvpLabRecordError('websocket_bridge',e); }
  }

  function pvpLabSourceWeight(source){ return Math.max(0,Number(pvpLabCfg.sourceWeights?.[source] ?? PVP_LAB_DEFAULTS.sourceWeights[source] ?? 0)); }
  function pvpLabSourceStats(source){ const rows=pvpLab.battles.filter(x=>x.source===source && typeof x.won==='boolean'); const wins=rows.filter(x=>x.won).length; return {n:rows.length,wins,losses:rows.length-wins,wr:rows.length?wins/rows.length*100:null}; }

  function pvpLabBuildStats(){
    // REALNE PvP 1:1: PRESTIŻ i normalne ATAKI/OBRONY liczą się identycznie. Arena = 0.
    const map=new Map;
    for(const b of pvpLab.battles){
      if(!['prestige','normal'].includes(b.source) || typeof b.won!=='boolean' || pvpLabIsUnknownBuildKey(b.buildKey)) continue;
      let r=map.get(b.buildKey);
      if(!r){
        r={key:b.buildKey,label:pvpLabBuildLabel(b),n:0,wins:0,
          sources:{prestige:{n:0,wins:0},normal:{n:0,wins:0}},
          attackN:0,attackWins:0,defN:0,defWins:0,hpPctSum:0,hpPctN:0,archetypes:{}};
        map.set(b.buildKey,r);
      } else if(b.buildCode) r.label=String(b.buildCode);
      r.n++; if(b.won) r.wins++;
      const src=b.source==='prestige'?'prestige':'normal';
      r.sources[src].n++; if(b.won) r.sources[src].wins++;
      if(b.direction==='defense'){ r.defN++; if(b.won) r.defWins++; } else { r.attackN++; if(b.won) r.attackWins++; }
      if(Number.isFinite(Number(b.meHpPct))){ r.hpPctSum+=Number(b.meHpPct); r.hpPctN++; }
      const a=String(b.opponentArchetype||'MIX'); r.archetypes[a] ||= {n:0,wins:0}; r.archetypes[a].n++; if(b.won) r.archetypes[a].wins++;
    }
    for(const r of map.values()){
      r.wr=r.n?r.wins/r.n*100:0;
      r.weightedN=r.n; r.weightedWins=r.wins; r.weightedWr=r.wr;
      r.prestigeN=r.sources.prestige.n; r.prestigeWins=r.sources.prestige.wins; r.prestigeWr=r.prestigeN?r.prestigeWins/r.prestigeN*100:null;
      r.normalN=r.sources.normal.n; r.normalWins=r.sources.normal.wins; r.normalWr=r.normalN?r.normalWins/r.normalN*100:null;
      // Każda realna walka PvP ma wagę 1. Wygładzony score Bayesa zapobiega dominacji małej próbki.
      r.score=(r.wins+3)/(r.n+6)*100;
      r.avgHpPct=r.hpPctN?r.hpPctSum/r.hpPctN:null;
    }
    return [...map.values()].sort((a,b)=>b.score-a.score || b.n-a.n || b.wr-a.wr);
  }

  function pvpLabRealPvpMeta(){
    // PRESTIŻ i normalne ATAKI/OBRONY są równorzędnymi źródłami: każda walka = waga 1. Arena = 0.
    const prestigeRows=pvpLab.battles.filter(x=>x.source==='prestige' && typeof x.won==='boolean');
    const normalRows=pvpLab.battles.filter(x=>x.source==='normal' && typeof x.won==='boolean');
    const rows=[...prestigeRows,...normalRows];
    const detailed=rows.filter(x=>x.eventSummary && x.totalTurns!=null);
    const currentBuild=pvpLabCurrentBuild();
    const curRows=detailed.filter(x=>x.buildCode===currentBuild || x.buildKey===`code:${currentBuild}`);
    const use=curRows.length>=3?curRows:detailed;
    const sum=k=>use.reduce((n,x)=>n+Number(x.eventSummary?.[k]||0),0);
    const attempts=sum('hits')+sum('misses');
    const hitRate=attempts?sum('hits')/attempts:null;
    const critRate=sum('hits')?sum('crits')/sum('hits'):null;
    const enemyAttempts=sum('enemyAttacks');
    const enemyHitRate=enemyAttempts?sum('enemyHits')/enemyAttempts:null;

    const modelRows=rows.map(x=>({row:x,weight:1,source:x.source}));
    const fieldItems=k=>{
      const out=[];
      for(const m of modelRows){
        const o=m.row?.opponentObserved||{}, f=m.row?.opponent||{};
        let v=o?.[k];
        if(!Number.isFinite(Number(v))) v=f?.[k];
        if(Number.isFinite(Number(v))) out.push({value:Number(v),weight:1});
      }
      return out;
    };
    const wmed=(k,fallback=null)=>pvpLabWeightedMedian(fieldItems(k),fallback);

    const cur=pvpLab.current?.summary?.combinedStats||{};
    const oppHp=wmed('maxHp',null);
    const turns=pvpLabMedian(rows.map(x=>x.totalTurns).filter(Number.isFinite),12);
    const oppEvasion=wmed('evasion',null) ?? (hitRate!=null?Math.max(0,Number(cur.accuracy_percent||105)-hitRate*100):25);
    const oppCritResist=wmed('critResist',null) ?? (critRate!=null?Math.max(0,Number(cur.crit_chance_percent||15)-critRate*100):20);
    const ourEv=Number(cur.evasion_percent||25);
    const oppAccuracy=wmed('accuracy',null) ?? (enemyHitRate!=null?enemyHitRate*100+ourEv:110);
    const wins=rows.filter(x=>x.won).length;
    const prestigeWins=prestigeRows.filter(x=>x.won).length;
    const normalWins=normalRows.filter(x=>x.won).length;
    const fifteen=rows.filter(x=>Number(x.totalTurns)>=15), close15=fifteen.filter(x=>Math.abs(Number(x.meHpPct||0)-Number(x.opponentHpPct||0))<=10).length;
    const normalDetailed=normalRows.filter(x=>x.detailLoaded && (x.eventSummary || x.opponentObserved || x.opponent));
    const normalAttackN=normalRows.filter(x=>x.direction==='attack').length;
    const normalDefenseN=normalRows.filter(x=>x.direction==='defense').length;

    return {
      n:rows.length,detailedN:detailed.length,currentComparableN:use.length,wins,wr:rows.length?wins/rows.length*100:null,
      prestigeN:prestigeRows.length,prestigeWins,prestigeWr:prestigeRows.length?prestigeWins/prestigeRows.length*100:null,
      normalN:normalRows.length,normalWins,normalWr:normalRows.length?normalWins/normalRows.length*100:null,
      medianOpponentHp:oppHp,medianTurns:turns,hitRate,critRate,enemyHitRate,
      missRate:hitRate==null?null:1-hitRate,close15,
      opponent:{
        evasion:oppEvasion,
        accuracy:oppAccuracy,
        critResist:oppCritResist,
        critChance:wmed('critChance',30),
        bleedResist:wmed('bleedResist',22),
        bleedChance:wmed('bleedChance',35),
        stunResist:wmed('stunResist',20),
        stunChance:wmed('stunChance',10),
        healingReduction:wmed('healingReduction',25),
        armorPen:wmed('armorPen',28),
        counterAttack:wmed('counterAttack',25),
        doubleStrike:wmed('doubleStrike',30)
      },
      modelSources:{
        prestige:{n:prestigeRows.length,detailedN:prestigeRows.filter(x=>x.detailLoaded).length,weightPerFight:1,effectiveWeight:prestigeRows.length},
        normal:{
          n:normalRows.length,detailedN:normalDetailed.length,attackN:normalAttackN,defenseN:normalDefenseN,
          attackWeight:1,defenseWeight:1,effectiveWeight:normalRows.length
        },
        arena:{n:0,weightPerFight:0,used:false},
        arena_test:{n:0,weightPerFight:0,used:false}
      },
      opponentModelN:modelRows.length,
      totals:{misses:sum('misses'),hits:sum('hits'),crits:sum('crits'),damageDealt:sum('damageDealt'),damageTaken:sum('damageTaken'),evades:sum('evades'),bleedDamageDealt:sum('bleedDamageDealt'),bleedDamageTaken:sum('bleedDamageTaken'),stunsGiven:sum('stunsGiven'),stunsTaken:sum('stunsTaken')}
    };
  }

  function pvpLabNormBonusKey(k){
    const m={armor_penetration_percent:'armor_pen_percent',hp_percent:'max_hp_percent',max_hp:'max_hp_flat',attack:'attack_percent',defense:'defense_percent'};
    return m[k]||k;
  }
  function pvpLabAddBonuses(dst,src,mult=1){
    if(!src || typeof src!=='object') return dst;
    for(const [rk,rv] of Object.entries(src)){ const k=pvpLabNormBonusKey(rk), v=Number(rv); if(Number.isFinite(v)) dst[k]=Number(dst[k]||0)+v*mult; }
    return dst;
  }
  function pvpLabBaseVector(a){
    const str=Number(a.str||0),end=Number(a.end||0),agi=Number(a.agi||0),vit=Number(a.vit||0),prc=Number(a.prc||0);
    return {attack_percent:.45*str,crit_damage_percent:10+.6*str+.5*prc,armor_pen_percent:.3*str+.15*prc,defense_percent:.65*end,damage_taken_reduction_percent:.18*end+.3*vit,crit_resist_percent:.4*end,stun_resist_percent:.4*end,evasion_percent:2+.35*agi,double_strike_percent:.5*agi,counter_attack_percent:.3*agi,healing_reduction_percent:.8*agi,max_hp_percent:1.1*vit,hp_regen_flat:.15*vit,bleed_resist_percent:.5*vit,accuracy_percent:85+.5*prc,crit_chance_percent:3+.5*prc+.3*agi,first_strike_percent:.25*prc,execute_threshold_percent:2+.15*prc,lifesteal_percent:.15*prc,stun_chance_percent:.4*prc,bleed_chance_percent:.3*str+.3*agi+.2*prc,attack_per_turn_percent:0,hp_regen_percent:0};
  }
  function pvpLabCurrentAttrs(){ const a=pvpLab.current?.summary?.attributes||pvpLabAttrs(pvpLab.current?.attributes)||null; return a&&['str','end','agi','vit','prc'].every(k=>Number.isFinite(Number(a[k])))?Object.fromEntries(Object.entries(a).map(([k,v])=>[k,Number(v)])):null; }
  function pvpLabExternalVector(){
    const s=pvpLab.current?.summary||{}, combined=s.combinedStats||{}, base=s.baseStats||{}, skills=s.skillBonuses||{};
    const out={}; const keys=new Set([...Object.keys(combined),...Object.keys(base),...Object.keys(skills)]);
    for(const rk of keys){ const k=pvpLabNormBonusKey(rk); if(['hp_regen_effective'].includes(k)) continue; const v=Number(combined[rk]||0)-Number(base[rk]||0)-Number(skills[rk]||0); if(Math.abs(v)>1e-9) out[k]=Number(out[k]||0)+v; }
    // Alias obecny w misc, ale combined ma już poprawny armor_pen_percent.
    return out;
  }
  function pvpLabCaps(){ return pvpLab.current?.summary?.statCaps||{evasion_percent:55,double_strike_percent:40,counter_attack_percent:40,crit_chance_percent:65,armor_pen_percent:50,damage_taken_reduction_percent:60,stun_resist_percent:60,bleed_resist_percent:60,healing_reduction_percent:50,execute_threshold_percent:18,crit_resist_percent:50,accuracy_percent:140,crit_damage_percent:130,lifesteal_percent:30,hp_regen_flat:20,stun_chance_percent:35}; }
  function pvpLabEffective(v){ const out={...v}, caps=pvpLabCaps(); for(const [k,c] of Object.entries(caps)){ if(k==='hp_regen_effective') continue; if(Number.isFinite(Number(out[k]))) out[k]=Math.min(Number(c),Number(out[k])); } return out; }

  function pvpLabParseSkillDescription(desc){
    const out={}, txt=String(desc||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const clauses=txt.split(/[,;+]/).map(x=>x.trim()).filter(Boolean);
    const add=(k,v)=>{ if(Number.isFinite(v)) out[k]=Number(out[k]||0)+v; };
    for(const c of clauses){
      const m=c.match(/([+-]?\d+(?:[.,]\d+)?)\s*(%?)/); if(!m) continue;
      const v=Number(m[1].replace(',','.')); const pct=m[2]==='%';
      if(/atak.*za ture|atk.*za ture/.test(c)) add('attack_per_turn_percent',v);
      else if(/otrzymywanych obrazen|redukcj.*obrazen/.test(c)) add('damage_taken_reduction_percent',Math.abs(v));
      else if(/maksymalnego hp|max hp/.test(c)) add('max_hp_percent',v);
      else if(/regeneracj.*hp/.test(c)) add(pct?'hp_regen_percent':'hp_regen_flat',v);
      else if(/odporn.*trafien.*kryt|odporn.*kryt/.test(c)) add('crit_resist_percent',v);
      else if(/odporn.*oglusz/.test(c)) add('stun_resist_percent',v);
      else if(/odporn.*krwaw/.test(c)) add('bleed_resist_percent',v);
      else if(/redukcj.*leczenia/.test(c)) add('healing_reduction_percent',v);
      else if(/przebici.*pancerza/.test(c)) add('armor_pen_percent',v);
      else if(/obrazen.*krytycz|obrazenia.*kryt/.test(c)) add('crit_damage_percent',v);
      else if(/szans.*trafienie krytyczne|szans.*kryt/.test(c)) add('crit_chance_percent',v);
      else if(/podwojn.*uderz/.test(c)) add('double_strike_percent',v);
      else if(/kontratak/.test(c)) add('counter_attack_percent',v);
      else if(/szans.*unik|\bunik\b/.test(c)) add('evasion_percent',v);
      else if(/celnos/.test(c)) add('accuracy_percent',v);
      else if(/prog.*egzekuc/.test(c)) add('execute_threshold_percent',v);
      else if(/kradziez.*zycia|lifesteal/.test(c)) add('lifesteal_percent',v);
      else if(/szans.*oglusz/.test(c)) add('stun_chance_percent',v);
      else if(/szans.*krwaw|krwawieni/.test(c)) add('bleed_chance_percent',v);
      else if(/pierwszy cios/.test(c)) add('first_strike_percent',v);
      else if(/obron/.test(c)) add('defense_percent',v);
      else if(/atak|\batk\b/.test(c)) add('attack_percent',v);
    }
    return out;
  }
  function pvpLabSkillBonuses(skill){
    const direct=skill?.bonuses||skill?.bonus||skill?.effects;
    if(direct && typeof direct==='object' && !Array.isArray(direct) && Object.keys(direct).length) return direct;
    return pvpLabParseSkillDescription(skill?.description||'');
  }
  function pvpLabSkillOptions(attr,level){
    const tree=pvpLab.skillTrees?.[attr], tiers=Array.isArray(tree?.skillTree)?tree.skillTree:[];
    return tiers.filter(t=>Number(t?.requiredLevel||t?.tier*5||999)<=Number(level)).sort((a,b)=>Number(a.tier||0)-Number(b.tier||0)).map(t=>({tier:Number(t.tier||0),requiredLevel:Number(t.requiredLevel||t.tier*5||0),skills:(Array.isArray(t.skills)?t.skills:[]).filter(s=>['A','B'].includes(String(s?.option||'').toUpperCase())).map(s=>({...s,option:String(s.option).toUpperCase(),bonuses:pvpLabSkillBonuses(s)}))}));
  }
  function pvpLabSkillStaticValue(skill,meta){
    const opp=meta.opponent||{}, b=pvpLabSkillBonuses(skill); let score=0;
    const hitNeed=Math.max(0,95-(100*(meta.hitRate??.75)));
    const weights={attack_percent:1.15,defense_percent:.75,max_hp_percent:1.0,damage_taken_reduction_percent:2.4,crit_resist_percent:1.2,stun_resist_percent:.8,evasion_percent:1.65,double_strike_percent:1.15,counter_attack_percent:.7,healing_reduction_percent:.45,accuracy_percent:.75+hitNeed*.08,crit_chance_percent:.5,crit_damage_percent:.22,armor_pen_percent:.9,execute_threshold_percent:1.15,lifesteal_percent:.35,bleed_chance_percent:.38,bleed_resist_percent:.65,first_strike_percent:.12,stun_chance_percent:.65,attack_per_turn_percent:4.2,hp_regen_flat:.35,hp_regen_percent:1.4,low_hp_attack_percent:.7,low_hp_damage_reduction_percent:1.2,low_hp_regen_flat:.3};
    for(const [rk,rv] of Object.entries(b)){ const k=pvpLabNormBonusKey(rk), v=Number(rv)||0; score+=v*Number(weights[k]??.08); }
    return score;
  }
  function pvpLabPrecomputedSkillPlans(meta){
    const out={};
    for(const attr of ['str','end','agi','vit','prc']){
      out[attr]=[];
      for(let level=0;level<=50;level++){
        const bonus={}, letters=[];
        for(const t of pvpLabSkillOptions(attr,level)){
          if(!t.skills.length) continue;
          let best=t.skills[0]; for(const sk of t.skills.slice(1)) if(pvpLabSkillStaticValue(sk,meta)>pvpLabSkillStaticValue(best,meta)) best=sk;
          letters.push(best.option); pvpLabAddBonuses(bonus,best.bonuses);
        }
        out[attr][level]={bonus,letters:letters.join('')};
      }
    }
    return out;
  }

  function pvpLabCalibratedCores(){
    const s=pvpLab.current?.summary||{}, a=pvpLabCurrentAttrs(), c=s.combinedStats||{}, combat=s.combatStats||{}; if(!a || !combat.attack || !combat.defense || !combat.maxHp) return null;
    const af=.5*a.str+.5*a.agi+.4*a.prc, df=1.65*a.end, hf=1.5*a.vit, hpFlat=Number(c.max_hp_flat||0);
    return {attack:Number(combat.attack)/(1+Number(c.attack_percent||0)/100)-af,defense:Number(combat.defense)/(1+Number(c.defense_percent||0)/100)-df,hp:Number(combat.maxHp)/(1+Number(c.max_hp_percent||0)/100)-hf-hpFlat,hpFlat};
  }
  function pvpLabCandidateStats(attrs,skillBonus,external){
    const raw=pvpLabBaseVector(attrs); pvpLabAddBonuses(raw,external); pvpLabAddBonuses(raw,skillBonus);
    const eff=pvpLabEffective(raw), cores=pvpLabCalibratedCores();
    if(!cores) return null;
    const af=.5*attrs.str+.5*attrs.agi+.4*attrs.prc, df=1.65*attrs.end, hf=1.5*attrs.vit;
    const attack=(cores.attack+af)*(1+Number(raw.attack_percent||0)/100);
    const defense=(cores.defense+df)*(1+Number(raw.defense_percent||0)/100);
    const maxHp=(cores.hp+hf+Number(raw.max_hp_flat||cores.hpFlat||0))*(1+Number(raw.max_hp_percent||0)/100);
    const regen=Math.min(20,Number(raw.hp_regen_flat||0)+maxHp*Math.max(0,Number(raw.hp_regen_percent||0))/100);
    return {raw,eff,attack,defense,maxHp,regen};
  }
  function pvpLabCandidateScore(stats,meta){
    if(!stats) return -Infinity; const c=stats.eff, o=meta.opponent||{}, turns=pvpLabClamp(meta.medianTurns||12,6,15);
    const hit=pvpLabClamp((Number(c.accuracy_percent||0)-Number(o.evasion||25))/100,.05,1);
    const crit=pvpLabClamp((Number(c.crit_chance_percent||0)-Number(o.critResist||20))/100,0,.65);
    const critFactor=1+crit*Number(c.crit_damage_percent||0)/100;
    const doubleFactor=1+Number(c.double_strike_percent||0)/100;
    const penFactor=1+.90*Number(c.armor_pen_percent||0)/100;
    const bleedEff=pvpLabClamp((Number(c.bleed_chance_percent||0)-Number(o.bleedResist||22))/100,0,.8);
    const stunEff=pvpLabClamp((Number(c.stun_chance_percent||0)-Number(o.stunResist||20))/100,0,.35);
    const ramp=1+Number(stats.raw.attack_per_turn_percent||0)*Math.max(0,(turns-1)/2)/100;
    const executeFactor=1+.30*Number(c.execute_threshold_percent||0)/100;
    const healPressure=1+.18*Number(c.healing_reduction_percent||0)/100;
    const offense=Math.max(1,stats.attack)*hit*critFactor*doubleFactor*penFactor*(1+.55*bleedEff)*(1+.75*stunEff)*ramp*executeFactor*healPressure;

    const enemyHit=pvpLabClamp((Number(o.accuracy||110)-Number(c.evasion_percent||0))/100,.05,1);
    const evadePassive=1-pvpLabClamp(Number(c.evasion_percent||0)/350,0,.16);
    const red=1-pvpLabClamp(Number(c.damage_taken_reduction_percent||0)/100,0,.60);
    const enemyCrit=pvpLabClamp((Number(o.critChance||30)-Number(c.crit_resist_percent||0))/100,0,.65);
    const enemyCritFactor=1+enemyCrit*.65;
    const enemyBleed=pvpLabClamp((Number(o.bleedChance||35)-Number(c.bleed_resist_percent||0))/100,0,.8);
    const enemyStun=pvpLabClamp((Number(o.stunChance||10)-Number(c.stun_resist_percent||0))/100,0,.35);
    const effectiveDef=stats.defense*(1-pvpLabClamp(Number(o.armorPen||28)/100,0,.5));
    const defFactor=1+Math.max(0,effectiveDef)/900;
    const sustain=stats.maxHp + stats.regen*turns + offense*.0025*pvpLabClamp(Number(c.lifesteal_percent||0)*(1-Number(o.healingReduction||25)/100),0,30)*turns;
    const incomingFactor=Math.max(.08,enemyHit*evadePassive*red*enemyCritFactor*(1+.45*enemyBleed)*(1+.75*enemyStun));
    const survival=Math.max(1,sustain)*defFactor/incomingFactor;

    // Długie pojedynki kończące się po 15 turach wymagają trochę większej wagi przeżywalności/HP.
    const closeBoost=Math.min(.12,Number(meta.close15||0)/Math.max(1,meta.n||1));
    const ow=.51-closeBoost/2, sw=.49+closeBoost/2;
    return Math.log(Math.max(1,offense))*ow + Math.log(Math.max(1,survival))*sw;
  }

  function pvpLabBuildCode(attrs,plans){ return `${attrs.str}/${attrs.end}/${attrs.agi}/${attrs.vit}/${attrs.prc}:${plans.str||''}/${plans.end||''}/${plans.agi||''}/${plans.vit||''}/${plans.prc||''}`; }
  function pvpLabRunOptimizer(){
    const started=Date.now();
    try{
      if(!pvpLabCfg.optimizerEnabled){ pvpLab.optimizer={status:'OFF',at:Date.now()}; pvpLabSave(); return pvpLab.optimizer; }
      const meta=pvpLabRealPvpMeta(), currentAttrs=pvpLabCurrentAttrs(), external=pvpLabExternalVector();
      const missingTrees=['str','end','agi','vit','prc'].filter(a=>!Array.isArray(pvpLab.skillTrees?.[a]?.skillTree));
      if(!currentAttrs || !pvpLab.current?.summary?.combatStats){ pvpLab.optimizer={status:'CZEKA NA SNAPSHOT PVP',at:Date.now(),meta}; pvpLabSave(); return pvpLab.optimizer; }
      if(missingTrees.length){ pvpLab.optimizer={status:`CZEKA NA DRZEWKA: ${missingTrees.join(',').toUpperCase()}`,at:Date.now(),meta}; pvpLabSave(); return pvpLab.optimizer; }
      const minReal=Math.max(3,Number(pvpLabCfg.optimizerMinRealPvp||8));
      if(meta.n<minReal){ pvpLab.optimizer={status:`ZA MAŁO REALNEGO PVP (${meta.n}/${minReal})`,at:Date.now(),meta}; pvpLabSave(); return pvpLab.optimizer; }
      const pre=pvpLabPrecomputedSkillPlans(meta), attrs=['str','end','agi','vit','prc'], top=[];
      const pushTop=x=>{ top.push(x); top.sort((a,b)=>b.score-a.score); if(top.length>50) top.length=50; };
      // Faza 1: pełny przegląd sensownych breakpointów. 130/132 pkt leży na progach 5-lvl, dwa punkty są rozdzielane dowolnie.
      for(let ts=0;ts<=10;ts++) for(let te=0;te<=10;te++) for(let ta=0;ta<=10;ta++) for(let tv=0;tv<=10;tv++){
        const tp=26-ts-te-ta-tv; if(tp<0||tp>10) continue;
        const base={str:ts*5,end:te*5,agi:ta*5,vit:tv*5,prc:tp*5};
        const rems=[[2,0,0,0,0],[0,2,0,0,0],[0,0,2,0,0],[0,0,0,2,0],[0,0,0,0,2],[1,1,0,0,0],[1,0,1,0,0],[1,0,0,1,0],[1,0,0,0,1],[0,1,1,0,0],[0,1,0,1,0],[0,1,0,0,1],[0,0,1,1,0],[0,0,1,0,1],[0,0,0,1,1]];
        for(const r of rems){
          const a={str:base.str+r[0],end:base.end+r[1],agi:base.agi+r[2],vit:base.vit+r[3],prc:base.prc+r[4]};
          if(attrs.some(k=>a[k]>50)) continue;
          const sb={}, plan={}; for(const k of attrs){ const q=pre[k][a[k]]; plan[k]=q.letters; pvpLabAddBonuses(sb,q.bonus); }
          const st=pvpLabCandidateStats(a,sb,external), score=pvpLabCandidateScore(st,meta); pushTop({attrs:a,skillBonus:sb,plan,stats:st,score});
        }
      }
      // Faza 2: lokalne przesunięcia punktów i flipy A/B na TOP-ach. Pozwala wyjść poza idealne wielokrotności 5.
      const refine=(cand)=>{
        let best=cand;
        for(let pass=0;pass<3;pass++){
          let changed=false;
          for(const from of attrs) for(const to of attrs){ if(from===to||best.attrs[from]<=0||best.attrs[to]>=50) continue;
            const a={...best.attrs,[from]:best.attrs[from]-1,[to]:best.attrs[to]+1};
            const sb={},plan={}; for(const k of attrs){ const q=pre[k][a[k]]; plan[k]=q.letters; pvpLabAddBonuses(sb,q.bonus); }
            const st=pvpLabCandidateStats(a,sb,external), score=pvpLabCandidateScore(st,meta);
            if(score>best.score+1e-8){ best={attrs:a,skillBonus:sb,plan,stats:st,score}; changed=true; }
          }
          if(!changed) break;
        }
        // Flipy pojedynczych wyborów skilla z pełnym przeliczeniem score.
        let selections={};
        for(const k of attrs){ selections[k]=[]; for(const t of pvpLabSkillOptions(k,best.attrs[k])){ const wanted=(best.plan[k]||'')[selections[k].length]||'A'; const sk=t.skills.find(x=>x.option===wanted)||t.skills[0]; if(sk) selections[k].push({tier:t.tier,skill:sk,choices:t.skills}); } }
        const rebuild=()=>{ const sb={},plan={}; for(const k of attrs){ plan[k]=selections[k].map(x=>x.skill.option).join(''); for(const x of selections[k]) pvpLabAddBonuses(sb,x.skill.bonuses); } const st=pvpLabCandidateStats(best.attrs,sb,external); return {attrs:{...best.attrs},skillBonus:sb,plan,stats:st,score:pvpLabCandidateScore(st,meta)}; };
        best=rebuild();
        for(let pass=0;pass<3;pass++){
          let improved=false;
          for(const k of attrs) for(const sel of selections[k]){
            const old=sel.skill; for(const alt of sel.choices){ if(alt===old) continue; sel.skill=alt; const test=rebuild(); if(test.score>best.score+1e-8){ best=test; improved=true; } else sel.skill=old; }
          }
          if(!improved) break;
        }
        return best;
      };
      const refined=top.slice(0,25).map(refine).sort((a,b)=>b.score-a.score); const best=refined[0]||top[0];
      const currentPlan={};
      const curCode=pvpLabCurrentBuild(); const parts=curCode.split(':')[1]?.split('/')||[]; attrs.forEach((k,i)=>currentPlan[k]=parts[i]||'');
      const currentSkill={};
      for(const k of attrs){ const opts=pvpLabSkillOptions(k,currentAttrs[k]), letters=currentPlan[k]||''; opts.forEach((t,i)=>{ const sk=t.skills.find(x=>x.option===(letters[i]||'')); if(sk) pvpLabAddBonuses(currentSkill,sk.bonuses); }); }
      const curStats=pvpLabCandidateStats(currentAttrs,currentSkill,external), curScore=pvpLabCandidateScore(curStats,meta);
      const scale=100/Math.max(1e-9,curScore), ranked=refined.slice(0,10).map((x,i)=>({rank:i+1,build:pvpLabBuildCode(x.attrs,x.plan),attrs:x.attrs,plan:x.plan,metaScore:x.score,relativeIndex:x.score/curScore*100,combat:{attack:Math.round(x.stats.attack),defense:Math.round(x.stats.defense),maxHp:Math.round(x.stats.maxHp)},effective:{accuracy:x.stats.eff.accuracy_percent,evasion:x.stats.eff.evasion_percent,damageReduction:x.stats.eff.damage_taken_reduction_percent,critResist:x.stats.eff.crit_resist_percent,bleedResist:x.stats.eff.bleed_resist_percent,armorPen:x.stats.eff.armor_pen_percent,doubleStrike:x.stats.eff.double_strike_percent,counterAttack:x.stats.eff.counter_attack_percent,execute:x.stats.eff.execute_threshold_percent,lifesteal:x.stats.eff.lifesteal_percent,regen:x.stats.regen}}));
      pvpLab.optimizer={status:'OK',at:Date.now(),durationMs:Date.now()-started,method:'REAL_PVP_EQUAL_1TO1_COUNTERFACTUAL_V3',realPvpObjective:true,sourceWeights:{prestige:1,normal:1,arena:0,arena_test:0},arenaUsed:false,meta,current:{build:curCode,attrs:currentAttrs,relativeIndex:100,combat:curStats?{attack:Math.round(curStats.attack),defense:Math.round(curStats.defense),maxHp:Math.round(curStats.maxHp)}:null},best:ranked[0]||null,top:ranked,searchNote:'Cel = REALNE PvP 1:1: każda walka PRESTIŻ i każdy normalny ATAK/OBRONA ma wagę 1. Arena/Arena TEST = 0. 130 pkt na breakpointach + 2 reszty, hill-climb i flipy A/B'};
      pvpLabSave(); return pvpLab.optimizer;
    }catch(e){ pvpLab.optimizer={status:'BŁĄD OPTIMIZERA',error:String(e?.message||e),at:Date.now()}; pvpLabRecordError('optimizer',e); pvpLabSave(); return pvpLab.optimizer; }
  }

  function pvpLabSummary(){
    const valid=pvpLab.battles.filter(x=>typeof x.won==='boolean'), wins=valid.filter(x=>x.won).length, by={};
    for(const s of ['prestige','normal','arena','arena_test']) by[s]=pvpLabSourceStats(s);
    const builds=pvpLabBuildStats(), eligible=builds.filter(x=>x.n>=3);
    const realPvpMeta=pvpLabRealPvpMeta();
    return {total:pvpLab.battles.length,valid:valid.length,wins,losses:valid.length-wins,wr:valid.length?wins/valid.length*100:null,by,best:(eligible[0]||builds[0]||null),bestProvisional:eligible.length===0,builds,realPvpMeta,prestigeMeta:realPvpMeta,optimizer:pvpLab.optimizer};
  }

  async function pvpLabRefreshSkillTrees(){
    const id=pvpLabOwnId(); if(!id) return;
    const maxAge=Math.max(1,Number(pvpLabCfg.skillTreeRefreshHours||12))*3600000;
    for(const a of ['str','end','agi','vit','prc']){
      if(pvpLab.skillTrees?.[a] && Date.now()-Number(pvpLab.skillTreesAt?.[a]||0)<maxAge) continue;
      try{ const t=await apiActive(`/api/pvp/${id}/skill-tree/${a}`); if(t?.success!==false) pvpLabStoreSkillTree(a,t); }
      catch(e){ pvpLabRecordError(`skill_tree:${a}`,e); }
      await sleep(70);
    }
  }
  async function pvpLabRefreshCurrent(){
    const id=pvpLabOwnId(); if(!id) return;
    const attrs=await apiActive(`/api/pvp/${id}/attributes`).catch(()=>null); if(attrs) pvpLabSetCurrent('pvp_attributes',attrs); await sleep(70);
    const summary=await apiActive(`/api/pvp/${id}/summary`).catch(()=>null); if(summary) pvpLabSetCurrent('pvp_summary',summary); await sleep(70);
    const build=await apiActive(`/api/pvp/${id}/build`).catch(()=>null); if(build) pvpLabSetCurrent('pvp_build',build); await pvpLabRefreshSkillTrees();
  }

  async function pvpLabSync({silent=false}={}){
    if(pvpLab.syncing) return;
    if(!__mgSessionTemplate){ pvpLab.syncStatus='CZEKA NA SESJĘ API'; pvpLabSave(); if(!silent) alert('PvP Lab czeka na sesję API. Otwórz ekran gry i spróbuj ponownie.'); return; }
    pvpLab.syncing=true; pvpLab.syncStatus='SYNCHRONIZUJĘ';
    try{
      await pvpLabRefreshCurrent(); const id=pvpLabOwnId();
      const duel=await apiActive(`/api/duels/${id}/status`).catch(e=>{pvpLabRecordError('sync_duels',e);return null;}); if(duel) pvpLabIngestDuelStatus(duel); await sleep(100);
      const combat=await apiActive(`/api/combat/${id}/history`).catch(e=>{pvpLabRecordError('sync_combat',e);return null;}); if(combat) pvpLabIngestCombatHistory(combat);
      // Dodatkowe źródło historii - próbujemy najwyżej raz na 24h po niepowodzeniu.
      if(pvpLab.capabilities.battleHistory!==false || Date.now()-Number(pvpLab.capabilities.battleHistoryCheckedAt||0)>86400000){
        try{ const h=await apiActive(`/api/pvp/${id}/battle-history?limit=${Math.max(50,Number(pvpLabCfg.backfillLimit||120))}`); pvpLab.capabilities.battleHistory=true; pvpLab.capabilities.battleHistoryCheckedAt=Date.now(); pvpLabIngestBattleHistory(h); }
        catch(e){ pvpLab.capabilities.battleHistory=false; pvpLab.capabilities.battleHistoryCheckedAt=Date.now(); }
      }
      const limit=Math.max(5,Math.min(150,Number(pvpLabCfg.detailFetchPerSync||90)));
      const missing=pvpLab.battles.filter(x=>x.battleId && !x.detailLoaded && !x.detailExpired && ['prestige','normal'].includes(x.source)).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,limit);
      let loaded=0,expired=0;
      for(const row of missing){
        try{ const detail=await apiActive(`/api/pvp/battle/${encodeURIComponent(row.battleId)}`); if(detail){ pvpLabRecordBattle(detail,{source:row.source,direction:row.direction,buildCode:row.buildCode||'',prestigeChange:row.prestigeChange,xpGained:row.xpGained}); loaded++; } }
        catch(e){ if(pvpLabIsExpiredError(e)){ row.detailExpired=true; row.detailState='expired'; row.detailExpiredAt=Date.now(); expired++; } else pvpLabRecordError(`battle:${row.battleId}`,e); }
        await sleep(85);
      }
      pvpLab.lastSyncAt=Date.now(); pvpLabRunOptimizer(); pvpLab.syncStatus=`OK • szczegóły +${loaded}${expired?` • wygasłe ${expired}`:''}`;
    }catch(e){ pvpLab.syncStatus='BŁĄD'; pvpLabRecordError('sync',e); if(!silent) alert(`PvP Lab: ${String(e?.message||e)}`); }
    finally{ pvpLab.syncing=false; pvpLabSave(); try{ render(); }catch{} }
  }

  function pvpLabExport(){
    const obj={version:VERSION,generatedAt:nowIso(),characterId:pvpLabOwnId(),config:{...pvpLabCfg},summary:pvpLabSummary(),current:pvpLab.current,skillTrees:pvpLab.skillTrees,defenseSnapshots:pvpLab.defenseSnapshots,optimizer:pvpLab.optimizer,battles:pvpLab.battles,opponentRolls:pvpLab.opponentRolls,capabilities:pvpLab.capabilities,errors:pvpLab.errors};
    downloadBlob(JSON.stringify(obj,null,2),`pomagier_pvp_lab_${new Date().toISOString().replaceAll(':','-')}.json`,'application/json');
  }
  function pvpLabPct(x){ return x==null?'—':`${Number(x).toFixed(1)}%`; }
  function pvpLabSourceName(s){ return ({prestige:'PRESTIŻ',normal:'ATAKI/OBRONY',arena:'ARENA',arena_test:'ARENA TEST'})[s]||String(s||'?').toUpperCase(); }
  function pvpLabHTML(){
    const sum=pvpLabSummary(), tested=sum.best, opt=pvpLab.optimizer||{}, meta=sum.realPvpMeta||sum.prestigeMeta||{};
    const rows=sum.builds.slice(0,15).map((r,i)=>{
      const p=r.prestigeN?`${r.prestigeWr.toFixed(1)}% (${r.prestigeWins}/${r.prestigeN})`:'—';
      const n=r.normalN?`${r.normalWr.toFixed(1)}% (${r.normalWins}/${r.normalN})`:'—';
      return `<tr><td>${i+1}</td><td class="left"><b>${esc(r.label)}</b><div class="sub">score REAL PvP ${r.score.toFixed(1)} • N=${r.n}</div></td><td>${r.wr.toFixed(1)}%<div class="sub">${r.wins}/${r.n}</div></td><td>${p}</td><td>${n}</td><td>${r.attackN?`${(r.attackWins/r.attackN*100).toFixed(1)}% (${r.attackN})`:'—'}</td><td>${r.defN?`${(r.defWins/r.defN*100).toFixed(1)}% (${r.defN})`:'—'}</td><td>${r.avgHpPct==null?'—':r.avgHpPct.toFixed(1)+'%'}</td></tr>`;
    }).join('');
    const latest=pvpLab.battles.slice().sort((a,b)=>Number(b.createdAt||b.capturedAt||0)-Number(a.createdAt||a.capturedAt||0)).slice(0,30).map(b=>{ const when=new Date(Number(b.createdAt||b.capturedAt||Date.now())).toLocaleString('pl-PL'); return `<tr><td>${when}</td><td>${pvpLabSourceName(b.source)}</td><td>${esc(b.direction||'—')}</td><td class="${b.won===true?'ok':b.won===false?'bad':''}"><b>${b.won===true?'W':b.won===false?'P':'?'}</b></td><td class="left">${esc(b.opponent?.nickname||`ID ${b.opponent?.id||'?'}`)}<div class="sub">${esc(b.opponentArchetype||'')} • ${esc(pvpLabBuildLabel(b))} • ${esc(b.detailState||'')}</div></td><td>${b.totalTurns??'—'}</td><td>${pvpLabPct(b.meHpPct)}</td><td>${b.prestigeChange==null?'—':(b.prestigeChange>=0?'+':'')+b.prestigeChange}</td></tr>`; }).join('');
    const curBuild=pvpLabCurrentBuild(); const statCard=(label,x)=>`<div class="card"><div class="label">${label}</div><div class="big">${x.n}</div><div>${x.n?`${x.wins}W / ${x.losses}P • ${pvpLabPct(x.wr)}`:'brak danych'}</div></div>`;
    const pmeta=meta.modelSources?.prestige||{}, nmeta=meta.modelSources?.normal||{};
    const bestMeta=opt.status==='OK'&&opt.best
      ? `<div class="pvp-best-build"><b>${esc(opt.best.build)}</b><span>indeks ${Number(opt.best.relativeIndex||0).toFixed(1)} vs obecny 100 • prognoza ATK ${opt.best.combat.attack} / DEF ${opt.best.combat.defense} / HP ${opt.best.combat.maxHp}</span></div>
         <div class="sub">CEL: REALNE PvP 1:1 — razem ${meta.n||0} walk. PRESTIŻ: ${pmeta.n||0} × waga 1. ATAKI/OBRONY: ${nmeta.n||0} × waga 1 (${nmeta.attackN||0} atak / ${nmeta.defenseN||0} obrona). Arena = 0. Model przeciwnika: unik ~${Number(meta.opponent?.evasion||0).toFixed(1)}%, celność ~${Number(meta.opponent?.accuracy||0).toFixed(1)}%, CR ~${Number(meta.opponent?.critResist||0).toFixed(1)}%. Czas ${opt.durationMs||0} ms.</div>`
      : `<div class="note">Optimizer: ${esc(opt.status||'CZEKA')}. Synchronizacja pobierze historię PRESTIŻ oraz normalne ATAKI/OBRONY i policzy je 1:1. Arena pozostaje wyłączona.</div>`;
    return `
      <div class="helper-hero"><div><div class="helper-name">⚔ PvP Lab META</div><div class="sub"><b>PRESTIŻ = ATAKI/OBRONY.</b> Każda realna walka PvP ma wagę 1. Arena i Arena TEST mają wagę 0.</div></div><div class="helper-actions"><button data-act="pvp-sync">↻ Synchronizuj + przelicz</button><button data-act="pvp-optimize">⚙ Przelicz BEST BUILD</button><button data-act="pvp-export">Eksport PvP JSON</button><button data-act="pvp-clear">Wyczyść PvP Lab</button></div></div>
      <div class="cards mini">${statCard('Prestiż • WAGA 1',sum.by.prestige)}${statCard('Ataki + obrony • WAGA 1',sum.by.normal)}${statCard('Arena • WAGA 0',sum.by.arena)}${statCard('Arena TEST • WAGA 0',sum.by.arena_test)}</div>
      <div class="section pvp-best"><div class="section-title">🧠 BEST BUILD — REALNE PvP 1:1</div>${bestMeta}<div class="sub">Wynik, profil mety i optimizer traktują PRESTIŻ oraz zwykłe ATAKI/OBRONY identycznie. Normalny atak = 1, normalna obrona = 1, pojedynek o prestiż = 1. Powtórna walka z tym samym graczem również jest pełnoprawną próbką. Arena/Arena TEST = 0.</div></div>
      <div class="section pvp-best"><div class="section-title">🏆 Najlepszy z buildów faktycznie użytych — REAL PvP</div>${tested?`<div class="pvp-best-build"><b>${esc(tested.label)}</b><span>${sum.bestProvisional?'WSTĘPNY • ':''}score ${tested.score.toFixed(1)} • ŁĄCZNIE ${tested.wr.toFixed(1)}% (${tested.wins}/${tested.n}) • PRESTIŻ ${tested.prestigeN?(tested.prestigeWr.toFixed(1)+'%'):'—'} • ATAKI/OBRONY ${tested.normalN?(tested.normalWr.toFixed(1)+'%'):'—'}</span></div>`:'<div class="note">Brak realnych walk PvP z rozpoznanym buildem.</div>'}<div class="sub">Empiryczny ranking łączy PRESTIŻ i ATAKI/OBRONY 1:1. Arena i Arena TEST nie wpływają na ranking ani BEST BUILD.</div></div>
      <div class="section"><div class="section-title">Aktualny snapshot PvP</div><div><b>${curBuild?esc(curBuild):'build jeszcze nie odczytany'}</b></div><div class="sub">ostatnia synchronizacja: ${pvpLab.lastSyncAt?new Date(pvpLab.lastSyncAt).toLocaleString('pl-PL'):'—'} • status: ${esc(pvpLab.syncStatus||'—')} • rekordów ${pvpLab.battles.length} • drzewka ${['str','end','agi','vit','prc'].filter(a=>pvpLab.skillTrees?.[a]?.skillTree).length}/5</div></div>
      <div class="section table-wrap"><div class="section-title">Ranking faktycznie użytych buildów — PRESTIŻ + ATAKI/OBRONY 1:1</div><table><thead><tr><th>#</th><th>Build</th><th>Łączny WR</th><th>Prestiż</th><th>Ataki/Obrony</th><th>Rola: atak</th><th>Rola: obrona</th><th>Śr. HP</th></tr></thead><tbody>${rows||'<tr><td colspan="8">Brak realnych danych PvP z rozpoznanym buildem</td></tr>'}</tbody></table></div>
      <div class="section table-wrap"><div class="section-title">Ostatnie walki — PRESTIŻ + Ataki/Obrony (Arena tylko archiwum)</div><table><thead><tr><th>Data</th><th>Źródło</th><th>Rola</th><th>Wynik</th><th>Przeciwnik / build</th><th>Tury</th><th>HP</th><th>Prestiż</th></tr></thead><tbody>${latest||'<tr><td colspan="8">Brak zebranych walk.</td></tr>'}</tbody></table></div>
      <div class="section note">Lab niczego nie resetuje, nie kupuje i nie stosuje buildów. Automatycznie synchronizuje historię pojedynków o prestiż i /api/combat/.../history oraz replaye normalnych walk, gdy są jeszcze dostępne. Replay 404 jest oznaczany jako wygasły i nie jest ponownie odpytywany.</div>`;
  }


  // =========================
  // Boss LAB — przechwytywanie, model bossa i osobny optimizer
  // =========================
  function bossLabApiKind(url){
    const u=pvpLabUrl(url); if(!u || u.origin!==location.origin) return null;
    const p=u.pathname;
    if(/\/api\/boss-combat\/\d+\/bosses$/.test(p)) return 'boss_list';
    if(/\/api\/boss-combat\/\d+\/attack\/\d+$/.test(p)) return 'boss_attack';
    if(/\/api\/boss-combat\/\d+\/rematch\/\d+$/.test(p)) return 'boss_rematch';
    if(/\/api\/character\/\d+\/active-modifiers$/.test(p)) return 'active_modifiers';
    return null;
  }
  function bossLabRecordError(where,e){
    const msg=String(e?.message||e||'błąd');
    bossLab.errors.push({at:Date.now(),where:String(where||''),error:msg});
    bossLabSave();
  }
  function bossLabBossIdFromUrl(url){
    const u=pvpLabUrl(url); const m=u?.pathname.match(/\/api\/boss-combat\/\d+\/(?:attack|rematch)\/(\d+)$/); return m?Number(m[1]):0;
  }
  function bossLabIngestList(data){
    const list=Array.isArray(data?.bosses)?data.bosses:[];
    for(const b of list){
      const id=Number(b?.id||0); if(!id) continue;
      const old=bossLab.bosses[String(id)]||{};
      bossLab.bosses[String(id)]={...old,...bossLabClone(b),id,lastSeenAt:Date.now()};
    }
    bossLab.lastBossListAt=Date.now();
    bossLab.syncStatus=`BOSSY ${list.length} • czekam na walkę`;
    bossLabSave();
  }
  function bossLabFindFight(id){ return bossLab.battles.find(x=>String(x.battleId)===String(id)); }
  function bossLabMedianField(rows,key,fallback=null){
    const vals=[];
    for(const r of rows){
      let v=r?.opponentObserved?.[key];
      if(!Number.isFinite(Number(v))) v=r?.opponent?.[key];
      if(!Number.isFinite(Number(v))) v=r?.rawFighters?.opponent?.[key];
      if(Number.isFinite(Number(v))) vals.push(Number(v));
    }
    return pvpLabMedian(vals,fallback);
  }
  function bossLabCollectBossBuffs(mods){
    const out={attack:0,defense:0,maxHp:0,sources:[]};
    const rows=[];
    if(Array.isArray(mods?.buffs)) rows.push(...mods.buffs);
    if(Array.isArray(mods?.equipmentBuffs)) rows.push(...mods.equipmentBuffs);
    if(Array.isArray(mods?.miscItems)) rows.push(...mods.miscItems);
    if(mods?.activeFavor && typeof mods.activeFavor==='object') rows.push(mods.activeFavor);
    for(const x of rows){
      if(!x||typeof x!=='object') continue;
      const a=Number(x.boss_attack_bonus||0),d=Number(x.boss_defense_bonus||0),h=Number(x.boss_max_hp_bonus||0);
      if(!Number.isFinite(a)&&!Number.isFinite(d)&&!Number.isFinite(h)) continue;
      const aa=Number.isFinite(a)?a:0,dd=Number.isFinite(d)?d:0,hh=Number.isFinite(h)?h:0;
      if(aa||dd||hh){
        out.attack+=aa; out.defense+=dd; out.maxHp+=hh;
        out.sources.push({name:String(x.name||x.item_name||x.source||'buff'),attack:aa,defense:dd,maxHp:hh,remainingTime:Number(x.remainingTime||0)||null});
      }
    }
    out.attack=Math.max(0,Number(out.attack||0));
    out.defense=Math.max(0,Number(out.defense||0));
    out.maxHp=Math.max(0,Number(out.maxHp||0));
    return out;
  }
  function bossLabCurrentBossBuffs(){ return bossLabCollectBossBuffs(bossLab.activeModifiers||{}); }
  function bossLabApplyBossBuffs(stats,buffs){
    if(!stats) return stats;
    const b=buffs||{};
    return {...stats,attack:Number(stats.attack||0)+Math.max(0,Number(b.attack||0)),defense:Number(stats.defense||0)+Math.max(0,Number(b.defense||0)),maxHp:Number(stats.maxHp||0)+Math.max(0,Number(b.maxHp||0)),eff:{...(stats.eff||{})},raw:{...(stats.raw||{})}};
  }
  function bossLabIngestActiveModifiers(data){
    if(!data||data.success===false) return;
    bossLab.activeModifiers=bossLabClone(data)||{};
    bossLab.activeModifiersAt=Date.now();
    bossLabSave();
  }
  function bossLabRecordFight(data,meta={}){
    if(!data || data.success===false || !data.battleId) return null;
    const shape=pvpLabBattleShape(data); if(!shape) return null;
    const meSide=pvpLabSide(shape) || 'attacker';
    const me=meSide==='attacker'?shape.attacker:shape.defender;
    const opponent=meSide==='attacker'?shape.defender:shape.attacker;
    const bossId=Number(meta.bossId||data.bossId||0) || (Number(opponent?.id||0)>0?Number(opponent.id):0);
    const catalog=bossLab.bosses[String(bossId)]||{};
    const observed=pvpLabObservedStats(shape.events,meSide);
    const existing=bossLabFindFight(shape.battleId)||{};
    const won=shape.winner==='draw'?null:shape.winner===meSide;
    const buildCode=pvpLabCurrentBuild();
    const record={
      ...existing,
      battleId:String(shape.battleId),bossId,bossName:String(catalog.name||opponent?.nickname||`Boss ${bossId||'?'}`),
      capturedAt:Date.now(),createdAt:Number(meta.at||Date.now()),kind:String(meta.kind||'attack'),
      winner:shape.winner,won,totalTurns:shape.totalTurns,defeated:!!data.defeated,
      me,opponent,meObserved:observed.me,opponentObserved:observed.opponent,observationSamples:observed.samples,
      eventSummary:pvpLabEventSummary(shape.events,meSide),events:bossLabClone(shape.events)||[],
      meHpPct:pvpLabHpPct(me),opponentHpPct:pvpLabHpPct(opponent),
      buildCode,buildKey:buildCode?`code:${buildCode}`:pvpLabBuildKey(me,''),
      pvpSnapshot:{attributes:pvpLabCurrentAttrs(),combatStats:bossLabClone(pvpLab.current?.summary?.combatStats||{}),baseStats:bossLabClone(pvpLab.current?.summary?.baseStats||{}),skillBonuses:bossLabClone(pvpLab.current?.summary?.skillBonuses||{}),combinedStats:bossLabClone(pvpLab.current?.summary?.combinedStats||{}),statCaps:bossLabClone(pvpLab.current?.summary?.statCaps||{}),chosenSkills:bossLabClone(pvpLab.current?.summary?.chosenSkills||[]),bossBuffs:bossLabClone(bossLabCurrentBossBuffs())},
      rawFighters:{me:bossLabClone(meSide==='attacker'?data.attacker:data.defender),opponent:bossLabClone(meSide==='attacker'?data.defender:data.attacker)},
      rawExtra:(()=>{ const x=bossLabClone(data)||{}; delete x.events; delete x.attacker; delete x.defender; return x; })(),
      rewards:bossLabClone(data.rewards||null),xpResult:bossLabClone(data.xpResult||null),detailLoaded:true
    };
    const idx=bossLab.battles.findIndex(x=>String(x.battleId)===String(record.battleId));
    if(idx>=0) bossLab.battles[idx]=record; else bossLab.battles.push(record);
    if(bossId){
      const old=bossLab.bosses[String(bossId)]||{};
      bossLab.bosses[String(bossId)]={...old,id:bossId,name:record.bossName,lastSeenAt:Date.now(),lastFightAt:record.createdAt,lastBattleId:record.battleId};
    }
    bossLab.lastCaptureAt=Date.now();
    bossLab.syncStatus=`ZŁAPANO WALKĘ: ${record.bossName} • ${won===true?'WYGRANA':won===false?'PRZEGRANA':'REMIS'}`;
    bossLabSave();
    if(bossLabCfg.autoOptimizeAfterFight && bossId){ setTimeout(()=>{ try{ bossLabRunOptimizer(bossId); render(); }catch(e){ bossLabRecordError('auto_optimizer',e); } },350); }
    try{ render(); }catch{}
    return record;
  }
  function bossLabObserveApi(url,data,meta={}){
    if(!bossLabCfg.enabled || !bossLabCfg.passiveCapture) return;
    const kind=bossLabApiKind(url); if(!kind) return;
    try{
      if(kind==='boss_list'){ bossLabIngestList(data); return; }
      if(kind==='active_modifiers'){ bossLabIngestActiveModifiers(data); return; }
      if(kind==='boss_attack'||kind==='boss_rematch'){
        const bossId=bossLabBossIdFromUrl(url);
        bossLabRecordFight(data,{bossId,kind:kind==='boss_rematch'?'rematch':'attack',at:meta.at||Date.now()});
      }
    }catch(e){ bossLabRecordError(`observe:${kind}`,e); }
  }
  function bossLabMeta(bossId){
    const rows=bossLab.battles.filter(x=>Number(x.bossId)===Number(bossId)&&x.detailLoaded&&x.eventSummary);
    if(!rows.length) return null;
    const sum=k=>rows.reduce((n,x)=>n+Number(x.eventSummary?.[k]||0),0);
    const attempts=sum('hits')+sum('misses'), hitRate=attempts?sum('hits')/attempts:null;
    const enemyAttempts=sum('enemyAttacks'), enemyHitRate=enemyAttempts?sum('enemyHits')/enemyAttempts:null;
    const critRate=sum('hits')?sum('crits')/sum('hits'):null;
    const cur=pvpLab.current?.summary?.combinedStats||{};
    const ev=bossLabMedianField(rows,'evasion',null) ?? (hitRate!=null?Math.max(0,Number(cur.accuracy_percent||105)-hitRate*100):25);
    const acc=bossLabMedianField(rows,'accuracy',null) ?? (enemyHitRate!=null?enemyHitRate*100+Number(cur.evasion_percent||25):110);
    const cr=bossLabMedianField(rows,'critResist',null) ?? (critRate!=null?Math.max(0,Number(cur.crit_chance_percent||15)-critRate*100):20);
    const turns=pvpLabMedian(rows.map(x=>Number(x.totalTurns)).filter(Number.isFinite),12);
    const close15=rows.filter(x=>Number(x.totalTurns)>=15 && Math.abs(Number(x.meHpPct||0)-Number(x.opponentHpPct||0))<=10).length;
    const wins=rows.filter(x=>x.won===true).length;
    const profile=bossLab.bosses[String(bossId)]||{};
    const drVals=rows.map(r=>{ const m=Number(r?.opponent?.damageTakenMult ?? r?.rawFighters?.opponent?.damageTakenMult); return Number.isFinite(m)?100-m:NaN; }).filter(Number.isFinite);
    return {
      bossId:Number(bossId),bossName:String(profile.name||rows.at(-1)?.bossName||`Boss ${bossId}`),n:rows.length,wins,wr:rows.length?wins/rows.length*100:null,
      detailedN:rows.length,medianTurns:turns,medianOpponentHp:bossLabMedianField(rows,'maxHp',Number(profile.hp||0)||null),hitRate,enemyHitRate,critRate,close15,
      opponent:{
        attack:bossLabMedianField(rows,'attack',Number(profile.attack||0)||0),defense:bossLabMedianField(rows,'defense',Number(profile.defense||0)||0),maxHp:bossLabMedianField(rows,'maxHp',Number(profile.hp||0)||0),
        evasion:ev,evasionDR:bossLabMedianField(rows,'evasionDR',Number(ev||0)/3.5),accuracy:acc,critResist:cr,
        critChance:bossLabMedianField(rows,'critChance',30),critDamage:bossLabMedianField(rows,'critDamage',65),bleedResist:bossLabMedianField(rows,'bleedResist',22),bleedChance:bossLabMedianField(rows,'bleedChance',35),
        stunResist:bossLabMedianField(rows,'stunResist',20),stunChance:bossLabMedianField(rows,'stunChance',10),healingReduction:bossLabMedianField(rows,'healingReduction',25),
        armorPen:bossLabMedianField(rows,'armorPen',28),counterAttack:bossLabMedianField(rows,'counterAttack',25),doubleStrike:bossLabMedianField(rows,'doubleStrike',30),
        lifesteal:bossLabMedianField(rows,'lifesteal',0),regen:bossLabMedianField(rows,'hpRegen',0),execute:bossLabMedianField(rows,'executeThreshold',0),firstStrike:bossLabMedianField(rows,'firstStrikeBonus',0),
        damageReduction:pvpLabMedian(drVals,20)
      },
      totals:{hits:sum('hits'),misses:sum('misses'),crits:sum('crits'),damageDealt:sum('damageDealt'),damageTaken:sum('damageTaken'),evades:sum('evades'),enemyHits:sum('enemyHits'),enemyAttacks:sum('enemyAttacks'),bleedDamageDealt:sum('bleedDamageDealt'),bleedDamageTaken:sum('bleedDamageTaken'),stunsGiven:sum('stunsGiven'),stunsTaken:sum('stunsTaken')}
    };
  }

  // Boss-specific expected-fight model. W v8.8.7 wynik jest dodatkowo kalibrowany do realnych replayów
  // tego samego bossa. Dzięki temu teoria (ATK/DEF/capy) zachowuje relacje między buildami, a skala obrażeń
  // i leczenia jest dopasowana do faktycznego silnika walki.
  function bossLabSkillBonusForBuild(code,attrsHint=null){
    try{
      const attrs=['str','end','agi','vit','prc'], raw=String(code||'').trim();
      const [aPart='',sPart='']=raw.split(':');
      const nums=aPart.split('/').map(Number);
      const a=attrsHint||((nums.length===5&&nums.every(Number.isFinite))?{str:nums[0],end:nums[1],agi:nums[2],vit:nums[3],prc:nums[4]}:null);
      if(!a) return {};
      const groups=sPart.split('/'), sb={};
      attrs.forEach((k,idx)=>{
        const letters=groups[idx]||'';
        const opts=pvpLabSkillOptions(k,Number(a[k]||0));
        opts.forEach((t,i)=>{
          const wanted=letters[i]||'';
          const sk=t.skills.find(x=>x.option===wanted);
          if(sk) pvpLabAddBonuses(sb,sk.bonuses);
        });
      });
      return sb;
    }catch{return {};}
  }
  function bossLabStatsFromFight(row){
    const m=row?.me||{};
    if(!(Number(m.attack)>0&&Number(m.defense)>=0&&Number(m.maxHp)>0)) return null;
    const dr=Number.isFinite(Number(m.damageTakenMult))?Math.max(0,100-Number(m.damageTakenMult)):Number(m.damageReduction||0);
    return {
      attack:Number(m.attack),defense:Number(m.defense),maxHp:Number(m.maxHp),regen:Number(m.hpRegen||0),
      eff:{
        accuracy_percent:Number(m.accuracy||0),evasion_percent:Number(m.evasion||0),damage_taken_reduction_percent:dr,
        crit_resist_percent:Number(m.critResist||0),bleed_resist_percent:Number(m.bleedResist||0),armor_pen_percent:Number(m.armorPen||0),
        double_strike_percent:Number(m.doubleStrike||0),counter_attack_percent:Number(m.counterAttack||0),execute_threshold_percent:Number(m.executeThreshold||0),
        lifesteal_percent:Number(m.lifesteal||0),healing_reduction_percent:Number(m.healingReduction||0),stun_chance_percent:Number(m.stunChance||0),
        crit_chance_percent:Number(m.critChance||0),crit_damage_percent:Number(m.critDamage||0),bleed_chance_percent:Number(m.bleedChance||0)
      },raw:bossLabSkillBonusForBuild(row?.buildCode,m.attributes||null)
    };
  }
  function bossLabCandidateEval(stats,meta,skillBonus={},calibration=null){
    if(!stats) return {score:-Infinity,winIndex:0,killTurns:99,survivalTurns:0,predictedWin:false,predictedOutcome:'BRAK_DANYCH',fightHpMargin:-Infinity};
    const c=stats.eff||{}, r=stats.raw||{}, o=meta?.opponent||{};
    const cap=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
    const baseDmg=(atk,def,pen,dr,eva)=>{
      const ed=Math.max(0,Number(def)||0)*(1-cap((Number(pen)||0)/100,0,.5));
      return Math.max(1,Number(atk)||0)*(1000/(1000+ed))*(1-cap((Number(dr)||0)/100,0,.60))*(1-cap((Number(eva)||0)/350,0,.16))*(2/3);
    };
    const MAX_TURNS=15;
    const bossHp=Math.max(1,Number(o.maxHp||meta?.medianOpponentHp||1)), bossAtk=Math.max(1,Number(o.attack||1)), bossDef=Math.max(0,Number(o.defense||0));
    const myMaxHp=Math.max(1,Number(stats.maxHp||0));
    const myHit=cap((Number(c.accuracy_percent||0)-Number(o.evasion||0))/100,.05,1), enemyHit=cap((Number(o.accuracy||0)-Number(c.evasion_percent||0))/100,.05,1);
    const myCrit=cap((Number(c.crit_chance_percent||0)-Number(o.critResist||0))/100,0,.65), enemyCrit=cap((Number(o.critChance||0)-Number(c.crit_resist_percent||0))/100,0,.65);
    const myCritF=1+myCrit*Number(c.crit_damage_percent||0)/100, enemyCritF=1+enemyCrit*Number(o.critDamage||65)/100;
    const myDouble=cap(Number(c.double_strike_percent||0)/100,0,.40), enemyDouble=cap(Number(o.doubleStrike||0)/100,0,.40);
    const myBase=baseDmg(stats.attack,bossDef,c.armor_pen_percent,o.damageReduction,o.evasion);
    const lowAtk=Number(skillBonus?.attack_percent_low_hp||0), lowDr=Number(skillBonus?.damage_taken_reduction_low_hp_percent||0), lowRegen=Number(skillBonus?.hp_regen_low_hp_flat||0);
    const refTurns=cap(meta?.medianTurns||10,1,MAX_TURNS);
    const momentumPct=Math.max(0,Number(r.attack_per_turn_percent||0));
    const rampF=1+momentumPct*Math.max(0,(refTurns-1)/2)/100;
    const lowAtkF=1+lowAtk*.40/100;
    const rawDirectDpt=myBase*myHit*(1+myDouble)*myCritF*rampF*lowAtkF;
    const rawCounterDpt=myBase*.75*(1-enemyHit)*(1+enemyDouble)*cap(Number(c.counter_attack_percent||0)/100,0,.40)*myCritF*rampF;
    const bleedP=cap((Number(c.bleed_chance_percent||0)-Number(o.bleedResist||0))/100,0,.80);
    const bleedActive=1-Math.pow(1-bleedP,Math.max(.25,myHit*(1+myDouble)*Math.min(4,refTurns/2)));
    const rawBleedDpt=Math.max(0,Number(stats.attack)||0)*.139*bleedActive;
    const stunP=cap((Number(c.stun_chance_percent||0)-Number(o.stunResist||0))/100,0,.35)*myHit;
    const rawMyDpt=(rawDirectDpt+rawCounterDpt+rawBleedDpt)*(1+.35*stunP);

    const avgDr=cap(Number(c.damage_taken_reduction_percent||0)+lowDr*.40,0,60);
    const bossBase=baseDmg(bossAtk,stats.defense,o.armorPen,avgDr,c.evasion_percent);
    const rawBossDirect=bossBase*enemyHit*(1+enemyDouble)*enemyCritF*(1-.70*stunP);
    const enemyBleedP=cap((Number(o.bleedChance||0)-Number(c.bleed_resist_percent||0))/100,0,.80);
    const enemyBleedActive=1-Math.pow(1-enemyBleedP,Math.max(.25,enemyHit*(1+enemyDouble)*Math.min(4,refTurns/2)));
    const rawEnemyBleedDpt=bossAtk*.139*enemyBleedActive;
    const rawIncomingDpt=Math.max(1,rawBossDirect+rawEnemyBleedDpt);

    const myHealRed=cap(Number(o.healingReduction||0)/100,0,.50), bossHealRed=cap(Number(c.healing_reduction_percent||0)/100,0,.50);
    const rawMyRegen=Math.min(20,Number(stats.regen||0)+lowRegen*.40)*(1-myHealRed);
    const rawMyLs=rawDirectDpt*cap(Number(c.lifesteal_percent||0)/100,0,.30)*(1-myHealRed);
    const rawBossRegen=Math.max(0,Number(o.regen||0))*(1-bossHealRed);
    const rawBossLs=rawBossDirect*cap(Number(o.lifesteal||0)/100,0,.30)*(1-bossHealRed);

    const cal=calibration||meta?.calibration||{};
    const outgoingFactor=cap(Number(cal.outgoingDamageFactor||1),.60,1.70);
    const incomingFactor=cap(Number(cal.incomingDamageFactor||1),.60,2.00);
    const myHealingFactor=cap(Number(cal.myHealingFactor||1),.40,1.80);
    const bossHealingFactor=cap(Number(cal.bossHealingFactor||1),.40,2.00);
    const myDpt=rawMyDpt*outgoingFactor, incomingDpt=rawIncomingDpt*incomingFactor;
    const myRegen=rawMyRegen*myHealingFactor, myLs=rawMyLs*myHealingFactor;
    const bossRegen=rawBossRegen*bossHealingFactor, bossLs=rawBossLs*bossHealingFactor;
    const myHealing=myRegen+myLs, bossHealing=bossRegen+bossLs;
    const netIncoming=Math.max(1,incomingDpt-myHealing);
    const netOutgoing=Math.max(1,myDpt-bossHealing);
    const execute=cap(Number(c.execute_threshold_percent||0)/100,0,.18);
    const enemyExecute=cap(Number(o.execute||0)/100,0,.18);
    const targetHp=bossHp*(1-execute);
    const killTurns=targetHp/netOutgoing, survivalTurns=myMaxHp/netIncoming;
    const winIndex=survivalTurns/Math.max(.25,killTurns);
    const marginTurns=survivalTurns-killTurns;

    // TIMEOUT-AWARE: kalibracja z replaya opisuje średnią siłę z refTurns.
    // Z replayów widać eskalację ~1 + turn/30, więc projekcja do 15 tur skaluje obrażenia względem
    // średniej eskalacji okresu kalibracyjnego. Regen pozostaje płaski; lifesteal rośnie z obrażeniami.
    const avgEsc=n=>1+(Math.max(1,Number(n)||1)+1)/60;
    const refEsc=Math.max(.50,avgEsc(refTurns));
    const refRamp=Math.max(.50,rampF);
    let simMe=myMaxHp, simBoss=bossHp;
    let predictedOutcome='TIMEOUT_DRAW',winBy='TIMEOUT_HP',decisionTurn=MAX_TURNS,predictedWin=false,draw=false;
    let simKillTurn=null,simDeathTurn=null;
    const timeline=[];
    for(let turn=1;turn<=MAX_TURNS;turn++){
      const escScale=(1+turn/30)/refEsc;
      const rampTurn=1+momentumPct*Math.max(0,turn-1)/100;
      const rampScale=rampTurn/refRamp;
      const outDmg=Math.max(0,myDpt*escScale*rampScale);
      const inDmg=Math.max(0,incomingDpt*escScale);
      const myLsTurn=Math.max(0,myLs*escScale*rampScale);
      const bossLsTurn=Math.max(0,bossLs*escScale);

      // Boss regeneruje się przed swoją fazą (zgodnie z replayem), potem atakuje pierwszy.
      simBoss=Math.min(bossHp,simBoss+bossRegen);
      if(enemyExecute>0 && simMe/myMaxHp<=enemyExecute){
        simMe=0; predictedOutcome='DEATH_EXECUTE'; winBy='DEATH'; decisionTurn=turn; simDeathTurn=turn;
        timeline.push({turn,myHp:0,bossHp:simBoss,event:'enemy_execute'}); break;
      }
      simMe-=inDmg;
      simBoss=Math.min(bossHp,simBoss+bossLsTurn);
      if(simMe<=0){
        simMe=0; predictedOutcome='DEATH'; winBy='DEATH'; decisionTurn=turn; simDeathTurn=turn;
        timeline.push({turn,myHp:0,bossHp:simBoss,event:'death'}); break;
      }

      // Nasz regen jest po fazie bossa, przed naszym atakiem.
      simMe=Math.min(myMaxHp,simMe+myRegen);
      if(execute>0 && simBoss/bossHp<=execute){
        simBoss=0; predictedOutcome='KILL_EXECUTE'; winBy='KILL'; decisionTurn=turn; predictedWin=true; simKillTurn=turn;
        timeline.push({turn,myHp:simMe,bossHp:0,event:'execute'}); break;
      }
      simBoss-=outDmg;
      simMe=Math.min(myMaxHp,simMe+myLsTurn);
      if(simBoss<=0){
        simBoss=0; predictedOutcome='KILL'; winBy='KILL'; decisionTurn=turn; predictedWin=true; simKillTurn=turn;
        timeline.push({turn,myHp:simMe,bossHp:0,event:'kill'}); break;
      }
      timeline.push({turn,myHp:Math.max(0,simMe),bossHp:Math.max(0,simBoss),event:'continue'});
    }

    let myHp15=null,bossHp15=null,hpMargin15=null;
    if(decisionTurn===MAX_TURNS && !simKillTurn && !simDeathTurn){
      myHp15=Math.max(0,simMe); bossHp15=Math.max(0,simBoss); hpMargin15=myHp15-bossHp15;
      const eps=1;
      if(hpMargin15>eps){ predictedOutcome='TIMEOUT_WIN'; winBy='TIMEOUT_HP'; predictedWin=true; draw=false; }
      else if(hpMargin15<-eps){ predictedOutcome='TIMEOUT_LOSS'; winBy='TIMEOUT_HP'; predictedWin=false; draw=false; }
      else { predictedOutcome='TIMEOUT_DRAW'; winBy='TIMEOUT_HP'; predictedWin=false; draw=true; }
    }

    const fightHpMargin=predictedWin
      ? (winBy==='KILL'?Math.max(0,simMe):Number(hpMargin15||0))
      : (winBy==='DEATH'?-Math.max(0,simBoss):Number(hpMargin15||0));
    const projectedMe=myHp15==null?Math.max(0,simMe):myHp15;
    const projectedBoss=bossHp15==null?Math.max(0,simBoss):bossHp15;
    const resultScore=fightHpMargin + (predictedWin?1000000:0) + (draw?0:-0.001*decisionTurn);
    const score=resultScore/Math.max(1,bossHp) + winIndex*.01;

    return {
      score,winIndex,killTurns,survivalTurns,marginTurns,myDpt,enemyDpt:incomingDpt,netIncoming,netOutgoing,myHealing,bossHealing,
      myRegen,myLs,bossRegen,bossLs,rawMyDpt,rawIncomingDpt,rawMyHealing:rawMyRegen+rawMyLs,rawBossHealing:rawBossRegen+rawBossLs,
      projectedMe,projectedBoss,myHit,enemyHit,bleedActive,enemyBleedActive,
      maxTurns:MAX_TURNS,referenceTurns:refTurns,referenceEscalation:refEsc,
      predictedOutcome,winBy,decisionTurn,predictedWin,draw,myHp15,bossHp15,hpMargin15,fightHpMargin,simKillTurn,simDeathTurn,
      timeline,
      calibration:{outgoingFactor,incomingFactor,myHealingFactor,bossHealingFactor}
    };
  }
  function bossLabCalibration(bossId,meta){
    const rows=bossLab.battles.filter(x=>Number(x.bossId)===Number(bossId)&&x.detailLoaded&&x.eventSummary&&Number(x.totalTurns)>0);
    const ratios={out:[],inc:[],myHeal:[],bossHeal:[],netIn:[],netOut:[]}, details=[];
    const sane=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
    for(const row of rows){
      const st=bossLabStatsFromFight(row); if(!st) continue;
      const sb=st.raw||{}, ev=bossLabCandidateEval(st,meta,sb,{outgoingDamageFactor:1,incomingDamageFactor:1,myHealingFactor:1,bossHealingFactor:1});
      const t=Math.max(1,Number(row.totalTurns||1)), es=row.eventSummary||{};
      const actualOut=Math.max(0,Number(es.damageDealt||0))/t;
      const actualInc=Math.max(0,Number(es.damageTaken||0))/t;
      const actualMyHeal=(Math.max(0,Number(es.regen||0))+Math.max(0,Number(es.lifesteal||0)))/t;
      const actualBossHeal=(Math.max(0,Number(es.enemyRegen||0))+Math.max(0,Number(es.enemyLifesteal||0)))/t;
      const startMe=Number(row.me?.startHp??row.me?.maxHp), finalMe=Math.max(0,Number(row.me?.finalHp||0));
      const startBoss=Number(row.opponent?.startHp??row.opponent?.maxHp), finalBoss=Math.max(0,Number(row.opponent?.finalHp||0));
      const actualNetIn=(Number.isFinite(startMe)&&startMe>0)?Math.max(0,startMe-finalMe)/t:Math.max(0,actualInc-actualMyHeal);
      const actualNetOut=(Number.isFinite(startBoss)&&startBoss>0)?Math.max(0,startBoss-finalBoss)/t:Math.max(0,actualOut-actualBossHeal);
      const ro=ev.rawMyDpt>1?actualOut/ev.rawMyDpt:NaN, ri=ev.rawIncomingDpt>1?actualInc/ev.rawIncomingDpt:NaN;
      const rmh=ev.rawMyHealing>1&&actualMyHeal>0?actualMyHeal/ev.rawMyHealing:NaN, rbh=ev.rawBossHealing>1&&actualBossHeal>0?actualBossHeal/ev.rawBossHealing:NaN;
      const rni=ev.netIncoming>1&&actualNetIn>0?actualNetIn/ev.netIncoming:NaN, rno=ev.netOutgoing>1&&actualNetOut>0?actualNetOut/ev.netOutgoing:NaN;
      if(sane(ro,.25,3)) ratios.out.push(ro); if(sane(ri,.25,3)) ratios.inc.push(ri); if(sane(rmh,.20,4)) ratios.myHeal.push(rmh); if(sane(rbh,.20,4)) ratios.bossHeal.push(rbh); if(sane(rni,.20,4)) ratios.netIn.push(rni); if(sane(rno,.20,4)) ratios.netOut.push(rno);
      details.push({battleId:row.battleId,turns:t,build:row.buildCode||'',actual:{damageOut:actualOut,damageIn:actualInc,myHealing:actualMyHeal,bossHealing:actualBossHeal,netIn:actualNetIn,netOut:actualNetOut},model:{damageOut:ev.rawMyDpt,damageIn:ev.rawIncomingDpt,myHealing:ev.rawMyHealing,bossHealing:ev.rawBossHealing,netIn:ev.netIncoming,netOut:ev.netOutgoing}});
    }
    const med=(arr,fallback)=>arr.length?pvpLabMedian(arr,fallback):fallback;
    return {
      n:details.length,
      outgoingDamageFactor:Math.max(.60,Math.min(1.70,med(ratios.out,1))),
      incomingDamageFactor:Math.max(.60,Math.min(2.00,med(ratios.inc,1))),
      myHealingFactor:Math.max(.40,Math.min(1.80,med(ratios.myHeal,1))),
      bossHealingFactor:Math.max(.40,Math.min(2.00,med(ratios.bossHeal,1))),
      observedNetIncomingFactor:med(ratios.netIn,1),observedNetOutgoingFactor:med(ratios.netOut,1),details
    };
  }
  function bossLabCandidateScore(stats,meta,skillBonus={},calibration=null){ return bossLabCandidateEval(stats,meta,skillBonus,calibration).score; }

  function bossLabRunOptimizer(bossId){
    const started=Date.now(), key=String(Number(bossId||0));
    try{
      if(!bossLabCfg.optimizerEnabled){ bossLab.optimizers[key]={status:'OFF',at:Date.now()}; bossLabSave(); return bossLab.optimizers[key]; }
      const meta=bossLabMeta(bossId), currentAttrs=pvpLabCurrentAttrs(), external=pvpLabExternalVector(), activeBossBuffs=bossLabCurrentBossBuffs();
      if(!meta){ bossLab.optimizers[key]={status:'CZEKA NA PEŁNĄ WALKĘ Z BOSSEM',at:Date.now()}; bossLabSave(); return bossLab.optimizers[key]; }
      const attrs=['str','end','agi','vit','prc'];
      const missingTrees=attrs.filter(a=>!Array.isArray(pvpLab.skillTrees?.[a]?.skillTree));
      if(!currentAttrs || !pvpLab.current?.summary?.combatStats){ bossLab.optimizers[key]={status:'CZEKA NA SNAPSHOT PVP',at:Date.now(),meta}; bossLabSave(); return bossLab.optimizers[key]; }
      if(missingTrees.length){ bossLab.optimizers[key]={status:`CZEKA NA DRZEWKA: ${missingTrees.join(',').toUpperCase()}`,at:Date.now(),meta}; bossLabSave(); return bossLab.optimizers[key]; }

      const calibration=bossLabCalibration(bossId,meta); meta.calibration=calibration;
      const pre=pvpLabPrecomputedSkillPlans(meta);
      const rems=[[2,0,0,0,0],[0,2,0,0,0],[0,0,2,0,0],[0,0,0,2,0],[0,0,0,0,2],[1,1,0,0,0],[1,0,1,0,0],[1,0,0,1,0],[1,0,0,0,1],[0,1,1,0,0],[0,1,0,1,0],[0,1,0,0,1],[0,0,1,1,0],[0,0,1,0,1],[0,0,0,1,1]];
      let examined=0;

      const buildCandidate=(a,mode='greedy',seedPlan=null)=>{
        const sb={},plan={};
        for(const k of attrs){
          const opts=pvpLabSkillOptions(k,Number(a[k]||0));
          const greedy=pre[k][a[k]]?.letters||'';
          const letters=[];
          opts.forEach((t,i)=>{
            let wanted='';
            if(seedPlan && seedPlan[k] && seedPlan[k][i]) wanted=seedPlan[k][i];
            else if(mode==='A') wanted='A';
            else if(mode==='B') wanted='B';
            else wanted=greedy[i]||'A';
            const sk=t.skills.find(x=>x.option===wanted)||t.skills.find(x=>x.option===(greedy[i]||''))||t.skills[0];
            if(sk){ letters.push(sk.option); pvpLabAddBonuses(sb,sk.bonuses); }
          });
          plan[k]=letters.join('');
        }
        const st=bossLabApplyBossBuffs(pvpLabCandidateStats(a,sb,external),activeBossBuffs), ev=bossLabCandidateEval(st,meta,sb,calibration);
        examined++;
        return {attrs:{...a},skillBonus:sb,plan,stats:st,score:ev.score,ev};
      };

      const objValue=(x,obj)=>{
        const e=x?.ev||{};
        if(obj==='result') return Number(e.fightHpMargin??-1e12);
        if(obj==='timeout') return e.hpMargin15==null?-1e12:Number(e.hpMargin15);
        if(obj==='survival') return Number(e.survivalTurns??-999);
        if(obj==='damage') return Number(e.netOutgoing??-999);
        if(obj==='kill') return -Number(e.killTurns??999);
        if(obj==='win') return Number(e.winIndex??-999);
        return Number(e.fightHpMargin??-1e12);
      };
      const better=(a,b,obj)=>{
        if(!b) return true;
        const ae=a?.ev||{},be=b?.ev||{};
        if(obj==='result'){
          const aw=!!ae.predictedWin,bw=!!be.predictedWin;
          if(aw!==bw) return aw;
        }
        const av=objValue(a,obj),bv=objValue(b,obj); if(Math.abs(av-bv)>1e-10) return av>bv;
        const ar=Number(ae.fightHpMargin??-1e12),br=Number(be.fightHpMargin??-1e12); if(Math.abs(ar-br)>1e-10) return ar>br;
        const at=Number(ae.hpMargin15??-1e12),bt=Number(be.hpMargin15??-1e12); if(Math.abs(at-bt)>1e-10) return at>bt;
        const awi=Number(ae.winIndex??-999),bwi=Number(be.winIndex??-999); if(Math.abs(awi-bwi)>1e-10) return awi>bwi;
        return Number(ae.killTurns??999)<Number(be.killTurns??999);
      };
      const pools={result:[],timeout:[],survival:[],damage:[],kill:[],win:[]};
      const poolLimit={result:90,timeout:45,survival:30,damage:30,kill:30,win:30};
      const pushPool=(obj,x)=>{
        const p=pools[obj],lim=poolLimit[obj];
        if(p.length>=lim && !better(x,p[p.length-1],obj)) return;
        p.push(x); p.sort((a,b)=>better(a,b,obj)?-1:better(b,a,obj)?1:0); if(p.length>lim) p.length=lim;
      };
      const addAllPools=x=>{ for(const o of Object.keys(pools)) pushPool(o,x); };

      // Faza 1: pełny sweep breakpointów 5-lvl + dwóch pozostałych punktów.
      // Każdy rozkład ma trzy niezależne starty A/B, aby nie zgubić buildów timeoutowych/tankowych.
      for(let ts=0;ts<=10;ts++) for(let te=0;te<=10;te++) for(let ta=0;ta<=10;ta++) for(let tv=0;tv<=10;tv++){
        const tp=26-ts-te-ta-tv; if(tp<0||tp>10) continue;
        const base={str:ts*5,end:te*5,agi:ta*5,vit:tv*5,prc:tp*5};
        for(const r of rems){
          const a={str:base.str+r[0],end:base.end+r[1],agi:base.agi+r[2],vit:base.vit+r[3],prc:base.prc+r[4]};
          if(attrs.some(k=>a[k]>50)) continue;
          addAllPools(buildCandidate(a,'greedy'));
          addAllPools(buildCandidate(a,'A'));
          addAllPools(buildCandidate(a,'B'));
        }
      }

      const optimizeSkills=(cand,obj,passes=5)=>{
        let best=cand;
        const selections={};
        for(const k of attrs){
          selections[k]=[];
          const opts=pvpLabSkillOptions(k,best.attrs[k]);
          opts.forEach((t,i)=>{
            const wanted=(best.plan[k]||'')[i]||pre[k][best.attrs[k]]?.letters?.[i]||'A';
            const sk=t.skills.find(x=>x.option===wanted)||t.skills[0];
            if(sk) selections[k].push({skill:sk,choices:t.skills});
          });
        }
        const rebuild=()=>{
          const sb={},plan={};
          for(const k of attrs){ plan[k]=selections[k].map(x=>x.skill.option).join(''); for(const x of selections[k]) pvpLabAddBonuses(sb,x.skill.bonuses); }
          const st=bossLabApplyBossBuffs(pvpLabCandidateStats(best.attrs,sb,external),activeBossBuffs),ev=bossLabCandidateEval(st,meta,sb,calibration); examined++;
          return {attrs:{...best.attrs},skillBonus:sb,plan,stats:st,score:ev.score,ev};
        };
        best=rebuild();
        for(let pass=0;pass<passes;pass++){
          let improved=false;
          for(const k of attrs) for(const sel of selections[k]){
            const old=sel.skill;
            for(const alt of sel.choices){
              if(alt===old) continue;
              sel.skill=alt; const test=rebuild();
              if(better(test,best,obj)){ best=test; improved=true; } else sel.skill=old;
            }
          }
          if(!improved) break;
        }
        return best;
      };

      const refine=(cand,obj)=>{
        let best=optimizeSkills(cand,obj,3);
        for(let pass=0;pass<8;pass++){
          let next=best;
          for(const from of attrs) for(const to of attrs){
            if(from===to||best.attrs[from]<=0||best.attrs[to]>=50) continue;
            const a={...best.attrs,[from]:best.attrs[from]-1,[to]:best.attrs[to]+1};
            const test=buildCandidate(a,'greedy',best.plan);
            if(better(test,next,obj)) next=test;
          }
          if(next===best) break;
          best=optimizeSkills(next,obj,2);
        }
        return optimizeSkills(best,obj,5);
      };

      const jobs=[];
      for(const [obj,p] of Object.entries(pools)){
        const take=obj==='result'?65:obj==='timeout'?25:15;
        for(const x of p.slice(0,take)) jobs.push({obj,x});
      }
      const jobSeen=new Set(),refined=[];
      for(const j of jobs){
        const code=pvpLabBuildCode(j.x.attrs,j.x.plan),sig=`${j.obj}|${code}`; if(jobSeen.has(sig)) continue; jobSeen.add(sig);
        refined.push(refine(j.x,j.obj));
      }

      // Ostatni polish pod faktyczny wynik walki (kill albo HP po 15 turach).
      const resultSeeds=refined.slice().sort((a,b)=>better(a,b,'result')?-1:better(b,a,'result')?1:0).slice(0,32);
      for(const x of resultSeeds) refined.push(refine(x,'result'));

      const dedupe=(arr)=>{
        const m=new Map();
        for(const x of arr){ const code=pvpLabBuildCode(x.attrs,x.plan),old=m.get(code); if(!old||better(x,old,'result')) m.set(code,x); }
        return [...m.values()];
      };
      const allFinal=dedupe(refined.concat(...Object.values(pools).map(p=>p.slice(0,12))));
      const byObj=obj=>allFinal.slice().sort((a,b)=>better(a,b,obj)?-1:better(b,a,obj)?1:0);
      const resultRank=byObj('result');
      const best=resultRank[0]||null, bestTimeout=byObj('timeout')[0]||null, maxSurvival=byObj('survival')[0]||null, maxDamage=byObj('damage')[0]||null, fastestKill=byObj('kill')[0]||null, maxWin=byObj('win')[0]||null;

      const currentPlan={},curCode=pvpLabCurrentBuild(),parts=curCode.split(':')[1]?.split('/')||[]; attrs.forEach((k,i)=>currentPlan[k]=parts[i]||'');
      const currentSkill={}; for(const k of attrs){ const opts=pvpLabSkillOptions(k,currentAttrs[k]),letters=currentPlan[k]||''; opts.forEach((t,i)=>{ const sk=t.skills.find(x=>x.option===(letters[i]||'')); if(sk) pvpLabAddBonuses(currentSkill,sk.bonuses); }); }
      const curStats=bossLabApplyBossBuffs(pvpLabCandidateStats(currentAttrs,currentSkill,external),activeBossBuffs),curEval=bossLabCandidateEval(curStats,meta,currentSkill,calibration);
      const bossMaxHp=Math.max(1,Number(meta?.opponent?.maxHp||meta?.medianOpponentHp||1));
      const curFightMargin=Number(curEval.fightHpMargin||0);

      const rowOf=(x,rank=1)=>{
        if(!x) return null; const ev=x.ev||bossLabCandidateEval(x.stats,meta,x.skillBonus,calibration);
        const rel=100+100*(Number(ev.fightHpMargin||0)-curFightMargin)/bossMaxHp;
        return {rank,build:pvpLabBuildCode(x.attrs,x.plan),attrs:x.attrs,plan:x.plan,metaScore:x.score,relativeIndex:rel,
          estimate:{
            predictedWin:!!ev.predictedWin,predictedOutcome:ev.predictedOutcome,winBy:ev.winBy,decisionTurn:ev.decisionTurn,
            fightHpMargin:ev.fightHpMargin,myHp15:ev.myHp15,bossHp15:ev.bossHp15,hpMargin15:ev.hpMargin15,
            winIndex:ev.winIndex,killTurns:ev.killTurns,survivalTurns:ev.survivalTurns,marginTurns:ev.marginTurns,
            myDpt:ev.myDpt,enemyDpt:ev.enemyDpt,netIncoming:ev.netIncoming,netOutgoing:ev.netOutgoing,
            myHealing:ev.myHealing,bossHealing:ev.bossHealing,myHit:ev.myHit,enemyHit:ev.enemyHit,
            referenceTurns:ev.referenceTurns,referenceEscalation:ev.referenceEscalation
          },
          combat:{attack:Math.round(x.stats.attack),defense:Math.round(x.stats.defense),maxHp:Math.round(x.stats.maxHp)},
          effective:{accuracy:x.stats.eff.accuracy_percent,evasion:x.stats.eff.evasion_percent,damageReduction:x.stats.eff.damage_taken_reduction_percent,critResist:x.stats.eff.crit_resist_percent,bleedResist:x.stats.eff.bleed_resist_percent,armorPen:x.stats.eff.armor_pen_percent,doubleStrike:x.stats.eff.double_strike_percent,counterAttack:x.stats.eff.counter_attack_percent,execute:x.stats.eff.execute_threshold_percent,lifesteal:x.stats.eff.lifesteal_percent,regen:x.stats.regen}};
      };
      const ranked=resultRank.slice(0,10).map((x,i)=>rowOf(x,i+1));
      const bestRow=ranked[0]||null,bestEst=bestRow?.estimate||{};
      const bestFightMargin=Number(bestEst.fightHpMargin??-1e12);
      const predictedWin=!!bestEst.predictedWin;
      const safetyHp=Math.max(200,bossMaxHp*.05);
      const verdict=!bestRow?'BRAK DANYCH':predictedWin&&bestFightMargin>=safetyHp?'ATAKUJ':predictedWin&&bestFightMargin>0?'RYZYKO':'NIE ATAKUJ';
      const hpGap=Math.max(0,-bestFightMargin);
      const oldGapTurns=Math.max(0,-Number(bestEst.marginTurns||0));

      // Minimalny DODATKOWY dedykowany boss-only bonus potrzebny do prawdziwej prognozowanej wygranej:
      // zabicie przed śmiercią ALBO przewaga bezwzględnego HP po 15 turach.
      const isPredictedWin=e=>!!e?.predictedWin && Number(e?.fightHpMargin||0)>0;
      const minExtraBossBuff=(field,maxValue)=>{
        let out=null;
        for(const x of allFinal){
          if(!x?.stats) continue;
          const e0=x.ev||bossLabCandidateEval(x.stats,meta,x.skillBonus,calibration);
          if(isPredictedWin(e0)){
            const cand={value:0,build:pvpLabBuildCode(x.attrs,x.plan),estimate:e0};
            if(!out||cand.value<out.value) out=cand;
            continue;
          }
          const testMax=bossLabCandidateEval(bossLabApplyBossBuffs(x.stats,{[field]:maxValue}),meta,x.skillBonus,calibration);
          if(!isPredictedWin(testMax)) continue;
          let lo=0,hi=maxValue;
          while(lo<hi){
            const mid=Math.floor((lo+hi)/2);
            const ev=bossLabCandidateEval(bossLabApplyBossBuffs(x.stats,{[field]:mid}),meta,x.skillBonus,calibration);
            if(isPredictedWin(ev)) hi=mid; else lo=mid+1;
          }
          const ev=bossLabCandidateEval(bossLabApplyBossBuffs(x.stats,{[field]:lo}),meta,x.skillBonus,calibration);
          const cand={value:lo,build:pvpLabBuildCode(x.attrs,x.plan),estimate:{predictedWin:ev.predictedWin,predictedOutcome:ev.predictedOutcome,winBy:ev.winBy,decisionTurn:ev.decisionTurn,fightHpMargin:ev.fightHpMargin,myHp15:ev.myHp15,bossHp15:ev.bossHp15,hpMargin15:ev.hpMargin15,marginTurns:ev.marginTurns,killTurns:ev.killTurns,survivalTurns:ev.survivalTurns,winIndex:ev.winIndex}};
          if(!out||cand.value<out.value||(cand.value===out.value&&Number(cand.estimate.fightHpMargin||0)>Number(out.estimate?.fightHpMargin||0))) out=cand;
        }
        return out;
      };
      const requiredFlatBossBuffs={
        attack:minExtraBossBuff('attack',5000),
        defense:minExtraBossBuff('defense',5000),
        maxHp:minExtraBossBuff('maxHp',15000)
      };

      const curRow={
        build:curCode,attrs:currentAttrs,relativeIndex:100,
        estimate:{
          predictedWin:!!curEval.predictedWin,predictedOutcome:curEval.predictedOutcome,winBy:curEval.winBy,decisionTurn:curEval.decisionTurn,
          fightHpMargin:curEval.fightHpMargin,myHp15:curEval.myHp15,bossHp15:curEval.bossHp15,hpMargin15:curEval.hpMargin15,
          winIndex:curEval.winIndex,killTurns:curEval.killTurns,survivalTurns:curEval.survivalTurns,marginTurns:curEval.marginTurns,
          myDpt:curEval.myDpt,enemyDpt:curEval.enemyDpt,netIncoming:curEval.netIncoming,netOutgoing:curEval.netOutgoing,
          myHealing:curEval.myHealing,bossHealing:curEval.bossHealing,myHit:curEval.myHit,enemyHit:curEval.enemyHit,
          referenceTurns:curEval.referenceTurns,referenceEscalation:curEval.referenceEscalation
        },
        combat:curStats?{attack:Math.round(curStats.attack),defense:Math.round(curStats.defense),maxHp:Math.round(curStats.maxHp)}:null
      };

      bossLab.optimizers[key]={
        status:'OK',at:Date.now(),durationMs:Date.now()-started,method:BOSS_OPTIMIZER_METHOD,
        bossId:Number(bossId),bossName:meta.bossName,confidence:calibration.n>=5?'WYSOKA':calibration.n>=3?'ŚREDNIA':'WSTĘPNA',
        verdict,calibration,meta,current:curRow,best:bestRow,top:ranked,
        extremes:{
          bestResult:rowOf(best,1),bestTimeout:rowOf(bestTimeout,1),maxMargin:rowOf(best,1),
          maxSurvival:rowOf(maxSurvival,1),maxDamage:rowOf(maxDamage,1),fastestKill:rowOf(fastestKill,1),maxWinIndex:rowOf(maxWin,1)
        },
        diagnostics:{
          examinedCandidates:examined,uniqueFinalists:allFinal.length,timeoutCandidates:allFinal.filter(x=>x?.ev?.hpMargin15!=null).length,
          hpGap,oldGapTurns,safetyHp,winningBuildFound:predictedWin,
          timeoutRule:{maxTurns:15,winner:'higher_absolute_hp_if_both_alive'},
          activeBossBuffs:bossLabClone(activeBossBuffs),requiredFlatBossBuffs
        },
        searchNote:'BOSS SIM v6 TIMEOUT-AWARE / 15T HP-FIRST: wynik = kill/death przed 15 turą, a gdy obie strony żyją po 15 — wygrywa większe bezwzględne HP. Ranking #1 = predictedWin + fightHpMargin. Projekcja 15T uwzględnia eskalację ~1+turn/30, ATK/turę, execute, regen i lifesteal. Boss-only buffy z /active-modifiers są doliczane. Boss nie wpływa na PvP Meta.'
      };
      bossLabSave(); return bossLab.optimizers[key];
    }catch(e){ bossLab.optimizers[key]={status:'BŁĄD OPTIMIZERA',at:Date.now(),error:String(e?.message||e)}; bossLabRecordError(`optimizer:${bossId}`,e); bossLabSave(); return bossLab.optimizers[key]; }
  }
  async function bossLabSync({silent=false}={}){
    if(bossLab.syncing) return;
    if(!__mgSessionTemplate){ bossLab.syncStatus='CZEKA NA SESJĘ API'; bossLabSave(); if(!silent) alert('Boss Lab czeka na sesję API. Otwórz ekran gry, np. Bossy, i spróbuj ponownie.'); return; }
    bossLab.syncing=true; bossLab.syncStatus='SYNCHRONIZUJĘ';
    try{
      await pvpLabRefreshCurrent();
      const id=pvpLabOwnId();
      const [list,mods]=await Promise.all([
        apiActive(`/api/boss-combat/${id}/bosses`).catch(e=>{bossLabRecordError('boss_list_sync',e);return null;}),
        apiActive(`/api/character/${id}/active-modifiers`).catch(e=>{bossLabRecordError('active_modifiers_sync',e);return null;})
      ]);
      if(list) bossLabIngestList(list);
      if(mods) bossLabIngestActiveModifiers(mods);
      for(const k of Object.keys(bossLab.bosses)){
        if(!bossLab.battles.some(x=>Number(x.bossId)===Number(k))) continue;
        const oldOpt=bossLab.optimizers[String(k)];
        if(oldOpt && oldOpt.method!==BOSS_OPTIMIZER_METHOD){
          bossLab.optimizers[String(k)]={status:'WYMAGA PRZELICZENIA V6',at:0,method:'STALE',staleMethod:String(oldOpt.method||'BRAK'),staleAt:Number(oldOpt.at||0)};
        }
        bossLabRunOptimizer(Number(k));
      }
      bossLab.syncStatus='OK • V6 świeże • gotowy na walkę';
    }catch(e){ bossLab.syncStatus='BŁĄD'; bossLabRecordError('sync',e); if(!silent) alert(`Boss Lab: ${String(e?.message||e)}`); }
    finally{ bossLab.syncing=false; bossLabSave(); try{render();}catch{} }
  }
  function bossLabExport(){
    // Eksport ma być dowodem aktualnego wyniku, a nie kopią starego cache.
    // Dlatego dla ostatnio walczonego bossa wymuszamy V6, jeśli wynik jest brakujący/stary.
    const latest=bossLab.battles.slice().sort((a,b)=>Number(b.createdAt||b.capturedAt||0)-Number(a.createdAt||a.capturedAt||0))[0]||null;
    if(latest?.bossId){
      const k=String(Number(latest.bossId||0)), oldOpt=bossLab.optimizers[k];
      if(!oldOpt || oldOpt.method!==BOSS_OPTIMIZER_METHOD || oldOpt.status!=='OK'){
        bossLab.syncStatus='PRZELICZAM V6 PRZED EKSPORTEM';
        bossLabRunOptimizer(Number(latest.bossId));
      }
    }
    const obj={
      version:VERSION,generatedAt:nowIso(),characterId:pvpLabOwnId(),optimizerSchema:6,optimizerMethod:BOSS_OPTIMIZER_METHOD,
      config:{...bossLabCfg},bosses:bossLab.bosses,battles:bossLab.battles,optimizers:bossLab.optimizers,errors:bossLab.errors,
      activeModifiers:bossLab.activeModifiers||{},activeModifiersAt:bossLab.activeModifiersAt||0,currentBossBuffs:bossLabCurrentBossBuffs(),
      currentPvp:{build:pvpLabCurrentBuild(),attributes:pvpLabCurrentAttrs(),summary:pvpLab.current?.summary||null}
    };
    bossLabSave();
    downloadBlob(JSON.stringify(obj,null,2),`pomagier_boss_lab_${new Date().toISOString().replaceAll(':','-')}.json`,'application/json');
  }
  function bossLabHTML(){
    const all=Object.values(bossLab.bosses||{}).sort((a,b)=>Number(b.lastFightAt||0)-Number(a.lastFightAt||0)||Number(a.id||0)-Number(b.id||0));
    const latest=bossLab.battles.slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))[0]||null;
    const focusId=Number(latest?.bossId||all.find(x=>x.status==='current')?.id||0),opt=focusId?bossLab.optimizers[String(focusId)]||{}:{};
    const best=opt?.best;
    const est=best?.estimate||{}, curEst=opt?.current?.estimate||{};
    const verdict=String(opt?.verdict||'—');
    const verdictClass=verdict==='ATAKUJ'?'ok':verdict==='NIE ATAKUJ'?'bad':'';
    const optimizerFresh=opt?.method===BOSS_OPTIMIZER_METHOD;
    const cal=opt?.calibration||{},diag=opt?.diagnostics||{},ext=opt?.extremes||{};
    const outcomeLabel=o=>({
      KILL:'KILL',KILL_EXECUTE:'KILL / EGZEKUCJA',DEATH:'ŚMIERĆ',DEATH_EXECUTE:'ŚMIERĆ / EGZEKUCJA',
      TIMEOUT_WIN:'15T — WYGRANA HP',TIMEOUT_LOSS:'15T — PRZEGRANA HP',TIMEOUT_DRAW:'15T — REMIS HP'
    }[String(o||'')]||String(o||'—'));
    const hp=(v)=>v==null?'—':Math.round(Number(v)||0);
    const signed=(v,d=0)=>{ const n=Number(v||0); return `${n>=0?'+':''}${n.toFixed(d)}`; };
    const fmtSpecial=(label,row)=>{
      if(!row) return '';
      const e=row.estimate||{},timeout=e.myHp15!=null&&e.bossHp15!=null;
      return `<div class="sub"><b>${label}:</b> ${esc(row.build)} • <b>${esc(outcomeLabel(e.predictedOutcome))}</b> • wynik HP ${signed(e.fightHpMargin,0)}${timeout?` • HP@15 ${hp(e.myHp15)} : ${hp(e.bossHp15)} (${signed(e.hpMargin15,0)})`:''} • kill~${Number(e.killTurns||0).toFixed(1)} / survive~${Number(e.survivalTurns||0).toFixed(1)}</div>`;
    };
    const bb=diag.activeBossBuffs||bossLabCurrentBossBuffs(), req=diag.requiredFlatBossBuffs||{};
    const reqTxt=!diag.winningBuildFound
      ? `<div class="sub"><b>Boss-only buffy:</b> aktywne ATK +${Number(bb.attack||0)} • DEF +${Number(bb.defense||0)} • HP +${Number(bb.maxHp||0)}.${req.attack||req.defense||req.maxHp?` Minimalnie do prognozowanej wygranej (każdy wariant osobno): ${req.attack?`ATK +${Number(req.attack.value||0)} (${esc(req.attack.build||'')}, ${esc(outcomeLabel(req.attack.estimate?.predictedOutcome))})`:'ATK > zakres'} • ${req.defense?`DEF +${Number(req.defense.value||0)} (${esc(req.defense.build||'')}, ${esc(outcomeLabel(req.defense.estimate?.predictedOutcome))})`:'DEF > zakres'} • ${req.maxHp?`HP +${Number(req.maxHp.value||0)} (${esc(req.maxHp.build||'')}, ${esc(outcomeLabel(req.maxHp.estimate?.predictedOutcome))})`:'HP > zakres'}.`:''}</div>`
      : `<div class="sub"><b>Boss-only buffy:</b> aktywne ATK +${Number(bb.attack||0)} • DEF +${Number(bb.defense||0)} • HP +${Number(bb.maxHp||0)}.</div>`;
    const bestBox=best && optimizerFresh
      ? `<div class="pvp-best-build"><b>${esc(best.build)}</b><span>${esc(opt.confidence||'WSTĘPNA')} pewność • indeks wyniku ${Number(best.relativeIndex||0).toFixed(1)} vs aktualny 100 • ATK ${best.combat.attack} / DEF ${best.combat.defense} / HP ${best.combat.maxHp}</span></div>
         <div class="sub"><b>WERDYKT:</b> <span class="${verdictClass}"><b>${esc(verdict)}</b></span> • prognoza <b>${esc(outcomeLabel(est.predictedOutcome))}</b> • rozstrzygnięcie ~tura ${Number(est.decisionTurn||15).toFixed(0)} • wynik HP ${signed(est.fightHpMargin,0)}.${est.myHp15!=null&&est.bossHp15!=null?` <b>HP po 15:</b> Ty ${hp(est.myHp15)} / Boss ${hp(est.bossHp15)} → ${signed(est.hpMargin15,0)}.`:''}</div>
         <div class="sub"><b>Aktualny build:</b> ${esc(outcomeLabel(curEst.predictedOutcome))} • wynik HP ${signed(curEst.fightHpMargin,0)}${curEst.myHp15!=null&&curEst.bossHp15!=null?` • HP@15 ${hp(curEst.myHp15)} : ${hp(curEst.bossHp15)}`:''}. Diagnostycznie: kill ~${Number(est.killTurns||0).toFixed(1)} • survive ~${Number(est.survivalTurns||0).toFixed(1)} • stary marginTurns ${signed(est.marginTurns,1)}.</div>
         <div class="sub"><b>Kalibracja replay:</b> N=${Number(cal.n||0)} • DMG→ ${Number(cal.outgoingDamageFactor||1).toFixed(2)}× • DMG← ${Number(cal.incomingDamageFactor||1).toFixed(2)}× • leczenie moje ${Number(cal.myHealingFactor||1).toFixed(2)}× • leczenie bossa ${Number(cal.bossHealingFactor||1).toFixed(2)}×.</div>
         <div class="sub"><b>15T HP-FIRST:</b> sprawdzono ${Number(diag.examinedCandidates||0).toLocaleString('pl-PL')} wariantów • finalistów ${Number(diag.uniqueFinalists||0)} • timeoutowych ${Number(diag.timeoutCandidates||0)}${diag.winningBuildFound?` • znaleziono przewidywaną wygraną • bufor do ATAKUJ: ${Math.round(Number(diag.safetyHp||0))} HP`:` • do najlepszego wyniku brakuje ~${Math.round(Number(diag.hpGap||0))} HP`}.</div>
         ${reqTxt}${fmtSpecial('BEST RESULT',ext.bestResult||ext.maxMargin)}${fmtSpecial('BEST TIMEOUT HP',ext.bestTimeout)}${fmtSpecial('MAX SURVIVAL',ext.maxSurvival)}${fmtSpecial('MAX DAMAGE',ext.maxDamage)}${fmtSpecial('FASTEST KILL',ext.fastestKill)}`
      : `<div class="note">${focusId?`Optimizer: ${esc(opt.status||'CZEKA NA WALKĘ')}${opt?.staleMethod?` • stary cache ${esc(opt.staleMethod)} został unieważniony` : ''}`:'Brak przechwyconej walki z bossem. Otwórz Bossy i wykonaj atak — odpowiedź zostanie zapisana automatycznie.'}</div>`;
    const rows=all.map(b=>{ const fights=bossLab.battles.filter(x=>Number(x.bossId)===Number(b.id)),wins=fights.filter(x=>x.won===true).length,o=bossLab.optimizers[String(b.id)]||{}; return `<tr><td>${b.id}</td><td class="left"><b>${esc(b.name||`Boss ${b.id}`)}</b><div class="sub">${esc(b.status||'')} ${b.lastFightAt?'• '+new Date(b.lastFightAt).toLocaleString('pl-PL'):''}</div></td><td>${fights.length}</td><td>${fights.length?`${wins}W / ${fights.length-wins}P`:'—'}</td><td class="left">${o.best?esc(o.best.build):esc(o.status||'—')}</td><td><button data-act="boss-optimize" data-boss-id="${b.id}">Przelicz</button></td></tr>`; }).join('');
    const fightRows=bossLab.battles.slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,25).map(r=>`<tr><td>${new Date(Number(r.createdAt||Date.now())).toLocaleString('pl-PL')}</td><td class="left">${esc(r.bossName||`Boss ${r.bossId}`)}</td><td>${esc(r.kind||'attack')}</td><td class="${r.won===true?'ok':r.won===false?'bad':''}"><b>${r.won===true?'W':r.won===false?'P':'?'}</b></td><td>${r.totalTurns??'—'}</td><td>${r.meHpPct==null?'—':Number(r.meHpPct).toFixed(1)+'%'}</td><td class="left">${esc(r.buildCode||'build nieodczytany')}</td><td>${Array.isArray(r.events)&&r.events.length?r.events.length:(r.eventsArchived?'archiwum':'—')}</td></tr>`).join('');
    return `<div class="helper-hero"><div><div class="helper-name">👹 Boss Lab</div><div class="sub">Osobny model bossów. <b>Bossy nigdy nie są mieszane z PvP Lab.</b> Po ataku zapisujemy pełny wynik i eventy.</div></div><div class="helper-actions"><button data-act="boss-sync">↻ Synchronizuj</button><button data-act="boss-export">Eksport Boss JSON</button><button data-act="boss-clear">Wyczyść Boss Lab</button></div></div>
      <div class="section pvp-best"><div class="section-title">🧠 BEST BUILD — 15T HP-FIRST — ${esc(opt.bossName||latest?.bossName||'wybrany boss')}</div>${bestBox}<div class="sub">v8.8.11 rozstrzyga bossów tak jak 15-turowy silnik: kill/death wcześniej, a jeśli obaj stoją po 15 turach — porównuje <b>bezwzględne pozostałe HP</b>. Projekcja uwzględnia eskalację kolejnych tur oraz ATK/turę. Przy jednej walce kalibracyjnej wynik nadal ma status WSTĘPNY. <b>Silnik: ${esc(BOSS_OPTIMIZER_METHOD)}</b>.</div></div>
      <div class="section"><div class="section-title">Status przechwytywania</div><div><b>${esc(bossLab.syncStatus||'—')}</b></div><div class="sub">ostatni capture: ${bossLab.lastCaptureAt?new Date(bossLab.lastCaptureAt).toLocaleString('pl-PL'):'—'} • build aktualny: ${esc(pvpLabCurrentBuild()||'—')} • walk bossów: ${bossLab.battles.length}</div></div>
      <div class="section table-wrap"><div class="section-title">Bossy</div><table><thead><tr><th>ID</th><th>Boss</th><th>Walki</th><th>Bilans</th><th>BEST BUILD</th><th>Akcja</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Brak listy bossów. Wejdź w ekran Bossy albo kliknij Synchronizuj.</td></tr>'}</tbody></table></div>
      <div class="section table-wrap"><div class="section-title">Przechwycone walki bossów</div><table><thead><tr><th>Data</th><th>Boss</th><th>Typ</th><th>Wynik</th><th>Tury</th><th>HP</th><th>Build</th><th>Eventy</th></tr></thead><tbody>${fightRows||'<tr><td colspan="8">Jeszcze nie przechwycono walki. Zrób atak na nowego bossa.</td></tr>'}</tbody></table></div>
      <div class="section note">Boss Lab przechwytuje /api/boss-combat/{ID}/attack/{bossId} oraz rematch bez wykonywania własnego ataku. Nie wydaje MenelPower, pieniędzy ani zębów. Synchronizacja wykonuje tylko bezpieczne GET-y listy bossów, aktywnych modyfikatorów i snapshotu PvP.</div>`;
  }

  // EPHEMERAL SESSION BRIDGE:
  // Wzorzec autoryzowanego GET-a jest trzymany WYŁĄCZNIE w RAM do czasu odświeżenia strony.
  // Nie zapisujemy go do localStorage, JSON, logów ani eksportu.
  let __mgSessionTemplate = null;
  let __mgSessionTemplateAt = 0;
  let __mgInternalApiDepth = 0;

  // Android/WebView fallback: Menelgame trzyma aktualny JWT w localStorage jako
  // menelgame_user.token i sam dokłada go do nagłówka Authorization przy requestach API.
  // W WebView przechwytywanie window.fetch/XHR może nie złapać pierwszego requestu,
  // dlatego odtwarzamy ten sam wzorzec sesji WYŁĄCZNIE w RAM. Token nie trafia do
  // logów, eksportów ani AndroidBridge.
  function tryHydrateSessionFromGameAuth() {
    // Najpierw zsynchronizuj ID. Jeśli użytkownik przełączył konto w tej samej WebView,
    // stary wzorzec Authorization musi zostać wyrzucony i zbudowany od nowa.
    const accountChanged = syncCharacterIdFromGameAuth();
    if (accountChanged) __mgSessionTemplate = null;
    if (__mgSessionTemplate) return true;
    try {
      const raw = localStorage.getItem('menelgame_user');
      if (!raw) return false;
      const auth = JSON.parse(raw);
      const token = String(auth?.token || '').trim();
      if (!token) return false;
      __mgSessionTemplate = new Request(location.origin + '/', {
        method:'GET',
        headers:{ Authorization:`Bearer ${token}` },
        credentials:'include',
        cache:'no-store'
      });
      __mgSessionTemplateAt = Date.now();
      if (state?.auto) state.auto.connection = 'Sesja z logowania gry — gotowa do testu';
      return true;
    } catch (e) {
      return false;
    }
  }

  // IMPORTANT:
  // Bridge nie wypisuje i nie serializuje Authorization/cookies.
  // Kopiuje WYŁĄCZNIE odpowiedź JSON już pobraną przez samą grę.
  function installNativeBridge() {
    if (window.__MG_MP_NATIVE_BRIDGE_V22__) return;
    window.__MG_MP_NATIVE_BRIDGE_V22__ = true;

    const emit = (url, data, rateLimitRemaining=null) => {
      try {
        window.dispatchEvent(new CustomEvent(BRIDGE_EVENT, {
          detail: { url:String(url||''), data, rateLimitRemaining, at:Date.now() }
        }));
      } catch (e) {
        console.warn('[MG Native Bridge] emit failed', e);
      }
    };

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = async function(input, init) {
        let candidateTemplate = null;
        let candidateUrl = '';
        let candidateMethod = 'GET';
        let pvpLabReqBody = null;
        let menelLearnReq = null;
        let melinaLearnReq = null;
        let alcoholLearnReq = null;

        try {
          candidateUrl = typeof input === 'string' ? input : (input?.url || '');

          if (__mgInternalApiDepth === 0 && isSameOriginApiUrl(candidateUrl)) {
            const req = new Request(input, init);
            candidateMethod=String(req.method||'GET').toUpperCase();
            const hasAuth=req.headers.has('authorization');
            if (candidateMethod === 'GET' && (isInterestingNativeUrl(candidateUrl) || pvpLabApiKind(candidateUrl) || bossLabApiKind(candidateUrl) || hasAuth)) candidateTemplate = req.clone();
            if(pvpLabApiKind(candidateUrl) && candidateMethod!=='GET' && candidateMethod!=='HEAD'){
              try{ pvpLabReqBody=await req.clone().text(); }catch{}
            }
          }

          if(
            __mgInternalApiDepth===0 &&
            state.localAI?.menelLearn?.armed &&
            isMenelNativeUrl(candidateUrl)
          ){
            const req=new Request(input,init);
            let rawBody=null;
            if(req.method!=='GET' && req.method!=='HEAD'){
              try{ rawBody=await req.clone().text(); }catch{}
            }
            menelLearnReq={method:req.method,url:candidateUrl,body:rawBody};
          }

          if(
            __mgInternalApiDepth===0 &&
            state.localAI?.melinaLearn?.armed &&
            isMelinaAddNativeUrl(candidateUrl)
          ){
            const req=new Request(input,init);
            let rawBody=null;
            if(req.method!=='GET' && req.method!=='HEAD'){
              try{ rawBody=await req.clone().text(); }catch{}
            }
            melinaLearnReq={method:req.method,url:candidateUrl,body:rawBody};
          }
          if(
            __mgInternalApiDepth===0 &&
            alcoholAuto.learning?.armed &&
            alcoholAuto.learning?.pendingIntent &&
            Date.now()-Number(alcoholAuto.learning.pendingIntent.at||0)<=5000 &&
            isSameOriginApiUrl(candidateUrl)
          ){
            const req=new Request(input,init);
            const m=String(req.method||'GET').toUpperCase();
            if(m!=='GET' && m!=='HEAD'){
              let rawBody=null;
              try{ rawBody=await req.clone().text(); }catch{}
              alcoholLearnReq={method:m,url:candidateUrl,body:rawBody,contentType:String(req.headers.get('content-type')||'')};
            }
          }
        } catch {}

        const response = await originalFetch.apply(this, arguments);

        try {
          const url = candidateUrl || (typeof input === 'string' ? input : (input?.url || response?.url || ''));
          if (response?.ok && isInterestingNativeUrl(url)) {
            if (__mgInternalApiDepth === 0 && candidateTemplate) {
              __mgSessionTemplate = candidateTemplate;
              __mgSessionTemplateAt = Date.now();
              state.auto.connection = 'Wzorzec sesji przechwycony — gotowy do testu';
            }
            const clone = response.clone();
            const rem = clone.headers?.get?.('ratelimit-remaining');
            clone.json().then(data => emit(url, data, rem)).catch(()=>{});
          }
        } catch (e) {
          console.warn('[MG Native Bridge] fetch capture', e);
        }

        try{
          const url = candidateUrl || (typeof input === 'string' ? input : (input?.url || response?.url || ''));
          if(__mgInternalApiDepth===0 && response?.ok && pvpLabApiKind(url)){
            const clone=response.clone();
            clone.json().then(data=>pvpLabObserveApi(url,data,{method:candidateMethod,requestBody:pvpLabReqBody,at:Date.now()})).catch(()=>{});
          }
        }catch(e){
          console.warn('[MG PvP Lab] fetch capture',e);
        }

        try{
          const url = candidateUrl || (typeof input === 'string' ? input : (input?.url || response?.url || ''));
          if(__mgInternalApiDepth===0 && response?.ok && bossLabApiKind(url)){
            const clone=response.clone();
            clone.json().then(data=>bossLabObserveApi(url,data,{method:candidateMethod,at:Date.now()})).catch(()=>{});
          }
        }catch(e){
          console.warn('[MG Boss Lab] fetch capture',e);
        }

        try{
          if(menelLearnReq){
            const clone=response.clone();
            let data=null;
            try{ data=await clone.json(); }catch{}
            recordNativeMenelLearn({
              ...menelLearnReq,
              status:Number(response.status||0),
              response:data
            });
          }
        }catch(e){
          console.warn('[MG Menel Learner] fetch capture',e);
        }

        try{
          if(melinaLearnReq){
            const clone=response.clone();
            let data=null;
            try{ data=await clone.json(); }catch{}
            recordNativeMelinaLearn({
              ...melinaLearnReq,
              status:Number(response.status||0),
              response:data
            });
          }
        }catch(e){
          console.warn('[MG Melina Learner] fetch capture',e);
        }
        try{
          if(alcoholLearnReq){
            const clone=response.clone();
            let data=null;
            try{ data=await clone.json(); }catch{}
            alcoholRecordLearnRequest({...alcoholLearnReq,status:Number(response.status||0),response:data});
          }
        }catch(e){
          console.warn('[MG Alcohol Learner] fetch capture',e);
        }

        return response;
      };
    }

    const XHR = window.XMLHttpRequest;
    if (XHR?.prototype) {
      const originalOpen = XHR.prototype.open;
      const originalSend = XHR.prototype.send;
      const originalSetRequestHeader = XHR.prototype.setRequestHeader;

      XHR.prototype.open = function(method, url) {
        try {
          this.__mgNativeUrl = String(url || '');
          this.__mgNativeMethod = String(method || 'GET').toUpperCase();
          this.__mgNativeHeaders = [];
        } catch {}
        return originalOpen.apply(this, arguments);
      };

      XHR.prototype.setRequestHeader = function(name, value) {
        try {
          if (__mgInternalApiDepth === 0 && (isInterestingNativeUrl(this.__mgNativeUrl || '') || isSameOriginApiUrl(this.__mgNativeUrl || ''))) {
            // Tylko RAM; wartości nigdy nie trafiają do logów/localStorage.
            this.__mgNativeHeaders.push([String(name), String(value)]);
          }
        } catch {}
        return originalSetRequestHeader.apply(this, arguments);
      };

      XHR.prototype.send = function() {
        try{
          if(__mgInternalApiDepth===0 && pvpLabApiKind(this.__mgNativeUrl||'')){
            this.__mgPvpLabBody=arguments[0]??null;
          }
        }catch{}

        try{
          if(
            __mgInternalApiDepth===0 &&
            state.localAI?.menelLearn?.armed &&
            isMenelNativeUrl(this.__mgNativeUrl||'')
          ){
            this.__mgMenelLearnBody=arguments[0]??null;
          }

          if(
            __mgInternalApiDepth===0 &&
            state.localAI?.melinaLearn?.armed &&
            isMelinaAddNativeUrl(this.__mgNativeUrl||'')
          ){
            this.__mgMelinaLearnBody=arguments[0]??null;
          }
          if(
            __mgInternalApiDepth===0 &&
            alcoholAuto.learning?.armed &&
            alcoholAuto.learning?.pendingIntent &&
            Date.now()-Number(alcoholAuto.learning.pendingIntent.at||0)<=5000 &&
            isSameOriginApiUrl(this.__mgNativeUrl||'') &&
            !['GET','HEAD'].includes(String(this.__mgNativeMethod||'GET').toUpperCase())
          ){
            this.__mgAlcoholLearnBody=arguments[0]??null;
            const hdr=(this.__mgNativeHeaders||[]).find(x=>String(x?.[0]||'').toLowerCase()==='content-type');
            this.__mgAlcoholLearnContentType=String(hdr?.[1]||'');
          }
        }catch{}

        try {
          this.addEventListener('loadend', function() {
            try {
              const url = this.__mgNativeUrl || this.responseURL || '';

              if(
                __mgInternalApiDepth===0 &&
                state.localAI?.menelLearn?.armed &&
                isMenelNativeUrl(url)
              ){
                let menelData=null;
                try{
                  if(this.responseType==='json') menelData=this.response;
                  else if(!this.responseType || this.responseType==='text'){
                    menelData=JSON.parse(this.responseText||'null');
                  }
                }catch{}

                recordNativeMenelLearn({
                  method:this.__mgNativeMethod||'GET',
                  url,
                  body:this.__mgMenelLearnBody,
                  status:Number(this.status||0),
                  response:menelData
                });
              }

              if(
                __mgInternalApiDepth===0 &&
                state.localAI?.melinaLearn?.armed &&
                isMelinaAddNativeUrl(url)
              ){
                let melinaData=null;
                try{
                  if(this.responseType==='json') melinaData=this.response;
                  else if(!this.responseType || this.responseType==='text'){
                    melinaData=JSON.parse(this.responseText||'null');
                  }
                }catch{}

                recordNativeMelinaLearn({
                  method:this.__mgNativeMethod||'GET',
                  url,
                  body:this.__mgMelinaLearnBody,
                  status:Number(this.status||0),
                  response:melinaData
                });
              }
              if(
                __mgInternalApiDepth===0 &&
                this.__mgAlcoholLearnBody!==undefined &&
                alcoholAuto.learning?.armed
              ){
                let alcoholData=null;
                try{
                  if(this.responseType==='json') alcoholData=this.response;
                  else if(!this.responseType || this.responseType==='text'){
                    alcoholData=JSON.parse(this.responseText||'null');
                  }
                }catch{}
                alcoholRecordLearnRequest({
                  method:this.__mgNativeMethod||'POST',
                  url,
                  body:this.__mgAlcoholLearnBody,
                  contentType:this.__mgAlcoholLearnContentType||'',
                  status:Number(this.status||0),
                  response:alcoholData
                });
                delete this.__mgAlcoholLearnBody;
              }

              if (this.status >= 200 && this.status < 300 && (isInterestingNativeUrl(url) || isSameOriginApiUrl(url))) {
                if (__mgInternalApiDepth === 0 && this.__mgNativeMethod === 'GET') {
                  try {
                    const h = new Headers(this.__mgNativeHeaders || []);
                    if(isInterestingNativeUrl(url) || pvpLabApiKind(url) || bossLabApiKind(url) || h.has('authorization')){
                      __mgSessionTemplate = new Request(new URL(url, location.href), {
                        method:'GET',
                        headers:h,
                        credentials:'include',
                        cache:'no-store'
                      });
                      __mgSessionTemplateAt = Date.now();
                      state.auto.connection = 'Wzorzec sesji przechwycony — gotowy do testu';
                    }
                  } catch {}
                }
                let data = null;
                if (this.responseType === 'json') data = this.response;
                else if (!this.responseType || this.responseType === 'text') { try{ data = JSON.parse(this.responseText); }catch{} }
                if (data && isInterestingNativeUrl(url)) emit(url, data, this.getResponseHeader?.('ratelimit-remaining'));
                if(data && __mgInternalApiDepth===0 && pvpLabApiKind(url)) pvpLabObserveApi(url,data,{method:this.__mgNativeMethod||'GET',requestBody:this.__mgPvpLabBody,at:Date.now()});
                if(data && __mgInternalApiDepth===0 && bossLabApiKind(url)) bossLabObserveApi(url,data,{method:this.__mgNativeMethod||'GET',at:Date.now()});
              }
            } catch {}
          }, { once:true });
        } catch {}
        return originalSend.apply(this, arguments);
      };
    }

    console.log('[MG Native Bridge] aktywny');
  }

  installAlcoholLearningClickBridge();
  installNativeBridge();
  // Jeżeli użytkownik był już zalogowany zanim Pomagier wystartował, nie czekaj
  // na kolejny request Bazaru/Warsztatu — od razu odtwórz nagłówki sesji z danych gry.
  tryHydrateSessionFromGameAuth();
  installPvpLabWebSocketBridge();


  function dismantleMarketSignatureFromItems(items){
    // Pod uwagę bierzemy tylko ceny przedmiotów, które są źródłem demontażu.
    // Jeżeli te ceny się nie zmieniły, nie ma sensu wyrzucać cache optymalizatora.
    const ids=new Set(STATIC_DISMANTLE.map(x=>Number(x.id)));
    return (items||[])
      .filter(x=>ids.has(Number(x.item_id)) && Number(x.enhancement_level||0)===0)
      .map(x=>`${Number(x.item_id)}:${Number(x.min_price??-1)}:${Number(x.total_quantity??-1)}`)
      .sort()
      .join('|');
  }

  function parseBazaar(j) {
    if (!j) return;
    state.prevPrices = new Map(state.prices);
    state.prices = new Map();
    for (const x of (j.items || [])) state.prices.set(pkey(x.item_id, x.enhancement_level || 0), x);
    state.purchaseLimit = j.purchaseLimit || null;
    rememberMarketPrices(j.items||[]);

    const sig=dismantleMarketSignatureFromItems(j.items||[]);
    if(sig!==state.dismantlePriceSignature){
      state.dismantlePriceSignature=sig;
      state.marketRevision = Number(state.marketRevision||0) + 1;
      state.optimizerCache = new Map();
    }
  }

  function parseBazaarItem(j) {
    if (!j) return;
    state.prevPrices = new Map(state.prices);
    for (const x of (j.offers || [])) {
      state.prices.set(pkey(x.item_id, x.enhancement_level || 0), x);
    }
  }

  function parseRecipes(j) {
    if (!j) return;
    state.recipes = Array.isArray(j.recipes) ? j.recipes : state.recipes;
    state.parts = j.parts || state.parts || {};
    state.toolsLevel = j.toolsLevel ?? state.toolsLevel;
    state.craftQueue = Array.isArray(j.queue) ? j.queue : state.craftQueue;
    state.craftReady = Array.isArray(j.ready) ? j.ready : state.craftReady;
    state.craftMaxQueueSize = Number(j.maxQueueSize ?? state.craftMaxQueueSize ?? 10);
    state.craftSnapshotAt = Date.now();
    state.craftSpeed = state.recipes.length ? ((state.recipes[0].craft_time_minutes*60) / Math.max(1,state.recipes[0].effective_craft_seconds || 1)) : state.craftSpeed;
  }

  function applyUpgrades(j) {
    if (!j) return;
    for (const f of (j.features || [])) {
      if (f.feature_key === 'dismantle_speed_multiplier') state.dismantleSpeed = Number(f.current_value || state.dismantleSpeed || 1);
      if (f.feature_key === 'tools_level') state.toolsLevel = Number(f.current_value ?? state.toolsLevel);
      if (f.feature_key === 'crafting_speed') state.craftSpeed = Number(f.current_value || state.craftSpeed || 1);
    }
    state.lastUpgradeFetch = Date.now();
  }

  function inferDismantleSpeedFromQueue(j) {
    if (!j || !Array.isArray(j.queue) || !j.queue.length) return;
    const ratios = [];
    for (const q of j.queue) {
      const meta = STATIC_DISMANTLE.find(x => Number(x.id) === Number(q.item_id));
      const dur = Number(q.duration_seconds || 0);
      if (!meta || !dur || !meta.baseTime) continue;
      const r = Number(meta.baseTime) / dur;
      if (Number.isFinite(r) && r >= 0.5 && r <= 10) ratios.push(r);
    }
    if (!ratios.length) return;
    ratios.sort((a,b)=>a-b);
    const mid = ratios[Math.floor(ratios.length/2)];
    if (Number.isFinite(mid)) state.dismantleSpeed = mid;
  }

  function parseQueue(j) {
    if (!j) return;
    if (j.parts) state.parts = j.parts;
    if (Array.isArray(j.queue)) state.dismantleQueue = j.queue;
    state.dismantleMaxQueueSize = Number(j.maxQueueSize ?? state.dismantleMaxQueueSize ?? 9);
    inferDismantleSpeedFromQueue(j);
  }

  function saveNativeCachePiece(label, data, url='') {
    const cache = loadJSON(K.nativeCache, {});
    cache[label] = { at:Date.now(), url:String(url||''), data };
    saveJSON(K.nativeCache, cache);
  }

  function hydrateNativeCache() {
    const cache = loadJSON(K.nativeCache, {});
    const apply = (label, fn) => {
      const x = cache[label];
      if (!x?.data) return;
      try {
        fn(x.data);
        state.endpointStatus[label] = {ok:true, native:true, cached:true, at:x.at || 0};
        if (!state.lastUpdated || Number(x.at||0) > state.lastUpdated) state.lastUpdated = Number(x.at||0);
      } catch(e) {
        console.warn('[MG Mega Premium] cache', label, e);
      }
    };
    apply('bazar', parseBazaar);
    apply('receptury', parseRecipes);
    apply('kolejka', parseQueue);
    apply('upgrades', applyUpgrades);
    if (state.prices.size) buildResourceOptions();
    if (state.recipes.length) computeRankings();
  }

  function processNativePayload(url, data, rateLimitRemaining=null, at=Date.now()) {
    let u;
    try { u = new URL(url, location.href); } catch { return; }
    const label = endpointLabelFromPath(u.pathname + u.search);
    if (!label || !data) return;

    state.nativeEvents++;
    state.lastNativeUrl = u.pathname + u.search;
    if (rateLimitRemaining != null && rateLimitRemaining !== '') {
      const n = Number(rateLimitRemaining);
      if (Number.isFinite(n)) state.rateLimitRemaining = n;
    }

    try {
      if (label === 'bazar') {
        parseBazaar(data);
        saveNativeCachePiece('bazar', data, url);
        state.endpointStatus.bazar = {ok:true,native:true,at};
        pushHistory();
      } else if (label === 'bazar-item') {
        parseBazaarItem(data);
        state.endpointStatus['bazar-item'] = {ok:true,native:true,at};
      } else if (label === 'receptury') {
        parseRecipes(data);
        saveNativeCachePiece('receptury', data, url);
        state.endpointStatus.receptury = {ok:true,native:true,at};
      } else if (label === 'kolejka') {
        parseQueue(data);
        saveNativeCachePiece('kolejka', data, url);
        state.endpointStatus.kolejka = {ok:true,native:true,at};
      } else if (label === 'upgrades') {
        applyUpgrades(data);
        saveNativeCachePiece('upgrades', data, url);
        state.endpointStatus.upgrades = {ok:true,native:true,at};
      }

      if (state.prices.size) buildResourceOptions();
      if (state.recipes.length) computeRankings();
      state.lastUpdated = Number(at || Date.now());
      state.errors = [];
      if (state.prices.size && state.recipes.length) checkAlerts();
      if (typeof render === 'function' && typeof panel !== 'undefined') render();
    } catch(e) {
      const msg = String(e?.message || e);
      state.errors.push(`native ${label}: ${msg}`);
      console.error('[MG Mega Premium] processNativePayload', e);
    }
  }

  window.addEventListener(BRIDGE_EVENT, ev => {
    const d = ev.detail || {};
    processNativePayload(d.url, d.data, d.rateLimitRemaining, d.at);
  });

  function buildResourceOptions() {
    const result = Object.fromEntries(RESOURCE_KEYS.map(k => [k, []]));
    for (const it of STATIC_DISMANTLE) {
      const m = getPrice(it.id, 0);
      if (!m || m.min_price == null) continue;
      const effectiveSec = it.baseTime / Math.max(0.0001, Number(state.dismantleSpeed || 1));
      for (const key of RESOURCE_KEYS) {
        const y = Number(it.y?.[key] || 0);
        if (!y) continue;
        result[key].push({
          resource:key, itemId:it.id, name:it.name, price:Number(m.min_price),
          secondPrice:m.min_price_2 == null ? null : Number(m.min_price_2),
          listings:Number(m.listing_count || 0), quantity:Number(m.total_quantity || 0),
          yield:y, costPer:Number(m.min_price)/y, baseTime:it.baseTime,
          effectiveSec, secPerUnit:effectiveSec/y,
          allYields:it.y || {}, collections:it.collections || [], paser:it.paser
        });
      }
    }
    for (const key of RESOURCE_KEYS) result[key].sort((a,b) => a.costPer-b.costPer || a.secPerUnit-b.secPerUnit);
    state.resourceOptions = result;
  }

  function recipeCoinTypes(recipe) {
    const found=[];
    for(const x of (recipe?.extra_ingredients||[])){
      const id=Number(x?.item_id||0);
      const n=String(x?.item_name||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      if(id===277 || n.includes('brazowa moneta') || n.includes('bronzowa moneta')) found.push('bronze');
      if(id===278 || n.includes('srebrna moneta')) found.push('silver');
      if(id===279 || n.includes('zlota moneta')) found.push('gold');
    }
    return [...new Set(found)];
  }

  function currentCoinPermissions(){
    return {
      bronze: settings.coinAllowBronze !== false,
      silver: settings.coinAllowSilver === true,
      gold: settings.coinAllowGold === true
    };
  }

  function syncLegacyCoinModeFromPermissions(){
    const p=currentCoinPermissions();
    if(p.bronze && p.silver && p.gold) settings.coinProductionMode='all';
    else if(!p.bronze && !p.silver && !p.gold) settings.coinProductionMode='none';
    else if(p.bronze && !p.silver && !p.gold) settings.coinProductionMode='safe';
    else if(!p.bronze && p.silver && !p.gold) settings.coinProductionMode='silver';
    else if(!p.bronze && !p.silver && p.gold) settings.coinProductionMode='gold';
    else settings.coinProductionMode='coins';
    return settings.coinProductionMode;
  }

  function currentCoinProductionMode(){
    // Legacy/snapshot compatibility. Logika wyboru używa currentCoinPermissions().
    return syncLegacyCoinModeFromPermissions();
  }

  function recipeAllowedByCoinMode(recipe){
    const kinds=recipeCoinTypes(recipe);
    if(kinds.length===0) return true; // kluczowa zmiana v8.6.7
    const allowed=currentCoinPermissions();
    return kinds.every(k=>allowed[k]===true);
  }

  function coinModeLabel(){
    const p=currentCoinPermissions();
    const names=[];
    if(p.bronze) names.push('brązowe');
    if(p.silver) names.push('srebrne');
    if(p.gold) names.push('złote');
    return names.length ? `dozwolone: ${names.join(', ')}` : 'monety wyłączone';
  }

  function coinTypesLabel(types){
    const map={bronze:'brązowa',silver:'srebrna',gold:'złota'};
    return (types||[]).map(x=>map[x]||x).join('+');
  }

  function coinPermissionControlsHTML(){
    const p=currentCoinPermissions();
    return `
      <label class="coin-perm"><input type="checkbox" data-setting="coinAllowBronze" ${p.bronze?'checked':''}> brązowa</label>
      <label class="coin-perm"><input type="checkbox" data-setting="coinAllowSilver" ${p.silver?'checked':''}> srebrna</label>
      <label class="coin-perm"><input type="checkbox" data-setting="coinAllowGold" ${p.gold?'checked':''}> złota</label>`;
  }

  // Nazwa zachowana dla kompatybilności starszej logiki: "forbidden" oznacza teraz
  // recepturę wymagającą monety, której użycie nie zostało zaznaczone.
  function hasForbiddenCoins(recipe) {
    return !recipeAllowedByCoinMode(recipe);
  }

  function recipeResourceEntries(r) {
    return [
      ['zlom', Number(r.craft_zlom||0)], ['odpady', Number(r.craft_odpady||0)],
      ['tworzywa', Number(r.craft_tworzywa||0)], ['tekstylia', Number(r.craft_tekstylia||0)],
      ['elektrosmieci', Number(r.craft_elektrosmieci||0)], ['komponenty_hq', Number(r.craft_komponenty_hq||0)]
    ].filter(([,q]) => q>0);
  }


  // ============================================================
  // GLOBALNY OPTYMALIZATOR DEMONTAŻU v4.1
  // ============================================================

  const RESOURCE_INDEX_V41 = Object.fromEntries(RESOURCE_KEYS.map((k,i)=>[k,i]));

  function normalizeNeedVector(needs){
    return RESOURCE_KEYS.map(k=>Math.max(0,Math.ceil(Number(needs?.[k]||0))));
  }

  function needObjectFromVector(v){
    return Object.fromEntries(RESOURCE_KEYS.map((k,i)=>[k,Number(v[i]||0)]));
  }

  function bundleCandidatePool(needs){
    const needVec=normalizeNeedVector(needs);
    const usefulKeys=RESOURCE_KEYS.filter((k,i)=>needVec[i]>0);
    if(!usefulKeys.length) return [];

    const raw=[];
    for(const it of STATIC_DISMANTLE){
      // Twarda ochrona składników craftu — dotyczy również rzeczy
      // kupowanych z bazaru specjalnie do demontażu.
      if(isCraftIngredientProtected(it.id)) continue;

      const market=getPrice(it.id,0);
      if(!market || market.min_price==null) continue;

      const y=it.y||{};
      const vec=RESOURCE_KEYS.map(k=>Math.max(0,Number(y[k]||0)));
      if(!usefulKeys.some(k=>vec[RESOURCE_INDEX_V41[k]]>0)) continue;

      raw.push({
        itemId:Number(it.id),
        name:it.name,
        price:Number(market.min_price),
        secondPrice:market.min_price_2==null?null:Number(market.min_price_2),
        listingCount:Number(market.listing_count||0),
        totalQuantity:Number(market.total_quantity||0),
        vec,
        allYields:y,
        baseTime:Number(it.baseTime||0),
        effectiveSec:Number(it.baseTime||0)/Math.max(0.0001,Number(state.dismantleSpeed||1)),
        collections:it.collections||[],
        paser:it.paser
      });
    }
    if(!raw.length) return [];

    const bestUnit=RESOURCE_KEYS.map((k,i)=>{
      if(needVec[i]<=0) return 0;
      let best=Infinity;
      for(const c of raw){
        if(c.vec[i]>0) best=Math.min(best,c.price/c.vec[i]);
      }
      return best;
    });

    for(const c of raw){
      let replacementValue=0;
      let coveredTypes=0;
      for(let i=0;i<RESOURCE_KEYS.length;i++){
        if(needVec[i]<=0 || c.vec[i]<=0 || !Number.isFinite(bestUnit[i])) continue;
        replacementValue += Math.min(needVec[i],c.vec[i])*bestUnit[i];
        coveredTypes++;
      }
      c.coveredTypes=coveredTypes;
      const needlessUnits=c.vec.reduce((sum,v,i)=>sum+(needVec[i]<=0?v:0),0);
      const timeShadow=dismantleTimeShadowCost(c.effectiveSec);
      c.needlessUnits=needlessUnits;
      c.timeShadow=timeShadow;
      c.surplusPenalty=autoCfg.avoidSurplusYields ? needlessUnits*0.50 : 0;
      c.decisionCost=c.price+timeShadow+c.surplusPenalty;
      c.bundleScore=c.decisionCost/Math.max(0.0001,replacementValue);
    }

    const keep=new Map();
    raw.slice()
      .sort((a,b)=>a.bundleScore-b.bundleScore || a.price-b.price)
      .slice(0,Math.max(12,Number(autoCfg.optimizerCandidateLimit||30)))
      .forEach(c=>keep.set(c.itemId,c));

    for(let i=0;i<RESOURCE_KEYS.length;i++){
      if(needVec[i]<=0) continue;
      raw.filter(c=>c.vec[i]>0)
        .sort((a,b)=>(a.price/a.vec[i])-(b.price/b.vec[i]) || a.effectiveSec-b.effectiveSec)
        .slice(0,6)
        .forEach(c=>keep.set(c.itemId,c));
    }

    let pool=[...keep.values()];
    pool=pool.filter((b,bi)=>!pool.some((a,ai)=>{
      if(ai===bi) return false;
      if(a.price>b.price || a.effectiveSec>b.effectiveSec) return false;
      let strictly=a.price<b.price || a.effectiveSec<b.effectiveSec;
      for(let i=0;i<RESOURCE_KEYS.length;i++){
        if(needVec[i]<=0) continue;
        if(a.vec[i]<b.vec[i]) return false;
        if(a.vec[i]>b.vec[i]) strictly=true;
      }
      return strictly;
    }));

    pool.sort((a,b)=>a.bundleScore-b.bundleScore || a.price-b.price || a.effectiveSec-b.effectiveSec);
    return pool;
  }

  function bundleLowerBound(v,needVec,pool){
    let lb=0;
    for(let i=0;i<RESOURCE_KEYS.length;i++){
      const miss=Math.max(0,needVec[i]-v[i]);
      if(!miss) continue;
      let unit=Infinity;
      for(const c of pool){
        if(c.vec[i]>0) unit=Math.min(unit,Number(c.decisionCost??c.price)/c.vec[i]);
      }
      if(!Number.isFinite(unit)) return Infinity;
      lb=Math.max(lb,miss*unit);
    }
    return lb;
  }

  function estimateParallelDismantleSec(items,slots=null){
    const n=Math.max(1,Number(slots||state.dismantleMaxQueueSize||9));
    const loads=Array(n).fill(0);
    const jobs=[];
    for(const x of (items||[])){
      for(let i=0;i<Number(x.count||0);i++) jobs.push(Number(x.effectiveSec||0));
    }
    jobs.sort((a,b)=>b-a);
    for(const sec of jobs){
      let idx=0;
      for(let i=1;i<loads.length;i++) if(loads[i]<loads[idx]) idx=i;
      loads[idx]+=sec;
    }
    return loads.length?Math.max(...loads):0;
  }

  function reconstructBundle(stateNode,pool,needVec){
    const counts=new Map();
    let cur=stateNode;
    while(cur && cur.parent){
      const c=pool[cur.candidateIndex];
      counts.set(c.itemId,Number(counts.get(c.itemId)||0)+1);
      cur=cur.parent;
    }

    const items=[];
    const totalY=Array(RESOURCE_KEYS.length).fill(0);
    let totalCost=0,totalDecisionCost=0,totalItems=0,totalRawSec=0;

    for(const [itemId,count] of counts){
      const c=pool.find(x=>x.itemId===itemId);
      if(!c) continue;
      for(let i=0;i<RESOURCE_KEYS.length;i++) totalY[i]+=c.vec[i]*count;
      totalCost+=c.price*count;
      totalDecisionCost+=Number(c.decisionCost??c.price)*count;
      totalItems+=count;
      totalRawSec+=c.effectiveSec*count;
      items.push({
        itemId:c.itemId,name:c.name,count,
        price:c.price,unitPrice:c.price,
        effectiveSec:c.effectiveSec,
        timeShadow:Number(c.timeShadow||0),
        decisionUnitCost:Number(c.decisionCost??c.price),
        yields:c.allYields,
        collections:c.collections,
        paser:c.paser
      });
    }

    items.sort((a,b)=>b.effectiveSec-a.effectiveSec || b.unitPrice-a.unitPrice);

    return {
      ok:true,
      cost:totalCost,
      decisionCost:totalDecisionCost,
      itemCount:totalItems,
      items,
      yields:needObjectFromVector(totalY),
      need:needObjectFromVector(needVec),
      waste:Object.fromEntries(RESOURCE_KEYS.map((k,i)=>[k,Math.max(0,totalY[i]-needVec[i])])),
      rawDismantleSec:totalRawSec,
      makespanSec:estimateParallelDismantleSec(items),
      exact:false
    };
  }

  function optimizeDismantleBundle(needs){
    const needVec=normalizeNeedVector(needs);

    if(needVec.every(x=>x<=0)){
      return {
        ok:true,cost:0,decisionCost:0,itemCount:0,items:[],
        yields:needObjectFromVector(needVec),
        need:needObjectFromVector(needVec),
        waste:{},rawDismantleSec:0,makespanSec:0,exact:true
      };
    }

    const key=[
      state.marketRevision,
      Number(state.dismantleSpeed||1).toFixed(4),
      Number(autoCfg.minProfitPerHour||0),
      Number(autoCfg.dismantleTimeWeight||0),
      autoCfg.preferFastDismantle?1:0,
      autoCfg.avoidSurplusYields?1:0,
      needVec.join(',')
    ].join('|');
    if(state.optimizerCache?.has(key)) return state.optimizerCache.get(key);

    const pool=bundleCandidatePool(needObjectFromVector(needVec));
    if(!pool.length){
      const fail={ok:false,reason:'brak źródeł na bazarze',cost:null,items:[]};
      state.optimizerCache.set(key,fail);
      return fail;
    }

    for(let i=0;i<RESOURCE_KEYS.length;i++){
      if(needVec[i]>0 && !pool.some(c=>c.vec[i]>0)){
        const fail={ok:false,reason:`brak źródła: ${RESOURCE_KEYS[i]}`,cost:null,items:[]};
        state.optimizerCache.set(key,fail);
        return fail;
      }
    }

    const beamWidth=Math.max(120,Math.min(2500,Number(autoCfg.optimizerBeamWidth||700)));
    const maxSteps=Math.min(90,Math.max(8,needVec.reduce((a,b)=>a+b,0)+8));
    const start={v:Array(RESOURCE_KEYS.length).fill(0),cost:0,decisionCost:0,rawSec:0,parent:null,candidateIndex:-1};
    let beam=[start];
    let bestGoal=null;

    const isGoal=v=>v.every((x,i)=>x>=needVec[i]);
    const stateKey=v=>v.join(',');

    for(let depth=0;depth<maxSteps;depth++){
      const nextMap=new Map();

      for(const st of beam){
        for(let ci=0;ci<pool.length;ci++){
          const c=pool[ci];
          const nv=st.v.map((x,i)=>Math.min(needVec[i],x+c.vec[i]));
          let changed=false;
          for(let i=0;i<nv.length;i++){
            if(nv[i]!==st.v[i]){changed=true;break;}
          }
          if(!changed) continue;

          const cost=st.cost+c.price;
          const decisionCost=Number(st.decisionCost||0)+Number(c.decisionCost??c.price);
          if(bestGoal && decisionCost>=Number(bestGoal.decisionCost??Infinity)) continue;

          const rawSec=Number(st.rawSec||0)+Number(c.effectiveSec||0);
          const node={v:nv,cost,decisionCost,rawSec,parent:st,candidateIndex:ci};
          const k=stateKey(nv);
          const prev=nextMap.get(k);

          if(
            !prev ||
            decisionCost<Number(prev.decisionCost??Infinity) ||
            (
              decisionCost===Number(prev.decisionCost??Infinity) &&
              (cost<prev.cost || (cost===prev.cost && rawSec<Number(prev.rawSec||Infinity)))
            )
          ){
            nextMap.set(k,node);
          }

          if(isGoal(nv) && (
            !bestGoal ||
            decisionCost<Number(bestGoal.decisionCost??Infinity) ||
            (
              decisionCost===Number(bestGoal.decisionCost??Infinity) &&
              (cost<bestGoal.cost || (cost===bestGoal.cost && rawSec<Number(bestGoal.rawSec||Infinity)))
            )
          )){
            bestGoal=node;
          }
        }
      }

      if(!nextMap.size) break;

      let next=[...nextMap.values()];
      next.sort((a,b)=>{
        const sa=Number(a.decisionCost||0)+bundleLowerBound(a.v,needVec,pool);
        const sb=Number(b.decisionCost||0)+bundleLowerBound(b.v,needVec,pool);
        if(sa!==sb) return sa-sb;
        if(Number(a.decisionCost||0)!==Number(b.decisionCost||0)) return Number(a.decisionCost||0)-Number(b.decisionCost||0);
        if(a.cost!==b.cost) return a.cost-b.cost;
        return Number(a.rawSec||0)-Number(b.rawSec||0);
      });

      if(bestGoal){
        const bestPossible=next.length
          ? Number(next[0].decisionCost||0)+bundleLowerBound(next[0].v,needVec,pool)
          : Infinity;
        if(bestPossible>=Number(bestGoal.decisionCost??Infinity)) break;
      }

      beam=next.slice(0,beamWidth);
    }

    let result;

    if(bestGoal){
      result=reconstructBundle(bestGoal,pool,needVec);
    }else{
      const rem=needVec.slice();
      const counts=new Map();
      let guard=0,totalCost=0,totalDecisionCost=0;

      while(rem.some(x=>x>0) && guard++<120){
        let best=null,bestScore=Infinity;

        for(const c of pool){
          let usefulness=0;
          for(let i=0;i<RESOURCE_KEYS.length;i++){
            usefulness+=Math.min(rem[i],c.vec[i]);
          }
          if(usefulness<=0) continue;

          const score=Number(c.decisionCost??c.price)/usefulness;
          if(score<bestScore){bestScore=score;best=c;}
        }

        if(!best) break;

        counts.set(best.itemId,Number(counts.get(best.itemId)||0)+1);
        totalCost+=best.price;
        totalDecisionCost+=Number(best.decisionCost??best.price);
        for(let i=0;i<RESOURCE_KEYS.length;i++){
          rem[i]=Math.max(0,rem[i]-best.vec[i]);
        }
      }

      if(rem.some(x=>x>0)){
        result={ok:false,reason:'optymalizator nie znalazł kompletnego zestawu',cost:null,items:[]};
      }else{
        const items=[];
        const totalY=Array(RESOURCE_KEYS.length).fill(0);
        let raw=0,countAll=0;

        for(const [id,count] of counts){
          const c=pool.find(x=>x.itemId===id);
          if(!c) continue;

          items.push({
            itemId:id,name:c.name,count,
            price:c.price,unitPrice:c.price,
            effectiveSec:c.effectiveSec,
            timeShadow:Number(c.timeShadow||0),
            decisionUnitCost:Number(c.decisionCost??c.price),
            yields:c.allYields,
            collections:c.collections,
            paser:c.paser
          });

          for(let i=0;i<RESOURCE_KEYS.length;i++){
            totalY[i]+=c.vec[i]*count;
          }

          raw+=c.effectiveSec*count;
          countAll+=count;
        }

        items.sort((a,b)=>b.effectiveSec-a.effectiveSec || b.unitPrice-a.unitPrice);

        result={
          ok:true,
          cost:totalCost,
          decisionCost:totalDecisionCost,
          itemCount:countAll,
          items,
          yields:needObjectFromVector(totalY),
          need:needObjectFromVector(needVec),
          waste:Object.fromEntries(RESOURCE_KEYS.map((k,i)=>[k,Math.max(0,totalY[i]-needVec[i])])),
          rawDismantleSec:raw,
          makespanSec:estimateParallelDismantleSec(items),
          exact:false
        };
      }
    }

    state.optimizerCache.set(key,result);
    return result;
  }

  function bundleText(plan){
    if(!plan?.ok) return plan?.reason||'brak planu';
    if(!plan.items?.length) return 'bez zakupów';
    return plan.items.map(x=>`${x.count}× ${x.name}`).join(' + ');
  }

  function dismantleDecisionText(item){
    if(!item) return '—';
    const mins=Number(item.effectiveSec||0)/60;
    const dc=Number(item.decisionUnitCost??item.unitPrice??0);
    return `${item.name}: ${money(item.unitPrice)} • ${fmt(mins,1)} min • decyzyjnie ${money(dc)}`;
  }


  function approximateResourceCost(needs){
    let cost=0;
    let unknown=false;

    for(const key of RESOURCE_KEYS){
      const qty=Math.max(0,Number(needs?.[key]||0));
      if(!qty) continue;
      const opt=state.resourceOptions[key]?.[0];
      if(!opt || opt.costPer==null || !Number.isFinite(Number(opt.costPer))){
        unknown=true;
        continue;
      }
      cost += qty*Number(opt.costPer);
    }

    return {cost,unknown};
  }

  function roughRecipeScore(r){
    const out=getPrice(r.result_item_id,0);
    const outPrice=out?.min_price==null?null:Number(out.min_price);
    if(outPrice==null || outPrice<=0) return {eligible:false,reason:'no-output-price'};

    const net=netAfterFee(outPrice);
    const needs={};
    for(const [key,qty] of recipeResourceEntries(r)) needs[key]=qty;

    const approx=approximateResourceCost(needs);
    let extraCost=0,unknown=approx.unknown,valuationApprox=false,economicIncomplete=false;

    for(const x of (r.extra_ingredients||[])){
      const qty=Number(x.quantity||0), have=Number(x.have||0), miss=Math.max(0,qty-have);
      const enh=Number(x.min_enhancement_level||0);
      const px=getPrice(x.item_id,enh);
      const unit=px?.min_price==null?null:Number(px.min_price);

      if(unit==null){
        if(miss>0){
          unknown=true;
        }else{
          const hist=getHistoricalPrice(x.item_id,enh);
          valuationApprox=true;
          if(hist!=null) extraCost += qty*hist;
          else economicIncomplete=true;
        }
      }else{
        extraCost += qty*unit;
      }
    }

    const roughCost=approx.cost+extraCost;
    const roughProfit=unknown?null:net-roughCost;
    const craftSec=Number(r.effective_craft_seconds || (Number(r.craft_time_minutes||0)*60));
    const roughProfitHour=(roughProfit==null||craftSec<=0)?null:roughProfit/(craftSec/3600);

    return {eligible:true,outPrice,net,roughCost,roughProfit,roughProfitHour,valuationApprox,economicIncomplete,unknown};
  }

  function computeRankings() {
    const t0=performance.now();
    const rough=[];

    // ETAP 1: bardzo szybka wycena wszystkich receptur.
    // Nie uruchamiamy beam-search dla 30-40 receptur na raz.
    const validRecipes=(state.recipes||[]).filter(r=>r && typeof r==='object' && Number(r.id)>0);

    for(const r of validRecipes){
      const rr=roughRecipeScore(r);
      rough.push({recipe:r,...rr});
    }

    const shortlistCount=Math.max(3,Math.min(12,Number(autoCfg.optimizerShortlist||6)));

    // Do ciężkiego optymalizatora trafiają tylko najlepsze potencjalne receptury.
    const shortlistIds=new Set(
      rough
        .filter(x =>
          x.recipe?.is_learned &&
          !hasForbiddenCoins(x.recipe) &&
          x.eligible &&
          !x.unknown &&
          x.roughProfit!=null
        )
        .sort((a,b)=>
          Number(b.roughProfitHour??-Infinity)-Number(a.roughProfitHour??-Infinity) ||
          Number(b.roughProfit??-Infinity)-Number(a.roughProfit??-Infinity)
        )
        .slice(0,shortlistCount)
        .map(x=>Number(x.recipe.id))
    );

    // Samouczenie może zachować w ciężkiej analizie maks. 2 receptury,
    // które historycznie naprawdę dawały dobre zł/h.
    if(autoCfg.selfLearningEnabled){
      Object.values(learner.recipes||{})
        .filter(x=>Number.isFinite(Number(x.ewmaRealizedProfitHour)))
        .sort((a,b)=>Number(b.ewmaRealizedProfitHour)-Number(a.ewmaRealizedProfitHour))
        .slice(0,2)
        .forEach(x=>shortlistIds.add(Number(x.recipeId)));
    }

    const rows=[];

    for(const r of validRecipes){
      const roughRow=rough.find(x=>Number(x?.recipe?.id)===Number(r.id)) || roughRecipeScore(r);
      const doGlobal=shortlistIds.has(Number(r.id));

      const out = getPrice(r.result_item_id, 0);
      const outPrice = out?.min_price == null ? null : Number(out.min_price);
      const outSecond = out?.min_price_2 == null ? null : Number(out.min_price_2);
      const net = netAfterFee(outPrice);

      let fullCost = 0, cashCost = 0, unknown = false, missingUnknown = false;
      let valuationApprox = !!roughRow.valuationApprox;
      let economicIncomplete = !!roughRow.economicIncomplete;
      const unpricedOwned = [];
      const resourcePlan = [];
      const fullNeeds = {};
      const cashNeeds = {};

      for (const [key, qty] of recipeResourceEntries(r)) {
        const have = Number(state.parts?.[`part_${key}`] || 0);
        const miss = Math.max(0, qty-have);
        fullNeeds[key] = qty;
        cashNeeds[key] = miss;
        resourcePlan.push({key,qty,have,miss,opt:state.resourceOptions[key]?.[0] || null});
      }

      let fullBundle=null,cashBundle=null,cashInventoryPlan=null;

      if(doGlobal){
        fullBundle=optimizeDismantleBundle(fullNeeds);

        // Dla ZYSKU GOTÓWKOWEGO TERAZ najpierw wykorzystujemy bezpieczne,
        // opłacalne przedmioty z własnego ekwipunku. Ich koszt gotówkowy = 0.
        cashInventoryPlan = autoCfg.autoUseInventoryDismantle
          ? planInventoryCoverage(cashNeeds)
          : {items:[],economicValue:0,remainingNeeds:cashNeeds,covered:false};

        cashBundle=optimizeDismantleBundle(cashInventoryPlan.remainingNeeds);

        if(Object.keys(fullNeeds).length){
          if(!fullBundle.ok) unknown=true;
          else fullCost += Number(fullBundle.cost||0);
        }

        if(Object.values(cashInventoryPlan.remainingNeeds||{}).some(v=>Number(v)>0)){
          if(!cashBundle.ok) missingUnknown=true;
          else cashCost += Number(cashBundle.cost||0);
        }
      }else{
        const approxFull=approximateResourceCost(fullNeeds);
        const approxCash=approximateResourceCost(cashNeeds);
        fullCost += Number(approxFull.cost||0);
        cashCost += Number(approxCash.cost||0);
        unknown = !!approxFull.unknown;
        missingUnknown = !!approxCash.unknown;
      }

      const extraPlan=[];

      for(const x of (r.extra_ingredients||[])){
        const qty=Number(x.quantity||0),have=Number(x.have||0),miss=Math.max(0,qty-have);
        const enh=Number(x.min_enhancement_level||0);
        const px=getPrice(x.item_id,enh);
        const unit=px?.min_price==null?null:Number(px.min_price);
        let economicUnit=unit;
        let valuationSource=unit==null?null:'live';

        if(unit==null){
          if(miss>0){
            unknown=true;
            missingUnknown=true;
          }else{
            const hist=getHistoricalPrice(x.item_id,enh);
            valuationApprox=true;
            if(hist!=null){
              economicUnit=hist;
              valuationSource='last_seen';
              fullCost += qty*hist;
            }else{
              economicIncomplete=true;
              unpricedOwned.push({id:Number(x.item_id),name:x.item_name,qty});
            }
          }
        }else{
          fullCost += qty*unit;
          cashCost += miss*unit;
        }

        extraPlan.push({
          id:x.item_id,name:x.item_name,qty,have,miss,
          minEnhancement:enh,
          unit,market:px,
          economicUnit,
          valuationSource,
          ownedUnpriced:(unit==null && miss<=0)
        });
      }

      const craftSec=Number(r.effective_craft_seconds || (Number(r.craft_time_minutes||0)*60));
      const economicSec=craftSec+(doGlobal&&fullBundle?.ok?Number(fullBundle.makespanSec||0):0);
      const cashEconomicSec=craftSec+(doGlobal&&cashBundle?.ok?Number(cashBundle.makespanSec||0):0);

      // cashProfit = ile realnie zostanie z tej sztuki przy OBECNYM stanie magazynu
      // (kupujemy tylko to, czego teraz brakuje).
      // profit = ekonomiczna wycena wszystkich zużytych materiałów.
      // Jeśli posiadany składnik nie ma ani bieżącej, ani zapamiętanej ceny,
      // profit jest GÓRNĄ GRANICĄ i economicIncomplete=true.
      const profit=(net==null||unknown)?null:net-fullCost;
      const cashProfit=(net==null||missingUnknown)?null:net-cashCost;
      const profitHour=(profit==null||economicSec<=0)?null:profit/(economicSec/3600);
      const cashProfitHour=(cashProfit==null||cashEconomicSec<=0)?null:cashProfit/(cashEconomicSec/3600);
      const craftOnlyProfitHour=(profit==null||craftSec<=0)?null:profit/(craftSec/3600);
      const roi=(profit==null||fullCost<=0)?null:profit/fullCost*100;

      rows.push({
        recipe:r,output:out,outPrice,outSecond,net,
        fullCost,cashCost,profit,cashProfit,
        profitHour,cashProfitHour,craftOnlyProfitHour,roi,
        craftSec,economicSec,cashEconomicSec,
        resourcePlan,extraPlan,fullBundle,cashBundle,cashInventoryPlan,
        globalOptimized:doGlobal,
        unknown,missingUnknown,valuationApprox,economicIncomplete,unpricedOwned,
        coinTypes:recipeCoinTypes(r),forbidden:hasForbiddenCoins(r),learned:!!r.is_learned,canCraft:!!r.can_craft
      });
    }

    applyLearningToRankings(rows);
    state.rankings=rows.filter(x=>x?.recipe);

    if(
      state.auto.error &&
      /Cannot read properties of null \(reading ['"]recipe['"]\)|Cannot read property ['"]recipe['"] of null/i.test(String(state.auto.error))
    ){
      // v8.5.6: stary null w rankingu jest stanem naprawialnym, nie powodem STOP.
      state.auto.error=null;
      state.auto.target=null;
      if(state.auto.stage==='BŁĄD'){
        state.auto.stage=autoCfg.enabled ? 'RETRY: RANKING' : 'STOP';
        state.auto.stageDetail=autoCfg.enabled
          ? 'Usunięto pusty wpis rankingu — ponawiam cykl'
          : 'Ranking oczyszczony';
      }
    }
    state.optimizerLastMs=Math.round(performance.now()-t0);
    state.optimizerLastRecipes=shortlistIds.size;
  }

  function deltaFor(id, enh=0) {
    const cur = getPrice(id, enh)?.min_price;
    const prev = state.prevPrices.get(pkey(id,enh))?.min_price;
    if (cur == null || prev == null) return null;
    return Number(cur)-Number(prev);
  }

  function pushHistory() {
    const ts = nowIso();
    for (const w of settings.watch) {
      const p = getPrice(w.id,0);
      if (!p) continue;
      history.push({ts,id:Number(w.id),name:p.name || w.name || `ID ${w.id}`,price:p.min_price,price2:p.min_price_2,qty:p.total_quantity,listings:p.listing_count});
    }
    if (history.length > Number(settings.maxHistoryRows||5000)) history = history.slice(-Number(settings.maxHistoryRows||5000));
    saveJSON(K.history, history);
  }

  function checkAlerts() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    for (const w of settings.watch) {
      const p = getPrice(w.id,0); if (!p || p.min_price == null) continue;
      const price = Number(p.min_price), d = deltaFor(w.id,0);
      const crossedUp = w.above != null && d != null && (price >= Number(w.above)) && (price-d < Number(w.above));
      const crossedDown = w.below != null && d != null && (price <= Number(w.below)) && (price-d > Number(w.below));
      if (crossedUp || crossedDown) new Notification('Menelgame — alert ceny', {body:`${p.name}: ${money(price)}`});
    }
    const best = filteredRankings().sort((a,b)=>(b.profit||-Infinity)-(a.profit||-Infinity))[0];
    if (best && best.profit != null && best.profit >= Number(settings.alertBestProfit||Infinity)) {
      const marker = `best:${best.recipe.result_item_id}:${Math.floor(best.profit/100)}`;
      if (sessionStorage.getItem('mg_mp_last_alert') !== marker) {
        sessionStorage.setItem('mg_mp_last_alert', marker);
        new Notification('Menelgame — mocny craft', {body:`${best.recipe.item_name}: zysk ~${money(best.profit)}`});
      }
    }
  }




  // ============================================================
  // OCHRONA DEMONTAŻU v4.2
  // ============================================================

  function craftIngredientProtectionMap(){
    const map=new Map();

    // TWARDY ZAKAZ:
    // każdy przedmiot używany jako extra_ingredient w JAKIEJKOLWIEK
    // recepturze zwróconej przez warsztat jest chroniony przed demontażem.
    for(const r of (state.recipes||[])){
      for(const x of (r.extra_ingredients||[])){
        const id=Number(x.item_id);
        if(!id) continue;
        if(!map.has(id)) map.set(id,[]);
        map.get(id).push(r.item_name || `receptura ${r.id}`);
      }
    }
    return map;
  }

  function isCraftIngredientProtected(itemId){
    return craftIngredientProtectionMap().has(Number(itemId));
  }

  function craftIngredientProtectionText(itemId){
    const arr=craftIngredientProtectionMap().get(Number(itemId))||[];
    if(!arr.length) return '';
    return `CHRONIONY — składnik wytwarzania${arr.length?`: ${arr.slice(0,3).join(', ')}${arr.length>3?'…':''}`:''}`;
  }

  function inventoryItemMarketValue(itemId,enh=0){
    const live=getPrice(Number(itemId),Number(enh||0));
    if(live?.min_price!=null){
      const v=Number(live.min_price);
      if(Number.isFinite(v) && v>0) return {value:v,source:'live'};
    }

    const hist=getHistoricalPrice(Number(itemId),Number(enh||0));
    if(hist!=null && Number.isFinite(Number(hist)) && Number(hist)>0){
      return {value:Number(hist),source:'history'};
    }

    return {value:null,source:'unknown'};
  }

  function unfinishedCollectionItemIds(){
    const out=new Set();
    const root=state.localAI?.world?.collections;

    const walk=node=>{
      if(!node) return;

      if(Array.isArray(node)){
        node.forEach(walk);
        return;
      }

      if(typeof node!=='object') return;

      if(Array.isArray(node.requiredItems)){
        for(const x of node.requiredItems){
          const id=Number(x?.itemId ?? x?.item_id ?? 0);
          const required=Number(x?.required||1);
          const deposited=Number(x?.deposited||0);
          const fulfilled=x?.fulfilled===true || deposited>=required;
          if(id && !fulfilled) out.add(id);
        }
      }

      for(const v of Object.values(node)){
        if(v && typeof v==='object') walk(v);
      }
    };

    walk(root);
    return out;
  }

  function isCollectionItemProtected(itemId){
    return unfinishedCollectionItemIds().has(Number(itemId));
  }

  function collectionProtectionText(itemId){
    return isCollectionItemProtected(itemId)
      ? 'CHRONIONY — potrzebny do niezakończonej kolekcji'
      : '';
  }

  function inventoryDismantlePolicy(inv){
    const itemId=Number(inv?.item_id ?? inv?.id ?? 0);
    const enh=Number(inv?.enhancement_level||0);
    const name=inv?.item_name || inv?.name || `ID ${itemId}`;

    if(!itemId) return {allowed:false,reason:'brak ID',value:null,name};
    if(inv?.is_dismantle_locked) return {allowed:false,reason:'blokada demontażu',value:null,name};

    if(isCraftIngredientProtected(itemId)){
      return {
        allowed:false,
        reason:craftIngredientProtectionText(itemId),
        value:inventoryItemMarketValue(itemId,enh).value,
        name
      };
    }

    if(isCollectionItemProtected(itemId)){
      return {
        allowed:false,
        reason:collectionProtectionText(itemId),
        value:inventoryItemMarketValue(itemId,enh).value,
        name
      };
    }

    const mv=inventoryItemMarketValue(itemId,enh);
    if(mv.value==null){
      // Nie znamy wartości = nie ryzykujemy przedmiotu z ekwipunku.
      return {allowed:false,reason:'brak pewnej wyceny — nie demontuję',value:null,name};
    }

    if(mv.value>Number(autoCfg.maxInventoryDismantleValue||3000)){
      return {
        allowed:false,
        reason:`wartość ${money(mv.value)} > limit ${money(autoCfg.maxInventoryDismantleValue||3000)}`,
        value:mv.value,
        valueSource:mv.source,
        name
      };
    }

    const meta=staticDismantleById(itemId);
    if(!meta) return {allowed:false,reason:'brak danych uzysku demontażu',value:mv.value,name};

    return {
      allowed:true,
      reason:'OK',
      value:mv.value,
      valueSource:mv.source,
      name,
      meta
    };
  }

  function usefulReplacementValueForInventory(inv,needObj){
    const pol=inventoryDismantlePolicy(inv);
    if(!pol.allowed) return {useful:0,replacementValue:0,policy:pol};

    const y=pol.meta?.y||pol.meta?.resources||{};
    let useful=0;
    let replacementValue=0;

    for(const key of RESOURCE_KEYS){
      const need=Math.max(0,Number(needObj?.[key]||0));
      const got=Math.max(0,Number(y[key]||0));
      const used=Math.min(need,got);
      if(used<=0) continue;

      useful+=used;
      const best=state.resourceOptions[key]?.[0];
      const unit=best?.costPer==null?0:Number(best.costPer);
      if(Number.isFinite(unit) && unit>0) replacementValue += used*unit;
    }

    return {useful,replacementValue,policy:pol};
  }

  function pickBestInventoryDismantleCandidate(needObj){
    let best=null;

    for(const inv of (state.manual.dismantlableItems||[])){
      const calc=usefulReplacementValueForInventory(inv,needObj);
      if(calc.useful<=0 || !calc.policy.allowed) continue;

      // Pomagier jest nastawiony na ZYSK:
      // nie spalamy przedmiotu wartego np. 2500 zł, jeżeli te same brakujące
      // materiały można kupić/dostać z demontażu za 100 zł.
      //
      // Własny przedmiot ma priorytet tylko wtedy, gdy jego wartość rynkowa
      // nie jest wyższa od kosztu odtworzenia użytecznych materiałów.
      if(calc.replacementValue>0 && Number(calc.policy.value)>calc.replacementValue) continue;

      const multi=(calc.policy.meta?.y||calc.policy.meta?.resources||{});
      const types=RESOURCE_KEYS.filter(k=>Number(multi[k]||0)>0 && Number(needObj?.[k]||0)>0).length;
      const effectiveSec=Number(calc.policy.meta?.baseTime||0)/Math.max(0.0001,Number(state.dismantleSpeed||1));
      const timeShadow=dismantleTimeShadowCost(effectiveSec);
      const needless=needlessYieldInfo(calc.policy.meta,needObj);
      const baseDen=Math.max(0.0001,calc.replacementValue||calc.useful);
      const score=
        Number(calc.policy.value)/baseDen +
        timeShadow/baseDen +
        (autoCfg.avoidSurplusYields ? needless.units*0.04 : 0);

      const row={
        inv,
        inventoryId:Number(inv.inventory_id),
        itemId:Number(inv.item_id),
        name:calc.policy.name,
        quantity:Number(inv.quantity||1),
        value:Number(calc.policy.value),
        valueSource:calc.policy.valueSource,
        useful:calc.useful,
        replacementValue:calc.replacementValue,
        types,
        score,
        effectiveSec,
        timeShadow,
        needlessUnits:needless.units,
        needlessNames:needless.names,
        meta:calc.policy.meta
      };

      if(!best ||
         row.score<best.score ||
         (Math.abs(row.score-best.score)<0.000001 && row.effectiveSec<best.effectiveSec) ||
         (Math.abs(row.score-best.score)<0.000001 && row.effectiveSec===best.effectiveSec && row.value<best.value)){
        best=row;
      }
    }

    return best;
  }

  function planInventoryCoverage(needs){
    const rem=Object.fromEntries(RESOURCE_KEYS.map(k=>[k,Math.max(0,Number(needs?.[k]||0))]));
    const pool=(state.manual.dismantlableItems||[]).map(x=>({...x,__left:Number(x.quantity||1)}));
    const items=[];
    let economicValue=0;
    let guard=0;

    while(Object.values(rem).some(v=>v>0) && guard++<120){
      let best=null;

      for(const inv of pool){
        if(inv.__left<=0) continue;
        const calc=usefulReplacementValueForInventory(inv,rem);
        if(calc.useful<=0 || !calc.policy.allowed) continue;
        if(calc.replacementValue>0 && Number(calc.policy.value)>calc.replacementValue) continue;

        const effectiveSec=Number(calc.policy.meta?.baseTime||0)/Math.max(0.0001,Number(state.dismantleSpeed||1));
        const timeShadow=dismantleTimeShadowCost(effectiveSec);
        const needless=needlessYieldInfo(calc.policy.meta,rem);
        const den=Math.max(0.0001,calc.replacementValue||calc.useful);
        const score=
          Number(calc.policy.value)/den +
          timeShadow/den +
          (autoCfg.avoidSurplusYields ? needless.units*0.04 : 0);

        if(!best ||
           score<best.score ||
           (Math.abs(score-best.score)<0.000001 && effectiveSec<best.effectiveSec)){
          best={inv,calc,score,effectiveSec};
        }
      }

      if(!best) break;

      const y=best.calc.policy.meta?.y||best.calc.policy.meta?.resources||{};
      for(const key of RESOURCE_KEYS){
        rem[key]=Math.max(0,Number(rem[key]||0)-Number(y[key]||0));
      }

      const existing=items.find(x=>
        Number(x.itemId)===Number(best.inv.item_id) &&
        Number(x.enhancement||0)===Number(best.inv.enhancement_level||0)
      );

      if(existing) existing.count++;
      else items.push({
        itemId:Number(best.inv.item_id),
        enhancement:Number(best.inv.enhancement_level||0),
        name:best.calc.policy.name,
        count:1,
        unitValue:Number(best.calc.policy.value),
        effectiveSec:Number(best.effectiveSec||0),
        yields:y
      });

      economicValue+=Number(best.calc.policy.value);
      best.inv.__left--;
    }

    return {
      items,
      economicValue,
      remainingNeeds:rem,
      covered:Object.values(rem).every(v=>Number(v)<=0)
    };
  }

  // ============================================================
  // RĘCZNY DEMONTAŻ v3.3
  // ============================================================

  function staticDismantleById(itemId){
    return STATIC_DISMANTLE.find(x => Number(x.id) === Number(itemId)) || null;
  }

  function dismantleYieldText(meta){
    const resources = meta?.y || meta?.resources;
    if(!resources) return 'brak danych';
    const labels={zlom:'złom',odpady:'odpady',tworzywa:'tworzywa',tekstylia:'tekstylia',elektrosmieci:'elektrośmieci',komponenty_hq:'HQ'};
    return Object.entries(resources)
      .filter(([,v])=>Number(v)>0)
      .map(([k,v])=>`${Number(v)} ${labels[k]||k}`)
      .join(' + ') || 'brak';
  }

  function manualMarketRows(){
    const q=String(manualPrefs.marketSearch||'').trim().toLowerCase();
    const rows=[];
    for(const meta of STATIC_DISMANTLE){
      const p=getPrice(meta.id,0);
      if(!p || p.min_price==null) continue;
      if(q && !String(meta.name||'').toLowerCase().includes(q) && !String(meta.id).includes(q)) continue;
      const price=Number(p.min_price);
      const odpady=Number((meta.y||meta.resources||{}).odpady||0);
      rows.push({
        itemId:Number(meta.id),
        name:meta.name,
        price,
        second:p.min_price_2==null?null:Number(p.min_price_2),
        odpady,
        costPerWaste:odpady>0?price/odpady:Infinity,
        time:Math.round(Number(meta.baseTime||0)/Math.max(1,Number(state.dismantleSpeed||1))),
        protected:isCraftIngredientProtected(meta.id),
        protectedReason:craftIngredientProtectionText(meta.id),
        meta
      });
    }
    if(manualPrefs.sort==='price') rows.sort((a,b)=>a.price-b.price);
    else if(manualPrefs.sort==='time') rows.sort((a,b)=>a.time-b.time || a.price-b.price);
    else rows.sort((a,b)=>a.costPerWaste-b.costPerWaste || a.price-b.price);
    return rows;
  }

  function manualInventoryRows(){
    const q=String(manualPrefs.inventorySearch||'').trim().toLowerCase();
    const rows=[];
    for(const inv of (state.manual.dismantlableItems||[])){
      const itemId=Number(inv.item_id ?? inv.id ?? 0);
      const name=inv.item_name || inv.name || `ID ${itemId}`;
      if(q && !name.toLowerCase().includes(q) && !String(itemId).includes(q)) continue;
      const policy=inventoryDismantlePolicy(inv);
      rows.push({
        inventoryId:Number(inv.inventory_id),
        itemId,
        name,
        quantity:Number(inv.quantity||1),
        enhancement:Number(inv.enhancement_level||0),
        locked:!!inv.is_dismantle_locked,
        allowed:!!policy.allowed,
        policyReason:policy.reason,
        value:policy.value,
        valueSource:policy.valueSource,
        protected:isCraftIngredientProtected(itemId),
        meta:staticDismantleById(itemId)
      });
    }
    rows.sort((a,b)=>a.name.localeCompare(b.name,'pl'));
    return rows;
  }

  async function refreshManualInventory({silent=true}={}){
    if(!__mgSessionTemplate) throw new Error('Brak sesji. Otwórz najpierw Bazar albo Warsztat.');
    const j=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
    state.manual.dismantlableItems=Array.isArray(j?.items)?j.items:[];
    state.manual.lastRefreshAt=Date.now();
    state.manual.lastError=null;
    if(!silent) state.manual.lastMessage=`Ekwipunek odświeżony: ${state.manual.dismantlableItems.length} pozycji.`;
    return j;
  }

  async function addInventoryToDismantle(inventoryId, qty=1){
    if(state.manual.busy) return;
    state.manual.busy=true;
    state.manual.lastError=null;
    try{
      let left=Math.max(1,Math.floor(Number(qty)||1));
      let added=0;
      while(left>0 && dismantleFreeSlots()>0){
        const invData=await refreshManualInventory({silent:true});
        const current=(invData?.items||[]).find(x=>Number(x.inventory_id)===Number(inventoryId));
        if(!current) break;
        const policy=inventoryDismantlePolicy(current);
        if(!policy.allowed) throw new Error(`Nie demontuję: ${current.item_name||current.name||'przedmiot'} — ${policy.reason}.`);

        const q=await apiActive(`/api/workshop/${settings.characterId}/queue/add`,{
          method:'POST',
          body:{inventoryId:Number(inventoryId)}
        });
        parseQueue(q);
        added++; left--;
        state.manual.lastMessage=`Dodano do demontażu: ${current.item_name||current.name||'przedmiot'} • ${added} szt.`;
        if(left>0) await sleep(700);
      }
      await refreshManualInventory({silent:true});
      if(added===0 && dismantleFreeSlots()<=0) state.manual.lastMessage='Kolejka demontażu jest pełna.';
    }catch(e){
      state.manual.lastError=String(e?.message||e);
      state.manual.lastMessage='Błąd dodawania do demontażu.';
    }finally{
      state.manual.busy=false;
      render();
    }
  }

  async function manualBuyAndDismantle(itemId, qty=1){
    if(state.manual.busy) return;
    state.manual.busy=true;
    state.manual.lastError=null;
    try{
      const meta=staticDismantleById(itemId);
      if(!meta) throw new Error('Brak danych demontażu tego przedmiotu.');
      if(isCraftIngredientProtected(itemId)) throw new Error(craftIngredientProtectionText(itemId));

      let left=Math.max(1,Math.floor(Number(qty)||1));
      let done=0, spent=0;

      while(left>0 && dismantleFreeSlots()>0){
        // Zawsze świeży orderbook tuż przed konkretnym zakupem.
        const ob=await apiActive(`/api/bazaar/${settings.characterId}/queue/${Number(itemId)}/0`);
        const listings=Array.isArray(ob?.listings)?ob.listings.slice():[];
        listings.sort((a,b)=>Number(a.price_per_unit)-Number(b.price_per_unit));
        const best=listings[0];
        if(!best) throw new Error('Brak ofert tego przedmiotu na bazarze.');

        const livePrice=Number(best.price_per_unit);
        const before=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
        const beforeMap=snapshotDismantlable(before?.items,itemId);

        const buy=await apiActive(`/api/bazaar/${settings.characterId}/buy`,{
          method:'POST',
          body:{itemId:Number(itemId),enhancementLevel:0,quantity:1}
        });
        const paid=Number(buy?.totalCost ?? livePrice);
        spent+=paid;
        if(buy?.purchaseLimit) state.purchaseLimit=buy.purchaseLimit;

        await sleep(700);
        const after=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
        const inv=findPurchasedInventory(beforeMap,after?.items,itemId);
        if(!inv) throw new Error('Zakup się udał, ale nie znalazłem jednoznacznie kupionej sztuki.');

        const q=await apiActive(`/api/workshop/${settings.characterId}/queue/add`,{
          method:'POST',
          body:{inventoryId:Number(inv.inventory_id)}
        });
        parseQueue(q);

        done++; left--;
        state.manual.lastMessage=`Kupiono + demontaż: ${meta.name} • ${done} szt. • wydano ${money(spent)}.`;
        if(left>0) await sleep(900);
      }

      await refreshManualInventory({silent:true});
      await refreshMarketOnly({silent:true});
      if(done===0 && dismantleFreeSlots()<=0) state.manual.lastMessage='Kolejka demontażu jest pełna.';
    }catch(e){
      state.manual.lastError=String(e?.message||e);
      state.manual.lastMessage='Błąd zakupu/demontażu.';
    }finally{
      state.manual.busy=false;
      render();
    }
  }


  function semiSelectedMeta(){
    return manualPrefs.semiItemId ? staticDismantleById(Number(manualPrefs.semiItemId)) : null;
  }

  function semiInventorySelection(){
    if(!manualPrefs.semiInventoryItemId) return null;
    return {
      itemId:Number(manualPrefs.semiInventoryItemId),
      enhancement:Number(manualPrefs.semiInventoryEnhancement||0),
      name:manualPrefs.semiInventoryName || `ID ${manualPrefs.semiInventoryItemId}`,
      meta:staticDismantleById(Number(manualPrefs.semiInventoryItemId))
    };
  }

  function semiInventoryAvailableCount(items=null){
    const sel=semiInventorySelection();
    if(!sel) return 0;
    const src=Array.isArray(items)?items:(state.manual.dismantlableItems||[]);
    return src
      .filter(x =>
        Number(x.item_id ?? x.id)===sel.itemId &&
        Number(x.enhancement_level||0)===sel.enhancement &&
        inventoryDismantlePolicy(x).allowed
      )
      .reduce((sum,x)=>sum+Number(x.quantity||1),0);
  }

  function semiStop(reason='Półautomat zatrzymany.'){
    state.manual.semi.enabled=false;
    state.manual.semi.inCycle=false;
    state.manual.semi.nextAt=0;
    state.manual.semi.lastAction=reason;
    state.manual.lastMessage=reason;
  }

  async function semiRefreshQueue(){
    const q=await apiActive(`/api/workshop/${settings.characterId}/queue`);
    parseQueue(q);
    return q;
  }


  async function semiInventoryCycle(){
    const semi=state.manual.semi;
    if(!semi.enabled || semi.inCycle) return;
    semi.inCycle=true;
    semi.error=null;

    try{
      const sel=semiInventorySelection();
      if(!sel){
        semiStop('Brak wybranego przedmiotu z ekwipunku.');
        return;
      }

      if(semi.remaining<=0){
        semiStop(`Gotowe: dodano ${semi.queued} szt. ${sel.name} do demontażu.`);
        return;
      }

      await semiRefreshQueue();
      let free=dismantleFreeSlots();

      if(free<=0){
        semi.lastAction='Czekam, aż zwolni się miejsce w kolejce demontażu.';
        state.manual.lastMessage=semi.lastAction;
        return;
      }

      // Jednym cyklem zapełniamy wszystkie aktualnie wolne sloty,
      // ale nigdy ponad liczbę, którą użytkownik ustawił.
      let canAdd=Math.min(free,semi.remaining);
      let addedThisCycle=0;

      while(canAdd>0 && semi.remaining>0){
        const invData=await refreshManualInventory({silent:true});
        const candidates=(invData?.items||[]).filter(x =>
          Number(x.item_id ?? x.id)===sel.itemId &&
          Number(x.enhancement_level||0)===sel.enhancement &&
          inventoryDismantlePolicy(x).allowed
        );

        if(!candidates.length){
          // Nic więcej nie ma teraz w ekwipunku.
          const addedTotal=semi.queued;
          semiStop(`Brak kolejnych sztuk ${sel.name} w ekwipunku. Dodano łącznie ${addedTotal} szt.`);
          return;
        }

        // Preferuj największy stack.
        candidates.sort((a,b)=>Number(b.quantity||1)-Number(a.quantity||1));
        const current=candidates[0];

        const q=await apiActive(`/api/workshop/${settings.characterId}/queue/add`,{
          method:'POST',
          body:{inventoryId:Number(current.inventory_id)}
        });
        parseQueue(q);

        semi.queued++;
        semi.remaining=Math.max(0,semi.remaining-1);
        addedThisCycle++;
        canAdd--;

        semi.lastAction=`${sel.name}: dodano do demontażu. Zostało ${semi.remaining} szt.`;
        state.manual.lastMessage=semi.lastAction;

        if(semi.remaining<=0){
          semiStop(`Gotowe: dodano ${semi.queued} szt. ${sel.name} do demontażu.`);
          return;
        }

        await sleep(450);

        // Jeśli odpowiedź queue/add mówi, że kolejka jest już pełna, kończ ten cykl.
        if(dismantleFreeSlots()<=0) break;
      }

      if(addedThisCycle>0 && semi.enabled){
        semi.lastAction=`Dodano ${addedThisCycle} szt. ${sel.name}. Czekam na kolejne wolne miejsce. Pozostało ${semi.remaining}.`;
        state.manual.lastMessage=semi.lastAction;
      }
    }catch(e){
      const msg=String(e?.message||e);
      semi.error=msg;
      state.manual.lastError=msg;
      semi.lastAction=`Błąd: ${msg}`;
      if(/401|403|Brak wzorca sesji/i.test(msg)){
        semiStop(`Półautomat zatrzymany: ${msg}`);
      }
    }finally{
      semi.inCycle=false;
      if(semi.enabled){
        semi.nextAt=Date.now()+Math.max(3,Number(manualPrefs.semiIntervalSeconds||5))*1000;
      }
      render();
    }
  }

  async function semiDismantleCycle(){
    if(manualPrefs.semiMode==='inventory'){
      return semiInventoryCycle();
    }

    const semi=state.manual.semi;
    if(!semi.enabled || semi.inCycle) return;
    semi.inCycle=true;
    semi.error=null;

    try{
      const meta=semiSelectedMeta();
      if(!meta){
        semiStop('Brak wybranego przedmiotu.');
        return;
      }
      if(isCraftIngredientProtected(meta.id)){
        semiStop(craftIngredientProtectionText(meta.id));
        return;
      }

      if(semi.remaining<=0){
        semiStop(`Gotowe: kupiono i dodano ${semi.queued} szt. ${meta.name}.`);
        return;
      }

      // Odśwież kolejkę, bo slot mógł zwolnić od ostatniego cyklu.
      await semiRefreshQueue();

      if(dismantleFreeSlots()<=0){
        semi.lastAction='Czekam na wolny slot demontażu.';
        state.manual.lastMessage=semi.lastAction;
        return;
      }

      const rem=purchaseRemaining();
      if(rem!=null && rem<=0){
        semiStop('Koniec dziennego limitu zakupów na bazarze.');
        return;
      }

      // Świeży orderbook dokładnie przed zakupem.
      const ob=await apiActive(`/api/bazaar/${settings.characterId}/queue/${Number(meta.id)}/0`);
      const listings=Array.isArray(ob?.listings)?ob.listings.slice():[];
      listings.sort((a,b)=>Number(a.price_per_unit)-Number(b.price_per_unit));
      const best=listings[0];

      if(!best){
        semi.lastAction=`Czekam: brak ofert ${meta.name}.`;
        state.manual.lastMessage=semi.lastAction;
        return;
      }

      const livePrice=Number(best.price_per_unit);
      const maxPrice=Math.max(0,Number(manualPrefs.semiMaxPrice)||0);

      if(maxPrice>0 && livePrice>maxPrice){
        semi.lastAction=`Czekam: ${meta.name} kosztuje ${money(livePrice)}, limit to ${money(maxPrice)}.`;
        state.manual.lastMessage=semi.lastAction;
        return;
      }

      // Snapshot ekwipunku przed zakupem, aby potem wskazać dokładnie kupioną sztukę.
      const before=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
      const beforeMap=snapshotDismantlable(before?.items,meta.id);

      const buy=await apiActive(`/api/bazaar/${settings.characterId}/buy`,{
        method:'POST',
        body:{itemId:Number(meta.id),enhancementLevel:0,quantity:1}
      });
      const paid=Number(buy?.totalCost ?? livePrice);
      if(buy?.purchaseLimit) state.purchaseLimit=buy.purchaseLimit;

      await sleep(700);

      const after=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
      const inv=findPurchasedInventory(beforeMap,after?.items,meta.id);
      if(!inv){
        semiStop(`Kupiono ${meta.name}, ale nie udało się jednoznacznie znaleźć sztuki do demontażu.`);
        return;
      }

      const q=await apiActive(`/api/workshop/${settings.characterId}/queue/add`,{
        method:'POST',
        body:{inventoryId:Number(inv.inventory_id)}
      });
      parseQueue(q);

      semi.bought++;
      semi.queued++;
      semi.spent+=paid;
      semi.remaining=Math.max(0,semi.remaining-1);
      semi.lastAction=`${meta.name}: kupiono za ${money(paid)} i dodano do demontażu. Zostało ${semi.remaining} szt.`;
      state.manual.lastMessage=semi.lastAction;

      if(semi.remaining<=0){
        semiStop(`Gotowe: ${semi.queued} szt. ${meta.name} • wydano ${money(semi.spent)}.`);
      }
    }catch(e){
      const msg=String(e?.message||e);
      state.manual.semi.error=msg;
      state.manual.lastError=msg;
      state.manual.semi.lastAction=`Błąd: ${msg}`;
      // Przy błędzie autoryzacji zatrzymujemy półautomat.
      if(/401|403|Brak wzorca sesji/i.test(msg)){
        semiStop(`Półautomat zatrzymany: ${msg}`);
      }
    }finally{
      state.manual.semi.inCycle=false;
      if(state.manual.semi.enabled){
        state.manual.semi.nextAt=Date.now()+Math.max(3,Number(manualPrefs.semiIntervalSeconds||5))*1000;
      }
      render();
    }
  }

  function startSemiDismantle(){
    if(!__mgSessionTemplate){
      alert('Najpierw otwórz Bazar albo Warsztat, aż Sesja pokaże GOTOWA.');
      return;
    }

    const qty=Math.max(1,Math.min(500,Math.floor(Number(manualPrefs.semiQty)||1)));

    let title='';
    let detail='';

    if(manualPrefs.semiMode==='inventory'){
      const sel=semiInventorySelection();
      if(!sel){
        alert('Najpierw przejdź do widoku ekwipunku i kliknij „Wybierz” przy przedmiocie.');
        return;
      }
      const available=semiInventoryAvailableCount();
      if(available<=0){
        alert('Wybranego przedmiotu nie ma już w ekwipunku albo jest zablokowany.');
        return;
      }
      const realQty=Math.min(qty,available);
      if(realQty!==qty){
        manualPrefs.semiQty=realQty;
        saveManualPrefs();
      }
      title=sel.name;
      detail=`Źródło: ekwipunek\nDostępne teraz: ${available}\nDo zdemontowania: ${realQty}\n\nKolejka ma maksymalnie ${state.dismantleMaxQueueSize} miejsc. Pomagier zapełni wolne sloty, a gdy miejsce się zwolni, sam doda następną sztukę.`;
    }else{
      const meta=semiSelectedMeta();
      if(!meta){
        alert('Najpierw wybierz przedmiot z tabeli bazaru przyciskiem „Wybierz”.');
        return;
      }
      const maxPrice=Math.max(0,Number(manualPrefs.semiMaxPrice)||0);
      title=meta.name;
      detail=`Źródło: bazar\nLiczba sztuk: ${qty}\nMaks. cena za sztukę: ${maxPrice>0?money(maxPrice):'bez limitu'}\n\nPółautomat będzie kupował po 1 sztuce, gdy zwolni się miejsce w kolejce, i od razu dodawał ją do demontażu.`;
    }

    const ok=confirm(`Uruchomić półautomat demontażu?\n\nPrzedmiot: ${title}\n${detail}`);
    if(!ok) return;

    // Pełny autopilot i półautomat nie pracują jednocześnie.
    autoCfg.enabled=false;
    autoSaveCfg();
    state.auto.nextCycleAt=0;

    const semi=state.manual.semi;
    semi.enabled=true;
    semi.inCycle=false;
    semi.nextAt=Date.now()+300;
    semi.remaining=Math.max(1,Math.floor(Number(manualPrefs.semiQty)||1));
    semi.bought=0;
    semi.queued=0;
    semi.spent=0;
    semi.error=null;
    semi.lastAction=`Start: ${title}, ${semi.remaining} szt. (${manualPrefs.semiMode==='inventory'?'ekwipunek':'bazar'})`;
    state.manual.lastMessage=semi.lastAction;
    render();
  }



  // ============================================================
  // MAGAZYN STRATEGICZNY v4.3
  // ============================================================

  function currentResourceAmount(key){
    return Number(state.parts?.[`part_${key}`]||0);
  }

  function strategicResourceSnapshot(key){
    const actual=currentResourceAmount(key);
    const pending=typeof pendingResource==='function' ? Number(pendingResource(key)||0) : 0;
    return {actual,pending,future:actual+pending};
  }

  function dismantleTimeShadowCost(effectiveSec){
    if(!autoCfg.preferFastDismantle) return 0;
    const slots=Math.max(1,Number(state.dismantleMaxQueueSize||9));
    const hourly=Math.max(0,Number(autoCfg.minProfitPerHour||0));
    return (Number(effectiveSec||0)/3600) * (hourly/slots) * Math.max(0,Number(autoCfg.dismantleTimeWeight||0));
  }

  function needlessYieldInfo(meta,needObj){
    const y=meta?.y||meta?.resources||{};
    let units=0;
    const names=[];
    for(const key of RESOURCE_KEYS){
      const got=Number(y[key]||0);
      if(got<=0) continue;
      if(Number(needObj?.[key]||0)<=0){
        units+=got;
        names.push(`${got} ${RESOURCE_LABELS_V4?.[key]||key}`);
      }
    }
    return {units,names};
  }


  function normalizeStockLevels(levels){
    let critical=Math.max(0,Math.floor(Number(levels?.critical||0)));
    let min=Math.max(critical,Math.floor(Number(levels?.min||0)));
    let target=Math.max(min,Math.floor(Number(levels?.target||0)));
    let max=Math.max(target,Math.floor(Number(levels?.max||0)));
    return {critical,min,target,max};
  }

  function autoResourceStockLevels(key,set,weights,weightSum,cycles){
    if(!set?.length) return {critical:0,min:0,target:0,max:0};

    let avg=0;
    set.forEach((x,i)=>{
      const req=Object.fromEntries(recipeResourceEntries(x.recipe));
      avg += Number(req[key]||0)*weights[i];
    });
    avg/=weightSum||1;

    const target=Math.ceil(avg*cycles);
    const min=Math.ceil(target*Math.max(0,Number(autoCfg.strategicMinRatio||0.5)));

    // Auto "krytyczny" = połowa automatycznego minimum.
    // W trybie ręcznym użytkownik ma pełną kontrolę nad tym progiem.
    const critical=Math.ceil(min*0.5);

    const max=Math.max(
      target,
      Math.ceil(target*Math.max(1,Number(autoCfg.strategicMaxRatio||1.5)))
    );

    return normalizeStockLevels({critical,min,target,max});
  }

  function effectiveResourceStockLevels(key,autoLevels){
    if(autoCfg.strategicStockLevelsMode!=='manual') return normalizeStockLevels(autoLevels);

    const manual=autoCfg.strategicManualLevels?.[key]||{};

    // Każde puste/nieustawione pole w trybie ręcznym dziedziczy bieżącą
    // wartość AUTO. Dzięki temu samo przełączenie na RĘCZNY nie zeruje magazynu.
    const raw={
      critical:Number.isFinite(Number(manual.critical)) ? Number(manual.critical) : autoLevels.critical,
      min:Number.isFinite(Number(manual.min)) ? Number(manual.min) : autoLevels.min,
      target:Number.isFinite(Number(manual.target)) ? Number(manual.target) : autoLevels.target,
      max:Number.isFinite(Number(manual.max)) ? Number(manual.max) : autoLevels.max
    };

    return normalizeStockLevels(raw);
  }

  function stockTierForRow(x){
    if(Number(x.have)<Number(x.critical)) return 'critical';
    if(Number(x.have)<Number(x.min)) return 'minimum';
    if(Number(x.have)<Number(x.target)) return 'target';
    if(Number(x.have)>Number(x.max)) return 'over';
    return 'ok';
  }

  function stockTierLabel(tier){
    return tier==='critical'?'KRYTYCZNY':
      tier==='minimum'?'PONIŻEJ MINIMUM':
      tier==='target'?'DO UZUPEŁNIENIA':
      tier==='over'?'PONAD MAX':'OK';
  }

  function strategicRecipeSet(){
    // v8.5.6 START-FIX: nigdy nie pracuj na surowym state.rankings.
    // W starszym stanie/localStorage mógł zostać null i powodować
    // "Cannot read properties of null (reading 'recipe')", co wyłączało autopilot.
    const rows=[...sanitizeRankings()]
      .filter(x =>
        x?.recipe &&
        x.learned &&
        !x.forbidden &&
        x.outPrice!=null &&
        x.outPrice>0 &&
        x.profit!=null &&
        !x.unknown
      )
      .sort((a,b)=>
        Number((autoCfg.selfLearningEnabled?b.aiScore:b.profitHour)??-Infinity)-
        Number((autoCfg.selfLearningEnabled?a.aiScore:a.profitHour)??-Infinity) ||
        Number(b.profit??-Infinity)-Number(a.profit??-Infinity)
      );

    return rows.slice(0,Math.max(1,Math.min(8,Number(autoCfg.strategicTopRecipes||3))));
  }

  function strategicStockPlan(){
    sanitizeRankings();
    const set=strategicRecipeSet();

    const weights=set.map((_,i)=>Math.pow(0.60,i));
    const weightSum=weights.reduce((a,b)=>a+b,0)||1;
    const cycles=Math.max(1,Math.min(20,Number(autoCfg.strategicStockCycles||4)));

    const res={};

    for(const key of RESOURCE_KEYS){
      const autoLevels=autoResourceStockLevels(key,set,weights,weightSum,cycles);
      const levels=effectiveResourceStockLevels(key,autoLevels);
      const snap=strategicResourceSnapshot(key);
      const have=snap.future;

      res[key]={
        key,
        ...levels,
        autoLevels,
        actual:snap.actual,
        pending:snap.pending,
        have,
        criticalDeficit:Math.max(0,levels.critical-have),
        minimumDeficit:Math.max(0,levels.min-have),
        deficit:Math.max(0,levels.target-have),
        over:Math.max(0,have-levels.max)
      };
    }

    const extrasMap=new Map();

    if(autoCfg.strategicExtraIngredients && set.length){
      set.forEach((x,i)=>{
        for(const e of (x.recipe.extra_ingredients||[])){
          const id=Number(e.item_id);
          if(!id) continue;

          if(!extrasMap.has(id)){
            extrasMap.set(id,{
              id,
              name:e.item_name,
              enhancement:Number(e.min_enhancement_level||0),
              weighted:0,
              have:Number(e.have||0),
              protected:true
            });
          }

          extrasMap.get(id).weighted += Number(e.quantity||0)*weights[i];
        }
      });
    }

    const extras=[...extrasMap.values()].map(e=>{
      const avg=e.weighted/weightSum;
      const target=Math.ceil(avg*cycles);
      const min=Math.ceil(target*Math.max(0,Number(autoCfg.strategicMinRatio||0.5)));
      const critical=Math.ceil(min*0.5);
      const max=Math.max(target,Math.ceil(target*Math.max(1,Number(autoCfg.strategicMaxRatio||1.5))));

      return {
        ...e,
        critical,min,target,max,
        criticalDeficit:Math.max(0,critical-e.have),
        minimumDeficit:Math.max(0,min-e.have),
        deficit:Math.max(0,target-e.have)
      };
    });

    const rows=Object.values(res);
    const criticalResources=rows.filter(x=>x.have<x.critical);
    const minimumResources=rows.filter(x=>x.have<x.min);
    const lowResources=rows.filter(x=>x.have<x.target);

    return {
      recipes:set.filter(x=>x?.recipe).map(x=>x.recipe.item_name),
      resources:res,
      extras,
      criticalResources,
      minimumResources,
      lowResources,
      healthy:
        criticalResources.length===0 &&
        extras.every(x=>x.have>=x.critical)
    };
  }

  function strategicNeedObject(plan,tier='target'){
    const out={};

    const rows=
      tier==='critical' ? plan.criticalResources :
      tier==='minimum' ? plan.minimumResources :
      plan.lowResources;

    // Jeśli próg został przekroczony, uzupełniamy do CELU,
    // a nie tylko o 1 sztukę ponad sam próg.
    for(const x of rows){
      out[x.key]=Math.max(0,Number(x.target)-Number(x.have));
    }

    return out;
  }

  function bestStrategicExtra(plan,tier='target'){
    const rows=plan.extras
      .filter(x=>{
        if(tier==='critical') return Number(x.have)<Number(x.critical);
        if(tier==='minimum') return Number(x.have)<Number(x.min);
        return Number(x.have)<Number(x.target);
      })
      .sort((a,b)=>
        Number(b.target-b.have)-Number(a.target-a.have)
      );

    return rows[0]||null;
  }

  function strategicCanSpend(amount,cycleSpent){
    resetStrategicSpendIfNeeded();
    const a=Number(amount||0);
    if(a<=0) return true;
    if(a>Math.max(0,Number(autoCfg.strategicSpendPerCycle||0)-Number(cycleSpent||0))) return false;
    if(Number(strategicSpend.amount||0)+a>Number(autoCfg.strategicSpendPerDay||0)) return false;
    return true;
  }

  function recordStrategicSpend(amount){
    resetStrategicSpendIfNeeded();
    strategicSpend.amount=Number(strategicSpend.amount||0)+Number(amount||0);
    strategicSpend.purchases=Number(strategicSpend.purchases||0)+1;
    saveJSON(K.strategicSpend,strategicSpend);
  }

  async function strategicUseInventory(plan,tier='target'){
    if(!autoCfg.autoUseInventoryDismantle || !autoCfg.autoDismantle) return false;
    if(dismantleFreeSlots()<=0) return false;

    const needObj=strategicNeedObject(plan,tier);
    if(!Object.keys(needObj).length) return false;

    const candidate=pickBestInventoryDismantleCandidate(needObj);
    if(!candidate) return false;

    state.auto.stage=autoCfg.dryRun?'TEST: MAGAZYN → EKWIPUNEK':'MAGAZYN → EKWIPUNEK';
    state.auto.stageDetail=`${candidate.name} • wartość ${money(candidate.value)} • uzupełnia zapas`;

    const res=await queueOwnedInventoryOne(candidate);
    if(res.ok){
      state.auto.strategicLastAction=`Ekwipunek: ${candidate.name}`;
      return true;
    }
    return false;
  }

  async function strategicBuyResource(plan,tier='target'){
    if(!autoCfg.autoBuy || !autoCfg.autoDismantle) return false;
    if(dismantleFreeSlots()<=0) return false;

    const needObj=strategicNeedObject(plan,tier);
    if(!Object.keys(needObj).length) return false;

    const bundle=optimizeDismantleBundle(needObj);
    if(!bundle?.ok || !bundle.items?.length) return false;

    const next=bundle.items
      .slice()
      .sort((a,b)=>
        Number(a.decisionUnitCost??a.unitPrice??Infinity)-Number(b.decisionUnitCost??b.unitPrice??Infinity) ||
        Number(a.effectiveSec||0)-Number(b.effectiveSec||0) ||
        Number(a.unitPrice||0)-Number(b.unitPrice||0)
      )[0];

    if(!next) return false;

    state.auto.lastDismantleDecision=dismantleDecisionText(next);

    const ob=await apiActive(`/api/bazaar/${settings.characterId}/queue/${Number(next.itemId)}/0`);
    const listings=(ob?.listings||[]).slice().sort((a,b)=>Number(a.price_per_unit)-Number(b.price_per_unit));
    const first=listings[0];
    if(!first) return false;

    const live=Number(first.price_per_unit);
    const planned=Number(next.unitPrice||next.price||live);

    // Poniżej KRYTYCZNEGO i MINIMUM uzupełniamy aktywnie.
    // Dopiero pomiędzy MINIMUM a CELEM wymagamy okazji cenowej.
    if(tier==='target'){
      const bargainLimit=planned*Math.max(0.10,Math.min(1.20,Number(autoCfg.strategicBargainPct||0.85)));
      if(live>bargainLimit){
        state.auto.stage='MAGAZYN: CZEKA NA OKAZJĘ';
        state.auto.stageDetail=`${next.name}: ${money(live)} > okazja ${money(bargainLimit)}`;
        return false;
      }
    }

    if(!strategicCanSpend(live,0)){
      state.auto.stage='MAGAZYN: LIMIT';
      state.auto.stageDetail='Limit wydatków magazynu strategicznego';
      return false;
    }

    if(autoCfg.dryRun){
      state.auto.stage='TEST: MAGAZYN → ZAKUP';
      state.auto.stageDetail=`Kupiłbym ${next.name} za ${money(live)} do zapasu`;
      autoLogMsg('info',`TEST MAGAZYN: kupiłbym ${next.name} za ${money(live)} → ${dismantleYieldText(staticDismantleById(next.itemId))}.`);
      return true;
    }

    const res=await buyBundleItemOne(null,next,0);
    if(res.ok){
      recordStrategicSpend(res.spent||live);
      state.auto.strategicLastAction=`Zakup: ${next.name} za ${money(res.spent||live)}`;
      return true;
    }
    return false;
  }

  async function strategicBuyExtra(plan,tier='target'){
    if(!autoCfg.autoBuy || !autoCfg.strategicExtraIngredients) return false;

    const e=bestStrategicExtra(plan,tier);
    if(!e) return false;

    const ob=await apiActive(`/api/bazaar/${settings.characterId}/queue/${Number(e.id)}/${Number(e.enhancement||0)}`);
    const listings=(ob?.listings||[]).slice().sort((a,b)=>Number(a.price_per_unit)-Number(b.price_per_unit));
    const first=listings[0];

    if(!first){
      state.auto.stage='MAGAZYN: BRAK SKŁADNIKA';
      state.auto.stageDetail=`Brak ofert: ${e.name}`;
      return false;
    }

    const live=Number(first.price_per_unit);
    const hist=getHistoricalPrice(e.id,e.enhancement);
    const reference=hist||live;

    if(tier==='target'){
      const bargainLimit=reference*Math.max(0.10,Math.min(1.20,Number(autoCfg.strategicBargainPct||0.85)));
      if(live>bargainLimit){
        state.auto.stage='MAGAZYN: CZEKA NA OKAZJĘ';
        state.auto.stageDetail=`${e.name}: ${money(live)} > okazja ${money(bargainLimit)}`;
        return false;
      }
    }

    if(!strategicCanSpend(live,0)){
      state.auto.stage='MAGAZYN: LIMIT';
      state.auto.stageDetail='Limit wydatków magazynu strategicznego';
      return false;
    }

    if(autoCfg.dryRun){
      state.auto.stage='TEST: MAGAZYN → SKŁADNIK';
      state.auto.stageDetail=`Kupiłbym ${e.name} za ${money(live)} do zapasu`;
      autoLogMsg('info',`TEST MAGAZYN: kupiłbym składnik ${e.name} za ${money(live)} do zapasu.`);
      return true;
    }

    const buy=await apiActive(`/api/bazaar/${settings.characterId}/buy`,{
      method:'POST',
      body:{itemId:Number(e.id),enhancementLevel:Number(e.enhancement||0),quantity:1}
    });
    const paid=Number(buy?.totalCost??live);
    recordStrategicSpend(paid);

    if(buy?.purchaseLimit) state.purchaseLimit=buy.purchaseLimit;
    state.auto.strategicLastAction=`Składnik: ${e.name} za ${money(paid)}`;
    autoLogMsg('info',`MAGAZYN: kupiono ${e.name} za ${money(paid)} do zapasu.`);
    return true;
  }

  async function strategicStockCycle({tier='target'}={}){
    if(!autoCfg.strategicStockEnabled) return false;

    resetStrategicSpendIfNeeded();

    const plan=strategicStockPlan();
    state.auto.strategicPlan=plan;

    const resourceRows=
      tier==='critical' ? plan.criticalResources :
      tier==='minimum' ? plan.minimumResources :
      plan.lowResources;

    const extraRows=plan.extras.filter(x=>{
      if(tier==='critical') return Number(x.have)<Number(x.critical);
      if(tier==='minimum') return Number(x.have)<Number(x.min);
      return Number(x.have)<Number(x.target);
    });

    if(!resourceRows.length && !extraRows.length) return false;

    if(tier==='critical'){
      state.auto.stage='MAGAZYN: KRYTYCZNY';
      state.auto.stageDetail='Zapas poniżej ręcznego/automatycznego progu krytycznego';
    }else if(tier==='minimum'){
      state.auto.stage='MAGAZYN: MINIMUM';
      state.auto.stageDetail='Zapas poniżej minimum — aktywnie odbudowuję do celu';
    }else{
      state.auto.stage='MAGAZYN: UZUPEŁNIANIE';
      state.auto.stageDetail='Powyżej minimum — uzupełniam do celu tylko przy okazji';
    }

    // 1) własny bezpieczny ekwipunek
    if(await strategicUseInventory(plan,tier)) return true;

    // 2) surowce przez demontaż
    if(await strategicBuyResource(plan,tier)) return true;

    // 3) chronione konkretne składniki receptur
    if(await strategicBuyExtra(plan,tier)) return true;

    return false;
  }

  // v8.7.6: jeśli saleQueue/job twierdzi "collected", ale ten sam inventoryId
  // już jest aktywną ofertą, prawdą jest bazar. Usuwamy wtedy martwy wpis kolejki
  // i wiążemy job z realnym listingiem, zamiast czekać na nieistniejący towar w plecaku.
  function syncProfitSaleQueueWithActiveListings(){
    const active=(state.auto.activeListings||[]).filter(x=>String(x?.status||'active').toLowerCase()==='active');
    if(!active.length) return {changed:false,removed:0,bound:0,abandonedDuplicates:0};

    const byInventory=new Map();
    const byListingId=new Map();
    for(const listing of active){
      const iid=Number(listing?.inventory_id ?? listing?.inventoryId ?? 0);
      const itemId=Number(listing?.item_id ?? listing?.itemId ?? 0);
      const lid=Number(listing?.id ?? listing?.listing_id ?? listing?.listingId ?? 0);
      if(iid && itemId) byInventory.set(`${itemId}:${iid}`,listing);
      if(lid) byListingId.set(lid,listing);
    }

    // Najpierw wyznaczamy właściciela każdej realnej oferty spośród już poprawnie
    // oznaczonych jobów listed. Jedna oferta = maksymalnie jeden fizyczny job.
    const ownerByListingId=new Map();
    for(const job of (profitJobs||[])){
      if(String(job?.status||'').toLowerCase()!=='listed') continue;
      const lid=Number(job?.listingId||0);
      if(!lid || !byListingId.has(lid)) continue;
      const prev=ownerByListingId.get(lid);
      if(!prev || Number(job?.listedAt||0)>Number(prev?.listedAt||0)) ownerByListingId.set(lid,job);
    }

    let changed=false;
    let removed=0;
    let bound=0;
    let abandonedDuplicates=0;
    const removeQueueIds=new Set();
    const removeInventoryKeys=new Set();

    const bindOrDiscardDuplicate=(job,listing,{source='saleQueue'}={})=>{
      if(!job || !listing) return;
      const lid=Number(listing.id ?? listing.listing_id ?? listing.listingId ?? 0);
      const iid=Number(listing.inventory_id ?? listing.inventoryId ?? job.inventoryId ?? 0);
      const itemId=Number(listing.item_id ?? listing.itemId ?? job.itemId ?? 0);
      const existingOwner=lid ? ownerByListingId.get(lid) : null;

      if(existingOwner && Number(existingOwner.queueId||0)!==Number(job.queueId||0)){
        // Listing jest już przypisany do innego, realnego joba. Ten job/saleQueue był tylko
        // historycznym duplikatem po scaleniu/rozcięciu stacka i nie może liczyć się drugi raz.
        job.status='abandoned';
        job.abandonedAt=Date.now();
        job.reconciledAt=Date.now();
        job.reconcileReason=`duplikat pipeline → listing ${lid} należy do queueId ${Number(existingOwner.queueId||0)}`;
        job.missingActiveChecks=0;
        abandonedDuplicates++;
        changed=true;
        return;
      }

      job.status='listed';
      job.itemId=itemId||Number(job.itemId||0);
      job.inventoryId=iid||Number(job.inventoryId||0);
      job.listingId=lid||null;
      job.listPrice=Number(listing.price_per_unit ?? listing.price ?? job.listPrice ?? 0)||job.listPrice||null;
      job.listedAt=Number(job.listedAt||Date.now());
      job.missingActiveChecks=0;
      job.reconciledAt=Date.now();
      job.reconcileReason=`${source} → aktywna oferta inventoryId ${iid}`;
      if(lid) ownerByListingId.set(lid,job);
      bound++;
      changed=true;
    };

    for(const entry of (saleQueue||[])){
      const itemId=Number(entry?.itemId||0);
      const iid=Number(entry?.inventoryId||0);
      if(!itemId || !iid) continue;
      const key=`${itemId}:${iid}`;
      const listing=byInventory.get(key);
      if(!listing) continue;

      const qid=Number(entry?.jobQueueId||0);
      const job=qid ? (profitJobs||[]).find(j=>Number(j?.queueId||0)===qid) : null;
      if(job) bindOrDiscardDuplicate(job,listing,{source:'saleQueue'});
      removeQueueIds.add(qid);
      removeInventoryKeys.add(key);
      changed=true;
    }

    // Napraw również joby collected/unresolved bez poprawnego wpisu saleQueue.
    for(const job of (profitJobs||[])){
      const status=String(job?.status||'').toLowerCase();
      if(!['collected','unresolved'].includes(status)) continue;
      const itemId=Number(job?.itemId||0);
      const iid=Number(job?.inventoryId||0);
      if(!itemId || !iid) continue;
      const listing=byInventory.get(`${itemId}:${iid}`);
      if(!listing) continue;

      bindOrDiscardDuplicate(job,listing,{source:'fizyczny towar już na bazarze'});
      if(Number(job.queueId||0)) removeQueueIds.add(Number(job.queueId));
      removeInventoryKeys.add(`${itemId}:${iid}`);
    }

    if(changed){
      const before=saleQueue.length;
      saleQueue=saleQueue.filter(entry=>{
        const qid=Number(entry?.jobQueueId||0);
        const key=`${Number(entry?.itemId||0)}:${Number(entry?.inventoryId||0)}`;
        return !(removeQueueIds.has(qid) || removeInventoryKeys.has(key));
      });
      removed=Math.max(0,before-saleQueue.length);
      saveProfitPipeline();
      if(removed||bound||abandonedDuplicates){
        autoLogMsg('info',`PIPELINE: zsynchronizowano bazar • saleQueue -${removed} • powiązano ${bound} • duplikaty ${abandonedDuplicates}.`);
      }
    }

    return {changed,removed,bound,abandonedDuplicates};
  }

  function listingListedAtMs(listing,job){
    const raw=String(listing?.listed_at||'').trim();
    if(raw){
      const iso=raw.includes('T') ? raw : raw.replace(' ','T');
      const parsed=Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso)?iso:`${iso}Z`);
      if(Number.isFinite(parsed)) return parsed;
    }
    return Number(job?.listedAt||0);
  }

  function profitJobForActiveListing(listing){
    const listingId=Number(listing?.id ?? listing?.listing_id ?? listing?.listingId ?? 0);
    const iid=Number(listing?.inventory_id ?? listing?.inventoryId ?? 0);
    const itemId=Number(listing?.item_id ?? listing?.itemId ?? 0);

    if(listingId){
      const byId=(profitJobs||[]).find(j=>
        String(j?.status||'').toLowerCase()==='listed' && Number(j?.listingId||0)===listingId
      );
      if(byId) return byId;
    }
    if(iid && itemId){
      return (profitJobs||[]).find(j=>
        String(j?.status||'').toLowerCase()==='listed' &&
        Number(j?.itemId||0)===itemId && Number(j?.inventoryId||0)===iid
      )||null;
    }
    return null;
  }

  // v8.7.6: obniżamy tylko stare, wyraźnie zawyżone oferty produktów stworzonych przez Pomagiera.
  // Nigdy nie dotykamy ręcznych ofert użytkownika, nie podnosimy ceny i nie schodzimy poniżej
  // minimalnego wymaganego zysku. Maksymalnie jedna obniżka na cykl = bezpieczny POST/PATCH flow.
  async function repriceOneOverpricedProfitListing(){
    if(!autoCfg.autoSell || !autoCfg.autoRepriceListings) return false;

    const now=Date.now();
    const threshold=Math.max(1,Number(autoCfg.repriceOverMarketPct||12))/100;
    const minAgeMs=Math.max(0,Number(autoCfg.repriceMinAgeMinutes||20))*60*1000;
    const cooldownMs=Math.max(1,Number(autoCfg.repriceCooldownMinutes||30))*60*1000;
    const active=(state.auto.activeListings||[]).filter(x=>String(x?.status||'active').toLowerCase()==='active');

    const candidates=[];
    for(const listing of active){
      const job=profitJobForActiveListing(listing);
      if(!job) continue; // ręczna oferta — nie ruszamy

      const current=Math.floor(Number(listing.price_per_unit ?? listing.price ?? 0));
      const marketMin=Math.floor(Number(listing.market_min_price ?? 0));
      const minAllowed=Math.max(1,Math.floor(Number(listing.min_listing_price ?? 1)));
      if(!current || !marketMin || current<=marketMin) continue;
      if(current <= marketMin*(1+threshold)) continue;

      const listedAt=listingListedAtMs(listing,job);
      if(listedAt && now-listedAt<minAgeMs) continue;
      if(now-Number(job.lastRepricedAt||0)<cooldownMs) continue;

      const itemId=Number(listing.item_id ?? listing.itemId ?? job.itemId ?? 0);
      const sameOwn=active.filter(x=>
        Number(x?.item_id ?? x?.itemId ?? 0)===itemId &&
        Number(x?.id ?? x?.listing_id ?? x?.listingId ?? 0)!==Number(listing?.id ?? listing?.listing_id ?? listing?.listingId ?? 0)
      );
      const ownAlreadyAtMarket=sameOwn.some(x=>Number(x?.price_per_unit ?? x?.price ?? 0)===marketMin);
      let target=ownAlreadyAtMarket ? marketMin : marketMin-1;
      target=Math.max(minAllowed,Math.min(current-1,Math.floor(target)));
      if(target>=current) continue;

      const fee=feeFor(target);
      const expectedProfit=target-fee-Number(job.costBasis||0);
      if(expectedProfit<Number(autoCfg.minProfitPerCraft||0)) continue;

      candidates.push({listing,job,current,marketMin,target,expectedProfit,ratio:current/marketMin});
    }

    candidates.sort((a,b)=>b.ratio-a.ratio || a.marketMin-b.marketMin);
    const c=candidates[0];
    if(!c) return false;

    if(autoCfg.dryRun){
      state.auto.stage='TEST: KOREKTA CENY';
      state.auto.stageDetail=`${c.job.name}: ${money(c.current)} → ${money(c.target)} (rynek ${money(c.marketMin)})`;
      autoLogMsg('info',`TEST CENA: obniżyłbym ${c.job.name} ${money(c.current)} → ${money(c.target)} • rynek ${money(c.marketMin)}.`);
      return true;
    }

    const listingId=Number(c.listing.id ?? c.listing.listing_id ?? c.listing.listingId ?? 0);
    if(!listingId) return false;

    state.auto.stage='KOREKTA CENY';
    state.auto.stageDetail=`${c.job.name}: ${money(c.current)} → ${money(c.target)} • rynek ${money(c.marketMin)}`;
    await apiActive(`/api/bazaar/${settings.characterId}/listing/${listingId}/price`,{
      method:'PATCH',
      body:{pricePerUnit:Number(c.target)}
    });

    c.job.listPrice=Number(c.target);
    c.job.expectedProfitAtList=Number(c.expectedProfit);
    c.job.expectedProfit=Number(c.expectedProfit);
    c.job.lastRepricedAt=Date.now();
    c.job.repriceCount=Number(c.job.repriceCount||0)+1;
    c.listing.price_per_unit=Number(c.target);
    saveProfitPipeline();
    autoLogMsg('info',`CENA: ${c.job.name} obniżona ${money(c.current)} → ${money(c.target)} • rynek ${money(c.marketMin)} • planowany zysk ~${money(c.expectedProfit)}.`);
    return true;
  }

  // ============================================================
  // AUTONOMICZNA LINIA ZYSKU v4
  // ============================================================

  const RESOURCE_LABELS_V4 = {
    zlom:'złom',
    odpady:'odpady',
    tworzywa:'tworzywa',
    tekstylia:'tekstylia',
    elektrosmieci:'elektrośmieci',
    komponenty_hq:'komponenty HQ'
  };

  function pendingResource(key){
    return (state.dismantleQueue||[]).reduce((sum,q)=>sum+Number(q?.[`yield_${key}`]||0),0);
  }

  function activeSameItemCount(itemId){
    return (state.auto.activeListings||[]).filter(
      x=>Number(x.item_id)===Number(itemId) && x.status==='active'
    ).length;
  }

  const TERMINAL_PROFIT_JOB_STATUSES = new Set(['sold','returned','abandoned']);

  function craftEntryId(x){
    return Number(x?.id ?? x?.queueId ?? x?.queue_id ?? 0);
  }

  function craftServerSnapshotFresh(){
    return Number(state.craftSnapshotAt||0)>0 && (Date.now()-Number(state.craftSnapshotAt||0))<180000;
  }

  function serverCraftState(){
    const queue=Array.isArray(state.craftQueue)?state.craftQueue:[];
    const ready=Array.isArray(state.craftReady)?state.craftReady:[];
    const queueIds=new Set(queue.map(craftEntryId).filter(Boolean));
    const readyIds=new Set(ready.map(craftEntryId).filter(Boolean));
    return {
      fresh:craftServerSnapshotFresh(),
      queue, ready, queueIds, readyIds,
      active:queue.length,
      readyCount:ready.length,
      used:queue.length+ready.length
    };
  }

  function profitJobIsPhysicallyLive(job){
    const status=String(job?.status||'').toLowerCase();
    if(TERMINAL_PROFIT_JOB_STATUSES.has(status)) return false;
    if(status!=='crafting') return true;

    const srv=serverCraftState();
    if(!srv.fresh) return true; // brak świeżego snapshotu: nie zgadujemy

    const qid=Number(job?.queueId||0);
    if(!qid) return false;
    return srv.queueIds.has(qid) || srv.readyIds.has(qid);
  }

  function liveProfitJobsForItem(itemId){
    return (profitJobs||[]).filter(
      x=>Number(x.itemId)===Number(itemId) && profitJobIsPhysicallyLive(x)
    );
  }

  function productExposureDetails(itemId){
    const id=Number(itemId);
    const jobs=liveProfitJobsForItem(id);

    // Każdy job Pomagiera oznacza dokładnie jedną fizyczną sztukę produktu.
    // Ten sam produkt po odbiorze może równocześnie istnieć w profitJobs + saleQueue,
    // a po wystawieniu w profitJobs + activeListings. Liczymy go tylko raz.
    let total=jobs.length;
    let orphanQueue=0;
    let externalListings=0;

    const liveQueueIds=new Set(
      jobs.map(j=>Number(j.queueId||0)).filter(Boolean)
    );
    const linkedListingIds=new Set(
      jobs.map(j=>Number(j.listingId||0)).filter(Boolean)
    );

    for(const entry of (saleQueue||[])){
      if(Number(entry.itemId)!==id) continue;
      const qid=Number(entry.jobQueueId||0);
      if(qid && liveQueueIds.has(qid)) continue;
      // Osierocony wpis kolejki sprzedaży nadal reprezentuje realny towar.
      const qty=Math.max(1,Number(entry.quantity||1));
      orphanQueue+=qty;
      total+=qty;
    }

    for(const listing of (state.auto.activeListings||[])){
      if(Number(listing.item_id)!==id || listing.status!=='active') continue;

      const listingId=Number(
        listing.id ?? listing.listing_id ?? listing.listingId ?? 0
      );
      if(listingId && linkedListingIds.has(listingId)) continue;

      // Fallback dla starszych jobów bez listingId: po inventoryId + cenie.
      const invId=Number(listing.inventory_id ?? listing.inventoryId ?? 0);
      const price=Number(listing.price_per_unit ?? listing.price ?? 0);
      const matchedLegacy=jobs.some(j=>
        String(j.status||'').toLowerCase()==='listed' &&
        invId>0 &&
        Number(j.inventoryId||0)===invId &&
        (!Number(j.listPrice||0) || !price || Number(j.listPrice||0)===price)
      );
      if(matchedLegacy) continue;

      const qty=Math.max(1,Number(listing.quantity||1));
      externalListings+=qty;
      total+=qty;
    }

    return {
      total,
      jobs:jobs.length,
      orphanQueue,
      externalListings
    };
  }

  function productExposure(itemId){
    return productExposureDetails(itemId).total;
  }

  function autonomousTargets(){
    computeRankings();
    const metric = autoCfg.targetMetric === 'profit'
      ? 'profit'
      : autoCfg.targetMetric === 'cashProfit'
        ? 'cashProfit'
        : 'profitHour';

    const rows=sanitizeRankings()
      .filter(x =>
        x?.recipe &&
        x.learned &&
        !x.forbidden &&
        !x.unknown &&
        x.outPrice != null &&
        x.outPrice > 0 &&
        x.profit != null &&
        x.profit >= Number(autoCfg.minProfitPerCraft||0) &&
        x.profitHour != null &&
        x.profitHour >= Number(autoCfg.minProfitPerHour||0) &&
        !recipePurchaseStall(x.recipe.id)?.blockedUntil &&
        productExposure(x.recipe.result_item_id) < Number(autoCfg.maxSameProductExposure||2)
      )
      .sort((a,b)=>{
        const learnedMetric=(x)=>{
          if(!autoCfg.selfLearningEnabled) return Number(x[metric]??-Infinity);
          if(metric==='profit') return Number(x.learnedProfit??x.profit??-Infinity);
          if(metric==='cashProfit') return Number(x.learnedCashProfit??x.cashProfit??-Infinity);
          return Number(x.aiScore??x.learnedProfitHour??x.profitHour??-Infinity);
        };
        return learnedMetric(b)-learnedMetric(a) ||
          Number(b.profit??-Infinity)-Number(a.profit??-Infinity);
      });

    if(autoCfg.localAiEnabled && autoCfg.localAiInfluenceEconomy && state.localAI.connected){
      const preferred=Number(state.localAI.preferredRecipeId||0);
      const idx=rows.findIndex(x=>Number(x?.recipe?.id)===preferred);
      if(idx>0){
        const [picked]=rows.splice(idx,1);
        rows.unshift(picked);
      }
    }

    return rows;
  }

  function pickAutonomousTarget(){
    const all = autonomousTargets();
    if(state.auto.lockedRecipeId){
      const locked = all.find(x=>Number(x?.recipe?.id)===Number(state.auto.lockedRecipeId));
      if(locked) return locked;
      state.auto.lockedRecipeId=null;
    }
    return all[0]||null;
  }

  function autonomousRejectReason(x){
    if(!x?.recipe) return 'brak danych receptury';
    if(!x.learned) return 'receptura nieodblokowana';
    if(x.forbidden) return `moneta niedozwolona (${coinModeLabel()})`;
    if(x.outPrice == null || x.outPrice <= 0) return 'brak aktualnej ceny produktu na bazarze';
    if(x.fullBundle && !x.fullBundle.ok) return `globalny plan: ${x.fullBundle.reason||'brak zestawu'}`;
    if(!x.globalOptimized && x.profit!=null && x.profit>=Number(autoCfg.minProfitPerCraft||0)) return 'wstępna wycena — poza top shortlistą';
    if(x.missingUnknown || x.unknown){
      const missExtra=(x.extraPlan||[]).filter(e=>e.miss>0 && e.unit==null).map(e=>e.name);
      const missRes=(x.resourcePlan||[]).filter(e=>e.miss>0 && !e.opt).map(e=>RESOURCE_LABELS_V4[e.key]||e.key);
      const arr=[...missExtra,...missRes];
      return arr.length ? `brak ceny/źródła: ${arr.join(', ')}` : 'niepełna wycena';
    }
    if(x.profit == null) return 'nie da się policzyć zysku';
    if(x.profit < Number(autoCfg.minProfitPerCraft||0)) return `zysk ${money(x.profit)} < minimum ${money(autoCfg.minProfitPerCraft)}`;
    if(x.profitHour == null) return 'brak zysku/h';
    if(x.profitHour < Number(autoCfg.minProfitPerHour||0)) return `zysk/h ${money(x.profitHour)} < minimum ${money(autoCfg.minProfitPerHour)}`;
    if(productExposure(x.recipe.result_item_id) >= Number(autoCfg.maxSameProductExposure||2)){
      const exp=productExposureDetails(x.recipe.result_item_id);
      return `limit ekspozycji produktu (${exp.total}/${Number(autoCfg.maxSameProductExposure||2)})`;
    }
    return 'spełnia warunki';
  }

  function autonomousBlockerSummary(limit=3){
    const rows=sanitizeRankings()
      .filter(x=>x?.recipe && x.learned)
      .slice()
      .sort((a,b)=>
        Number(b.profitHour??-Infinity)-Number(a.profitHour??-Infinity) ||
        Number(b.profit??-Infinity)-Number(a.profit??-Infinity)
      );

    const out=[];
    for(const x of rows){
      const reason=autonomousRejectReason(x);
      if(reason==='spełnia warunki') continue;
      out.push(`${x.recipe.item_name}: ${reason}`);
      if(out.length>=Math.max(1,Number(limit||3))) break;
    }
    return out;
  }

  function futureResourceHave(key){
    return Number(state.parts?.[`part_${key}`]||0)+pendingResource(key);
  }

  function buildAutonomousNeeds(target){
    if(!target?.recipe){
      return {resources:[],extras:[],allPhysicalReady:false,allFutureReady:false};
    }

    const resources = (target.resourcePlan||[]).map(p=>{
      const actual=Number(state.parts?.[`part_${p.key}`]||0);
      const pending=pendingResource(p.key);
      const future=actual+pending;
      return {
        ...p,
        actual,
        pending,
        future,
        missPhysical:Math.max(0,Number(p.qty)-actual),
        missFuture:Math.max(0,Number(p.qty)-future)
      };
    });

    // recipes endpoint reports current "have" for extra ingredients.
    const currentRecipe=(state.recipes||[]).find(r=>Number(r.id)===Number(target.recipe.id))||target.recipe;
    const extras=(currentRecipe.extra_ingredients||[]).map(x=>{
      const qty=Number(x.quantity||0);
      const have=Number(x.have||0);
      const enh=Number(x.min_enhancement_level||0);
      const market=getPrice(x.item_id,enh);
      return {
        id:Number(x.item_id),
        name:x.item_name,
        qty,
        have,
        miss:Math.max(0,qty-have),
        minEnhancement:enh,
        unit:market?.min_price==null?null:Number(market.min_price),
        market
      };
    });

    const futureNeedObj=Object.fromEntries(
      resources.map(x=>[x.key,x.missFuture]).filter(([,v])=>v>0)
    );
    const physicalNeedObj=Object.fromEntries(
      resources.map(x=>[x.key,x.missPhysical]).filter(([,v])=>v>0)
    );

    const futureBundle=optimizeDismantleBundle(futureNeedObj);
    const physicalBundle=optimizeDismantleBundle(physicalNeedObj);

    return {
      resources,
      extras,
      futureBundle,
      physicalBundle,
      allPhysicalReady:
        resources.every(x=>x.missPhysical<=0) &&
        extras.every(x=>x.miss<=0),
      allFutureReady:
        resources.every(x=>x.missFuture<=0) &&
        extras.every(x=>x.miss<=0)
    };
  }

  async function refreshProfitMarketState(){
    const [baz,recipes,dq,myListings,dismantlable] = await Promise.all([
      apiActive(`/api/bazaar/${settings.characterId}/index`),
      apiActive(`/api/workshop/${settings.characterId}/crafting-recipes`),
      apiActive(`/api/workshop/${settings.characterId}/queue`),
      apiActive(`/api/bazaar/${settings.characterId}/my-listings?status=active`),
      autoCfg.autoUseInventoryDismantle
        ? apiActive(`/api/workshop/${settings.characterId}/dismantlable`)
        : Promise.resolve(null)
    ]);
    parseBazaar(baz);
    parseRecipes(recipes);
    parseQueue(dq);
    if(dismantlable?.items){
      state.manual.dismantlableItems=dismantlable.items;
      state.manual.lastRefreshAt=Date.now();
    }
    state.auto.activeListings=Array.isArray(myListings?.listings)?myListings.listings:[];
    state.auto.activeListingCount=Number(myListings?.activeCount ?? state.auto.activeListings.length);
    state.auto.maxListings=Number(myListings?.maxListings ?? 10);
    buildResourceOptions();
    computeRankings();
    state.lastUpdated=Date.now();
    return {baz,recipes,dq,myListings,dismantlable};
  }

  async function getSellable(){
    return apiActive(`/api/bazaar/${settings.characterId}/sellable`);
  }

  function snapshotSellable(items,itemId){
    const m=new Map();
    for(const x of (items||[])){
      if(Number(x.item_id)!==Number(itemId)) continue;
      m.set(Number(x.inventory_id),Number(x.quantity||1));
    }
    return m;
  }

  function findNewSellableInventory(beforeMap,afterItems,itemId){
    const matches=(afterItems||[]).filter(x=>Number(x.item_id)===Number(itemId));
    const fresh=matches.find(x=>!beforeMap.has(Number(x.inventory_id)));
    if(fresh) return fresh;
    const grown=matches.find(x=>Number(x.quantity||1)>Number(beforeMap.get(Number(x.inventory_id))||0));
    return grown||null;
  }

  function findSellableItem(items,inventoryId){
    return (items||[]).find(x=>Number(x.inventory_id)===Number(inventoryId))||null;
  }

  function minPriceForProfit(costBasis,minProfit){
    const feeRate=Number(settings.listingFeeRate||0.05);
    if(feeRate>=1) return Infinity;
    return Math.ceil((Number(costBasis||0)+Number(minProfit||0))/(1-feeRate));
  }

  function chooseSmartListingPrice(sellableItem,orderbook,costBasis){
    const min=Number(sellableItem?.min||1);
    const max=Number(sellableItem?.max||sellableItem?.bazaar_max_listing_price||Number.MAX_SAFE_INTEGER);
    const listings=(orderbook?.listings||[])
      .filter(x=>Number(x.price_per_unit)>0)
      .slice()
      .sort((a,b)=>Number(a.price_per_unit)-Number(b.price_per_unit));

    let price=null;
    const low=listings[0]?Number(listings[0].price_per_unit):null;
    const second=listings[1]?Number(listings[1].price_per_unit):null;

    if(autoCfg.listingStrategy==='match'){
      price=low;
    }else if(autoCfg.listingStrategy==='undercut1'){
      price=low==null?null:low-1;
    }else{
      // SMART: jeżeli pierwsza oferta jest pojedynczym mocnym zaniżeniem,
      // nie ścigamy jej. Wchodzimy tuż pod drugą ofertę.
      if(low!=null && second!=null && second>=low*1.15) price=second-1;
      else if(low!=null) price=low-1;
      else price=Number(sellableItem?.market_cheapest||0)||null;
    }

    if(price==null || !Number.isFinite(price) || price<=0){
      price=Math.max(min,Number(sellableItem?.sell_price_paser||min));
    }

    price=Math.max(min,Math.min(max,Math.floor(price)));
    const breakEven=minPriceForProfit(costBasis,Number(autoCfg.minProfitPerCraft||0));

    return {
      price,
      min,
      max,
      low,
      second,
      breakEven,
      net:netAfterFee(price),
      expectedProfit:netAfterFee(price)-Number(costBasis||0)
    };
  }

  function adoptOneOrphanReadyProfitJob(){
    const ready=Array.isArray(state.craftReady)?state.craftReady:[];
    if(!ready.length) return null;

    const knownQueueIds=new Set((profitJobs||[]).map(j=>Number(j?.queueId||0)).filter(Boolean));
    const orphan=ready.find(r=>{
      const qid=craftEntryId(r);
      if(!qid || knownQueueIds.has(qid)) return false;

      const recipeId=Number(r?.recipe_id||r?.recipeId||0);
      const itemId=Number(r?.result_item_id||r?.item_id||r?.itemId||0);
      if(!recipeId || !itemId) return false;

      // Nie przejmujemy dowolnego ręcznego craftu. Osierocony READY musi odpowiadać
      // aktualnie znanej, nauczonej recepturze ekonomicznej Pomagiera.
      const rank=(state.rankings||[]).find(x=>
        Number(x?.recipe?.id||0)===recipeId &&
        Number(x?.recipe?.result_item_id||0)===itemId &&
        !!x?.learned &&
        !x?.forbidden
      );
      return !!rank;
    });
    if(!orphan) return null;

    const recipeId=Number(orphan?.recipe_id||orphan?.recipeId||0);
    const itemId=Number(orphan?.result_item_id||orphan?.item_id||orphan?.itemId||0);
    const rank=(state.rankings||[]).find(x=>
      Number(x?.recipe?.id||0)===recipeId && Number(x?.recipe?.result_item_id||0)===itemId
    )||null;

    const adopted={
      queueId:craftEntryId(orphan),
      recipeId,
      itemId,
      name:String(orphan?.item_name||rank?.recipe?.item_name||`Produkt #${itemId}`),
      status:'crafting',
      costBasis:Number(rank?.fullCost||0),
      expectedMarketPrice:Number(rank?.outPrice||0),
      expectedProfit:Number(rank?.profit||0),
      expectedProfitHour:Number(rank?.profitHour||0),
      predictedProfitAtStart:Number(rank?.profit||0),
      predictedProfitHourAtStart:Number(rank?.profitHour||0),
      predictedMarketAtStart:Number(rank?.outPrice||0),
      learningFactorAtStart:Number(rank?.learningFactor||1),
      learningConfidenceAtStart:Number(rank?.learningConfidence||0),
      startedAt:Number(orphan?.started_at||Date.now()),
      orphanAdoptedAt:Date.now(),
      reconcileReason:'server READY bez lokalnego profitJob — bezpieczna adopcja v8.7.8'
    };

    profitJobs.push(adopted);
    saveProfitPipeline();
    autoLogMsg('warn',`ODBIÓR: odzyskano osierocony READY ${adopted.name} • queueId ${adopted.queueId}.`);
    localAiPushEvent('craft_ready_orphan_adopted',{
      queueId:Number(adopted.queueId),
      recipeId:Number(adopted.recipeId),
      itemId:Number(adopted.itemId),
      name:String(adopted.name||'')
    });
    return adopted;
  }

  async function collectOneFinishedProfitJob(){
    if(!autoCfg.autoCollect) return false;

    const ready=Array.isArray(state.craftReady)?state.craftReady:[];
    let job=(profitJobs||[]).find(j =>
      String(j?.status||'').toLowerCase()==='crafting' &&
      ready.some(r=>craftEntryId(r)===Number(j?.queueId||0))
    );

    // v8.7.8: serwer READY jest fizyczną prawdą. Jeśli lokalny profitJob zniknął,
    // odzyskujemy go z recipe_id/result_item_id i dopiero potem używamy zwykłej ścieżki odbioru.
    if(!job) job=adoptOneOrphanReadyProfitJob();
    if(!job) return false;

    if(autoCfg.dryRun){
      state.auto.stage='TEST: ODBIÓR';
      state.auto.stageDetail=`Odebrałbym ${job.name} z produkcji`;
      autoLogMsg('info',`TEST: odebrałbym ${job.name} z produkcji.`);
      return true;
    }

    // Gotowy craft również zajmuje miejsce w plecaku.
    // Jeśli plecak jest ciasny, najpierw próbujemy wystawić produkt
    // już czekający w saleQueue — to zwalnia slot bez chowania towaru.
    if(autoCfg.localAiInventoryGuardian){
      let invState=null;
      try{ invState=await localAiFreshInventory(); }catch{}

      const freeSlots=invState
        ? Math.max(0,Number(invState.capacity||0)-Number(invState.slotsUsed||0))
        : null;

      if(freeSlots!=null && freeSlots<1 && autoCfg.autoSell && saleQueue.length){
        state.auto.stage='MIEJSCE NA ODBIÓR';
        state.auto.stageDetail=`Brak miejsca na ${job.name} — najpierw próbuję wystawić gotowy produkt`;

        if(await sellOneProfitItem()){
          return true;
        }
      }

      const bag=await localAiGuardInventory({
        reason:`przed odbiorem produkcji: ${job.name}`,
        processLoot:true,
        minimumReserve:1
      });

      if(!bag.ok){
        state.auto.stage='CZEKA: MIEJSCE NA ODBIÓR';
        state.auto.stageDetail=`${job.name}: plecak ${Number(bag.inventory?.slotsUsed||0)}/${Number(bag.inventory?.capacity||0)} — zwalniam miejsce`;
        autoLogMsg('warn',`ODBIÓR: ${job.name} czeka — brak bezpiecznego miejsca w plecaku.`);
        return false;
      }
    }

    state.auto.stage='ODBIÓR';
    state.auto.stageDetail=`Odbieram ${job.name}`;

    const before=await getSellable();
    const beforeMap=snapshotSellable(before?.items,job.itemId);

    let collected;
    try{
      collected=await apiActive(`/api/workshop/${settings.characterId}/crafting/${Number(job.queueId)}/collect`,{
        method:'POST',
        body:{}
      });
    }catch(e){
      const msg=String(e?.message||e);

      if(
        autoCfg.localAiInventoryGuardian &&
        /przeciąż|przeciaz|overload|plecak|ekwipunk|brak miejsca|pełn/i.test(msg)
      ){
        autoLogMsg('warn',`ODBIÓR: serwer odrzucił ${job.name} z powodu miejsca — uruchamiam recovery plecaka.`);

        const bag=await localAiGuardInventory({
          reason:`serwer odrzucił odbiór: ${job.name}`,
          processLoot:true,
          forceRelief:true,
          minimumReserve:2
        });

        if(bag.ok){
          state.auto.stage='ODBIÓR: PLECAK NAPRAWIONY';
          state.auto.stageDetail=`${job.name}: ${Number(bag.inventory?.slotsUsed||0)}/${Number(bag.inventory?.capacity||0)} • ponowię odbiór w następnym cyklu`;

          localAiPushEvent('craft_collect_space_recovered',{
            queueId:Number(job.queueId),
            itemId:Number(job.itemId),
            name:String(job.name||''),
            slotsUsed:Number(bag.inventory?.slotsUsed||0),
            capacity:Number(bag.inventory?.capacity||0),
            moved:Number(bag.moved||0)
          });

          return true;
        }
      }

      throw e;
    }

    if(collected?.recipes) parseRecipes(collected);

    await sleep(500);
    const after=await getSellable();
    const inv=findNewSellableInventory(beforeMap,after?.items,job.itemId);

    job.status='collected';
    job.collectedAt=Date.now();
    learnCraftCollected(job);
    profitStats.collected=Number(profitStats.collected||0)+1;

    if(inv){
      saleQueue.push({
        inventoryId:Number(inv.inventory_id),
        itemId:Number(job.itemId),
        quantity:1,
        name:job.name,
        costBasis:Number(job.costBasis||0),
        recipeId:Number(job.recipeId),
        jobQueueId:Number(job.queueId),
        startedAt:Number(job.startedAt||Date.now()),
        predictedProfitAtStart:Number(job.predictedProfitAtStart||job.expectedProfit||0),
        createdAt:Date.now()
      });
      job.inventoryId=Number(inv.inventory_id);
      autoLogMsg('info',`ODEBRANO: ${job.name} → kolejka sprzedaży.`);
    }else if(collected?.collectedToSchowek){
      job.status='storage';
      autoLogMsg('warn',`ODEBRANO: ${job.name}, ale trafił do schowka — nie wystawiam automatycznie.`);
    }else{
      job.status='unresolved';
      autoLogMsg('warn',`ODEBRANO: ${job.name}, ale nie udało się wskazać inventoryId do sprzedaży.`);
    }

    // Natychmiast odśwież stan plecaka po odbiorze. Nie czekamy
    // aż interfejs gry sam się odświeży.
    if(autoCfg.localAiInventoryGuardian){
      try{
        const fresh=await localAiFreshInventory();
        state.localAI.inventoryGuardian.lastAction=
          `Odebrano craft: ${job.name} • ${Number(fresh.slotsUsed||0)}/${Number(fresh.capacity||0)}`;
        localAiSavePersistent();

        if(autoCfg.localAiMelinaFirst){
          await localAiStoreBackpackToMelina({reason:`po odbiorze craftu: ${job.name}`});
        }
      }catch{}
    }

    saveProfitPipeline();
    return true;
  }

  async function sellOneProfitItem(){
    if(!autoCfg.autoSell || !saleQueue.length) return false;

    if(state.auto.activeListingCount >= Math.max(0,state.auto.maxListings-Number(autoCfg.reserveListingSlots||0))){
      state.auto.stage='CZEKA: BAZAR';
      state.auto.stageDetail=`Brak wolnego slotu wystawienia (${state.auto.activeListingCount}/${state.auto.maxListings})`;
      return false;
    }

    let sellable=await getSellable();
    let items=sellable?.items||[];
    let melinaCache=null;
    let changedQueue=false;
    const blockers=[];

    // Nie blokujemy całej sprzedaży przez pierwszy wpis saleQueue.
    // Szukamy pierwszego produktu, który rzeczywiście można teraz wystawić.
    for(let idx=0; idx<saleQueue.length; idx++){
      const entry=saleQueue[idx];
      if(!entry || typeof entry!=='object'){
        saleQueue.splice(idx--,1);
        changedQueue=true;
        continue;
      }

      if(activeSameItemCount(entry.itemId)>=Number(autoCfg.maxSameProductListings||2)){
        blockers.push(`${entry.name}: aktywna oferta`);
        continue;
      }

      if(Number(entry.retryAfter||0)>Date.now()){
        blockers.push(`${entry.name}: czekam na synchronizację`);
        continue;
      }

      let si=findSellableItem(items,entry.inventoryId);

      if(!si && autoCfg.localAiMelinaFirst && autoCfg.localAiMelinaReturnForSale){
        if(!melinaCache){
          try{ melinaCache=await localAiFreshMelina(); }
          catch{ melinaCache={storageItems:[]}; }
        }

        const inMelina=(melinaCache.storageItems||[]).some(
          x=>Number(x.inventory_id)===Number(entry.inventoryId)
        );

        if(inMelina){
          state.auto.stage='RUPIECIARNIA → SPRZEDAŻ';
          state.auto.stageDetail=`Wyjmuję ${entry.name} do wystawienia`;

          const take=await localAiTakeInventoryFromMelina(entry.inventoryId);
          if(!take.ok){
            blockers.push(`${entry.name}: nie mogę wyjąć z rupieciarni`);
            continue;
          }

          await sleep(200);
          sellable=await getSellable();
          items=sellable?.items||[];
          si=findSellableItem(items,entry.inventoryId);
          melinaCache=null;
        }
      }

      if(!si){
        // Jednorazowy brak w sellable może być tylko opóźnieniem synchronizacji.
        // Po dwóch brakach NIE wyrzucamy wpisu — odkładamy go na kilka minut,
        // dzięki czemu nie ginie towar po chwilowym desyncu API.
        entry.missingChecks=Number(entry.missingChecks||0)+1;

        if(entry.missingChecks>=2){
          const job=profitJobs.find(j=>Number(j.queueId)===Number(entry.jobQueueId));
          if(job && ['collected','unresolved'].includes(String(job.status||'').toLowerCase())){
            job.status='unresolved';
            job.unresolvedAt=Number(job.unresolvedAt||Date.now());
          }

          entry.missingChecks=0;
          entry.retryAfter=Date.now()+5*60*1000;
          autoLogMsg(
            'warn',
            `SPRZEDAŻ: ${entry.name} chwilowo niewidoczny w plecaku/rupieciarni — nie usuwam go, ponowię synchronizację za 5 min.`
          );
        }else{
          blockers.push(`${entry.name}: synchronizacja przedmiotu`);
        }
        changedQueue=true;
        continue;
      }

      if(entry.missingChecks || entry.retryAfter){
        entry.missingChecks=0;
        entry.retryAfter=0;
        const job=profitJobs.find(j=>Number(j.queueId)===Number(entry.jobQueueId));
        if(job && String(job.status||'').toLowerCase()==='unresolved'){
          job.status='collected';
          job.unresolvedAt=null;
        }
        changedQueue=true;
      }

      const ob=await apiActive(`/api/bazaar/${settings.characterId}/queue/${Number(entry.itemId)}/0`);
      const plan=chooseSmartListingPrice(si,ob,entry.costBasis);

      if(plan.price<plan.breakEven || plan.expectedProfit<Number(autoCfg.minProfitPerCraft||0)){
        blockers.push(`${entry.name}: cena za niska`);
        continue;
      }

      if(autoCfg.dryRun){
        state.auto.stage='TEST: SPRZEDAŻ';
        state.auto.stageDetail=`Wystawiłbym ${entry.name} po ${money(plan.price)} • zysk ~${money(plan.expectedProfit)}`;
        autoLogMsg('info',`TEST: wystawiłbym ${entry.name} po ${money(plan.price)} • zysk ~${money(plan.expectedProfit)}.`);
        if(changedQueue) saveProfitPipeline();
        return true;
      }

      state.auto.stage='SPRZEDAŻ';
      state.auto.stageDetail=`Wystawiam ${entry.name} po ${money(plan.price)}`;

      const res=await apiActive(`/api/bazaar/${settings.characterId}/list`,{
        method:'POST',
        body:{
          inventoryId:Number(entry.inventoryId),
          quantity:1,
          pricePerUnit:Number(plan.price)
        }
      });

      const fee=Number(res?.listingFee ?? feeFor(plan.price));
      profitStats.listed=Number(profitStats.listed||0)+1;
      profitStats.listingFees=Number(profitStats.listingFees||0)+fee;
      sessionRecordListingFee(fee);

      const job=profitJobs.find(j=>Number(j.queueId)===Number(entry.jobQueueId));
      if(job){
        job.status='listed';
        job.listingId=res?.listingId??null;
        job.inventoryId=Number(entry.inventoryId);
        job.listPrice=plan.price;
        job.listingFee=fee;
        job.expectedProfitAtList=plan.expectedProfit;
        job.expectedProfit=plan.expectedProfit;
        job.listedAt=Date.now();
        job.missingActiveChecks=0;
      }

      saleQueue.splice(idx,1);
      autoLogMsg('info',`WYSTAWIONO: ${entry.name} po ${money(plan.price)} • opłata ${money(fee)} • zysk planowany ~${money(plan.expectedProfit)}.`);
      saveProfitPipeline();
      return true;
    }

    if(changedQueue) saveProfitPipeline();

    if(saleQueue.length){
      state.auto.stage='CZEKA: SPRZEDAŻ';
      state.auto.stageDetail=blockers.slice(0,3).join(' • ') || 'Brak produktu możliwego do wystawienia teraz';
    }

    return false;
  }

  async function sellOneBackpackProfitItemForSpace(){
    if(!autoCfg.autoSell || !saleQueue.length) return false;

    if(
      state.auto.activeListingCount >=
      Math.max(0,state.auto.maxListings-Number(autoCfg.reserveListingSlots||0))
    ){
      return false;
    }

    const sellable=await getSellable();
    const items=sellable?.items||[];

    for(let idx=0; idx<saleQueue.length; idx++){
      const entry=saleQueue[idx];

      if(activeSameItemCount(entry.itemId)>=Number(autoCfg.maxSameProductListings||2)){
        continue;
      }

      const si=findSellableItem(items,entry.inventoryId);
      if(!si) continue; // tylko rzeczy fizycznie w plecaku

      const ob=await apiActive(
        `/api/bazaar/${settings.characterId}/queue/${Number(entry.itemId)}/0`
      );
      const plan=chooseSmartListingPrice(si,ob,entry.costBasis);

      if(
        plan.price<plan.breakEven ||
        plan.expectedProfit<Number(autoCfg.minProfitPerCraft||0)
      ){
        continue;
      }

      state.auto.stage='ZWALNIAM PLECAK → SPRZEDAŻ';
      state.auto.stageDetail=
        `${entry.name}: wystawiam po ${money(plan.price)} żeby zwolnić slot`;

      const res=await apiActive(`/api/bazaar/${settings.characterId}/list`,{
        method:'POST',
        body:{
          inventoryId:Number(entry.inventoryId),
          quantity:1,
          pricePerUnit:Number(plan.price)
        }
      });

      const fee=Number(res?.listingFee ?? feeFor(plan.price));
      profitStats.listed=Number(profitStats.listed||0)+1;
      profitStats.listingFees=Number(profitStats.listingFees||0)+fee;
      sessionRecordListingFee(fee);

      const job=profitJobs.find(
        j=>Number(j.queueId)===Number(entry.jobQueueId)
      );
      if(job){
        job.status='listed';
        job.listingId=res?.listingId??null;
        job.inventoryId=Number(entry.inventoryId);
        job.listPrice=plan.price;
        job.listingFee=fee;
        job.expectedProfitAtList=plan.expectedProfit;
        job.expectedProfit=plan.expectedProfit;
        job.listedAt=Date.now();
        job.missingActiveChecks=0;
      }

      saleQueue.splice(idx,1);
      state.localAI.inventoryGuardian.lastAction=
        `Plecak pełny → wystawiono ${entry.name}`;

      localAiPushEvent('inventory_relief_sale',{
        inventoryId:Number(entry.inventoryId),
        itemId:Number(entry.itemId),
        name:String(entry.name||''),
        listPrice:Number(plan.price),
        expectedProfit:Number(plan.expectedProfit)
      });

      autoLogMsg(
        'info',
        `MIEJSCE: wystawiono ${entry.name} po ${money(plan.price)} ` +
        `• zysk ~${money(plan.expectedProfit)} • zwolniono slot plecaka.`
      );

      saveProfitPipeline();
      localAiSavePersistent();
      return true;
    }

    return false;
  }

  async function sellOneSafeBackpackItemForSpace({reason='awaryjne miejsce'}={}){
    if(!autoCfg.autoSell) return false;

    const [sellable,eq,myListings]=await Promise.all([
      getSellable(),
      apiActive(`/api/character/${settings.characterId}/equipment`),
      apiActive(`/api/bazaar/${settings.characterId}/my-listings?status=active`)
    ]);

    const activeCount=Number(myListings?.activeCount ?? (myListings?.listings||[]).length);
    const maxListings=Number(myListings?.maxListings ?? state.auto.maxListings ?? 10);
    state.auto.activeListings=Array.isArray(myListings?.listings)?myListings.listings:state.auto.activeListings;
    state.auto.activeListingCount=activeCount;
    state.auto.maxListings=maxListings;

    if(activeCount>=maxListings) return false;

    const equippedIds=new Set(
      (eq?.equipment||[]).map(x=>Number(x.inventory_id||0)).filter(Boolean)
    );
    const gardenSeedIds=new Set(
      (state.localAI?.garden?.data?.availableSeeds||[])
        .map(x=>Number(x.seedItemId||x.seed_item_id||0))
        .filter(Boolean)
    );
    const coinIds=new Set([277,278,279]);

    const candidates=(sellable?.items||[])
      .filter(si=>{
        const iid=Number(si.inventory_id||0);
        const itemId=Number(si.item_id||si.id||0);
        const qty=Number(si.quantity||1);
        if(!iid || !itemId || qty!==1) return false; // listing 1 szt. ma naprawdę zwolnić slot
        if(equippedIds.has(iid)) return false;
        if(localAiIsProfitProductProtected(iid)) return false;
        if(isCraftIngredientProtected(itemId)) return false;
        if(isCollectionItemProtected(itemId)) return false;
        if(coinIds.has(itemId)) return false;
        if(gardenSeedIds.has(itemId)) return false;
        return true;
      })
      .map(si=>{
        const itemId=Number(si.item_id||si.id||0);
        const mv=inventoryItemMarketValue(itemId,Number(si.enhancement_level||0));
        const fallback=Number(si.sell_price_paser||si.min||si.min_listing_price||0);
        const value=(mv.value!=null && Number.isFinite(Number(mv.value)) && Number(mv.value)>0)
          ? Number(mv.value)
          : (fallback>0?fallback:Number.POSITIVE_INFINITY);
        return {si,itemId,value,name:String(si.name||si.item_name||`ID ${itemId}`)};
      })
      .filter(x=>Number.isFinite(x.value))
      .sort((a,b)=>a.value-b.value || Number(a.si.inventory_id)-Number(b.si.inventory_id));

    for(const c of candidates.slice(0,8)){
      const before=await localAiFreshInventory();
      const beforeSlots=Number(before.slotsUsed||0);
      const still=(before.inventory||[]).some(x=>Number(x.inventory_id)===Number(c.si.inventory_id));
      if(!still) continue;

      const ob=await apiActive(
        `/api/bazaar/${settings.characterId}/queue/${Number(c.itemId)}/${Number(c.si.enhancement_level||0)}`
      );
      const plan=chooseSmartListingPrice(c.si,ob,0);

      state.auto.stage='ZWALNIAM PLECAK → BEZPIECZNA SPRZEDAŻ';
      state.auto.stageDetail=`${c.name}: wystawiam po ${money(plan.price)} • ${reason}`;

      const res=await apiActive(`/api/bazaar/${settings.characterId}/list`,{
        method:'POST',
        body:{
          inventoryId:Number(c.si.inventory_id),
          quantity:1,
          pricePerUnit:Number(plan.price)
        }
      });

      if(res?.success===false) continue;

      const fee=Number(res?.listingFee ?? feeFor(plan.price));
      profitStats.listed=Number(profitStats.listed||0)+1;
      profitStats.listingFees=Number(profitStats.listingFees||0)+fee;
      sessionRecordListingFee(fee);

      await sleep(220);
      const after=await localAiFreshInventory();
      const freed=Number(after.slotsUsed||0)<beforeSlots;

      if(freed){
        state.localAI.inventoryGuardian.lastAction=
          `Melina pełna → bezpiecznie wystawiono ${c.name}`;
        localAiPushEvent('inventory_relief_safe_sale',{
          reason,
          inventoryId:Number(c.si.inventory_id),
          itemId:Number(c.itemId),
          name:c.name,
          estimatedValue:Number(c.value),
          listPrice:Number(plan.price),
          listingFee:fee,
          beforeSlots,
          afterSlots:Number(after.slotsUsed||0)
        });
        autoLogMsg(
          'info',
          `MIEJSCE AWARYJNE: ${c.name} wystawiono po ${money(plan.price)} • ` +
          `plecak ${beforeSlots}→${Number(after.slotsUsed||0)}.`
        );
        saveProfitPipeline();
        localAiSavePersistent();
        return true;
      }
    }

    return false;
  }

  function listingIdOf(x){
    return Number(x?.id ?? x?.listing_id ?? x?.listingId ?? 0);
  }

  function inventoryIdOf(x){
    return Number(x?.inventory_id ?? x?.inventoryId ?? 0);
  }

  function findActiveListingForJob(job,listings,used){
    const candidates=listings||[];

    // 1) Najpewniejsze: listingId zapisany po POST /list.
    const wantedListing=Number(job?.listingId||0);
    if(wantedListing){
      const idx=candidates.findIndex((x,i)=>!used.has(i) && listingIdOf(x)===wantedListing);
      if(idx>=0) return idx;
    }

    // 2) Starsze joby: inventoryId.
    const wantedInv=Number(job?.inventoryId||0);
    if(wantedInv){
      const idx=candidates.findIndex((x,i)=>
        !used.has(i) &&
        Number(x.item_id)===Number(job.itemId) &&
        inventoryIdOf(x)===wantedInv
      );
      if(idx>=0) return idx;
    }

    // 3) Ostateczny fallback: produkt + cena. Każdą ofertę zużywamy tylko raz,
    // więc jedna oferta nie może już "utrzymywać przy życiu" kilku jobów.
    const wantedPrice=Number(job?.listPrice||0);
    return candidates.findIndex((x,i)=>
      !used.has(i) &&
      Number(x.item_id)===Number(job.itemId) &&
      (!wantedPrice || Number(x.price_per_unit ?? x.price ?? 0)===wantedPrice)
    );
  }

  async function auditListedProfitJobs(){
    const listed=profitJobs.filter(j=>
      String(j.status||'').toLowerCase()==='listed' && j.listedAt
    );
    if(!listed.length) return false;

    const active=(state.auto.activeListings||[]).filter(x=>x.status==='active');
    const used=new Set();
    const missing=[];

    for(const job of listed){
      const idx=findActiveListingForJob(job,active,used);
      if(idx>=0){
        used.add(idx);
        job.missingActiveChecks=0;
        continue;
      }

      job.missingActiveChecks=Number(job.missingActiveChecks||0)+1;
      if(job.missingActiveChecks>=Math.max(1,Number(autoCfg.learningAuditMissingChecks||2))){
        missing.push(job);
      }
    }

    if(!missing.length){
      saveProfitPipeline();
      return false;
    }

    // Brak oferty nie oznacza automatycznie sprzedaży. Najpierw sprawdzamy
    // plecak oraz rupieciarnię, bo zwrócony towar mógł zostać tam przeniesiony.
    let sellableItems=[];
    try{
      const sellable=await getSellable();
      sellableItems=sellable?.items||[];
    }catch{}

    let melinaItems=[];
    if(autoCfg.localAiMelinaFirst){
      try{
        const melina=await localAiFreshMelina();
        melinaItems=melina?.storageItems||[];
      }catch{}
    }

    let changed=false;

    for(const job of missing){
      const invId=Number(job.inventoryId||0);
      const inBackpack=invId>0 && sellableItems.some(
        x=>Number(x.inventory_id)===invId
      );
      const inMelina=invId>0 && melinaItems.some(
        x=>Number(x.inventory_id)===invId
      );

      if(inBackpack || inMelina){
        // Oferta wróciła. Nie kończymy joba — wraca do kolejki sprzedaży.
        if(autoCfg.selfLearningEnabled){
          learnSaleOutcome(job,'returned');
        }

        job.status='collected';
        job.returnedAt=Date.now();
        job.listingId=null;
        job.listedAt=null;
        job.missingActiveChecks=0;

        if(!saleQueue.some(x=>Number(x.jobQueueId||0)===Number(job.queueId||0))){
          saleQueue.push({
            inventoryId:invId,
            itemId:Number(job.itemId),
            quantity:1,
            name:job.name,
            costBasis:Number(job.costBasis||0),
            recipeId:Number(job.recipeId||0),
            jobQueueId:Number(job.queueId||0),
            startedAt:Number(job.startedAt||Date.now()),
            predictedProfitAtStart:Number(job.predictedProfitAtStart||job.expectedProfit||0),
            createdAt:Date.now(),
            returnedFromBazaar:true
          });
        }

        autoLogMsg(
          'warn',
          `SPRZEDAŻ: ${job.name} wrócił z bazaru${inMelina?' do rupieciarni':''} — ponownie trafi do kolejki sprzedaży.`
        );
      }else{
        // Dopiero brak oferty + brak fizycznego przedmiotu uznajemy za sprzedaż.
        job.status='sold';
        job.soldDetectedAt=Date.now();
        job.missingActiveChecks=0;

        const sessionOutcome=sessionRecordSale(job);
        const outcome=autoCfg.selfLearningEnabled
          ? learnSaleOutcome(job,'sold')
          : sessionOutcome;

        autoLogMsg(
          'info',
          autoCfg.selfLearningEnabled
            ? `SPRZEDAŻ: ${job.name} potwierdzony jako sprzedany • realny zysk ${money(outcome?.profit)} • ${money(outcome?.realizedPH)}/h.`
            : `SPRZEDAŻ: ${job.name} potwierdzony jako sprzedany.`
        );
      }

      changed=true;
    }

    if(changed){
      saveProfitPipeline();
      if(autoCfg.selfLearningEnabled) learnerSave();
      computeRankings();
    }

    return changed;
  }

  function recipePurchaseStall(recipeId){
    const id=Number(recipeId||0);
    if(!id) return null;
    const row=state.auto.purchaseStalls?.[id]||null;
    if(!row) return null;

    if(Number(row.blockedUntil||0)>0 && Date.now()>=Number(row.blockedUntil||0)){
      delete state.auto.purchaseStalls[id];
      return null;
    }
    return row;
  }

  function clearRecipePurchaseStall(recipeId){
    const id=Number(recipeId||0);
    if(!id) return;
    if(state.auto.purchaseStalls?.[id]) delete state.auto.purchaseStalls[id];
  }

  function registerRecipePurchaseStall(target,reason){
    const id=Number(target?.recipe?.id||0);
    if(!id) return {blocked:false,count:0};

    if(!state.auto.purchaseStalls) state.auto.purchaseStalls={};

    const msg=String(reason||'').slice(0,250);
    const old=state.auto.purchaseStalls[id]||{};
    const same=String(old.reason||'')===msg;
    const count=same ? Number(old.count||0)+1 : 1;
    const limit=Math.max(2,Number(autoCfg.purchaseStallLimit||3));

    const row={
      count,
      reason:msg,
      lastAt:Date.now(),
      blockedUntil:0
    };

    if(count>=limit){
      const mins=Math.max(1,Number(autoCfg.purchaseStallMinutes||10));
      row.blockedUntil=Date.now()+mins*60*1000;
      state.auto.lockedRecipeId=null;

      autoLogMsg(
        'warn',
        `ANTI-STALL: ${target.recipe.item_name} zablokowany na ${mins} min po ${count}× tym samym problemie zakupu: ${msg}.`
      );
    }

    state.auto.purchaseStalls[id]=row;
    return {blocked:row.blockedUntil>Date.now(),count,row};
  }

  function profitAwarePurchaseDecision(target,livePrice,plannedPrice,cycleSpent){
    const live=Number(livePrice||0);
    const planned=Math.max(0,Number(plannedPrice||live));
    const baseLimit=Math.max(0,Number(autoCfg.maxSpendPerCycle||0));
    const remaining=Math.max(0,baseLimit-Number(cycleSpent||0));

    if(live<=remaining){
      return {
        ok:true,
        override:false,
        projectedProfit:Number(target?.profit??0),
        projectedProfitHour:Number(target?.profitHour??0),
        reason:'bazowy limit cyklu'
      };
    }

    if(!autoCfg.profitAwareCycleOverride){
      return {ok:false,override:false,reason:'limit wydatku na cykl'};
    }

    const maxSingle=Math.max(baseLimit,Number(autoCfg.profitAwareMaxSingleBuy||15000));
    if(live>maxSingle){
      return {
        ok:false,
        override:false,
        reason:`zakup ${money(live)} > maks. profit-aware ${money(maxSingle)}`
      };
    }

    if(!target?.recipe || target?.outPrice==null || target?.profit==null || target?.profitHour==null){
      return {ok:false,override:false,reason:'brak pełnej kalkulacji zysku do przekroczenia limitu'};
    }

    // Ranking już zawiera cenę planowaną składnika. Gdy live jest wyższe,
    // konserwatywnie odejmujemy różnicę od zysku i proporcjonalnie od zysku/h.
    const delta=Math.max(0,live-planned);
    const baseProfit=Number(target.profit||0);
    const projectedProfit=baseProfit-delta;
    const basePH=Number(target.profitHour||0);
    const projectedProfitHour=baseProfit>0
      ? basePH*(projectedProfit/baseProfit)
      : -Infinity;

    if(projectedProfit<Number(autoCfg.minProfitPerCraft||0)){
      return {
        ok:false,
        override:false,
        reason:`po zakupie zysk ${money(projectedProfit)} < minimum ${money(autoCfg.minProfitPerCraft)}`
      };
    }

    if(projectedProfitHour<Number(autoCfg.minProfitPerHour||0)){
      return {
        ok:false,
        override:false,
        reason:`po zakupie zysk/h ${money(projectedProfitHour)} < minimum ${money(autoCfg.minProfitPerHour)}`
      };
    }

    return {
      ok:true,
      override:true,
      projectedProfit,
      projectedProfitHour,
      reason:`PROFIT OVERRIDE: ${money(live)} > bazowy limit ${money(baseLimit)}, ale craft nadal daje ~${money(projectedProfit)} i ~${money(projectedProfitHour)}/h`
    };
  }

  async function buyExtraIngredientOne(target,extra,cycleSpent){
    resetAutoSpendIfNeeded();

    if(autoCfg.localAiMelinaFirst && autoCfg.localAiMelinaReturnForCraft){
      try{
        const storage=await localAiFreshMelina();
        const stored=(storage.storageItems||[]).find(
          x=>Number(x.id||x.item_id||0)===Number(extra.id)
        );

        if(stored){
          state.auto.stage='RUPIECIARNIA → CRAFT';
          state.auto.stageDetail=`Wyjmuję ${extra.name} zamiast kupować`;

          const take=await localAiReplayMelinaRemove(Number(stored.inventory_id));
          if(take.ok){
            state.auto.lockedRecipeId=Number(target.recipe.id);
            clearRecipePurchaseStall(target.recipe.id);
            autoLogMsg('info',`SKŁADNIK Z RUPIECIARNI: ${extra.name} — bez zakupu.`);
            return {ok:true,spent:0,fromMelina:true};
          }
        }
      }catch(e){
        autoLogMsg('warn',`RUPIECIARNIA → CRAFT: ${String(e?.message||e)}`);
      }
    }

    const rem=purchaseRemaining();
    if(rem!=null && rem<=0) return {ok:false,reason:'limit zakupów wyczerpany'};

    const ob=await apiActive(`/api/bazaar/${settings.characterId}/queue/${Number(extra.id)}/${Number(extra.minEnhancement||0)}`);
    const listings=(ob?.listings||[]).slice().sort((a,b)=>Number(a.price_per_unit)-Number(b.price_per_unit));
    const first=listings[0];
    if(!first) return {ok:false,reason:`brak ofert: ${extra.name}`};

    const live=Number(first.price_per_unit);
    const planned=Number(extra.unit||live);
    const maxDrift=1+Number(autoCfg.maxInputPriceDriftPct||0)/100;
    if(planned>0 && live>planned*maxDrift){
      return {ok:false,reason:`${extra.name}: cena wzrosła z ${money(planned)} do ${money(live)}`};
    }

    const spendGate=profitAwarePurchaseDecision(target,live,planned,cycleSpent);
    if(!spendGate.ok) return {ok:false,reason:spendGate.reason};
    if(Number(autoSpend.amount||0)+live>Number(autoCfg.maxSpendPerDay||0)) return {ok:false,reason:'limit wydatku dziennego'};

    if(spendGate.override){
      state.auto.stage='ZAKUP SKŁADNIKA • PROFIT OVERRIDE';
      state.auto.stageDetail=`${extra.name}: ${money(live)} • ${spendGate.reason}`;
      autoLogMsg('info',spendGate.reason);
    }

    if(autoCfg.dryRun){
      state.auto.stage='TEST: ZAKUP SKŁADNIKA';
      state.auto.stageDetail=`Kupiłbym ${extra.name} za ${money(live)}`;
      autoLogMsg('info',`TEST: kupiłbym składnik ${extra.name} za ${money(live)}.`);
      return {ok:false,dry:true,reason:'dry-run'};
    }

    const buy=await apiActive(`/api/bazaar/${settings.characterId}/buy`,{
      method:'POST',
      body:{itemId:Number(extra.id),enhancementLevel:Number(extra.minEnhancement||0),quantity:1}
    });

    const paid=Number(buy?.totalCost??live);
    autoSpend.amount=Number(autoSpend.amount||0)+paid;
    autoSpend.purchases=Number(autoSpend.purchases||0)+1;
    saveJSON(K.autoSpend,autoSpend);
    sessionRecordPurchase(paid);
    if(buy?.purchaseLimit) state.purchaseLimit=buy.purchaseLimit;

    state.auto.lockedRecipeId=Number(target.recipe.id);
    clearRecipePurchaseStall(target.recipe.id);
    autoLogMsg('info',`KUPIONO SKŁADNIK: ${extra.name} za ${money(paid)}.`);
    return {ok:true,spent:paid,profitOverride:!!spendGate.override};
  }

  async function buyResourceSourceOne(target,need,cycleSpent){
    resetAutoSpendIfNeeded();

    if(dismantleFreeSlots()<=0) return {ok:false,reason:'kolejka demontażu pełna'};
    const rem=purchaseRemaining();
    if(rem!=null && rem<=0) return {ok:false,reason:'limit zakupów wyczerpany'};

    const candidates=(state.resourceOptions[need.key]||[]);
    const source=candidates[0]||null;
    if(!source) return {ok:false,reason:`brak źródła: ${RESOURCE_LABELS_V4[need.key]||need.key}`};

    const ob=await apiActive(`/api/bazaar/${settings.characterId}/queue/${Number(source.itemId)}/0`);
    const listings=(ob?.listings||[]).slice().sort((a,b)=>Number(a.price_per_unit)-Number(b.price_per_unit));
    const first=listings[0];
    if(!first) return {ok:false,reason:`brak ofert: ${source.name}`};

    const live=Number(first.price_per_unit);
    const planned=Number(source.price||live);
    const maxDrift=1+Number(autoCfg.maxInputPriceDriftPct||0)/100;
    if(planned>0 && live>planned*maxDrift){
      return {ok:false,reason:`${source.name}: cena wzrosła z ${money(planned)} do ${money(live)}`};
    }

    if(need.key==='odpady' && Number(autoCfg.maxCostPerOdpady||0)>0){
      const liveCostPer=live/Math.max(1,Number(source.yield||1));
      if(liveCostPer>Number(autoCfg.maxCostPerOdpady)){
        return {ok:false,reason:`odpad kosztuje ${money(liveCostPer)} > limit ${money(autoCfg.maxCostPerOdpady)}`};
      }
    }

    const spendGate=profitAwarePurchaseDecision(target,live,planned,cycleSpent);
    if(!spendGate.ok) return {ok:false,reason:spendGate.reason};
    if(Number(autoSpend.amount||0)+live>Number(autoCfg.maxSpendPerDay||0)) return {ok:false,reason:'limit wydatku dziennego'};

    if(spendGate.override){
      state.auto.stage='SUROWIEC • PROFIT OVERRIDE';
      state.auto.stageDetail=`${source.name}: ${money(live)} • ${spendGate.reason}`;
      autoLogMsg('info',spendGate.reason);
    }

    if(autoCfg.dryRun){
      autoLogMsg('info',`DRY: kupiłbym ${source.name} za ${money(live)} → ${source.yield} ${RESOURCE_LABELS_V4[need.key]||need.key}.`);
      return {ok:false,dry:true,reason:'dry-run'};
    }

    const before=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
    const beforeMap=snapshotDismantlable(before?.items,source.itemId);

    const buy=await apiActive(`/api/bazaar/${settings.characterId}/buy`,{
      method:'POST',
      body:{itemId:Number(source.itemId),enhancementLevel:0,quantity:1}
    });
    const paid=Number(buy?.totalCost??live);
    autoSpend.amount=Number(autoSpend.amount||0)+paid;
    autoSpend.purchases=Number(autoSpend.purchases||0)+1;
    saveJSON(K.autoSpend,autoSpend);
    sessionRecordPurchase(paid);
    if(buy?.purchaseLimit) state.purchaseLimit=buy.purchaseLimit;

    await sleep(Math.min(1200,Number(autoCfg.actionDelayMs||900)));
    const after=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
    const inv=findPurchasedInventory(beforeMap,after?.items,source.itemId);
    if(!inv) throw new Error(`Kupiono ${source.name}, ale nie znaleziono sztuki do demontażu.`);

    const q=await apiActive(`/api/workshop/${settings.characterId}/queue/add`,{
      method:'POST',
      body:{inventoryId:Number(inv.inventory_id)}
    });
    parseQueue(q);

    clearRecipePurchaseStall(target.recipe.id);
    autoLogMsg('info',`SUROWIEC: ${source.name} za ${money(paid)} → demontaż (${dismantleYieldText(staticDismantleById(source.itemId))}).`);
    return {ok:true,spent:paid,source,profitOverride:!!spendGate.override};
  }



  async function queueOwnedInventoryOne(candidate){
    if(!candidate) return {ok:false,reason:'brak kandydata z ekwipunku'};
    if(dismantleFreeSlots()<=0) return {ok:false,reason:'kolejka demontażu pełna'};

    // Jeszcze raz pobieramy aktualny ekwipunek i sprawdzamy politykę,
    // żeby nie działać na starych danych.
    const invData=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
    state.manual.dismantlableItems=Array.isArray(invData?.items)?invData.items:[];

    const current=(state.manual.dismantlableItems||[]).find(x=>
      Number(x.inventory_id)===Number(candidate.inventoryId)
    );

    if(!current) return {ok:false,reason:`${candidate.name}: przedmiot nie jest już dostępny`};

    const policy=inventoryDismantlePolicy(current);
    if(!policy.allowed) return {ok:false,reason:`${candidate.name}: ${policy.reason}`};

    if(autoCfg.dryRun){
      state.auto.stage='TEST: EKWIPUNEK → DEMONTAŻ';
      state.auto.stageDetail=`Użyłbym ${candidate.name} z ekwipunku (wartość ${money(policy.value)})`;
      autoLogMsg('info',`TEST: zdemontowałbym własny ${candidate.name} • wartość ${money(policy.value)} • ${dismantleYieldText(policy.meta)}.`);
      return {ok:false,dry:true,reason:'dry-run'};
    }

    const q=await apiActive(`/api/workshop/${settings.characterId}/queue/add`,{
      method:'POST',
      body:{inventoryId:Number(current.inventory_id)}
    });
    parseQueue(q);

    autoLogMsg(
      'info',
      `EKWIPUNEK: ${candidate.name} (wartość ${money(policy.value)}) → demontaż ${fmt((Number(policy.meta?.baseTime||0)/Math.max(0.0001,Number(state.dismantleSpeed||1)))/60,1)} min • ${dismantleYieldText(policy.meta)}.`
    );

    return {ok:true};
  }

  async function buyBundleItemOne(target,planItem,cycleSpent){
    resetAutoSpendIfNeeded();

    if(!planItem) return {ok:false,reason:'brak pozycji w planie'};
    if(isCraftIngredientProtected(planItem.itemId)){
      return {ok:false,reason:craftIngredientProtectionText(planItem.itemId)};
    }
    if(dismantleFreeSlots()<=0) return {ok:false,reason:'kolejka demontażu pełna'};

    const rem=purchaseRemaining();
    if(rem!=null && rem<=0) return {ok:false,reason:'limit zakupów wyczerpany'};

    const ob=await apiActive(`/api/bazaar/${settings.characterId}/queue/${Number(planItem.itemId)}/0`);
    const listings=(ob?.listings||[]).slice().sort((a,b)=>Number(a.price_per_unit)-Number(b.price_per_unit));
    const first=listings[0];

    if(!first) return {ok:false,reason:`brak ofert: ${planItem.name}`};

    const live=Number(first.price_per_unit);
    const planned=Number(planItem.unitPrice||planItem.price||live);
    const maxDrift=1+Number(autoCfg.maxInputPriceDriftPct||0)/100;

    if(planned>0 && live>planned*maxDrift){
      return {ok:false,reason:`${planItem.name}: cena wzrosła z ${money(planned)} do ${money(live)}`};
    }

    const y=planItem.yields||{};
    if(Number(y.odpady||0)>0 && Number(autoCfg.maxCostPerOdpady||0)>0){
      const cpo=live/Math.max(1,Number(y.odpady||0));

      if(cpo>Number(autoCfg.maxCostPerOdpady)){
        return {ok:false,reason:`${planItem.name}: ${money(cpo)}/odpad > limit ${money(autoCfg.maxCostPerOdpady)}`};
      }
    }

    const spendGate=profitAwarePurchaseDecision(target,live,planned,cycleSpent);
    if(!spendGate.ok){
      return {ok:false,reason:spendGate.reason};
    }

    if(Number(autoSpend.amount||0)+live>Number(autoCfg.maxSpendPerDay||0)){
      return {ok:false,reason:'limit wydatku dziennego'};
    }

    if(spendGate.override){
      state.auto.stage='GLOBAL: ZAKUP → DEMONTAŻ • PROFIT OVERRIDE';
      state.auto.stageDetail=`${planItem.name}: ${money(live)} • ${spendGate.reason}`;
      autoLogMsg('info',spendGate.reason);
    }

    if(autoCfg.dryRun){
      state.auto.stage='TEST: ZAKUP → DEMONTAŻ';
      state.auto.stageDetail=`Kupiłbym ${planItem.name} za ${money(live)} i dodał do demontażu`;
      autoLogMsg('info',`TEST: kupiłbym ${planItem.name} za ${money(live)} → ${dismantleYieldText(staticDismantleById(planItem.itemId))}.`);
      return {ok:false,dry:true,reason:'dry-run'};
    }

    const before=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
    const beforeMap=snapshotDismantlable(before?.items,planItem.itemId);

    const buy=await apiActive(`/api/bazaar/${settings.characterId}/buy`,{
      method:'POST',
      body:{itemId:Number(planItem.itemId),enhancementLevel:0,quantity:1}
    });

    const paid=Number(buy?.totalCost??live);
    autoSpend.amount=Number(autoSpend.amount||0)+paid;
    autoSpend.purchases=Number(autoSpend.purchases||0)+1;
    saveJSON(K.autoSpend,autoSpend);
    sessionRecordPurchase(paid);

    if(buy?.purchaseLimit) state.purchaseLimit=buy.purchaseLimit;

    await sleep(Math.min(1200,Number(autoCfg.actionDelayMs||900)));

    const after=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
    const inv=findPurchasedInventory(beforeMap,after?.items,planItem.itemId);

    if(!inv){
      throw new Error(`Kupiono ${planItem.name}, ale nie znaleziono sztuki do demontażu.`);
    }

    const q=await apiActive(`/api/workshop/${settings.characterId}/queue/add`,{
      method:'POST',
      body:{inventoryId:Number(inv.inventory_id)}
    });

    parseQueue(q);

    const _meta=staticDismantleById(planItem.itemId);


    const _mins=Number(_meta?.baseTime||0)/Math.max(0.0001,Number(state.dismantleSpeed||1))/60;


    clearRecipePurchaseStall(target.recipe.id);
    autoLogMsg('info',`GLOBAL: ${planItem.name} za ${money(paid)} → demontaż ${fmt(_mins,1)} min (${dismantleYieldText(_meta)}).`);
    return {ok:true,spent:paid,profitOverride:!!spendGate.override};
  }

  async function startProfitCraft(target){
    if(!target?.recipe) return false;

    // Ostatnia kontrola tuż przed POST-em. Chroni przed wyścigiem pomiędzy
    // analizą a startem craftu, ale korzysta już z poprawionej fizycznej ekspozycji.
    const expNow=productExposure(target.recipe.result_item_id);
    const expLimit=Math.max(1,Number(autoCfg.maxSameProductExposure||2));
    if(expNow>=expLimit){
      state.auto.stage='CZEKA: EKSPOZYCJA';
      state.auto.stageDetail=`${target.recipe.item_name}: ${expNow}/${expLimit} szt.`;
      return false;
    }

    if(craftFreeSlots()<=0){
      // Gdy crafting jest pełny, wolny demontaż może pracować nad magazynem.
      if(await strategicStockCycle({tier:'critical'})) return false;
      if(await strategicStockCycle({tier:'minimum'})) return false;
      if(await strategicStockCycle({tier:'target'})) return false;

      state.auto.stage='CZEKA: PRODUKCJA';
      state.auto.stageDetail='Kolejka craftingu pełna';
      return false;
    }

    if(autoCfg.dryRun){
      state.auto.stage='TEST: PRODUKCJA';
      state.auto.stageDetail=`Uruchomiłbym ${target.recipe.item_name}`;
      autoLogMsg('info',`TEST: uruchomiłbym ${target.recipe.item_name} • koszt ekonomiczny ~${money(target.fullCost)} • zysk ${target.economicIncomplete?'≤ ': '~'}${money(target.profit)}.`);
      return false;
    }

    const beforeIds=new Set((state.craftQueue||[]).map(x=>Number(x.id)));
    const res=await apiActive(`/api/workshop/${settings.characterId}/crafting/start`,{
      method:'POST',
      body:{recipe_id:Number(target.recipe.id)}
    });
    if(res?.recipes) parseRecipes(res);

    if(!(state.craftQueue||[]).some(x=>!beforeIds.has(Number(x.id)))){
      const refreshed=await apiActive(`/api/workshop/${settings.characterId}/crafting-recipes`);
      parseRecipes(refreshed);
    }

    const created=(state.craftQueue||[])
      .filter(x=>Number(x.recipe_id)===Number(target.recipe.id) && !beforeIds.has(Number(x.id)))
      .sort((a,b)=>Number(b.id)-Number(a.id))[0]
      || (state.craftQueue||[]).filter(x=>Number(x.recipe_id)===Number(target.recipe.id)).sort((a,b)=>Number(b.id)-Number(a.id))[0];

    if(!created) throw new Error(`Craft ${target.recipe.item_name} wystartował, ale nie odczytałem ID kolejki.`);

    profitJobs.push({
      queueId:Number(created.id),
      recipeId:Number(target.recipe.id),
      itemId:Number(target.recipe.result_item_id),
      name:target.recipe.item_name,
      status:'crafting',
      costBasis:Number(target.fullCost||0),
      expectedMarketPrice:Number(target.outPrice||0),
      expectedProfit:Number(target.profit||0),
      expectedProfitHour:Number(target.profitHour||0),
      predictedProfitAtStart:Number(target.profit||0),
      predictedProfitHourAtStart:Number(target.profitHour||0),
      predictedMarketAtStart:Number(target.outPrice||0),
      learningFactorAtStart:Number(target.learningFactor||1),
      learningConfidenceAtStart:Number(target.learningConfidence||0),
      startedAt:Date.now()
    });

    const learnedJob=profitJobs[profitJobs.length-1];
    learnCraftStart(learnedJob);

    profitStats.crafted=Number(profitStats.crafted||0)+1;
    saveProfitPipeline();

    state.auto.lockedRecipeId=null;
    autoLogMsg('info',`CRAFT START: ${target.recipe.item_name} • koszt ekonomiczny ~${money(target.fullCost)} • zysk planowany ~${money(target.profit)}.`);
    return true;
  }

  async function autonomousProfitCycle(force=false){
    if(!autoCfg.enabled && !force) return;
    if(state.auto.inCycle) return;

    state.auto.inCycle=true;
    state.auto.error=null;
    state.auto.lastCycleAt=Date.now();
    let cycleSpent=0;

    try{
      resetAutoSpendIfNeeded();
      sanitizeRankings();
      state.auto.stage='ANALIZA';
      state.auto.stageDetail='Odświeżam rynek, kolejki i aktywne oferty';
      await refreshProfitMarketState();
      state.auto.connection='OK';

      // v8.7.6: aktywny listing jest fizyczną prawdą ważniejszą niż stary saleQueue/status collected.
      syncProfitSaleQueueWithActiveListings();

      // v8.7.2: zanim policzymy ekspozycję i wybierzemy nową recepturę,
      // uzgadniamy stare joby z rzeczywistym towarem. Dzięki temu historyczny
      // unresolved nie może blokować nowego craftu przez wiele dni.
      await reconcileProfitPipelineTruth();

      // Uczymy się tylko na rozstrzygniętych wynikach: aktywna oferta / powrót
      // do ekwipunku / brak oferty i brak przedmiotu (najpewniej sprzedaż).
      await auditListedProfitJobs();

      if(Date.now()<Number(state.auto.writeHoldUntil||0)){
        const left=Math.ceil((Number(state.auto.writeHoldUntil)-Date.now())/1000);
        state.auto.stage='RECOVERY: WERYFIKACJA';
        state.auto.stageDetail=`Po niepewnym POST-cie wykonuję tylko synchronizację • zapisy odblokują się za ${left} s`;
        return;
      }

      // 1. Najpierw obsłuż gotową produkcję Pomagiera.
      // Funkcja sama pilnuje miejsca w EQ i może najpierw wystawić
      // już odebrany produkt, jeśli potrzebuje zwolnić slot.
      if(await collectOneFinishedProfitJob()) return;

      // 2. Potem sprzedaj gotowy produkt, jeśli cena nadal daje wymagany zysk.
      // v8.7.6: po migracji do 2 ofert tego samego produktu nowy Dywan/Mocarz nie czeka już,
      // tylko może zostać wystawiony jako druga sztuka (o ile łączna ekspozycja nadal <= 2).
      if(await sellOneProfitItem()) return;

      // 2b. Jeśli nie ma nic do wystawienia, popraw jedną starą mocno zawyżoną ofertę.
      // Nie dotykamy ręcznych ofert użytkownika i nigdy nie schodzimy poniżej min. zysku.
      if(await repriceOneOverpricedProfitListing()) return;

      // 3. Pełny bazar blokuje tylko WYSTAWIANIE, a nie całą produkcję.
      // Ekspozycja produktu + limit aktywnych craftów pilnują, żeby backlog nie rósł bez końca.
      const bazaarTight=!!(
        autoCfg.autoSell &&
        state.auto.activeListingCount>=Math.max(0,state.auto.maxListings-Number(autoCfg.reserveListingSlots||0))
      );

      // 4. Wybierz najbardziej dochodową recepturę po PEŁNYM koszcie odtworzenia materiałów.
      const target=pickAutonomousTarget();
      state.auto.target=target;
      state.auto.source=null;

      if(!target){
        // Brak dobrego craftu = wykorzystaj wolny czas na strategiczny magazyn.
        if(await strategicStockCycle({tier:'critical'})) return;
        if(await strategicStockCycle({tier:'minimum'})) return;
        if(await strategicStockCycle({tier:'target'})) return;

        const blockers=autonomousBlockerSummary(3);
        const _srvCraft=serverCraftState();
        const activeCrafting=_srvCraft.fresh
          ? _srvCraft.active
          : (profitJobs||[]).filter(j=>String(j.status||'').toLowerCase()==='crafting').length;
        const readyCollected=_srvCraft.fresh
          ? _srvCraft.readyCount
          : (state.craftReady||[]).length;
        if(activeCrafting>0 || readyCollected>0){
          state.auto.stage='PRODUKCJA TRWA';
          const tail=blockers.length ? blockers.join(' • ') : 'brak kolejnej receptury spełniającej limity';
          state.auto.stageDetail=`${activeCrafting} w produkcji${readyCollected?` • ${readyCollected} gotowe`:''} • teraz nie dokładam kolejnej: ${tail}`;
        }else{
          state.auto.stage=bazaarTight?'CZEKA: BAZAR / ZYSK':'CZEKA: ZYSK';
          state.auto.stageDetail=blockers.length
            ? blockers.join(' • ')
            : 'Brak receptury spełniającej minimalny zysk i brak sensownego uzupełnienia magazynu';
        }
        const key=`v4-no-target:${state.auto.stageDetail}`;
        if(state.auto.lastPlanKey!==key){
          autoLogMsg('info','ZYSK: brak receptury spełniającej limity; magazyn również bez pilnej akcji.');
          state.auto.lastPlanKey=key;
        }
        return;
      }

      const needs=buildAutonomousNeeds(target);
      const planKey=`v4:${target.recipe.id}:${target.outPrice}:${Math.round(target.fullCost)}:${Math.round(target.profit)}`;
      if(state.auto.lastPlanKey!==planKey){
        autoLogMsg('info',`CEL GLOBAL: ${target.recipe.item_name} • rynek ${money(target.outPrice)} • plan: ${bundleText(target.fullBundle)} • koszt ~${money(target.fullCost)}${target.valuationApprox?' + posiadany składnik bez ceny':''} • zysk ~${money(target.profit)} (${money(target.profitHour)}/h pełnego cyklu).`);
        state.auto.lastPlanKey=planKey;
      }

      // 5. Jeżeli wszystko fizycznie dostępne — start produkcji.
      if(needs.allPhysicalReady){
        state.auto.stage=autoCfg.dryRun?'TEST: PRODUKCJA':'PRODUKCJA';
        state.auto.stageDetail=autoCfg.dryRun?`Uruchomiłbym ${target.recipe.item_name}`:`Start ${target.recipe.item_name}`;
        if(autoCfg.autoCraft) await startProfitCraft(target);
        else autoLogMsg('info',`Gotowe do craftu: ${target.recipe.item_name}; AutoCraft wyłączony.`);
        return;
      }

      // 6. Jeśli brakujące surowce już są w demontażu, po prostu czekamy.
      const missingResources=needs.resources.filter(x=>x.missFuture>0);
      const physicalMissingButPending=needs.resources.some(x=>x.missPhysical>0 && x.missFuture<=0);

      // 7. Najpierw sprawdzamy WŁASNY EKWIPUNEK.
      //    Używamy wyłącznie przedmiotów:
      //    - z pewną wyceną <= ustawionego limitu (domyślnie 3000 zł),
      //    - NIE będących składnikiem żadnej receptury,
      //    - ekonomicznie sensownych względem kosztu zakupu brakujących surowców.
      if(missingResources.length && autoCfg.autoUseInventoryDismantle && autoCfg.autoDismantle){
        if(dismantleFreeSlots()<=0){
          state.auto.stage='CZEKA: DEMONTAŻ';
          state.auto.stageDetail='Kolejka demontażu pełna';
          return;
        }

        let invAdds=0;

        while(
          invAdds<Number(autoCfg.maxInventoryAddsPerCycle||4) &&
          dismantleFreeSlots()>0
        ){
          const freshNeeds=buildAutonomousNeeds(target);
          const needObj=Object.fromEntries(
            freshNeeds.resources
              .filter(x=>x.missFuture>0)
              .map(x=>[x.key,x.missFuture])
          );

          if(!Object.keys(needObj).length) break;

          const candidate=pickBestInventoryDismantleCandidate(needObj);
          if(!candidate) break;

          state.auto.stage=autoCfg.dryRun?'TEST: EKWIPUNEK → DEMONTAŻ':'EKWIPUNEK → DEMONTAŻ';
          state.auto.stageDetail=`${candidate.name} • wartość ${money(candidate.value)} • zastępuje materiały ~${money(candidate.replacementValue)}`;

          const res=await queueOwnedInventoryOne(candidate);

          if(!res.ok){
            if(res.reason && !res.dry) autoLogMsg('info',`Ekwipunek: ${res.reason}.`);
            return;
          }

          invAdds++;
          await sleep(500);

          // Aktualizujemy listę po każdej sztuce/stacku.
          const invData=await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
          state.manual.dismantlableItems=Array.isArray(invData?.items)?invData.items:[];
        }

        if(invAdds>0){
          state.auto.stage='CZEKA: DEMONTAŻ';
          state.auto.stageDetail=`Dodałem ${invAdds} szt. z ekwipunku — czekam na surowce`;
          return;
        }
      }

      // 8. Jeżeli bezpieczny ekwipunek nie wystarcza, dopiero wtedy kupujemy.
      if(missingResources.length){
        if(!autoCfg.autoBuy || !autoCfg.autoDismantle){
          state.auto.stage='CZEKA: SUROWCE';
          state.auto.stageDetail=`Brakuje: ${missingResources.map(x=>`${RESOURCE_LABELS_V4[x.key]} ${x.missFuture}`).join(', ')}`;
          return;
        }

        if(dismantleFreeSlots()<=0){
          state.auto.stage='CZEKA: DEMONTAŻ';
          state.auto.stageDetail='Kolejka demontażu pełna';
          return;
        }

        let buys=0;

        while(
          buys<Number(autoCfg.maxBuysPerCycle||1) &&
          dismantleFreeSlots()>0
        ){
          const freshNeeds=buildAutonomousNeeds(target);
          const freshMissing=freshNeeds.resources.filter(x=>x.missFuture>0);

          if(!freshMissing.length) break;

          const plan=freshNeeds.futureBundle;

          if(!plan?.ok || !plan.items?.length){
            state.auto.stage='CZEKA: OPTYMALIZATOR';
            state.auto.stageDetail=plan?.reason||'Brak kompletnego planu demontażu';
            return;
          }

          const nextItem=plan.items
            .filter(x=>Number(x.count||0)>0)
            .sort((a,b)=>
              Number(a.decisionUnitCost??a.unitPrice??Infinity)-Number(b.decisionUnitCost??b.unitPrice??Infinity) ||
              Number(a.effectiveSec||0)-Number(b.effectiveSec||0) ||
              Number(a.unitPrice||0)-Number(b.unitPrice||0)
            )[0];

          state.auto.source=nextItem||null;
          state.auto.stage='GLOBAL: ZAKUP → DEMONTAŻ';
          state.auto.stageDetail=`${dismantleDecisionText(nextItem)} • plan: ${bundleText(plan)}`;
          state.auto.lastDismantleDecision=dismantleDecisionText(nextItem);

          const res=await buyBundleItemOne(target,nextItem,cycleSpent);

          if(!res.ok){
            if(res.reason){
              autoLogMsg('info',`Czekam: ${res.reason}.`);
              registerRecipePurchaseStall(target,res.reason);
            }
            return;
          }

          cycleSpent+=Number(res.spent||0);
          buys++;

          await sleep(Math.min(900,Number(autoCfg.actionDelayMs||900)));
        }

        return;
      }

      if(physicalMissingButPending){
        state.auto.stage='CZEKA: DEMONTAŻ';
        state.auto.stageDetail='Potrzebne surowce są już w kolejce demontażu';
        return;
      }

      // 9. Dopiero na końcu kupujemy brakujące specyficzne składniki receptury.
      const missingExtra=needs.extras.find(x=>x.miss>0);
      if(missingExtra){
        state.auto.stage='ZAKUP SKŁADNIKA';
        state.auto.stageDetail=`${missingExtra.name}: brakuje ${missingExtra.miss}`;
        if(!autoCfg.autoBuy) return;

        const res=await buyExtraIngredientOne(target,missingExtra,cycleSpent);
        if(res.ok){
          cycleSpent+=Number(res.spent||0);
        }else if(res.reason){
          autoLogMsg('info',`Czekam: ${res.reason}.`);
          registerRecipePurchaseStall(target,res.reason);
        }
        return;
      }

      state.auto.stage='CZEKA';
      state.auto.stageDetail='Synchronizacja stanu';
    }catch(e){
      const msg=String(e?.message||e);

      // v8.5.6 START-FIX: pusty/stary wpis rankingu nie jest błędem fatalnym.
      // W v8.5.4/8.5.5 TypeError był klasyfikowany jako fatal, wyłączał enabled,
      // a computeRankings chwilę później tylko chował komunikat i panel pokazywał STOP.
      const nullRecipeError=/Cannot read properties of null \(reading ['"]recipe['"]\)|Cannot read property ['"]recipe['"] of null/i.test(msg);
      if(nullRecipeError){
        sanitizeRankings();
        state.auto.target=null;
        state.auto.error=null;
        state.auto.stage='RETRY: RANKING';
        state.auto.stageDetail='Wykryto pusty wpis rankingu — usunięty, ponawiam bez zatrzymywania';
        state.auto.quickRetryAt=Date.now()+1500;
        autoLogMsg('warn','AUTO-HEAL: usunięto pusty wpis rankingu (null.recipe); autopilot pozostaje włączony.');
      }else{
        state.auto.error=msg;

        const info=recoveryErrorInfo(e);
        const canRecover=beginRecovery(e);

        if(!canRecover){
          state.auto.stage='BŁĄD';
          state.auto.stageDetail=msg;
          autoLogMsg('error',`POMAGIER v8.5.6: ${msg}`);

          // Błędy nieretryowalne nie uruchamiają pętli bez końca.
          if(info.kind==='fatal' || /Kupiono .*nie znaleziono/i.test(msg)){
            autoCfg.enabled=false;
            autoSaveCfg();
            clearRecoveryTicket();
            autoLogMsg('warn','Pomagier został WYŁĄCZONY z powodu błędu nieretryowalnego.');
          }
        }
      }
    }finally{
      state.auto.inCycle=false;
      if(Number(state.auto.quickRetryAt||0)>Date.now()){
        state.auto.nextCycleAt=Number(state.auto.quickRetryAt);
        state.auto.quickRetryAt=0;
      }else{
        state.auto.nextCycleAt=Date.now()+Math.max(10,Number(autoCfg.cycleSeconds||30))*1000;
      }
      saveProfitPipeline();
      if(typeof render==='function') render();
    }
  }

  // ============================================================
  // AUTOPILOT v3
  // ============================================================

  function androidSyncBackgroundMode(){
    if(!ANDROID_APP || !window.AndroidBridge || typeof window.AndroidBridge.setAutomationActive!=='function') return;
    try{
      window.AndroidBridge.setAutomationActive(!!autoCfg.enabled || !!recoveryResumePending || !!autoCfg.alcoholAutoEnabled);
    }catch{}
  }

  function autoSaveCfg() {
    saveJSON(K.autoSettings, autoCfg);
    androidSyncBackgroundMode();
  }
  function autoLogMsg(level, msg, extra=null) {
    const row = {ts:nowIso(), level, msg:String(msg||''), extra};
    autoLog.push(row);
    if (autoLog.length > 300) autoLog = autoLog.slice(-300);
    saveJSON(K.autoLog, autoLog);
    state.auto.lastAction = row.msg;
    if (level === 'error') state.auto.error = row.msg;
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log']('[MG AUTO]', row.msg, extra || '');
  }

  function pendingOdpady() {
    return (state.dismantleQueue || []).reduce((sum,q)=>sum + Number(q.yield_odpady||0), 0);
  }
  function dismantleFreeSlots() {
    return Math.max(0, Number(state.dismantleMaxQueueSize||9) - Number((state.dismantleQueue||[]).length));
  }
  function craftFreeSlots() {
    const srv=serverCraftState();
    const used=srv.fresh ? srv.used : Number((state.craftQueue||[]).length)+Number((state.craftReady||[]).length);
    return Math.max(0, Number(state.craftMaxQueueSize||10) - used);
  }
  function purchaseRemaining() {
    const p = state.purchaseLimit;
    return p?.purchasesRemaining == null ? null : Number(p.purchasesRemaining);
  }

  async function apiActive(path, {method='GET', body=null}={}) {
    method=String(method||'GET').toUpperCase();

    if (!__mgSessionTemplate) tryHydrateSessionFromGameAuth();
    if (!__mgSessionTemplate) {
      throw new MgApiError(
        'Brak wzorca sesji.',
        {status:0,path,method,network:false,ambiguousWrite:false}
      );
    }

    const headers = new Headers(__mgSessionTemplate.headers);
    headers.set('Accept','application/json');
    if (body != null) headers.set('Content-Type','application/json');

    const controller=new AbortController();
    const timeoutMs=Math.max(8,Number(autoCfg.requestTimeoutSeconds||25))*1000;
    const timer=setTimeout(()=>controller.abort(),timeoutMs);

    const opts = {
      method,
      headers,
      credentials: __mgSessionTemplate.credentials || 'include',
      cache:'no-store',
      redirect: __mgSessionTemplate.redirect || 'follow',
      referrerPolicy: __mgSessionTemplate.referrerPolicy || undefined,
      signal:controller.signal
    };
    if (body != null) opts.body = JSON.stringify(body);

    __mgInternalApiDepth++;
    let r;
    try {
      r = await window.fetch(path, opts);
    } catch(err) {
      const timeout=err?.name==='AbortError';
      throw new MgApiError(
        timeout ? `Timeout API po ${Math.round(timeoutMs/1000)} s` : `Błąd sieci: ${err?.message||err}`,
        {
          status:0,path,method,
          network:true,
          timeout,
          // Przy POST nie wiemy, czy serwer nie wykonał akcji zanim odpowiedź zginęła.
          ambiguousWrite:method!=='GET'
        }
      );
    } finally {
      clearTimeout(timer);
      __mgInternalApiDepth = Math.max(0, __mgInternalApiDepth-1);
    }

    const rem = r.headers?.get?.('ratelimit-remaining');
    if (rem != null && rem !== '') {
      const n = Number(rem);
      if (Number.isFinite(n)) state.rateLimitRemaining = n;
    }

    let j = null;
    try { j = await r.json(); } catch {}

    if (!r.ok) {
      const detail = j?.message || j?.error || '';
      throw new MgApiError(
        `HTTP ${r.status}${detail?`: ${detail}`:''}`,
        {
          status:r.status,
          path,method,
          retryAfterMs:parseRetryAfterMs(r.headers?.get?.('retry-after')),
          ambiguousWrite:false
        }
      );
    }

    if (j && j.success === false) {
      throw new MgApiError(
        j.message || j.error || 'API success=false',
        {status:r.status,path,method}
      );
    }

    return j;
  }


  function alcoholReplaceCapturedCharacter(value,profile){
    if(value==null) return value;
    const oldId=Number(profile?.characterId||0), newId=Number(settings.characterId||0);
    if(!oldId || !newId || oldId===newId) return value;
    return String(value).replace(new RegExp(`\\b${oldId}\\b`,'g'),String(newId));
  }

  async function alcoholReplayTemplate(tpl,profile){
    if(!tpl?.path) throw new Error('Brak zapisanego requestu alkoholu.');
    if(!__mgSessionTemplate) tryHydrateSessionFromGameAuth();
    if(!__mgSessionTemplate) throw new Error('Brak sesji gry.');
    const path=alcoholReplaceCapturedCharacter(tpl.path,profile);
    const method=String(tpl.method||'POST').toUpperCase();
    const bodyRaw=tpl.bodyRaw==null?null:alcoholReplaceCapturedCharacter(tpl.bodyRaw,profile);
    const headers=new Headers(__mgSessionTemplate.headers);
    headers.set('Accept','application/json');
    if(bodyRaw!=null) headers.set('Content-Type',String(tpl.contentType||'').trim()||'application/json');
    const controller=new AbortController();
    const timeoutMs=Math.max(8,Number(autoCfg.requestTimeoutSeconds||25))*1000;
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const opts={method,headers,credentials:__mgSessionTemplate.credentials||'include',cache:'no-store',
      redirect:__mgSessionTemplate.redirect||'follow',referrerPolicy:__mgSessionTemplate.referrerPolicy||undefined,signal:controller.signal};
    if(bodyRaw!=null) opts.body=bodyRaw;
    __mgInternalApiDepth++;
    let r;
    try{ r=await window.fetch(path,opts); }
    finally{ clearTimeout(timer); __mgInternalApiDepth=Math.max(0,__mgInternalApiDepth-1); }
    const text=await r.text();
    let data=null; try{ data=text?JSON.parse(text):null; }catch{ data=text; }
    if(!r.ok || (data && typeof data==='object' && data.success===false)){
      const detail=(data && typeof data==='object')?(data.message||data.error||''):String(data||'');
      const err=new Error(`HTTP ${r.status}${detail?`: ${detail}`:''}`); err.status=Number(r.status||0); err.data=data; throw err;
    }
    return data;
  }

  async function alcoholAutoCycle({force=false}={}){
    if(!autoCfg.alcoholAutoEnabled && !force) return false;
    if(alcoholAuto.runtimeBusy || alcoholAuto.learning?.armed) return false;
    const profile=alcoholProfileSelected();
    if(!profile){
      alcoholAuto.lastError='Brak nauczonego profilu alkoholu.';
      alcoholAuto.lastAction='ALKOHOL: najpierw naucz jeden ręczny cykl';
      alcoholAuto.nextAt=Date.now()+60000; alcoholSave(); return false;
    }
    const now=Date.now();
    const due=Math.max(Number(profile.nextAt||0),Number(alcoholAuto.nextAt||0));
    if(!force && due>now) return false;
    const seq=Array.isArray(profile.sequence)?profile.sequence:[];
    const collect=seq.find(x=>x.type==='collect')||null;
    const buys=seq.filter(x=>x.type==='buy');
    const start=[...seq].reverse().find(x=>x.type==='start')||null;
    if(!collect || !start){
      alcoholAuto.lastError='Profil nie ma pełnej sekwencji ODBIERZ + WYTWARZAJ.';
      alcoholAuto.lastAction='ALKOHOL: naucz profil ponownie od przycisku Odbierz';
      alcoholAuto.nextAt=Date.now()+60000; alcoholSave(); return false;
    }
    alcoholAuto.runtimeBusy=true; alcoholAuto.lastError='';
    try{
      alcoholAuto.lastAction=`ALKOHOL ${profile.name}: próbuję odebrać gotową produkcję`; alcoholSave();
      try{ await alcoholReplayTemplate(collect,profile); }
      catch(e){
        profile.lastStatus=`Czekam na zakończenie: ${String(e?.message||e)}`;
        alcoholAuto.lastAction=`ALKOHOL ${profile.name}: jeszcze niegotowe`;
        alcoholAuto.nextAt=Date.now()+Math.max(15,Number(autoCfg.alcoholPollSeconds||30))*1000;
        alcoholSave(); return false;
      }
      profile.lastCollectedAt=Date.now();
      profile.lastStatus='ODEBRANO — przygotowuję kolejny cykl';
      alcoholAuto.lastAction=`ALKOHOL ${profile.name}: odebrano`;
      if(autoCfg.alcoholAutoBuyMissing){
        for(let i=0;i<buys.length;i++){
          try{ await sleep(250); await alcoholReplayTemplate(buys[i],profile);
            alcoholAuto.lastAction=`ALKOHOL ${profile.name}: dokupiono braki ${i+1}/${buys.length}`; }
          catch(e){ alcoholAuto.lastAction=`ALKOHOL ${profile.name}: dokup ${i+1}/${buys.length} pominięty`; }
        }
      }
      await sleep(300);
      await alcoholReplayTemplate(start,profile);
      profile.lastStartedAt=Date.now();
      const duration=Math.max(0,Number(profile.durationMs||0));
      profile.nextAt=duration>0?Date.now()+duration+5000:Date.now()+Math.max(30,Number(autoCfg.alcoholPollSeconds||30))*1000;
      profile.lastStatus=`START ${new Date(profile.lastStartedAt).toLocaleString('pl-PL')}`;
      alcoholAuto.nextAt=profile.nextAt;
      alcoholAuto.lastAction=`ALKOHOL ${profile.name}: wystartowano kolejny cykl${duration?` • ${Math.round(duration/3600000*10)/10} h`:''}`;
      alcoholAuto.lastError=''; alcoholSave(); autoLogMsg('info',alcoholAuto.lastAction);
      try{ if(typeof render==='function') render(); }catch{} return true;
    }catch(e){
      alcoholAuto.lastError=String(e?.message||e);
      alcoholAuto.lastAction=`ALKOHOL ${profile.name}: BŁĄD STARTU`;
      alcoholAuto.nextAt=Date.now()+Math.max(30,Number(autoCfg.alcoholPollSeconds||30))*1000;
      profile.lastStatus=`BŁĄD: ${alcoholAuto.lastError}`;
      alcoholSave(); autoLogMsg('warn',`${alcoholAuto.lastAction}: ${alcoholAuto.lastError}`);
      try{ if(typeof render==='function') render(); }catch{} return false;
    }finally{ alcoholAuto.runtimeBusy=false; alcoholSave(); }
  }

  async function refreshMarketOnly({silent=true}={}) {
    if (state.marketRefreshing || !__mgSessionTemplate) return false;
    state.marketRefreshing = true;
    try {
      const baz = await apiActive(`/api/bazaar/${settings.characterId}/index`);
      parseBazaar(baz);
      state.endpointStatus.bazar = {ok:true,active:true,at:Date.now()};
      state.lastUpdated = Date.now();
      buildResourceOptions();
      computeRankings();
      pushHistory();
      if (!silent) autoLogMsg('info','Ceny z handlu odświeżone.');
      return true;
    } catch(e) {
      if (!silent) autoLogMsg('warn',`Nie udało się odświeżyć cen: ${e.message}`);
      return false;
    } finally {
      state.marketRefreshing = false;
      state.marketNextAt = Date.now() + Math.max(15, Number(autoCfg.priceRefreshSeconds||30))*1000;
      if (typeof render === 'function') render();
    }
  }

  async function autoRefreshLiveData() {
    // Wyłącznie GET-y. Błędy sesji/sieci obsługuje moduł samonaprawy v4.5.
    const baz = await apiActive(`/api/bazaar/${settings.characterId}/index`);
    parseBazaar(baz);
    state.endpointStatus.bazar = {ok:true,active:true,at:Date.now()};

    await sleep(120);
    const rec = await apiActive(`/api/workshop/${settings.characterId}/crafting-recipes`);
    parseRecipes(rec);
    state.endpointStatus.receptury = {ok:true,active:true,at:Date.now()};

    await sleep(120);
    const q = await apiActive(`/api/workshop/${settings.characterId}/queue`);
    parseQueue(q);
    state.endpointStatus.kolejka = {ok:true,active:true,at:Date.now()};

    state.lastUpdated = Date.now();
    buildResourceOptions();
    computeRankings();
    return true;
  }

  async function autoTestConnection() {
    state.auto.connection = __mgSessionTemplate ? 'test…' : 'czekam na natywny request gry…';
    state.auto.error = null;
    if (typeof render === 'function') render();
    try {
      await autoRefreshLiveData();
      state.auto.connection = 'OK — aktywne API działa';
      autoLogMsg('info','Test połączenia OK: bazar + warsztat.');
      return true;
    } catch(e) {
      state.auto.connection = `BŁĄD: ${e.message}`;
      autoLogMsg('error',`Test połączenia: ${e.message}`);
      return false;
    } finally {
      if (typeof render === 'function') render();
    }
  }

  function eligibleAutoTargets() {
    const odpSource = (state.resourceOptions.odpady || []).find(x =>
      Number(x.costPer) <= Number(autoCfg.maxCostPerOdpady)
    ) || null;
    const currentO = Number(state.parts?.part_odpady || 0);
    const futureO = currentO + pendingOdpady();

    const rows = [];
    for (const r of state.recipes || []) {
      if (!r?.is_learned) continue;
      if (hasForbiddenCoins(r)) continue;

      const out = getPrice(r.result_item_id,0);
      const outPrice = out?.min_price == null ? null : Number(out.min_price);
      if (outPrice == null || outPrice <= 0) continue;

      let otherReady = true;
      let odpReq = Number(r.craft_odpady || 0);
      for (const [key, qty] of recipeResourceEntries(r)) {
        if (key === 'odpady') continue;
        const have = Number(state.parts?.[`part_${key}`] || 0);
        if (have < qty) { otherReady = false; break; }
      }
      if (!otherReady) continue;

      const extraReady = (r.extra_ingredients || []).every(x =>
        Number(x.have || 0) >= Number(x.quantity || 0)
      );
      if (!extraReady) continue;

      const missingFuture = Math.max(0, odpReq - futureO);
      if (missingFuture > 0 && !odpSource) continue;

      const unitsToBuy = missingFuture > 0 ? Math.ceil(missingFuture / Math.max(1,Number(odpSource.yield||1))) : 0;
      const expectedBuyCost = unitsToBuy * Number(odpSource?.price || 0);
      const net = netAfterFee(outPrice);
      const cashProfitAuto = net == null ? null : net - expectedBuyCost;
      const craftSec = Number(r.effective_craft_seconds || Number(r.craft_time_minutes||0)*60);
      const cashProfitHourAuto = cashProfitAuto == null || craftSec<=0 ? null : cashProfitAuto/(craftSec/3600);

      const currentReady = (() => {
        for (const [key,qty] of recipeResourceEntries(r)) {
          const have = Number(state.parts?.[`part_${key}`] || 0);
          if (have < qty) return false;
        }
        return extraReady;
      })();

      rows.push({
        recipe:r, output:out, outPrice, net, odpReq, currentO, futureO, missingFuture,
        source:odpSource, unitsToBuy, expectedBuyCost, cashProfitAuto, cashProfitHourAuto,
        craftSec, currentReady
      });
    }

    const metric = autoCfg.targetMetric === 'cashProfit'
      ? 'cashProfitAuto'
      : 'cashProfitHourAuto';

    return rows.filter(x =>
      Number(x.cashProfitAuto ?? -Infinity) >= Number(autoCfg.minProfitPerCraft||0) &&
      Number(x.cashProfitHourAuto ?? -Infinity) >= Number(autoCfg.minProfitPerHour||0)
    ).sort((a,b) =>
      Number(b[metric] ?? -Infinity)-Number(a[metric] ?? -Infinity) ||
      Number(b.cashProfitAuto ?? -Infinity)-Number(a.cashProfitAuto ?? -Infinity)
    );
  }

  function autoBestSource() {
    return (state.resourceOptions.odpady || []).find(x =>
      Number(x.costPer) <= Number(autoCfg.maxCostPerOdpady)
    ) || null;
  }

  function snapshotDismantlable(items, itemId) {
    const out = new Map();
    for (const x of (items||[])) {
      if (Number(x.item_id)!==Number(itemId)) continue;
      out.set(Number(x.inventory_id), Number(x.quantity||1));
    }
    return out;
  }

  function findPurchasedInventory(beforeMap, afterItems, itemId) {
    const matches = (afterItems||[]).filter(x=>Number(x.item_id)===Number(itemId));
    // 1) nowy inventory_id
    const fresh = matches.find(x=>!beforeMap.has(Number(x.inventory_id)));
    if (fresh) return fresh;
    // 2) stack zwiększył ilość
    const grown = matches.find(x=>Number(x.quantity||1) > Number(beforeMap.get(Number(x.inventory_id))||0));
    if (grown) return grown;
    return null;
  }

  async function verifySourcePrice(source) {
    const j = await apiActive(`/api/bazaar/${settings.characterId}/queue/${Number(source.itemId)}/0`);
    const listings = Array.isArray(j?.listings) ? j.listings : [];
    const first = listings.slice().sort((a,b)=>Number(a.price_per_unit)-Number(b.price_per_unit))[0];
    if (!first) throw new Error(`Brak ofert: ${source.name}`);
    const price = Number(first.price_per_unit);
    const costPer = price / Math.max(1,Number(source.yield||1));
    return {price,costPer,listing:first,orderbook:j};
  }

  async function buyAndQueueOne(source, cycleSpent) {
    resetAutoSpendIfNeeded();

    if (dismantleFreeSlots() <= 0) return {ok:false,reason:'kolejka demontażu pełna'};
    const rem = purchaseRemaining();
    if (rem != null && rem <= 0) return {ok:false,reason:'limit zakupów wyczerpany'};

    const live = await verifySourcePrice(source);
    if (live.costPer > Number(autoCfg.maxCostPerOdpady)) {
      return {ok:false,reason:`cena odpadu wzrosła do ${fmt(live.costPer,2)} zł`};
    }
    if (live.price > Number(autoCfg.maxSpendPerCycle||0) - cycleSpent) {
      return {ok:false,reason:'limit wydatku na cykl'};
    }
    if (Number(autoSpend.amount||0) + live.price > Number(autoCfg.maxSpendPerDay||0)) {
      return {ok:false,reason:'limit wydatku dziennego'};
    }

    if (autoCfg.dryRun) {
      autoLogMsg('info',`DRY: kupiłbym ${source.name} za ${money(live.price)} → ${source.yield} odp.`);
      return {ok:false,dry:true,reason:'dry-run'};
    }

    const before = await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
    const beforeMap = snapshotDismantlable(before?.items, source.itemId);

    const buy = await apiActive(`/api/bazaar/${settings.characterId}/buy`, {
      method:'POST',
      body:{itemId:Number(source.itemId), enhancementLevel:0, quantity:1}
    });

    const paid = Number(buy?.totalCost ?? live.price);
    autoSpend.amount = Number(autoSpend.amount||0) + paid;
    autoSpend.purchases = Number(autoSpend.purchases||0) + 1;
    saveJSON(K.autoSpend, autoSpend);
    sessionRecordPurchase(paid);
    if (buy?.purchaseLimit) state.purchaseLimit = buy.purchaseLimit;
    autoLogMsg('info',`KUPIONO: ${source.name} za ${money(paid)}.`);

    if (!autoCfg.autoDismantle) return {ok:true,spent:paid,boughtOnly:true};

    await sleep(Number(autoCfg.actionDelayMs||1800));
    const after = await apiActive(`/api/workshop/${settings.characterId}/dismantlable`);
    const inv = findPurchasedInventory(beforeMap, after?.items, source.itemId);

    if (!inv) {
      throw new Error(`Kupiono ${source.name}, ale nie znaleziono nowej sztuki do demontażu. Autopilot zatrzymany.`);
    }

    const q = await apiActive(`/api/workshop/${settings.characterId}/queue/add`, {
      method:'POST',
      body:{inventoryId:Number(inv.inventory_id)}
    });
    parseQueue(q);
    autoLogMsg('info',`DEMontaż: dodano ${source.name} → +${source.yield} odp. po zakończeniu.`);
    return {ok:true,spent:paid,queued:true};
  }

  async function startAutoCraft(target) {
    if (!target?.recipe) return false;
    if (craftFreeSlots() <= 0) {
      autoLogMsg('info','Czekam: kolejka craftingu jest pełna.');
      return false;
    }

    if (autoCfg.dryRun) {
      autoLogMsg('info',`DRY: uruchomiłbym ${target.recipe.item_name}; rynek ${money(target.outPrice)}, prognoza ${money(target.cashProfitAuto)}.`);
      return false;
    }

    const j = await apiActive(`/api/workshop/${settings.characterId}/crafting/start`, {
      method:'POST',
      body:{recipe_id:Number(target.recipe.id)}
    });
    if (j?.recipes) parseRecipes(j);
    autoLogMsg('info',`CRAFT START: ${target.recipe.item_name} • cena rynku ${money(target.outPrice)} • prognoza cash ${money(target.cashProfitAuto)}.`);
    return true;
  }

  async function autoCycle(force=false) {
    return autonomousProfitCycle(force);
  }

  function autoStatusText() {
    if(state.auto.recovery.active || recoveryResumePending) return 'RECOVERY';
    if (!autoCfg.enabled) return 'OFF';
    return autoCfg.dryRun ? 'DRY RUN' : 'LIVE';
  }

  function sanitizeRankings(){
    if(!Array.isArray(state.rankings)){
      state.rankings=[];
      return state.rankings;
    }

    const clean=state.rankings.filter(
      x=>x && typeof x==='object' && x.recipe && typeof x.recipe==='object'
    );

    if(clean.length!==state.rankings.length){
      state.rankings=clean;
    }
    return state.rankings;
  }

  function filteredRankings() {
    let rows = [...sanitizeRankings()];
    rows = rows.filter(x => !x.forbidden);
    if (settings.onlyLearned) rows = rows.filter(x => x.learned);
    if (settings.onlyProfitable) rows = rows.filter(x => (x.profit != null && x.profit > 0) || (x.cashProfit != null && x.cashProfit > 0));
    return rows;
  }

  function sortRankings(rows) {
    const metric = settings.rankingMetric || 'profitHour';
    return rows.sort((a,b) => (Number(b[metric] ?? -Infinity)-Number(a[metric] ?? -Infinity)) || (Number(b.profit ?? -Infinity)-Number(a.profit ?? -Infinity)));
  }

  function priceArrow(d) {
    if (d == null || d === 0) return '<span class="muted">•</span>';
    return d>0 ? `<span class="up">▲ ${fmt(d)}</span>` : `<span class="down">▼ ${fmt(Math.abs(d))}</span>`;
  }

  function collectionFlag(cols) {
    if (!cols || !cols.length) return '';
    const rep = cols.some(c=>c.repeatable);
    const title = cols.map(c=>`${c.name} (T${c.tier}${c.repeatable?', powt.':''})`).join(' | ');
    return `<span class="flag ${rep?'danger':''}" title="${esc(title)}">⚠ ${cols.length} kol.</span>`;
  }

  function bestResource(key) { return state.resourceOptions[key]?.[0] || null; }

  function dashboardHTML() {
    sanitizeRankings();
    const ranked = sortRankings(filteredRankings());
    const best = ranked[0] || null;
    const economic = [...filteredRankings()].filter(x=>x.profitHour!=null).sort((a,b)=>b.profitHour-a.profitHour)[0] || null;
    const practical = [...filteredRankings()].filter(x=>x.cashProfitHour!=null).sort((a,b)=>b.cashProfitHour-a.cashProfitHour)[0] || null;
    const tajfun = sanitizeRankings().find(x=>Number(x?.recipe?.result_item_id)===622);
    const odp = bestResource('odpady');
    const partsText = RESOURCE_KEYS.map(k=>`${RESOURCE_LABELS[k]}: <b>${fmt(state.parts?.[`part_${k}`]||0)}</b>`).join(' • ');
    const top = ranked.slice(0,8);
    const missing = [];
    if (!state.prices.size) missing.push('BAZAR: wejdź w Handel/Bazar');
    if (!state.recipes.length) missing.push('WARSZTAT: otwórz ekran wytwarzania');
    const nativeHelp = missing.length ? `<div class="section note" style="border-color:#315f7a;background:#172a35;color:#d6f1ff"><b>Tryb natywny:</b> ${missing.map(esc).join(' • ')}. Panel nie wysyła własnych requestów z autoryzacją — przechwytuje tylko odpowiedzi, które normalnie pobiera gra. Po otwarciu tych ekranów dane wskoczą automatycznie.</div>` : '';
    const diag = state.errors.length ? `<div class="section note" style="border-color:#7a3b3b;background:#351f1f;color:#ffd0d0"><b>Diagnostyka:</b> ${state.errors.map(esc).join('<br>')}</div>` : '';
    return `
      ${nativeHelp}
      ${diag}
      <div class="cards">
        <div class="card"><div class="label">Najlepszy TERAZ (cash/h)</div><div class="big">${practical?esc(practical.recipe.item_name):'—'}</div><div>${practical?.cashProfitHour!=null?money(practical.cashProfitHour)+'/h':'—'} • ${practical?.cashProfit!=null?money(practical.cashProfit):'—'}/szt.</div></div>
        <div class="card"><div class="label">Najlepszy długoterminowo</div><div class="big">${economic?esc(economic.recipe.item_name):'—'}</div><div>${economic?.profitHour!=null?money(economic.profitHour)+'/h':'brak pełnej wyceny'}</div></div>
        <div class="card"><div class="label">Tajfun</div><div class="big">${tajfun?.outPrice!=null?money(tajfun.outPrice):'brak oferty'}</div><div>${tajfun?.cashProfit!=null?`cash zysk ~${money(tajfun.cashProfit)}`:tajfun?.profit!=null?`zysk ~${money(tajfun.profit)}`:'—'}</div></div>
        <div class="card"><div class="label">Najtańszy odpad</div><div class="big">${odp?money(odp.costPer)+'/szt.':'—'}</div><div>${odp?esc(odp.name):'brak ofert'}</div></div>
      </div>
      <div class="section note" style="border-color:${autoCfg.enabled?(autoCfg.dryRun?'#8a742d':'#7a3131'):'#444'};background:${autoCfg.enabled?(autoCfg.dryRun?'#332f1f':'#351f1f'):'#202226'}">
        <b>Autopilot: ${autoStatusText()}</b> • ${state.auto.target?.recipe?`cel: ${esc(state.auto.target.recipe.item_name)}`:'brak celu'} • ${esc(state.auto.lastAction)}
      </div>
      <div class="section">
        <div class="section-title">Top produkcji — live</div>
        ${rankingTable(top, true)}
      </div>
      <div class="section"><div class="section-title">Twoje surowce</div><div class="chips">${partsText}</div></div>
      <div class="section note"><b>Model kosztu:</b> koszt surowców jest liczony konserwatywnie z najtańszych aktualnych przedmiotów do demontażu na każdą jednostkę surowca. Produkty uboczne nie są odejmowane, więc realny koszt może być niższy.</div>
    `;
  }

  function rankingTable(rows, compact=false) {
    if (!rows.length) return '<div class="empty">Brak pozycji spełniających filtry albo brak cen na bazarze.</div>';
    return `<div class="table-wrap"><table><thead><tr>
      <th>#</th><th>Produkt</th><th>Cena</th><th>2. cena</th><th>Netto</th><th>Koszt od zera</th><th>Zysk</th><th>Zł/h</th><th>ROI</th><th>Cash zysk</th><th>Cash zł/h</th><th>Czas</th><th>Status</th>
    </tr></thead><tbody>${rows.map((x,i)=>{
      const cls=x.profit!=null && x.profit>0?'profit':x.profit!=null?'loss':'';
      return `<tr class="${cls}" data-recipe="${x.recipe.id}">
        <td>${i+1}</td><td class="left"><b>${esc(x.recipe.item_name)}</b><div class="sub">ID ${x.recipe.result_item_id}${x.coinTypes?.length?` • moneta: ${esc(coinTypesLabel(x.coinTypes))}`:''}</div></td>
        <td>${money(x.outPrice)}</td><td>${money(x.outSecond)}</td><td>${money(x.net)}</td><td>${money(x.unknown?null:x.fullCost)}</td>
        <td><b>${money(x.profit)}</b></td><td>${x.profitHour==null?'—':money(x.profitHour)+'/h'}</td><td>${pct(x.roi)}</td><td><b>${money(x.cashProfit)}</b></td><td>${x.cashProfitHour==null?'—':money(x.cashProfitHour)+'/h'}</td>
        <td>${secondsText(x.craftSec)}</td><td>${x.canCraft?'<span class="ok">MOŻESZ</span>':x.learned?'<span class="warn">BRAKI</span>':'<span class="muted">NIE NAUCZ.</span>'}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function craftingHTML() {
    const rows = sortRankings(filteredRankings());
    return `
      <div class="toolbar">
        <div class="coin-perms-inline"><span>Monety dozwolone:</span>${coinPermissionControlsHTML()}</div>
        <label><input type="checkbox" data-setting="onlyLearned" ${settings.onlyLearned?'checked':''}> tylko nauczone</label>
        <label><input type="checkbox" data-setting="onlyProfitable" ${settings.onlyProfitable?'checked':''}> tylko zyskowne</label>
        <label>Sortuj <select data-setting="rankingMetric">
          <option value="cashProfitHour" ${settings.rankingMetric==='cashProfitHour'?'selected':''}>cash zysk/h (co robić teraz)</option>
          <option value="profitHour" ${settings.rankingMetric==='profitHour'?'selected':''}>zysk/h ekonomiczny</option>
          <option value="profit" ${settings.rankingMetric==='profit'?'selected':''}>zysk/szt.</option>
          <option value="roi" ${settings.rankingMetric==='roi'?'selected':''}>ROI</option>
          <option value="cashProfit" ${settings.rankingMetric==='cashProfit'?'selected':''}>zysk gotówkowy</option>
        </select></label>
      </div>
      ${rankingTable(rows)}
      <div class="sub" style="margin-top:8px">Kliknij wiersz produktu, aby zobaczyć rozkład kosztów i składników.</div>
      <div id="mg-recipe-detail"></div>
    `;
  }

  function recipeDetailHTML(x) {
    if (!x) return '';
    const res = x.resourcePlan.map(p=>{
      if (!p.opt) return `<tr><td>${RESOURCE_LABELS[p.key]}</td><td>${p.qty}</td><td>${p.have}</td><td>${p.miss}</td><td colspan="4">brak źródła rynkowego</td></tr>`;
      const by = Object.entries(p.opt.allYields).filter(([k])=>k!==p.key).map(([k,v])=>`${RESOURCE_LABELS[k]||k} +${v}`).join(', ');
      return `<tr><td>${RESOURCE_LABELS[p.key]}</td><td>${p.qty}</td><td>${p.have}</td><td>${p.miss}</td><td>${esc(p.opt.name)} ${collectionFlag(p.opt.collections)}</td><td>${money(p.opt.costPer)}/szt.</td><td>${money(p.qty*p.opt.costPer)}</td><td>${by||'—'}</td></tr>`;
    }).join('');
    const ext = x.extraPlan.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.qty}</td><td>${p.have}</td><td>${p.miss}</td><td>${money(p.unit)}</td><td>${p.minEnhancement?`+${p.minEnhancement}`:'0'}</td></tr>`).join('');
    return `<div class="detail-box">
      <div class="section-title">${esc(x.recipe.item_name)} — rozkład</div>
      <div class="cards mini">
        <div class="card"><div class="label">Cena</div><div class="big">${money(x.outPrice)}</div></div>
        <div class="card"><div class="label">Netto po prowizji</div><div class="big">${money(x.net)}</div></div>
        <div class="card"><div class="label">Koszt od zera</div><div class="big">${money(x.unknown?null:x.fullCost)}</div></div>
        <div class="card"><div class="label">Zysk</div><div class="big">${money(x.profit)}</div></div>
      </div>
      <div class="section-title">Surowce</div>
      <div class="table-wrap"><table><thead><tr><th>Surowiec</th><th>Potrzeba</th><th>Masz</th><th>Brakuje</th><th>Najtańszy demontaż</th><th>Koszt/j.</th><th>Koszt</th><th>Produkty uboczne</th></tr></thead><tbody>${res||'<tr><td colspan="8">brak surowców</td></tr>'}</tbody></table></div>
      <div class="section-title">Dodatkowe przedmioty</div>
      <div class="table-wrap"><table><thead><tr><th>Przedmiot</th><th>Potrzeba</th><th>Masz</th><th>Brakuje</th><th>Cena live</th><th>Min +</th></tr></thead><tbody>${ext||'<tr><td colspan="6">brak</td></tr>'}</tbody></table></div>
    </div>`;
  }

  function resourcesHTML() {
    const key = settings.resourceFocus || 'odpady';
    const rows = state.resourceOptions[key] || [];
    return `
      <div class="toolbar"><label>Surowiec <select data-setting="resourceFocus">${RESOURCE_KEYS.map(k=>`<option value="${k}" ${key===k?'selected':''}>${RESOURCE_LABELS[k]}</option>`).join('')}</select></label></div>
      <div class="cards mini">${RESOURCE_KEYS.map(k=>{
        const b=bestResource(k); return `<div class="card"><div class="label">${RESOURCE_LABELS[k]}</div><div class="big">${b?money(b.costPer):'—'}</div><div>${b?esc(b.name):'brak ofert'}</div></div>`;
      }).join('')}</div>
      <div class="section-title">Najtańsze źródła: ${RESOURCE_LABELS[key]}</div>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Przedmiot</th><th>Cena</th><th>Uzysk</th><th>Koszt / 1</th><th>Czas / 1</th><th>Cały demontaż</th><th>Inne surowce</th><th>Rynek</th></tr></thead><tbody>
      ${rows.slice(0,60).map((x,i)=>`<tr><td>${i+1}</td><td class="left"><b>${esc(x.name)}</b> ${collectionFlag(x.collections)}<div class="sub">ID ${x.itemId}</div></td><td>${money(x.price)}</td><td>${x.yield}</td><td><b>${money(x.costPer)}</b></td><td>${secondsText(x.secPerUnit)}</td><td>${secondsText(x.effectiveSec)}</td><td>${Object.entries(x.allYields).filter(([k])=>k!==key).map(([k,v])=>`${RESOURCE_LABELS[k]||k} +${v}`).join(', ')||'—'}</td><td>${x.quantity} szt. / ${x.listings} ofert</td></tr>`).join('') || '<tr><td colspan="9">Brak aktualnych ofert.</td></tr>'}
      </tbody></table></div>
    `;
  }

  function watchHTML() {
    return `
      <div class="table-wrap"><table><thead><tr><th>Przedmiot</th><th>Cena</th><th>Zmiana</th><th>2. cena</th><th>Netto</th><th>Szt.</th><th>Ofert</th><th>Alert ≥</th><th>Alert ≤</th><th></th></tr></thead><tbody>
      ${settings.watch.map(w=>{
        const p=getPrice(w.id,0), d=deltaFor(w.id,0);
        return `<tr data-watch-id="${w.id}"><td class="left"><b>${esc(p?.name||w.name||`ID ${w.id}`)}</b><div class="sub">ID ${w.id}</div></td><td><b>${money(p?.min_price)}</b></td><td>${priceArrow(d)}</td><td>${money(p?.min_price_2)}</td><td>${money(netAfterFee(p?.min_price))}</td><td>${fmt(p?.total_quantity)}</td><td>${fmt(p?.listing_count)}</td><td><input class="tiny" data-watch-field="above" type="number" value="${w.above??''}" placeholder="—"></td><td><input class="tiny" data-watch-field="below" type="number" value="${w.below??''}" placeholder="—"></td><td><button data-act="watch-remove" data-id="${w.id}">✕</button></td></tr>`;
      }).join('')}</tbody></table></div>
      <div class="add-row"><input data-f="watch-id" type="number" placeholder="ID"><input data-f="watch-name" type="text" placeholder="Nazwa (opcjonalnie)"><button data-act="watch-add">Dodaj do obserwowanych</button><button data-act="notif">Włącz alerty systemowe</button></div>
    `;
  }

  function sessionsHTML(){
    const rows=sessionHistory.slice(-10).reverse();
    const totals=rows.reduce((a,r)=>{
      a.revenue+=Number(r.soldRevenue||0);
      a.spent+=Number(r.totalSpent||0);
      a.net+=Number(r.netProfit||0);
      a.margin+=Number(r.realizedProfit||0);
      a.sold+=Number(r.soldCount||0);
      a.duration+=Number(r.durationMs||0);
      return a;
    },{revenue:0,spent:0,net:0,margin:0,sold:0,duration:0});
    const avgNet=rows.length?totals.net/rows.length:0;
    const currentSpent=Number(sessionStats.purchaseSpend||0)+Number(sessionStats.listingFees||0);
    const currentNet=Number(sessionStats.soldRevenue||0)-currentSpent;
    const signed=v=>`${Number(v)>=0?'+':''}${money(v)}`;

    return `
      <div class="toolbar">
        <button data-act="clear-session-history">Wyczyść historię sesji</button>
        <span class="sub">Przechowywane jest maksymalnie 10 zakończonych sesji START → STOP.</span>
      </div>

      <div class="section ${sessionStats.active?'okbox':''}">
        <div class="section-title">Aktualna sesja</div>
        ${sessionStats.startedAt?`
          <div class="cards mini session-current-cards">
            <div class="card"><div class="label">Status / czas</div><div class="big">${sessionStats.active?'TRWA':'ZAKOŃCZONA'}</div><div>${sessionDurationText()}</div></div>
            <div class="card"><div class="label">Przychód</div><div class="big">${money(sessionStats.soldRevenue||0)}</div><div>${fmt(sessionStats.soldCount||0)} sprzedaży</div></div>
            <div class="card"><div class="label">Wydatki</div><div class="big">${money(currentSpent)}</div><div>zakupy ${money(sessionStats.purchaseSpend||0)} • opłaty ${money(sessionStats.listingFees||0)}</div></div>
            <div class="card"><div class="label">Na czysto</div><div class="big ${currentNet>=0?'ok':'bad'}">${signed(currentNet)}</div><div>cashflow: przychód − faktyczne wydatki</div></div>
            <div class="card"><div class="label">Marża sprzedanych</div><div class="big">${signed(sessionStats.realizedProfit||0)}</div><div>cena − koszt bazowy − prowizja</div></div>
          </div>
        `:'<div class="sub">Licznik ruszy po START.</div>'}
      </div>

      <div class="section-title">Ostatnie ${rows.length} / 10 zakończonych sesji</div>
      <div class="cards mini session-summary-cards">
        <div class="card"><div class="label">Łączny przychód</div><div class="big">${money(totals.revenue)}</div><div>${fmt(totals.sold)} sprzedaży</div></div>
        <div class="card"><div class="label">Łączne wydatki</div><div class="big">${money(totals.spent)}</div><div>zakupy + opłaty bazaru</div></div>
        <div class="card"><div class="label">Łącznie na czysto</div><div class="big ${totals.net>=0?'ok':'bad'}">${signed(totals.net)}</div><div>średnio ${signed(avgNet)} / sesję</div></div>
        <div class="card"><div class="label">Czas pracy</div><div class="big">${durationTextMs(totals.duration)}</div><div>łącznie z zapisanych sesji</div></div>
      </div>

      <div class="table-wrap"><table><thead><tr>
        <th>#</th><th>Start</th><th>Koniec</th><th>Czas</th><th>Przychód</th><th>Wydatki</th><th>Zakupy</th><th>Opłaty</th><th>Na czysto</th><th>Marża sprzedanych</th><th>Sprzedaże</th>
      </tr></thead><tbody>
        ${rows.map((r,i)=>`<tr>
          <td>${rows.length-i}</td>
          <td>${new Date(r.startedAt).toLocaleString('pl-PL')}</td>
          <td>${new Date(r.endedAt).toLocaleString('pl-PL')}</td>
          <td>${durationTextMs(r.durationMs)}</td>
          <td><b>${money(r.soldRevenue)}</b></td>
          <td>${money(r.totalSpent)}</td>
          <td>${money(r.purchaseSpend)}</td>
          <td>${money(r.listingFees)}</td>
          <td class="${Number(r.netProfit)>=0?'ok':'bad'}"><b>${signed(r.netProfit)}</b></td>
          <td>${signed(r.realizedProfit)}</td>
          <td>${fmt(r.soldCount)}</td>
        </tr>`).join('') || '<tr><td colspan="11">Brak zakończonych sesji. Pierwszy rekord pojawi się po ręcznym STOP.</td></tr>'}
      </tbody></table></div>
      <div class="section note"><b>„Na czysto”</b> = przychód ze sprzedaży wykrytej w tej sesji − faktyczne zakupy − opłaty za wystawienie. <b>„Marża sprzedanych”</b> używa kosztu bazowego przypisanego do sprzedanych produktów, więc oba wyniki mogą się różnić, np. gdy kupujesz zapas na kolejną sesję albo sprzedajesz materiały kupione wcześniej.</div>
    `;
  }

  function historyHTML() {
    const rows = history.slice(-250).reverse();
    return `
      <div class="toolbar"><button data-act="csv">Eksport CSV</button><button data-act="snapshot">Eksport pełnego snapshotu JSON</button><button data-act="clear-history">Wyczyść historię</button></div>
      <div class="table-wrap"><table><thead><tr><th>Czas</th><th>Przedmiot</th><th>Cena</th><th>2. cena</th><th>Szt.</th><th>Ofert</th></tr></thead><tbody>
      ${rows.map(x=>`<tr><td>${new Date(x.ts).toLocaleString('pl-PL')}</td><td class="left">${esc(x.name)} <span class="sub">#${x.id}</span></td><td>${money(x.price)}</td><td>${money(x.price2)}</td><td>${fmt(x.qty)}</td><td>${fmt(x.listings)}</td></tr>`).join('') || '<tr><td colspan="6">Brak historii.</td></tr>'}
      </tbody></table></div>`;
  }


  function alcoholAutomationHTML(){
    const profiles=alcoholProfileList(), selected=alcoholProfileSelected(), learn=alcoholAuto.learning||{};
    const opts=profiles.map(p=>`<option value="${esc(p.key)}" ${String(autoCfg.alcoholProfileKey||'')===String(p.key)?'selected':''}>${esc(p.name)}${p.durationMs?` • ${Math.round(p.durationMs/360000)/10} h`:''}</option>`).join('');
    const nextAt=Number(selected?.nextAt||alcoholAuto.nextAt||0);
    const nextTxt=nextAt>Date.now()?durationTextMs(nextAt-Date.now()):'teraz / czekam';
    const learned=selected?`Profil: ${esc(selected.name)} • ${Array.isArray(selected.sequence)?selected.sequence.filter(x=>x.type==='buy').length:0} krok(i) dokupu • następna próba ${esc(nextTxt)}`:'Brak profilu — trzeba nauczyć jeden pełny ręczny cykl.';
    return `<div class="section">
      <div class="section-title">🍶 Automatyczna produkcja alkoholu</div>
      <div class="simple-settings">
        <label><span><input data-auto="alcoholAutoEnabled" type="checkbox" ${autoCfg.alcoholAutoEnabled?'checked':''}> Automatycznie odbieraj i uruchamiaj ponownie wybrany alkohol</span><small>Nie sprzedaje alkoholu i nie wymienia go na Złote Zęby.</small></label>
        <label><span><input data-auto="alcoholAutoBuyMissing" type="checkbox" ${autoCfg.alcoholAutoBuyMissing?'checked':''}> Automatycznie używaj „dokup brakujące składniki”</span></label>
        <label>Profil alkoholu<select data-auto="alcoholProfileKey"><option value="">— wybierz nauczony profil —</option>${opts}</select></label>
        <label>Sprawdzaj ponownie co (s)<input data-auto="alcoholPollSeconds" type="number" min="15" max="600" value="${Number(autoCfg.alcoholPollSeconds||30)}"></label>
      </div>
      <div class="sub" style="margin-top:7px">${learn.armed?`<b class="warn">${esc(learn.status||'UCZENIE')}</b>`:learned}</div>
      <div class="sub" style="margin-top:4px">Ostatnia akcja: <b>${esc(alcoholAuto.lastAction||'—')}</b>${alcoholAuto.lastError?` • <span class="bad">${esc(alcoholAuto.lastError)}</span>`:''}</div>
      <div class="toolbar" style="margin-top:8px">
        <button data-act="alcohol-learn">${learn.armed?'Uczenie aktywne…':'Naucz nowy profil alkoholu'}</button>
        ${learn.armed?'<button data-act="alcohol-learn-stop">Przerwij uczenie</button>':''}
        ${selected?'<button data-act="alcohol-run-now">Sprawdź teraz</button><button data-act="alcohol-delete-profile">Usuń profil</button>':''}
      </div>
      <div class="sub">Nauka jest jednorazowa: po zakończeniu bieżącej produkcji kliknij ręcznie <b>Odbierz</b>, wybierz recepturę w Notesie, potwierdź brakujące składniki, ustaw x1/x2 i kliknij <b>Wytwarzaj</b>. Pomagier zapamięta prawdziwe requesty gry i kolejne cykle wykona sam.</div>
    </div>`;
  }

  function autopilotAdvancedHTML() {
    resetAutoSpendIfNeeded();
    const target=(state.auto.target?.recipe ? state.auto.target : null) || pickAutonomousTarget();
    const next=state.auto.nextCycleAt?Math.max(0,Math.ceil((state.auto.nextCycleAt-Date.now())/1000)):0;
    const live=autoCfg.enabled&&!autoCfg.dryRun;
    const dry=autoCfg.enabled&&autoCfg.dryRun;
    const recovering=!!(state.auto.recovery.active||recoveryResumePending);
    const statusText=recovering?'SAMONAPRAWA':live?'AUTONOMICZNY':dry?'TEST':'STOP';
    const statusClass=recovering?'warn':live?'ok':dry?'warn':'muted';
    const active=Number(state.auto.activeListingCount||0);
    const maxL=Number(state.auto.maxListings||10);
    const lsum=learningSummary();
    const extAI=state.localAI;
    const rejected=(state.rankings||[])
      .filter(x=>x?.recipe && x.learned && !x.forbidden)
      .sort((a,b)=>Number(b.outPrice||0)-Number(a.outPrice||0))
      .slice(0,12);

    const logRows=autoLog.slice(-45).reverse().map(x=>`
      <tr><td class="left">${new Date(x.ts).toLocaleTimeString('pl-PL')}</td><td>${esc(x.level)}</td><td class="left">${esc(x.msg)}</td></tr>
    `).join('');

    return `
      <div class="helper-hero">
        <div>
          <div class="helper-name">Pomagier by Don — ZYSK</div>
          <div class="helper-status ${statusClass}">${statusText}</div>
          <div class="sub">${__mgSessionTemplate?'Linia produkcyjna gotowa.':'Otwórz Bazar lub Warsztat, aby Pomagier złapał sesję.'} ${autoCfg.selfLearningEnabled?'• Pamięć skryptu: UCZY SIĘ':''} • AI Brain: ${extAI.connected?'POŁĄCZONE':'OFFLINE'}</div>
        </div>
        <div class="helper-actions">
          <button class="btn-main" data-act="auto-live">▶ START AUTONOMICZNY</button>
          <button data-act="auto-dry">Test bez wydawania</button>
          <button class="btn-stop" data-act="auto-stop">■ STOP</button>
          <button data-act="market-refresh">↻ Ceny</button>
        </div>
      </div>

      ${alcoholAutomationHTML()}

      <div class="section local-ai-box ${extAI.connected?'okbox':'offbox'}">
        <div class="local-ai-head">
          <div>
            <b>🧠 Pomagier AI Brain — ${ANDROID_APP?'wbudowany w aplikację Android':'program na komputerze'}</b>
            <div class="sub">${extAI.connected
              ? `Połączony • ostatni kontakt ${Math.max(0,Math.round((Date.now()-extAI.lastSeenAt)/1000))} s temu`
              : `Brak połączenia z ${esc(LOCAL_AI_URL)}${extAI.error?` • ${esc(extAI.error)}`:''}`}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button data-act="menel-learn-close">Naucz zamknięcie MenelMode</button>
            <button data-act="melina-learn-add">Naucz rupieciarnię</button>
            <button data-act="garden-check">Sprawdź ogród</button>
            <button data-act="local-ai-test">Sprawdź AI</button>
          </div>
        </div>
        <div class="local-ai-grid">
          <div><span>Wybór ekonomiczny</span><b>${extAI.preferredRecipeName?esc(extAI.preferredRecipeName):'—'}</b></div>
          <div><span>Pewność</span><b>${pct(Number(extAI.confidence||0)*100)}</b></div>
          <div><span>Następna decyzja</span><b>${esc(extAI.decision?.nextAction?.label||extAI.lastGameAction||'—')}</b></div>
          <div><span>Powód</span><b>${esc(extAI.reason||'—')}</b></div>
          <div><span>MenelMode</span><b>${esc(extAI.menelLastAction||'czekam')}</b></div>
          <div><span>Raid — rekomendacja</span><b>${esc(extAI.raidRecommendation||'—')}</b></div>
          <div><span>Zadania</span><b>${esc(extAI.taskHint||'—')}</b></div>
          <div><span>OpenAI advisor</span><b>${esc(extAI.advisorNote||'OFF')}</b></div>
          <div><span>Planner</span><b>${esc(extAI.plannerMode||'adaptive-bandit')}</b></div>
          <div><span>Lokalny LLM</span><b>${esc(extAI.localLlmStatus||'—')} ${extAI.localLlmModel&&extAI.localLlmModel!=='—'?`• ${esc(extAI.localLlmModel)}`:''}</b></div>
          <div><span>Zdrowie Brain</span><b>${esc(extAI.brainHealth||'—')}</b></div>
          <div><span>Czas decyzji Brain</span><b>${Number(extAI.brainDecisionMs||0)>0?`${Math.round(Number(extAI.brainDecisionMs))} ms`:'—'} • limit ${Number(extAI.brainRequestTimeout||0)||'—'} s</b></div>
          <div><span>Wykonanie akcji</span><b>${esc(extAI.worldActionGate||'—')}</b></div>
          <div><span>Menel learner</span><b>${esc(extAI.menelLearn?.status||'—')}</b></div>
          <div><span>Rupieciarnia learner</span><b>${esc(extAI.melinaLearn?.status||'—')}</b></div>
          <div><span>Plecak</span><b>${esc(extAI.inventoryGuardian?.status||'—')} • ${esc(extAI.inventoryGuardian?.lastAction||'—')}${
            extAI.inventoryGuardian?.serverSafeLimit!=null &&
            Number.isFinite(Number(extAI.inventoryGuardian.serverSafeLimit)) &&
            Number(extAI.inventoryGuardian.serverSafeLimit)>0
              ? ` • wyuczony limit akcji ≤${Number(extAI.inventoryGuardian.serverSafeLimit)}`
              : ''
          }</b></div>
          <div><span>Rupieciarnia</span><b>${Number(extAI.inventoryGuardian?.melinaSlotsUsed||0)}/${Number(extAI.inventoryGuardian?.melinaCapacity||0)} • ${esc(extAI.inventoryGuardian?.melinaLastAction||'—')}${
            Number(extAI.inventoryGuardian?.melinaCapacity||0)>0 &&
            Number(extAI.inventoryGuardian?.melinaSlotsUsed||0)>=Number(extAI.inventoryGuardian?.melinaCapacity||0)
              ? ' • PEŁNA'
              : ''
          }</b></div>
          <div><span>Ogród AI 🌱</span><b>${esc(extAI.garden?.status||'—')} • ${esc(extAI.garden?.lastAction||'—')}</b></div>
          <div><span>Badanie cebuli</span><b>${
            extAI.garden?.best?.conditions
              ? `BEST ~${Math.round(Number(extAI.garden.best.scoreSecondsPerFrame||0)/60)} min/klatkę • ${Number(extAI.garden.best.conditions.sunlight)}% / ${Number(extAI.garden.best.conditions.water)}% / pH ${Number(extAI.garden.best.conditions.ph).toFixed(1)}`
              : `LAB • ${Number(extAI.garden?.trials?.length||0)} prób • czekam na zmianę atlasFrame`
          }</b></div>
          <div><span>Grządki</span><b>${esc((extAI.garden?.slots||[]).map(x=>`#${Number(x.slotNumber||0)} ${String(x.status||'empty')}${x.atlasFrame!=null?` F${Number(x.atlasFrame)}`:''}`).join(' • ')||'—')}</b></div>
          <div><span>Sadzeniaki ziemniaka</span><b>${Number(extAI.garden?.availableSeeds||0)} • priorytet: ziemniaki • auto-zakup brakujących: ${autoCfg.localAiGardenAutoBuySeeds?'ON':'OFF'}</b></div>
          <div><span>Antypętla</span><b>${Number(extAI.actionGuard?.failures||0)}× • ${esc(extAI.actionGuard?.lastError||'OK')}</b></div>
          <div><span>Sweep dzielnic</span><b>${
            extAI.districtSweep
              ? `${esc(extAI.districtSweep.phase||'—')} • ${Number(extAI.districtSweep.completed||0)}/${Number(extAI.districtSweep.total||0)} • zostało ${Number(extAI.districtSweep.remaining||0)}`
              : '—'
          }</b></div>
          <div><span>Mapa cooldownów</span><b>${esc(
            state.localAI.world?.allCooldownsSource || '—'
          )} • ${
            state.localAI.world?.allCooldowns?.success
              ? `${Object.keys(state.localAI.world.allCooldowns.cooldowns||{}).length} czerwonych`
              : 'brak danych'
          }</b></div>
        </div>
      </div>

      ${(state.auto.recovery.active||recoveryResumePending)?`
        <div class="section recovery-box">
          <div>
            <b>🛠 Samonaprawa aktywna</b>
            <div>${esc(state.auto.recovery.reason||'Odzyskiwanie połączenia')}</div>
          </div>
          <div>
            Próby: <b>${fmt(state.auto.recovery.failures||0)}</b> •
            ${state.auto.recovery.nextAt>Date.now()
              ? `następna za <b>${Math.max(0,Math.ceil((state.auto.recovery.nextAt-Date.now())/1000))} s</b>`
              : '<b>sprawdzam teraz</b>'}
          </div>
        </div>`:''}

      <div class="profit-stage section">
        <div>
          <div class="label">Co robi teraz</div>
          <div class="big">${esc(state.auto.stage||'STOP')}</div>
          <div>${esc(state.auto.stageDetail||'—')}</div>
        </div>
        <div>
          <div class="label">Następny cykl</div>
          <div class="big">${autoCfg.enabled?`${next}s`:'—'}</div>
        </div>
      </div>

      <div class="cards">
        <div class="card">
          <div class="label">Najlepszy produkt teraz</div>
          <div class="big">${target?.recipe?esc(target.recipe.item_name):'—'}</div>
          <div>${target?.recipe?`rynek ${money(target.outPrice)} • koszt braków do kupienia teraz ~${money(target.cashCost)}${autoCfg.profitAwareCycleOverride?' • limit cyklu: miękki':''}`:'brak produktu spełniającego limity'}</div>
        </div>
        <div class="card learning-card">
          <div class="label">Samouczenie</div>
          <div class="big">${autoCfg.selfLearningEnabled?'🧠 AKTYWNE':'OFF'}</div>
          <div>${fmt(lsum.decisions)} decyzji • ${fmt(lsum.sold)} sprzedaży • ${fmt(lsum.tested)} receptur z wynikiem</div>
          <div class="sub">${lsum.best?`Najlepsza nauczona: ${esc(lsum.best.name)} ~${money(lsum.best.ewmaRealizedProfitHour)}/h`:'Zbieram pierwsze realne wyniki...'}</div>
        </div>
        <div class="card">
          <div class="label">Zysk gotówkowy TERAZ</div>
          <div class="big ok">${target?.recipe?money(target.cashProfit):'—'}</div>
          <div>${target?.recipe?`${money(target.cashProfitHour)}/h • zakup braków ${money(target.cashCost)}${target.cashInventoryPlan?.items?.length?` • własny ekwipunek: ${target.cashInventoryPlan.items.map(x=>`${x.count}× ${x.name}`).join(' + ')}`:''}`:'—'}</div>
        </div>
        <div class="card">
          <div class="label">Pipeline</div>
          <div class="big">${serverCraftState().fresh?serverCraftState().active:profitJobs.filter(x=>x.status==='crafting').length} produkcja • ${serverCraftState().fresh?serverCraftState().readyCount:profitJobs.filter(j=>j.status==='crafting' && (state.craftReady||[]).some(r=>Number(r.id)===Number(j.queueId))).length} gotowe do odbioru</div>
          <div>${saleQueue.length} czeka na sprzedaż • ${active}/${maxL} ofert${
            saleQueue.length>0 && active<maxL ? ' • są wolne sloty bazaru' : ''
          }</div>
        </div>
        <div class="card">
          <div class="label">Wydatki / opłaty</div>
          <div class="big">${money(autoSpend.amount||0)}</div>
          <div>zakupy dziś • opłaty wystawień ${money(profitStats.listingFees||0)}</div>
        </div>
      </div>

      ${target?`
        <div class="section economic-strip ${target.economicIncomplete?'warn-box':''}">
          <div>
            <span>Zysk ekonomiczny</span>
            <b>${target.economicIncomplete?'≤ ':target.valuationApprox?'~ ':''}${money(target.profit)}</b>
          </div>
          <div>
            <span>Koszt odtworzenia wszystkich materiałów</span>
            <b>${target.economicIncomplete?'co najmniej ':target.valuationApprox?'~ ':''}${money(target.fullCost)}</b>
          </div>
          <div>
            <span>Wycena</span>
            <b>${
              target.economicIncomplete
                ? `NIEPEŁNA — brak ceny: ${target.unpricedOwned.map(x=>x.name).join(', ')}`
                : target.valuationApprox
                  ? 'PRZYBLIŻONA — użyto ostatniej widzianej ceny'
                  : 'PEŁNA — bieżące ceny'
            }</b>
          </div>
        </div>`:''}

      ${target && autoCfg.selfLearningEnabled?`
        <div class="section learning-strip">
          <div>
            <span>Ocena ucząca</span>
            <b>${target.aiScore==null?'—':money(target.aiScore)+'/h'}</b>
          </div>
          <div>
            <span>Korekta względem matematyki</span>
            <b>${target.learningFactor==null?'—':`${target.learningFactor>=1?'+':''}${fmt((target.learningFactor-1)*100,1)}%`}</b>
          </div>
          <div>
            <span>Pewność</span>
            <b>${pct(Number(target.learningConfidence||0)*100)}</b>
          </div>
          <div>
            <span>Czego się nauczył</span>
            <b>${esc(target.learningReason||'zbieram dane')}</b>
          </div>
        </div>`:''}

      <div class="section perf-strip">
        <span>Optymalizator: <b>${fmt(state.optimizerLastMs)} ms</b></span>
        <span>Pełna analiza: <b>${fmt(state.optimizerLastRecipes)}</b> receptur</span>
        <span>Cache cen demontażu: <b>${state.optimizerCache.size}</b></span>
        <span>Ekwipunek: <b>${autoCfg.autoUseInventoryDismantle?'ON':'OFF'} ≤ ${money(autoCfg.maxInventoryDismantleValue||3000)}</b></span>
        <span>Składniki craftu: <b class="ok">CHRONIONE</b></span>
        <span>Magazyn: <b>${autoCfg.strategicStockEnabled?'ON':'OFF'}</b> • ${fmt(autoCfg.strategicStockCycles)} cykle</span>
        <span>Demontaż: <b>${autoCfg.preferFastDismantle?'ZYSK + CZAS':'tylko koszt'}</b></span>
        <span>Samonaprawa: <b>${autoCfg.recoveryEnabled?'ON':'OFF'}</b></span>
        <span>Pamięć skryptu: <b>${autoCfg.selfLearningEnabled?'UCZY SIĘ':'OFF'}</b></span>
        <span>AI Brain: <b>${state.localAI.connected?'ONLINE':'OFFLINE'}</b></span>
        ${state.auto.lastDismantleDecision?`<span>Ostatni wybór: <b>${esc(state.auto.lastDismantleDecision)}</b></span>`:''}
      </div>

      <div class="section profit-flow">
        <span>0. AI BRAIN + UCZENIE</span><b>→</b>
        <span>1. ANALIZA CEN</span><b>→</b>
        <span>2. GLOBALNY PLAN</span><b>→</b>
        <span>3. ZAKUP</span><b>→</b>
        <span>4. DEMONTAŻ</span><b>→</b>
        <span>5. PRODUKCJA</span><b>→</b>
        <span>6. ODBIÓR</span><b>→</b>
        <span>7. SPRZEDAŻ</span>
      </div>

      ${target?.fullBundle?.ok?`
        <div class="section">
          <div class="section-title">Globalny plan materiałów: ${esc(target.recipe.item_name)}</div>
          <div class="bundle-summary">
            <div><span>Koszt gotówkowy zestawu</span><b>${money(target.fullBundle.cost)}</b></div>
            <div><span>Koszt decyzyjny (cena + czas)</span><b>${money(target.fullBundle.decisionCost??target.fullBundle.cost)}</b></div>
            <div><span>Przedmiotów do demontażu</span><b>${fmt(target.fullBundle.itemCount)}</b></div>
            <div><span>Demontaż równoległy</span><b>${fmt(target.fullBundle.makespanSec/60,1)} min</b></div>
            <div><span>Plan zakupów</span><b>${esc(bundleText(target.fullBundle))}</b></div>
          </div>
          <div class="sub" style="margin-top:7px">
            Produkty uboczne są liczone wspólnie — jeden zakup może jednocześnie pokryć kilka różnych surowców.
          </div>
        </div>`:''}

      ${state.auto.error?`
        <div class="section note" style="border-color:#7a3131;background:#351f1f;color:#ffd0d0">
          <b>Błąd:</b> ${esc(state.auto.error)}
        </div>`:''}

      ${!target?`
        <details class="section advanced-box" open>
          <summary>Dlaczego Pomagier nic nie wybrał?</summary>
          <div class="table-wrap" style="margin-top:8px"><table>
            <thead><tr><th class="left">Receptura</th><th>Cena rynku</th><th>Zysk ekonom.</th><th>Zysk/h</th><th class="left">Powód odrzucenia</th></tr></thead>
            <tbody>
              ${rejected.map(x=>`<tr>
                <td class="left">${esc(x.recipe.item_name)}</td>
                <td>${x.outPrice==null?'—':money(x.outPrice)}</td>
                <td>${x.profit==null?'—':money(x.profit)}${x.valuationApprox?' *':''}</td>
                <td>${x.profitHour==null?'—':money(x.profitHour)}</td>
                <td class="left">${esc(autonomousRejectReason(x))}</td>
              </tr>`).join('') || '<tr><td colspan="5">Brak nauczonych receptur bez monet.</td></tr>'}
            </tbody>
          </table></div>
          <div class="sub">* wycena przybliżona: masz wymagany składnik w ekwipunku, ale aktualnie nie ma dla niego ceny na bazarze.</div>
        </details>`:''}

      <details class="section learning-details" ${autoCfg.selfLearningEnabled?'open':''}>
        <summary>🧠 Pamięć samouczenia</summary>
        <div class="sub" style="margin:7px 0">
          Model działa lokalnie w przeglądarce. Uczy się z realnego czasu produkcji,
          czasu sprzedaży, faktycznego zysku oraz trendu i zmienności rynku.
          Twarde limity zysku i zabezpieczenia nadal mają pierwszeństwo.
        </div>
        <div class="table-wrap"><table>
          <thead>
            <tr>
              <th class="left">Receptura</th>
              <th>Sprzedane</th>
              <th>Powroty</th>
              <th>Realny zysk/h</th>
              <th>Czas sprzedaży</th>
              <th>Predykcja</th>
            </tr>
          </thead>
          <tbody>
            ${lsum.recipes
              .filter(x=>Number(x.sold||0)+Number(x.returned||0)>0)
              .sort((a,b)=>Number(b.ewmaRealizedProfitHour??-Infinity)-Number(a.ewmaRealizedProfitHour??-Infinity))
              .slice(0,12)
              .map(x=>`<tr>
                <td class="left"><b>${esc(x.name||`#${x.recipeId}`)}</b></td>
                <td>${fmt(x.sold||0)}</td>
                <td>${fmt(x.returned||0)}</td>
                <td>${x.ewmaRealizedProfitHour==null?'—':money(x.ewmaRealizedProfitHour)+'/h'}</td>
                <td>${x.ewmaSaleMinutes==null?'—':fmt(x.ewmaSaleMinutes,1)+' min'}</td>
                <td>${x.ewmaPredictionRatio==null?'—':pct(x.ewmaPredictionRatio*100)}</td>
              </tr>`).join('') || '<tr><td colspan="6">Jeszcze brak zakończonych sprzedaży. Pomagier dopiero zbiera doświadczenie.</td></tr>'}
          </tbody>
        </table></div>
        <div class="toolbar" style="margin-top:8px">
          <button data-act="learning-reset">Wyczyść pamięć uczenia</button>
        </div>
      </details>

      <div class="section-title">Najważniejsze ustawienia zysku</div>
      <div class="simple-settings section">
        <label>
          <span>Minimalny zysk / szt.</span>
          <input data-auto="minProfitPerCraft" type="number" min="0" value="${autoCfg.minProfitPerCraft}">
          <small>Nie produkuje ani nie wystawia poniżej tego zysku.</small>
        </label>
        <label>
          <span>Minimalny zysk / godzinę</span>
          <input data-auto="minProfitPerHour" type="number" min="0" value="${autoCfg.minProfitPerHour}">
          <small>Ranking liczy pełny koszt odtworzenia materiałów.</small>
        </label>
        <label>
          <span>Maks. wydatki dziennie</span>
          <input data-auto="maxSpendPerDay" type="number" min="1" value="${autoCfg.maxSpendPerDay}">
          <small>Dotyczy zakupów potrzebnych do produkcji.</small>
        </label>
      </div>

      <details class="section advanced-box">
        <summary>Ustawienia autonomiczne i sprzedaż</summary>
        <div class="settings-grid" style="margin-top:10px">
          <label>Cykl decyzyjny (sek.)<input data-auto="cycleSeconds" type="number" min="10" max="600" value="${autoCfg.cycleSeconds}"></label>
          <label>Bazowy limit wydatku / cykl<input data-auto="maxSpendPerCycle" type="number" min="1" value="${autoCfg.maxSpendPerCycle}"><small>Miękki limit. Profit-aware może go przekroczyć dla nadal opłacalnego craftu.</small></label>
          <label><span><input data-auto="profitAwareCycleOverride" type="checkbox" ${autoCfg.profitAwareCycleOverride?'checked':''}> Profit-aware: przekraczaj limit cyklu, jeśli craft nadal spełnia zysk i zysk/h</span></label>
          <label>Maks. pojedynczy zakup profit-aware<input data-auto="profitAwareMaxSingleBuy" type="number" min="1" value="${Number(autoCfg.profitAwareMaxSingleBuy||15000)}"></label>
          <label>Anti-stall zakupów — prób przed zmianą receptury<input data-auto="purchaseStallLimit" type="number" min="2" max="10" value="${Number(autoCfg.purchaseStallLimit||3)}"></label>
          <label>Anti-stall — blokada receptury (min)<input data-auto="purchaseStallMinutes" type="number" min="1" max="120" value="${Number(autoCfg.purchaseStallMinutes||10)}"></label>
          <label>Dokładność optymalizatora<input data-auto="optimizerBeamWidth" type="number" min="120" max="1200" value="${autoCfg.optimizerBeamWidth}"></label>
          <label>Liczba kandydatów planu<input data-auto="optimizerCandidateLimit" type="number" min="12" max="40" value="${autoCfg.optimizerCandidateLimit}"></label>
          <label>Pełna analiza TOP receptur<input data-auto="optimizerShortlist" type="number" min="3" max="12" value="${autoCfg.optimizerShortlist}"></label>
          <label>Pamiętaj ostatnią cenę składnika (dni)<input data-auto="historicalPriceMaxAgeDays" type="number" min="1" max="180" value="${autoCfg.historicalPriceMaxAgeDays}"></label>
          <label>Maks. wartość rzeczy z ekwipunku<input data-auto="maxInventoryDismantleValue" type="number" min="0" value="${autoCfg.maxInventoryDismantleValue}"></label>
          <label>Maks. rzeczy z ekwipunku / cykl<input data-auto="maxInventoryAddsPerCycle" type="number" min="1" max="9" value="${autoCfg.maxInventoryAddsPerCycle}"></label>
          <label><span><input data-auto="autoUseInventoryDismantle" type="checkbox" ${autoCfg.autoUseInventoryDismantle?'checked':''}> Najpierw używaj bezpiecznego ekwipunku</span></label>
          <label><span><input data-auto="strategicStockEnabled" type="checkbox" ${autoCfg.strategicStockEnabled?'checked':''}> Magazyn strategiczny materiałów</span></label>
          <label>Ile cykli produkcji trzymać na zapas<input data-auto="strategicStockCycles" type="number" min="1" max="20" value="${autoCfg.strategicStockCycles}"></label>
          <label>Ile TOP receptur buduje magazyn<input data-auto="strategicTopRecipes" type="number" min="1" max="8" value="${autoCfg.strategicTopRecipes}"></label>
          <label>Tryb progów magazynu<select data-auto="strategicStockLevelsMode">
            <option value="auto" ${autoCfg.strategicStockLevelsMode==='auto'?'selected':''}>AUTO — wyliczaj z receptur</option>
            <option value="manual" ${autoCfg.strategicStockLevelsMode==='manual'?'selected':''}>RĘCZNE — użyj moich wartości</option>
          </select></label>
          <label>Minimum AUTO (% celu)<input data-auto="strategicMinRatio" type="number" min="0.1" max="1" step="0.05" value="${autoCfg.strategicMinRatio}"></label>
          <label>Maksimum AUTO (% celu)<input data-auto="strategicMaxRatio" type="number" min="1" max="3" step="0.1" value="${autoCfg.strategicMaxRatio}"></label>
          <label>Budżet magazynu / cykl<input data-auto="strategicSpendPerCycle" type="number" min="0" value="${autoCfg.strategicSpendPerCycle}"></label>
          <label>Budżet magazynu / dzień<input data-auto="strategicSpendPerDay" type="number" min="0" value="${autoCfg.strategicSpendPerDay}"></label>
          <label>Okazja cenowa (% ceny odniesienia)<input data-auto="strategicBargainPct" type="number" min="0.1" max="1.2" step="0.05" value="${autoCfg.strategicBargainPct}"></label>
          <label><span><input data-auto="strategicExtraIngredients" type="checkbox" ${autoCfg.strategicExtraIngredients?'checked':''}> Trzymaj też chronione składniki receptur na zapas</span></label>
          <label><span><input data-auto="preferFastDismantle" type="checkbox" ${autoCfg.preferFastDismantle?'checked':''}> Uwzględniaj czas demontażu przy wyborze</span></label>
          <label>Waga czasu demontażu<input data-auto="dismantleTimeWeight" type="number" min="0" max="2" step="0.05" value="${autoCfg.dismantleTimeWeight}"></label>
          <label><span><input data-auto="avoidSurplusYields" type="checkbox" ${autoCfg.avoidSurplusYields?'checked':''}> Unikaj zbędnych produktów ubocznych</span></label>
          <label>Maks. zakupów / cykl<input data-auto="maxBuysPerCycle" type="number" min="1" max="10" value="${autoCfg.maxBuysPerCycle}"></label>
          <label>Dopuszczalny wzrost ceny wejścia %<input data-auto="maxInputPriceDriftPct" type="number" min="0" max="200" value="${autoCfg.maxInputPriceDriftPct}"></label>
          <label>Limit zł/1 odpad<input data-auto="maxCostPerOdpady" type="number" min="0" value="${autoCfg.maxCostPerOdpady}"></label>
          <label>Wybór produktu<select data-auto="targetMetric">
            <option value="profitHour" ${autoCfg.targetMetric==='profitHour'?'selected':''}>największy prawdziwy zysk/h</option>
            <option value="profit" ${autoCfg.targetMetric==='profit'?'selected':''}>największy zysk/szt.</option>
          </select></label>
          <label>Strategia ceny sprzedaży<select data-auto="listingStrategy">
            <option value="smart" ${autoCfg.listingStrategy==='smart'?'selected':''}>SMART — omijaj pojedyncze zaniżenia</option>
            <option value="undercut1" ${autoCfg.listingStrategy==='undercut1'?'selected':''}>1 zł poniżej najtańszej</option>
            <option value="match" ${autoCfg.listingStrategy==='match'?'selected':''}>taka sama jak najtańsza</option>
          </select></label>
          <label>Maks. aktywnych ofert tego samego produktu<input data-auto="maxSameProductListings" type="number" min="1" max="10" value="${autoCfg.maxSameProductListings}"><small>Domyślnie 2 — spójne z limitem ekspozycji produktu.</small></label>
          <label><span><input data-auto="autoRepriceListings" type="checkbox" ${autoCfg.autoRepriceListings?'checked':''}> Automatycznie obniżaj stare, mocno zawyżone oferty Pomagiera</span></label>
          <label>Obniż cenę gdy oferta jest ponad rynek o %<input data-auto="repriceOverMarketPct" type="number" min="1" max="200" value="${autoCfg.repriceOverMarketPct}"></label>
          <label>Minimalny wiek oferty do korekty (min)<input data-auto="repriceMinAgeMinutes" type="number" min="0" max="10080" value="${autoCfg.repriceMinAgeMinutes}"></label>
          <label>Cooldown kolejnej korekty (min)<input data-auto="repriceCooldownMinutes" type="number" min="1" max="10080" value="${autoCfg.repriceCooldownMinutes}"></label>
          <label>Maks. sztuk tego samego produktu łącznie<input data-auto="maxSameProductExposure" type="number" min="1" max="10" value="${autoCfg.maxSameProductExposure}"><small>Liczone fizycznie: produkcja + oczekujące + aktywne oferty, bez podwójnego liczenia.</small></label>
          <label>Zostaw wolnych slotów bazaru<input data-auto="reserveListingSlots" type="number" min="0" max="9" value="${autoCfg.reserveListingSlots}"></label>
          <label><span><input data-auto="autoBuy" type="checkbox" ${autoCfg.autoBuy?'checked':''}> Automatyczny zakup</span></label>
          <label><span><input data-auto="autoDismantle" type="checkbox" ${autoCfg.autoDismantle?'checked':''}> Automatyczny demontaż</span></label>
          <label><span><input data-auto="autoCraft" type="checkbox" ${autoCfg.autoCraft?'checked':''}> Automatyczna produkcja</span></label>
          <label><span><input data-auto="autoCollect" type="checkbox" ${autoCfg.autoCollect?'checked':''}> Automatyczny odbiór</span></label>
          <label><span><input data-auto="autoSell" type="checkbox" ${autoCfg.autoSell?'checked':''}> Automatyczna sprzedaż</span></label>
          <label><span><input data-auto="localAiEnabled" type="checkbox" ${autoCfg.localAiEnabled?'checked':''}> Połącz z lokalnym AI Brain</span></label>
          <label><span><input data-auto="localAiInfluenceEconomy" type="checkbox" ${autoCfg.localAiInfluenceEconomy?'checked':''}> AI Brain wybiera recepturę spośród bezpiecznych kandydatów</span></label>
          <label><span><input data-auto="localAiAllowGameActions" type="checkbox" ${autoCfg.localAiAllowGameActions?'checked':''}> AI Brain może wykonywać dozwolone akcje gry w LIVE</span></label>
          <label>Kontakt z AI co (s)<input data-auto="localAiIntervalSeconds" type="number" min="5" max="300" value="${autoCfg.localAiIntervalSeconds}"></label>
          <label>Pełny stan gry odświeżaj co (s)<input data-auto="localAiWorldRefreshSeconds" type="number" min="30" max="600" value="${autoCfg.localAiWorldRefreshSeconds}"></label>
          <label><span><input data-auto="localAiMenelMode" type="checkbox" ${autoCfg.localAiMenelMode?'checked':''}> AI obsługuje MenelMode</span></label>
          <label><span><input data-auto="localAiMenelCompleteNow" type="checkbox" ${autoCfg.localAiMenelCompleteNow?'checked':''}> Zezwól AI na MenelMode „zakończ teraz” za walutę premium</span></label>
          <label><span><input data-auto="localAiHustling" type="checkbox" ${autoCfg.localAiHustling?'checked':''}> AI obsługuje kombinowanie (Hustling)</span></label>
          <label>Sesja kombinowania do nauki (min)<input data-auto="localAiHustleSessionMinutes" type="number" min="15" max="720" value="${autoCfg.localAiHustleSessionMinutes}"></label>
          <label><span><input data-auto="localAiNpc" type="checkbox" disabled> AI atakuje opłacalne NPC <b>(TYMCZASOWO OFF)</b></span></label>
          <label>Rezerwa energii po NPC<input data-auto="localAiNpcEnergyReserve" type="number" min="0" max="1000" value="${autoCfg.localAiNpcEnergyReserve}"></label>
          <label><span><input data-auto="localAiTravel" type="checkbox" ${autoCfg.localAiTravel?'checked':''}> AI może podróżować między dzielnicami</span></label>
          <label><span><input data-auto="localAiDistrictSweep" type="checkbox" ${autoCfg.localAiDistrictSweep?'checked':''}> Najpierw dokończ wszystkie białe dzielnice MenelMode, dopiero potem kombinowanie</span></label>
          <label><span><input data-auto="localAiFreeTravelSpeedup" type="checkbox" ${autoCfg.localAiFreeTravelSpeedup?'checked':''}> Darmowo kończ podróż na gapę, gdy serwer pokaże próg ≤5 min</span></label>
          <label><span><input data-auto="localAiInventoryGuardian" type="checkbox" ${autoCfg.localAiInventoryGuardian?'checked':''}> Strażnik plecaka: sprawdzaj świeże EQ po MenelMode i przed podróżą</span></label>
          <label><span><input data-auto="localAiDismantleDistrictLoot" type="checkbox" ${autoCfg.localAiDismantleDistrictLoot?'checked':''}> Nowy łup z dzielnic może iść do opłacalnego demontażu</span></label>
          <label><span><input data-auto="localAiMoveOverflowToMelina" type="checkbox" ${autoCfg.localAiMoveOverflowToMelina?'checked':''}> Przeciążony plecak: przenoś bezpieczne rzeczy do rupieciarni</span></label>
          <label><span><input data-auto="localAiMelinaFirst" type="checkbox" ${autoCfg.localAiMelinaFirst?'checked':''}> MELINA-FIRST: jeśli jest miejsce, opróżniaj plecak do rupieciarni</span></label>
          <label><span>Rupieciarnia: <b>wypełniaj do pełna</b></span><small>Brak sztucznego zapasu. Pomagier przenosi wszystko, co gra pozwala przenieść, aż serwer zgłosi brak miejsca.</small></label>
          <label><span><input data-auto="localAiMelinaReturnForCraft" type="checkbox" ${autoCfg.localAiMelinaReturnForCraft?'checked':''}> Wyjmuj potrzebne składniki z rupieciarni przed craftem zamiast kupować</span></label>
          <label><span><input data-auto="localAiMelinaReturnForSale" type="checkbox" ${autoCfg.localAiMelinaReturnForSale?'checked':''}> Wyjmuj wytworzone produkty z rupieciarni przed wystawieniem</span></label>
          <label><span><input data-auto="localAiMelinaReturnForCollections" type="checkbox" ${autoCfg.localAiMelinaReturnForCollections?'checked':''}> Wyjmuj potrzebne przedmioty przed oddaniem do kolekcji</span></label>
          <label>Dodatkowy zapas slotów w plecaku<input data-auto="localAiInventoryReserveSlots" type="number" min="0" max="10" value="${Number(autoCfg.localAiInventoryReserveSlots ?? 4)}"><small>Nie dotyczy rupieciarni. MenelMode ma twardo 1 wolny slot przed START; podróż nie wymaga zapasu. To ustawienie dotyczy pozostałego porządkowania plecaka.</small></label>
          <label>Antypętla — maks. identycznych błędów<input data-auto="localAiRepeatErrorLimit" type="number" min="2" max="10" value="${Number(autoCfg.localAiRepeatErrorLimit||3)}"></label>
          <label>Watchdog bezczynności (min)<input data-auto="localAiIdleRecoveryMinutes" type="number" min="5" max="120" value="${Number(autoCfg.localAiIdleRecoveryMinutes||12)}"></label>
          <label><span><input data-auto="localAiExploreDistricts" type="checkbox" ${autoCfg.localAiExploreDistricts?'checked':''}> AI eksploruje dzielnice, żeby się ich nauczyć</span></label>
          <label><span><input data-auto="localAiSellCans" type="checkbox" ${autoCfg.localAiSellCans?'checked':''}> AI sprzedaje puszki</span></label>
          <label>Sprzedawaj / optymalizuj od liczby puszek<input data-auto="localAiSellCansMin" type="number" min="1" value="${autoCfg.localAiSellCansMin}"></label>
          <label>Docelowa cena puszki<input data-auto="localAiCanTargetPrice" type="number" min="0.01" max="0.15" step="0.01" value="${Number(autoCfg.localAiCanTargetPrice||0.15).toFixed(2)}"> zł (maks. gry 0,15 zł)</label>
          <label>Minimalny zysk z podróży po lepszą cenę puszek<input data-auto="localAiTravelMinCanGain" type="number" min="0" value="${autoCfg.localAiTravelMinCanGain}"></label>
          <label><span><input data-auto="localAiCollections" type="checkbox" ${autoCfg.localAiCollections?'checked':''}> AI uzupełnia tanie kolekcje</span></label>
          <label>Maks. wartość przedmiotu oddawanego do kolekcji<input data-auto="localAiCollectionMaxItemValue" type="number" min="0" value="${autoCfg.localAiCollectionMaxItemValue}"></label>
          <label><span><input data-auto="localAiFavors" type="checkbox" ${autoCfg.localAiFavors?'checked':''}> AI może używać tanich kart przysług</span></label>
          <label>Maks. wartość premium karty używanej automatycznie<input data-auto="localAiFavorMaxPremiumValue" type="number" min="0" max="1000" value="${autoCfg.localAiFavorMaxPremiumValue}"></label>
          <label><span><input data-auto="localAiObserveRaids" type="checkbox" ${autoCfg.localAiObserveRaids?'checked':''}> AI uczy się napadów gangu i rekomenduje cel</span></label>
          <label><span><input data-auto="localAiTasks" type="checkbox" ${autoCfg.localAiTasks?'checked':''}> AI analizuje zadania dzienne/tygodniowe</span></label>
          <label><span><input data-auto="localAiGarden" type="checkbox" ${autoCfg.localAiGarden?'checked':''}> OGRÓD AI: obserwuj 4 grządki i ucz się realnego tempa wzrostu</span></label>
          <label><span><input data-auto="localAiGardenResearch" type="checkbox" ${autoCfg.localAiGardenResearch?'checked':''}> Ogród LAB: testuj różne słońce / wodę / pH i zawężaj optimum</span></label>
          <label><span><input data-auto="localAiGardenAutoSow" type="checkbox" ${autoCfg.localAiGardenAutoSow?'checked':''}> Automatycznie siej Młode ziemniaki — mają pierwszeństwo przed innymi roślinami</span></label>
          <label><span><input data-auto="localAiGardenAutoBuySeeds" type="checkbox" ${autoCfg.localAiGardenAutoBuySeeds?'checked':''}> Automatycznie kup brakujące Sadzeniaczki do wszystkich wolnych grządek</span><small>Kupuje tylko brakującą liczbę za zwykłe pieniądze; nie używa Złotych Zębów.</small></label>
          <label><span><input data-auto="localAiGardenAutoHarvest" type="checkbox" ${autoCfg.localAiGardenAutoHarvest?'checked':''}> Automatycznie zbieraj dojrzały plon</span></label>
          <label>Ogród — odświeżaj co (s)<input data-auto="localAiGardenPollSeconds" type="number" min="30" max="600" value="${Number(autoCfg.localAiGardenPollSeconds||60)}"></label>
          <label><span><input data-auto="localAiUseLocalLlmAdvice" type="checkbox" ${autoCfg.localAiUseLocalLlmAdvice?'checked':''}> Lokalny LLM może recenzować decyzje Brain</span></label>
          <label><span><input data-auto="selfLearningEnabled" type="checkbox" ${autoCfg.selfLearningEnabled?'checked':''}> Samouczenie w samym skrypcie</span></label>
          <label>Siła uczenia (0–1)<input data-auto="learningStrength" type="number" min="0" max="1" step="0.05" value="${autoCfg.learningStrength}"></label>
          <label>Minimalna liczba wyników / recepturę<input data-auto="learningMinSamples" type="number" min="1" max="20" value="${autoCfg.learningMinSamples}"></label>
          <label>Eksploracja nowych receptur (%)<input data-auto="learningExplorationPct" type="number" min="0" max="15" step="0.5" value="${autoCfg.learningExplorationPct}"></label>
          <label>Maks. korekta AI (%)<input data-auto="learningMaxAdjustmentPct" type="number" min="0" max="80" value="${autoCfg.learningMaxAdjustmentPct}"></label>
          <label><span><input data-auto="recoveryEnabled" type="checkbox" ${autoCfg.recoveryEnabled?'checked':''}> Samonaprawianie sesji / sieci / restartu</span></label>
          <label>Pierwsza ponowna próba (s)<input data-auto="recoveryBaseSeconds" type="number" min="10" max="600" value="${autoCfg.recoveryBaseSeconds}"></label>
          <label>Maks. odstęp prób (s)<input data-auto="recoveryMaxSeconds" type="number" min="30" max="1800" value="${autoCfg.recoveryMaxSeconds}"></label>
          <label>Reload po ilu błędach<input data-auto="recoveryReloadAfterFailures" type="number" min="1" max="10" value="${autoCfg.recoveryReloadAfterFailures}"></label>
          <label>Maks. awaryjnych reloadów / 30 min<input data-auto="recoveryMaxReloads" type="number" min="0" max="10" value="${autoCfg.recoveryMaxReloads}"></label>
          <label>Timeout jednego requestu (s)<input data-auto="requestTimeoutSeconds" type="number" min="8" max="120" value="${autoCfg.requestTimeoutSeconds}"></label>
          <label>Blokada POST po niepewnej odpowiedzi (s)<input data-auto="writeSafetyHoldSeconds" type="number" min="20" max="600" value="${autoCfg.writeSafetyHoldSeconds}"></label>
        </div>
        <div class="toolbar" style="margin-top:10px">
          <button data-act="auto-test">Test połączenia</button>
          <button data-act="auto-run-once">1 cykl teraz</button>
          <button data-act="auto-clear-log">Wyczyść log</button>
        </div>
      </details>

      ${(()=>{
        const sp=state.auto.strategicPlan || strategicStockPlan();
        const rr=Object.values(sp.resources||{});
        return `
          <div class="section-title">Magazyn strategiczny</div>
          <div class="stock-grid section">
            ${rr.map(x=>`
              <div class="stock-card ${stockTierForRow(x)}">
                <span>${esc(RESOURCE_LABELS_V4[x.key]||x.key)} • ${stockTierLabel(stockTierForRow(x))}</span>
                <b>${fmt(x.actual)}${x.pending>0?` + ${fmt(x.pending)}`:''} / ${fmt(x.target)}</b>
                <small>K ${fmt(x.critical)} • min ${fmt(x.min)} • cel ${fmt(x.target)} • max ${fmt(x.max)}</small>
              </div>
            `).join('')}
          </div>
          <div class="section stock-level-editor">
            <div class="stock-editor-head">
              <div>
                <b>Progi magazynu materiałów</b>
                <div class="sub">
                  Krytyczny = najwyższy priorytet • Minimum = aktywne uzupełnianie •
                  Cel = uzupełnianie przy okazji • Maksimum = nie gromadź więcej.
                </div>
              </div>
              <div class="toolbar">
                <select data-auto="strategicStockLevelsMode">
                  <option value="auto" ${autoCfg.strategicStockLevelsMode==='auto'?'selected':''}>AUTO</option>
                  <option value="manual" ${autoCfg.strategicStockLevelsMode==='manual'?'selected':''}>RĘCZNE</option>
                </select>
                <button data-act="stock-reset-manual">Reset ręcznych</button>
              </div>
            </div>

            <div class="table-wrap">
              <table class="stock-level-table">
                <thead>
                  <tr>
                    <th class="left">Surowiec</th>
                    <th>Krytyczny</th>
                    <th>Minimum</th>
                    <th>Cel</th>
                    <th>Maksimum</th>
                    <th>Stan + kolejka</th>
                  </tr>
                </thead>
                <tbody>
                  ${rr.map(x=>{
                    const manual=autoCfg.strategicManualLevels?.[x.key]||{};
                    const disabled=autoCfg.strategicStockLevelsMode!=='manual'?'disabled':'';
                    const value=(level)=>{
                      const v=manual[level];
                      return Number.isFinite(Number(v)) ? Number(v) : Number(x.autoLevels?.[level]??x[level]??0);
                    };
                    return `
                      <tr>
                        <td class="left"><b>${esc(RESOURCE_LABELS_V4[x.key]||x.key)}</b></td>
                        <td><input ${disabled} data-stock-key="${x.key}" data-stock-level="critical" type="number" min="0" value="${value('critical')}"></td>
                        <td><input ${disabled} data-stock-key="${x.key}" data-stock-level="min" type="number" min="0" value="${value('min')}"></td>
                        <td><input ${disabled} data-stock-key="${x.key}" data-stock-level="target" type="number" min="0" value="${value('target')}"></td>
                        <td><input ${disabled} data-stock-key="${x.key}" data-stock-level="max" type="number" min="0" value="${value('max')}"></td>
                        <td>${fmt(x.actual)}${x.pending>0?` + ${fmt(x.pending)}`:''} = <b>${fmt(x.have)}</b></td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <div class="sub">
              W trybie RĘCZNYM skrypt automatycznie pilnuje kolejności:
              <b>Krytyczny ≤ Minimum ≤ Cel ≤ Maksimum</b>.
            </div>
          </div>

          ${sp.extras?.length?`
            <div class="section stock-extras">
              <b>Chronione składniki na zapas:</b>
              ${sp.extras.map(x=>`${esc(x.name)} ${fmt(x.have)}/${fmt(x.target)}`).join(' • ')}
            </div>`:''}
        `;
      })()}

      <div class="section-title">Aktywne produkcje Pomagiera</div>
      <div class="table-wrap"><table>
        <thead><tr><th class="left">Produkt</th><th>Status</th><th>Koszt bazowy</th><th>Cena wystawienia</th><th>Planowany zysk</th></tr></thead>
        <tbody>
          ${profitJobs.slice(-20).reverse().map(j=>`
            <tr>
              <td class="left">${esc(j.name)}</td>
              <td>${esc(j.status)}</td>
              <td>${money(j.costBasis)}</td>
              <td>${j.listPrice?money(j.listPrice):'—'}</td>
              <td>${j.expectedProfit==null?'—':money(j.expectedProfit)}</td>
            </tr>`).join('') || '<tr><td colspan="5">Brak produkcji uruchomionych przez tryb autonomiczny.</td></tr>'}
        </tbody>
      </table></div>

      <details class="section advanced-box">
        <summary>Dziennik decyzji Pomagiera</summary>
        <div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Czas</th><th>Typ</th><th class="left">Decyzja</th></tr></thead><tbody>
          ${logRows||'<tr><td colspan="3">Brak zdarzeń.</td></tr>'}
        </tbody></table></div>
      </details>
    `;
  }

  function autopilotHTML() {
    resetAutoSpendIfNeeded();

    const extAI = state.localAI || {};
    const guard = extAI.inventoryGuardian || {};
    const garden = extAI.garden || {};
    const brainDecision = extAI.decision || {};
    const next = state.auto.nextCycleAt ? Math.max(0, Math.ceil((state.auto.nextCycleAt-Date.now())/1000)) : 0;
    const live = autoCfg.enabled && !autoCfg.dryRun;
    const dry = autoCfg.enabled && autoCfg.dryRun;
    const recovering = !!(state.auto.recovery.active || recoveryResumePending);
    const modeText = recovering ? 'SAMONAPRAWA' : live ? 'AUTONOMICZNY' : dry ? 'TEST' : 'STOP';
    const modeClass = recovering ? 'warn' : live ? 'ok' : dry ? 'warn' : 'muted';

    const _craftSrv = serverCraftState();
    const activeJobs = _craftSrv.fresh
      ? _craftSrv.active
      : (profitJobs||[]).filter(j=>String(j.status||'').toLowerCase()==='crafting').length;
    const prepJobs = (profitJobs||[]).filter(j=>['planned','buying','dismantling'].includes(String(j.status||'').toLowerCase())).length;
    const readyJobs = _craftSrv.fresh
      ? _craftSrv.readyCount
      : (state.craftReady||[]).length;
    const listedJobs = Number(state.auto.activeListingCount || state.auto.activeListings?.length || 0);
    const saleWaiting = Array.isArray(saleQueue) ? saleQueue.length : 0;

    const melUsed = Number(guard.melinaSlotsUsed||0);
    const melCap = Number(guard.melinaCapacity||0);
    const melText = melCap>0 ? `${melUsed}/${melCap}${melUsed>=melCap?' • PEŁNA':''}` : '—';

    const backpackText = guard.lastAction && guard.lastAction!=='—'
      ? guard.lastAction
      : (guard.capacity>0 ? `${Number(guard.slotsUsed||0)}/${Number(guard.capacity||0)}` : '—');

    const gardenSlots = Array.isArray(garden.slots) ? garden.slots : [];
    const gardenGrowing = gardenSlots.filter(s=>String(s.status)==='growing').length;
    const gardenReady = gardenSlots.filter(s=>String(s.status)==='ready').length;
    const gardenText = garden.unlocked===false ? 'NIEDOSTĘPNY'
      : gardenSlots.length ? `${gardenGrowing} rośnie${gardenReady?` • ${gardenReady} gotowe`:''} • nasiona ${Number(garden.availableSeeds||0)}`
      : esc(garden.status||'—');

    const nowTitle = esc(state.auto.stage || (live?'PRACUJE':'STOP'));
    const nowDetail = esc(state.auto.stageDetail || state.auto.lastAction || '—');
    const aiNext = esc(brainDecision?.nextAction?.label || extAI.lastGameAction || '—');
    const aiReason = esc(brainDecision?.reason || '—');

    const notices = [];
    if (!__mgSessionTemplate) notices.push({cls:'warn',txt:'Sesja gry nie jest jeszcze gotowa — otwórz Bazar lub Warsztat.'});
    if (!extAI.connected) notices.push({cls:'warn',txt:'Brain jest offline. Pomagier nadal ma lokalne reguły, ale bez decyzji Braina.'});
    if (recovering) notices.push({cls:'warn',txt:`Samonaprawa aktywna: ${state.auto.recovery?.reason||state.auto.stageDetail||'czekam na stabilną sesję'}`});
    if (state.auto.error) notices.push({cls:'warn',txt:`Błąd: ${state.auto.error}`});
    if (melCap>0 && melUsed>=melCap) notices.push({cls:'info',txt:'Rupieciarnia jest pełna. To nie zatrzymuje Pomagiera — zwalnia miejsce dopiero, gdy konkretna akcja tego wymaga.'});

    const spendToday = Number(state.auto.spendToday || 0);
    const fees = Number(profitStats?.listingFees || 0);
    const sold = (profitJobs||[]).filter(j=>String(j.status||'').toLowerCase()==='sold').length;
    const sessionProfit=Number(sessionStats.realizedProfit||0);
    const sessionSpent=Number(sessionStats.totalSpent||0);
    const sessionRevenue=Number(sessionStats.soldRevenue||0);
    const sessionNet=sessionRevenue-sessionSpent;
    const sessionSold=Number(sessionStats.soldCount||0);
    const sessionProfitText=`${sessionProfit>=0?'+':''}${money(sessionProfit)}`;
    const sessionNetText=`${sessionNet>=0?'+':''}${money(sessionNet)}`;

    return `
      <div class="simple-hero">
        <div class="simple-state">
          <span class="simple-kicker">POMAGIER</span>
          <b class="simple-mode ${modeClass}">${modeText}</b>
          <span class="simple-sub">${__mgSessionTemplate?'Sesja gotowa':'Czekam na sesję'} • następny cykl ${next}s</span>
        </div>
        <div class="simple-actions">
          ${live
            ? `<button class="btn-stop simple-primary" data-act="auto-stop">■ STOP</button>`
            : `<button class="btn-main simple-primary" data-act="auto-live">▶ START</button>`}
          <button data-act="market-refresh">↻ Odśwież</button>
        </div>
      </div>

      ${notices.map(n=>`<div class="simple-notice ${n.cls}">${esc(n.txt)}</div>`).join('')}

      <div class="simple-coin-mode">
        <span>🪙 Dozwolone monety</span>
        <div class="simple-coin-perms">${coinPermissionControlsHTML()}</div>
        <small>Receptury bez monet są zawsze dozwolone. Zaznaczona moneta może zostać zużyta tylko wtedy, gdy wybrana opłacalna receptura jej wymaga.</small>
      </div>

      <div class="simple-current">
        <span>Co robi teraz</span>
        <b>${nowTitle}</b>
        <small>${nowDetail}</small>
      </div>

      <div class="simple-grid">
        <div class="simple-card ${extAI.connected?'good':'bad'}">
          <span>🧠 Brain</span>
          <b>${extAI.connected?'ONLINE':'OFFLINE'}</b>
          <small>${extAI.connected?`${esc(extAI.brainHealth||'OK')} • ${Number(extAI.brainDecisionMs||0)>0?Math.round(Number(extAI.brainDecisionMs))+' ms':'połączony'}`:esc(extAI.error||'brak połączenia')}</small>
        </div>
        <div class="simple-card">
          <span>🎒 Plecak / rupieciarnia</span>
          <b>${melText}</b>
          <small>${esc(backpackText)}</small>
        </div>
        <div class="simple-card">
          <span>🌱 Ogród</span>
          <b>${gardenText}</b>
          <small>${esc(garden.lastAction||garden.status||'czekam na zmianę etapu')}</small>
        </div>
        <div class="simple-card">
          <span>🏭 Produkcja / bazar</span>
          <b>${activeJobs} produkcja • ${readyJobs} gotowe</b>
          <small>${listedJobs} wystawione • ${saleWaiting} w kolejce sprzedaży</small>
        </div>
      </div>

      <div class="simple-grid simple-grid-3">
        <div class="simple-card">
          <span>🧭 Następna decyzja Brain</span>
          <b>${aiNext}</b>
          <small>${aiReason}</small>
        </div>
        <div class="simple-card ${sessionNet>=0?'good':'bad'}">
          <span>💰 Aktualna sesja</span>
          <b>Na czysto ${sessionNetText} • wydano ${money(sessionSpent)}</b>
          <small>${sessionStats.startedAt?`${sessionStats.active?'trwa':'zakończona'} ${sessionDurationText()} • ${sessionSold} sprzedaży • przychód ${money(sessionRevenue)} • marża sprzedanych ${sessionProfitText}`:'licznik ruszy po START'}</small>
          <button class="session-history-link" data-act="open-sessions">Historia 10 sesji</button>
        </div>
        <div class="simple-card">
          <span>📦 Surowce</span>
          <b>złom ${fmt(state.parts?.part_zlom||0)} • odpady ${fmt(state.parts?.part_odpady||0)}</b>
          <small>tworzywa ${fmt(state.parts?.part_tworzywa||0)} • tekstylia ${fmt(state.parts?.part_tekstylia||0)}</small>
        </div>
      </div>

      <details class="section simple-advanced">
        <summary>⚙ Zaawansowane / diagnostyka</summary>
        <div class="simple-advanced-inner">
          ${autopilotAdvancedHTML()}
        </div>
      </details>
    `;
  }

  function manualDismantleHTML(){
    const market=manualMarketRows().slice(0,200);
    const inventory=manualInventoryRows().slice(0,250);
    const view=manualPrefs.view==='inventory'?'inventory':'market';

    const marketRows=market.map(x=>`
      <tr class="${Number(manualPrefs.semiItemId)===Number(x.itemId)?'semi-selected':''}">
        <td class="left"><b>${esc(x.name)}</b><div class="sub">ID ${x.itemId} • ${esc(dismantleYieldText(x.meta))}</div></td>
        <td>${money(x.price)}</td>
        <td>${x.second==null?'—':money(x.second)}</td>
        <td>${x.odpady>0?money(x.costPerWaste):'—'}</td>
        <td>${fmt(x.time/60,1)} min</td>
        <td class="action-cell">
          ${x.protected
            ? `<span class="protected-pill" title="${esc(x.protectedReason)}">🛡 CHRONIONY</span>`
            : `
              <button data-act="semi-select" data-item="${x.itemId}">${Number(manualPrefs.semiItemId)===Number(x.itemId)?'✓ Wybrany':'Wybierz'}</button>
              <button data-act="manual-buy-one" data-item="${x.itemId}">Kup + demontaż</button>
              <button data-act="manual-buy-many" data-item="${x.itemId}">Kilka</button>
            `}
        </td>
      </tr>`).join('');

    const invRows=inventory.map(x=>`
      <tr class="${manualPrefs.semiMode==='inventory' && Number(manualPrefs.semiInventoryItemId)===Number(x.itemId) && Number(manualPrefs.semiInventoryEnhancement||0)===Number(x.enhancement)?'semi-selected':''}">
        <td class="left">
          <b>${esc(x.name)}</b>
          <div class="sub">
            ID ${x.itemId} • ${x.meta?esc(dismantleYieldText(x.meta)):'brak danych uzysku'}
            • wartość ${x.value==null?'?':money(x.value)}
          </div>
          ${!x.allowed?`<div class="protected-reason">${esc(x.policyReason)}</div>`:''}
        </td>
        <td>${fmt(x.quantity)}</td>
        <td>${x.enhancement?`+${x.enhancement}`:'0'}</td>
        <td>${x.allowed?'—':'🛡'}</td>
        <td class="action-cell">
          <button data-act="semi-select-inventory" data-item="${x.itemId}" data-enh="${x.enhancement}" data-name="${esc(x.name)}" ${!x.allowed?'disabled':''}>
            ${manualPrefs.semiMode==='inventory' && Number(manualPrefs.semiInventoryItemId)===Number(x.itemId) && Number(manualPrefs.semiInventoryEnhancement||0)===Number(x.enhancement)?'✓ Wybrany':'Wybierz'}
          </button>
          <button data-act="manual-inv-one" data-inventory="${x.inventoryId}" ${!x.allowed?'disabled':''}>Dodaj 1</button>
          ${x.quantity>1?`<button data-act="manual-inv-many" data-inventory="${x.inventoryId}" data-max="${x.quantity}" ${!x.allowed?'disabled':''}>Dodaj kilka</button>`:''}
        </td>
      </tr>`).join('');

    return `
      <div class="helper-hero">
        <div>
          <div class="helper-name">Ręczny demontaż</div>
          <div class="sub">Wybierz sam: kupić z handlu albo wziąć to, co już masz w ekwipunku.</div>
        </div>
        <div class="helper-actions"><button data-act="manual-refresh">↻ Odśwież wszystko</button></div>
      </div>

      <div class="cards mini">
        <div class="card"><div class="label">Wolne sloty</div><div class="big">${dismantleFreeSlots()}</div><div>${(state.dismantleQueue||[]).length}/${state.dismantleMaxQueueSize}</div></div>
        <div class="card"><div class="label">Odpady teraz</div><div class="big">${fmt(state.parts?.part_odpady||0)}</div></div>
        <div class="card"><div class="label">Odpady w kolejce</div><div class="big">${fmt(pendingOdpady())}</div></div>
        <div class="card"><div class="label">Status</div><div class="big">${state.manual.busy?'PRACUJĘ':'GOTOWY'}</div><div>${esc(state.manual.lastMessage||'—')}</div></div>
      </div>

      ${state.manual.lastError?`<div class="section note" style="border-color:#7a3131;background:#351f1f;color:#ffd0d0"><b>Błąd:</b> ${esc(state.manual.lastError)}</div>`:''}

      <div class="section protection-box">
        <b>🛡 Ochrona demontażu:</b>
        przedmioty potrzebne jako składniki wytwarzania są ZAWSZE chronione.
        Przedmioty z ekwipunku są dopuszczone tylko przy znanej wartości ≤ <b>${money(autoCfg.maxInventoryDismantleValue||3000)}</b>.
        Brak wyceny = brak demontażu.
      </div>

      <div class="section semi-box">
        <div class="semi-head">
          <div>
            <div class="section-title">Półautomat demontażu</div>
            <div class="sub">Ty wybierasz konkretny przedmiot. Pomagier pilnuje kolejki i dokłada następne sztuki, gdy zwalnia się miejsce.</div>
          </div>
          <div class="semi-status ${state.manual.semi.enabled?'ok':''}">
            ${state.manual.semi.enabled?'PRACUJE':'STOP'}
          </div>
        </div>

        <div class="manual-switch semi-mode-switch" style="margin-top:9px">
          <button class="${manualPrefs.semiMode==='market'?'active':''}" data-act="semi-mode-market">🛒 Z bazaru</button>
          <button class="${manualPrefs.semiMode==='inventory'?'active':''}" data-act="semi-mode-inventory">🎒 Z ekwipunku</button>
        </div>

        <div class="semi-controls ${manualPrefs.semiMode==='inventory'?'inventory-mode':''}">
          <div class="semi-selected-card">
            <span>Wybrany przedmiot</span>
            <b>${
              manualPrefs.semiMode==='inventory'
                ? (semiInventorySelection()?esc(semiInventorySelection().name):'— wybierz z ekwipunku —')
                : (semiSelectedMeta()?esc(semiSelectedMeta().name):'— wybierz z bazaru —')
            }</b>
            <small>${
              manualPrefs.semiMode==='inventory'
                ? (semiInventorySelection()?`${esc(dismantleYieldText(semiInventorySelection().meta))} • dostępne ${semiInventoryAvailableCount()} szt.`:'')
                : (semiSelectedMeta()?esc(dismantleYieldText(semiSelectedMeta())):'')
            }</small>
          </div>
          <label>
            <span>Ile sztuk zdemontować</span>
            <input data-manual="semiQty" type="number" min="1" max="500" value="${manualPrefs.semiQty}">
          </label>
          ${manualPrefs.semiMode==='market'?`
            <label>
              <span>Maks. cena / szt.</span>
              <input data-manual="semiMaxPrice" type="number" min="0" value="${manualPrefs.semiMaxPrice}">
              <small>0 = bez limitu</small>
            </label>
          `:''}
          <label>
            <span>Sprawdzaj kolejkę co</span>
            <input data-manual="semiIntervalSeconds" type="number" min="3" max="120" value="${manualPrefs.semiIntervalSeconds}">
            <small>sekund</small>
          </label>
        </div>

        <div class="toolbar semi-toolbar">
          <button class="btn-main" data-act="semi-start">▶ START półautomatu</button>
          <button class="btn-stop" data-act="semi-stop">■ STOP</button>
          <span class="sub">
            ${state.manual.semi.enabled
              ? `pozostało ${state.manual.semi.remaining} • dodano ${state.manual.semi.queued}${manualPrefs.semiMode==='market'?` • wydano ${money(state.manual.semi.spent)}`:''}`
              : esc(state.manual.semi.lastAction||'—')}
          </span>
        </div>
        ${state.manual.semi.error?`<div class="err" style="margin-top:7px">${esc(state.manual.semi.error)}</div>`:''}
      </div>

      <div class="manual-switch section">
        <button class="${view==='market'?'active':''}" data-act="manual-view-market">🛒 Kup z bazaru → demontaż</button>
        <button class="${view==='inventory'?'active':''}" data-act="manual-view-inventory">🎒 Z ekwipunku → demontaż</button>
      </div>

      ${view==='market' ? `
        <div class="section manual-full">
          <div class="section-title">Kup z bazaru → od razu demontuj</div>
          <div class="toolbar">
            <input data-manual="marketSearch" value="${esc(manualPrefs.marketSearch)}" placeholder="Nazwa lub ID">
            <select data-manual="sort">
              <option value="costPerWaste" ${manualPrefs.sort==='costPerWaste'?'selected':''}>najtańszy odpad</option>
              <option value="price" ${manualPrefs.sort==='price'?'selected':''}>najniższa cena</option>
              <option value="time" ${manualPrefs.sort==='time'?'selected':''}>najszybszy demontaż</option>
            </select>
          </div>
          <div class="sub" style="margin:7px 0">Cena jest ponownie sprawdzana dokładnie przed każdą kupowaną sztuką.</div>
          <div class="table-wrap manual-table"><table>
            <thead><tr><th class="left">Przedmiot</th><th>Cena</th><th>2. cena</th><th>zł/odpad</th><th>Czas</th><th class="action-cell">Akcja</th></tr></thead>
            <tbody>${marketRows||'<tr><td colspan="6">Brak ofert. Kliknij „Odśwież wszystko”.</td></tr>'}</tbody>
          </table></div>
        </div>
      ` : `
        <div class="section manual-full">
          <div class="section-title">Z ekwipunku → do demontażu</div>
          <div class="toolbar">
            <input data-manual="inventorySearch" value="${esc(manualPrefs.inventorySearch)}" placeholder="Szukaj w ekwipunku">
            <button data-act="manual-inventory-refresh">↻ Ekwipunek</button>
          </div>
          <div class="table-wrap manual-table"><table>
            <thead><tr><th class="left">Przedmiot</th><th>Ilość</th><th>+</th><th>Blokada</th><th class="action-cell">Akcja</th></tr></thead>
            <tbody>${invRows||'<tr><td colspan="5">Kliknij „Ekwipunek”, aby pobrać listę.</td></tr>'}</tbody>
          </table></div>
        </div>
      `}
    `;
  }

  function settingsHTML() {
    return `
      <div class="settings-grid">
        <label>ID postaci (AUTO)<input type="text" value="${__autoCharacterInfo.detected ? `${__autoCharacterInfo.id}${__autoCharacterInfo.nickname?` • ${__autoCharacterInfo.nickname}`:''}` : `${settings.characterId} • oczekiwanie na logowanie`}" disabled></label>
        <label>Tryb danych<input type="text" value="Natywny / pasywny" disabled></label>
        <label>Prowizja bazaru<input data-setting="listingFeeRate" type="number" step="0.001" min="0" max="0.5" value="${settings.listingFeeRate}"></label>
        <label>Alert: minimalny zysk craftu<input data-setting="alertBestProfit" type="number" value="${settings.alertBestProfit}"></label>
        <label>Limit rekordów historii<input data-setting="maxHistoryRows" type="number" min="100" max="20000" value="${settings.maxHistoryRows}"></label>
      </div>
      <div class="section note"><b>AUTO ACCOUNT ID:</b> ID jest pobierane z aktualnie zalogowanego konta Menelgame i nie wymaga ręcznej zmiany. Pomagier nadal nie zapisuje Authorization, cookies ani tokenów. Autopilot używa zwykłych same-origin fetch() w kontekście strony. LIVE może wydawać pieniądze w grze.</div>
      <div class="section"><button data-act="save-settings">Zapisz ustawienia</button> <button data-act="refresh">Przelicz dane</button> <button data-act="clear-native-cache">Wyczyść cache danych</button> <button data-act="reset">Przywróć ustawienia domyślne</button></div>
      <div class="sub">Wersja ${VERSION} • katalog demontażu: ${STATIC_DISMANTLE.length} przedmiotów</div>
    `;
  }

  function render() {
    const body = panel.querySelector('.content');
    const tabs = panel.querySelectorAll('.tab');
    tabs.forEach(t=>t.classList.toggle('active', t.dataset.tab===state.activeTab));
    const advBtn=panel.querySelector('[data-act="toggle-advanced-ui"]');
    if(advBtn) advBtn.textContent=advancedUiOpen?'▴ Mniej':'☰ Więcej';
    if (state.activeTab==='dashboard') body.innerHTML = dashboardHTML();
    if (state.activeTab==='crafting') body.innerHTML = craftingHTML();
    if (state.activeTab==='resources') body.innerHTML = resourcesHTML();
    if (state.activeTab==='watch') body.innerHTML = watchHTML();
    if (state.activeTab==='sessions') body.innerHTML = sessionsHTML();
    if (state.activeTab==='history') body.innerHTML = historyHTML();
    if (state.activeTab==='autopilot') body.innerHTML = autopilotHTML();
    if (state.activeTab==='manual') body.innerHTML = manualDismantleHTML();
    if (state.activeTab==='pvpLab') body.innerHTML = pvpLabHTML();
    if (state.activeTab==='bossLab') body.innerHTML = bossLabHTML();
    if (state.activeTab==='settings') body.innerHTML = settingsHTML();
    updateHeader();
  }

  function updateHeader() {
    const el = panel.querySelector('.status-line');
    const last = state.lastUpdated ? new Date(state.lastUpdated).toLocaleTimeString('pl-PL') : '—';
    const autoNext = autoCfg.enabled && state.auto.nextCycleAt ? Math.max(0,Math.ceil((state.auto.nextCycleAt-Date.now())/1000)) : null;
    const marketNext = !autoCfg.enabled && state.marketNextAt ? Math.max(0,Math.ceil((state.marketNextAt-Date.now())/1000)) : null;
    const helper = autoCfg.enabled ? (autoCfg.dryRun ? 'TEST' : 'PRACUJE') : 'STOP';
    el.innerHTML =
      `Sesja: <b class="${__mgSessionTemplate?'ok':'warn'}">${__mgSessionTemplate?'GOTOWA':'CZEKA'}</b>` +
      ` • Pomagier: <b class="${autoCfg.enabled&&!autoCfg.dryRun?'ok':autoCfg.enabled?'warn':''}">${helper}</b>` +
      `${autoCfg.enabled?` • etap: <b>${esc(state.auto.stage||'—')}</b>`:''}` +
      `${autoNext==null?'':` • następny cykl ${autoNext}s`}` +
      ` • ceny: <b>${last}</b>${marketNext==null?'':` • odświeżenie za ${marketNext}s`}` +
      `${state.manual.semi.enabled?` • półautomat: <b class="ok">${state.manual.semi.remaining} szt.</b>`:''}` +
      ` • odpady: <b>${fmt(state.parts?.part_odpady||0)}</b> + <b>${fmt(pendingOdpady())}</b> w demontażu`;
  }

  function saveSettingsFromUI() {
    panel.querySelectorAll('[data-setting]').forEach(el=>{
      const key=el.dataset.setting;
      if (el.type==='checkbox') settings[key]=!!el.checked;
      else if (el.type==='number') settings[key]=Number(el.value);
      else settings[key]=el.value;
    });
    settings.refreshSeconds = clamp(Number(settings.refreshSeconds||60), 15, 900);
    syncLegacyCoinModeFromPermissions();
    settings.noSilverGold = !settings.coinAllowSilver && !settings.coinAllowGold; // legacy compatibility only
    saveJSON(K.settings, settings);
  }

  async function refreshAll(manual=false) {
    // v2.2 nie wykonuje własnych uwierzytelnionych zapytań.
    // Przelicza jedynie dane przechwycone z normalnych odpowiedzi gry.
    state.busy = true;
    try {
      if (state.prices.size) buildResourceOptions();
      if (state.recipes.length) computeRankings();
    } finally {
      state.busy = false;
      state.nextRefreshAt = 0;
      render();
    }
  }

  function exportCSV() {
    if (!history.length) return alert('Brak historii.');
    const rows=[['timestamp','id','name','min_price','min_price_2','total_quantity','listing_count'],...history.map(x=>[x.ts,x.id,x.name,x.price??'',x.price2??'',x.qty??'',x.listings??''])];
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\r\n');
    downloadBlob('\ufeff'+csv, `pomagier_by_don_historia_${new Date().toISOString().replaceAll(':','-')}.csv`, 'text/csv;charset=utf-8');
  }

  function exportSnapshot() {
    const ranking = sortRankings(filteredRankings()).map(x=>({
      id:x.recipe.result_item_id,name:x.recipe.item_name,price:x.outPrice,secondPrice:x.outSecond,net:x.net,
      estimatedFullCost:x.unknown?null:Math.round(x.fullCost*100)/100,estimatedCashCost:x.missingUnknown?null:Math.round(x.cashCost*100)/100,
      estimatedProfit:x.profit==null?null:Math.round(x.profit*100)/100,estimatedProfitHour:x.profitHour==null?null:Math.round(x.profitHour*100)/100,estimatedCashProfitHour:x.cashProfitHour==null?null:Math.round(x.cashProfitHour*100)/100,
      roi:x.roi==null?null:Math.round(x.roi*100)/100,craftSeconds:x.craftSec,learned:x.learned,canCraft:x.canCraft,coinTypes:x.coinTypes||[],coinFilterBlocked:x.forbidden,coinProductionMode:currentCoinProductionMode(),coinPermissions:currentCoinPermissions(),forbiddenCoins:x.forbidden
    }));
    const cheapest = Object.fromEntries(RESOURCE_KEYS.map(k=>[k,(state.resourceOptions[k]||[]).slice(0,10).map(x=>({itemId:x.itemId,name:x.name,price:x.price,yield:x.yield,costPer:x.costPer,effectiveSeconds:x.effectiveSec,collections:x.collections}))]));
    const watched = settings.watch.map(w=>({watch:w,market:getPrice(w.id,0)||null,delta:deltaFor(w.id,0)}));
    const obj={version:VERSION,generatedAt:nowIso(),characterId:settings.characterId,characterIdSource:__autoCharacterInfo.detected?'menelgame_user.character.id':'fallback',characterNickname:__autoCharacterInfo.nickname||null,dismantleSpeed:state.dismantleSpeed,craftSpeed:state.craftSpeed,parts:state.parts,purchaseLimit:state.purchaseLimit,watched,cheapestResources:cheapest,ranking,profitPipeline:{jobs:profitJobs,saleQueue,stats:profitStats,sessionStats,sessionHistory,stage:state.auto.stage,stageDetail:state.auto.stageDetail,activeListings:state.auto.activeListings,serverCraft:serverCraftState()},selfLearning:{enabled:autoCfg.selfLearningEnabled,summary:learningSummary(),learner},localAI:{connected:state.localAI.connected,decision:state.localAI.decision,world:state.localAI.world,lastGameAction:state.localAI.lastGameAction,lastGameActionAt:state.localAI.lastGameActionAt,worldLastWriteAt:state.localAI.worldLastWriteAt,worldActionGate:state.localAI.worldActionGate,menelClearSync:state.localAI.menelClearSync,menelLearn:state.localAI.menelLearn,menelCloseLearned,melinaLearn:state.localAI.melinaLearn,melinaAddLearned,inventoryGuardian:state.localAI.inventoryGuardian,garden:state.localAI.garden,actionGuard:state.localAI.actionGuard,districtSweep:state.localAI.districtSweep,brainStats:state.localAI.brainStats,pendingEvents:localAiEvents},pvpLab:{config:pvpLabCfg,summary:pvpLabSummary(),current:pvpLab.current,skillTrees:pvpLab.skillTrees,defenseSnapshots:pvpLab.defenseSnapshots,optimizer:pvpLab.optimizer,battles:pvpLab.battles,opponentRolls:pvpLab.opponentRolls,capabilities:pvpLab.capabilities,errors:pvpLab.errors},bossLab:{config:bossLabCfg,bosses:bossLab.bosses,battles:bossLab.battles,optimizers:bossLab.optimizers,errors:bossLab.errors,lastCaptureAt:bossLab.lastCaptureAt,syncStatus:bossLab.syncStatus}};
    downloadBlob(JSON.stringify(obj,null,2), `pomagier_by_don_snapshot_${new Date().toISOString().replaceAll(':','-')}.json`, 'application/json');
  }

  function downloadBlob(content, name, type) {
    if (ANDROID_APP && window.AndroidBridge && typeof window.AndroidBridge.saveTextFile === 'function') {
      try { window.AndroidBridge.saveTextFile(String(name||'pomagier_export.txt'), String(content??'')); return; } catch (_) {}
    }
    const blob=new Blob([content],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  }

  function makePanel() {
    const el=document.createElement('div'); el.id='mg-mega-premium';
    el.innerHTML=`<style>
      #mg-mega-premium{position:fixed;top:70px;right:12px;z-index:2147483646;width:min(1180px,calc(100vw - 24px));height:min(790px,calc(100vh - 85px));background:rgba(15,15,17,.985);color:#eee;border:1px solid #555;border-radius:12px;box-shadow:0 15px 50px rgba(0,0,0,.6);font:13px/1.35 Arial,sans-serif;overflow:hidden;resize:none;min-width:560px;min-height:320px;max-width:calc(100vw - 8px);max-height:calc(100vh - 8px)}
      #mg-mega-premium *{box-sizing:border-box} #mg-mega-premium.loading{opacity:.93}
      #mg-mega-premium .head{height:46px;display:flex;align-items:center;gap:10px;padding:7px 10px;background:#222428;border-bottom:1px solid #3b3b3b;cursor:move;user-select:none}
      #mg-mega-premium .title{font-weight:800;font-size:14px;white-space:nowrap}.badge{font-size:10px;background:#3f3f46;border-radius:9px;padding:2px 6px;color:#ddd}
      #mg-mega-premium .head .spacer{flex:1} #mg-mega-premium button,#mg-mega-premium input,#mg-mega-premium select{font:inherit;border-radius:6px;border:1px solid #5a5a5a;background:#171717;color:#eee;padding:5px 7px}
      #mg-mega-premium button{background:#34363b;cursor:pointer} #mg-mega-premium button:hover{background:#464950}
      #mg-mega-premium .tabs{display:flex;gap:3px;padding:6px 8px;background:#1b1c20;border-bottom:1px solid #343434;overflow:auto}
      #mg-mega-premium .tab{border:0;background:transparent;padding:6px 10px;color:#bbb;white-space:nowrap} #mg-mega-premium .tab.active{background:#34363b;color:#fff}
      #mg-mega-premium .status-line{padding:5px 10px;background:#111215;color:#aaa;border-bottom:1px solid #292929;font-size:11px}
      #mg-mega-premium .content{height:calc(100% - 112px);overflow:auto;overflow-x:hidden;padding:10px}
      #mg-mega-premium .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px} #mg-mega-premium .cards.mini{grid-template-columns:repeat(6,minmax(0,1fr))}
      #mg-mega-premium .card{background:#202226;border:1px solid #34363b;border-radius:9px;padding:9px;min-width:0}.label{color:#999;font-size:11px;margin-bottom:4px}.big{font-size:18px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #mg-mega-premium .section{margin-top:12px}.section-title{font-weight:800;margin:10px 0 6px}.note{background:#332f1f;border:1px solid #5d5429;padding:8px;border-radius:8px;color:#e9dfac}.chips{background:#202226;border:1px solid #34363b;border-radius:8px;padding:8px}
      #mg-mega-premium .table-wrap{overflow:auto;border:1px solid #303238;border-radius:8px} #mg-mega-premium table{width:100%;border-collapse:collapse;min-width:900px} #mg-mega-premium th,#mg-mega-premium td{padding:6px 7px;border-bottom:1px solid #2f3136;text-align:right;white-space:nowrap} #mg-mega-premium th{position:sticky;top:0;background:#27292e;z-index:2;color:#ccc;font-size:11px} #mg-mega-premium th:first-child,#mg-mega-premium td.left{text-align:left}
      #mg-mega-premium tr:hover td{background:#23252a}.profit td{background:rgba(30,80,45,.14)}.loss td{background:rgba(100,30,30,.11)}
      #mg-mega-premium .ok{color:#8ee58e;font-weight:700}.warn{color:#ffd36b}.err,.down{color:#ff8e8e}.up{color:#8ee58e}.muted,.sub{color:#8f9299;font-size:11px}.empty{padding:25px;text-align:center;color:#999}
      #mg-mega-premium .toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;background:#202226;border:1px solid #34363b;padding:7px;border-radius:8px}.toolbar label{display:flex;align-items:center;gap:5px}.toolbar input[type=checkbox]{width:auto}
      #mg-mega-premium .flag{font-size:10px;background:#594f28;border-radius:7px;padding:2px 5px;color:#ffe999}.flag.danger{background:#662f2f;color:#ffd0d0}.detail-box{margin-top:12px;border-top:2px solid #40434b;padding-top:5px}
      #mg-mega-premium .add-row{display:grid;grid-template-columns:100px 1fr auto auto;gap:6px;margin-top:8px}.tiny{width:85px}.settings-grid{display:grid;grid-template-columns:repeat(2,minmax(240px,1fr));gap:10px}.settings-grid label{display:grid;gap:4px;color:#bbb}
      #mg-mega-premium .helper-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;background:#202226;border:1px solid #3b3e45;border-radius:10px;padding:14px;margin-bottom:10px}
      #mg-mega-premium .helper-name{font-size:21px;font-weight:900}.helper-status{font-size:28px;font-weight:900;margin:2px 0}
      #mg-mega-premium .helper-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      #mg-mega-premium .btn-main{background:#28643a;border-color:#3a8b50;font-weight:800;padding:8px 14px}.btn-main:hover{background:#347d49}
      #mg-mega-premium .btn-stop{background:#672f2f;border-color:#984242;font-weight:800;padding:8px 14px}.btn-stop:hover{background:#7f3939}
      #mg-mega-premium .simple-settings{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      #mg-mega-premium .simple-settings label{display:grid;gap:5px;background:#202226;border:1px solid #34363b;border-radius:8px;padding:9px}
      #mg-mega-premium .simple-settings small{color:#8f9299}.advanced-box{background:#18191c;border:1px solid #34363b;border-radius:8px;padding:8px}
      #mg-mega-premium details>summary{cursor:pointer;font-weight:700;color:#c9cbd0}
      #mg-mega-premium .manual-full{width:100%;min-width:0}
      #mg-mega-premium .manual-switch{display:flex;gap:8px;position:sticky;top:0;z-index:8;background:#151619}
      #mg-mega-premium .manual-switch button{padding:8px 12px;font-weight:700}
      #mg-mega-premium .manual-switch button.active{background:#4a4d55;color:#fff;border-color:#777}
      #mg-mega-premium .manual-table{max-height:none;overflow:auto;width:100%}
      #mg-mega-premium .manual-table table{font-size:12px;min-width:760px;width:100%;table-layout:auto}
      #mg-mega-premium .manual-table thead th{position:sticky;top:0;z-index:4;background:#2b2d32}
      #mg-mega-premium .manual-table button{padding:4px 7px;white-space:nowrap}
      #mg-mega-premium .manual-table .action-cell{position:sticky;right:0;z-index:3;background:#17181b;white-space:nowrap;min-width:155px}
      #mg-mega-premium .manual-table thead .action-cell{z-index:6;background:#2b2d32}
      #mg-mega-premium .semi-box{border:1px solid #454951;background:#1a1c20}
      #mg-mega-premium .semi-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
      #mg-mega-premium .semi-status{font-size:18px;font-weight:900;color:#8d9096}
      #mg-mega-premium .semi-status.ok{color:#7ee096}
      #mg-mega-premium .semi-controls{display:grid;grid-template-columns:2fr repeat(3,minmax(135px,1fr));gap:8px;margin-top:9px}
      #mg-mega-premium .semi-controls.inventory-mode{grid-template-columns:2fr repeat(2,minmax(150px,1fr))}
      #mg-mega-premium .semi-mode-switch{padding:0;border:0;background:transparent;position:static}
      #mg-mega-premium .semi-controls label,#mg-mega-premium .semi-selected-card{display:grid;gap:4px;background:#202226;border:1px solid #34363b;border-radius:8px;padding:8px}
      #mg-mega-premium .semi-controls small,#mg-mega-premium .semi-selected-card small{color:#8f9299}
      #mg-mega-premium .semi-selected-card span,#mg-mega-premium .semi-controls label>span{color:#aaa;font-size:11px}
      #mg-mega-premium .semi-selected-card b{font-size:15px}
      #mg-mega-premium .profit-stage{display:grid;grid-template-columns:3fr 1fr;gap:10px;background:#17231b;border:1px solid #33583d;border-radius:9px;padding:10px}
      #mg-mega-premium .profit-flow{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;background:#1c2025;border:1px solid #343942;border-radius:9px;padding:9px}
      #mg-mega-premium .profit-flow span{background:#2a3037;border-radius:7px;padding:5px 8px;font-weight:700;font-size:11px}
      #mg-mega-premium .bundle-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}
      #mg-mega-premium .bundle-summary>div{display:grid;gap:4px;background:#20242a;border:1px solid #343a43;border-radius:8px;padding:8px}
      #mg-mega-premium .bundle-summary span{font-size:11px;color:#969aa2}
      #mg-mega-premium .bundle-summary b{font-size:13px;overflow-wrap:anywhere}
      #mg-mega-premium .perf-strip{display:flex;gap:14px;flex-wrap:wrap;align-items:center;background:#181b1f;border:1px solid #2e333a;color:#aeb3ba;font-size:11px}
      #mg-mega-premium .economic-strip{display:grid;grid-template-columns:1fr 1fr 2fr;gap:8px;background:#19231d;border:1px solid #31543b;border-radius:9px;padding:9px}
      #mg-mega-premium .economic-strip>div{display:grid;gap:3px}
      #mg-mega-premium .economic-strip span{font-size:11px;color:#9ea6a0}
      #mg-mega-premium .economic-strip b{font-size:13px;overflow-wrap:anywhere}
      #mg-mega-premium .economic-strip.warn-box{background:#2d2818;border-color:#64582d}
      #mg-mega-premium .protection-box{background:#17231b;border:1px solid #31563b;color:#cde6d3}
      #mg-mega-premium .protected-pill{display:inline-block;padding:4px 7px;border:1px solid #49604e;border-radius:6px;background:#1e2b22;color:#aee1ba;font-size:11px;font-weight:800}
      #mg-mega-premium .protected-reason{margin-top:3px;color:#e0b36b;font-size:10px}
      #mg-mega-premium .stock-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
      #mg-mega-premium .stock-card{display:grid;gap:3px;border:1px solid #343a43;border-radius:8px;padding:8px;background:#20242a}
      #mg-mega-premium .stock-card span{font-size:11px;color:#9ba0a8}
      #mg-mega-premium .stock-card b{font-size:16px}
      #mg-mega-premium .stock-card small{font-size:10px;color:#8a8f97}
      #mg-mega-premium .stock-card.critical{background:#351f1f;border-color:#9a3434}
      #mg-mega-premium .stock-card.minimum{background:#3a281d;border-color:#8a5b31}
      #mg-mega-premium .stock-card.target{background:#302b1a;border-color:#6d5d25}
      #mg-mega-premium .stock-card.over{background:#202531;border-color:#465477}
      #mg-mega-premium .stock-card.ok{background:#19271d;border-color:#31543b}
      #mg-mega-premium .stock-extras{font-size:11px;color:#c6c9ce}
      #mg-mega-premium .stock-level-editor{background:#191c20;border:1px solid #343a43}
      #mg-mega-premium .stock-editor-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px}
      #mg-mega-premium .stock-level-table input{width:88px;min-width:70px;text-align:right}
      #mg-mega-premium .stock-level-table input:disabled{opacity:.55;cursor:not-allowed}
      #mg-mega-premium .recovery-box{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#30291b;border:1px solid #75602c;color:#f0ddb2}
      #mg-mega-premium .recovery-box>div:first-child{display:grid;gap:3px}
      #mg-mega-premium .learning-card{border-color:#4c456d;background:#211f2d}
      #mg-mega-premium .learning-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;background:#201f2a;border:1px solid #46405e}
      #mg-mega-premium .learning-strip>div{display:grid;gap:3px}
      #mg-mega-premium .learning-strip span{font-size:10px;color:#a9a4bd}
      #mg-mega-premium .learning-strip b{font-size:12px}
      #mg-mega-premium .learning-details{border-color:#45405d;background:#1c1b24}
      #mg-mega-premium .local-ai-box{border:1px solid #3e4850;background:#1d2226}
      #mg-mega-premium .local-ai-box.okbox{border-color:#2f6b48;background:#18251d}
      #mg-mega-premium .local-ai-box.offbox{border-color:#664641;background:#2a1f1d}
      #mg-mega-premium .local-ai-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}
      #mg-mega-premium .local-ai-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
      #mg-mega-premium .local-ai-grid>div{display:grid;gap:3px}
      #mg-mega-premium .local-ai-grid span{font-size:10px;color:#9fa8ae}
      #mg-mega-premium .local-ai-grid b{font-size:11px;overflow-wrap:anywhere}
      #mg-mega-premium .semi-toolbar{margin-top:8px}
      #mg-mega-premium tr.semi-selected td{background:#243128!important}
      #mg-mega-premium tr.semi-selected .action-cell{background:#243128!important}
      #mg-mega-premium .resize-grip{position:absolute;z-index:30;background:transparent}
      #mg-mega-premium .resize-grip.e{top:46px;right:-2px;width:9px;bottom:12px;cursor:ew-resize}
      #mg-mega-premium .resize-grip.s{left:0;right:12px;bottom:-2px;height:9px;cursor:ns-resize}
      #mg-mega-premium .resize-grip.se{right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize}
      #mg-mega-premium .resize-grip.se:after{content:'↘';position:absolute;right:3px;bottom:0px;color:#999;font-size:17px;font-weight:700;line-height:20px}
      #mg-mega-premium .resize-grip.se:hover:after{color:#fff}
      #mg-mega-premium .size-hint{font-size:10px;color:#8c8f96;margin-left:2px;white-space:nowrap}
      #mg-mega-premium:not(.advanced-ui) .tabs{display:none}
      #mg-mega-premium:not(.advanced-ui) .content{height:calc(100% - 76px)}
      #mg-mega-premium:not(.advanced-ui) .head [data-act="size-cycle"],
      #mg-mega-premium:not(.advanced-ui) .head [data-act="market-refresh"],
      #mg-mega-premium:not(.advanced-ui) .head [data-act="snapshot"]{display:none}
      #mg-mega-premium .simple-hero{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 16px;border:1px solid #343a43;border-radius:12px;background:#1d2024;margin-bottom:10px}
      #mg-mega-premium .simple-state{display:grid;gap:3px;min-width:0}
      #mg-mega-premium .simple-kicker{font-size:10px;letter-spacing:.14em;color:#9399a2;font-weight:800}
      #mg-mega-premium .simple-mode{font-size:25px;line-height:1.05;letter-spacing:.02em}
      #mg-mega-premium .simple-sub{font-size:11px;color:#9da2aa}
      #mg-mega-premium .simple-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      #mg-mega-premium .simple-primary{font-weight:900;padding:9px 16px;font-size:14px}
      #mg-mega-premium .simple-coin-mode{display:grid;grid-template-columns:auto minmax(210px,330px) 1fr;align-items:center;gap:9px;padding:8px 11px;margin-bottom:9px;border:1px solid #404650;border-radius:9px;background:#1b1e22}
      #mg-mega-premium .simple-coin-mode>span{font-size:11px;font-weight:800;color:#d6d9de;white-space:nowrap}
      #mg-mega-premium .simple-coin-perms{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
      #mg-mega-premium .coin-perm{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#d6d9de;white-space:nowrap}
      #mg-mega-premium .coin-perm input{margin:0}
      #mg-mega-premium .coin-perms-inline{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      #mg-mega-premium .simple-coin-mode>small{font-size:10px;color:#969ca5}
      #mg-mega-premium .simple-current{display:grid;gap:3px;padding:13px 15px;margin-bottom:10px;border:1px solid #31543b;border-radius:10px;background:#17241c}
      #mg-mega-premium .simple-current>span{font-size:10px;color:#9aa79e}
      #mg-mega-premium .simple-current>b{font-size:20px}
      #mg-mega-premium .simple-current>small{font-size:12px;color:#d3dad5;overflow-wrap:anywhere}
      #mg-mega-premium .simple-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:9px}
      #mg-mega-premium .simple-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
      #mg-mega-premium .simple-card{display:grid;gap:5px;min-height:86px;padding:10px 12px;border:1px solid #343a43;border-radius:10px;background:#202328;min-width:0}
      #mg-mega-premium .simple-card>span{font-size:10px;color:#9ea3ab}
      #mg-mega-premium .simple-card>b{font-size:14px;overflow-wrap:anywhere}
      #mg-mega-premium .simple-card>small{font-size:10px;color:#aeb3ba;overflow-wrap:anywhere}
      #mg-mega-premium .simple-card.good{border-color:#315b40;background:#19251d}
      #mg-mega-premium .simple-card.bad{border-color:#70423b;background:#2a1e1d}
      #mg-mega-premium .session-history-link{justify-self:start;padding:4px 7px;font-size:10px;margin-top:2px}
      #mg-mega-premium .simple-notice{padding:8px 11px;margin-bottom:8px;border-radius:8px;border:1px solid #3e4850;background:#1b2025;font-size:11px}
      #mg-mega-premium .simple-notice.warn{border-color:#745b2f;background:#302819;color:#f1dcae}
      #mg-mega-premium .simple-notice.info{border-color:#3a526c;background:#192633;color:#cfe3f7}
      #mg-mega-premium .simple-advanced{margin-top:10px;border:1px solid #343a43;background:#17191c;border-radius:9px;padding:0}
      #mg-mega-premium .simple-advanced>summary{cursor:pointer;padding:10px 12px;font-weight:800;color:#c8ccd2}
      #mg-mega-premium .simple-advanced-inner{padding:0 10px 12px}
      #mg-mega-premium .pvp-best{border-color:#5b4a27;background:#252116}
      #mg-mega-premium .pvp-best-build{display:flex;flex-direction:column;gap:5px;padding:10px 12px;border:1px solid #705f31;border-radius:8px;background:#1d1a12;margin:6px 0}
      #mg-mega-premium .pvp-best-build b{font-size:16px;color:#f0d77a;overflow-wrap:anywhere}
      #mg-mega-premium .pvp-best-build span{font-size:11px;color:#c9c1a5}
      #mg-mega-premium .table-wrap{overflow:auto}
      /* Android/mobile responsive fix v1.0.3: use full selector specificity so these rules really override desktop grids. */
      @media(max-width:900px){
        #mg-mega-premium{min-width:0;min-height:0;width:calc(100vw - 8px);height:calc(100vh - 8px);top:4px;right:4px;left:4px;resize:none}
        #mg-mega-premium .content{padding:8px;overflow-x:hidden}
        #mg-mega-premium .cards,
        #mg-mega-premium .cards.mini,
        #mg-mega-premium .simple-settings{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px}
        #mg-mega-premium .cards.mini .card{padding:10px;min-height:96px}
        #mg-mega-premium .cards.mini .label{font-size:10px;line-height:1.25}
        #mg-mega-premium .cards.mini .big{font-size:17px;line-height:1.15;white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere}
        #mg-mega-premium .cards.mini .card>div:last-child{font-size:11px;line-height:1.35;overflow-wrap:anywhere}
        #mg-mega-premium .session-current-cards .card:last-child:nth-child(odd){grid-column:1/-1;min-height:auto}
        #mg-mega-premium .toolbar{align-items:stretch;gap:6px}
        #mg-mega-premium .toolbar>button{max-width:100%;white-space:normal;text-align:center}
        #mg-mega-premium .toolbar>.sub{flex-basis:100%;line-height:1.35}
        #mg-mega-premium .section-title{font-size:14px;margin:12px 0 7px}
        #mg-mega-premium .helper-hero,
        #mg-mega-premium .simple-hero{align-items:flex-start;flex-direction:column}
        #mg-mega-premium .helper-actions,
        #mg-mega-premium .simple-actions{justify-content:flex-start}
        #mg-mega-premium .simple-coin-mode{grid-template-columns:1fr!important}
        #mg-mega-premium .simple-grid,
        #mg-mega-premium .simple-grid-3{grid-template-columns:1fr!important}
        #mg-mega-premium .semi-controls{grid-template-columns:1fr!important}
        #mg-mega-premium .bundle-summary,
        #mg-mega-premium .economic-strip,
        #mg-mega-premium .stock-grid,
        #mg-mega-premium .learning-strip,
        #mg-mega-premium .local-ai-grid{grid-template-columns:1fr!important}
        #mg-mega-premium .tabs{scrollbar-width:none;-ms-overflow-style:none;overscroll-behavior-x:contain}
        #mg-mega-premium .tabs::-webkit-scrollbar{display:none}
        #mg-mega-premium .tab{padding:7px 11px;font-size:12px}
        #mg-mega-premium .table-wrap{max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
        #mg-mega-premium .note{font-size:11px;line-height:1.4}
      }
      #mg-mega-premium.android-app .head{touch-action:none}
      #mg-mega-premium.android-app .head button{touch-action:manipulation}
      #mg-mega-premium.android-app .resize-grip{touch-action:none}
      @media(max-width:900px){
        #mg-mega-premium.android-app{width:92vw;height:78vh;top:18px;left:4vw;right:auto;min-width:0;min-height:180px}
        #mg-mega-premium.android-app .head{gap:4px;padding:5px 6px;height:44px}
        #mg-mega-premium.android-app .head .title{font-size:12px;max-width:40vw;overflow:hidden;text-overflow:ellipsis}
        #mg-mega-premium.android-app .head .badge{flex:0 0 auto}
        #mg-mega-premium.android-app .head .size-hint{display:none}
        #mg-mega-premium.android-app .head button{padding:5px 7px;font-size:11px;white-space:nowrap;min-height:31px}
        #mg-mega-premium.android-app .head button[data-act="size-cycle"],
        #mg-mega-premium.android-app .head button[data-act="market-refresh"],
        #mg-mega-premium.android-app .head button[data-act="snapshot"]{display:none}
      }
    </style>
    <div class="head"><div class="title">Pomagier by Don</div><span class="badge">v${VERSION}</span><span class="size-hint">rozmiar: przeciągnij ↘</span><div class="spacer"></div><button data-act="toggle-advanced-ui">☰ Więcej</button><button data-act="size-cycle">▣ Rozmiar</button><button data-act="market-refresh">↻ Ceny</button><button data-act="snapshot">JSON</button><button data-act="min">—</button><button data-act="close">×</button></div>
    <div class="tabs">${[['autopilot','Pomagier'],['pvpLab','PvP Lab'],['bossLab','Boss Lab'],['manual','Demontaż'],['crafting','Produkcja'],['resources','Surowce'],['sessions','Sesje'],['history','Historia cen'],['settings','Ustawienia']].map(([k,n])=>`<button class="tab" data-tab="${k}">${n}</button>`).join('')}</div>
    <div class="status-line">Start…</div><div class="content"></div>
    <div class="resize-grip e" data-resize="e"></div>
    <div class="resize-grip s" data-resize="s"></div>
    <div class="resize-grip se" data-resize="se" title="Przeciągnij, aby zmienić rozmiar"></div>`;
    (document.body || document.documentElement).appendChild(el);
    return el;
  }

  const panel = makePanel();
  if (ANDROID_APP) panel.classList.add('android-app');
  if (ANDROID_APP && localStorage.getItem('pomagier_android_touch_ui_v102') !== '1') {
    // v1.0.1 natywny przycisk P wymuszał pełny ekran i zapisywał tę geometrię.
    // Czyścimy ją jeden raz, aby nowy ruchomy panel wystartował w rozsądnym rozmiarze.
    localStorage.removeItem(K.pos);
    localStorage.setItem('pomagier_android_touch_ui_v102','1');
  }
  let advancedUiOpen = localStorage.getItem('pomagier_advanced_ui_v861') === '1';
  panel.classList.toggle('advanced-ui', advancedUiOpen);
  if (!advancedUiOpen) {
    state.activeTab='autopilot';
    localStorage.setItem(K.tab,state.activeTab);
  }

  function setPanelPos() {
    const p=loadJSON(K.pos,null); if (!p) return;
    if (p.left!=null) { panel.style.left=`${p.left}px`; panel.style.right='auto'; }
    if (p.top!=null) panel.style.top=`${p.top}px`;
    if (p.width) panel.style.width=`${p.width}px`; if (p.height) panel.style.height=`${p.height}px`;
  }
  setPanelPos();

  const SIZE_PRESETS = ANDROID_APP ? [
    {name:'Mały', w:()=>Math.round(window.innerWidth*0.76), h:()=>Math.round(window.innerHeight*0.55)},
    {name:'Średni', w:()=>Math.round(window.innerWidth*0.88), h:()=>Math.round(window.innerHeight*0.70)},
    {name:'Duży', w:()=>Math.round(window.innerWidth*0.94), h:()=>Math.round(window.innerHeight*0.84)},
    {name:'Pełny', w:()=>window.innerWidth-8, h:()=>window.innerHeight-8}
  ] : [
    {name:'Mały', w:760, h:520},
    {name:'Średni', w:1050, h:700},
    {name:'Duży', w:1320, h:850},
    {name:'Pełny', w:()=>window.innerWidth-20, h:()=>window.innerHeight-20}
  ];
  let sizePresetIndex = -1;

  function savePanelGeometry(){
    if(panel.style.display==='none') return;
    const r=panel.getBoundingClientRect();
    saveJSON(K.pos,{left:r.left,top:r.top,width:r.width,height:r.height});
  }

  function fitPanelInsideViewport(){
    const r=panel.getBoundingClientRect();
    const maxW=ANDROID_APP?Math.max(280,window.innerWidth-8):Math.max(560,window.innerWidth-8);
    const maxH=ANDROID_APP?Math.max(240,window.innerHeight-8):Math.max(320,window.innerHeight-8);
    let w=Math.min(r.width,maxW);
    let h=Math.min(r.height,maxH);
    let left=Math.min(Math.max(0,r.left),Math.max(0,window.innerWidth-w));
    let top=Math.min(Math.max(0,r.top),Math.max(0,window.innerHeight-h));
    panel.style.width=`${w}px`;
    panel.style.height=`${h}px`;
    panel.style.left=`${left}px`;
    panel.style.top=`${top}px`;
    panel.style.right='auto';
  }

  function applySizePreset(preset){
    const w=typeof preset.w==='function'?preset.w():preset.w;
    const h=typeof preset.h==='function'?preset.h():preset.h;
    const minW=ANDROID_APP?Math.min(280,Math.max(220,window.innerWidth-8)):560;
    const minH=ANDROID_APP?Math.min(180,Math.max(140,window.innerHeight-8)):320;
    panel.style.width=`${Math.max(minW,Math.min(w,window.innerWidth-8))}px`;
    panel.style.height=`${Math.max(minH,Math.min(h,window.innerHeight-8))}px`;
    fitPanelInsideViewport();
    savePanelGeometry();
  }

  let resizeState=null;
  panel.querySelectorAll('[data-resize]').forEach(grip=>{
    grip.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse' && e.button!==0) return;
      e.preventDefault();
      e.stopPropagation();
      const r=panel.getBoundingClientRect();
      resizeState={
        pointerId:e.pointerId,
        grip,
        dir:grip.dataset.resize,
        startX:e.clientX,startY:e.clientY,
        startW:r.width,startH:r.height
      };
      try{ grip.setPointerCapture(e.pointerId); }catch(_){}
      document.body.style.userSelect='none';
    });
  });

  window.addEventListener('pointermove',e=>{
    if(!resizeState || e.pointerId!==resizeState.pointerId) return;
    e.preventDefault();
    const dx=e.clientX-resizeState.startX;
    const dy=e.clientY-resizeState.startY;
    const minW=ANDROID_APP?280:560;
    const minH=ANDROID_APP?180:320;
    const left=panel.getBoundingClientRect().left;
    const top=panel.getBoundingClientRect().top;
    const maxW=Math.max(minW,window.innerWidth-left-4);
    const maxH=Math.max(minH,window.innerHeight-top-4);
    if(resizeState.dir.includes('e')){
      panel.style.width=`${Math.max(minW,Math.min(resizeState.startW+dx,maxW))}px`;
    }
    if(resizeState.dir.includes('s')){
      panel.style.height=`${Math.max(minH,Math.min(resizeState.startH+dy,maxH))}px`;
    }
  },{passive:false});

  function finishResize(e){
    if(!resizeState || (e && e.pointerId!==resizeState.pointerId)) return;
    try{ resizeState.grip.releasePointerCapture(resizeState.pointerId); }catch(_){}
    resizeState=null;
    document.body.style.userSelect='';
    savePanelGeometry();
  }
  window.addEventListener('pointerup',finishResize);
  window.addEventListener('pointercancel',finishResize);

  if(typeof ResizeObserver!=='undefined'){
    const ro=new ResizeObserver(()=>savePanelGeometry());
    ro.observe(panel);
  }

  window.addEventListener('resize',()=>{
    fitPanelInsideViewport();
    savePanelGeometry();
  });

  let drag=null;
  const panelHead=panel.querySelector('.head');
  panelHead.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse' && e.button!==0) return;
    if(e.target.closest('button') || e.target.closest('[data-resize]')) return;
    e.preventDefault();
    const r=panel.getBoundingClientRect();
    drag={pointerId:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};
    try{ panelHead.setPointerCapture(e.pointerId); }catch(_){}
    document.body.style.userSelect='none';
  });
  window.addEventListener('pointermove',e=>{
    if(!drag || e.pointerId!==drag.pointerId) return;
    e.preventDefault();
    const r=panel.getBoundingClientRect();
    const maxLeft=Math.max(0,window.innerWidth-Math.min(150,r.width));
    const maxTop=Math.max(0,window.innerHeight-Math.min(46,r.height));
    panel.style.left=`${clamp(e.clientX-drag.dx,0,maxLeft)}px`;
    panel.style.top=`${clamp(e.clientY-drag.dy,0,maxTop)}px`;
    panel.style.right='auto';
  },{passive:false});
  function finishDrag(e){
    if(!drag || (e && e.pointerId!==drag.pointerId)) return;
    try{ panelHead.releasePointerCapture(drag.pointerId); }catch(_){}
    drag=null;
    document.body.style.userSelect='';
    savePanelGeometry();
  }
  window.addEventListener('pointerup',finishDrag);
  window.addEventListener('pointercancel',finishDrag);

  panel.addEventListener('click', async e=>{
    const tab=e.target.closest('[data-tab]'); if(tab){state.activeTab=tab.dataset.tab;localStorage.setItem(K.tab,state.activeTab);render();return;}
    const btn=e.target.closest('button[data-act]'); if(!btn)return;
    const act=btn.dataset.act;
    if(act==='toggle-advanced-ui'){
      advancedUiOpen=!advancedUiOpen;
      localStorage.setItem('pomagier_advanced_ui_v861', advancedUiOpen?'1':'0');
      panel.classList.toggle('advanced-ui', advancedUiOpen);
      if(!advancedUiOpen){
        state.activeTab='autopilot';
        localStorage.setItem(K.tab,state.activeTab);
      }
      render();
      return;
    }
    if(act==='open-sessions'){
      advancedUiOpen=true;
      localStorage.setItem('pomagier_advanced_ui_v861','1');
      panel.classList.add('advanced-ui');
      state.activeTab='sessions';
      localStorage.setItem(K.tab,state.activeTab);
      render();
      return;
    }
    if(act==='clear-session-history'){
      if(confirm('Wyczyścić historię 10 zakończonych sesji? Aktualna trwająca sesja nie zostanie wyzerowana.')){
        sessionHistory=[];
        saveSessionHistory();
        render();
      }
      return;
    }
    if(act==='refresh') refreshAll(true);
    if(act==='size-cycle'){
      sizePresetIndex=(sizePresetIndex+1)%SIZE_PRESETS.length;
      applySizePreset(SIZE_PRESETS[sizePresetIndex]);
      btn.textContent=`▣ ${SIZE_PRESETS[sizePresetIndex].name}`;
    }
    if(act==='market-refresh'){
      if(!__mgSessionTemplate) alert('Najpierw otwórz Bazar albo Warsztat, żeby Pomagier złapał sesję.');
      else await refreshMarketOnly({silent:false});
    }
    if(act==='manual-view-market'){
      manualPrefs.view='market'; saveManualPrefs(); render();
    }
    if(act==='manual-view-inventory'){
      manualPrefs.view='inventory'; saveManualPrefs(); render();
    }
    if(act==='manual-refresh'){
      if(!__mgSessionTemplate){ alert('Najpierw otwórz Bazar albo Warsztat.'); }
      else{
        state.manual.busy=true; render();
        try{
          await refreshMarketOnly({silent:true});
          await refreshManualInventory({silent:false});
          state.manual.lastMessage='Bazar i ekwipunek odświeżone.';
        }catch(e){ state.manual.lastError=String(e?.message||e); }
        finally{ state.manual.busy=false; render(); }
      }
    }
    if(act==='manual-inventory-refresh'){
      if(!__mgSessionTemplate){ alert('Najpierw otwórz Bazar albo Warsztat.'); }
      else{
        state.manual.busy=true; render();
        try{ await refreshManualInventory({silent:false}); }
        catch(e){ state.manual.lastError=String(e?.message||e); }
        finally{ state.manual.busy=false; render(); }
      }
    }
    if(act==='semi-mode-market'){
      if(state.manual.semi.enabled) semiStop('Półautomat zatrzymany — zmieniono źródło.');
      manualPrefs.semiMode='market'; saveManualPrefs(); manualPrefs.view='market'; render();
    }
    if(act==='semi-mode-inventory'){
      if(state.manual.semi.enabled) semiStop('Półautomat zatrzymany — zmieniono źródło.');
      manualPrefs.semiMode='inventory'; saveManualPrefs(); manualPrefs.view='inventory'; render();
    }
    if(act==='semi-select-inventory'){
      if(state.manual.semi.enabled) semiStop('Półautomat zatrzymany — zmieniono wybrany przedmiot.');
      manualPrefs.semiMode='inventory';
      manualPrefs.semiInventoryItemId=Number(btn.dataset.item);
      manualPrefs.semiInventoryEnhancement=Number(btn.dataset.enh||0);
      manualPrefs.semiInventoryName=btn.dataset.name||`ID ${btn.dataset.item}`;
      manualPrefs.view='inventory';
      saveManualPrefs();
      state.manual.semi.lastAction=`Wybrano z ekwipunku: ${manualPrefs.semiInventoryName}`;
      render();
    }
    if(act==='semi-select'){
      const itemId=Number(btn.dataset.item);
      const meta=staticDismantleById(itemId);
      if(isCraftIngredientProtected(itemId)){
        alert(craftIngredientProtectionText(itemId));
        return;
      }
      if(meta){
        manualPrefs.semiMode='market';
        manualPrefs.semiItemId=itemId;
        const p=getPrice(itemId,0);
        if(p?.min_price!=null) manualPrefs.semiMaxPrice=Math.ceil(Number(p.min_price));
        saveManualPrefs();
        state.manual.semi.lastAction=`Wybrano: ${meta.name}`;
        render();
      }
    }
    if(act==='semi-start'){ startSemiDismantle(); }
    if(act==='semi-stop'){
      semiStop('Półautomat zatrzymany ręcznie.');
      render();
    }
    if(act==='manual-buy-one'){
      const itemId=Number(btn.dataset.item);
      if(confirm('Kupić 1 sztukę i od razu wrzucić do demontażu?')) await manualBuyAndDismantle(itemId,1);
    }
    if(act==='manual-buy-many'){
      const itemId=Number(btn.dataset.item);
      const q=prompt('Ile sztuk kupić i dodać do demontażu?','1');
      if(q!=null){
        const qty=Math.max(1,Math.min(20,Math.floor(Number(q)||1)));
        if(confirm(`Kupić maksymalnie ${qty} szt. i od razu demontować?`)) await manualBuyAndDismantle(itemId,qty);
      }
    }
    if(act==='manual-inv-one'){
      await addInventoryToDismantle(Number(btn.dataset.inventory),1);
    }
    if(act==='manual-inv-many'){
      const max=Math.max(1,Number(btn.dataset.max)||1);
      const q=prompt(`Ile sztuk dodać? (1-${max})`,'1');
      if(q!=null){
        const qty=Math.max(1,Math.min(max,Math.floor(Number(q)||1)));
        await addInventoryToDismantle(Number(btn.dataset.inventory),qty);
      }
    }
    if(act==='pvp-sync'){ await pvpLabSync({silent:false}); return; }
    if(act==='pvp-optimize'){ pvpLabRunOptimizer(); render(); return; }
    if(act==='pvp-export'){ pvpLabExport(); return; }
    if(act==='pvp-clear'){
      if(confirm('Wyczyścić całą lokalną bazę PvP Lab? Nie wpływa to na historię w samej grze.')){
        pvpLab={version:3,startedAt:Date.now(),updatedAt:0,lastSyncAt:0,syncStatus:'WYCZYSZCZONO',syncing:false,current:{},battles:[],errors:[],opponentRolls:[],skillTrees:{},skillTreesAt:{},defenseSnapshots:[],capabilities:{},optimizer:{status:'CZEKA'}};
        pvpLabSave(); render();
      }
      return;
    }
    if(act==='boss-sync'){ await bossLabSync({silent:false}); return; }
    if(act==='boss-export'){ bossLabExport(); return; }
    if(act==='boss-optimize'){ const id=Number(btn.dataset.bossId||0); if(id){ bossLabRunOptimizer(id); render(); } return; }
    if(act==='boss-clear'){
      if(confirm('Wyczyścić lokalną bazę Boss Lab? PvP Lab pozostanie bez zmian.')){
        bossLab={version:1,startedAt:Date.now(),updatedAt:0,lastBossListAt:0,lastCaptureAt:0,syncStatus:'WYCZYSZCZONO',syncing:false,bosses:{},battles:[],optimizers:{},errors:[]}; bossLabSave(); render();
      }
      return;
    }
    if(act==='snapshot') exportSnapshot();
    if(act==='auto-test'){ await autoTestConnection(); }
    if(act==='auto-run-once'){
      if(autoCfg.enabled){
        await autoCycle(true);
      }else{
        const prevDry=autoCfg.dryRun;
        autoCfg.dryRun=true;
        await autoCycle(true);
        autoCfg.dryRun=prevDry;
      }
    }
    if(act==='auto-dry'){
      clearRecoveryTicket();
      resetRecoveryState();
      state.auto.writeHoldUntil=0;
      autoCfg.enabled=true; autoCfg.dryRun=true; autoSaveCfg();
      state.localAI.nextAt=0;
      state.auto.nextCycleAt=Date.now()+500;
      state.auto.stage='TEST';
      state.auto.stageDetail='Symulacja bez zakupów, craftingu i sprzedaży';
      autoLogMsg('info','DRY RUN włączony — żadnych zakupów ani POST-ów zmieniających stan.');
      render();
    }
    if(act==='alcohol-learn'){
      if(alcoholAuto.learning?.armed){ alert('Uczenie alkoholu już jest aktywne. Dokończ ręczny cykl albo kliknij „Przerwij uczenie”.'); return; }
      const def=alcoholProfileSelected()?.name || 'Alkohol x2';
      const name=prompt('Nazwa profilu alkoholu, np. „Bimber x2” albo „Wino x1”:',def);
      if(name!=null && String(name).trim()){
        alcoholStartLearning(String(name).trim());
        alert('Uczenie włączone. Gdy bieżąca produkcja się skończy: ręcznie kliknij Odbierz, wybierz recepturę w Notesie, potwierdź dokupienie braków, ustaw x1/x2 i kliknij Wytwarzaj. Po udanym starcie profil zapisze się automatycznie.');
      }
      render(); return;
    }
    if(act==='alcohol-learn-stop'){ alcoholStopLearning('Uczenie alkoholu przerwane ręcznie.'); render(); return; }
    if(act==='alcohol-run-now'){
      alcoholAuto.nextAt=0; const p=alcoholProfileSelected(); if(p) p.nextAt=0; alcoholSave();
      await alcoholAutoCycle({force:true}); render(); return;
    }
    if(act==='alcohol-delete-profile'){
      const p=alcoholProfileSelected();
      if(p && confirm(`Usunąć nauczony profil alkoholu „${p.name}”?`)){
        const key=String(autoCfg.alcoholProfileKey||p.key||'');
        if(key) delete alcoholAuto.profiles[key];
        autoCfg.alcoholProfileKey=''; autoCfg.alcoholAutoEnabled=false; autoSaveCfg();
        alcoholAuto.lastAction='Usunięto profil alkoholu'; alcoholSave(); render();
      }
      return;
    }

    if(act==='menel-learn-close'){
      startMenelCloseLearning();
      return;
    }

    if(act==='melina-learn-add'){
      startMelinaAddLearning();
      return;
    }

    if(act==='garden-check'){
      try{
        await localAiRefreshGarden({force:true});
      }catch(e){
        state.localAI.garden.status=`BŁĄD: ${String(e?.message||e)}`;
      }
      render();
      return;
    }

    if(act==='local-ai-test'){
      state.localAI.nextAt=0;
      localAiTick({force:true});
      return;
    }

    if(act==='learning-reset'){
      if(confirm('Wyczyścić całą pamięć samouczenia Pomagiera? Historia zakupów i ustawienia zostaną zachowane.')){
        learnerReset();
        computeRankings();
        autoLogMsg('warn','AI: wyczyszczono pamięć samouczenia.');
        render();
      }
      return;
    }

    if(act==='stock-reset-manual'){
      if(confirm('Wyczyścić wszystkie ręczne progi magazynu i wrócić do wartości AUTO?')){
        autoCfg.strategicManualLevels={};
        autoCfg.strategicStockLevelsMode='auto';
        autoSaveCfg();
        state.auto.strategicPlan=strategicStockPlan();
        render();
      }
      return;
    }

    if(act==='auto-live'){
      if(!__mgSessionTemplate){
        alert('Najpierw otwórz normalnie Bazar albo Warsztat. Gdy SESJA pokaże GOTOWA, uruchom Pomagiera.');
      }else{
        const ok=confirm(
          `Uruchomić TRYB AUTONOMICZNY ZYSK?\n\n`+
          `Pomagier będzie sam:\n`+
          `• analizował ceny,\n• kupował potrzebne przedmioty,\n• demontował je na surowce,\n`+
          `• uruchamiał najbardziej opłacalny crafting,\n• odbierał gotowy produkt,\n• wystawiał go na bazarze tylko z wymaganym zyskiem.\n\n`+
          `Min. zysk/szt.: ${money(autoCfg.minProfitPerCraft)}\n`+
          `Min. zysk/h: ${money(autoCfg.minProfitPerHour)}\n`+
          `Limit zakupów/dzień: ${money(autoCfg.maxSpendPerDay)}`
        );
        if(ok){
          if(state.manual.semi.enabled) semiStop('Półautomat zatrzymany — uruchomiono tryb autonomiczny.');
          clearRecoveryTicket();
          resetRecoveryState();
          state.auto.writeHoldUntil=0;
          sanitizeRankings();
          state.auto.target=null;
          if(/null.*recipe|recipe.*null/i.test(String(state.auto.error||''))) state.auto.error=null;
          startSessionStats();
          autoCfg.enabled=true;
          autoCfg.dryRun=false;
          autoSaveCfg();
          state.localAI.nextAt=0;
          state.auto.nextCycleAt=Date.now()+500;
          state.marketNextAt=Date.now()+500;
          state.auto.stage='START';
          state.auto.stageDetail='Uruchamiam autonomiczną linię zysku';
          autoLogMsg('warn','TRYB AUTONOMICZNY ZYSK URUCHOMIONY.');
          render();
        }
      }
    }
    if(act==='auto-stop'){
      stopSessionStats();
      autoCfg.enabled=false; autoCfg.dryRun=true; autoSaveCfg();
      clearRecoveryTicket();
      resetRecoveryState();
      state.auto.writeHoldUntil=0;
      state.auto.nextCycleAt=0;
      state.auto.stage='STOP';
      state.auto.stageDetail='Zatrzymany ręcznie';
      autoLogMsg('warn','POMAGIER ZATRZYMANY.');
      render();
    }
    if(act==='auto-clear-log'){
      autoLog=[]; saveJSON(K.autoLog,autoLog); render();
    }
    if(act==='close') panel.style.display='none';
    if(act==='min'){
      const c=panel.querySelector('.content'),t=panel.querySelector('.tabs'),sl=panel.querySelector('.status-line');
      const hidden=c.style.display==='none';
      if(!hidden){
        panel.dataset.restoreHeight=String(panel.getBoundingClientRect().height);
        c.style.display='none';t.style.display='none';sl.style.display='none';
        panel.style.minHeight='46px';panel.style.height='46px';btn.textContent='□';
        if(ANDROID_APP) localStorage.setItem('pomagier_android_minimized','1');
        fitPanelInsideViewport();savePanelGeometry();
      }else{
        c.style.display='';t.style.display='';sl.style.display='';
        const minH=ANDROID_APP?180:320;
        panel.style.minHeight=`${minH}px`;
        const rh=Number(panel.dataset.restoreHeight||(ANDROID_APP?650:650));
        panel.style.height=`${Math.max(minH,Math.min(rh,window.innerHeight-8))}px`;
        btn.textContent='—';
        if(ANDROID_APP) localStorage.removeItem('pomagier_android_minimized');
        fitPanelInsideViewport();savePanelGeometry();
      }
    }
    if(act==='csv') exportCSV();
    if(act==='clear-history'){if(confirm('Wyczyścić lokalną historię?')){history=[];saveJSON(K.history,history);render();}}
    if(act==='clear-native-cache'){if(confirm('Wyczyścić zapisane odpowiedzi bazaru/warsztatu?')){localStorage.removeItem(K.nativeCache);state.prices=new Map();state.prevPrices=new Map();state.recipes=[];state.parts={};state.endpointStatus={};state.lastUpdated=null;buildResourceOptions();computeRankings();render();}}
    if(act==='notif'){if(typeof Notification!=='undefined') Notification.requestPermission();}
    if(act==='watch-add'){
      const id=Number(panel.querySelector('[data-f="watch-id"]')?.value); const name=panel.querySelector('[data-f="watch-name"]')?.value?.trim();
      if(Number.isInteger(id)&&id>0&&!settings.watch.some(w=>Number(w.id)===id)){settings.watch.push({id,name:name||`ID ${id}`,above:null,below:null});saveJSON(K.settings,settings);render();}
    }
    if(act==='watch-remove'){settings.watch=settings.watch.filter(w=>Number(w.id)!==Number(btn.dataset.id));saveJSON(K.settings,settings);render();}
    if(act==='save-settings'){saveSettingsFromUI();refreshAll(true);}
    if(act==='reset'){if(confirm('Przywrócić ustawienia domyślne?')){Object.assign(settings,JSON.parse(JSON.stringify(DEFAULTS)));syncCharacterIdFromGameAuth();saveJSON(K.settings,settings);render();}}
  });

  panel.addEventListener('change', e=>{
    const el=e.target;
    if(el.matches('[data-setting]')){saveSettingsFromUI();buildResourceOptions();computeRankings();render();return;}
    if(el.matches('[data-manual]')){
      const k=el.dataset.manual;
      manualPrefs[k]=el.value;
      saveManualPrefs();
      render();
      return;
    }
    if(el.matches('[data-stock-key][data-stock-level]')){
      const key=el.dataset.stockKey;
      const level=el.dataset.stockLevel;

      if(!autoCfg.strategicManualLevels || typeof autoCfg.strategicManualLevels!=='object'){
        autoCfg.strategicManualLevels={};
      }
      if(!autoCfg.strategicManualLevels[key] || typeof autoCfg.strategicManualLevels[key]!=='object'){
        autoCfg.strategicManualLevels[key]={};
      }

      autoCfg.strategicManualLevels[key][level]=Math.max(0,Math.floor(Number(el.value)||0));

      // Normalizuj cały rząd, aby nigdy nie powstało np. minimum > cel.
      const currentPlan=strategicStockPlan();
      const row=currentPlan.resources?.[key];
      const raw=autoCfg.strategicManualLevels[key];

      const normalized=normalizeStockLevels({
        critical:raw.critical ?? row?.critical ?? 0,
        min:raw.min ?? row?.min ?? 0,
        target:raw.target ?? row?.target ?? 0,
        max:raw.max ?? row?.max ?? 0
      });

      autoCfg.strategicManualLevels[key]=normalized;
      autoSaveCfg();
      state.auto.strategicPlan=strategicStockPlan();
      render();
      return;
    }

    if(el.matches('[data-auto]')){
      const k=el.dataset.auto;
      if(el.type==='checkbox') autoCfg[k]=!!el.checked;
      else if(el.tagName==='SELECT') autoCfg[k]=el.value;
      else autoCfg[k]=Number(el.value);
      autoSaveCfg(); buildResourceOptions(); computeRankings(); render(); return;
    }
    if(el.matches('[data-watch-field]')){
      const tr=el.closest('[data-watch-id]'); const w=settings.watch.find(x=>Number(x.id)===Number(tr.dataset.watchId));
      if(w){const v=el.value.trim();w[el.dataset.watchField]=v===''?null:Number(v);saveJSON(K.settings,settings);}
    }
  });

  let __manualSearchTimer=null;
  panel.addEventListener('input', e=>{
    const el=e.target;
    if(el.matches('input[data-manual="marketSearch"],input[data-manual="inventorySearch"]')){
      manualPrefs[el.dataset.manual]=el.value;
      saveManualPrefs();
      clearTimeout(__manualSearchTimer);
      __manualSearchTimer=setTimeout(()=>render(),220);
    }
  });


  panel.addEventListener('click', e=>{
    const tr=e.target.closest('tr[data-recipe]'); if(!tr)return;
    const x=sanitizeRankings().find(y=>Number(y?.recipe?.id)===Number(tr.dataset.recipe));
    const d=panel.querySelector('#mg-recipe-detail'); if(d)d.innerHTML=recipeDetailHTML(x);
  });

  // Awaryjny zapis geometrii; normalnie robi to ResizeObserver i mouseup.
  setInterval(()=>savePanelGeometry(),10000);

  // Scheduler Pomagiera.
  // Ceny bazaru odświeżamy także gdy automat jest zatrzymany (po złapaniu sesji).
  // Gdy Pomagier pracuje, pełny autoCycle już pobiera bazar na początku każdego cyklu,
  // więc osobny watcher nie dubluje wtedy requestów.
  // Android v1.0.5 może dodatkowo wywołać ten sam tick z natywnego Foreground Service.
  function __pomagierSchedulerTick(){
    // Login/przełączenie konta może zakończyć się bez pełnego reloadu SPA.
    // Co sekundę kontrolujemy ID zalogowanej postaci. Przy zmianie konta odrzucamy
    // stary wzorzec sesji i pobieramy nowy token wyłącznie do RAM.
    const accountChanged=syncCharacterIdFromGameAuth();
    if(accountChanged) __mgSessionTemplate=null;
    if(!__mgSessionTemplate) tryHydrateSessionFromGameAuth();
    updateHeader();

    if(
      pvpLabCfg.enabled && pvpLabCfg.autoSync && __mgSessionTemplate && !pvpLab.syncing &&
      !state.localAI.busy && !state.auto.inCycle && !state.manual.semi.inCycle &&
      Date.now()-Number(pvpLab.lastSyncAt||0) >= Math.max(5,Number(pvpLabCfg.autoSyncMinutes||15))*60000
    ){
      pvpLabSync({silent:true});
      return;
    }
    if(pvpLab.syncing) return;

    if((state.auto.recovery.active || recoveryResumePending) && !state.auto.recovery.inTick){
      recoveryTick();
      return;
    }

    // Alkohol działa jako osobny tor zapisujący. Gdy jest termin odbioru/startu,
    // ma jeden tick wyłączności tak jak Brain i ekonomia.
    if(
      autoCfg.alcoholAutoEnabled &&
      !alcoholAuto.runtimeBusy &&
      !alcoholAuto.learning?.armed &&
      !state.localAI.busy &&
      !state.auto.inCycle &&
      !state.manual.semi.inCycle &&
      (!alcoholAuto.nextAt || Date.now()>=alcoholAuto.nextAt)
    ){
      const ap=alcoholProfileSelected();
      if(ap && (!ap.nextAt || Date.now()>=Number(ap.nextAt||0))){
        alcoholAutoCycle({force:false}); return;
      }
    }
    if(alcoholAuto.runtimeBusy) return;

    // LOCAL AI i pipeline ekonomiczny NIE mogą wykonywać requestów zapisujących równolegle.
    // v8.1.1 miało wyścig: localAiTick() startował, a zanim Brain odpowiedział,
    // ten sam scheduler uruchamiał autoCycle(). Wtedy localAiExecuteWorldAction()
    // widział state.auto.inCycle=true i odkładał akcję świata w nieskończoność.
    //
    // Zasada v8.1.2:
    // 1) jeśli cykl ekonomii/półautomatu trwa -> Brain czeka,
    // 2) jeśli Brain podejmuje decyzję -> ekonomia czeka,
    // 3) Local AI dostaje jeden tick wyłączności na start.
    if(
      autoCfg.localAiEnabled &&
      !state.localAI.busy &&
      !state.auto.inCycle &&
      !state.manual.semi.inCycle &&
      (!state.localAI.nextAt || Date.now()>=state.localAI.nextAt)
    ){
      localAiTick();
      return;
    }

    // Jeśli Brain już pracuje asynchronicznie, nie uruchamiaj w tle autoCycle.
    if(state.localAI.busy) return;

    if(state.manual.semi.enabled && !state.manual.semi.inCycle &&
       state.manual.semi.nextAt && Date.now()>=state.manual.semi.nextAt){
      semiDismantleCycle();
      return;
    }

    if(autoCfg.enabled && !state.auto.inCycle && state.auto.nextCycleAt && Date.now()>=state.auto.nextCycleAt){
      autoCycle(false);
      return;
    }

    if(!autoCfg.enabled && __mgSessionTemplate && !state.marketRefreshing &&
       (!state.marketNextAt || Date.now()>=state.marketNextAt)){
      refreshMarketOnly({silent:true});
    }
  }

  setInterval(__pomagierSchedulerTick,1000);

  if(ANDROID_APP){
    window.__POMAGIER_ANDROID_BACKGROUND_TICK__=()=>{
      try{
        __pomagierSchedulerTick();
        return `ok:${Date.now()}`;
      }catch(e){
        return `error:${String(e?.message||e)}`;
      }
    };
    // Po załadowaniu strony zsynchronizuj Foreground Service ze stanem Pomagiera.
    setTimeout(()=>androidSyncBackgroundMode(),700);
  }

  window.addEventListener('offline',()=>{
    if(autoCfg.enabled || recoveryResumePending){
      state.auto.recovery.active=true;
      state.auto.recovery.kind='transient';
      state.auto.recovery.reason=ANDROID_APP?'Aplikacja utraciła połączenie z internetem':'Komputer utracił połączenie z internetem';
      state.auto.recovery.nextAt=Date.now()+15000;
      state.auto.stage='RECOVERY: OFFLINE';
      state.auto.stageDetail='Brak internetu — czekam';
      state.auto.connection='OFFLINE';
      autoLogMsg('warn','SAMONAPRAWA: wykryto brak internetu.');
      render();
    }
  });

  window.addEventListener('online',()=>{
    if(state.auto.recovery.active || recoveryResumePending){
      state.auto.recovery.nextAt=Date.now()+1500;
      state.auto.stage='RECOVERY: SIEĆ WRÓCIŁA';
      state.auto.stageDetail='Internet wrócił — sprawdzam API';
      autoLogMsg('info','SAMONAPRAWA: internet wrócił, sprawdzam sesję.');
      render();
    }
  });

  hydrateNativeCache();
  state.auto.nextCycleAt = 0;
  state.marketNextAt = Date.now()+3000;

  if(recoveryResumePending){
    state.auto.stage='RECOVERY: START';
    state.auto.stageDetail='Awaryjny reload zakończony — czekam na świeżą sesję gry';
    state.auto.connection='RECOVERY';
    autoLogMsg('warn','SAMONAPRAWA: wykryto ważny bilet awaryjnego wznowienia.');
  }

  render();
  refreshAll(true);
  console.log('[Pomagier by Don] uruchomiono', {version:VERSION, dismantleCatalog:STATIC_DISMANTLE.length, pvpLab:true, bossLab:true});
})();
