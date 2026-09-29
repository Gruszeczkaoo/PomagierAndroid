from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
js = root / "app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak userscriptu")

s = js.read_text(encoding="utf-8")

if "// @version      8.8.49" not in s:
    raise SystemExit("Oczekiwano userscript 8.8.49")
s = s.replace("// @version      8.8.49", "// @version      8.8.50", 1)
s = s.replace("const VERSION = '8.8.49';", "const VERSION = '8.8.50';", 1)
s = s.replace("const ANDROID_VERSION = '1.0.42';", "const ANDROID_VERSION = '1.0.43';", 1)

anchor = "  // v8.8.49"
note = """  // v8.8.50 GARDEN CORE RECOVERY:
  // - przywraca brakujacy localAiGardenObserve, ktory blokowal caly odczyt ogrodu,
  // - build sprawdza kompletnosc rdzenia Garden AI, a nie tylko skladnie JS,
  // - stan slotow, ready/empty/growing i liczba sadzeniakow sa odswiezane z API,
  // - zachowuje historie trials i BEST, bez kasowania danych badawczych,
  // - gotowe plony nadal maja niezalezny tor harvest podczas produkcji/demontazu.
"""
if note not in s:
    p=s.find(anchor)
    if p>=0:
        s=s[:p]+note+s[p:]

if "function localAiGardenObserve(" not in s:
    insert_anchor = "  async function localAiRefreshGardenV1042("
    p=s.find(insert_anchor)
    if p<0:
        insert_anchor = "  function localAiGardenCanWrite("
        p=s.find(insert_anchor)
    if p<0:
        raise SystemExit("Nie znaleziono miejsca na Garden Core Recovery")

    block = """  function localAiGardenObserve(data,{source='poll'}={}){
    const g=state.localAI.garden || (state.localAI.garden={});
    const now=Date.now();
    g.data=data||null;
    const slots=Array.isArray(data?.slots)?data.slots:[];
    g.unlocked=(data?.unlocked!==false) || slots.length>0;
    g.lastCheckAt=now;
    g.slots=slots.map(x=>({
      slotNumber:Number(x?.slotNumber||0),
      status:String(x?.status||'empty'),
      plantId:Number(x?.plantId||0)||null,
      plantName:String(x?.plantName||''),
      atlasFrame:Number.isFinite(Number(x?.atlasFrame))?Number(x.atlasFrame):null,
      conditions:{
        sunlight:Math.round(Math.max(0,Math.min(100,Number(x?.conditions?.sunlight||0)))),
        water:Math.round(Math.max(0,Math.min(100,Number(x?.conditions?.water||0)))),
        ph:Math.round(Math.max(0,Math.min(14,Number(x?.conditions?.ph||0)))*10)/10
      }
    }));

    const seeds=Array.isArray(data?.availableSeeds)?data.availableSeeds:[];
    const potatoSeed=seeds.find(x=>
      Number(x?.plantId||0)===2 || /ziemni/i.test(String(x?.plantName||''))
    ) || null;
    g.availableSeeds=Math.max(0,Number(potatoSeed?.quantity||0));
    g.plantId=2;
    g.plantName='Młode ziemniaki';
    if(!Array.isArray(g.trials)) g.trials=[];

    for(const slot of g.slots){
      const no=Number(slot.slotNumber||0);
      const status=String(slot.status||'');
      const trial=[...g.trials].reverse().find(t=>
        Number(t?.slot||0)===no && !Number(t?.harvestedAt||0)
      );
      if(trial){
        if(status==='ready' && !Number(trial.readyAt||0)){
          trial.readyAt=now;
          trial.complete=true;
          trial.active=false;
        }else if(status==='growing'){
          trial.active=true;
        }else if(status==='empty' && trial.active){
          trial.active=false;
          trial.endedAt=trial.endedAt||now;
        }
      }
    }

    const growing=g.slots.filter(x=>x.status==='growing').length;
    const ready=g.slots.filter(x=>x.status==='ready').length;
    const empty=g.slots.filter(x=>x.status==='empty').length;
    g.status=g.unlocked
      ? (growing+' rośnie • '+ready+' gotowe • '+empty+' puste • sadzeniaki '+g.availableSeeds)
      : 'OGRÓD NIEDOSTĘPNY';

    try{
      if(!state.localAI.world) state.localAI.world={};
      state.localAI.world.garden=data||null;
    }catch(_e){}
    try{ localAiSavePersistent(); }catch(_e){}
    return g;
  }

"""
    s=s[:p]+block+s[p:]

fallback_anchor = "  function localAiGardenObserve("
p=s.find(fallback_anchor)
if p<0:
    raise SystemExit("Observer nadal nie istnieje")

fallbacks=""
if "function localAiGardenPrioritySeed(" not in s:
    fallbacks += """  function localAiGardenPrioritySeed(data){
    return (Array.isArray(data?.availableSeeds)?data.availableSeeds:[]).find(x=>
      Number(x?.plantId||0)===2 || /ziemni/i.test(String(x?.plantName||''))
    ) || null;
  }

"""
if "function localAiGardenConditions(" not in s:
    fallbacks += """  function localAiGardenConditions(raw={}){
    return {
      sunlight:Math.round(Math.max(0,Math.min(100,Number(raw?.sunlight||0)))),
      water:Math.round(Math.max(0,Math.min(100,Number(raw?.water||0)))),
      ph:Math.round(Math.max(0,Math.min(14,Number(raw?.ph||0)))*10)/10
    };
  }

"""
if "function localAiGardenSig(" not in s:
    fallbacks += """  function localAiGardenSig(raw={}){
    const c=localAiGardenConditions(raw);
    return c.sunlight+'/'+c.water+'/'+Number(c.ph).toFixed(1);
  }

"""
if "function localAiGardenPlanForSlot(" not in s:
    fallbacks += """  function localAiGardenPlanForSlot(slot,plantName='Młode ziemniaki'){
    const best=state.localAI.garden?.best?.conditions;
    const base=best ? localAiGardenConditions(best) : {sunlight:67,water:79,ph:7.7};
    const patterns=[
      [-6,-6,-0.4],[-6,6,0.4],[6,-6,0.4],[6,6,-0.4],[0,-6,0.4],[0,6,-0.4]
    ];
    const p=patterns[(Math.max(1,Number(slot)||1)-1)%patterns.length];
    return localAiGardenConditions({
      sunlight:base.sunlight+p[0],
      water:base.water+p[1],
      ph:base.ph+p[2]
    });
  }

"""
if fallbacks:
    s=s[:p]+fallbacks+s[p:]

required = [
    "function localAiGardenObserve(",
    "function localAiGardenPrioritySeed(",
    "function localAiGardenConditions(",
    "function localAiGardenSig(",
    "function localAiGardenPlanForSlot(",
    "async function localAiRefreshGardenV1042(",
    "function localAiGardenPendingActionV1042(",
    "function localAiGardenCanWrite(action=null)",
    "async function localAiExecuteGardenAction("
]
missing=[x for x in required if x not in s]
if missing:
    raise SystemExit("NIEKOMPLETNY GARDEN CORE: "+", ".join(missing))

if "localAiGardenObserve(data,{source:'poll" not in s:
    raise SystemExit("Refresh ogrodu nie wywoluje observera")
if "localAiGardenObserve(fresh,{source:'prewrite'" not in s:
    raise SystemExit("Prewrite ogrodu nie wywoluje observera")

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
if "versionCode = 10042" not in t or 'versionName = "1.0.42"' not in t:
    raise SystemExit("Oczekiwano Android 1.0.42")
t=t.replace("versionCode = 10042","versionCode = 10043",1)
t=t.replace('versionName = "1.0.42"','versionName = "1.0.43"',1)
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.43 / userscript 8.8.50" not in r:
        r += """

## v1.0.43 / userscript 8.8.50 - Garden Core Recovery
- Przywrocony brakujacy localAiGardenObserve.
- Garden API znow wypelnia data/slots/unlocked i stan ready/growing/empty.
- Zachowana historia trials/BEST.
- Build ma twarda walidacje kompletnego rdzenia Garden AI.
- Harvest/sow pozostaja niezalezne od produkcji i demontazu.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.43 GARDEN CORE RECOVERY applied")
for x in required:
    print("OK",x)
