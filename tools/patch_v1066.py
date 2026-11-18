"""Pomagier v1.0.66 — poprawne przechwytywanie API Ligi Meneli pod /api/rivals.

Patch uruchamiamy po v1.0.65. Nie zmienia mechanizmu wykonywania atakow.
"""
from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
p=root/'app/src/main/assets/pomagier.user.js'
s=p.read_text(encoding='utf-8')

def one(old,new,label):
    global s
    n=s.count(old)
    if n!=1: raise SystemExit(f'v1066 {label}: wymagane 1 wystapienie, znaleziono {n}')
    s=s.replace(old,new,1)

one('// @version      8.8.72','// @version      8.8.73','userscript metadata')
one("const VERSION = '8.8.72';","const VERSION = '8.8.73';",'userscript constant')
one("const ANDROID_VERSION = '1.0.65';","const ANDROID_VERSION = '1.0.66';",'Android constant')

old='''    if(!p) return false;
    // Nazwy API ligi nie sa z gory zakladane jako jeden konkretny endpoint.
    if(/(?:^|\\/|[-_])(?:league|leagues|liga|ligameneli|gangleague|gangliga|gang-war|gangwar)(?:\\/|$|[-_])/.test(p)) return true;'''
new='''    if(!p) return false;
    // Zweryfikowane z rzeczywistego eksportu Liga Meneli (2026-11-18):
    // /api/rivals/462/{overview,status,schedule,ranking,matches,reward-rates}
    // /api/rivals/462/matches/404/attacks.
    // Id musi odpowiadac biezacemu kontu: nie archiwizujemy innych sesji.
    const rivals=p.match(/^\\/api\\/rivals\\/(\\d+)\\/(.+)$/);
    if(rivals && Number(rivals[1])===Number(pvpLabOwnId()||0)){
      if(/^(?:overview|status|schedule|ranking|reward-rates|matches)$/.test(rivals[2])) return true;
      if(/^matches\\/\\d+\\/attacks$/.test(rivals[2])) return true;
    }
    // Starsze wersje ligi i alternatywne oficjalne trasy pozostaja obslugiwane.
    if(/(?:^|\\/|[-_])(?:league|leagues|liga|ligameneli|gangleague|gangliga|gang-war|gangwar)(?:\\/|$|[-_])/.test(p)) return true;'''
one(old,new,'liga path regex')

old='''    const paths=Object.values(leagueLab.endpoints).filter(x=>x?.method==='GET' && leagueLabPathMatches(x.path))'''
new='''    // Szczegoly jednego meczu sa zalezne od jego ID. Nie powtarzamy
    // automatycznie starych adresow /matches/{id}/attacks.
    const paths=Object.values(leagueLab.endpoints).filter(x=>x?.method==='GET' && leagueLabPathMatches(x.path) &&
      !/\\/api\\/rivals\\/\\d+\\/matches\\/\\d+\\/attacks(?:\\?|$)/i.test(x.path))'''
one(old,new,'no stale details re-fetch')

old='''      <div class="note" style="margin-top:10px">Pierwszy raz: uruchom skan, przejdź w grze do <b>Gang → Liga Meneli</b> i otwórz kolejno <b>Dziś, Terminarz, Ranking, Archiwum</b> oraz szczegóły wybranej potyczki.'''
new='''      <div class="note" style="margin-top:10px">Liga Meneli korzysta w tej wersji z potwierdzonych endpointow <b>/api/rivals/&lt;ID&gt;/...</b>. Uruchom skan i otworz w grze <b>Liga Meneli → Dziś, Terminarz, Ranking, Archiwum</b> oraz szczegóły wybranego meczu.'''
one(old,new,'UI hint')

# Wczesniej diagnostyka przechwytywala same adresy, bez wynikow.
# Dokladne struktury ligi poznamy w nastepnym eksporcie JSON (bez tokenow).
p.write_text(s,encoding='utf-8')
g=root/'app/build.gradle.kts'
z=g.read_text(encoding='utf-8')
if z.count('versionCode = 10065')!=1 or z.count('versionName = "1.0.65"')!=1:
    raise SystemExit('v1066 expected Android 1.0.65')
z=z.replace('versionCode = 10065','versionCode = 10066',1).replace('versionName = "1.0.65"','versionName = "1.0.66"',1)
g.write_text(z,encoding='utf-8')
r=root/'README.md'
if r.exists():
    r.write_text(r.read_text(encoding='utf-8')+'''\n\n## v1.0.66 / userscript 8.8.73\n- Naprawa przechwytywania danych Ligi Meneli: potwierdzone trasy GET /api/rivals/:characterId/{overview,status,schedule,ranking,matches,reward-rates} i /matches/:matchId/attacks.\n- Rozpoznane odpowiedzi trafiaja do osobnego rejestru, eksport zawiera bezpieczne próbki schematu.\n- Niepowtarzanie starego GET szczegolow meczu podczas automatycznej synchronizacji.\n- Bez zmiany autoatakow o prestiz, bez zgadywania wygranej ligi z nieznanych pol.\n''',encoding='utf-8')
print('OK 1.0.66 / 8.8.73')