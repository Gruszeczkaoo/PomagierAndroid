from pathlib import Path
import sys,re

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(".")
js=root/"app/src/main/assets/pomagier.user.js"
if not js.exists():
    raise SystemExit("Brak userscriptu")
s=js.read_text(encoding="utf-8")

if "// @version      8.8.63" not in s:
    raise SystemExit("Oczekiwano JS 8.8.63")
s=s.replace("// @version      8.8.63","// @version      8.8.64",1)
s=s.replace("const VERSION = '8.8.63';","const VERSION = '8.8.64';",1)
s=s.replace("const ANDROID_VERSION = '1.0.56';","const ANDROID_VERSION = '1.0.57';",1)

note="""  // v8.8.64 RAID EXECUTE ENDPOINT FIX:
  // - naprawia AUTO START po uplywie timera: gra uruchamia napad przez POST /raid/execute, nie /raid/start,
  // - body pozostaje {planId}, identycznie jak w oryginalnym przycisku „Rozpocznij napad!”,
  // - po POST automat kilka razy odczytuje active-raid i uznaje START dopiero po statusie in_progress/running/active,
  // - przy opoznionej odpowiedzi serwera nie gubi deadline: ponawia kontrole po 10 s,
  // - build przerywa sie, jezeli w funkcji START pozostanie stary endpoint /raid/start.
"""
anchor="  // v8.8.63"
p=s.find(anchor)
if p>=0 and note not in s:
    s=s[:p]+note+s[p:]

a=s.find("  async function raidAutoStartPlan(plan){")
b=s.find("  async function raidAutoPlanNext(){",a)
if a<0 or b<0:
    raise SystemExit("Brak raidAutoStartPlan")

new_func=r'''  async function raidAutoStartPlan(plan,{source='timer'}={}){
    const planId=Number(plan?.id??plan?.planId??plan?.plan_id??0);
    if(!planId) throw new Error('Brak planId napadu do START-u');
    if(Number(raidAuto.lastStartedPlanId||0)===planId) return true;

    const participants=Array.isArray(plan?.participants)?plan.participants.length:Number(plan?.participantCount??plan?.participants_count??0);
    const minPeople=Number(plan?.min_participants??plan?.minParticipants??plan?.minimumParticipants??0);
    if(minPeople>0 && participants<minPeople){
      raidAuto.startBlockedReason=`brakuje graczy ${participants}/${minPeople}`;
      raidAutoSetAction(`NAPADY: timer minął, ale brakuje graczy • ${participants}/${minPeople}`,{error:true});
      actionHistoryAdd('Napady','Automatyczny START','WSTRZYMANO',`plan #${planId} • gracze ${participants}/${minPeople}`);
      raidAuto.startDueAt=Date.now()+30000;
      raidAutoSave();
      return false;
    }

    raidAuto.startAttemptedAt=Date.now();
    raidAuto.startBlockedReason='';
    raidAutoSave();

    const endpoint=`/api/gangs/${settings.characterId}/raid/execute`;
    const r=await apiActive(endpoint,{method:'POST',body:{planId}});
    raidAuto.lastStartResponse=String(r?.message??r?.error??r?.status??r?.success??'').slice(0,280);
    raidAutoSave();

    if(r?.success===false){
      throw new Error(String(r?.error||r?.message||`Nie udało się wystartować napadu #${planId}`));
    }

    // Nie ufamy samemu HTTP 200. Potwierdzamy zmianę stanu w active-raid.
    let verifiedPlan=null;
    let lastStatus='';
    for(let i=0;i<5;i++){
      if(i) await new Promise(res=>setTimeout(res,350+i*250));
      try{
        const active=await apiActive(`/api/gangs/${settings.characterId}/active-raid`);
        raidAutoSetWorld('activeRaid',active);
        const p=raidAutoPlanOf(active);
        const pid=Number(p?.id??p?.planId??p?.plan_id??0);
        lastStatus=String(p?.status||'').toLowerCase();
        if(pid===planId && ['in_progress','running','active'].includes(lastStatus)){
          verifiedPlan=p;
          break;
        }
      }catch(_){}
    }

    if(!verifiedPlan){
      raidAuto.startBlockedReason=`brak potwierdzenia po /raid/execute • status ${lastStatus||'nieznany'}`;
      raidAuto.startDueAt=Date.now()+10000;
      raidAutoSave();
      raidAutoSetAction(`NAPADY: wysłano START plan #${planId}, ale brak potwierdzenia in_progress • ponawiam kontrolę`,{error:true});
      actionHistoryAdd('Napady','Automatyczny START','BRAK POTWIERDZENIA',`plan #${planId} • source=${source} • status=${lastStatus||'—'}`);
      return false;
    }

    raidAuto.lastStartedPlanId=planId;
    raidAuto.startDueAt=0;
    raidAuto.startPlanId=0;
    raidAuto.startArmedAt=0;
    raidAuto.startBlockedReason='';
    raidAuto.lastStartVerifiedAt=Date.now();
    raidAutoSave();
    raidAutoSetAction(`NAPADY: automatycznie wystartowano ${String(verifiedPlan.location_name??verifiedPlan.locationName??plan?.location_name??plan?.locationName??`plan #${planId}`)}`);
    actionHistoryAdd('Napady','Automatyczny START','OK',`plan #${planId} • POST /raid/execute • potwierdzono ${String(verifiedPlan.status||'in_progress')}`);
    return true;
  }

'''
s=s[:a]+new_func+s[b:]

# Twarde testy regresji: sprawdzamy cala funkcje START.
a=s.find("  async function raidAutoStartPlan(plan")
b=s.find("  async function raidAutoPlanNext()",a)
chunk=s[a:b]
if "/raid/start" in chunk:
    raise SystemExit("REGRESJA: raidAutoStartPlan nadal zawiera /raid/start")
if "/raid/execute" not in chunk:
    raise SystemExit("REGRESJA: brak /raid/execute")
if "body:{planId}" not in chunk:
    raise SystemExit("REGRESJA: brak body {planId}")
if "/active-raid" not in chunk or "in_progress" not in chunk:
    raise SystemExit("REGRESJA: brak weryfikacji active-raid po POST")
if "startDueAt=Date.now()+10000" not in chunk:
    raise SystemExit("REGRESJA: brak retry po niepotwierdzonym START")

checks=[
    "// @version      8.8.64",
    "const ANDROID_VERSION = '1.0.57';",
    "/raid/execute",
    "POST /raid/execute",
    "lastStartVerifiedAt",
]
for x in checks:
    if x not in s:
        raise SystemExit("v1.0.57 NIEKOMPLETNA: "+x)

print("OK: raid AUTO START endpoint = POST /api/gangs/{id}/raid/execute")
print("OK: request body = {planId}")
print("OK: /raid/start absent from raidAutoStartPlan")
print("OK: active-raid verification after POST")
print("OK: retry in 10 s when START is not yet confirmed")

js.write_text(s,encoding="utf-8")

bg=root/"app/build.gradle.kts"
t=bg.read_text(encoding="utf-8")
if "versionCode = 10056" not in t or 'versionName = "1.0.56"' not in t:
    raise SystemExit("Oczekiwano Android 1.0.56")
t=t.replace("versionCode = 10056","versionCode = 10057",1)
t=t.replace('versionName = "1.0.56"','versionName = "1.0.57"',1)
bg.write_text(t,encoding="utf-8")

readme=root/"README.md"
if readme.exists():
    r=readme.read_text(encoding="utf-8")
    if "## v1.0.57 / userscript 8.8.64" not in r:
        r += """

## v1.0.57 / userscript 8.8.64 - Raid execute endpoint fix
- AUTO START używa dokładnego endpointu gry: POST /api/gangs/{id}/raid/execute.
- Body: {planId}, zgodne z ręcznym przyciskiem „Rozpocznij napad!”.
- Usunięto błędny /raid/start zwracający HTTP 404.
- Po POST Pomagier potwierdza active-raid -> in_progress/running/active.
- Brak natychmiastowego potwierdzenia nie kasuje timera; ponowna kontrola następuje po 10 s.
- Build blokuje wydanie, jeśli stary endpoint wróci do raidAutoStartPlan.
"""
        readme.write_text(r,encoding="utf-8")

print("v1.0.57 applied")
