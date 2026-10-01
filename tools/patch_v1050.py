from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak userscriptu")
s=js.read_text(encoding="utf-8")

if "// @version      8.8.56" not in s:
    raise SystemExit("Oczekiwano JS 8.8.56")
s=s.replace("// @version      8.8.56","// @version      8.8.57",1)
s=s.replace("const VERSION = '8.8.56';","const VERSION = '8.8.57';",1)
s=s.replace("const ANDROID_VERSION = '1.0.49';","const ANDROID_VERSION = '1.0.50';",1)

note="""  // v8.8.57 UI SCROLL STABILITY + PvP TOP DEDUP:
  // - naprawia samoczynne skoki listy Pomagiera w gore/dol przy cyklicznym render(),
  // - zapamietuje scroll osobno dla kazdej zakladki i odtwarza go po przebudowie DOM,
  // - wylacza scroll anchoring WebView, ktory potegowal skoki po zmianie wysokosci elementow,
  // - skaner PvP ma stale miejsce w layoucie; timer nie dopina juz panelu nad aktualnym viewportem,
  // - timer skanera zmienia HTML tylko gdy tresc faktycznie sie zmienila,
  // - TOP optimizera PvP jest deduplikowany po kodzie buildu,
  // - wynik modelu jest wyraznie oddzielony od empirycznego rankingu faktycznie rozegranych buildow.
"""
anchor="  // v8.8.56"
p=s.find(anchor)
if p>=0 and note not in s:
    s=s[:p]+note+s[p:]

def func_bounds(text,name):
    m=re.search(r"^  (?:async )?function "+re.escape(name)+r"\(",text,re.M)
    if not m:
        raise SystemExit("Brak funkcji "+name)
    n=re.search(r"^  (?:async )?function [A-Za-z0-9_]+\(",text[m.end():],re.M)
    return m.start(), (m.end()+n.start()) if n else len(text)

old_css="#mg-mega-premium .content{height:calc(100% - 112px);overflow:auto;overflow-x:hidden;padding:10px}"
new_css="#mg-mega-premium .content{height:calc(100% - 112px);overflow:auto;overflow-x:hidden;padding:10px;overflow-anchor:none;overscroll-behavior:contain;scroll-behavior:auto}"
if old_css not in s:
    raise SystemExit("Brak CSS .content")
s=s.replace(old_css,new_css,1)

ra,rb=func_bounds(s,"render")
new_render=r"""  const __mgPanelScrollByTab=Object.create(null);

  function render() {
    const body = panel.querySelector('.content');
    const oldTab=String(body?.dataset?.renderedTab||state.activeTab||'');
    if(body && oldTab){
      __mgPanelScrollByTab[oldTab]=Math.max(0,Number(body.scrollTop||0));
    }

    const targetTab=String(state.activeTab||'dashboard');
    const wanted=Math.max(0,Number(__mgPanelScrollByTab[targetTab]||0));
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

    body.dataset.renderedTab=targetTab;

    const restore=()=>{
      if(String(state.activeTab||'')!==targetTab) return;
      const max=Math.max(0,Number(body.scrollHeight||0)-Number(body.clientHeight||0));
      const y=Math.min(wanted,max);
      if(Math.abs(Number(body.scrollTop||0)-y)>1) body.scrollTop=y;
    };
    restore();
    if(typeof requestAnimationFrame==='function'){
      requestAnimationFrame(()=>{ restore(); requestAnimationFrame(restore); });
    }
    updateHeader();
  }"""
s=s[:ra]+new_render+"\n\n"+s[rb:]

helper_marker="  function pvpLabHTML(){"
if helper_marker not in s:
    raise SystemExit("Brak pvpLabHTML")

helper=r"""  function pvpEngineScanPanelBodyHTML(){
    const count=Object.keys(pvpEngineScan.entries||{}).length;
    const left=pvpEngineScan.enabled?Math.max(0,Math.ceil((Number(pvpEngineScan.endsAt||0)-Date.now())/60000)):0;
    const trees=['str','end','agi','vit','prc'].filter(function(a){
      return !!(pvpLab.skillTrees&&pvpLab.skillTrees[a]);
    }).length;
    return ''+
      '<div class="section-title">🧬 PvP Engine v2 — SKANER READ-ONLY</div>'+
      '<div class="sub">Nie resetuje punktow, nie wydaje zebow i nie wybiera skilli. Pobiera bezpieczne GET-y i nasluchuje danych PvP otwieranych przez gre.</div>'+
      '<div style="margin-top:8px"><b>'+esc(pvpEngineScan.status||'GOTOWY')+'</b></div>'+
      '<div class="sub">endpointy: '+count+' • drzewka: '+trees+'/5'+(pvpEngineScan.enabled?' • nasluch jeszcze ~'+left+' min':'')+'</div>'+
      '<div class="helper-actions" style="margin-top:10px">'+
        (pvpEngineScan.enabled
          ? '<button data-act-v1048="pvp-engine-stop">■ Zatrzymaj skan</button>'
          : '<button data-act-v1048="pvp-engine-start">▶ Skanuj nowy silnik PvP</button>')+
        '<button data-act-v1048="pvp-engine-export">Eksport PvP Engine JSON</button>'+
        '<button data-act-v1048="pvp-engine-clear">Wyczysc skan</button>'+
      '</div>'+
      '<div class="note" style="margin-top:8px">Po START skaner sam pobierze attributes, summary, build, breakthroughs, reset-info i 5 skill-tree. Potem przez 10 minut wejdz w ekran PvP i otworz kolejno Sile, Wytrzymalosc, Zrecznosc, Zywotnosc i Precyzje. Nie musisz nic kupowac ani zatwierdzac.</div>';
  }

"""
if "function pvpEngineScanPanelBodyHTML()" not in s:
    s=s.replace(helper_marker,helper+helper_marker,1)

pa,pb=func_bounds(s,"pvpLabHTML")
seg=s[pa:pb]
cards_marker='      <div class="cards mini">'
if cards_marker not in seg:
    raise SystemExit("Brak cards mini w pvpLabHTML")
if 'data-pvp-engine-v2-scanner="1"' not in seg:
    seg=seg.replace(cards_marker,'      <div data-pvp-engine-v2-scanner="1" class="section pvp-best">${pvpEngineScanPanelBodyHTML()}</div>\n'+cards_marker,1)
s=s[:pa]+seg+s[pb:]

old_box=r"""      let box=content.querySelector('[data-pvp-engine-v2-scanner]');
      if(!box){
        box=document.createElement('div');
        box.setAttribute('data-pvp-engine-v2-scanner','1');
        box.className='section pvp-best';
        const hero=content.querySelector('.helper-hero');
        if(hero && hero.parentNode) hero.parentNode.insertBefore(box,hero.nextSibling);
        else content.prepend(box);
      }

      const count=Object.keys(pvpEngineScan.entries||{}).length;
      const left=pvpEngineScan.enabled?Math.max(0,Math.ceil((Number(pvpEngineScan.endsAt||0)-Date.now())/60000)):0;
      const trees=['str','end','agi','vit','prc'].filter(function(a){
        return !!(pvpLab.skillTrees&&pvpLab.skillTrees[a]);
      }).length;

      box.innerHTML=
        '<div class="section-title">🧬 PvP Engine v2 — SKANER READ-ONLY</div>'+
        '<div class="sub">Nie resetuje punktow, nie wydaje zebow i nie wybiera skilli. Pobiera bezpieczne GET-y i nasluchuje danych PvP otwieranych przez gre.</div>'+
        '<div style="margin-top:8px"><b>'+esc(pvpEngineScan.status||'GOTOWY')+'</b></div>'+
        '<div class="sub">endpointy: '+count+' • drzewka: '+trees+'/5'+(pvpEngineScan.enabled?' • nasluch jeszcze ~'+left+' min':'')+'</div>'+
        '<div class="helper-actions" style="margin-top:10px">'+
          (pvpEngineScan.enabled
            ? '<button data-act-v1048="pvp-engine-stop">■ Zatrzymaj skan</button>'
            : '<button data-act-v1048="pvp-engine-start">▶ Skanuj nowy silnik PvP</button>')+
          '<button data-act-v1048="pvp-engine-export">Eksport PvP Engine JSON</button>'+
          '<button data-act-v1048="pvp-engine-clear">Wyczysc skan</button>'+
        '</div>'+
        '<div class="note" style="margin-top:8px">Po START skaner sam pobierze attributes, summary, build, breakthroughs, reset-info i 5 skill-tree. Potem przez 10 minut wejdz w ekran PvP i otworz kolejno Sile, Wytrzymalosc, Zrecznosc, Zywotnosc i Precyzje. Nie musisz nic kupowac ani zatwierdzac.</div>';"""
new_box=r"""      const box=content.querySelector('[data-pvp-engine-v2-scanner]');
      if(!box) return;
      const html=pvpEngineScanPanelBodyHTML();
      if(box.__mgLastScannerHtml!==html){
        box.__mgLastScannerHtml=html;
        box.innerHTML=html;
      }"""
if old_box not in s:
    raise SystemExit("Brak starego dynamicznego panelu skanera")
s=s.replace(old_box,new_box,1)

old_refined="      const refined=top.slice(0,30).map(refine).sort((a,b)=>b.score-a.score);"
new_refined=r"""      const refinedRaw=top.slice(0,30).map(refine).sort((a,b)=>b.score-a.score);
      const refinedMap=new Map();
      for(const x of refinedRaw){
        const code=pvpLabBuildCode(x.attrs,x.plan);
        const prev=refinedMap.get(code);
        if(!prev || Number(x.score)>Number(prev.score)) refinedMap.set(code,x);
      }
      const refined=[...refinedMap.values()].sort((a,b)=>b.score-a.score);"""
if old_refined not in s:
    raise SystemExit("Brak refined w optimizerze v2")
s=s.replace(old_refined,new_refined,1)

old_cur_score="      const curScore=pvpLabCandidateScore(curStats,meta,true);"
new_cur_score=r"""      const curScore=pvpLabCandidateScore(curStats,meta,true);
      const currentRealRows=pvpLab.battles.filter(b=>
        ['prestige','normal'].includes(String(b?.source||'')) &&
        typeof b?.won==='boolean' &&
        (b?.buildCode===curCode || b?.buildKey===('code:'+curCode))
      );
      const currentRealWins=currentRealRows.filter(b=>b.won===true).length;"""
if old_cur_score not in s:
    raise SystemExit("Brak curScore")
s=s.replace(old_cur_score,new_cur_score,1)

old_current="""          availablePoints:totalPoints,relativeIndex:100,
          combat:curStats?{attack:Math.round(curStats.attack),defense:Math.round(curStats.defense),maxHp:Math.round(curStats.maxHp)}:null,"""
new_current="""          availablePoints:totalPoints,relativeIndex:100,
          realFightN:currentRealRows.length,realFightWins:currentRealWins,
          realFightWr:currentRealRows.length?currentRealWins/currentRealRows.length*100:null,
          combat:curStats?{attack:Math.round(curStats.attack),defense:Math.round(curStats.defense),maxHp:Math.round(curStats.maxHp)}:null,"""
if old_current not in s:
    raise SystemExit("Brak optimizer.current fragment")
s=s.replace(old_current,new_current,1)

s=s.replace("🧠 BEST BUILD — V6 MECHANICS + REALNE PvP","🧠 BEST BUILD — MODEL V6 NA DANYCH REAL PvP",1)

old_engine=" • punkty ${Number(opt.current?.usedPoints||0)}/${Number(opt.totalAttributePoints||0)} • Przełamania BEST:"
new_engine=" • punkty ${Number(opt.current?.usedPoints||0)}/${Number(opt.totalAttributePoints||0)} • walk obecnym buildem ${Number(opt.current?.realFightN||0)} • Przełamania BEST:"
if old_engine in s:
    s=s.replace(old_engine,new_engine,1)

checks=[
  "// @version      8.8.57",
  "const ANDROID_VERSION = '1.0.50';",
  "overflow-anchor:none",
  "const __mgPanelScrollByTab=Object.create(null)",
  "body.dataset.renderedTab=targetTab",
  "function pvpEngineScanPanelBodyHTML()",
  'data-pvp-engine-v2-scanner="1"',
  "if(!box) return;",
  "box.__mgLastScannerHtml!==html",
  "const refinedMap=new Map()",
  "realFightN:currentRealRows.length",
  "MODEL V6 NA DANYCH REAL PvP"
]
missing=[x for x in checks if x not in s]
if missing:
    raise SystemExit("v1.0.50 NIEKOMPLETNA: "+", ".join(missing))

if "hero.parentNode.insertBefore(box,hero.nextSibling)" in s or "content.prepend(box)" in s:
    raise SystemExit("SCROLL FIX: skaner nadal dynamicznie zmienia layout")

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
if "versionCode = 10049" not in t or 'versionName = "1.0.49"' not in t:
    raise SystemExit("Oczekiwano Android 1.0.49")
t=t.replace("versionCode = 10049","versionCode = 10050",1)
t=t.replace('versionName = "1.0.49"','versionName = "1.0.50"',1)
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.50 / userscript 8.8.57" not in r:
        r += """

## v1.0.50 / userscript 8.8.57 - Scroll stability + PvP TOP dedup
- Naprawiony samoczynny skok przewijania panelu przy renderach w tle.
- Scroll jest zapamietywany osobno dla kazdej zakladki.
- Android WebView: overflow-anchor OFF + overscroll contain.
- PvP Engine Scanner ma stale miejsce w layoucie i nie jest dopinany po renderze.
- Timer skanera nie przebudowuje DOM, jesli tekst sie nie zmienil.
- TOP PvP deduplikowany po kodzie buildu.
- UI rozdziela BEST modelu V6 od empirycznego rankingu faktycznie rozegranych buildow.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.50 applied")
print("OK: scroll preserved per tab")
print("OK: WebView scroll anchoring disabled")
print("OK: PvP scanner stable layout")
print("OK: optimizer TOP deduplicated")
print("OK: current real-fight sample count added")
