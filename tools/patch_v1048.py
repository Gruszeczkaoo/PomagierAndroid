from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak userscriptu")
s=js.read_text(encoding="utf-8")

if "// @version      8.8.54" not in s:
    raise SystemExit("Oczekiwano JS 8.8.54")
s=s.replace("// @version      8.8.54","// @version      8.8.55",1)
s=s.replace("const VERSION = '8.8.54';","const VERSION = '8.8.55';",1)
s=s.replace("const ANDROID_VERSION = '1.0.47';","const ANDROID_VERSION = '1.0.48';",1)

note="""  // v8.8.55 PVP ENGINE V2 SCANNER:
  // - nowy bezpieczny skaner READ-ONLY nowego silnika PvP,
  // - aktywnie pobiera attributes / summary / build oraz 5 pelnych skill-tree,
  // - przez 10 minut pasywnie przechwytuje dodatkowe odpowiedzi /api/pvp/... otwierane przez gre,
  // - zapisuje request body tylko dla recznych akcji PvP, bez Authorization/cookies,
  // - nie resetuje atrybutow, nie kupuje punktow i nie wybiera skilli,
  // - eksportuje osobny JSON PvP Engine v2 natywnie do Pobrane/PomagierByDon na Androidzie.
"""
anchor="  // v8.8.54"
p=s.find(anchor)
if p>=0 and note not in s:
    s=s[:p]+note+s[p:]

def func_bounds(text,name):
    m=re.search(r"^  (?:async )?function "+re.escape(name)+r"\(",text,re.M)
    if not m:
        raise SystemExit("Brak funkcji "+name)
    n=re.search(r"^  (?:async )?function [A-Za-z0-9_]+\(",text[m.end():],re.M)
    return m.start(), (m.end()+n.start()) if n else len(text)

# Rozszerz klasyfikator tylko podczas aktywnego skanu.
a,b=func_bounds(s,"pvpLabApiKind")
seg=s[a:b]
needle="    return null;\n  }"
if needle not in seg:
    raise SystemExit("Brak konca pvpLabApiKind")
seg=seg.replace(
    needle,
    "    if(window.__MG_PVP_ENGINE_SCAN_ACTIVE__ && /^\\/api\\/pvp\\//.test(p)) return 'pvp_engine_raw';\n    return null;\n  }",
    1
)
s=s[:a]+seg+s[b:]

marker="  function pvpLabObserveApi(url,data,meta={}){"
if marker not in s:
    raise SystemExit("Brak pvpLabObserveApi")

scanner=r"""  // =========================
  // PvP ENGINE V2 SCANNER v8.8.55
  // =========================
  const PVP_ENGINE_SCAN_KEY='pomagier_pvp_engine_scan_v2';
  let pvpEngineScan=loadJSON(PVP_ENGINE_SCAN_KEY,null);
  if(!pvpEngineScan || typeof pvpEngineScan!=='object'){
    pvpEngineScan={schema:2,enabled:false,startedAt:0,endsAt:0,updatedAt:0,status:'GOTOWY',entries:{},errors:[]};
  }
  if(!pvpEngineScan.entries || typeof pvpEngineScan.entries!=='object') pvpEngineScan.entries={};
  if(!Array.isArray(pvpEngineScan.errors)) pvpEngineScan.errors=[];
  if(pvpEngineScan.enabled && Number(pvpEngineScan.endsAt||0)<=Date.now()){
    pvpEngineScan.enabled=false;
    pvpEngineScan.status='ZAKONCZONY';
  }
  window.__MG_PVP_ENGINE_SCAN_ACTIVE__=!!pvpEngineScan.enabled;

  function pvpEngineScanSave(){
    pvpEngineScan.updatedAt=Date.now();
    const rows=Object.entries(pvpEngineScan.entries||{}).sort(function(a,b){
      return Number(b[1]?.lastAt||0)-Number(a[1]?.lastAt||0);
    });
    if(rows.length>60){
      pvpEngineScan.entries=Object.fromEntries(rows.slice(0,60));
    }
    if(pvpEngineScan.errors.length>30) pvpEngineScan.errors=pvpEngineScan.errors.slice(-30);
    window.__MG_PVP_ENGINE_SCAN_ACTIVE__=!!pvpEngineScan.enabled;
    saveJSON(PVP_ENGINE_SCAN_KEY,pvpEngineScan);
  }

  function pvpEnginePath(url){
    try{
      const u=new URL(String(url||''),location.href);
      return String(u.pathname||'')+String(u.search||'');
    }catch(_){
      return String(url||'');
    }
  }

  function pvpEngineClone(value){
    try{return JSON.parse(JSON.stringify(value));}catch(_){return null;}
  }

  function pvpEngineScanCapture(url,data,meta={}){
    if(!pvpEngineScan.enabled) return false;
    const u=pvpLabUrl(url);
    if(!u || u.origin!==location.origin || !u.pathname.startsWith('/api/pvp/')) return false;

    // Replaye walk sa juz w PvP Lab i sa duze. Skaner v2 zbiera konfiguracje silnika.
    if(/\/api\/pvp\/battle\//.test(u.pathname) || /\/battle-history$/.test(u.pathname)) return false;

    const method=String(meta.method||'GET').toUpperCase();
    const path=pvpEnginePath(url);
    const key=method+' '+path;
    const prev=pvpEngineScan.entries[key]||{};
    let requestBody=meta.requestBody==null?null:pvpLabParseRequestBody(meta.requestBody);
    if(requestBody==null && meta.requestBody!=null) requestBody=String(meta.requestBody).slice(0,20000);

    const raw=pvpEngineClone(data);
    let response=raw;
    let responseBytes=0;
    try{ responseBytes=JSON.stringify(raw).length; }catch(_){}
    if(responseBytes>1200000){
      response={truncated:true,originalBytes:responseBytes,note:'Odpowiedz >1.2 MB. Pelne drzewka skill-tree sa zapisywane osobno w pvpLab.skillTrees.'};
    }

    pvpEngineScan.entries[key]={
      method:method,
      path:path,
      kind:pvpLabApiKind(url)||'pvp_engine_raw',
      firstAt:Number(prev.firstAt||Date.now()),
      lastAt:Date.now(),
      count:Number(prev.count||0)+1,
      source:String(meta.source||'native'),
      requestBody:requestBody,
      response:response,
      responseBytes:responseBytes
    };
    pvpEngineScan.status='AKTYWNY • przechwycono '+Object.keys(pvpEngineScan.entries).length+' endpointow';
    pvpEngineScanSave();
    return true;
  }

  async function pvpEngineScanKnown(){
    const id=pvpLabOwnId();
    if(!id) throw new Error('Brak ID postaci.');
    if(!__mgSessionTemplate) throw new Error('Brak sesji API. Otworz dowolny ekran gry i sprobuj ponownie.');

    const paths=[
      '/api/pvp/'+id+'/attributes',
      '/api/pvp/'+id+'/summary',
      '/api/pvp/'+id+'/build',
      '/api/pvp/'+id+'/skill-tree/str',
      '/api/pvp/'+id+'/skill-tree/end',
      '/api/pvp/'+id+'/skill-tree/agi',
      '/api/pvp/'+id+'/skill-tree/vit',
      '/api/pvp/'+id+'/skill-tree/prc'
    ];

    let ok=0;
    for(const path of paths){
      try{
        const data=await apiActive(path);
        if(data){
          pvpEngineScanCapture(path,data,{method:'GET',source:'active-safe-get'});
          if(/\/skill-tree\/(str|end|agi|vit|prc)$/.test(path)){
            const m=path.match(/\/skill-tree\/(str|end|agi|vit|prc)$/);
            if(m) pvpLabStoreSkillTree(m[1],data);
          }else if(/\/attributes$/.test(path)){
            pvpLabSetCurrent('pvp_attributes',data);
          }else if(/\/summary$/.test(path)){
            pvpLabSetCurrent('pvp_summary',data);
          }else if(/\/build$/.test(path)){
            pvpLabSetCurrent('pvp_build',data);
          }
          ok++;
        }
      }catch(e){
        pvpEngineScan.errors.push({at:Date.now(),path:path,error:String(e?.message||e)});
      }
      await sleep(90);
    }
    pvpEngineScan.status='AKTYWNY • GET '+ok+'/'+paths.length+' • teraz otworz ekran PvP i 5 atrybutow';
    pvpEngineScanSave();
    return ok;
  }

  async function pvpEngineScanStart(){
    pvpEngineScan={
      schema:2,
      enabled:true,
      startedAt:Date.now(),
      endsAt:Date.now()+10*60*1000,
      updatedAt:Date.now(),
      status:'START • pobieram bezpieczne GET-y',
      entries:{},
      errors:[]
    };
    pvpEngineScanSave();
    try{
      await pvpEngineScanKnown();
    }catch(e){
      pvpEngineScan.status='AKTYWNY • '+String(e?.message||e);
      pvpEngineScan.errors.push({at:Date.now(),path:'start',error:String(e?.message||e)});
      pvpEngineScanSave();
      throw e;
    }
    try{render();}catch(_){}
  }

  function pvpEngineScanStop(){
    pvpEngineScan.enabled=false;
    pvpEngineScan.endsAt=Date.now();
    pvpEngineScan.status='ZATRZYMANY • dane gotowe do eksportu';
    pvpEngineScanSave();
    try{render();}catch(_){}
  }

  function pvpEngineScanClear(){
    pvpEngineScan={schema:2,enabled:false,startedAt:0,endsAt:0,updatedAt:Date.now(),status:'WYCZYSZCZONO',entries:{},errors:[]};
    pvpEngineScanSave();
    try{render();}catch(_){}
  }

  function pvpEngineScanExportObject(){
    return {
      exportedAt:new Date().toISOString(),
      type:'pvp-engine-v2-scan',
      androidVersion:typeof ANDROID_VERSION!=='undefined'?ANDROID_VERSION:null,
      userscriptVersion:typeof VERSION!=='undefined'?VERSION:null,
      characterId:pvpLabOwnId(),
      scanner:pvpEngineClone(pvpEngineScan),
      current:pvpEngineClone(pvpLab.current||{}),
      skillTrees:pvpEngineClone(pvpLab.skillTrees||{}),
      skillTreesAt:pvpEngineClone(pvpLab.skillTreesAt||{}),
      note:'READ-ONLY scan. No Authorization/cookies. Battle replays excluded from this export.'
    };
  }

  async function pvpEngineScanExport(){
    const obj=pvpEngineScanExportObject();
    const raw=JSON.stringify(obj,null,2);
    const fileName='pomagier_pvp_engine_v2_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    const nativeSaved=await dumpLabSaveJsonNative(fileName,raw);
    if(!nativeSaved) dumpLabBrowserDownload(fileName,raw);
    pvpEngineScan.status=(nativeSaved?'ZAPISANO: ':'EKSPORT: ')+fileName+' • '+raw.length+' znakow';
    pvpEngineScanSave();
    try{render();}catch(_){}
  }

  function pvpEngineScanTick(){
    if(pvpEngineScan.enabled && Number(pvpEngineScan.endsAt||0)>0 && Date.now()>=Number(pvpEngineScan.endsAt)){
      pvpEngineScan.enabled=false;
      pvpEngineScan.status='ZAKONCZONY AUTOMATYCZNIE • dane gotowe do eksportu';
      pvpEngineScanSave();
    }
  }

"""
if "PVP_ENGINE_SCAN_KEY='pomagier_pvp_engine_scan_v2'" not in s:
    s=s.replace(marker,scanner+marker,1)

old="""  function pvpLabObserveApi(url,data,meta={}){
    if(!pvpLabCfg.enabled || !pvpLabCfg.passiveCapture) return;
    const kind=pvpLabApiKind(url); if(!kind) return;
    try{
"""
new="""  function pvpLabObserveApi(url,data,meta={}){
    const kind=pvpLabApiKind(url); if(!kind) return;
    try{
      if(window.__MG_PVP_ENGINE_SCAN_ACTIVE__) pvpEngineScanCapture(url,data,meta);
    }catch(e){
      console.warn('[MG PvP Engine v2 Scanner] capture',e);
    }
    if(!pvpLabCfg.enabled || !pvpLabCfg.passiveCapture) return;
    try{
"""
if old not in s:
    raise SystemExit("Nie znaleziono poczatku pvpLabObserveApi")
s=s.replace(old,new,1)

# UI: niezalezny od starego dispatchera i odporny na kolejne render().
panel_anchor="  const panel = makePanel();"
if panel_anchor not in s:
    raise SystemExit("Brak const panel = makePanel()")

ui=r"""  const panel = makePanel();

  // v8.8.55: PvP Engine v2 Scanner — nakladka w zakladce PvP Lab.
  setInterval(function(){
    try{
      pvpEngineScanTick();
      if(state.activeTab!=='pvpLab') return;
      const content=panel.querySelector('.content');
      if(!content) return;

      let box=content.querySelector('[data-pvp-engine-v2-scanner]');
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
        '<div class="note" style="margin-top:8px">Po START skaner sam pobierze attributes, summary, build i 5 skill-tree. Potem przez 10 minut wejdz w ekran PvP i otworz kolejno Sile, Wytrzymalosc, Zrecznosc, Zywotnosc i Precyzje. Nie musisz nic kupowac ani zatwierdzac.</div>';
    }catch(_){}
  },700);

  panel.addEventListener('click',async function(e){
    const btn=e.target&&e.target.closest?e.target.closest('[data-act-v1048]'):null;
    if(!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const act=btn.getAttribute('data-act-v1048');
    try{
      if(act==='pvp-engine-start') await pvpEngineScanStart();
      else if(act==='pvp-engine-stop') pvpEngineScanStop();
      else if(act==='pvp-engine-export') await pvpEngineScanExport();
      else if(act==='pvp-engine-clear'){
        if(confirm('Wyczyscic dane skanera PvP Engine v2? PvP Lab i historia walk pozostana bez zmian.')) pvpEngineScanClear();
      }
    }catch(err){
      pvpEngineScan.status='BLAD: '+String(err?.message||err);
      pvpEngineScan.errors.push({at:Date.now(),path:'ui',error:String(err?.message||err)});
      pvpEngineScanSave();
      try{render();}catch(_){}
    }
  },true);"""

if "data-pvp-engine-v2-scanner" not in s:
    s=s.replace(panel_anchor,ui,1)

checks=[
    "// @version      8.8.55",
    "const ANDROID_VERSION = '1.0.48';",
    "PVP_ENGINE_SCAN_KEY='pomagier_pvp_engine_scan_v2'",
    "async function pvpEngineScanKnown(",
    "async function pvpEngineScanStart(",
    "async function pvpEngineScanExport(",
    "window.__MG_PVP_ENGINE_SCAN_ACTIVE__",
    "pvpEngineScanCapture(url,data,meta)",
    "data-pvp-engine-v2-scanner",
    "Skanuj nowy silnik PvP",
    "dumpLabSaveJsonNative(fileName,raw)"
]
missing=[x for x in checks if x not in s]
if missing:
    raise SystemExit("v1.0.48 NIEKOMPLETNA: "+", ".join(missing))

# Bezpieczenstwo: skaner sam wykonuje tylko GET-y przez apiActive(path).
sa,sb=func_bounds(s,"pvpEngineScanKnown")
scan_seg=s[sa:sb]
if "method:'POST'" in scan_seg or 'method:"POST"' in scan_seg:
    raise SystemExit("PVP SCANNER: wykryto POST w aktywnym skanie")
for endpoint in ["/attributes","/summary","/build","/skill-tree/str","/skill-tree/end","/skill-tree/agi","/skill-tree/vit","/skill-tree/prc"]:
    if endpoint not in scan_seg:
        raise SystemExit("PVP SCANNER: brak endpointu "+endpoint)

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
if "versionCode = 10047" not in t or 'versionName = "1.0.47"' not in t:
    raise SystemExit("Oczekiwano Android 1.0.47")
t=t.replace("versionCode = 10047","versionCode = 10048",1)
t=t.replace('versionName = "1.0.47"','versionName = "1.0.48"',1)
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.48 / userscript 8.8.55" not in r:
        r += """

## v1.0.48 / userscript 8.8.55 - PvP Engine v2 Scanner
- Read-only scanner nowego systemu PvP.
- Bezpieczne GET: attributes, summary, build oraz 5 skill-tree.
- 10 minut pasywnego nasluchu dodatkowych /api/pvp/... otwieranych przez gre.
- Zero automatycznego resetu, wydawania zebow i wybierania skilli.
- Osobny eksport JSON z konfiguracja silnika, snapshotem i drzewkami.
- Android zapisuje eksport do Pobrane/PomagierByDon.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.48 PvP Engine v2 Scanner applied")
print("OK: active scan is GET-only")
print("OK: attributes/summary/build + 5 skill trees")
print("OK: passive unknown PvP endpoint capture while scanner active")
print("OK: native Android JSON export")
