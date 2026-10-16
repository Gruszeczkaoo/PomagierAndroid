from pathlib import Path
import sys,re
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
js=root/'app/src/main/assets/pomagier.user.js'
s=js.read_text(encoding='utf-8')
if '// @version      8.8.60' not in s: raise SystemExit('Oczekiwano JS 8.8.60')
s=s.replace('// @version      8.8.60','// @version      8.8.61',1)
s=s.replace("const VERSION = '8.8.60';","const VERSION = '8.8.61';",1)
s=s.replace("const ANDROID_VERSION = '1.0.53';","const ANDROID_VERSION = '1.0.54';",1)

# Stan trwałego deadline.
needle="  raidAuto.startAttemptedAt=Number(raidAuto.startAttemptedAt||0);\n"
if needle not in s: raise SystemExit('Brak stanu raidAuto')
s=s.replace(needle,needle+"  raidAuto.startArmedAt=Number(raidAuto.startArmedAt||0);\n  raidAuto.lastDueWatchAt=Number(raidAuto.lastDueWatchAt||0);\n",1)

# Timer dla tego samego planu nie może po reloadzie dostać kolejnych +60 min.
a=s.find('  function raidAutoArmStart(planId){')
b=s.find('  async function raidAutoStartPlan(plan){',a)
if a<0 or b<0: raise SystemExit('Brak raidAutoArmStart')
new=r'''  function raidAutoArmStart(planId){
    const delay=Math.max(0,Math.min(1440,Math.round(Number(autoCfg.raidAutoStartDelayMinutes??0))));
    const pid=Number(planId||0);
    const same=Number(raidAuto.startPlanId||0)===pid;
    let armed=same?Number(raidAuto.startArmedAt||0):0;
    if(!armed && Number(raidAuto.lastPlannedPlanId||0)===pid) armed=Number(raidAuto.lastPlannedAt||0);
    if(!armed) armed=Date.now();
    raidAuto.startPlanId=pid;
    raidAuto.startDelayMinutes=delay;
    raidAuto.startArmedAt=delay>0?armed:0;
    raidAuto.startDueAt=delay>0?armed+delay*60000:0;
    raidAutoSave();
  }

  function raidAutoDueNow(){
    return Number(autoCfg.raidAutoStartDelayMinutes??0)>0 && Number(raidAuto.startDueAt||0)>0 && Date.now()>=Number(raidAuto.startDueAt||0);
  }

'''
s=s[:a]+new+s[b:]

# Po terminie próbuj START niezależnie od dokładnej nazwy statusu pre-start.
needle="""        if(status==='planning'){\n"""
insert="""        if(raidAutoDueNow() && !['in_progress','running','active','completed','finished','resolved'].includes(status)){
          raidAuto.lastDueWatchAt=Date.now(); raidAutoSave();
          await raidAutoStartPlan(plan);
          raidAuto.nextAt=Date.now()+3000;
          raidAutoSave();
          return true;
        }

"""+needle
if needle not in s: raise SystemExit('Brak status planning')
s=s.replace(needle,insert,1)

# Gdy napad już trwa, wyczyść również kotwicę deadline.
old="if(Number(raidAuto.startPlanId||0)===planId){ raidAuto.startPlanId=0; raidAuto.startDueAt=0; raidAutoSave(); }"
new2="if(Number(raidAuto.startPlanId||0)===planId){ raidAuto.startPlanId=0; raidAuto.startDueAt=0; raidAuto.startArmedAt=0; raidAutoSave(); }"
if old in s: s=s.replace(old,new2,1)

# Twardy watchdog deadline przed wolniejszymi modułami schedulera.
anchor="""    updateHeader();

    if(
      pvpLabCfg.enabled && pvpLabCfg.autoSync"""
watch="""    updateHeader();

    // v8.8.61: termin AUTO START napadu ma priorytet; tick Androida nadrabia także po uśpieniu/reloadzie.
    if(
      autoCfg.raidAutoEnabled && raidAutoDueNow() && !raidAuto.runtimeBusy && !raidDiag.active &&
      !state.localAI.busy && !state.auto.inCycle && !state.manual.semi.inCycle && !alcoholAuto.runtimeBusy &&
      !(typeof companyAuto!=='undefined' && companyAuto.runtimeBusy)
    ){
      raidAuto.lastDueWatchAt=Date.now();
      raidAuto.nextAt=0;
      raidAutoSave();
      raidAutoCycle({force:true});
      return;
    }

    if(
      pvpLabCfg.enabled && pvpLabCfg.autoSync"""
if anchor not in s: raise SystemExit('Brak kotwicy schedulera')
s=s.replace(anchor,watch,1)

# UI: pokaż deadline i spóźnienie, żeby od razu było wiadomo czy watchdog żyje.
needle='''        <div class="sub" style="margin-top:4px">Ostatnia akcja: <b>${esc(raidAuto.lastAction||'—')}</b>${raidAuto.lastError?` • <span class="bad">${esc(raidAuto.lastError)}</span>`:''}</div>\n'''
extra=needle+'''        <div class="sub" style="margin-top:4px">AUTO START deadline: <b>${raidAuto.startDueAt?new Date(raidAuto.startDueAt).toLocaleString('pl-PL'):'—'}</b>${raidAuto.startDueAt&&Date.now()>raidAuto.startDueAt?` • <span class="bad">spóźnienie ${Math.ceil((Date.now()-raidAuto.startDueAt)/1000)} s</span>`:''} • ostatnia próba: ${raidAuto.startAttemptedAt?new Date(raidAuto.startAttemptedAt).toLocaleTimeString('pl-PL'):'—'}</div>\n'''
if needle not in s: raise SystemExit('Brak UI Napady')
s=s.replace(needle,extra,1)

# Snapshot diagnostyczny.
old='startPlanId:Number(raidAuto.startPlanId||0),startDueAt:Number(raidAuto.startDueAt||0),lastStartedPlanId:Number(raidAuto.lastStartedPlanId||0)}};'
new3='startPlanId:Number(raidAuto.startPlanId||0),startDueAt:Number(raidAuto.startDueAt||0),startArmedAt:Number(raidAuto.startArmedAt||0),startAttemptedAt:Number(raidAuto.startAttemptedAt||0),lastDueWatchAt:Number(raidAuto.lastDueWatchAt||0),lastStartedPlanId:Number(raidAuto.lastStartedPlanId||0)}};'
if old not in s: raise SystemExit('Brak raidAutoSnapshot')
s=s.replace(old,new3,1)

checks=['// @version      8.8.61',"const ANDROID_VERSION = '1.0.54';",'function raidAutoDueNow()','raidAuto.startArmedAt=','termin AUTO START napadu ma priorytet','AUTO START deadline:']
for x in checks:
    if x not in s: raise SystemExit('v1.0.54 NIEKOMPLETNA: '+x)
js.write_text(s,encoding='utf-8')

bg=root/'app/build.gradle.kts'
t=bg.read_text(encoding='utf-8')
if 'versionCode = 10053' not in t or 'versionName = "1.0.53"' not in t: raise SystemExit('Oczekiwano Android 1.0.53')
t=t.replace('versionCode = 10053','versionCode = 10054',1).replace('versionName = "1.0.53"','versionName = "1.0.54"',1)
bg.write_text(t,encoding='utf-8')
print('v1.0.54 applied')
print('OK: raid deadline survives reload')
print('OK: overdue raid has scheduler priority')
print('OK: overdue pre-start status triggers START')
