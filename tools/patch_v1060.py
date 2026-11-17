from pathlib import Path
import sys

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
js=root/'app/src/main/assets/pomagier.user.js'
if not js.exists():raise SystemExit('Brak userscriptu')
s=js.read_text(encoding='utf8')
if "// @version      8.8.66" not in s or "const ANDROID_VERSION = '1.0.59';" not in s:
    raise SystemExit('Wymagana baza 1.0.59 / 8.8.66')
s=s.replace('// @version      8.8.66','// @version      8.8.67',1)
s=s.replace("const VERSION = '8.8.66';","const VERSION = '8.8.67';",1)
s=s.replace("const ANDROID_VERSION = '1.0.59';","const ANDROID_VERSION = '1.0.60';",1)

module_path=Path(__file__).with_name('league_module.js')
module=module_path.read_text(encoding='utf8')
anchor='  // PvP ENGINE V2 SCANNER v8.8.55'
if s.count(anchor)!=1:raise SystemExit('Brak jedynej kotwicy PvP Engine')
s=s.replace(anchor,module+anchor,1)

anchor="        try{\n          if(menelLearnReq){"
if s.count(anchor)!=1:raise SystemExit('Brak fetch bridge anchor')
s=s.replace(anchor,"""        // Liga Meneli: podglad tylko tych odpowiedzi, ktore sa zwiazane z liga.
        try{
          const url=candidateUrl || (typeof input==='string'?input:(input?.url||response?.url||''));
          if(__mgInternalApiDepth===0 && response?.ok && isSameOriginApiUrl(url) &&
             (leagueLabPathMatches(url)||leagueLab.scanUntil>Date.now())){
            response.clone().json().then(d=>leagueLabCapture(url,d,{method:candidateMethod,source:'native-fetch'})).catch(()=>{});
          }
        }catch(e){console.warn('[MG Liga Meneli] fetch capture',e);}

"""+anchor,1)

anchor="                if(data && __mgInternalApiDepth===0 && bossLabApiKind(url)) bossLabObserveApi(url,data,{method:this.__mgNativeMethod||'GET',at:Date.now()});"
if s.count(anchor)!=1:raise SystemExit('Brak XHR bridge anchor')
s=s.replace(anchor,anchor+"\n                if(data && __mgInternalApiDepth===0 && (leagueLabPathMatches(url)||leagueLab.scanUntil>Date.now())) leagueLabCapture(url,data,{method:this.__mgNativeMethod||'GET',source:'native-xhr'});",1)

anchor="  function pvpLabObserveSocketMessage(data){\n"
if s.count(anchor)!=1:raise SystemExit('Brak socket bridge anchor')
s=s.replace(anchor,anchor+"""    // Liga jest osobnym zrodlem, takze gdy pasywne PvP jest wylaczone.
    try{
      const packet=pvpLabParseSocketPacket(data);
      if(Array.isArray(packet) && /(?:league|liga|gang.?war)/i.test(String(packet[0]||'')) && packet[1]){
        leagueLabCapture('/api/league/socket/'+encodeURIComponent(String(packet[0]).slice(0,80)),packet[1],{method:'WS',source:'native-ws'});
      }
    }catch(_){ }
""",1)

anchor="['pvpLab','PvP Lab'],['bossLab','Boss Lab']"
if s.count(anchor)!=1:raise SystemExit('Brak UI tab anchor')
s=s.replace(anchor,"['pvpLab','PvP Lab'],['leagueLab','🏆 Liga Meneli'],['bossLab','Boss Lab']",1)

anchor="      case 'pvpLab': return pvpLabHTML();"
if s.count(anchor)!=1:raise SystemExit('Brak UI router anchor')
s=s.replace(anchor,anchor+"\n      case 'leagueLab': return leagueLabHTML();",1)

anchor="    if(act==='pvp-sync'){ await pvpLabSync({silent:false}); return; }"
if s.count(anchor)!=1:raise SystemExit('Brak actions anchor')
s=s.replace(anchor,"""    if(act==='league-start'){ leagueLabStart(); return; }
    if(act==='league-stop'){ leagueLabStop(); return; }
    if(act==='league-sync'){ await leagueLabSync({silent:false}); return; }
    if(act==='league-export'){ await leagueLabExport(); return; }
    if(act==='league-clear'){ leagueLabClear(); return; }
"""+anchor,1)

anchor="    if(pvpLab.syncing) return;\n\n    if((state.auto.recovery.active || recoveryResumePending)"
if s.count(anchor)!=1:raise SystemExit('Brak scheduler anchor')
s=s.replace(anchor,"""    if(pvpLab.syncing) return;

    // Liga Meneli: lekki auto-sync co 30 minut tylko dla GET-ow juz poznanych
    // podczas korzystania z ligi, nie zgadujemy nowych endpointow.
    if(__mgSessionTemplate && !leagueLab.syncing && !state.localAI.busy && !state.auto.inCycle &&
      !state.manual.semi.inCycle && !alcoholAuto.runtimeBusy &&
      Object.values(leagueLab.endpoints||{}).some(e=>e?.method==='GET' && leagueLabPathMatches(e.path)) &&
      Date.now()-Number(leagueLab.lastSyncAt||0)>30*60000){
      leagueLabSync({silent:true});
      return;
    }

    if((state.auto.recovery.active || recoveryResumePending)""",1)

for k in ["const LEAGUE_LAB_KEY=","function leagueLabCapture(","function leagueLabHTML(","case 'leagueLab': return leagueLabHTML();", "if(act==='league-export')", "leagueLabSync({silent:true})", "// @version      8.8.67"]:
    if k not in s:raise SystemExit('Brak zmiany '+k)
js.write_text(s,encoding='utf8')

g=root/'app/build.gradle.kts';t=g.read_text(encoding='utf8')
if 'versionCode = 10059' not in t or 'versionName = "1.0.59"' not in t:raise SystemExit('Gradle nie jest v1.0.59')
t=t.replace('versionCode = 10059','versionCode = 10060',1).replace('versionName = "1.0.59"','versionName = "1.0.60"',1)
g.write_text(t,encoding='utf8')
readme=root/'README.md'
if readme.exists():
    r=readme.read_text(encoding='utf8')
    r+='''\n\n## v1.0.60 / userscript 8.8.67 — Liga Meneli Lab (READ-ONLY)\n- Osobna zakladka **Liga Meneli**: mecze gangow, wyniki XP, status, historia, odkryte endpointy.\n- Przechwytywanie bezpiecznych odpowiedzi z API ligi: fetch, XHR i eventy WebSocket.\n- Eksport JSON z redakcja sekretow / tokenow. Nasluch 10 min uczy rzeczywistych endpointow gry; odczyty GET mozna ponawiac co 30 min.\n- Nie sa wykonywane ataki, zakupy ani reset punktow. Liga nie miesza sie z PvP 1v1.\n- Bez zmyslania endpointow: szczegolowy parser moze zostac dopracowany po pierwszym eksporcie z gry.\n'''
    readme.write_text(r,encoding='utf8')
print('Applied v1.0.60 / 8.8.67 Liga Meneli Lab')