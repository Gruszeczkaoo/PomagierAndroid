from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
js = root / "app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak pomagier.user.js")

s = js.read_text(encoding="utf-8")

s = s.replace("// @version      8.8.34", "// @version      8.8.35", 1)
s = s.replace("const VERSION = '8.8.34';", "const VERSION = '8.8.35';", 1)
s = s.replace("const ANDROID_VERSION = '1.0.27';", "const ANDROID_VERSION = '1.0.28';", 1)

anchor = "  // v8.8.34"
note = """  // v8.8.35 SPÓŁKA ETA:
  // - zakładka Spółka pokazuje szacowaną datę zakończenia całej aktualnie planowanej ścieżki AUTO,
  // - pokazuje także łączny pozostały czas ścieżki,
  // - ETA uwzględnia aktywną inwestycję, oczekiwanie na fundusz, czas realizacji i wzrost dochodu po kolejnych krokach,
  // - data jest automatycznie przeliczana po każdym odświeżeniu, ukończeniu inwestycji i zmianie wybranego wykonawcy,
  // - przy dalszych zablokowanych inwestycjach interfejs wyraźnie oznacza ETA jako szacunkowe.
"""
if note not in s:
    p = s.find(anchor)
    if p >= 0:
        s = s[:p] + note + s[p:]

# Dodaj obliczenia ETA w companyAutoHTML.
needle = """    const steps=p&&Array.isArray(p.steps)?p.steps:[];
    const route=steps.slice(0,12).map((x,i)=>{"""
replace = """    const steps=p&&Array.isArray(p.steps)?p.steps:[];
    const routeMinutes=p&&Number.isFinite(Number(p.minutes))?Math.max(0,Number(p.minutes)):null;
    const routeEtaAt=routeMinutes==null?null:Date.now()+routeMinutes*60000;
    const routeEtaText=routeEtaAt==null?'—':new Date(routeEtaAt).toLocaleString('pl-PL',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    const routeRemainingText=routeMinutes==null?'—':companyMinutes(routeMinutes);
    const route=steps.slice(0,12).map((x,i)=>{"""
if needle not in s:
    raise SystemExit("Nie znaleziono miejsca obliczeń ETA")
s = s.replace(needle, replace, 1)

# Dodaj dwie karty do podsumowania.
needle = """        '<div class="card"><div class="label">Scheduler</div><div class="big">'+(companyAuto.enabled?'ON':'OFF')+'</div><div>'+(companyAuto.enabled&&nextIn?'kolejny check ~'+Math.ceil(nextIn/60)+' min':'—')+'</div></div>'+
      '</div>'+"""
replace = """        '<div class="card"><div class="label">Scheduler</div><div class="big">'+(companyAuto.enabled?'ON':'OFF')+'</div><div>'+(companyAuto.enabled&&nextIn?'kolejny check ~'+Math.ceil(nextIn/60)+' min':'—')+'</div></div>'+
        '<div class="card"><div class="label">Szacowane zakończenie AUTO</div><div class="big" style="font-size:13px">'+routeEtaText+'</div><div>'+(routeMinutes==null?'najpierw przelicz plan':'dynamiczna prognoza')+'</div></div>'+
        '<div class="card"><div class="label">Pozostały czas całej ścieżki</div><div class="big">'+routeRemainingText+'</div><div>'+(routeMinutes==null?'—':'od teraz do końca planu')+'</div></div>'+
      '</div>'+"""
if needle not in s:
    raise SystemExit("Nie znaleziono kart Spółki")
s = s.replace(needle, replace, 1)

# Rozszerz opis sekcji, żeby jasno wskazać charakter prognozy.
needle = """      '<div class="section"><b>Najkrótsza prognozowana ścieżka mieszana</b><div class="sub">Planner przelicza zależności i finansowanie po każdym kroku. Dla przyszłych zablokowanych inwestycji używa kosztu/czasu bazowego; przed realnym START-em zawsze pobiera świeże oferty wykonawców.</div>'+"""
replace = """      '<div class="section"><b>Najkrótsza prognozowana ścieżka mieszana</b><div class="sub">Szacowany koniec: <b>'+routeEtaText+'</b> • pozostało: <b>'+routeRemainingText+'</b>. Planner przelicza zależności i finansowanie po każdym kroku. Dla przyszłych zablokowanych inwestycji używa kosztu/czasu bazowego; gdy staną się dostępne, pobiera świeże oferty wykonawców i aktualizuje ETA.</div>'+"""
if needle not in s:
    raise SystemExit("Nie znaleziono opisu ścieżki")
s = s.replace(needle, replace, 1)

js.write_text(s, encoding="utf-8")

bg = root / "app/build.gradle.kts"
if bg.exists():
    t = bg.read_text(encoding="utf-8")
    t = t.replace("versionCode = 10027", "versionCode = 10028")
    t = t.replace('versionName = "1.0.27"', 'versionName = "1.0.28"')
    bg.write_text(t, encoding="utf-8")

readme = root / "README.md"
if readme.exists():
    r = readme.read_text(encoding="utf-8")
    if "## v1.0.28 / userscript 8.8.35" not in r:
        r += """

## v1.0.28 / userscript 8.8.35
- Spółka pokazuje szacowaną datę zakończenia całej aktualnie planowanej ścieżki AUTO.
- Pokazuje łączny pozostały czas od teraz do końca planu.
- ETA uwzględnia aktywną inwestycję, oczekiwanie na fundusz, czas realizacji i przyrost dochodu.
- Prognoza jest automatycznie aktualizowana po każdym przeliczeniu i po pobraniu świeżych ofert wykonawców.
"""
    readme.write_text(r, encoding="utf-8")

print("v1.0.28 patch applied")
