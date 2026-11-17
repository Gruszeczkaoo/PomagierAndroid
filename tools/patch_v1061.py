from pathlib import Path
import sys

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
js=root/'app/src/main/assets/pomagier.user.js'
if not js.exists(): raise SystemExit('Brak pomager.user.js')
s=js.read_text(encoding='utf8')

def replace_once(old,new,reason):
    global s
    count=s.count(old)
    if count!=1: raise SystemExit(f'{reason}: oczekiwano 1 kotwicy, znaleziono {count}')
    s=s.replace(old,new,1)

replace_once('// @version      8.8.67','// @version      8.8.68','version userscript')
replace_once("const VERSION = '8.8.67';","const VERSION = '8.8.68';",'VERSION')
replace_once("const ANDROID_VERSION = '1.0.60';","const ANDROID_VERSION = '1.0.61';",'ANDROID_VERSION')
mod=Path(__file__).with_name('opponent_module_v1061.js').read_text(encoding='utf8')
replace_once('  // PvP ENGINE V2 SCANNER v8.8.55',mod+'\n  // PvP ENGINE V2 SCANNER v8.8.55','modul analizatora')
replace_once("    const kind=pvpLabApiKind(url); if(!kind) return;\n    try{\n      if(window.__MG_PVP_ENGINE_SCAN_ACTIVE__) pvpEngineScanCapture(url,data,meta);",
"""    const kind=pvpLabApiKind(url); if(!kind) return;
    // Profil innego gracza NIE moze nadpisac naszych statystyk i buildu.
    if(opponentLabProfilePath(url)){
      opponentLabObserveProfile(url,data,meta);
      return;
    }
    try{
      if(window.__MG_PVP_ENGINE_SCAN_ACTIVE__) pvpEngineScanCapture(url,data,meta);""",'izolacja wlasnego profilu')
replace_once('    return pvpLabUpsert(rec);\n  }\n\n  function pvpLabSetCurrent(kind,data){',
"""    const saved=pvpLabUpsert(rec);
    if(opponent?.id && (opponent.attributes || opponent.pvpSkills?.length || opponent.buildCode)) opponentLabObserveBattleFighter(opponent);
    return saved;
  }

  function pvpLabSetCurrent(kind,data){""",'obserwacja profilu w replayu')
# Dodatkowy jawny kod buildu, o ile API rzeczywiscie go przekazalo.
replace_once("    if(f.maxHp==null && raw.hp!=null) f.maxHp=pvpLabNum(raw.hp,null);",
"""    const exact=opponentLabCode(raw);
    if(exact) f.buildCode=exact;
    if(f.maxHp==null && raw.hp!=null) f.maxHp=pvpLabNum(raw.hp,null);""",'buildCode w replayu')
replace_once("      case 'pvpLab': return pvpLabHTML();","      case 'pvpLab': return pvpLabHTML();\n      case 'opponentLab': return opponentLabHTML();",'router')
replace_once("['pvpLab','PvP Lab'],['leagueLab','🏆 Liga Meneli']","['pvpLab','PvP Lab'],['opponentLab','🔎 Przeciwnicy'],['leagueLab','🏆 Liga Meneli']",'zakladka')
replace_once("    if(act==='pvp-sync'){ await pvpLabSync({silent:false}); return; }",
"""    if(act==='opp-sync'){ await pvpLabSync({silent:false}); render(); return; }
    if(act==='opp-filter'){
      const q=prompt('Wyszukaj przeciwnika po nicku lub ID. Puste = wszyscy:',opponentLab.filter||'');
      if(q!==null){opponentLab.filter=String(q).trim().slice(0,60);opponentLabSave();render();} return;
    }
    if(act==='opp-select'){
      const key=String(btn.dataset.oppKey||'');
      if(opponentLabAggregate().some(q=>q.key===key)){opponentLab.selectedKey=key;opponentLabSave();render();} return;
    }
    if(act==='opp-export'){await opponentLabExport();return;}
    if(act==='pvp-sync'){ await pvpLabSync({silent:false}); return; }""",'akcje analizatora')
# Potwierdzonych dodatkowych endpointow nie wymyslamy: odczyt tylko GET-ow otwartych przez gre.
replace_once("        // Liga Meneli: podglad tylko tych odpowiedzi, ktore sa zwiazane z liga.\n        try{",
"""        // Tylko publicznie odczytane profile tych przeciwnikow, ktorzy wystepuja w historii PvP.
        try{
          const url=candidateUrl || (typeof input==='string'?input:(input?.url||response?.url||''));
          if(__mgInternalApiDepth===0 && response?.ok && candidateMethod==='GET' && opponentLabProfilePath(url)){
            response.clone().json().then(d=>opponentLabObserveProfile(url,d,{method:'GET',source:'native-fetch'})).catch(()=>{});
          }
        }catch(e){console.warn('[MG Opponent Lab] fetch capture',e);}

        // Liga Meneli: podglad tylko tych odpowiedzi, ktore sa zwiazane z liga.
        try{""",'przechwytywanie fetch')
replace_once("                if(data && __mgInternalApiDepth===0 && bossLabApiKind(url)) bossLabObserveApi(url,data,{method:this.__mgNativeMethod||'GET',at:Date.now()});",
"""                if(data && __mgInternalApiDepth===0 && bossLabApiKind(url)) bossLabObserveApi(url,data,{method:this.__mgNativeMethod||'GET',at:Date.now()});
                if(data && __mgInternalApiDepth===0 && this.__mgNativeMethod==='GET' && opponentLabProfilePath(url)) opponentLabObserveProfile(url,data,{method:'GET',source:'native-xhr'});""",'przechwytywanie XHR')
# Diagnostyka Ligi: eksport byl pusty, bo przechwycil tylko /applications.
# Zapisujemy *wylacznie* sciezki GET i liczby wywolan; nigdy nie logujemy body z innych zasobow.
replace_once("  leagueLab.syncing=false;\n\n  function leagueLabAccountGuard(){",
"""  leagueLab.syncing=false;
  leagueLab.seenPaths=leagueLab.seenPaths && typeof leagueLab.seenPaths==='object'?leagueLab.seenPaths:{};

  function leagueLabTrackSeen(url,method='GET'){
    if(leagueLab.scanUntil<=Date.now() || String(method).toUpperCase()!=='GET') return;
    const u=pvpLabUrl(url);
    if(!u || u.origin!==location.origin || !u.pathname.startsWith('/api/')) return;
    // Wykluczone auth, wiadomosci, poczta i zapytania spoza gry.
    if(/\\/(?:auth|login|tokens?|session|messages?|mail|chat)(?:\\/|$)/i.test(u.pathname)) return;
    const path=u.pathname.replace(/\\d{8,}/g,':id').slice(0,150);
    if(Object.keys(leagueLab.seenPaths).length>=60 && !leagueLab.seenPaths[path]) return;
    const old=leagueLab.seenPaths[path]||{count:0};
    const now=Date.now();
    leagueLab.seenPaths[path]={count:old.count+1,lastAt:now};
    if(!old.lastAt || now-old.lastAt>900) leagueLabSave();
  }

  function leagueLabAccountGuard(){""",'diagnostyka Ligi')
replace_once("leagueLab={schema:1,characterId:id,startedAt:Date.now(),lastCaptureAt:0,lastSyncAt:0,scanUntil:0,\n        status:'NOWE KONTO — ODDZIELNY REJESTR',matches:[],endpoints:{},errors:[],syncing:false};",
"leagueLab={schema:1,characterId:id,startedAt:Date.now(),lastCaptureAt:0,lastSyncAt:0,scanUntil:0,\n        status:'NOWE KONTO — ODDZIELNY REJESTR',matches:[],endpoints:{},seenPaths:{},errors:[],syncing:false};",'liga guard')
replace_once("leagueLab={schema:1,characterId:pvpLabOwnId(),startedAt:Date.now(),lastCaptureAt:0,lastSyncAt:0,scanUntil:0,\n      status:'WYCZYSZCZONO',matches:[],endpoints:{},errors:[],syncing:false};",
"leagueLab={schema:1,characterId:pvpLabOwnId(),startedAt:Date.now(),lastCaptureAt:0,lastSyncAt:0,scanUntil:0,\n      status:'WYCZYSZCZONO',matches:[],endpoints:{},seenPaths:{},errors:[],syncing:false};",'liga clear')
replace_once("    const scanLeft=Math.max(0,Math.ceil((Number(leagueLab.scanUntil||0)-Date.now())/60000));\n    return `<div class=\"helper-hero\"><div><div class=\"helper-name\">🏆 Liga Meneli",
"""    const scanLeft=Math.max(0,Math.ceil((Number(leagueLab.scanUntil||0)-Date.now())/60000));
    const discovered=Object.entries(leagueLab.seenPaths||{}).sort((a,b)=>Number(b[1].lastAt||0)-Number(a[1].lastAt||0)).slice(0,30)
      .map(([path,x])=>`<div class="sub">GET ${esc(path)} • ${Number(x.count)||0}x</div>`).join('');
    return `<div class="helper-hero"><div><div class="helper-name">🏆 Liga Meneli""",'diag UI start')
replace_once("      <div class=\"section note\">Liga to rozgrywki gangów:",
"""      <div class="section"><div class="section-title">Diagnostyka ścieżek GET podczas skanu (${Object.keys(leagueLab.seenPaths||{}).length})</div>
      <div class="sub">Pierwszy eksport wykazał tylko /api/gangs/462/applications, bez meczów. Tutaj pokażemy, co gra naprawdę pobiera przy otwieraniu Ligi — same ścieżki, bez treści odpowiedzi i tokenów.</div>${discovered||'<div class="sub">Brak zarejestrowanych odczytów GET.</div>'}</div>
      <div class="section note">Liga to rozgrywki gangów:""",'diag UI end')
replace_once("          if(__mgInternalApiDepth===0 && response?.ok && isSameOriginApiUrl(url) &&\n             (leagueLabPathMatches(url)||leagueLab.scanUntil>Date.now())){",
"""          if(__mgInternalApiDepth===0 && response?.ok && isSameOriginApiUrl(url)) leagueLabTrackSeen(url,candidateMethod);
          if(__mgInternalApiDepth===0 && response?.ok && isSameOriginApiUrl(url) &&
             (leagueLabPathMatches(url)||leagueLab.scanUntil>Date.now())){""",'league seen fetch')
replace_once("                if(data && __mgInternalApiDepth===0 && (leagueLabPathMatches(url)||leagueLab.scanUntil>Date.now())) leagueLabCapture(url,data,{method:this.__mgNativeMethod||'GET',source:'native-xhr'});",
"""                if(data && __mgInternalApiDepth===0) leagueLabTrackSeen(url,this.__mgNativeMethod||'GET');
                if(data && __mgInternalApiDepth===0 && (leagueLabPathMatches(url)||leagueLab.scanUntil>Date.now())) leagueLabCapture(url,data,{method:this.__mgNativeMethod||'GET',source:'native-xhr'});""",'league seen xhr')

for k in ["function opponentLabHTML(){","function opponentLabObserveProfile(","case 'opponentLab': return opponentLabHTML();","if(act==='opp-select')", "leagueLabTrackSeen(url,candidateMethod)","// @version      8.8.68"]:
    if k not in s: raise SystemExit('Brak wymaganej zmiany '+k)
js.write_text(s,encoding='utf8')

g=root/'app/build.gradle.kts'; t=g.read_text(encoding='utf8')
if 'versionCode = 10060' not in t or 'versionName = "1.0.60"' not in t: raise SystemExit('Wymagana wersja Gradle 1.0.60')
t=t.replace('versionCode = 10060','versionCode = 10061',1).replace('versionName = "1.0.60"','versionName = "1.0.61"',1)
g.write_text(t,encoding='utf8')
readme=root/'README.md'
if readme.exists():
    readme.write_text(readme.read_text(encoding='utf8')+'''\n\n## v1.0.61 / 8.8.68 — Analizator przeciwnika PvP\n- Nowa zakladka Przeciwnicy: bilans spotkan, mediany HP i regeneracji, obserwowane krytyki, podwojne uderzenia i kontry.\n- Pelne atrybuty i wybor skilli A/B tylko po potwierdzeniu w odpowiedzi API gry; brak ukrytego zgadywania.\n- Przechwytuje legalne GET-y profilu konkretnego przeciwnika juz otwierane przez gracza.\n- Oddziela dane przeciwnikow od snapshotu wlasnego PvP, zapisuje profile per konto, eksportuje niezalezny JSON.\n- Liga Meneli: bezpieczne logowanie *samych sciezek GET* podczas skanu do diagnozy pustego eksportu. Bez zapisu tresci cudzych endpointow.\n''',encoding='utf8')
print('OK v1.0.61 / 8.8.68')