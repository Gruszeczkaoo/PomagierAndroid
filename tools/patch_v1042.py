from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
js = root / "app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak pliku userscript")

s = js.read_text(encoding="utf-8")

if "// @version      8.8.48" not in s:
    raise SystemExit("Nie znaleziono bazowej wersji JS 8.8.48")
s = s.replace("// @version      8.8.48", "// @version      8.8.49", 1)
s = s.replace("const VERSION = '8.8.48';", "const VERSION = '8.8.49';", 1)
s = s.replace("const ANDROID_VERSION = '1.0.41';", "const ANDROID_VERSION = '1.0.42';", 1)

anchor = "  // v8.8.48"
note = """  // v8.8.49 GARDEN HARVEST FIX:
  // - naprawa helperow refresh/pending ogrodu,
  // - gotowe plony maja priorytet i moga byc zbierane podczas produkcji/demontazu,
  // - ponowny zasiew dziala niezaleznie od glownego cyklu ekonomii,
  // - zakup brakujacych sadzeniakow nadal respektuje blokady glownego automatu,
  // - unlocked=false nie blokuje ogrodu, jesli API zwraca realne sloty,
  // - zachowane: dry-run, recovery, straznik pelnego plecaka i antyspam 1.2 s.
"""
if note not in s:
    p = s.find(anchor)
    if p >= 0:
        s = s[:p] + note + s[p:]

s = s.replace("localAiRefreshGarden(", "localAiRefreshGardenV1042(")
s = s.replace("localAiGardenPendingAction(", "localAiGardenPendingActionV1042(")

canwrite_anchor = "  function localAiGardenCanWrite("
if canwrite_anchor not in s:
    raise SystemExit("Nie znaleziono localAiGardenCanWrite")

if "async function localAiRefreshGardenV1042(" not in s:
    p = s.find(canwrite_anchor)
    helper = """  async function localAiRefreshGardenV1042({force=false}={}){
    if(!autoCfg.localAiGarden || !__mgSessionTemplate) return null;
    const g=state.localAI.garden;
    const every=Math.max(30,Number(autoCfg.localAiGardenPollSeconds||60))*1000;
    if(!force && g.data && Date.now()<Number(g.nextAt||0)) return g.data;
    try{
      const data=await localAiSafeGet('/api/character/'+settings.characterId+'/garden',g.data);
      if(data){
        localAiGardenObserve(data,{source:'poll-v1042'});
        if(!state.localAI.world) state.localAI.world={};
        state.localAI.world.garden=data;
      }
      g.nextAt=Date.now()+every;
      return data||g.data||null;
    }catch(e){
      g.status='BLAD: '+String(e && e.message || e);
      g.nextAt=Date.now()+every;
      return g.data||null;
    }
  }

"""
    s = s[:p] + helper + s[p:]

if "function localAiGardenPendingActionV1042(" not in s:
    p = s.find(canwrite_anchor)
    helper = """  function localAiGardenPendingActionV1042(data=state.localAI.garden?.data){
    if(!autoCfg.localAiGarden || !data) return null;
    const slots=Array.isArray(data?.slots)?data.slots:[];
    const gardenHasRealData=slots.length>0;
    if(data?.unlocked===false && !gardenHasRealData) return null;

    if(autoCfg.localAiGardenAutoHarvest){
      const ready=slots.find(x=>String(x?.status||'')==='ready');
      if(ready){
        const no=Number(ready.slotNumber||0);
        return {type:'garden_harvest',slot:no,label:'Ogrod: zbierz #'+no};
      }
    }

    if(autoCfg.localAiGardenAutoSow){
      const emptySlots=slots.filter(x=>String(x?.status||'')==='empty');
      if(!emptySlots.length) return null;
      const seed=localAiGardenPrioritySeed(data);
      const owned=Math.max(0,Number(seed?.quantity||0));
      const missing=Math.max(0,emptySlots.length-owned);

      if(missing>0 && autoCfg.localAiGardenAutoBuySeeds){
        return {
          type:'garden_buy_seeds',
          quantity:missing,
          plantId:LOCAL_AI_GARDEN_PRIORITY_PLANT_ID,
          plantName:LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME,
          seedItemId:Number(seed?.seedItemId||seed?.seed_item_id||LOCAL_AI_GARDEN_PRIORITY_SEED_ITEM_ID),
          label:'Ogrod: kup sadzeniaki x'+missing
        };
      }

      if(owned>0){
        const empty=emptySlots[0];
        const no=Number(empty.slotNumber||0);
        return {
          type:'garden_sow',
          slot:no,
          plantId:LOCAL_AI_GARDEN_PRIORITY_PLANT_ID,
          plantName:LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME,
          conditions:localAiGardenPlanForSlot(no,LOCAL_AI_GARDEN_PRIORITY_PLANT_NAME),
          label:'Ogrod: ziemniaki #'+no
        };
      }
    }
    return null;
  }

"""
    s = s[:p] + helper + s[p:]

s = s.replace(
    "    if(!autoCfg.localAiGarden || !data?.unlocked) return null;\n    const slots=Array.isArray(data?.slots)?data.slots:[];",
    "    if(!autoCfg.localAiGarden || !data) return null;\n    const slots=Array.isArray(data?.slots)?data.slots:[];\n    const gardenHasRealData=slots.length>0;\n    if(data?.unlocked===false && !gardenHasRealData) return null;",
    1
)

old_gate = """  function localAiGardenCanWrite(){
    if(!autoCfg.localAiGarden || !autoCfg.localAiAllowGameActions) return false;
    if(!autoCfg.enabled || autoCfg.dryRun) return false;
    if(state.auto.recovery.active || recoveryResumePending) return false;
    if(state.auto.inCycle || state.manual.semi.inCycle) return false;
    if(Date.now()<Number(state.auto.writeHoldUntil||0)) return false;"""
new_gate = """  function localAiGardenCanWrite(action=null){
    if(!autoCfg.localAiGarden || !autoCfg.localAiAllowGameActions) return false;
    if(!autoCfg.enabled || autoCfg.dryRun) return false;
    if(state.auto.recovery.active || recoveryResumePending) return false;
    const gardenType=String(action?.type||'');
    const independentGardenWrite=(gardenType==='garden_harvest' || gardenType==='garden_sow');
    if(!independentGardenWrite && (state.auto.inCycle || state.manual.semi.inCycle)) return false;
    if(!independentGardenWrite && Date.now()<Number(state.auto.writeHoldUntil||0)) return false;"""
if old_gate not in s:
    raise SystemExit("Nie znaleziono starego gate ogrodu")
s = s.replace(old_gate,new_gate,1)

old_call = "    if(!action || !localAiGardenCanWrite()) return false;"
if old_call not in s:
    raise SystemExit("Nie znaleziono wywolania localAiGardenCanWrite")
s = s.replace(old_call,"    if(!action || !localAiGardenCanWrite(action)) return false;",1)

required = [
    "async function localAiRefreshGardenV1042(",
    "function localAiGardenPendingActionV1042(",
    "function localAiGardenCanWrite(action=null)",
    "localAiGardenCanWrite(action)",
    "gardenType==='garden_harvest'"
]
for needle in required:
    if needle not in s:
        raise SystemExit("Brak po patchu: "+needle)

if "await localAiRefreshGarden({" in s:
    raise SystemExit("Pozostalo stare wywolanie refresh")
if "localAiGardenPendingAction();" in s or "localAiGardenPendingAction(refreshedGarden)" in s:
    raise SystemExit("Pozostalo stare wywolanie pending")

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
if not bg.exists():
    raise SystemExit("Brak app/build.gradle.kts")
t=bg.read_text(encoding="utf-8")
if "versionCode = 10041" not in t or 'versionName = "1.0.41"' not in t:
    raise SystemExit("Nie znaleziono bazowej wersji Android 1.0.41")
t=t.replace("versionCode = 10041","versionCode = 10042",1)
t=t.replace('versionName = "1.0.41"','versionName = "1.0.42"',1)
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.42 / userscript 8.8.49" not in r:
        r += """

## v1.0.42 / userscript 8.8.49 - Garden Harvest Fix
- Naprawione brakujace helpery odswiezania i wyboru akcji ogrodu.
- Gotowe plony sa zbierane podczas trwajacej produkcji/demontazu.
- Ponowny zasiew dziala w niezaleznym torze ogrodu.
- unlocked=false nie blokuje automatu, jesli API zwraca realne grzadki.
- Zakup sadzeniakow nadal respektuje blokady glownego automatu.
- Zostaja zabezpieczenia dry-run/recovery, pelnego plecaka i antyspam ogrodu.
"""
    readme.write_text(r,encoding="utf-8")

print("v1.0.42 GARDEN HARVEST FIX applied")
print("refresh helper refs:", s.count("localAiRefreshGardenV1042("))
print("pending helper refs:", s.count("localAiGardenPendingActionV1042("))
print("can-write action refs:", s.count("localAiGardenCanWrite(action)"))
