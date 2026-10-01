from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak userscriptu")
s=js.read_text(encoding="utf-8")

if "// @version      8.8.58" not in s:
    raise SystemExit("Oczekiwano JS 8.8.58")
s=s.replace("// @version      8.8.58","// @version      8.8.59",1)
s=s.replace("const VERSION = '8.8.58';","const VERSION = '8.8.59';",1)
s=s.replace("const ANDROID_VERSION = '1.0.51';","const ANDROID_VERSION = '1.0.52';",1)

note="""  // v8.8.59 FULL TAB ROUTER RECOVERY:
  // - przywraca wszystkie zakladki usuniete omylkowo przez render v1.0.50/1.0.51,
  // - router jest teraz jeden i sprawdzany automatycznie wzgledem wszystkich przyciskow data-tab,
  // - klikniecie zakladki ma priorytet nad blokada momentum scrolla i otwiera ekran natychmiast,
  // - zachowuje touch-scroll lock v1.0.51 dla odswiezania w tle,
  // - build przerywa sie, jesli nowa zakladka nie ma przypisanego renderera.
"""
anchor="  // v8.8.58"
p=s.find(anchor)
if p>=0 and note not in s:
    s=s[:p]+note+s[p:]

# -----------------------------------------------------------------
# Rozpoznaj faktyczne zakladki z finalnego UI po calym lancuchu patchy.
# -----------------------------------------------------------------
tabs_anchor='<div class="tabs">'
ti=s.find(tabs_anchor)
if ti<0:
    raise SystemExit("Nie znaleziono listy zakladek")
te=s.find('</div>',ti)
if te<0:
    raise SystemExit("Nie znaleziono konca listy zakladek")
tabs_segment=s[ti:te]
tab_keys=re.findall(r"\['([^']+)','[^']+'\]",tabs_segment)
if not tab_keys:
    raise SystemExit("Nie odczytano kluczy zakladek")

# Kazdy klucz ma jawny renderer. Dla Wysypiska zachowujemy kilka historycznych nazw klucza.
renderer_candidates={
    'dashboard':['dashboardHTML'],
    'crafting':['craftingHTML'],
    'resources':['resourcesHTML'],
    'watch':['watchHTML'],
    'sessions':['sessionsHTML'],
    'history':['historyHTML'],
    'actions':['actionHistoryHTML'],
    'diagnostics':['diagnosticsHTML'],
    'autopilot':['autopilotHTML'],
    'manual':['manualDismantleHTML'],
    'pvpLab':['pvpLabHTML'],
    'bossLab':['bossLabHTML'],
    'alcohol':['alcoholAutomationHTML'],
    'raids':['raidDiagnosticsHTML'],
    'npc':['localAiNpcPageHTML'],
    'company':['companyAutoHTML'],
    'collections':['collectionShopHTML'],
    'purchases':['purchaseHistoryHTML'],
    'payouts':['gangPayoutHTML'],
    'security':['securityLabHTML'],
    'dumpLab':['dumpLabHTML'],
    'dump':['dumpLabHTML'],
    'wysypisko':['dumpLabHTML'],
    'wysypiskoLab':['dumpLabHTML'],
    'settings':['settingsHTML'],
}

resolved={}
unresolved=[]
for key in tab_keys:
    candidates=renderer_candidates.get(key,[])
    fn=next((name for name in candidates if re.search(r"\bfunction\s+"+re.escape(name)+r"\s*\(",s)),None)
    if not fn:
        unresolved.append((key,candidates))
    else:
        resolved[key]=fn

if unresolved:
    raise SystemExit("BRAK ROUTERA DLA ZAKLADEK: "+repr(unresolved)+" | TABY="+repr(tab_keys))

# Zachowaj takze stare ukryte trasy, jesli ich funkcje istnieja.
for key,candidates in renderer_candidates.items():
    if key in resolved: continue
    fn=next((name for name in candidates if re.search(r"\bfunction\s+"+re.escape(name)+r"\s*\(",s)),None)
    if fn:
        resolved[key]=fn

# -----------------------------------------------------------------
# Podmien render v1.0.51: touch lock zostaje, ale renderer obejmuje 100% zakladek.
# -----------------------------------------------------------------
a=s.find("  const __mgPanelScrollByTab=Object.create(null);")
b=s.find("  function updateHeader()",a)
if a<0 or b<0:
    raise SystemExit("Brak render v1.0.51")

switch_lines=[]
for key,fn in resolved.items():
    switch_lines.append("      case "+repr(key)+": return "+fn+"();")
switch_code="\n".join(switch_lines)

new_render="""  const __mgPanelScrollByTab=Object.create(null);
  let __mgPanelTouching=false;
  let __mgPanelScrollHoldUntil=0;
  let __mgPanelRenderPending=false;
  let __mgPanelRenderTimer=null;

  function __mgPanelBusyScrolling(){
    return __mgPanelTouching || Date.now()<Number(__mgPanelScrollHoldUntil||0);
  }

  function __mgPanelRememberScroll(){
    const body=panel?.querySelector?.('.content');
    if(!body) return;
    const tab=String(body.dataset?.renderedTab||state.activeTab||'');
    if(tab) __mgPanelScrollByTab[tab]=Math.max(0,Number(body.scrollTop||0));
  }

  function __mgPanelScheduleRender(delay=350){
    __mgPanelRenderPending=true;
    if(__mgPanelRenderTimer) clearTimeout(__mgPanelRenderTimer);
    __mgPanelRenderTimer=setTimeout(()=>{
      __mgPanelRenderTimer=null;
      if(__mgPanelBusyScrolling()){ __mgPanelScheduleRender(280); return; }
      if(!__mgPanelRenderPending) return;
      __mgPanelRenderPending=false;
      render();
    },Math.max(80,Number(delay)||350));
  }

  function __mgRenderTabHTML(tab){
    switch(String(tab||'')){
__SWITCH__
      default:
        return '<div class="section note"><b>Blad routera UI:</b> brak renderera zakladki <code>'+esc(String(tab||''))+'</code>.</div>';
    }
  }

  function render(force=false){
    const body=panel.querySelector('.content');
    __mgPanelRememberScroll();

    if(!force && __mgPanelBusyScrolling()){
      __mgPanelScheduleRender(300);
      updateHeader();
      return;
    }

    if(force){
      __mgPanelTouching=false;
      __mgPanelScrollHoldUntil=0;
      if(__mgPanelRenderTimer){ clearTimeout(__mgPanelRenderTimer); __mgPanelRenderTimer=null; }
      __mgPanelRenderPending=false;
    }

    const targetTab=String(state.activeTab||'autopilot');
    const wanted=Math.max(0,Number(__mgPanelScrollByTab[targetTab]||0));
    const tabs=panel.querySelectorAll('.tab');
    tabs.forEach(t=>t.classList.toggle('active',t.dataset.tab===targetTab));

    const advBtn=panel.querySelector('[data-act="toggle-advanced-ui"]');
    if(advBtn) advBtn.textContent=advancedUiOpen?'▴ Mniej':'☰ Więcej';

    body.innerHTML=__mgRenderTabHTML(targetTab);
    body.dataset.renderedTab=targetTab;

    const restore=()=>{
      if(!force && __mgPanelBusyScrolling()) return;
      if(String(state.activeTab||'')!==targetTab) return;
      const max=Math.max(0,Number(body.scrollHeight||0)-Number(body.clientHeight||0));
      const y=Math.min(wanted,max);
      if(Math.abs(Number(body.scrollTop||0)-y)>1) body.scrollTop=y;
      __mgPanelScrollByTab[targetTab]=y;
    };

    restore();
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(restore);
    updateHeader();
  }

""".replace("__SWITCH__",switch_code)

s=s[:a]+new_render+s[b:]

# -----------------------------------------------------------------
# Klik zakladki jest akcja uzytkownika, wiec nie moze czekac 0.7-1.2 s na momentum lock.
# -----------------------------------------------------------------
old_tab="    const tab=e.target.closest('[data-tab]'); if(tab){state.activeTab=tab.dataset.tab;safeLocalStorageSet(K.tab,state.activeTab);render();return;}"
new_tab="""    const tab=e.target.closest('[data-tab]'); if(tab){
      __mgPanelRememberScroll();
      __mgPanelTouching=false;
      __mgPanelScrollHoldUntil=0;
      if(__mgPanelRenderTimer){ clearTimeout(__mgPanelRenderTimer); __mgPanelRenderTimer=null; }
      __mgPanelRenderPending=false;
      state.activeTab=tab.dataset.tab;
      safeLocalStorageSet(K.tab,state.activeTab);
      render(true);
      return;
    }"""
if old_tab not in s:
    raise SystemExit("Nie znaleziono glownego handlera klikniecia zakladki")
s=s.replace(old_tab,new_tab,1)

# Akcje, ktore same przelaczaja zakladke, tez maja otwierac ja od razu.
s=s.replace("state.activeTab='autopilot'; safeLocalStorageSet(K.tab,state.activeTab); render(); return;",
            "state.activeTab='autopilot'; safeLocalStorageSet(K.tab,state.activeTab); render(true); return;",1)
s=s.replace("state.activeTab='sessions';\n      safeLocalStorageSet(K.tab,state.activeTab);\n      render();",
            "state.activeTab='sessions';\n      safeLocalStorageSet(K.tab,state.activeTab);\n      render(true);",1)

# -----------------------------------------------------------------
# Twarde testy regresji routera.
# -----------------------------------------------------------------
ra=s.find("  function __mgRenderTabHTML(tab){")
rb=s.find("  function render(force=false)",ra)
router_chunk=s[ra:rb] if ra>=0 and rb>ra else ""
missing_routes=[k for k in tab_keys if ("case "+repr(k)+":") not in router_chunk]
if missing_routes:
    raise SystemExit("ROUTER NIEKOMPLETNY: "+repr(missing_routes))

# Kluczowe zakladki z filmu musza byc obslugiwane, jesli istnieja w pasku.
critical=['alcohol','raids','npc','company','collections','purchases','payouts','security','actions','diagnostics']
for k in critical:
    if k in tab_keys and ("case "+repr(k)+":") not in router_chunk:
        raise SystemExit("BRAK KRYTYCZNEJ ZAKLADKI: "+k)

dump_keys=[k for k in tab_keys if k.lower() in ('dumplab','dump','wysypisko','wysypiskolab')]
if any('Wysypisko' in x for x in re.findall(r"\['[^']+','([^']+)'\]",tabs_segment)) and not dump_keys:
    raise SystemExit("Wysypisko Lab jest w UI, ale nie rozpoznano jego klucza")
for k in dump_keys:
    if ("case "+repr(k)+": return dumpLabHTML();") not in router_chunk:
        raise SystemExit("Wysypisko Lab bez dumpLabHTML: "+k)

checks=[
    "// @version      8.8.59",
    "const ANDROID_VERSION = '1.0.52';",
    "function __mgRenderTabHTML(tab)",
    "function render(force=false)",
    "render(true);",
    "case 'alcohol': return alcoholAutomationHTML();",
    "case 'raids': return raidDiagnosticsHTML();",
    "case 'npc': return localAiNpcPageHTML();",
    "case 'company': return companyAutoHTML();",
    "case 'collections': return collectionShopHTML();",
    "case 'purchases': return purchaseHistoryHTML();",
    "case 'payouts': return gangPayoutHTML();",
    "case 'security': return securityLabHTML();",
    "case 'actions': return actionHistoryHTML();",
    "case 'diagnostics': return diagnosticsHTML();",
]
for x in checks:
    if x not in s:
        raise SystemExit("v1.0.52 NIEKOMPLETNA: "+x)

print("TABY FINALNE:",tab_keys)
print("ROUTER FINALNY:",resolved)
print("OK: wszystkie widoczne zakladki maja renderer")
print("OK: klik zakladki omija momentum-lock")
print("OK: touch-scroll lock pozostaje dla renderow w tle")

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
if "versionCode = 10051" not in t or 'versionName = "1.0.51"' not in t:
    raise SystemExit("Oczekiwano Android 1.0.51")
t=t.replace("versionCode = 10051","versionCode = 10052",1)
t=t.replace('versionName = "1.0.51"','versionName = "1.0.52"',1)
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.52 / userscript 8.8.59" not in r:
        r += """

## v1.0.52 / userscript 8.8.59 - Full Tab Router Recovery
- Przywrocony kompletny router wszystkich zakladek Pomagiera.
- Naprawione martwe zakladki po regresji v1.0.50/v1.0.51.
- Klikniecie zakladki otwiera ja natychmiast i nie czeka na blokade momentum przewijania.
- Touch-scroll lock pozostaje aktywny tylko dla automatycznych renderow w tle.
- Build sprawdza zgodnosc kazdego widocznego data-tab z rendererem i przerwie sie przy brakujacej trasie.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.52 applied")
